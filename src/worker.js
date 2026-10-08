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
const FOUNDING_PARTNER_REMAINING = String(pricing.foundingPartnerRemaining);
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
const GUIDE_REDIRECTS = new Map([
  ["/issue-to-release", "/guides/issue-to-release/"],
  ["/autonomous-coding-agent", "/guides/autonomous-coding-agent/"],
  ["/self-hosted-coding-agent", "/guides/self-hosted-coding-agent/"],
  ["/codex-github-issues", "/guides/codex-github-issues/"],
  ["/zh/issue-to-release", "/zh/guides/issue-to-release/"],
  ["/zh/autonomous-coding-agent", "/zh/guides/autonomous-coding-agent/"],
  ["/zh/self-hosted-coding-agent", "/zh/guides/self-hosted-coding-agent/"],
  ["/zh/codex-github-issues", "/zh/guides/codex-github-issues/"],
]);
const ENGAGEMENT_KINDS = new Set(["visit", "engaged", "cta_click", "scroll_depth", "section_view"]);
const ENGAGEMENT_DETAIL = /^[a-z0-9-]{1,40}$/;
const SCROLL_DEPTHS = new Set(["25", "50", "75", "100"]);
// Issue #844: raw_query / raw_referrer are forwarded verbatim, only capped so
// a hostile page cannot push an unbounded string through the visit report.
const RAW_LANDING_MAX_LENGTH = 1024;

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

// Issue #827: the avatar wall is capped. The row cannot grow with the
// tenant list — a phone cannot fit an unbounded number of faces — so the
// newest FOUNDING_AVATAR_LIMIT logins are shown and the rest are counted in
// one "+K" chip. 18 faces plus that chip is one row at 390px.
const FOUNDING_AVATAR_LIMIT = 18;
const FOUNDING_AVATARS_SQL = `SELECT login FROM tenants WHERE login IS NOT NULL ORDER BY created_at DESC LIMIT ${FOUNDING_AVATAR_LIMIT}`;
const FOUNDING_AVATARS_TOTAL_SQL = "SELECT COUNT(*) AS total FROM tenants WHERE login IS NOT NULL";

async function loadFoundingAvatars(db) {
  if (!db) return { logins: [], total: 0 };
  const [newest, counted] = await Promise.all([
    db.prepare(FOUNDING_AVATARS_SQL).all(),
    db.prepare(FOUNDING_AVATARS_TOTAL_SQL).all(),
  ]);
  const logins = (newest?.results || []).map((row) => row.login).filter(Boolean);
  return { logins, total: Number(counted?.results?.[0]?.total) || 0 };
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
function foundingAvatarMarkup(logins, total = logins.length, zh = false) {
  const faces = logins.map((login) => {
    const escaped = String(login).replace(/[&<>\"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '\"': "&quot;",
      "'": "&#39;",
    })[character]);
    // Issue #892: an empty alt hides every face from screen readers and
    // image search; name the contributor in the page's own language.
    const alt = zh ? `GitHub 贡献者 ${escaped}` : `GitHub contributor ${escaped}`;
    return `<img class="orbi-avatar-wall-list-img" alt="${alt}" title="${escaped}" src="https://avatars.githubusercontent.com/${encodeURIComponent(login)}?s=80" loading="lazy" decoding="async">`;
  }).join("");
  // Issue #827: the teams past the cap are counted, not rendered, so the row
  // stays one line however many teams sign up.
  const hidden = total - logins.length;
  if (hidden <= 0) return faces;
  const label = zh ? `${total} 个团队` : `${total} teams`;
  return `${faces}<span class="avatar-wall-more" title="${label}">+${hidden}</span>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function relatedPostsMarkup(request, env, slug, language) {
  const postsResponse = await env.ASSETS.fetch(new Request(new URL("/blog/posts.json", request.url)));
  if (!postsResponse.ok) throw new Error(`posts.json returned ${postsResponse.status}`);
  const postsText = await postsResponse.text();
  const posts = JSON.parse(postsText);
  if (!Array.isArray(posts) || posts.some((post) => !post?.slug || !post?.title || !post?.summary)) {
    throw new Error("posts.json has an invalid shape");
  }
  const current = posts.find((post) => language === "zh" ? post.zhSlug === slug : post.slug === slug);
  if (!current) throw new Error(`unknown blog slug: ${slug}`);
  const hash = await sha256Hex(postsText);
  const cacheKey = new Request(`https://orbi.build/__related/${hash}`);
  const cache = caches.default;
  let table;
  const cached = await cache.match(cacheKey);
  if (cached) {
    table = await cached.json();
  } else {
    if (!env.AI || typeof env.AI.run !== "function") throw new Error("Workers AI binding is unavailable");
    const result = await env.AI.run("@cf/baai/bge-m3", {
      text: posts.map((post) => `${post.title}\n${post.summary}`),
    });
    const vectors = result?.data;
    const dimensions = Array.isArray(vectors?.[0]) ? vectors[0].length : 0;
    if (!Array.isArray(vectors) || vectors.length !== posts.length || dimensions === 0
      || vectors.some((vector) => !Array.isArray(vector) || vector.length !== dimensions
        || vector.some((value) => typeof value !== "number" || !Number.isFinite(value)))) {
      throw new Error("Workers AI returned invalid embeddings");
    }
    table = Object.fromEntries(posts.map((post, index) => {
      const ranked = posts
        .map((candidate, candidateIndex) => ({
          slug: candidate.slug,
          score: candidateIndex === index ? -Infinity : cosineSimilarity(vectors[index], vectors[candidateIndex]),
          index: candidateIndex,
        }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, 3)
        .map((candidate) => candidate.slug);
      return [post.slug, ranked];
    }));
    await cache.put(cacheKey, new Response(JSON.stringify(table), {
      headers: { "Content-Type": "application/json" },
    }));
  }
  const selected = [];
  for (const candidate of [...(current.related || []), ...(table[current.slug] || [])]) {
    if (candidate !== current.slug && !selected.includes(candidate) && posts.some((post) => post.slug === candidate)) {
      selected.push(candidate);
    }
    if (selected.length === 3) break;
  }
  if (selected.length !== 3) throw new Error(`fewer than three related posts for ${slug}`);
  const zh = language === "zh";
  const links = selected.map((candidateSlug) => {
    const post = posts.find((entry) => entry.slug === candidateSlug);
    const href = zh ? `/zh/blog/${post.zhSlug}/` : `/blog/${post.slug}/`;
    const title = zh ? post.zhTitle : post.title;
    if (!title || (zh && !post.zhSlug)) throw new Error(`missing Chinese mirror for ${candidateSlug}`);
    return `<li><a href="${href}">${escapeHtml(title)}</a></li>`;
  }).join("");
  const heading = zh ? "相关文章" : "Related posts";
  return `<section class="related-links" aria-labelledby="related-posts-title"><h2 id="related-posts-title">${heading}</h2><ul>${links}</ul></section>`;
}

// Issue #873: the homepage's "Orbi builds Orbi" counters ship as literals in
// the served HTML so a reader that runs no JavaScript (an AI assistant
// fetching the page live, an AI search index crawler) reads the real totals
// instead of 0. This is the initial value of the same number demo.js animates,
// not a no-JS fallback: the browser still fetches /stats, animates, and
// refreshes exactly as before.
//
// Values come from the same STATS_CACHE_KEY entry /stats serves — no second
// GitHub path. A miss writes each element's data-floor and warms the cache
// through ctx.waitUntil, so the homepage response never waits on GitHub.
const HOMEPAGE_STAT_FIELDS = {
  issues: "issues_closed",
  prs: "prs_merged",
  releases: "releases",
  deploys: "deploys",
};

function homepageStatValue(stat, repo, now) {
  if (!repo) {
    return null;
  }
  if (stat === "days") {
    const started = Date.parse(repo.started);
    return Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 86400000)) : null;
  }
  const field = HOMEPAGE_STAT_FIELDS[stat];
  return field ? repo[field] : null;
}

// The floor rides the element's own data-floor attribute, so the fallback
// value lives next to the markup it guards.
function elementFloor(attrs) {
  return attrs.match(/\bdata-floor="([^"]*)"/)?.[1];
}

function fillHomepageStats(body, stats, now = Date.now()) {
  const repos = stats?.repos || {};
  body = body.replace(
    /<(strong|b)((?=[^>]*\bdata-repo="([^"]+)")(?=[^>]*\bdata-stat="([^"]+)")[^>]*)>([^<]*)<\/\1>/g,
    (match, tag, attrs, repoName, stat, original) => {
      const value = homepageStatValue(stat, repos[repoName], now);
      const text = Number.isFinite(value) ? String(value) : (elementFloor(attrs) ?? original);
      return '<' + tag + attrs + '>' + text + '</' + tag + '>';
    },
  );
  return body.replace(
    /<b((?=[^>]*\bdata-star-total\b)[^>]*)>([^<]*)<\/b>/g,
    (match, attrs, original) => {
      const stars = repos.orbi?.stars;
      const text = Number.isFinite(stars) ? String(stars) : (elementFloor(attrs) ?? original);
      return '<b' + attrs + '>' + text + '</b>';
    },
  );
}

async function homepageStats(env, ctx) {
  const cache = typeof caches === "undefined" ? undefined : caches.default;
  if (!cache) {
    return null;
  }
  let stats = null;
  try {
    const cached = await cache.match(STATS_CACHE_KEY);
    if (cached) {
      stats = await cached.json();
    }
  } catch (err) {
    console.error("homepage_stats_cache_failed:", err && err.message ? err.message : err);
  }
  if (!stats && ctx?.waitUntil) {
    ctx.waitUntil(statsResponse(new Request(STATS_CACHE_KEY), env?.GITHUB_TOKEN).catch((err) => {
      console.error("homepage_stats_warm_failed:", err && err.message ? err.message : err);
    }));
  }
  return stats;
}

async function assetResponse(asset, cloudLoginConfigured, founding = { logins: [], total: 0 }, request, env, ctx) {
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
  const zh = Boolean(request?.url) && new URL(request.url).pathname.startsWith("/zh");
  const pathname = request?.url ? new URL(request.url).pathname : "";
  // Issue #873: only the homepage carries the live stat elements.
  const homepage = pathname === "/" || pathname === "/zh/";
  let body = html;
  const blogMatch = request?.url && new URL(request.url).pathname.match(/^(\/zh)?\/blog\/([^/]+)\/?$/);
  if (blogMatch && body.includes("<!--orbi:related-posts-->")) {
    try {
      const related = await relatedPostsMarkup(request, env, blogMatch[2], blogMatch[1] ? "zh" : "en");
      body = body.replaceAll("<!--orbi:related-posts-->", related);
    } catch (error) {
      console.error("related_posts_failed:", error && error.message ? error.message : error);
      body = body.replaceAll("<!--orbi:related-posts-->", "");
    }
  }
  body = body
    .replaceAll(pricing.monthlyUsdToken, MONTHLY_USD)
    .replaceAll(pricing.soloMonthlyUsdToken, SOLO_MONTHLY_USD)
    .replaceAll(pricing.soloAnnualUsdToken, SOLO_ANNUAL_USD)
    .replaceAll(pricing.proAnnualUsdToken, PRO_ANNUAL_USD)
    .replaceAll(pricing.soloAnnualMonthlyUsdToken, String(pricing.soloAnnualMonthlyUsd))
    .replaceAll(pricing.proAnnualMonthlyUsdToken, String(pricing.proAnnualMonthlyUsd))
    .replaceAll(pricing.soloAnnualSavingsPercentToken, String(pricing.soloAnnualSavingsPercent))
    .replaceAll(pricing.proAnnualSavingsPercentToken, String(pricing.proAnnualSavingsPercent))
    .replaceAll(pricing.annualSavingsPercentToken, String(pricing.annualSavingsPercent))
    .replaceAll(pricing.soloIncludedTokensToken, SOLO_INCLUDED_TOKENS)
    .replaceAll(pricing.soloRepositoriesToken, SOLO_REPOSITORIES)
    .replaceAll(pricing.proRepositoriesToken, PRO_REPOSITORIES)
    .replaceAll(pricing.foundingPartnerLimitToken, FOUNDING_PARTNER_LIMIT)
    .replaceAll(pricing.foundingPartnerRemainingToken, FOUNDING_PARTNER_REMAINING)
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
    .replaceAll("__FOUNDING_AVATARS_HIDDEN__", founding.total ? "" : "hidden")
    .replaceAll("__FOUNDING_AVATARS__", foundingAvatarMarkup(founding.logins, founding.total, zh));
  if (homepage) {
    body = fillHomepageStats(body, await homepageStats(env, ctx));
  }
  if (!cloudLoginConfigured) {
    // The shipped hrefs carry ?ref= tokens (Issue #256); the rewrite must
    // catch the ref form as well as the bare form, or an unconfigured
    // environment ships dead-end CTAs again (Issue #179). The nav Sign in
    // link (Issue #528) points straight at the cloud control plane's
    // /api/login — same dead end where Cloud is absent, so it joins.
    body = body
      .replace(/href="\/(?:zh\/)?cloud\/login(\?[^"]*)?"/g, 'href="https://docs.orbi.build"')
      .replace(/href="\/api\/login"/g, 'href="https://docs.orbi.build"');
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

    // The generated aiready.sh pages carry the same engagement script as
    // orbi.build, so its same-origin beacon must reach the shared endpoint
    // before the host's catch-all redirect runs.
    if (url.pathname === ENGAGEMENT_ROUTE || url.pathname === `${ENGAGEMENT_ROUTE}/`) {
      return engagementResponse(request, env, ctx);
    }

    const guideRedirect = GUIDE_REDIRECTS.get(url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname);
    if (guideRedirect) {
      return Response.redirect(`https://${url.hostname}${guideRedirect}${url.search}`, 301);
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

    if (route === CLOUD_LOGIN_ROUTE || route === ZH_CLOUD_LOGIN_ROUTE) {
      return cloudLoginResponse(request, env.CLOUD_LOGIN_URL);
    }

    if (route === "/apply") {
      return Response.redirect(`https://${url.hostname}/cloud/`, 301);
    }

    if (route === "/x") {
      return Response.redirect(`https://${url.hostname}/?ref=x-bio`, 302);
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
    let founding = { logins: [], total: 0 };
    if (route === "/" || route === "/zh") {
      try {
        founding = await loadFoundingAvatars(env.CONTROL_PLANE_DB);
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
    return assetResponse(asset, Boolean(env.CLOUD_LOGIN_URL), founding, request, env, ctx);
}

// Issue #541: the subscription endpoint answers JSON only — the form is
// submitted by subscribe.js, so the no-JS 303 redirect branch is gone.
function subscriptionResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
  });
}

async function subscribeResponse(request, env) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: SECURITY_HEADERS });
  let fields;
  try {
    fields = (request.headers.get("Content-Type") || "").includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return subscriptionResponse(400, { error: "invalid_request" });
  }
  const email = typeof fields?.email === "string" ? fields.email.trim() : "";
  const lang = fields?.lang === "zh" ? "zh" : fields?.lang === "en" ? "en" : null;
  if (!email || !lang) return subscriptionResponse(400, { error: "invalid_request" });
  if (!env.NEWSLETTER || !env.NEWSLETTER_SUBSCRIBE_SECRET) {
    console.error("subscribe_unavailable: newsletter configuration is missing");
    return subscriptionResponse(503, { error: "unavailable" });
  }
  let page = "";
  try {
    page = new URL(request.headers.get("Referer") || "").pathname;
  } catch {
    // An absent or malformed Referer does not prevent a subscription.
  }
  const payload = {
    email,
    lang,
    ref: cookieFrom(request, "ref") || "",
    vid: cookieFrom(request, "vid") || "",
    page,
  };
  try {
    const newsletterRequest = new Request("https://newsletter.orbi.build/api/subscribe", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NEWSLETTER_SUBSCRIBE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    const response = await env.NEWSLETTER.fetch(newsletterRequest);
    if (response.status === 400) return subscriptionResponse(400, { error: "invalid_email" });
    if (response.status !== 200) {
      console.error("subscribe_upstream_rejected", response.status);
      return subscriptionResponse(502, { error: "unavailable" });
    }
    return subscriptionResponse(200, { ok: true });
  } catch (err) {
    console.error("subscribe_failed:", err && err.message ? err.message : err);
    return subscriptionResponse(502, { error: "unavailable" });
  }
}

async function engagementResponse(request, env, ctx) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: SECURITY_HEADERS });
  if (cookieFrom(request, "orbi_internal") === "1") {
    return new Response(null, { status: 204, headers: SECURITY_HEADERS });
  }
  let event;
  try {
    event = await request.json();
  } catch {
    return new Response(null, { status: 400, headers: SECURITY_HEADERS });
  }
  const kind = event?.kind;
  const detail = event?.detail;
  const valid = ENGAGEMENT_KINDS.has(kind)
    && (kind === "visit" ? detail === undefined && typeof event.search === "string" && typeof event.referrer === "string"
      : kind === "engaged" ? detail === undefined
        : kind === "cta_click" || kind === "section_view" ? typeof detail === "string" && ENGAGEMENT_DETAIL.test(detail)
          : typeof detail === "string" && SCROLL_DEPTHS.has(detail));
  if (!valid) return new Response(null, { status: 400, headers: SECURITY_HEADERS });

  const path = typeof event.path === "string" && event.path.startsWith("/")
    ? event.path.slice(0, 200)
    : new URL(request.url).pathname;
  const payload = { kind, path };
  if (kind === "visit") {
    payload.ref = visitRef(path, event.search, event.referrer, request.url);
    // Issue #844: the raw landing evidence travels with the visit so cloud
    // stores it verbatim (orbi-cloud#1831) — record is record, display is
    // display. Cloud ignores fields it does not know, so either side can
    // deploy first. Only length is capped; no lowercasing, parsing, or
    // filtering, and the derived ref above stays the only normalized value.
    payload.raw_query = event.search.slice(0, RAW_LANDING_MAX_LENGTH);
    payload.raw_referrer = event.referrer.slice(0, RAW_LANDING_MAX_LENGTH);
  } else if (kind !== "engaged") {
    payload.detail = detail;
  }
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

function internalCookieString(value) {
  const enabled = value === "1";
  return `orbi_internal=${enabled ? "1" : ""}; Path=/; Max-Age=${enabled ? 31536000 : 0}; SameSite=Lax; Secure`;
}

// Same fallback chain as the cloud signup source (orbi-cloud#716), so the
// website's first-touch answer and the signup's own normalization agree:
// validated ?ref= token, then ?utm_source=, then ?source= host, then referer
// host, then direct.
const REF_TOKEN = /^[a-z0-9_-]{1,32}$/;
const SOURCE_HOST = /^[a-z0-9.-]{1,253}$/;

function isInternalHost(host) {
  return host === "orbi.build" || host.endsWith(".orbi.build");
}

function refererHost(request) {
  const value = request.headers.get("Referer");
  if (value === null) {
    return null;
  }
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (url.protocol === "http:" || url.protocol === "https:") && SOURCE_HOST.test(host) && !isInternalHost(host) ? host : null;
  } catch {
    return null;
  }
}

function normalizedSource(url, request) {
  const ref = url.searchParams.get("ref");
  if (ref !== null && REF_TOKEN.test(ref.toLowerCase())) {
    return ref.toLowerCase();
  }
  const utmSource = url.searchParams.get("utm_source")?.toLowerCase();
  if (utmSource !== undefined && (REF_TOKEN.test(utmSource) || SOURCE_HOST.test(utmSource)) && !isInternalHost(utmSource)) {
    return utmSource;
  }
  const source = url.searchParams.get("source")?.toLowerCase();
  if (source !== undefined && SOURCE_HOST.test(source)) {
    return source;
  }
  return refererHost(request) ?? "direct";
}

function visitRef(path, search, referrer, requestUrl) {
  const pageUrl = new URL(`${path}${search}`, requestUrl);
  const validRef = pageUrl.searchParams.get("ref");
  if (validRef !== null && REF_TOKEN.test(validRef.toLowerCase())) return validRef.toLowerCase();

  let internal = false;
  if (referrer) {
    try {
      internal = isInternalHost(new URL(referrer).hostname.toLowerCase());
    } catch {
      // Invalid referrers are treated like absent referrers by normalizedSource.
    }
  }
  if (internal) return "";
  const referrerRequest = new Request(requestUrl, { headers: { Referer: referrer } });
  return normalizedSource(pageUrl, referrerRequest);
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
// The browser event's request comes along so bot signals are computed inside
// the waitUntil branch — the response path stays synchronous and the browser
// receives a 204 even when reporting fails.
async function reportVisit(env, visitRequest, payload) {
  try {
    const signals = await visitSignals(visitRequest, payload, env.VISITOR_EVENTS_DB);
    if (signals.is_bot === 1) {
      console.log(JSON.stringify({
        evt: "visit_dropped",
        reason: "bot",
        kind: payload.kind,
        asn: signals.asn,
        ua_hash: signals.ua_hash,
      }));
      return;
    }
    const request = new Request(env.CLOUD_VISIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WEBSITE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...payload, ...signals }),
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
// - Derived sources (?utm_source=, ?source=, referer host, direct) are
//   guesses an OAuth bounce or an in-site hop can fabricate, so they are
//   first touch: they fill an empty slot and never overwrite — github.com
//   must not replace the tweet that brought the visitor here.
// Probes and crawlers keep their vid and their page; browser events from them
// are dropped after the maintained ASN/UA checks. The response body is never
// rewritten, so asset validators like ETag survive. Visits are reported by
// page JavaScript, not by this response wrapper.
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
  const internal = url.searchParams.get("internal");
  const internalCookie = internal === "1" || internal === "0" ? internal : null;
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
  const seedsRef = explicitRef !== null || (existingRef === null && source !== "direct");
  if (!firstTouch && !seedsRef && internalCookie === null) {
    return response;
  }
  const stamped = new Response(response.body, response);
  if (internalCookie !== null) {
    stamped.headers.append("Set-Cookie", internalCookieString(internalCookie));
  }
  if (firstTouch) {
    stamped.headers.append("Set-Cookie", attributionCookieString("vid", vid, secure));
  }
  if (seedsRef) {
    stamped.headers.append("Set-Cookie", attributionCookieString("ref", explicitRef ?? source, secure));
  }
  return stamped;
}

export { assetResponse, cloudLoginResponse, fetchAsset, fillHomepageStats, githubHeaders, handleFetch, loadFoundingAvatars, loadStats, PROD_HOSTS, statsResponse, subscribeResponse, trailingSlashRedirect };

export default {
  // Third arg (ctx) carries waitUntil: the visit attribution report rides
  // ctx.waitUntil, so it never delays the response. withAttribution runs at
  // the wrapper exit so every handleFetch return — pages, redirects, worker
  // routes — is covered (Issue #228).
  fetch: async (request, env, ctx) => {
    const response = await handleFetch(request, env, ctx);
    const attributed = withAttribution(request, response, env, ctx);
    if (PROD_HOSTS.has(new URL(request.url).hostname)) return attributed;
    const stamped = new Response(attributed.body, attributed);
    stamped.headers.set("X-Robots-Tag", TEST_NOINDEX);
    return stamped;
  },
};
