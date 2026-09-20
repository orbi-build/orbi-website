import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { assetResponse, cloudLoginResponse, fetchAsset, githubHeaders, handleFetch, loadStats, PROD_HOSTS, statsResponse, trailingSlashRedirect } from "../src/worker.js";

describe("Worker request helpers", () => {
  it("serves the ai-ready browser page and badge while preserving curl install", async () => {
    const assets = {
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/install.sh") return new Response("#!/usr/bin/env bash\necho install\n");
        if (path === "/aiready/" || path === "/aiready/zh/") {
          return new Response(`<html><head><title>ai-ready</title></head><body>${path.includes("/zh/") ? "12 factors 中文" : "12 factors"}</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        if (path === "/aiready/index.html") return Response.redirect("https://aiready.sh/aiready/", 307);
        if (path === "/aiready/zh/index.html") return Response.redirect("https://aiready.sh/aiready/zh/", 307);
        if (path === "/badge.svg") return new Response("<svg>ai-ready 12 factors</svg>", { headers: { "Content-Type": "image/svg+xml" } });
        return new Response("missing", { status: 404 });
      },
    };
    const browser = await handleFetch(new Request("https://aiready.sh/", { headers: { Accept: "text/html" } }), { ASSETS: assets });
    expect(browser.status).toBe(200);
    expect(await browser.text()).toContain("12 factors");
    const curl = await handleFetch(new Request("https://aiready.sh/", { headers: { Accept: "*/*" } }), { ASSETS: assets });
    expect(curl.status).toBe(200);
    expect((await curl.text()).split("\n", 1)[0]).toBe("#!/usr/bin/env bash");
    const zh = await handleFetch(new Request("https://aiready.sh/zh/", { headers: { Accept: "text/html" } }), { ASSETS: assets });
    expect(zh.status).toBe(200);
    const badge = await handleFetch(new Request("https://aiready.sh/badge.svg"), { ASSETS: assets });
    expect(badge.status).toBe(200);
    expect(badge.headers.get("content-type")).toContain("image/svg+xml");
    expect(badge.headers.get("cache-control")).toContain("max-age");
  });

  it("serves the comparison CSV asset with its text/csv content type", async () => {
    const response = await handleFetch(
      new Request("https://orbi.build/compare/matrix.csv"),
      { ASSETS: { fetch: async () => new Response("product,verified\\nOrbi,2026-09-17", { headers: { "Content-Type": "text/csv; charset=utf-8" } }) } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/csv/);
  });

  it("fails closed when an asset unexpectedly redirects", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await assetResponse(Response.redirect("https://example.com/page/", 307), false);
      expect(response.status).toBe(500);
      expect(error).toHaveBeenCalledWith("asset_redirect_unexpected", 307);
    } finally {
      error.mockRestore();
    }
  });

  // Production 2026-09-18: orbi.build/cloud (no trailing slash) answered 500
  // "asset redirect unexpectedly reached the Worker". The Assets binding
  // canonicalises /cloud to /cloud/ with a 307; that one is ours to pass on.
  it("passes the Assets binding's trailing-slash redirect on as a 308", async () => {
    const assets = {
      fetch: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/cloud") return Response.redirect(`${url.origin}/cloud/`, 307);
        return new Response("<html><head><title>Cloud</title></head><body>cloud</body></html>", { headers: { "Content-Type": "text/html" } });
      },
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await handleFetch(new Request("https://orbi.build/cloud?x=1"), { ASSETS: assets, CLOUD_LOGIN_URL: "https://orbi.build/api/login" });
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe("/cloud/?x=1");
      expect(response.headers.get("X-Frame-Options")).toBeTruthy();
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it("does not treat a cross-origin or non-slash redirect as canonicalisation", () => {
    const url = new URL("https://orbi.build/cloud");
    expect(trailingSlashRedirect(Response.redirect("https://example.com/cloud/", 307), url)).toBeNull();
    expect(trailingSlashRedirect(Response.redirect("https://orbi.build/other/", 307), url)).toBeNull();
    expect(trailingSlashRedirect(new Response("ok", { status: 200 }), url)).toBeNull();
  });

  it("falls back to an index asset for directory URLs", async () => {
    const requests = [];
    const assets = {
      fetch: async (request) => {
        requests.push(request.url);
        return new Response(request.url.endsWith("/index.html") ? "ok" : "missing", {
          status: request.url.endsWith("/index.html") ? 200 : 404,
        });
      },
    };

    const response = await fetchAsset(new Request("https://beta.orbi.build/compare/"), assets);

    expect(response.status).toBe(200);
    expect(requests).toEqual([
      "https://beta.orbi.build/compare/",
      "https://beta.orbi.build/compare/index.html",
    ]);
  });

  it("redirects Cloud login without forwarding tenant query parameters", async () => {
    const response = cloudLoginResponse(
      new Request("https://orbi.build/cloud/login?tenant=untrusted"),
      "https://beta.orbi.build/api/login",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://beta.orbi.build/api/login");
  });

  it("routes the website login handoff to the configured Cloud URL", async () => {
    const response = await handleFetch(
      new Request("https://orbi.build/cloud/login?tenant=untrusted"),
      { CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login", ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) } },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://beta.orbi.build/api/login");
  });

  // Issue #134: users and clients append the site's natural trailing slash
  // (every page lives at /…/), so /cloud/login/ must behave exactly like
  // /cloud/login — the configured 302 when CLOUD_LOGIN_URL exists, the same
  // fail-closed 503 page where it does not — never the asset fallback's 404.
  it("serves /cloud/login/ identically to /cloud/login in both configurations (Issue #134)", async () => {
    for (const pathname of ["/cloud/login", "/cloud/login/"]) {
      const configured = await handleFetch(
        new Request(`https://beta.orbi.build${pathname}?tenant=untrusted`),
        { CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login", ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) } },
      );
      expect(configured.status).toBe(302);
      expect(configured.headers.get("location")).toBe("https://beta.orbi.build/api/login");

      const unconfigured = await handleFetch(
        new Request(`https://beta.orbi.build${pathname}`, {
          headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
        }),
        { ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) } },
      );
      expect(unconfigured.status).toBe(503);
      expect(unconfigured.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
      expect(await unconfigured.text()).toContain("Cloud is temporarily unavailable");
    }
  });

  it("opens the production gate: 302s /cloud/login to the production control plane and keeps the shipped CTAs (Issue #96)", async () => {
    const cloudLoginUrl = "https://orbi.build/api/login";
    const login = await handleFetch(
      new Request("https://orbi.build/cloud/login"),
      { CLOUD_LOGIN_URL: cloudLoginUrl, ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) } },
    );
    expect(login.status).toBe(302);
    expect(login.headers.get("location")).toBe(cloudLoginUrl);

    const html = '<a data-cta="cloud-start" href="/cloud/login?ref=home-hero">Start Cloud with GitHub</a>';
    const page = await handleFetch(
      new Request("https://orbi.build/"),
      {
        CLOUD_LOGIN_URL: cloudLoginUrl,
        ASSETS: {
          fetch: () => Promise.resolve(new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })),
        },
      },
    );
    const body = await page.text();
    expect(body).toContain('href="/cloud/login?ref=home-hero"');
    expect(body).not.toContain('href="https://docs.orbi.build"');
  });

  // Links already in the wild (cached HTML, bookmarks, shares, search index)
  // reach this route directly and never pass through the assetResponse CTA
  // rewrite, so the 503 itself must carry the exits a browser needs.
  it("answers a browser hit on /cloud/login with a readable 503 page, not bare JSON (Issue #115)", async () => {
    const response = await handleFetch(
      new Request("https://orbi.build/cloud/login", {
        headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      }),
      { ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) } },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    const html = await response.text();
    expect(html).toContain("Cloud is temporarily unavailable");
    expect(html).not.toContain('href="/apply"');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="https://docs.orbi.build"');
  });

  it("keeps the JSON 503 for API clients via content negotiation (Issue #115)", async () => {
    const response = await handleFetch(
      new Request("https://orbi.build/cloud/login", { headers: { Accept: "application/json" } }),
      { ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) } },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Cloud is temporarily unavailable" });
  });

  it("fail-closes the login route with 503 when CLOUD_LOGIN_URL is absent (Issue #77)", async () => {
    const response = await handleFetch(
      new Request("https://orbi.build/cloud/login"),
      { ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) } },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toContain("text/html");
  });

  it("serves pages with the Cloud CTA rewritten to the self-host docs when Cloud is not configured", async () => {
    // The shipped hrefs carry ?ref= tokens (Issue #256); the rewrite must
    // catch the ref form as well as the bare form, or an unconfigured
    // environment ships dead-end CTAs again (Issue #179).
    const html = '<a class="nav-apply" href="/cloud/login?ref=nav">Start Cloud</a>'
      + '<a data-cta="cloud-start" href="/cloud/login?ref=home-hero">Start Cloud with GitHub</a>';
    const response = await handleFetch(
      new Request("https://orbi.build/"),
      {
        ASSETS: {
          fetch: () => Promise.resolve(new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8", Etag: '"asset-1"' },
          })),
        },
      },
    );
    const body = await response.text();
    expect(body).not.toMatch(/href="\/cloud\/login/);
    expect(body).toContain('href="https://docs.orbi.build"');
    expect(body).not.toContain('href="/apply"');
    // A rewritten body is a new representation: the asset file's validators
    // must not answer conditional requests for it.
    expect(response.headers.get("etag")).toBeNull();
  });

  it("serves pages unchanged when Cloud login is configured", async () => {
    const html = '<a data-cta="cloud-start" href="/cloud/login?ref=home-hero">Start Cloud with GitHub</a>';
    const response = await handleFetch(
      new Request("https://beta.orbi.build/"),
      {
        CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login",
        ASSETS: {
          fetch: () => Promise.resolve(new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })),
        },
      },
    );
    expect(await response.text()).toContain('href="/cloud/login?ref=home-hero"');
  });

  it("builds authenticated GitHub API headers", () => {
    expect(githubHeaders("token")).toEqual({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer token",
      "User-Agent": "orbi-website",
    });
  });

  it("rejects a missing GitHub token", () => {
    expect(() => githubHeaders()).toThrow("GITHUB_TOKEN is not configured");
  });
});

// Issue #101: the LIVE block proves "Orbi builds Orbi" per repository, so
// /stats must answer one group per repo — never a merged total. The shape
// below is the frontend contract demo.js renders.
describe("per-repo GitHub stats (Issue #101)", () => {
  const realFetch = globalThis.fetch;
  const realCaches = globalThis.caches;
  afterEach(() => {
    globalThis.fetch = realFetch;
    globalThis.caches = realCaches;
  });

  function jsonResponse(data) {
    return new Response(JSON.stringify(data), { status: 200 });
  }

  // Route-matched GitHub double: every call the worker makes is served from
  // the per-repo fixtures, and the calls are recorded so tests can assert
  // exactly which endpoints a (cache) state touched.
  function mockGitHub(overrides = {}) {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      const path = new URL(url).pathname;
      const query = new URL(url).searchParams.get("q") || "";
      const fail = (repo) => overrides.fail && overrides.fail.includes(repo);
      if (path.startsWith("/search/issues")) {
        const repo = query.includes("orbi-website") ? "orbi-website" : query.includes("orbi-cloud") ? "orbi-cloud" : "orbi";
        if (fail(repo)) return new Response("rate limited", { status: 403 });
        return jsonResponse({ total_count: query.includes("is:pr") ? 296 : 372 });
      }
      for (const repo of ["orbi-website", "orbi-cloud", "orbi"]) {
        if (path === `/repos/orbi-build/${repo}`) {
          if (fail(repo)) return new Response("not found", { status: 500 });
          return jsonResponse({ created_at: "2026-08-24T16:08:33Z", stargazers_count: 95 });
        }
        if (path === `/repos/orbi-build/${repo}/releases`) {
          if (fail(repo)) return new Response("not found", { status: 500 });
          return jsonResponse([{ id: 1 }, { id: 2 }, { id: 3 }]);
        }
        if (path === `/repos/orbi-build/${repo}/stargazers`) {
          return jsonResponse([{ starred_at: "2026-09-01T00:00:00Z" }, { starred_at: "2026-09-02T00:00:00Z" }]);
        }
        if (path === `/repos/orbi-build/${repo}/actions/workflows/deploy-beta.yml/runs`) {
          return jsonResponse({ total_count: 37 });
        }
        if (path === `/repos/orbi-build/${repo}/actions/workflows/deploy-production.yml/runs`) {
          return jsonResponse({ total_count: 4 });
        }
      }
      throw new Error("unexpected GitHub call: " + url);
    };
    return calls;
  }

  it("answers with one group per repository, each repo on its own real numbers", async () => {
    const calls = mockGitHub();
    const stats = await loadStats("token");
    expect(Object.keys(stats.repos).sort()).toEqual(["orbi", "orbi-cloud", "orbi-website"]);
    for (const repo of ["orbi", "orbi-website", "orbi-cloud"]) {
      expect(stats.repos[repo]).toMatchObject({
        started: "2026-08-24T16:08:33Z",
        issues_closed: 372,
        prs_merged: 296,
        releases: 3,
        stars: 95,
      });
    }
    // The bootstrap argument needs the search API's merged-PR counts from all
    // three repos, so the queries must name each one.
    const searchQueries = calls
      .filter((url) => url.includes("/search/issues"))
      .map((url) => new URL(url).searchParams.get("q"));
    for (const repo of ["orbi", "orbi-website", "orbi-cloud"]) {
      expect(searchQueries.some((q) => q.includes(`repo:orbi-build/${repo} is:pr is:merged`))).toBe(true);
    }
  });

  it("counts orbi-website's successful deploy workflow runs, its fourth metric in place of releases", async () => {
    const calls = mockGitHub();
    const stats = await loadStats("token");
    expect(stats.repos["orbi-website"].deploys).toBe(41);
    expect(calls.some((url) => url.includes("deploy-beta.yml/runs") && url.includes("status=success"))).toBe(true);
    expect(calls.some((url) => url.includes("deploy-production.yml/runs") && url.includes("status=success"))).toBe(true);
  });

  it("keeps the star-history curve on the flagship repo only", async () => {
    const calls = mockGitHub();
    const stats = await loadStats("token");
    expect(stats.repos.orbi.star_history).toHaveLength(2);
    expect(stats.repos["orbi-website"].star_history).toEqual([]);
    expect(stats.repos["orbi-cloud"].star_history).toEqual([]);
    expect(calls.filter((url) => url.includes("/stargazers")).every((url) => url.includes("/repos/orbi-build/orbi/"))).toBe(true);
  });

  it("degrades only the failing repo to null; the other two groups stay live", async () => {
    mockGitHub({ fail: ["orbi-cloud"] });
    const stats = await loadStats("token");
    expect(stats.repos["orbi-cloud"]).toBeNull();
    expect(stats.repos.orbi.issues_closed).toBe(372);
    expect(stats.repos["orbi-website"].prs_merged).toBe(296);
  });

  it("serves a cache hit without calling GitHub again", async () => {
    const calls = mockGitHub();
    const store = new Map();
    // Cache.match hands back a fresh Response every time — model that, or a
    // second read of the same body would fail where the real cache succeeds.
    globalThis.caches = {
      default: {
        match: (key) => {
          const body = store.get(String(key));
          return Promise.resolve(body === undefined ? undefined : new Response(body));
        },
        put: async (key, response) => {
          store.set(String(key), await response.text());
        },
      },
    };
    const request = new Request("https://orbi.build/stats");
    const first = await statsResponse(request, "token");
    const callsAfterFirst = calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    const second = await statsResponse(request, "token");
    expect(calls).toHaveLength(callsAfterFirst);
    expect(await second.json()).toEqual(await first.json());
  });

  // Issue #134: /stats/ is the same endpoint with the site's natural trailing
  // slash; it must answer the same JSON, never fall through to the assets 404.
  it("answers /stats/ with the same payload as /stats, without touching assets", async () => {
    mockGitHub();
    globalThis.caches = {
      default: {
        match: () => Promise.resolve(undefined),
        put: async () => {},
      },
    };
    const env = {
      GITHUB_TOKEN: "token",
      ASSETS: { fetch: () => Promise.resolve(new Response("missing", { status: 404 })) },
    };
    const bare = await handleFetch(new Request("https://orbi.build/stats"), env);
    const slashed = await handleFetch(new Request("https://orbi.build/stats/"), env);
    expect(bare.status).toBe(200);
    expect(slashed.status).toBe(bare.status);
    expect(await slashed.json()).toEqual(await bare.json());
  });
});

// Issue #173: curl orbi.build/status prints the real delivery counts as
// pasteable plaintext. Data still comes from loadStats(); this is only a
// terminal rendering of that existing payload.
describe("plaintext /status (Issue #173)", () => {
  const realFetch = globalThis.fetch;
  const realCaches = globalThis.caches;
  afterEach(() => {
    globalThis.fetch = realFetch;
    globalThis.caches = realCaches;
  });

  function jsonResponse(data) {
    return new Response(JSON.stringify(data), { status: 200 });
  }

  function mockGitHub(overrides = {}) {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      const path = new URL(url).pathname;
      const query = new URL(url).searchParams.get("q") || "";
      const fail = (repo) => overrides.fail && overrides.fail.includes(repo);
      if (path.startsWith("/search/issues")) {
        const repo = query.includes("orbi-website") ? "orbi-website" : query.includes("orbi-cloud") ? "orbi-cloud" : "orbi";
        if (fail(repo)) return new Response("rate limited", { status: 403 });
        return jsonResponse({ total_count: query.includes("is:pr") ? 296 : 372 });
      }
      for (const repo of ["orbi-website", "orbi-cloud", "orbi"]) {
        if (path === `/repos/orbi-build/${repo}`) {
          if (fail(repo)) return new Response("not found", { status: 500 });
          return jsonResponse({ created_at: "2026-08-24T16:08:33Z", stargazers_count: 95 });
        }
        if (path === `/repos/orbi-build/${repo}/releases`) {
          if (fail(repo)) return new Response("not found", { status: 500 });
          return jsonResponse([{ id: 1 }, { id: 2 }, { id: 3 }]);
        }
        if (path === `/repos/orbi-build/${repo}/stargazers`) {
          return jsonResponse([{ starred_at: "2026-09-01T00:00:00Z" }, { starred_at: "2026-09-02T00:00:00Z" }]);
        }
        if (path === `/repos/orbi-build/${repo}/actions/workflows/deploy-beta.yml/runs`) {
          return jsonResponse({ total_count: 37 });
        }
        if (path === `/repos/orbi-build/${repo}/actions/workflows/deploy-production.yml/runs`) {
          return jsonResponse({ total_count: 4 });
        }
      }
      throw new Error("unexpected GitHub call: " + url);
    };
    return calls;
  }

  function emptyCache() {
    globalThis.caches = {
      default: {
        match: () => Promise.resolve(undefined),
        put: async () => {},
      },
    };
  }

  function statusEnv() {
    return {
      GITHUB_TOKEN: "token",
      ASSETS: { fetch: () => Promise.resolve(new Response("missing", { status: 404 })) },
    };
  }

  function curlStatus(url = "https://orbi.build/status") {
    return handleFetch(
      new Request(url, { headers: { Accept: "*/*" } }),
      statusEnv(),
    );
  }

  it("answers curl Accept: */* with 200 text/plain, ≤72 columns, no ANSI", async () => {
    mockGitHub();
    emptyCache();
    const response = await curlStatus();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/^text\/plain/);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    const body = await response.text();
    for (const line of body.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(72);
    }
    expect(body).not.toContain("\x1b");
    expect(body).not.toContain("\t");
    expect(body).toContain("Orbi — GitHub Issue in, tagged Release out");
    expect(body).toMatch(/orbi\s+issues closed\s+372\s+PRs merged\s+296\s+releases\s+3/);
    expect(body).toContain("orbi-website");
    expect(body).toContain("orbi-cloud");
    expect(body).toContain("curl -fsSL aiready.sh | sh");
    expect(body).not.toContain("orbi.build/install.sh");
    expect(body).toContain("https://docs.orbi.build");
  });

  it("serves /status/ identically to /status", async () => {
    mockGitHub();
    emptyCache();
    const bare = await curlStatus("https://orbi.build/status");
    const slashed = await curlStatus("https://orbi.build/status/");
    expect(slashed.status).toBe(bare.status);
    expect(slashed.headers.get("Content-Type")).toBe(bare.headers.get("Content-Type"));
    expect(await slashed.text()).toBe(await bare.text());
  });

  it("does not return text/plain when Accept includes text/html", async () => {
    const env = {
      ASSETS: {
        fetch: () => Promise.resolve(new Response("<!doctype html>status page", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })),
      },
    };
    const response = await handleFetch(
      new Request("https://orbi.build/status", {
        headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      }),
      env,
    );
    expect(response.headers.get("Content-Type")).not.toMatch(/^text\/plain/);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(await response.text()).toContain("status page");
  });

  it("degrades a failing repo to unavailable and still answers 200", async () => {
    mockGitHub({ fail: ["orbi-cloud"] });
    emptyCache();
    const response = await curlStatus();
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toMatch(/orbi-cloud\s+unavailable/);
    expect(body).toMatch(/orbi\s+issues closed\s+372/);
    expect(body).toMatch(/orbi-website\s+issues closed\s+372/);
    for (const line of body.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(72);
    }
  });

  it("answers 503 when every repo is unavailable", async () => {
    mockGitHub({ fail: ["orbi", "orbi-website", "orbi-cloud"] });
    emptyCache();
    const response = await curlStatus();
    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toMatch(/^text\/plain/);
    const body = await response.text();
    expect(body).toMatch(/orbi\s+unavailable/);
    expect(body).toMatch(/orbi-website\s+unavailable/);
    expect(body).toMatch(/orbi-cloud\s+unavailable/);
    expect(body).not.toContain("\x1b");
  });

  it("serves a cache hit without calling GitHub again", async () => {
    const calls = mockGitHub();
    const store = new Map();
    globalThis.caches = {
      default: {
        match: (key) => {
          const body = store.get(String(key));
          return Promise.resolve(body === undefined ? undefined : new Response(body));
        },
        put: async (key, response) => {
          store.set(String(key), await response.text());
        },
      },
    };
    const first = await curlStatus();
    const callsAfterFirst = calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(first.status).toBe(200);
    const second = await curlStatus();
    expect(calls).toHaveLength(callsAfterFirst);
    expect(await second.text()).toBe(await first.text());
  });

  it("does not reuse the /stats JSON cache body", async () => {
    mockGitHub();
    const store = new Map();
    globalThis.caches = {
      default: {
        match: (key) => {
          const body = store.get(String(key));
          return Promise.resolve(body === undefined ? undefined : new Response(body));
        },
        put: async (key, response) => {
          store.set(String(key), await response.text());
        },
      },
    };
    const stats = await handleFetch(new Request("https://orbi.build/stats"), statusEnv());
    expect(stats.status).toBe(200);
    expect(await stats.json()).toHaveProperty("repos");
    const status = await curlStatus();
    expect(status.status).toBe(200);
    expect(status.headers.get("Content-Type")).toMatch(/^text\/plain/);
    const body = await status.text();
    expect(body.startsWith("{")).toBe(false);
    expect(body).toMatch(/issues closed/);
  });
});

describe("retired apply routes (Issue #179)", () => {
  const env = {
    ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) },
  };

  it("301s GET /apply and /apply/ to /cloud/ on the request host", async () => {
    for (const [url, location] of [
      ["https://orbi.build/apply", "https://orbi.build/cloud/"],
      ["https://orbi.build/apply/", "https://orbi.build/cloud/"],
      ["https://beta.orbi.build/apply", "https://beta.orbi.build/cloud/"],
      ["https://beta.orbi.build/apply/", "https://beta.orbi.build/cloud/"],
    ]) {
      const response = await handleFetch(new Request(url), env);
      expect(response.status, url).toBe(301);
      expect(response.headers.get("location"), url).toBe(location);
    }
  });

  it("answers 410 on POST /cloud/apply and the trailing-slash form", async () => {
    for (const url of [
      "https://beta.orbi.build/cloud/apply",
      "https://beta.orbi.build/cloud/apply/",
      "https://orbi.build/cloud/apply",
    ]) {
      const response = await handleFetch(
        new Request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tg: "@ada", scenario: "ship our first Issue" }),
        }),
        env,
      );
      expect(response.status, url).toBe(410);
      expect(await response.json()).toEqual({ error: "gone" });
    }
  });

  it("answers 410 on GET /cloud/apply too — the form is gone, not method-gated", async () => {
    const response = await handleFetch(new Request("https://beta.orbi.build/cloud/apply"), env);
    expect(response.status).toBe(410);
  });

  it("no longer handles POST /api/apply: the cloud control plane owns /api* on the shared beta host", async () => {
    // Issue #76: live beta answered POST /api/apply with cloud's 404
    // (x-orbi-worker: orbi-cloud-control-plane-e2e). The website must not
    // define the path at all; the request falls through to the static assets.
    const assets = {
      ASSETS: { fetch: () => Promise.resolve(new Response("missing", { status: 404 })) },
    };
    const response = await handleFetch(
      new Request("https://beta.orbi.build/api/apply", { method: "POST", body: "{}" }),
      assets,
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("missing");
  });
});

// Issue #165: /pricing is the URL visitors type and crawlers guess. It is a
// permanent alias of the /cloud/ PRICING section — never its own page.
describe("/pricing alias (Issue #165)", () => {
  const env = {
    ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) },
  };

  it.each([
    ["https://orbi.build/pricing", "https://orbi.build/cloud/#pricing"],
    ["https://orbi.build/pricing/", "https://orbi.build/cloud/#pricing"],
    ["https://beta.orbi.build/pricing", "https://beta.orbi.build/cloud/#pricing"],
    ["https://beta.orbi.build/pricing/", "https://beta.orbi.build/cloud/#pricing"],
    ["https://orbi.build/zh/pricing", "https://orbi.build/zh/cloud/#pricing"],
    ["https://orbi.build/zh/pricing/", "https://orbi.build/zh/cloud/#pricing"],
    ["https://beta.orbi.build/zh/pricing", "https://beta.orbi.build/zh/cloud/#pricing"],
    ["https://beta.orbi.build/zh/pricing/", "https://beta.orbi.build/zh/cloud/#pricing"],
  ])("301s %s to the pricing section on the same host", async (from, to) => {
    const response = await handleFetch(new Request(from), env);
    expect(response.status).toBe(301);
    const location = response.headers.get("location");
    expect(location).toBe(to);
    expect(location.endsWith(from.includes("/zh/") ? "/zh/cloud/#pricing" : "/cloud/#pricing")).toBe(true);
  });
});

// Issue #195: aiready.sh is the curl install entry and browser methodology page.
// The script and HTML bytes come from env.ASSETS, never copies inside the worker.
describe("aiready.sh install entry (Issue #174)", () => {
  const INSTALL_SH = "#!/usr/bin/env bash\n# aiready-test-fixture\n";
  const env = {
    ASSETS: {
      fetch: async (request) => {
        const { pathname } = new URL(request.url);
        if (pathname === "/install.sh") {
          return new Response(INSTALL_SH, {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        if (pathname === "/aiready/" || pathname === "/aiready/zh/") {
          return new Response(`<html><head><title>ai-ready</title></head><body>${pathname.includes("/zh/") ? "12 factors 中文" : "12 factors"}</body></html>`, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        if (pathname === "/aiready/index.html") {
          return Response.redirect("https://aiready.sh/aiready/", 307);
        }
        if (pathname === "/aiready/zh/index.html") {
          return Response.redirect("https://aiready.sh/aiready/zh/", 307);
        }
        if (pathname === "/robots.txt") {
          return new Response("User-agent: *\nAllow: /\n", {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        return new Response("missing", { status: 404 });
      },
    },
  };

  it("serves install.sh as text/plain for curl Accept */* on /", async () => {
    const response = await handleFetch(
      new Request("https://aiready.sh/", { headers: { Accept: "*/*" } }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/^text\/plain/);
    const body = await response.text();
    expect(body.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(body).toBe(INSTALL_SH);
  });

  it("serves the ai-ready page for a browser Accept text/html", async () => {
    const response = await handleFetch(
      new Request("https://aiready.sh/", {
        headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
    expect(await response.text()).toContain("<title>ai-ready</title>");
  });

  it("serves the ai-ready page for a browser in Chinese", async () => {
    const response = await handleFetch(
      new Request("https://aiready.sh/zh/", {
        headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
    expect(await response.text()).toContain("<title>ai-ready</title>");
  });

  it("serves the same script on /install.sh for any Accept", async () => {
    for (const accept of ["*/*", "text/html,application/xhtml+xml"]) {
      const response = await handleFetch(
        new Request("https://aiready.sh/install.sh", { headers: { Accept: accept } }),
        env,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toMatch(/^text\/plain/);
      expect(await response.text()).toBe(INSTALL_SH);
    }
  });

  it("302s other paths to orbi.build preserving path and query", async () => {
    const response = await handleFetch(
      new Request("https://aiready.sh/cloud/?ref=tg"),
      env,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://orbi.build/cloud/?ref=tg");
  });

  it("does not serve the test-env blanket Disallow on /robots.txt", async () => {
    const response = await handleFetch(new Request("https://aiready.sh/robots.txt"), env);
    const body = await response.text();
    expect(body).not.toBe("User-agent: *\nDisallow: /\n");
    expect(body).not.toMatch(/^User-agent: \*\s*\nDisallow: \/\s*$/);
  });

  it("is a production host: no X-Robots-Tag on the fetch wrapper", async () => {
    expect(PROD_HOSTS.has("aiready.sh")).toBe(true);
    const response = await worker.fetch(
      new Request("https://aiready.sh/", { headers: { Accept: "*/*" } }),
      env,
      { waitUntil() {} },
    );
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });
});

// Issue #228: first-touch vid attribution. The fetch-wrapper exit seeds a vid
// cookie when the request has none and reports every HTML 200 as one visit to
// the cloud control plane's POST /api/internal/visit. The registration side
// (orbi-cloud#716) reads the same cookie, so the contract is pinned: 16 random
// bytes as base64url (22 chars, no padding), host-only Path=/ with HttpOnly;
// SameSite=Lax; Max-Age=7776000, and Secure only on https (cloud's
// sessionCookieString pattern) so local http tests can still seed it.
// Reporting rides ctx.waitUntil and never delays or fails the page.
// Issue #234: the same exit seeds a `ref` cookie — the one the
// registration side actually reads to attribute signups (orbi-cloud
// getCookie(..., "ref")). Its first touch is judged independently of vid
// (pre-#234 visitors carry a vid but no ref). Issue #240 stopped fabricating
// "direct" into the empty slot. Issue #247 splits the model by source kind:
// an explicit ?ref= token is last touch (it overwrites the slot and is
// reported on every visit); derived sources (referer host, ?source=) are
// first touch (they fill an empty slot and never overwrite).
describe("visit attribution (Issue #228)", () => {
  const VISIT_URL = "https://beta.orbi.build/api/internal/visit";
  const SECRET = "e2e-visit-secret";
  // The requests below carry no User-Agent header, so the report's ua_hash
  // is the SHA-256 of the empty string, first 16 hex (Issue #280: the report
  // stores the judgment inputs, never the raw UA).
  const EMPTY_UA_HASH = "e3b0c44298fc1c14";
  const realFetch = globalThis.fetch;
  const HTML_PAGE = {
    body: "<html><head><title>page</title></head><body>page</body></html>",
    headers: { "Content-Type": "text/html; charset=utf-8", ETag: '"asset-etag-1"' },
  };

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function collectingCtx() {
    const pending = [];
    return { pending, waitUntil: (promise) => pending.push(promise) };
  }

  // Flush the waitUntil queue with a hard cap: a promise that never settles
  // must fail the test, not hang it.
  async function flush(ctx) {
    await Promise.race([
      Promise.all(ctx.pending),
      new Promise((_, reject) => setTimeout(() => reject(new Error("waitUntil still pending after 2s")), 2000)),
    ]);
  }

  function assetServer(routes) {
    return {
      fetch: async (request) => {
        const hit = routes[new URL(request.url).pathname];
        if (!hit) return new Response("missing", { status: 404, headers: { "Content-Type": "text/plain" } });
        return new Response(hit.body, { status: hit.status ?? 200, headers: hit.headers });
      },
    };
  }

  // The report travels over the CLOUD service binding (Issue #231), so the
  // env carries one whose fetch is the same mock the tests already assert on.
  // A plain global fetch() of this zone would be routed to the origin server
  // past every Worker, which is exactly the bug the binding fixes.
  function env(overrides = {}) {
    return {
      ASSETS: assetServer({ "/": HTML_PAGE }),
      CLOUD_VISIT_URL: VISIT_URL,
      WEBSITE_SECRET: SECRET,
      CLOUD: { fetch: (...args) => globalThis.fetch(...args) },
      ...overrides,
    };
  }

  // The binding is handed a Request, so the url and the body both live on it.
  function visitCalls(fetchMock) {
    return fetchMock.mock.calls.filter(([first]) => String(first?.url ?? first) === VISIT_URL);
  }

  // A Request's body is a stream: clone before reading so a second assertion
  // on the same captured call still works.
  async function visitBody(call) {
    const [first, init] = call;
    if (init && typeof init.body === "string") return JSON.parse(init.body);
    return await first.clone().json();
  }

  it("seeds a vid cookie on first touch over https, reports the visit, keeps the ETag", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    globalThis.fetch = fetchMock;
    const ctx = collectingCtx();

    const response = await worker.fetch(new Request("https://beta.orbi.build/?ref=e2e-14f5d89f"), env(), ctx);

    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatch(/^vid=[A-Za-z0-9_-]{22}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure$/);
    expect(cookies[1]).toBe("ref=e2e-14f5d89f; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure");
    // Seeding must not rewrite the body, so the asset's own validators survive.
    expect(response.headers.get("ETag")).toBe('"asset-etag-1"');
    await flush(ctx);

    const calls = visitCalls(fetchMock);
    expect(calls).toHaveLength(1);
    // The binding receives one Request, so every field is asserted on it.
    const [sent] = calls[0];
    expect(sent.url).toBe(VISIT_URL);
    expect(sent.method).toBe("POST");
    expect(sent.headers.get("Authorization")).toBe(`Bearer ${SECRET}`);
    expect(sent.headers.get("Content-Type")).toBe("application/json");
    expect(sent.signal).toBeInstanceOf(AbortSignal);
    expect(await visitBody(calls[0])).toEqual({ vid: cookies[0].match(/^vid=([A-Za-z0-9_-]{22});/)[1], path: "/", ref: "e2e-14f5d89f", is_bot: 0, asn: null, ua_hash: EMPTY_UA_HASH });
  });

  it("seeds the vid cookie without Secure over http", async () => {
    globalThis.fetch = vi.fn(async () => new Response("ok"));
    const ctx = collectingCtx();

    const response = await worker.fetch(new Request("http://beta.orbi.build/"), env(), ctx);

    // Issue #240: no ?ref= and no referer means no ref cookie — "direct" is
    // no longer fabricated into the slot, so only vid is seeded.
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^vid=[A-Za-z0-9_-]{22}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=7776000$/),
    ]);
    await flush(ctx);
  });

  it("keeps an existing vid (pre-#234 visitor): no vid reseed, the missing ref is seeded", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    globalThis.fetch = fetchMock;
    const ctx = collectingCtx();

    const response = await worker.fetch(
      new Request("https://beta.orbi.build/?ref=later-ref", { headers: { Cookie: "vid=ExistingVidValue123456" } }),
      env(),
      ctx,
    );

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      "ref=later-ref; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure",
    ]);
    await flush(ctx);
    const calls = visitCalls(fetchMock);
    expect(calls).toHaveLength(1);
    // Issue #247/#244: the explicit ?ref= is reported on every visit, not
    // only on first touch — a visitor who browsed direct first and clicked a
    // campaign link later still lands the referral.
    expect(await visitBody(calls[0])).toEqual({ vid: "ExistingVidValue123456", path: "/", ref: "later-ref", is_bot: 0, asn: null, ua_hash: EMPTY_UA_HASH });
  });

  it("generates a fresh 22-char base64url vid per first touch", async () => {
    globalThis.fetch = vi.fn(async () => new Response("ok"));
    const firstCtx = collectingCtx();
    const first = await worker.fetch(new Request("https://beta.orbi.build/"), env(), firstCtx);
    const secondCtx = collectingCtx();
    const second = await worker.fetch(new Request("https://beta.orbi.build/"), env(), secondCtx);
    const firstVid = first.headers.getSetCookie()[0].match(/^vid=([A-Za-z0-9_-]{22});/)[1];
    const secondVid = second.headers.getSetCookie()[0].match(/^vid=([A-Za-z0-9_-]{22});/)[1];
    expect(firstVid).not.toBe(secondVid);
    // The visit reports are computed inside waitUntil; flush them here so
    // they cannot land on the next test's fetch mock.
    await flush(firstCtx);
    await flush(secondCtx);
  });

  it("records HTML 200 responses only — not static assets, robots.txt or HTML 404s", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    globalThis.fetch = fetchMock;
    const routes = {
      "/": HTML_PAGE,
      "/styles.css": { body: "body{}", headers: { "Content-Type": "text/css" } },
      "/logo.svg": { body: "<svg/>", headers: { "Content-Type": "image/svg+xml" } },
      "/install.sh": { body: "#!/bin/sh\n", headers: { "Content-Type": "text/plain; charset=utf-8" } },
      "/gone/": { body: "<html>404</html>", headers: { "Content-Type": "text/html; charset=utf-8" }, status: 404 },
    };
    const assets = assetServer(routes);

    for (const path of ["/", "/styles.css", "/logo.svg", "/install.sh", "/gone/"]) {
      const before = visitCalls(fetchMock).length;
      const ctx = collectingCtx();
      await worker.fetch(new Request(`https://beta.orbi.build${path}`), env({ ASSETS: assets }), ctx);
      await flush(ctx);
      expect(visitCalls(fetchMock).length - before, path).toBe(path === "/" ? 1 : 0);
    }
    // beta robots.txt is worker-served (test-env blanket Disallow): never a visit.
    const before = visitCalls(fetchMock).length;
    const ctx = collectingCtx();
    await worker.fetch(new Request("https://beta.orbi.build/robots.txt"), env(), ctx);
    await flush(ctx);
    expect(visitCalls(fetchMock).length - before).toBe(0);
  });

  it("keeps the page 200 when the visit endpoint rejects, answers 500, or times out", async () => {
    const failures = [
      { label: "network error", answer: async () => { throw new Error("network down"); } },
      { label: "500 response", answer: async () => new Response("boom", { status: 500 }) },
      { label: "timeout abort", answer: async () => { throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" }); } },
    ];
    for (const failure of failures) {
      globalThis.fetch = vi.fn(failure.answer);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const ctx = collectingCtx();
      const response = await worker.fetch(new Request("https://beta.orbi.build/"), env(), ctx);
      expect(response.status, failure.label).toBe(200);
      expect(response.headers.get("Set-Cookie"), failure.label).toMatch(/^vid=/);
      await flush(ctx);
      expect(warn, failure.label).toHaveBeenCalled();
      expect(warn.mock.calls[0][0], failure.label).toMatch(/^visit_report_/);
      warn.mockRestore();
    }
  });

  it("returns the response before the visit POST completes", async () => {
    let settled = false;
    let release;
    const fetchMock = vi.fn(() => new Promise((resolve) => {
      release = () => { settled = true; resolve(new Response("ok")); };
    }));
    globalThis.fetch = fetchMock;
    const ctx = collectingCtx();

    const response = await worker.fetch(new Request("https://beta.orbi.build/"), env(), ctx);

    expect(response.status).toBe(200);
    // The POST is computed inside waitUntil, one await after the response is
    // already on the wire — wait for it to start, then prove it had not
    // settled: the page never waited for it either way.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(settled).toBe(false);
    release();
    await flush(ctx);
    expect(settled).toBe(true);
  });

  it("derives ref from ?ref=, then ?source=, then referer host, then direct — first touch only", async () => {
    const cases = [
      { url: "https://beta.orbi.build/?ref=TG", expected: "tg" },
      { url: "https://beta.orbi.build/?source=News.Site", expected: "news.site" },
      { url: `https://beta.orbi.build/?ref=${"x".repeat(33)}`, expected: "direct" },
      { url: "https://beta.orbi.build/", headers: { Referer: "https://News.Ycombinator.com/item?id=1" }, expected: "news.ycombinator.com" },
      { url: "https://beta.orbi.build/", headers: { Referer: "javascript:alert(1)" }, expected: "direct" },
      { url: "https://beta.orbi.build/", headers: {}, expected: "direct" },
    ];
    for (const { url, headers, expected } of cases) {
      const fetchMock = vi.fn(async () => new Response("ok"));
      globalThis.fetch = fetchMock;
      const ctx = collectingCtx();
      await worker.fetch(new Request(url, { headers }), env(), ctx);
      await flush(ctx);
      const calls = visitCalls(fetchMock);
      expect(calls, url).toHaveLength(1);
      expect((await visitBody(calls[0])).ref, url).toBe(expected);
    }
  });

  it("skips the visit POST when CLOUD_VISIT_URL or WEBSITE_SECRET is unset, still seeding the cookie", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    globalThis.fetch = fetchMock;
    for (const overrides of [{ CLOUD_VISIT_URL: undefined }, { WEBSITE_SECRET: undefined }]) {
      const ctx = collectingCtx();
      const response = await worker.fetch(new Request("https://beta.orbi.build/"), env(overrides), ctx);
      expect(response.status).toBe(200);
      expect(response.headers.get("Set-Cookie")).toMatch(/^vid=/);
      await flush(ctx);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Issue #234: the ref cookie the cloud registration side reads
  // (orbi-cloud getCookie(request.headers.get("Cookie"), "ref"), accepted by
  // its isStoredSource: "direct", a ref token, or a source host — exactly the
  // normalizedSource value space). First touch is judged independently of vid.
  // Issue #240 reverses one part of the original design: "direct" is no
  // longer seeded — a fabricated direct first touch hides a real later
  // ?ref= channel. The slot now only fills when the landing carries a real
  // signal (?ref=, ?source=, referer host).
  describe("ref cookie (Issue #234)", () => {
    const REF_ATTRS = "Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000";

    it("seeds no ref cookie on a first landing without any ref signal (Issue #240)", async () => {
      globalThis.fetch = vi.fn(async () => new Response("ok"));
      const ctx = collectingCtx();

      const response = await worker.fetch(new Request("https://beta.orbi.build/"), env(), ctx);

      expect(response.headers.getSetCookie()).toEqual([
        expect.stringMatching(/^vid=[A-Za-z0-9_-]{22}; /),
      ]);
      await flush(ctx);
    });

    it("seeds the referer host as ref when the landing carries no ref param", async () => {
      globalThis.fetch = vi.fn(async () => new Response("ok"));
      const ctx = collectingCtx();

      const response = await worker.fetch(
        new Request("https://beta.orbi.build/", { headers: { Referer: "https://News.Ycombinator.com/item?id=1" } }),
        env(),
        ctx,
      );

      expect(response.headers.getSetCookie()).toContain(`ref=news.ycombinator.com; ${REF_ATTRS}; Secure`);
      await flush(ctx);
    });

    it("leaves the ref slot empty on a direct first visit, so a later ?ref= lands as true first touch (Issue #240)", async () => {
      globalThis.fetch = vi.fn(async () => new Response("ok"));

      const firstCtx = collectingCtx();
      const first = await worker.fetch(new Request("https://beta.orbi.build/"), env(), firstCtx);
      const jar = first.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
      expect(jar).toMatch(/^vid=[A-Za-z0-9_-]{22}$/);

      const secondCtx = collectingCtx();
      const second = await worker.fetch(
        new Request("https://beta.orbi.build/?ref=xtest", { headers: { Cookie: jar } }),
        env(),
        secondCtx,
      );
      expect(second.headers.getSetCookie()).toEqual([`ref=xtest; ${REF_ATTRS}; Secure`]);
      await flush(firstCtx);
      await flush(secondCtx);
    });

    it("seeds nothing for a vid-only visitor without a ref signal (Issue #240)", async () => {
      globalThis.fetch = vi.fn(async () => new Response("ok"));
      const ctx = collectingCtx();

      const response = await worker.fetch(
        new Request("https://beta.orbi.build/", { headers: { Cookie: "vid=ExistingVidValue123456" } }),
        env(),
        ctx,
      );

      expect(response.headers.getSetCookie()).toEqual([]);
      await flush(ctx);
    });

    it("mirrors vid's Secure logic: the ref cookie drops Secure over http", async () => {
      globalThis.fetch = vi.fn(async () => new Response("ok"));
      const ctx = collectingCtx();

      const response = await worker.fetch(new Request("http://beta.orbi.build/?ref=xtest"), env(), ctx);

      expect(response.headers.getSetCookie()).toContain(`ref=xtest; ${REF_ATTRS}`);
      await flush(ctx);
    });
  });

  // Issue #247: the attribution model splits by source kind. An explicit
  // ?ref= token is ours — every seeded link carries one — so it is last
  // touch: it overwrites whatever the slot held and is reported on every
  // visit. Derived sources (referer host, ?source=, direct) are guesses an
  // OAuth bounce or an in-site hop can fabricate, so they stay first touch:
  // they fill an empty slot and never overwrite. The rows of the Issue's
  // priority table map onto these tests one to one.
  describe("attribution model (Issue #247)", () => {
    const REF_ATTRS = "Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000";

    // Row: ref cookie `aaa`, landing ?ref=bbb → overwritten with bbb
    // (last-touch), and the visit reports bbb. The token is also
    // re-normalized to lowercase like any ?ref= value.
    it("an explicit ?ref= overwrites the previous ref cookie and is reported on a repeat visit", async () => {
      const fetchMock = vi.fn(async () => new Response("ok"));
      globalThis.fetch = fetchMock;
      const ctx = collectingCtx();

      const response = await worker.fetch(
        new Request("https://beta.orbi.build/?ref=BBB", {
          headers: { Cookie: "vid=ExistingVidValue123456; ref=aaa" },
        }),
        env(),
        ctx,
      );

      expect(response.headers.getSetCookie()).toEqual([`ref=bbb; ${REF_ATTRS}; Secure`]);
      await flush(ctx);
      const calls = visitCalls(fetchMock);
      expect(calls).toHaveLength(1);
      expect(await visitBody(calls[0])).toEqual({ vid: "ExistingVidValue123456", path: "/", ref: "bbb", is_bot: 0, asn: null, ua_hash: EMPTY_UA_HASH });
    });

    // Row: ref cookie news.ycombinator.com, landing ?ref=aaa → explicit
    // beats derived.
    it("an explicit ?ref= overwrites a derived-source cookie", async () => {
      globalThis.fetch = vi.fn(async () => new Response("ok"));
      const ctx = collectingCtx();

      const response = await worker.fetch(
        new Request("https://beta.orbi.build/?ref=aaa", {
          headers: { Cookie: "vid=ExistingVidValue123456; ref=news.ycombinator.com" },
        }),
        env(),
        ctx,
      );

      expect(response.headers.getSetCookie()).toEqual([`ref=aaa; ${REF_ATTRS}; Secure`]);
      await flush(ctx);
    });

    // Row: ref cookie aaa, landing with no ref and a HN referer → nothing is
    // seeded (a derived source may not overwrite an explicit ref) and the
    // report carries no ref — the referral survives the in-site hop.
    it("a derived source never overwrites the ref cookie, and later visits report no derived ref", async () => {
      const fetchMock = vi.fn(async () => new Response("ok"));
      globalThis.fetch = fetchMock;
      const ctx = collectingCtx();

      const response = await worker.fetch(
        new Request("https://beta.orbi.build/", {
          headers: { Cookie: "vid=ExistingVidValue123456; ref=aaa", Referer: "https://news.ycombinator.com/item?id=1" },
        }),
        env(),
        ctx,
      );

      expect(response.headers.getSetCookie()).toEqual([]);
      await flush(ctx);
      const calls = visitCalls(fetchMock);
      expect(calls).toHaveLength(1);
      expect(await visitBody(calls[0])).toEqual({ vid: "ExistingVidValue123456", path: "/", ref: "", is_bot: 0, asn: null, ua_hash: EMPTY_UA_HASH });
    });

    // The xqliu beta repro (2026-09-19): direct landing first (vid seeded, no
    // ref cookie), a campaign link clicked days later. The visit must carry
    // the explicit ref now that first touch is long gone.
    it("reports an explicit ?ref= for a vid-only visitor with no ref cookie yet (Issue #244)", async () => {
      const fetchMock = vi.fn(async () => new Response("ok"));
      globalThis.fetch = fetchMock;
      const ctx = collectingCtx();

      const response = await worker.fetch(
        new Request("https://beta.orbi.build/?ref=afterdirect1789833086", {
          headers: { Cookie: "vid=ExistingVidValue123456" },
        }),
        env(),
        ctx,
      );

      expect(response.headers.getSetCookie()).toEqual([`ref=afterdirect1789833086; ${REF_ATTRS}; Secure`]);
      await flush(ctx);
      const calls = visitCalls(fetchMock);
      expect(calls).toHaveLength(1);
      expect(await visitBody(calls[0])).toEqual({ vid: "ExistingVidValue123456", path: "/", ref: "afterdirect1789833086", is_bot: 0, asn: null, ua_hash: EMPTY_UA_HASH });
    });
  });

  // Explicit campaign links may still target the handoff directly. The
  // handoff strips their query, while withAttribution plants the shared-domain
  // ref cookie that /api/login reads (orbi-cloud #716). Internal site CTAs are
  // bare instead, so they preserve the campaign cookie planted on landing.
  describe("login handoff ref (Issue #256)", () => {
    const LOGIN_ENV = {
      CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login",
      ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) },
    };

    it("plants a direct campaign ref on the handoff and keeps the Location bare", async () => {
      globalThis.fetch = vi.fn(async () => new Response("ok"));

      const response = await worker.fetch(
        new Request("https://beta.orbi.build/cloud/login?ref=x-2609201530", {
          headers: { Cookie: "vid=ExistingVidValue123456" },
        }),
        LOGIN_ENV,
        collectingCtx(),
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("https://beta.orbi.build/api/login");
      expect(response.headers.getSetCookie()).toEqual([
        "ref=x-2609201530; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure",
      ]);
    });

    it("never plants a ref cookie for a token the receiving side would reject", async () => {
      globalThis.fetch = vi.fn(async () => new Response("ok"));

      const response = await worker.fetch(
        new Request("https://beta.orbi.build/cloud/login?ref=!!invalid!!", {
          headers: { Cookie: "vid=ExistingVidValue123456" },
        }),
        LOGIN_ENV,
        collectingCtx(),
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("https://beta.orbi.build/api/login");
      expect(response.headers.getSetCookie()).toEqual([]);
    });

    it("preserves a campaign ref from landing through the bare internal handoff (Issue #273)", async () => {
      globalThis.fetch = vi.fn(async () => new Response("ok"));
      const journeyEnv = {
        ...LOGIN_ENV,
        ASSETS: { fetch: () => Promise.resolve(new Response("<h1>Orbi</h1>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })) },
      };

      const landing = await worker.fetch(
        new Request("https://beta.orbi.build/?ref=x-2609201530", {
          headers: { Cookie: "vid=ExistingVidValue123456" },
        }),
        journeyEnv,
        collectingCtx(),
      );
      expect(landing.status).toBe(200);
      expect(landing.headers.getSetCookie()).toEqual([
        "ref=x-2609201530; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure",
      ]);

      const campaignCookie = landing.headers.getSetCookie()[0].split(";", 1)[0];
      const handoff = await worker.fetch(
        new Request("https://beta.orbi.build/cloud/login", {
          headers: { Cookie: `vid=ExistingVidValue123456; ${campaignCookie}` },
        }),
        journeyEnv,
        collectingCtx(),
      );

      expect(handoff.status).toBe(302);
      expect(handoff.headers.get("location")).toBe("https://beta.orbi.build/api/login");
      expect(handoff.headers.getSetCookie()).toEqual([]);
    });
  });

  // Issue #280 restored the two signals #243/#251 had removed: botManagement
  // is only set for the Cloudflare Bot Management product — an Enterprise
  // add-on we do not buy (#251 measured it absent live) — while
  // request.cf.asn is available on every plan. Classification is the
  // cloud-provider ASN first (real people do not browse from datacenter
  // IPs), then self-identifying crawler UAs plus the generic
  // bot/crawler/spider fallback. The report now carries the judgment inputs
  // (asn, ua_hash — never the raw UA) so a wrong verdict can be re-derived
  // later instead of being wrong forever. vid is still seeded on every
  // request and the page is served unchanged; the marker never blocks.
  describe("bot marking (Issue #280)", () => {
    const CHROME_127 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
    const BETTER_UPTIME = "Better Uptime Bot Mozilla/5.0";
    const GPTBOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";
    // openssl dgst -sha256, first 16 hex: the stored form of each UA.
    const CHROME_127_HASH = "286fc7e32b7b67d0";
    const BETTER_UPTIME_HASH = "b6c7f9b8ea808784";
    const GPTBOT_HASH = "d1e6777ea082ce0f";

    async function botReportFor(request) {
      const fetchMock = vi.fn(async () => new Response("ok"));
      globalThis.fetch = fetchMock;
      const ctx = collectingCtx();
      const response = await worker.fetch(request, env(), ctx);
      expect(response.status).toBe(200);
      await flush(ctx);
      const calls = visitCalls(fetchMock);
      expect(calls).toHaveLength(1);
      return { body: await visitBody(calls[0]), cookies: response.headers.getSetCookie() };
    }

    it("marks the Better Uptime probe is_bot=1 while seeding vid and serving the page unchanged", async () => {
      const { body, cookies } = await botReportFor(
        new Request("https://beta.orbi.build/", { headers: { "User-Agent": BETTER_UPTIME } }),
      );
      expect(body).toEqual({ vid: expect.any(String), path: "/", ref: expect.any(String), is_bot: 1, asn: null, ua_hash: BETTER_UPTIME_HASH });
      expect(cookies).toHaveLength(1);
      expect(cookies[0]).toMatch(/^vid=[A-Za-z0-9_-]{22}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure$/);
    });

    it("marks self-identifying crawlers through the UA substring list, storing the hash instead of the UA", async () => {
      const { body } = await botReportFor(
        new Request("https://beta.orbi.build/", { headers: { "User-Agent": GPTBOT } }),
      );
      expect(body.is_bot).toBe(1);
      expect(body.ua_hash).toBe(GPTBOT_HASH);
      expect(JSON.stringify(body)).not.toContain("GPTBot");
    });

    it("marks a cloud-provider ASN a bot even behind a browser UA, and reports the asn", async () => {
      const request = new Request("https://beta.orbi.build/", { headers: { "User-Agent": CHROME_127 } });
      request.cf = { asn: 16509 };
      const { body } = await botReportFor(request);
      expect(body.is_bot).toBe(1);
      expect(body.asn).toBe(16509);
    });

    it("keeps a residential ASN with a real browser human and reports both judgment inputs", async () => {
      const request = new Request("https://beta.orbi.build/", { headers: { "User-Agent": CHROME_127 } });
      request.cf = { asn: 7922 };
      const { body } = await botReportFor(request);
      expect(body).toEqual({ vid: expect.any(String), path: "/", ref: expect.any(String), is_bot: 0, asn: 7922, ua_hash: CHROME_127_HASH });
    });

    it("probe lookalikes and case variants now mark bot through the substring fallback (Issue #280)", async () => {
      const lookalike = await botReportFor(new Request("https://beta.orbi.build/", {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Better Uptime Bot/1.0)" },
      }));
      const lowercase = await botReportFor(new Request("https://beta.orbi.build/", {
        headers: { "User-Agent": BETTER_UPTIME.toLowerCase() },
      }));
      expect(lookalike.body.is_bot).toBe(1);
      expect(lowercase.body.is_bot).toBe(1);
    });

    it("marks browsers and curl human", async () => {
      const chrome = await botReportFor(new Request("https://beta.orbi.build/", { headers: { "User-Agent": CHROME_127 } }));
      const curl = await botReportFor(new Request("https://beta.orbi.build/", { headers: { "User-Agent": "curl/8.7.1" } }));
      expect(chrome.body.is_bot).toBe(0);
      expect(curl.body.is_bot).toBe(0);
    });

    it("still never reads botManagement: a perfect score decides nothing on its own", async () => {
      const request = new Request("https://beta.orbi.build/", { headers: { "User-Agent": CHROME_127 } });
      request.cf = { botManagement: { score: 1 } };
      const { body } = await botReportFor(request);
      expect(body.is_bot).toBe(0);
      expect(body.asn).toBeNull();
    });
  });
});

// Issue #251: the bot verdict on beta is all zeros and the two candidate
// causes — botManagement absent on this account/plan, or present with high
// scores — differ only in the live value. /__cf is the read-only measurement:
// the request's own request.cf echoed back as JSON on non-production hosts.
// No credentials, no writes, no cache (the score is per-request), and
// production has no such route: it 404s through the asset fall-through.
describe("/__cf diagnostic (Issue #251)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function requestWithCf(url, cf) {
    const request = new Request(url);
    request.cf = cf;
    return request;
  }

  // Rejecting assets prove the beta endpoint is answered by the worker route
  // and never falls through to the static assets.
  const env = {
    ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) },
  };
  const notFoundAssets = {
    ASSETS: { fetch: () => Promise.resolve(new Response("missing", { status: 404 })) },
  };

  it("echoes the live request.cf fields as JSON on beta", async () => {
    const response = await handleFetch(
      requestWithCf("https://beta.orbi.build/__cf", { botManagement: { score: 7 }, asn: 24940, colo: "FRA" }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ botManagement: { score: 7 }, asn: 24940, colo: "FRA" });
  });

  it("answers botManagement null when the field is absent from request.cf", async () => {
    const response = await handleFetch(
      requestWithCf("https://beta.orbi.build/__cf", { asn: 24940, colo: "HKG" }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ botManagement: null, asn: 24940, colo: "HKG" });
  });

  it("answers botManagement null without any request.cf at all (local dev)", async () => {
    const response = await handleFetch(new Request("https://beta.orbi.build/__cf"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ botManagement: null, asn: undefined, colo: undefined });
  });

  it("serves the trailing-slash form identically (Issue #134)", async () => {
    const response = await handleFetch(new Request("https://beta.orbi.build/__cf/"), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  });

  it("is 404 in production: orbi.build directly, aiready.sh via its standard redirect", async () => {
    const apex = await handleFetch(new Request("https://orbi.build/__cf"), notFoundAssets);
    expect(apex.status).toBe(404);
    // aiready.sh's Issue #174 contract 302s every unknown path to orbi.build,
    // where the diagnostic 404s — the end result is still no /__cf in prod.
    const aiready = await handleFetch(new Request("https://aiready.sh/__cf"), notFoundAssets);
    expect(aiready.status).toBe(302);
    expect(aiready.headers.get("Location")).toBe("https://orbi.build/__cf");
  });

  it("never reports a visit: the diagnostic is not an HTML 200", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    globalThis.fetch = fetchMock;
    const pending = [];
    const attributionEnv = {
      ...env,
      CLOUD_VISIT_URL: "https://beta.orbi.build/api/internal/visit",
      WEBSITE_SECRET: "e2e-visit-secret",
      CLOUD: { fetch: (...args) => globalThis.fetch(...args) },
    };
    const response = await worker.fetch(
      requestWithCf("https://beta.orbi.build/__cf", { botManagement: { score: 1 } }),
      attributionEnv,
      { waitUntil: (promise) => pending.push(promise) },
    );
    expect(response.status).toBe(200);
    await Promise.all(pending);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
