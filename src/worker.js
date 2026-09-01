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

    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
  },
};
