import { withAICrawlerTracking } from "@datafast/ai-crawl";
import pricing from "./pricing.json";

// Single source of truth for the Cloud monthly price (Issue #102). The shipped
// HTML carries monthlyUsdToken wherever that price appears — including the
// head tags (meta/og/twitter/JSON-LD) that crawlers read without running
// JavaScript — and serving replaces it with cloudMonthlyUsd below.
const MONTHLY_USD = String(pricing.cloudMonthlyUsd);

const HOST_ALIASES = {
  "www.orbi.build": "orbi.build",
};

// Test environments (beta.orbi.build, *.workers.dev) must stay out of search
// engines and AI crawlers: robots.txt is served as a blanket Disallow and every
// response carries X-Robots-Tag. Prod hosts keep the public robots.txt.
const PROD_HOSTS = new Set(["orbi.build", "www.orbi.build"]);
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
const STATS_TTL_MS = 300000;
// On the shared beta hostname the cloud control plane owns the route
// prefixes /api*, /auth*, /login*, /app*, /connect*, /checkout*, /stripe*
// (orbi-cloud discussion 120 §2 C2), so a website route under any of them
// never runs there — the cloud Worker intercepts it. Both website-owned
// Cloud-entry endpoints therefore live under /cloud/: the login handoff and
// the application submit (Issue #76).
const CLOUD_LOGIN_ROUTE = "/cloud/login";
const APPLY_ROUTE = "/cloud/apply";

// /cloud/apply is an unauthenticated write into D1: bound the body and every
// column so a script cannot fill the table with oversized rows.
const MAX_BODY_BYTES = 16384;
const MAX_FIELD = {
  name: 120,
  tg: 120,
  email: 200,
  agent_tools: 300,
  scenario: 2000,
  pain: 2000,
  ai_spend: 60,
  issue_volume: 60,
};

function field(body, key) {
  return String(body[key] || "").trim().slice(0, MAX_FIELD[key]);
}

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

async function loadStats(token) {
  const repo = "orbi-build/orbi";
  const [meta, closed, merged, releases, stars] = await Promise.all([
    ghJson(`/repos/${repo}`, token),
    ghJson(`/search/issues?q=${encodeURIComponent(`repo:${repo} type:issue state:closed`)}`, token),
    ghJson(`/search/issues?q=${encodeURIComponent(`repo:${repo} is:pr is:merged`)}`, token),
    ghJson(`/repos/${repo}/releases?per_page=100`, token),
    loadStarHistory(repo, token).catch(() => []),
  ]);
  return {
    started: meta.created_at,
    issues_closed: closed.total_count,
    prs_merged: merged.total_count,
    releases: Array.isArray(releases) ? releases.length : 0,
    stars: meta.stargazers_count,
    star_history: stars,
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
// pages are served with every Cloud CTA rewritten to the application page
// instead (Issue #77). The rewrite is driven by the configuration, so opening
// production was a wrangler.toml change, not a page change (Issue #96).
// The price token replacement above it is unconditional: the monthly price
// must read the same on every environment, in every carrier a crawler reads.
async function assetResponse(asset, cloudLoginConfigured) {
  const headers = new Headers(asset.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  const isHtml = asset.status === 200
    && (headers.get("Content-Type") || "").startsWith("text/html");
  if (!isHtml) {
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  }
  const html = await asset.text();
  let body = html.replaceAll(pricing.monthlyUsdToken, MONTHLY_USD);
  if (!cloudLoginConfigured) {
    body = body.replaceAll('href="/cloud/login"', 'href="/apply"');
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
<li><a href="/apply">Apply to build with us</a> <span>报名首批共建用户</span></li>
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

async function handleApply(request, env) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "payload too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "payload too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
      });
    }
    body = JSON.parse(raw);
  } catch (err) {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  const name = field(body, "name");
  const tg = field(body, "tg");
  const email = field(body, "email");
  const agentTools = field(body, "agent_tools");
  const scenario = field(body, "scenario");
  const pain = field(body, "pain");
  const aiSpend = field(body, "ai_spend");
  const issueVolume = field(body, "issue_volume");
  // A nickname is not needed to act on an application: tg identifies and
  // reaches the person. The column is NOT NULL, so an omitted name is stored
  // as an empty string rather than rejected.
  if (!tg || !scenario) {
    return new Response(JSON.stringify({ error: "tg and scenario are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  try {
    await env.orbi_applications.prepare(
      "INSERT INTO applications (name, tg, email, agent_tools, scenario, pain, ai_spend, issue_volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(name, tg, email, agentTools, scenario, pain, aiSpend, issueVolume).run();
  } catch (err) {
    // A failed insert used to bubble up as a 500 and the lead was lost for
    // good: nothing else on the path keeps a copy. Log the parsed payload so
    // the application can be recovered by hand from the Worker logs. Only
    // fields we recognise are logged, never the raw body.
    console.error("apply_insert_failed " + JSON.stringify({
      reason: (err && err.message) || String(err),
      at: new Date().toISOString(),
      name: name,
      tg: tg,
      email: email,
      scenario: scenario,
      pain: pain,
      agent_tools: agentTools,
      ai_spend: aiSpend,
      issue_volume: issueVolume,
    }));
    return new Response(JSON.stringify({ error: "could not save the application" }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
  });
}

async function handleFetch(request, env) {
    const url = new URL(request.url);
    const canonicalHost = HOST_ALIASES[url.hostname];
    if (canonicalHost) {
      return Response.redirect(
        `https://${canonicalHost}${url.pathname}${url.search}`,
        301,
      );
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

    if (url.pathname === "/stats") {
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

    if (url.pathname === CLOUD_LOGIN_ROUTE) {
      return cloudLoginResponse(request, env.CLOUD_LOGIN_URL);
    }

    if (url.pathname === APPLY_ROUTE) {
      return await handleApply(request, env);
    }

    return assetResponse(await fetchAsset(request, env.ASSETS), Boolean(env.CLOUD_LOGIN_URL));
}

export { cloudLoginResponse, field, fetchAsset, githubHeaders, handleFetch };

export default {
  // Third arg (ctx) carries waitUntil: the wrapper hands the DataFast POST to
  // ctx.waitUntil, so tracking never delays the response.
  fetch: withAICrawlerTracking(async (request, env, ctx) => {
    const response = await handleFetch(request, env, ctx);
    if (PROD_HOSTS.has(new URL(request.url).hostname)) return response;
    const stamped = new Response(response.body, response);
    stamped.headers.set("X-Robots-Tag", TEST_NOINDEX);
    return stamped;
  }, { websiteId: DATAFAST_WEBSITE_ID }),
};
