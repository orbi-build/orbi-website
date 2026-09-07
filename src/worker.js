import { withAICrawlerTracking } from "@datafast/ai-crawl";

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

// /api/apply is an unauthenticated write into D1: bound the body and every
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

// Issue #16: orbi-cloud's model-config contract path, proxied. The browser
// never calls orbi-cloud directly (its base URL is deploy-time configuration
// and no credential may live in page code), so the Worker forwards the same
// path bytes to env.ORBI_CLOUD_API. Status and JSON body pass through
// untouched: 400/404/500 semantics — including details.field/reason — belong
// to orbi-cloud.
const MODEL_CONFIG_PATH = /^\/api\/tenants\/([^/]+)\/model-config$/;

async function handleModelConfig(request, env, url) {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  const base = String(env.ORBI_CLOUD_API || "").replace(/\/+$/, "");
  if (!base) {
    return new Response(JSON.stringify({ error: "orbi-cloud API is not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  // The POST body carries the tenant's apiKey: bound it like /api/apply and
  // forward it verbatim — this path never parses, logs, or rewrites it.
  let body = null;
  if (request.method === "POST") {
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "payload too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
      });
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "payload too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
      });
    }
    body = raw;
  }
  const headers = { Accept: "application/json", "Cache-Control": "no-cache" };
  // orbi-cloud authorizes its tenant APIs; when it wants a service caller to
  // identify itself (the /dispatch DISPATCH_SECRET pattern), the token is a
  // Worker secret, never page code.
  if (env.ORBI_CLOUD_TOKEN) {
    headers.Authorization = `Bearer ${env.ORBI_CLOUD_TOKEN}`;
  }
  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }
  let upstream;
  try {
    upstream = await fetch(base + url.pathname, {
      method: request.method,
      headers,
      body,
    });
  } catch (err) {
    // Method and path only — the body is the tenant's API key and must
    // never reach the Worker logs.
    console.error("model_config_upstream_failed " + request.method + " " + url.pathname);
    return new Response(JSON.stringify({ error: "orbi-cloud unreachable" }), {
      status: 502,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  const payload = await upstream.text();
  // no-store: GET responses carry the (masked) config and must not be cached
  // at any layer.
  return new Response(payload, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    },
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

    if (url.pathname === "/api/apply") {
      return await handleApply(request, env);
    }

    if (MODEL_CONFIG_PATH.test(url.pathname)) {
      return await handleModelConfig(request, env, url);
    }

    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
}

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
