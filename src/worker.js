import { withAICrawlerTracking } from "@datafast/ai-crawl";
import { visitSignals } from "./bot-detection.js";
import pricing from "./pricing.json";

// Single source of truth for the Cloud monthly price and the included token
// quota (Issues #102, #138). The shipped HTML carries monthlyUsdToken and
// includedTokensToken wherever those values appear — including the head tags
// (meta/og/twitter/JSON-LD) that crawlers read without running JavaScript —
// and serving replaces them with cloudMonthlyUsd / includedTokensLabel below.
// includedTokens itself is the contract value (orbi-cloud's
// MONTHLY_TOKEN_LIMITS.default); the label is its human form on the pages.
// foundingTokensLabel rides the same seam: the Founding Partner token
// coverage (orbi-cloud#338) is a quota mention, so it ships as a token too,
// never as a round literal the quota-literal gate would reject.
const MONTHLY_USD = String(pricing.cloudMonthlyUsd);
const SOLO_MONTHLY_USD = String(pricing.soloMonthlyUsd);
const SOLO_ANNUAL_USD = String(pricing.soloAnnualUsd);
const PRO_ANNUAL_USD = String(pricing.proAnnualUsd);
const SOLO_INCLUDED_TOKENS = String(pricing.soloIncludedTokensLabel);
const SOLO_REPOSITORIES = String(pricing.soloRepositories);
const PRO_REPOSITORIES = String(pricing.proRepositories);
const FOUNDING_PARTNER_LIMIT = String(pricing.foundingPartnerLimit);
const FOUNDING_PROMO_CODE = pricing.foundingPromoCode;
const INCLUDED_TOKENS = String(pricing.includedTokensLabel);
const FOUNDING_TOKENS = String(pricing.foundingTokensLabel);
const FREE_DELIVERIES = String(pricing.freeDeliveries);
const MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE = pricing.measuredSmallRepositoryDeliveryRange;
const MEASURED_SOLO_REPOSITORY_DELIVERY_RANGE = pricing.measuredSoloRepositoryDeliveryRange;
const MEASURED_LARGE_CODEBASE_DELIVERIES = String(pricing.measuredLargeCodebaseDeliveries);
const MEASURED_SOLO_LARGE_CODEBASE_DELIVERIES = String(pricing.measuredSoloLargeCodebaseDeliveries);
const MEASURED_SNAPSHOT_DELIVERIES = String(pricing.measuredSnapshotDeliveries);

const HOST_ALIASES = {
  "www.orbi.build": "orbi.build",
};

// Test environments (beta.orbi.build, *.workers.dev) must stay out of search
// engines and AI crawlers: robots.txt is served as a blanket Disallow and every
// response carries X-Robots-Tag. Prod hosts keep the public robots.txt.
const PROD_HOSTS = new Set(["orbi.build", "www.orbi.build", "aiready.sh"]);
const TEST_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";
const TEST_NOINDEX = "noindex, nofollow, noarchive";

// Server-side DataFast website id: the same id used by the browser tracking
// script in the HTML head, here feeding AI-crawler traffic to the Bot traffic
// card. The wrapper only fires for known crawler user agents and never for
// human browsers or filtered static assets.
const DATAFAST_WEBSITE_ID = "dfid_Pi7Ns3F360oaZZcmnZgV4";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const GH = "https://api.github.com";
const STATS_CACHE_KEY = "https://orbi.build/__stats";
const STATUS_CACHE_KEY = "https://orbi.build/__status";
const STATS_TTL_MS = 300000;
// On the shared beta hostname the cloud control plane owns the route
// prefixes /api*, /auth*, /login*, /app*, /connect*, /checkout*, /stripe*
// (orbi-cloud discussion 120 §2 C2), so a website route under any of them
// never runs there — the cloud Worker intercepts it. Website-owned Cloud
// entry therefore lives under /cloud/: the login handoff. The retired submit
// route answers 410; D1 bindings and historical rows stay (Issue #179).
const CLOUD_LOGIN_ROUTE = "/cloud/login";
const ZH_CLOUD_LOGIN_ROUTE = "/zh/cloud/login";
const APPLY_ROUTE = "/cloud/apply";
const SUBSCRIBE_ROUTE = "/subscribe";
const ENGAGEMENT_ROUTE = "/cloud/e";
const ENGAGEMENT_KINDS = new Set(["engaged", "cta_click", "scroll_depth"]);
const ENGAGEMENT_DETAILS = new Set([
  "cloud-start", "cloud-start-card", "cloud-hero", "home-hero", "midway-cloud",
  "install", "midway-install", "proof", "comparisons", "cloud-docs", "pricing",
]);
const SCROLL_DEPTHS = new Set(["25", "50", "75", "100"]);

function githubHeaders(token) {
  if (!token) {
    throw new Error("GITHUB_TOKEN is not configured");
  }
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "orbi-website",
  };
}

async function ghJson(path, token, extraHeaders) {
  const response = await fetch(`${GH}${path}`, {
    headers: { ...githubHeaders(token), ...(extraHeaders || {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`github ${response.status} ${path}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

/** Daily cumulative star counts, oldest first.
 *
 * The `star.json` media type is what turns a stargazer into a dated event;
 * without it GitHub returns bare users and there is no curve to draw. Only
 * the last page matters for the total, but the whole history is small
 * enough (a few hundred) to fold in one pass.
 */
async function loadStarHistory(repo, token) {
  const perPage = 100;
  const days = new Map();
  for (let page = 1; page <= 5; page += 1) {
    const batch = await ghJson(
      `/repos/${repo}/stargazers?per_page=${perPage}&page=${page}`,
      token,
      { Accept: "application/vnd.github.star+json" },
    );
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }
    for (const entry of batch) {
      const day = String(entry.starred_at || "").slice(0, 10);
      if (day) {
        days.set(day, (days.get(day) || 0) + 1);
      }
    }
    if (batch.length < perPage) {
      break;
    }
  }
  let total = 0;
  return [...days.keys()].sort().map((date) => {
    total += days.get(date);
    return { date, stars: total };
  });
}

// The LIVE block argues "Orbi builds Orbi" per repository: each group must
// stand on its own real numbers, and a merged total would blur exactly that
// (Issue #101). A repo that fails to load answers null so one outage degrades
// only its own group to the HTML floor values instead of blanking the block.
const STAT_REPOS = ["orbi", "orbi-website", "orbi-cloud"];

// Successful runs of the two deploy workflows are orbi-website's fourth
// delivery metric: the site ships by deploying, not by tagging (no releases).
// The filename is a valid workflow_id; status=success keeps failed runs out.
async function deployRunCount(repo, workflow, token) {
  const runs = await ghJson(
    `/repos/${repo}/actions/workflows/${workflow}/runs?per_page=1&status=success`,
    token,
  );
  return runs.total_count || 0;
}

async function loadRepoStats(name, token) {
  const repo = `orbi-build/${name}`;
  const [meta, closed, merged, releases, stars] = await Promise.all([
    ghJson(`/repos/${repo}`, token),
    ghJson(`/search/issues?q=${encodeURIComponent(`repo:${repo} type:issue state:closed`)}`, token),
    ghJson(`/search/issues?q=${encodeURIComponent(`repo:${repo} is:pr is:merged`)}`, token),
    loadAllReleases(repo, token),
    name === "orbi" ? loadStarHistory(repo, token).catch(() => []) : Promise.resolve([]),
  ]);
  const stats = {
    started: meta.created_at,
    issues_closed: closed.total_count,
    prs_merged: merged.total_count,
    releases: Array.isArray(releases) ? releases.length : 0,
    stars: meta.stargazers_count,
    star_history: stars,
  };
  if (name === "orbi-website") {
    stats.deploys = (await Promise.all([
      deployRunCount(repo, "deploy-beta.yml", token),
      deployRunCount(repo, "deploy-production.yml", token),
    ])).reduce((sum, count) => sum + count, 0);
  }
  return stats;
}

async function loadAllReleases(repo, token) {
  const releases = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await ghJson(`/repos/${repo}/releases?per_page=100&page=${page}`, token);
    if (!Array.isArray(batch) || batch.length === 0) break;
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  return releases;
}

async function loadFoundingAvatars(db) {
  if (!db) return [];
  const tenants = await db.prepare("SELECT login FROM tenants WHERE login IS NOT NULL").all();
  return (tenants?.results || []).map((row) => row.login).filter(Boolean);
}

async function loadStats(token) {
  const groups = await Promise.all(STAT_REPOS.map((name) => loadRepoStats(name, token).catch(() => null)));
  return {
    repos: Object.fromEntries(STAT_REPOS.map((name, index) => [name, groups[index]])),
  };
}

async function statsResponse(request, token) {
  const cache = caches.default;
  const cached = await cache.match(STATS_CACHE_KEY);
  if (cached) {
    return cached;
  }
  const stats = await loadStats(token);
  const response = new Response(JSON.stringify(stats), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      ...SECURITY_HEADERS,
    },
  });
  const toStore = response.clone();
  toStore.headers.set("Cache-Control", `public, max-age=${STATS_TTL_MS / 1000}`);
  await cache.put(STATS_CACHE_KEY, toStore);
  return response;
}

// Terminal rendering of loadStats() for `curl orbi.build/status` (Issue #173).
// Width is hard-capped at 72 columns so the block pastes into TG / README
// without wrapping; no ANSI, no tabs. A null group becomes `unavailable`
// instead of inventing a number.
function formatStatusText(stats) {
  const nameWidth = Math.max(...STAT_REPOS.map((name) => name.length));
  let issuesWidth = 3;
  let prsWidth = 3;
  let releasesWidth = 2;
  for (const name of STAT_REPOS) {
    const repo = stats.repos[name];
    if (!repo) {
      continue;
    }
    issuesWidth = Math.max(issuesWidth, String(repo.issues_closed).length);
    prsWidth = Math.max(prsWidth, String(repo.prs_merged).length);
    releasesWidth = Math.max(releasesWidth, String(repo.releases).length);
  }
  const lines = ["  Orbi — GitHub Issue in, tagged Release out", ""];
  for (const name of STAT_REPOS) {
    const repo = stats.repos[name];
    const label = name.padEnd(nameWidth);
    if (!repo) {
      lines.push(`  ${label}   unavailable`);
      continue;
    }
    const issues = String(repo.issues_closed).padStart(issuesWidth);
    const prs = String(repo.prs_merged).padStart(prsWidth);
    const releases = String(repo.releases).padStart(releasesWidth);
    lines.push(`  ${label}   issues closed ${issues}   PRs merged ${prs}   releases ${releases}`);
  }
  lines.push(
    "",
    "  Every PR above was written, reviewed and merged by Orbi itself.",
    "",
    "  Install:  curl -fsSL aiready.sh | sh",
    "  Docs:     https://docs.orbi.build",
    "  Cloud:    https://cloud-docs.orbi.build/?ref=status",
    "",
  );
  return lines.join("\n");
}

async function statusResponse(request, token) {
  const cache = caches.default;
  const cached = await cache.match(STATUS_CACHE_KEY);
  if (cached) {
    return cached;
  }
  const stats = await loadStats(token);
  const anyLive = STAT_REPOS.some((name) => stats.repos[name]);
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    ...SECURITY_HEADERS,
  };
  if (anyLive) {
    headers["Cache-Control"] = "public, max-age=60";
  }
  const response = new Response(formatStatusText(stats), {
    status: anyLive ? 200 : 503,
    headers,
  });
  if (!anyLive) {
    return response;
  }
  const toStore = response.clone();
  toStore.headers.set("Cache-Control", `public, max-age=${STATS_TTL_MS / 1000}`);
  await cache.put(STATUS_CACHE_KEY, toStore);
  return response;
}

async function fetchAsset(request, assets) {
  const response = await assets.fetch(request);
  const url = new URL(request.url);
  if (response.status === 404 && url.pathname.endsWith("/")) {
    url.pathname += "index.html";
    return assets.fetch(new Request(url, request));
  }
  return response;
}

// The landing pages ship with their Cloud CTAs pointing at /cloud/login.
// That link is only honest where this environment configures CLOUD_LOGIN_URL
// (production and beta both do): without it the route fail-closes with 503,
// so serving the shipped links would send visitors to a dead end and the
// pages are served with every Cloud CTA rewritten to the self-host docs
// instead (Issue #179). The rewrite is driven by the configuration, so opening
// production was a wrangler.toml change, not a page change (Issue #96).
// The price and quota token replacements above it are unconditional: those
// values must read the same on every environment, in every carrier a crawler
// reads.
function foundingAvatarMarkup(logins) {
  return logins.map((login) => {
    const escaped = String(login).replace(/[&<>\"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '\"': "&quot;",
      "'": "&#39;",
    })[character]);
    return `<img class="orbi-avatar-wall-list-img" alt="" title="${escaped}" src="https://avatars.githubusercontent.com/${encodeURIComponent(login)}?s=80">`;
  }).join("");
}

async function assetResponse(asset, cloudLoginConfigured, foundingLogins = []) {
  if ([301, 302, 307, 308].includes(asset.status)) {
    console.error("asset_redirect_unexpected", asset.status);
    return new Response("asset redirect unexpectedly reached the Worker\n", {
      status: 500,
      headers: SECURITY_HEADERS,
    });
  }
  const headers = new Headers(asset.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  const contentType = headers.get("Content-Type") || "";
  const isTemplatedText = asset.status === 200
    && (contentType.startsWith("text/html") || contentType.startsWith("text/plain"));
  if (!isTemplatedText) {
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  }
  const html = await asset.text();
  let body = html
    .replaceAll(pricing.monthlyUsdToken, MONTHLY_USD)
    .replaceAll(pricing.soloMonthlyUsdToken, SOLO_MONTHLY_USD)
    .replaceAll(pricing.soloAnnualUsdToken, SOLO_ANNUAL_USD)
    .replaceAll(pricing.proAnnualUsdToken, PRO_ANNUAL_USD)
    .replaceAll(pricing.soloIncludedTokensToken, SOLO_INCLUDED_TOKENS)
    .replaceAll(pricing.soloRepositoriesToken, SOLO_REPOSITORIES)
    .replaceAll(pricing.proRepositoriesToken, PRO_REPOSITORIES)
    .replaceAll(pricing.foundingPartnerLimitToken, FOUNDING_PARTNER_LIMIT)
    .replaceAll(pricing.foundingPromoCodeToken, FOUNDING_PROMO_CODE)
    .replaceAll(pricing.includedTokensToken, INCLUDED_TOKENS)
    .replaceAll(pricing.foundingTokensToken, FOUNDING_TOKENS)
    .replaceAll(pricing.freeDeliveriesToken, FREE_DELIVERIES)
    .replaceAll(
      pricing.measuredSmallRepositoryDeliveryRangeToken,
      MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE,
    )
    .replaceAll(pricing.measuredSoloRepositoryDeliveryRangeToken, MEASURED_SOLO_REPOSITORY_DELIVERY_RANGE)
    .replaceAll(pricing.measuredLargeCodebaseDeliveriesToken, MEASURED_LARGE_CODEBASE_DELIVERIES)
    .replaceAll(pricing.measuredSoloLargeCodebaseDeliveriesToken, MEASURED_SOLO_LARGE_CODEBASE_DELIVERIES)
    .replaceAll(pricing.measuredSnapshotDeliveriesToken, MEASURED_SNAPSHOT_DELIVERIES)
    .replaceAll("__FOUNDING_AVATARS_HIDDEN__", foundingLogins.length ? "" : "hidden")
    .replaceAll("__FOUNDING_AVATARS__", foundingAvatarMarkup(foundingLogins));
  if (!cloudLoginConfigured) {
    // The shipped hrefs carry ?ref= tokens (Issue #256); the rewrite must
    // catch the ref form as well as the bare form, or an unconfigured
    // environment ships dead-end CTAs again (Issue #179).
    body = body.replace(/href="\/(?:zh\/)?cloud\/login(\?[^"]*)?"/g, 'href="https://docs.orbi.build"');
  }
  if (body === html) {
    // Nothing changed: the bytes are the asset's own representation, so the
    // file's validators stay valid for conditional requests.
    return new Response(html, { status: asset.status, statusText: asset.statusText, headers });
  }
  // A rewritten body is a new representation: the asset file's validators
  // must not answer conditional requests for these bytes.
  headers.delete("etag");
  headers.delete("last-modified");
  headers.delete("content-length");
  return new Response(body, { status: asset.status, statusText: asset.statusText, headers });
}

// Self-contained on purpose: this page must render even though the visitor
// reached it from a cached page, a bookmark, or a search result — none of
// those paths pass through assetResponse, and the page must not depend on
// static assets or on Cloud being up. Colors are the site theme (--night,
// --paper, --run). API clients asking for JSON keep the machine-readable
// error via content negotiation.
const CLOUD_UNAVAILABLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Cloud is temporarily unavailable | Orbi</title>
<style>
body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#06151b; color:#e8eeeb; font:400 16px/1.6 system-ui,sans-serif; }
main { max-width:34rem; padding:48px 24px; }
h1 { font-size:26px; line-height:1.2; margin:0 0 14px; }
p { color:#8ea0c0; margin:0 0 28px; }
ul { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:14px; }
a { color:#5cd6b5; text-underline-offset:3px; }
span { color:#8ea0c0; }
</style>
</head>
<body>
<main>
<h1>Cloud is temporarily unavailable</h1>
<p>Orbi Cloud sign-in is down for the moment. Meanwhile:</p>
<ul>
<li><a href="/">Back to the homepage</a> <span>回首页</span></li>
<li><a href="https://docs.orbi.build">Self-host Orbi yourself</a> <span>自托管文档</span></li>
</ul>
</main>
</body>
</html>
`;

function cloudLoginResponse(request, cloudBaseUrl) {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  if (!cloudBaseUrl) {
    console.error("cloud_login_unavailable: CLOUD_LOGIN_URL is not configured");
    if ((request.headers.get("accept") || "").includes("application/json")) {
      return new Response(JSON.stringify({ error: "Cloud is temporarily unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
      });
    }
    return new Response(CLOUD_UNAVAILABLE_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  // Cloud owns OAuth state/session. Do not forward arbitrary query parameters
  // (in particular tenant) from an unauthenticated website request. The
  // configured value is the verified Cloud login URL, including its route.
  const target = new URL(cloudBaseUrl);
  target.search = "";
  return Response.redirect(target.toString(), 302);
}

function goneResponse() {
  return new Response(JSON.stringify({ error: "gone" }), {
    status: 410,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
  });
}

// Issue #251: the bot verdict on beta is all zeros and the two candidate
// causes — botManagement absent on this account/plan, or present with high
// scores — differ only in the live value. /__cf is the read-only measurement:
// the request's own request.cf echoed back as JSON, exactly as received. It
// carries no credentials, writes nothing, and is never cached (the score is
// per-request), and it is answered on non-production hosts only — production
// has no such route and its assets 404.
function cfDiagResponse(request) {
  const cf = request.cf ?? {};
  return new Response(JSON.stringify({
    botManagement: cf.botManagement ?? null,
    asn: cf.asn,
    colo: cf.colo,
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    },
  });
}

// Issue #174: curl gets public/install.sh; browsers 302 to orbi.build.
// Bytes come from ASSETS so the worker never holds a second copy of the script.
const INSTALL_SCRIPT_CACHE = "public, max-age=120";

async function installScriptResponse(request, assets) {
  const scriptUrl = new URL("/install.sh", request.url);
  const asset = await assets.fetch(new Request(scriptUrl.href, request));
  const headers = new Headers(asset.headers);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Cache-Control", INSTALL_SCRIPT_CACHE);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(asset.body, {
    status: asset.status,
    statusText: asset.statusText,
    headers,
  });
}

async function aireadyResponse(request, url, assets) {
  const route = url.pathname !== "/" && url.pathname.endsWith("/")
    ? url.pathname.slice(0, -1)
    : url.pathname;
  const accept = request.headers.get("accept") || "";
  if (route === "/install.sh" || (url.pathname === "/" && !accept.includes("text/html"))) {
    return installScriptResponse(request, assets);
  }
  if (url.pathname === "/" && accept.includes("text/html")) {
    const pageUrl = new URL("/aiready/", request.url);
    const page = await fetchAsset(new Request(pageUrl, request), assets);
    return assetResponse(page, false);
  }
  if (route === "/zh" && accept.includes("text/html")) {
    const pageUrl = new URL("/aiready/zh/", request.url);
    const page = await fetchAsset(new Request(pageUrl, request), assets);
    return assetResponse(page, false);
  }
  if (route === "/badge.svg") {
    const badge = await assetResponse(await assets.fetch(request), false);
    const headers = new Headers(badge.headers);
    headers.set("Cache-Control", "public, max-age=3600");
    return new Response(badge.body, { status: badge.status, statusText: badge.statusText, headers });
  }
  return Response.redirect(`https://orbi.build${url.pathname}${url.search}`, 302);
}

async function handleFetch(request, env, ctx) {
    const url = new URL(request.url);
    const canonicalHost = HOST_ALIASES[url.hostname];
    if (canonicalHost) {
      return Response.redirect(
        `https://${canonicalHost}${url.pathname}${url.search}`,
        301,
      );
    }

    // Issue #174: aiready.sh is the curl install entry. Accept-negotiate on
    // `/` only — browsers (text/html) go to orbi.build; curl (*/*) and the
    // explicit /install.sh path get public/install.sh via ASSETS.
    if (url.hostname === "aiready.sh") {
      return aireadyResponse(request, url, env.ASSETS);
    }

    if (!PROD_HOSTS.has(url.hostname) && url.pathname === "/robots.txt") {
      return new Response(TEST_ROBOTS_TXT, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": TEST_NOINDEX,
          ...SECURITY_HEADERS,
        },
      });
    }

    // Issue #134: every page on this site lives at a trailing-slash path, so
    // users and clients append one naturally. The worker-owned routes answer
    // both spellings; the original pathname still reaches the static assets,
    // whose directory routing is slash-sensitive.
    const route = url.pathname !== "/" && url.pathname.endsWith("/")
      ? url.pathname.slice(0, -1)
      : url.pathname;

    if (route === "/stats") {
      try {
        return await statsResponse(request, env.GITHUB_TOKEN);
      } catch (err) {
        // Detail stays in the Worker log; the response must not echo GitHub's
        // body, which can carry rate-limit and token-scope text.
        console.error("stats failed:", err && err.message ? err.message : err);
        return new Response(JSON.stringify({ error: "upstream unavailable" }), {
          status: 502,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...SECURITY_HEADERS,
          },
        });
      }
    }

    // Issue #173: curl-readable plaintext of the same loadStats() payload.
    // Browsers send Accept: text/html and fall through to assets so a future
    // /status/ page is not hijacked; curl's default */* gets text/plain.
    if (route === "/status" && !(request.headers.get("accept") || "").includes("text/html")) {
      try {
        return await statusResponse(request, env.GITHUB_TOKEN);
      } catch (err) {
        console.error("status failed:", err && err.message ? err.message : err);
        return new Response("upstream unavailable\n", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...SECURITY_HEADERS,
          },
        });
      }
    }

    if (route === ENGAGEMENT_ROUTE) {
      return engagementResponse(request, env, ctx);
    }

    if (route === CLOUD_LOGIN_ROUTE || route === ZH_CLOUD_LOGIN_ROUTE) {
      return cloudLoginResponse(request, env.CLOUD_LOGIN_URL);
    }

    if (route === "/apply") {
      return Response.redirect(`https://${url.hostname}/cloud/`, 301);
    }

    if (route === APPLY_ROUTE) {
      return goneResponse();
    }

    if (route === SUBSCRIBE_ROUTE) {
      return subscribeResponse(request, env);
    }

    // Issue #165: /pricing is a permanent alias of the /cloud/ PRICING
    // section. Host comes from the request so beta stays on beta.
    if (route === "/pricing" || route === "/zh/pricing") {
      const prefix = route.startsWith("/zh") ? "/zh" : "";
      return Response.redirect(`https://${url.hostname}${prefix}/cloud/#pricing`, 301);
    }

    // Issue #251: beta-only request.cf diagnostic; production falls through
    // to the assets and 404s.
    if (route === "/__cf" && !PROD_HOSTS.has(url.hostname)) {
      return cfDiagResponse(request);
    }

    const asset = await fetchAsset(request, env.ASSETS);
    let foundingLogins = [];
    if (route === "/" || route === "/zh") {
      try {
        foundingLogins = await loadFoundingAvatars(env.CONTROL_PLANE_DB);
      } catch (err) {
        console.error("founding avatars failed:", err && err.message ? err.message : err);
      }
    }
    // The Assets binding answers a directory path without its trailing slash
    // (/cloud) with a 307 to the slash form (/cloud/). That redirect is the
    // binding's own canonicalisation, not an unexpected asset redirect: pass
    // it on as a 308 with our headers so the visitor lands on /cloud/ instead
    // of the 500 guard below (production 2026-09-18: orbi.build/cloud → 500).
    const slashRedirect = trailingSlashRedirect(asset, url);
    if (slashRedirect !== null) {
      return slashRedirect;
    }
    return assetResponse(asset, Boolean(env.CLOUD_LOGIN_URL), foundingLogins);
}

// A same-origin redirect from <path> to <path>/ is the Assets binding's
// trailing-slash canonicalisation; anything else is not ours to follow.
function subscriptionReturnUrl(value, request) {
  const fallback = new URL(request.url);
  fallback.search = "";
  fallback.hash = "";
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const target = new URL(value.slice(0, 500), request.url);
    return target.origin === fallback.origin ? target : fallback;
  } catch {
    return fallback;
  }
}

function subscriptionResponse(request, status, body) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  if (wantsJson) {
    const { return_to: _returnTo, ...jsonBody } = body;
    return new Response(JSON.stringify(jsonBody), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  const location = subscriptionReturnUrl(body.return_to, request);
  if (status >= 200 && status < 300) location.searchParams.set("subscribed", "1");
  else location.searchParams.set("subscribe_error", status === 400 ? "invalid" : "unavailable");
  return Response.redirect(location, 303);
}

async function subscribeResponse(request, env) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: SECURITY_HEADERS });
  let fields;
  try {
    fields = (request.headers.get("Content-Type") || "").includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return subscriptionResponse(request, 400, { error: "invalid_request", return_to: new URL(request.url).pathname });
  }
  const email = typeof fields?.email === "string" ? fields.email.trim() : "";
  const lang = fields?.lang === "zh" ? "zh" : fields?.lang === "en" ? "en" : null;
  const returnUrl = subscriptionReturnUrl(fields?.return_to, request);
  const return_to = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
  if (!email || !lang) return subscriptionResponse(request, 400, { error: "invalid_request", return_to });
  if (!env.CLOUD_SUBSCRIBE_URL || !env.WEBSITE_SECRET) {
    console.error("subscribe_unavailable: Cloud subscription configuration is missing");
    return subscriptionResponse(request, 503, { error: "unavailable", return_to });
  }
  const payload = {
    email,
    ref: cookieFrom(request, "ref") || "",
    vid: cookieFrom(request, "vid") || "",
    lang,
  };
  try {
    const cloudRequest = new Request(env.CLOUD_SUBSCRIBE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WEBSITE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    const response = await (env.CLOUD ? env.CLOUD.fetch(cloudRequest) : fetch(cloudRequest));
    if (response.status === 400) return subscriptionResponse(request, 400, { error: "invalid_email", return_to });
    if (!response.ok) {
      console.error("subscribe_upstream_rejected", response.status);
      return subscriptionResponse(request, 502, { error: "unavailable", return_to });
    }
    return subscriptionResponse(request, 200, { ok: true, return_to });
  } catch (err) {
    console.error("subscribe_failed:", err && err.message ? err.message : err);
    return subscriptionResponse(request, 502, { error: "unavailable", return_to });
  }
}

async function engagementResponse(request, env, ctx) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: SECURITY_HEADERS });
  let event;
  try {
    event = await request.json();
  } catch {
    return new Response(null, { status: 400, headers: SECURITY_HEADERS });
  }
  const kind = event?.kind;
  const detail = event?.detail;
  const valid = ENGAGEMENT_KINDS.has(kind)
    && (kind === "engaged" ? detail === undefined
      : kind === "cta_click" ? typeof detail === "string" && ENGAGEMENT_DETAILS.has(detail)
        : typeof detail === "string" && SCROLL_DEPTHS.has(detail));
  if (!valid) return new Response(null, { status: 400, headers: SECURITY_HEADERS });

  const path = typeof event.path === "string" && event.path.startsWith("/")
    ? event.path.slice(0, 200)
    : new URL(request.url).pathname;
  const payload = { kind, path };
  if (kind !== "engaged") payload.detail = detail;
  const vid = cookieFrom(request, "vid");
  if (vid) payload.vid = vid;
  if (env.CLOUD_VISIT_URL && env.WEBSITE_SECRET) {
    // Engagement is deliberately a bypass: the browser gets a fast 204 even
    // when the Cloud binding is unavailable or rejects the report.
    const report = reportVisit(env, request, payload);
    if (ctx?.waitUntil) ctx.waitUntil(report);
  }
  return new Response(null, { status: 204, headers: SECURITY_HEADERS });
}

function trailingSlashRedirect(asset, url) {
  if (![301, 307, 308].includes(asset.status)) return null;
  const location = asset.headers.get("Location");
  if (location === null) return null;
  let target;
  try {
    target = new URL(location, url);
  } catch {
    return null;
  }
  if (target.origin !== url.origin || target.pathname !== `${url.pathname}/`) return null;
  return new Response(null, {
    status: 308,
    headers: { ...SECURITY_HEADERS, Location: `${target.pathname}${url.search}` },
  });
}

// ---- First-touch attribution (Issues #228, #234) ----

// Two first-touch cookies ride every response, and the registration side
// (orbi-cloud#716) reads both on the same hostname, so the format is a
// two-repo contract: a host-only Path=/ cookie with HttpOnly; SameSite=Lax
// and a 90-day Max-Age. Secure rides only on https requests — the cloud
// sessionCookieString pattern — so local http testing can still seed them.
// vid is 16 random bytes as base64url (22 chars, no padding). ref carries the
// normalized source (a ref token, a source host, or "direct") and is what
// the signup actually attributes to (orbi-cloud getCookie(..., "ref"),
// Issue #234).
//
// 90 days (Issue #246): the longest window mainstream platforms use for this
// kind of touch (GA4 non-acquisition key events, LinkedIn click, SaaS
// affiliate ceiling). Because the website is every visitor's first landing
// and the cloud's plantVidCookie never re-plants over an existing vid, this
// constant alone decides the real window. It MUST stay in lockstep with
// ATTRIBUTION_MAX_AGE_SECONDS in orbi-cloud src/session.ts (cloud#732) —
// both workers plant the same shared-domain cookie.
const ATTRIBUTION_MAX_AGE_SECONDS = 7776000;

function cookieFrom(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) {
    return null;
  }
  for (const pair of header.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name && rest.length > 0) {
      return rest.join("=");
    }
  }
  return null;
}

function randomVid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function attributionCookieString(name, value, secure) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ATTRIBUTION_MAX_AGE_SECONDS}${secure ? "; Secure" : ""}`;
}

// Same fallback chain as the cloud signup source (orbi-cloud#716), so the
// website's first-touch answer and the signup's own normalization agree:
// validated ?ref= token, then ?source= host, then referer host, then direct.
const REF_TOKEN = /^[a-z0-9_-]{1,32}$/;
const SOURCE_HOST = /^[a-z0-9.-]{1,253}$/;

function refererHost(request) {
  const value = request.headers.get("Referer");
  if (value === null) {
    return null;
  }
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isInternal = host === "orbi.build" || host.endsWith(".orbi.build");
    return (url.protocol === "http:" || url.protocol === "https:") && SOURCE_HOST.test(host) && !isInternal ? host : null;
  } catch {
    return null;
  }
}

function normalizedSource(url, request) {
  const ref = url.searchParams.get("ref");
  if (ref !== null && REF_TOKEN.test(ref.toLowerCase())) {
    return ref.toLowerCase();
  }
  const source = url.searchParams.get("source")?.toLowerCase();
  if (source !== undefined && SOURCE_HOST.test(source)) {
    return source;
  }
  return refererHost(request) ?? "direct";
}

// The visit report is a bypass path: it never delays the response (rides
// ctx.waitUntil) and never decides the page's fate — every failure, its own
// or a timeout or a rejection status, is swallowed with a console.warn.
//
// It travels over the CLOUD service binding, never a plain fetch() (Issue
// #231). Both Workers answer on one hostname — website on orbi.build/*, the
// control plane on orbi.build/api* — and Cloudflare routes a Worker's own
// fetch() of its zone "to the zone's origin server, ignoring any Workers
// mapped to the URL". The report therefore never reached the control plane
// and died on the 5s timeout; the binding is a direct Worker-to-Worker call
// that skips routing entirely. env.CLOUD_VISIT_URL still supplies the path.
// A missing binding (local dev, a partial config) falls back to fetch so the
// page path stays identical either way.
// The visit's own request comes along so the bot signals (visitSignals, an
// await because of the UA hash) are computed here, inside the waitUntil
// branch — the response path stays synchronous and static-asset requests
// never classify at all.
async function reportVisit(env, visitRequest, payload) {
  try {
    const request = new Request(env.CLOUD_VISIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WEBSITE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...payload, ...await visitSignals(visitRequest, payload, env.VISITOR_EVENTS_DB) }),
      signal: AbortSignal.timeout(5000),
    });
    const response = env.CLOUD ? await env.CLOUD.fetch(request) : await fetch(request);
    if (!response.ok) {
      console.warn("visit_report_rejected", response.status);
    }
  } catch (err) {
    console.warn("visit_report_failed:", err && err.message ? err.message : err);
  }
}

// Runs at the fetch-wrapper exit, after handleFetch returns, so every worker
// response — pages, redirects, worker-served routes — passes through here.
// A request without a vid cookie gets one seeded (first touch), and the ref
// slot follows the Issue #247 split by source kind:
// - An explicit ?ref= token is a link we shipped, so it is last touch: it
//   overwrites whatever the slot held and is reported on every visit — a
//   visitor who browsed direct first and clicked a campaign link later still
//   lands the referral (Issue #244).
// - Derived sources (?source=, referer host, direct) are guesses an OAuth
//   bounce or an in-site hop can fabricate, so they are first touch: they
//   fill an empty slot and never overwrite — github.com must not replace the
//   tweet that brought the visitor here.
// Probes and crawlers keep their vid and their page; their visits are marked
// is_bot=1 (visitSignals — the request.cf.asn of a cloud provider, crawler UA
// substrings, or durable/short-window behavior, Issue #280/#305/#386;
// botManagement is an Enterprise add-on we do not buy) so dashboard queries can exclude them. The response body is
// never rewritten, so asset validators like ETag survive. Every HTML 200 is
// reported as one visit.
// Known corner (Issue #228, awaiting maintainer sign-off): seeding is
// unconditional because the issue's acceptance seeds at the handleFetch exit
// on every no-vid response, so a first landing that redirects — www → apex
// 301 or a trailing-slash 308 — keeps ?ref= in the redirected URL but is no
// longer first touch on the final page. If redirected landings must keep
// their ref, the flip is to seed only on HTML 200 responses (maintainer's
// call).
function withAttribution(request, response, env, ctx) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  const existingVid = cookieFrom(request, "vid");
  const vid = existingVid ?? randomVid();
  const firstTouch = existingVid === null;
  const existingRef = cookieFrom(request, "ref");
  const source = normalizedSource(url, request);
  // Lowercased and REF_TOKEN-tested exactly like normalizedSource's ref
  // branch, so when this is non-null it equals `source` and the registration
  // side (orbi-cloud isStoredSource) accepts the value unchanged.
  const rawRef = url.searchParams.get("ref");
  const explicitRef = rawRef !== null && REF_TOKEN.test(rawRef.toLowerCase())
    ? rawRef.toLowerCase()
    : null;
  if (
    response.status === 200
    && (response.headers.get("Content-Type") || "").startsWith("text/html")
    && env.CLOUD_VISIT_URL
    && env.WEBSITE_SECRET
  ) {
    // Signals ride only this reported branch so every static-asset request
    // skips the classification entirely.
    ctx.waitUntil(reportVisit(env, request, {
      vid,
      path: url.pathname,
      ref: explicitRef ?? (firstTouch ? source : ""),
    }));
  }
  const seedsRef = explicitRef !== null || (existingRef === null && source !== "direct");
  if (!firstTouch && !seedsRef) {
    return response;
  }
  const stamped = new Response(response.body, response);
  if (firstTouch) {
    stamped.headers.append("Set-Cookie", attributionCookieString("vid", vid, secure));
  }
  if (seedsRef) {
    stamped.headers.append("Set-Cookie", attributionCookieString("ref", explicitRef ?? source, secure));
  }
  return stamped;
}

export { assetResponse, cloudLoginResponse, fetchAsset, githubHeaders, handleFetch, loadFoundingAvatars, loadStats, PROD_HOSTS, statsResponse, subscribeResponse, trailingSlashRedirect };

export default {
  // Third arg (ctx) carries waitUntil: both the DataFast POST and the visit
  // attribution report ride ctx.waitUntil, so neither ever delays the
  // response. withAttribution runs at the wrapper exit so every handleFetch
  // return — pages, redirects, worker routes — is covered (Issue #228).
  fetch: withAICrawlerTracking(async (request, env, ctx) => {
    const response = await handleFetch(request, env, ctx);
    const attributed = withAttribution(request, response, env, ctx);
    if (PROD_HOSTS.has(new URL(request.url).hostname)) return attributed;
    const stamped = new Response(attributed.body, attributed);
    stamped.headers.set("X-Robots-Tag", TEST_NOINDEX);
    return stamped;
  }, { websiteId: DATAFAST_WEBSITE_ID }),
};
