const HOST_ALIASES = {
  "www.orbi.build": "orbi.build",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const GH = "https://api.github.com";
const STATS_CACHE_KEY = "https://orbi.build/__stats";
const STATS_TTL_MS = 300000;

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

async function ghJson(path, token) {
  const response = await fetch(`${GH}${path}`, { headers: githubHeaders(token) });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`github ${response.status} ${path}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

async function loadStats(token) {
  const repo = "orbi-build/orbi";
  const [meta, closed, merged, releases] = await Promise.all([
    ghJson(`/repos/${repo}`, token),
    ghJson(`/search/issues?q=${encodeURIComponent(`repo:${repo} type:issue state:closed`)}`, token),
    ghJson(`/search/issues?q=${encodeURIComponent(`repo:${repo} is:pr is:merged`)}`, token),
    ghJson(`/repos/${repo}/releases?per_page=100`, token),
  ]);
  return {
    started: meta.created_at,
    issues_closed: closed.total_count,
    prs_merged: merged.total_count,
    releases: Array.isArray(releases) ? releases.length : 0,
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
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  const name = String(body.name || "").trim();
  const tg = String(body.tg || "").trim();
  const email = String(body.email || "").trim();
  const agentTools = String(body.agent_tools || "").trim();
  const role = String(body.role || "").trim();
  const scenario = String(body.scenario || "").trim();
  const pain = String(body.pain || "").trim();
  if (!name || !tg || !scenario) {
    return new Response(JSON.stringify({ error: "name, tg and scenario are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
  await env.orbi_applications.prepare(
    "INSERT INTO applications (name, tg, email, agent_tools, role, scenario, pain) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(name, tg, email, agentTools, role, scenario, pain).run();
  return new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const canonicalHost = HOST_ALIASES[url.hostname];
    if (canonicalHost) {
      return Response.redirect(
        `https://${canonicalHost}${url.pathname}${url.search}`,
        301,
      );
    }

    if (url.pathname === "/stats") {
      try {
        return await statsResponse(request, env.GITHUB_TOKEN);
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err.message || err) }), {
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

    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
  },
};
