import { afterEach, describe, expect, it } from "vitest";
import { cloudLoginResponse, field, fetchAsset, githubHeaders, handleFetch, loadStats, statsResponse } from "../src/worker.js";

describe("Worker request helpers", () => {
  it("trims and bounds submitted fields", () => {
    expect(field({ name: "  Ada Lovelace  " }, "name")).toBe("Ada Lovelace");
    expect(field({ scenario: "x".repeat(2100) }, "scenario")).toHaveLength(2000);
    expect(field({}, "email")).toBe("");
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

    const html = '<a data-cta="cloud-start" href="/cloud/login">Start Cloud with GitHub</a>';
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
    expect(body).toContain('href="/cloud/login"');
    expect(body).not.toContain('href="/apply"');
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
    expect(html).toContain('href="/apply"');
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

  it("serves pages with the Cloud CTA rewritten to /apply when Cloud is not configured", async () => {
    const html = '<a class="nav-apply" href="/cloud/login">Start Cloud</a>'
      + '<a data-cta="cloud-start" href="/cloud/login">Start Cloud with GitHub</a>';
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
    expect(body).not.toContain('href="/cloud/login"');
    expect(body).toContain('href="/apply"');
    // A rewritten body is a new representation: the asset file's validators
    // must not answer conditional requests for it.
    expect(response.headers.get("etag")).toBeNull();
  });

  it("serves pages unchanged when Cloud login is configured", async () => {
    const html = '<a data-cta="cloud-start" href="/cloud/login">Start Cloud with GitHub</a>';
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
    expect(await response.text()).toContain('href="/cloud/login"');
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

describe("application submit endpoint (Issue #76)", () => {
  // Minimal D1 binding double: record the prepared statement so the test
  // asserts a real insert was issued, not just a status code.
  function d1Env() {
    const statements = [];
    const env = {
      ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) },
      orbi_applications: {
        prepare: (sql) => {
          statements.push(sql);
          return {
            bind: (...values) => ({ run: () => Promise.resolve({ success: true }) }),
          };
        },
      },
    };
    return { env, statements };
  }

  const submit = (env, body) => handleFetch(
    new Request("https://beta.orbi.build/cloud/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );

  it("stores an application and answers 201 on /cloud/apply", async () => {
    const { env, statements } = d1Env();
    const response = await submit(env, { tg: "@ada", scenario: "ship our first Issue" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("INSERT INTO applications");
  });

  it("stores an application and answers 201 on the trailing-slash form /cloud/apply/ (Issue #134)", async () => {
    const { env, statements } = d1Env();
    const response = await handleFetch(
      new Request("https://beta.orbi.build/cloud/apply/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tg: "@ada", scenario: "ship our first Issue" }),
      }),
      env,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(statements).toHaveLength(1);
  });

  it("rejects a submission without the required fields with 400", async () => {
    const { env } = d1Env();
    const response = await submit(env, { name: "no tg, no scenario" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "tg and scenario are required" });
  });

  it("rejects GET with 405", async () => {
    const { env } = d1Env();
    const response = await handleFetch(new Request("https://beta.orbi.build/cloud/apply"), env);
    expect(response.status).toBe(405);
  });

  it("still serves GET /apply as a 200 conversion page (Issue #170)", async () => {
    // The nav CTA no longer points here, but the route itself stays: external
    // links and the fail-closed rewrite still land on this page.
    const applyHtml = "<!DOCTYPE html><title>Apply</title>";
    const env = {
      ASSETS: {
        fetch: (request) => {
          const { pathname } = new URL(request.url);
          if (pathname === "/apply" || pathname === "/apply.html") {
            return Promise.resolve(new Response(applyHtml, {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }));
          }
          return Promise.resolve(new Response("missing", { status: 404 }));
        },
      },
    };
    const response = await handleFetch(new Request("https://orbi.build/apply"), env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(applyHtml);
  });

  it("no longer handles POST /api/apply: the cloud control plane owns /api* on the shared beta host", async () => {
    // Issue #76: live beta answered POST /api/apply with cloud's 404
    // (x-orbi-worker: orbi-cloud-control-plane-e2e) — the website's D1 never
    // saw the submission. The website must not define the path at all; the
    // request falls through to the static assets like any unknown path.
    const { env } = d1Env();
    env.ASSETS = {
      fetch: () => Promise.resolve(new Response("missing", { status: 404 })),
    };
    const response = await handleFetch(
      new Request("https://beta.orbi.build/api/apply", { method: "POST", body: "{}" }),
      env,
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
