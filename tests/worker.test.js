import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import pricing from "../src/pricing.json";
import worker, { assetResponse, cloudLoginResponse, fetchAsset, ghJson, githubHeaders, handleFetch, loadFoundingAvatars, loadStats, PROD_HOSTS, STATS_KV_KEY, statsResponse, subscribeResponse, trailingSlashRedirect } from "../src/worker.js";

// Issue #917: the Worker reads its stats snapshot from the STATS_KV binding;
// only the 5-minute cron (or, while KV is still empty, a single request)
// writes it. This double models that binding without a real namespace.
function fakeStatsKv(initial) {
  const store = new Map();
  if (initial !== undefined) store.set(STATS_KV_KEY, JSON.stringify(initial));
  return {
    store,
    get: async (key) => store.get(key),
    put: async (key, value) => { store.set(key, value); },
    read: async () => JSON.parse(await store.get(STATS_KV_KEY)),
  };
}

describe("Worker request helpers", () => {
  it("renders the homepage pricing summary from pricing.json in both languages", async () => {
    const pages = new Map([
      ["/", await readFile(new URL("../public/index.html", import.meta.url), "utf8")],
      ["/zh/", await readFile(new URL("../public/zh/index.html", import.meta.url), "utf8")],
    ]);
    for (const [path, html] of pages) {
      const response = await handleFetch(
        new Request(`https://orbi.build${path}`),
        {
          ASSETS: { fetch: () => Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })) },
          CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login",
        },
      );
      const body = await response.text();
      const summary = body.match(/<section class="pricing-summary"[\s\S]*?<\/section>/)?.[0];
      expect(summary).toBeDefined();
      expect(body.indexOf(summary)).toBeLessThan(body.indexOf('id="faq"'));
      for (const value of [
        pricing.soloMonthlyUsd,
        pricing.cloudMonthlyUsd,
        pricing.soloIncludedTokensLabel,
        pricing.includedTokensLabel,
        pricing.soloRepositories,
        pricing.proRepositories,
        pricing.freeDeliveries,
        pricing.foundingPartnerLimit,
        pricing.foundingPartnerRemaining,
      ]) {
        expect(summary).toContain(String(value));
      }
      expect(summary).toContain(
        path === "/"
          ? `Founding partners: 50% off for life. Only ${pricing.foundingPartnerRemaining} of ${pricing.foundingPartnerLimit} places left.`
          : `创始合作伙伴终身五折，${pricing.foundingPartnerLimit} 个名额只剩 ${pricing.foundingPartnerRemaining} 个。`,
      );
      expect(summary).not.toContain("__SOLO_MONTHLY_USD__");
      expect(summary).not.toContain("__CLOUD_MONTHLY_USD__");
      expect(summary).not.toContain("__FOUNDING_PARTNER_LIMIT__");
    }
  });

  it("301 redirects moved guide URLs while preserving query attribution", async () => {
    const assets = { fetch: () => Promise.resolve(new Response("missing", { status: 404 })) };
    for (const [oldPath, newPath] of [
      ["/issue-to-release/", "/guides/issue-to-release/"],
      ["/autonomous-coding-agent/", "/guides/autonomous-coding-agent/"],
      ["/self-hosted-coding-agent/", "/guides/self-hosted-coding-agent/"],
      ["/codex-github-issues/", "/guides/codex-github-issues/"],
      ["/zh/issue-to-release/", "/zh/guides/issue-to-release/"],
      ["/zh/autonomous-coding-agent/", "/zh/guides/autonomous-coding-agent/"],
      ["/zh/self-hosted-coding-agent/", "/zh/guides/self-hosted-coding-agent/"],
      ["/zh/codex-github-issues/", "/zh/guides/codex-github-issues/"],
    ]) {
      const response = await handleFetch(new Request(`https://beta.orbi.build${oldPath}?ref=x`), { ASSETS: assets });
      expect(response.status).toBe(301);
      expect(new URL(response.headers.get("location")).pathname).toBe(newPath);
      expect(new URL(response.headers.get("location")).search).toBe("?ref=x");
    }
  });
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

  // Issue #134 / #308: login handoffs preserve the configured 302 for both
  // language paths and their natural trailing-slash variants.
  it("serves language Cloud login handoffs identically in both configurations (Issue #308)", async () => {
    for (const pathname of ["/cloud/login", "/cloud/login/", "/zh/cloud/login", "/zh/cloud/login/"]) {
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
    // environment ships dead-end CTAs again (Issue #179). Issue #941 removed
    // the nav Sign in link, so no shipped page carries the bare /api/login
    // href any more; the rule stays because that route is still no place for
    // a visitor to land when Cloud is absent.
    const html = '<a href="/api/login">Sign in</a>'
      + '<a class="nav-apply" href="/cloud/login?ref=nav">Start Cloud</a>'
      + '<a data-cta="cloud-start" href="/cloud/login?ref=home-hero">Start Cloud with GitHub</a>'
      + '<a data-cta="cloud-start-zh" href="/zh/cloud/login">用 GitHub 开始 Cloud</a>';
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
    expect(body).not.toMatch(/href="\/(?:zh\/)?cloud\/login/);
    expect(body).not.toContain('href="/api/login"');
    expect(body.match(/href="https:\/\/docs\.orbi\.build"/g)).toHaveLength(4);
    // A rewritten body is a new representation: the asset file's validators
    // must not answer conditional requests for it.
    expect(response.headers.get("etag")).toBeNull();
  });

  it("serves pages unchanged when Cloud login is configured", async () => {
    const html = '<a href="/api/login">Sign in</a>'
      + '<a data-cta="cloud-start" href="/cloud/login?ref=home-hero">Start Cloud with GitHub</a>';
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
    const body = await response.text();
    expect(body).toContain('href="/cloud/login?ref=home-hero"');
    expect(body).toContain('href="/api/login"');
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

  it("returns only the per-repo groups", async () => {
    mockGitHub();
    const db = { prepare() { throw new Error("subscriptions query must not run"); } };
    const stats = await loadStats("token", db);
    expect(Object.keys(stats)).toEqual(["repos"]);
  });

  it("loads the newest tenant logins plus the total for server-rendered avatar markup", async () => {
    const queries = [];
    const db = {
      prepare(sql) {
        queries.push(sql);
        if (sql.includes("COUNT(*)")) {
          return { all: async () => ({ results: [{ total: 30 }] }) };
        }
        return { all: async () => ({ results: [{ login: "alice" }, { login: "bob&co" }] }) };
      },
    };
    // Issue #827: the SELECT is capped so the avatar row cannot grow with the
    // tenant list, and the count is what the "+K" chip reports.
    await expect(loadFoundingAvatars(db)).resolves.toEqual({ logins: ["alice", "bob&co"], total: 30 });
    expect(queries).toContain("SELECT login FROM tenants WHERE login IS NOT NULL ORDER BY created_at DESC LIMIT 18");
    expect(queries).toContain("SELECT COUNT(*) AS total FROM tenants WHERE login IS NOT NULL");
  });

  it("returns an empty avatar wall without a database", async () => {
    await expect(loadFoundingAvatars(null)).resolves.toEqual({ logins: [], total: 0 });
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
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mockGitHub({ fail: ["orbi-cloud"] });
      const stats = await loadStats("token");
      expect(stats.repos["orbi-cloud"]).toBeNull();
      expect(stats.repos.orbi.issues_closed).toBe(372);
      expect(stats.repos["orbi-website"].prs_merged).toBe(296);
    } finally {
      error.mockRestore();
    }
  });

  // Issue #917: GitHub is pulled once an hour by the cron trigger and
  // written to KV; caches.default only fronts that snapshot, and /stats never
  // pulls GitHub while KV has a value. A repo that fails a pull keeps the
  // value already in KV instead of becoming a null in the global snapshot.
  const STATS_KEY = "https://orbi.build/__stats";
  const LAST_GOOD = {
    repos: {
      orbi: { started: "2026-08-24T16:08:33Z", issues_closed: 800, prs_merged: 600, releases: 80, stars: 190, star_history: [] },
      "orbi-website": { started: "2026-08-31T13:04:14Z", issues_closed: 380, prs_merged: 470, releases: 0, deploys: 450, star_history: [] },
      "orbi-cloud": { started: "2026-09-01T01:32:51Z", issues_closed: 1050, prs_merged: 730, releases: 120, stars: 1, star_history: [] },
    },
  };

  // Cache double: the KV front answers per key and records every put.
  function keyedCache(entries = {}) {
    const store = new Map(Object.entries(entries));
    const puts = [];
    return {
      puts,
      cache: {
        default: {
          match: (key) => {
            const body = store.get(String(key));
            return Promise.resolve(body === undefined ? undefined : new Response(body));
          },
          put: async (key, response) => {
            puts.push({ key: String(key), cacheControl: response.headers.get("Cache-Control"), body: await response.clone().text() });
            store.set(String(key), await response.text());
          },
        },
      },
    };
  }

  it("writes every repo to KV when the cron pull succeeds", async () => {
    mockGitHub();
    const env = { GITHUB_TOKEN: "token", STATS_KV: fakeStatsKv() };
    await worker.scheduled({ cron: "0 * * * *" }, env);
    const stored = await env.STATS_KV.read();
    for (const name of ["orbi", "orbi-website", "orbi-cloud"]) {
      expect(stored.repos[name]).toMatchObject({
        started: "2026-08-24T16:08:33Z",
        issues_closed: 372,
        prs_merged: 296,
        releases: 3,
        stars: 95,
      });
    }
  });

  it("keeps the previous KV value for the failing repo and updates the other two", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mockGitHub({ fail: ["orbi-cloud"] });
      const env = { GITHUB_TOKEN: "token", STATS_KV: fakeStatsKv(LAST_GOOD) };
      await worker.scheduled({}, env);
      const stored = await env.STATS_KV.read();
      expect(stored.repos["orbi-cloud"]).toEqual(LAST_GOOD.repos["orbi-cloud"]);
      expect(stored.repos.orbi.issues_closed).toBe(372);
      expect(stored.repos["orbi-website"].prs_merged).toBe(296);
    } finally {
      error.mockRestore();
    }
  });

  it("answers /stats from KV without calling GitHub", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("GitHub must not be called for a KV snapshot");
    };
    const { cache, puts } = keyedCache();
    globalThis.caches = cache;
    const env = {
      GITHUB_TOKEN: "token",
      STATS_KV: fakeStatsKv(LAST_GOOD),
      ASSETS: { fetch: () => Promise.resolve(new Response("missing", { status: 404 })) },
    };
    const response = await handleFetch(new Request("https://orbi.build/stats"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(LAST_GOOD);
    expect(calls).toBe(0);
    // KV data is cached in front of it for the full TTL, not the 60s the
    // browser is told.
    const served = puts.find((put) => put.key === STATS_KEY);
    expect(served.cacheControl).toBe(`public, max-age=${300}`);
  });

  it("ghJson failures name the HTTP status and path, never the body", async () => {
    globalThis.fetch = async () => new Response("API rate limit exceeded for token scope", { status: 403 });
    const failure = await ghJson("/search/issues?q=repo%3Aorbi-build%2Forbi", "token").catch((err) => err);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe("github 403 /search/issues");
  });

  it("logs the HTTP status and path per failing repo, never GitHub's body", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      globalThis.fetch = async (url) => {
        if (new URL(url).pathname === "/search/issues") {
          return new Response("API rate limit exceeded for token scope", { status: 403 });
        }
        return jsonResponse({});
      };
      const stats = await loadStats("token");
      expect(stats.repos).toEqual({ orbi: null, "orbi-website": null, "orbi-cloud": null });
      const logged = error.mock.calls.map((call) => call.join(" ")).join("\n");
      for (const name of ["orbi", "orbi-website", "orbi-cloud"]) {
        expect(logged).toContain(`stats repo failed: ${name}: github 403 /search/issues`);
      }
      expect(logged).not.toContain("API rate limit exceeded");
      expect(logged).not.toContain("token scope");
    } finally {
      error.mockRestore();
    }
  });

  it("replaces the homepage offer token with the configured free-delivery count", async () => {
    const response = await assetResponse(
      new Response('<a href="/cloud/login">Try __FREE_DELIVERIES__ deliveries free →</a>', {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
      true,
    );
    const body = await response.text();
    expect(body).toContain(`Try ${pricing.freeDeliveries} deliveries free →`);
    expect(body).not.toContain(pricing.freeDeliveriesToken);
  });

  it("injects server-rendered avatars and makes the wall visible when data exists", async () => {
    const html = '<section data-avatar-wall __FOUNDING_AVATARS_HIDDEN__><div data-avatar-list>__FOUNDING_AVATARS__</div></section>';
    const response = await assetResponse(
      new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
      true,
      { logins: ["alice", "bob&co"], total: 2 },
    );
    const body = await response.text();
    expect(body).toContain('title="alice"');
    expect(body).toContain('title="bob&amp;co"');
    expect(body).toContain("avatars.githubusercontent.com/bob%26co?s=80");
    expect(body.match(/class="orbi-avatar-wall-list-img"/g)).toHaveLength(2);
    // Issue #892: screen readers and image search must hear who each face is,
    // so the alt names the contributor and keeps title="<login>" alongside.
    expect(body).toContain('alt="GitHub contributor alice"');
    expect(body).toContain('alt="GitHub contributor bob&amp;co"');
    // Issue #586: the wall sits thousands of pixels below the fold, so every
    // avatar defers its download instead of competing with the hero.
    for (const img of body.match(/<img class="orbi-avatar-wall-list-img"[^>]*>/g) ?? []) {
      expect(img).toContain('loading="lazy"');
      expect(img).toContain('decoding="async"');
      expect(img).not.toContain('alt=""');
    }
    expect(body).not.toContain("__FOUNDING_AVATARS__");
    expect(body).not.toContain("__FOUNDING_AVATARS_HIDDEN__");
    expect(body).toContain('<section data-avatar-wall >');
  });

  it("keeps the server-rendered avatar wall hidden when no data exists", async () => {
    const html = '<section data-avatar-wall __FOUNDING_AVATARS_HIDDEN__><div data-avatar-list>__FOUNDING_AVATARS__</div></section>';
    const response = await assetResponse(
      new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
      true,
    );
    const body = await response.text();
    expect(body).toContain('<section data-avatar-wall hidden>');
    expect(body).not.toContain("__FOUNDING_AVATARS_HIDDEN__");
    expect(body).not.toContain("__FOUNDING_AVATARS__");
  });

  it("injects tenant avatars on the homepage path, not through /stats", async () => {
    const logins = Array.from({ length: 11 }, (_, index) => `user-${index}`);
    const response = await handleFetch(new Request("https://orbi.build/"), {
      ASSETS: { fetch: async () => new Response('<div data-avatar-list>__FOUNDING_AVATARS__</div>', { headers: { "Content-Type": "text/html; charset=utf-8" } }) },
      CONTROL_PLANE_DB: {
        prepare(sql) {
          return { all: async () => (sql.includes("COUNT(*)")
            ? { results: [{ total: 11 }] }
            : { results: logins.map((login) => ({ login })) }) };
        },
      },
    });
    const body = await response.text();
    expect((body.match(/avatars\.githubusercontent\.com/g) || [])).toHaveLength(11);
    expect(body).not.toContain("avatar-wall-more");
  });

  // Issue #827: however many teams sign up, the visible row stays 18 faces
  // plus one "+K" chip, so the wall cannot overflow a phone.
  it("caps the rendered avatar wall at 18 faces and counts the rest in a +K chip", async () => {
    const logins = Array.from({ length: 18 }, (_, index) => `user-${index}`);
    const response = await handleFetch(new Request("https://orbi.build/"), {
      ASSETS: { fetch: async () => new Response('<section data-avatar-wall __FOUNDING_AVATARS_HIDDEN__><div data-avatar-list>__FOUNDING_AVATARS__</div></section>', { headers: { "Content-Type": "text/html; charset=utf-8" } }) },
      CONTROL_PLANE_DB: {
        prepare(sql) {
          return { all: async () => (sql.includes("COUNT(*)")
            ? { results: [{ total: 30 }] }
            : { results: logins.map((login) => ({ login })) }) };
        },
      },
    });
    const body = await response.text();
    expect(body.match(/class="orbi-avatar-wall-list-img"/g)).toHaveLength(18);
    expect(body).toContain('<span class="avatar-wall-more" title="30 teams">+12</span>');
    expect(body).toContain('<section data-avatar-wall >');
  });

  it("omits the +K chip when every team is already visible", async () => {
    const logins = Array.from({ length: 18 }, (_, index) => `user-${index}`);
    const response = await handleFetch(new Request("https://orbi.build/zh/"), {
      ASSETS: { fetch: async () => new Response('<section data-avatar-wall __FOUNDING_AVATARS_HIDDEN__><div data-avatar-list>__FOUNDING_AVATARS__</div></section>', { headers: { "Content-Type": "text/html; charset=utf-8" } }) },
      CONTROL_PLANE_DB: {
        prepare(sql) {
          return { all: async () => (sql.includes("COUNT(*)")
            ? { results: [{ total: 18 }] }
            : { results: logins.map((login) => ({ login })) }) };
        },
      },
    });
    const body = await response.text();
    expect(body.match(/class="orbi-avatar-wall-list-img"/g)).toHaveLength(18);
    expect(body).not.toContain("avatar-wall-more");
  });

  it("labels the +K chip in the page's own language", async () => {
    const logins = Array.from({ length: 18 }, (_, index) => `user-${index}`);
    const response = await handleFetch(new Request("https://orbi.build/zh/"), {
      ASSETS: { fetch: async () => new Response('<section data-avatar-wall __FOUNDING_AVATARS_HIDDEN__><div data-avatar-list>__FOUNDING_AVATARS__</div></section>', { headers: { "Content-Type": "text/html; charset=utf-8" } }) },
      CONTROL_PLANE_DB: {
        prepare(sql) {
          return { all: async () => (sql.includes("COUNT(*)")
            ? { results: [{ total: 30 }] }
            : { results: logins.map((login) => ({ login })) }) };
        },
      },
    });
    const body = await response.text();
    expect(body).toContain('title="30 个团队">+12</span>');
  });

  // Issue #892: the ZH homepage names the contributor in Chinese.
  it("labels every ZH avatar alt in Chinese", async () => {
    const logins = Array.from({ length: 2 }, (_, index) => `user-${index}`);
    const response = await handleFetch(new Request("https://orbi.build/zh/"), {
      ASSETS: { fetch: async () => new Response('<section data-avatar-wall __FOUNDING_AVATARS_HIDDEN__><div data-avatar-list>__FOUNDING_AVATARS__</div></section>', { headers: { "Content-Type": "text/html; charset=utf-8" } }) },
      CONTROL_PLANE_DB: {
        prepare(sql) {
          return { all: async () => (sql.includes("COUNT(*)")
            ? { results: [{ total: 2 }] }
            : { results: logins.map((login) => ({ login })) }) };
        },
      },
    });
    const body = await response.text();
    expect(body).toContain('alt="GitHub 贡献者 user-0"');
    expect(body).toContain('alt="GitHub 贡献者 user-1"');
    expect(body).not.toContain('alt="GitHub contributor');
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
    const env = { GITHUB_TOKEN: "token", STATS_KV: fakeStatsKv() };
    const first = await statsResponse(env);
    const firstPayload = await first.json();
    const callsAfterFirst = calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    const second = await statsResponse(env);
    expect(calls).toHaveLength(callsAfterFirst);
    expect(await second.json()).toEqual(firstPayload);
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
      STATS_KV: fakeStatsKv(),
      ASSETS: { fetch: () => Promise.resolve(new Response("missing", { status: 404 })) },
    };
    const bare = await handleFetch(new Request("https://orbi.build/stats"), env);
    const slashed = await handleFetch(new Request("https://orbi.build/stats/"), env);
    expect(bare.status).toBe(200);
    expect(slashed.status).toBe(bare.status);
    expect(await slashed.json()).toEqual(await bare.json());
  });
});

// Issue #873: the homepage's "Orbi builds Orbi" counters ship as literals so a
// reader that runs no JavaScript (an AI assistant fetching the page live, an
// AI search index crawler) reads the real totals, not 0. The browser path is
// unchanged — demo.js still fetches /stats and animates the same number.
describe("server-rendered homepage stats (Issue #873)", () => {
  const realFetch = globalThis.fetch;
  const realCaches = globalThis.caches;
  afterEach(() => {
    globalThis.fetch = realFetch;
    globalThis.caches = realCaches;
  });

  const fakeStats = {
    repos: {
      orbi: { started: "2026-08-24T16:08:33Z", issues_closed: 853, prs_merged: 615, releases: 87, stars: 195 },
      "orbi-website": { started: "2026-08-31T13:04:14Z", issues_closed: 383, prs_merged: 476, releases: 0, deploys: 458 },
      "orbi-cloud": { started: "2026-09-01T01:32:51Z", issues_closed: 1054, prs_merged: 738, releases: 122, stars: 1 },
    },
  };

  // The cache holds the same JSON /stats serves; undefined models a miss.
  function serveCachedStats(stats) {
    globalThis.caches = {
      default: {
        match: async () => (stats === undefined ? undefined : new Response(JSON.stringify(stats))),
        put: async () => {},
      },
    };
  }

  async function homepageEnvironment() {
    const pages = new Map([
      ["/", await readFile(new URL("../public/index.html", import.meta.url), "utf8")],
      ["/zh/", await readFile(new URL("../public/zh/index.html", import.meta.url), "utf8")],
    ]);
    return {
      ASSETS: {
        fetch: async (request) => {
          const html = pages.get(new URL(request.url).pathname);
          return html === undefined
            ? new Response("missing", { status: 404 })
            : new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        },
      },
    };
  }

  const statText = (html, repo, stat) => html.match(
    new RegExp('<strong[^>]*data-repo="' + repo + '"[^>]*data-stat="' + stat + '"[^>]*>([^<]*)</strong>'),
  )?.[1];
  const starText = (html) => html.match(new RegExp('<b[^>]*data-star-total[^>]*>([^<]*)</b>'))?.[1];
  const daysSince = (iso) => String(Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000)));

  it("writes the cached stats into the served HTML for / and /zh/", async () => {
    serveCachedStats(fakeStats);
    const env = await homepageEnvironment();
    for (const path of ["/", "/zh/"]) {
      const response = await handleFetch(new Request("https://orbi.build" + path), env);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(statText(html, "orbi", "prs")).toBe("615");
      expect(statText(html, "orbi", "issues")).toBe("853");
      expect(statText(html, "orbi", "releases")).toBe("87");
      expect(statText(html, "orbi", "days")).toBe(daysSince(fakeStats.repos.orbi.started));
      expect(statText(html, "orbi-website", "prs")).toBe("476");
      expect(statText(html, "orbi-website", "deploys")).toBe("458");
      expect(statText(html, "orbi-cloud", "prs")).toBe("738");
      expect(starText(html)).toBe("195");
      const rendered = [...html.matchAll(/data-stat="[^"]+"[^>]*>([^<]*)</g)].map((match) => match[1]);
      expect(rendered).not.toContain("0");
    }
  });

  it("falls back to each element's data-floor on a cache miss and warms /stats once", async () => {
    serveCachedStats(undefined);
    const warmed = [];
    const ctx = { waitUntil: (promise) => warmed.push(promise) };
    const response = await handleFetch(new Request("https://orbi.build/"), await homepageEnvironment(), ctx);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(statText(html, "orbi", "prs")).toBe("600");
    expect(statText(html, "orbi", "issues")).toBe("800");
    expect(statText(html, "orbi", "releases")).toBe("80");
    expect(statText(html, "orbi-website", "deploys")).toBe("400");
    expect(statText(html, "orbi-cloud", "issues")).toBe("1000");
    expect(starText(html)).toBe("190");
    expect(warmed).toHaveLength(1);
    await Promise.all(warmed);
  });

  // Issue #917: the homepage warms the colo cache in front of KV, so /stats
  // must answer from that entry with the headers its own route sets — the
  // entry is the served payload, not a second, thinner response.
  it("keeps the /stats security headers on the cache entry the homepage warms", async () => {
    const store = new Map();
    globalThis.caches = {
      default: {
        match: async (key) => {
          const entry = store.get(String(key));
          return entry === undefined ? undefined : new Response(entry.body, { headers: entry.headers });
        },
        put: async (key, response) => {
          store.set(String(key), { body: await response.text(), headers: response.headers });
        },
      },
    };
    const env = await homepageEnvironment();
    env.STATS_KV = fakeStatsKv(fakeStats);
    await handleFetch(new Request("https://orbi.build/"), env, { waitUntil: () => {} });
    const response = await handleFetch(new Request("https://orbi.build/stats"), env);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(await response.json()).toEqual(fakeStats);
  });

  // Issue #917: a colo whose 60s cache expired reads the global KV snapshot
  // instead of dropping to the floors; it never pulls GitHub itself.
  it("fills the homepage from the global KV snapshot when the cache is empty", async () => {
    serveCachedStats(undefined);
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("GitHub must not be called for a KV snapshot");
    };
    const env = await homepageEnvironment();
    env.STATS_KV = fakeStatsKv(fakeStats);
    const response = await handleFetch(new Request("https://orbi.build/"), env, { waitUntil: () => {} });
    const html = await response.text();
    expect(statText(html, "orbi", "prs")).toBe("615");
    expect(statText(html, "orbi-website", "deploys")).toBe("458");
    expect(statText(html, "orbi-cloud", "issues")).toBe("1054");
    expect(starText(html)).toBe("195");
    expect(calls).toBe(0);
  });

  it("degrades only the missing repo's elements to their floors", async () => {
    serveCachedStats({ repos: { ...fakeStats.repos, "orbi-cloud": null } });
    const response = await handleFetch(new Request("https://orbi.build/"), await homepageEnvironment(), { waitUntil: () => {} });
    const html = await response.text();
    expect(statText(html, "orbi", "prs")).toBe("615");
    expect(statText(html, "orbi-cloud", "prs")).toBe("700");
    expect(statText(html, "orbi-cloud", "issues")).toBe("1000");
    expect(statText(html, "orbi-cloud", "days")).toBe("30");
  });
});

// Issue #173: curl orbi.build/status prints the real delivery counts as
// pasteable plaintext. Issue #917: the data comes from the global KV snapshot
// the cron writes; this is only a terminal rendering of that payload.
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
      STATS_KV: fakeStatsKv(),
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
    expect(body).toContain("https://docs.orbi.build");
  });

  // Issue #917: /status reads the same global KV snapshot /stats does.
  it("renders /status from the KV snapshot without calling GitHub", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("GitHub must not be called for a KV snapshot");
    };
    emptyCache();
    const env = statusEnv();
    env.STATS_KV = fakeStatsKv({
      repos: {
        orbi: { started: "2026-08-24T16:08:33Z", issues_closed: 800, prs_merged: 600, releases: 80, stars: 190 },
        "orbi-website": { started: "2026-08-31T13:04:14Z", issues_closed: 380, prs_merged: 470, releases: 0, deploys: 450 },
        "orbi-cloud": { started: "2026-09-01T01:32:51Z", issues_closed: 1050, prs_merged: 730, releases: 120, stars: 1 },
      },
    });
    const response = await handleFetch(
      new Request("https://orbi.build/status", { headers: { Accept: "*/*" } }),
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toMatch(/orbi\s+issues closed\s+800/);
    expect(calls).toBe(0);
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

  // Issue #593: the /stats route catches any failure and answers a fixed 502
  // body — GitHub's own text (rate-limit, token-scope) must not leak to
  // anonymous callers. loadStats swallows per-repo failures, so a rejecting
  // cache.match is what reaches the route's catch.
  it("answers /stats failures with a fixed 502 body, not the upstream text", async () => {
    globalThis.caches = { default: { match: () => Promise.reject(new Error("API rate limit exceeded for token scope repo")), put: async () => {} } };
    const response = await handleFetch(new Request("https://orbi.build/stats"), statusEnv());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream unavailable" });
  });
});

describe("email subscription route (Issue #674)", () => {
  const env = (newsletter, cloud = vi.fn()) => ({ NEWSLETTER_SUBSCRIBE_SECRET: "subscribe-secret", NEWSLETTER: { fetch: newsletter }, CLOUD: { fetch: cloud } });

  it("forwards the newsletter request with attribution, page pathname, and secret", async () => {
    let sent;
    const cloud = vi.fn();
    const newsletter = async (request) => { sent = request; return new Response("ok"); };
    const request = new Request("https://beta.orbi.build/subscribe", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Cookie: "vid=visitor-1; ref=x-2609240130", Referer: "https://orbi.build/zh/cloud/" },
      body: "email=ada%40example.com&lang=zh",
    });
    const response = await subscribeResponse(request, env(newsletter, cloud));
    expect(response.status).toBe(200);
    expect(cloud).not.toHaveBeenCalled();
    expect(sent.url).toBe("https://newsletter.orbi.build/api/subscribe");
    expect(sent.headers.get("Authorization")).toBe("Bearer subscribe-secret");
    expect(await sent.json()).toEqual({ email: "ada@example.com", lang: "zh", ref: "x-2609240130", vid: "visitor-1", page: "/zh/cloud/" });
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns invalid-email failure when newsletter returns 400", async () => {
    const request = new Request("https://beta.orbi.build/subscribe", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", lang: "zh" }),
    });
    const response = await subscribeResponse(request, env(async () => new Response("bad", { status: 400 })));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_email" });
  });

  it("maps newsletter failures and exceptions to 502", async () => {
    const request = new Request("https://beta.orbi.build/subscribe", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=ada%40example.com&lang=en",
    });
    for (const newsletter of [
      async () => new Response("created", { status: 201 }),
      async () => new Response("down", { status: 500 }),
      async () => { throw new Error("network down"); },
    ]) {
      const response = await subscribeResponse(request.clone(), env(newsletter));
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "unavailable" });
    }
  });

  it("returns 503 and logs when newsletter configuration is missing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const missing of [{ NEWSLETTER_SUBSCRIBE_SECRET: "subscribe-secret" }, { NEWSLETTER: { fetch: vi.fn() } }]) {
        const response = await subscribeResponse(new Request("https://beta.orbi.build/subscribe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "ada@example.com", lang: "en" }),
        }), missing);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "unavailable" });
      }
      expect(error).toHaveBeenCalledTimes(2);
    } finally {
      error.mockRestore();
    }
  });

  it("answers JSON only, never a redirect", async () => {
    const response = await subscribeResponse(new Request("https://beta.orbi.build/subscribe", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=ada%40example.com&lang=zh",
    }), env(async () => new Response("ok")));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(await response.json()).toEqual({ ok: true });
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

describe("/x short link (Issue #772)", () => {
  const env = {
    ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) },
  };

  it.each([
    ["https://orbi.build/x", "https://orbi.build/?ref=x-bio"],
    ["https://orbi.build/x/", "https://orbi.build/?ref=x-bio"],
    ["https://beta.orbi.build/x", "https://beta.orbi.build/?ref=x-bio"],
  ])("302s %s to the homepage on the request host", async (from, to) => {
    const response = await handleFetch(new Request(from), env);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(to);
  });

  it("seeds x-bio attribution on the redirected HTML landing request", async () => {
    const response = await worker.fetch(new Request("https://orbi.build/?ref=x-bio", {
      headers: { Accept: "text/html" },
    }), {
      ASSETS: { fetch: async () => new Response("<html>home</html>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }) },
    }, {});
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toContain(
      "ref=x-bio; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure",
    );
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

describe("engagement beacon", () => {
  it("accepts new-format CTA details and forwards each event to Cloud", async () => {
    const forwarded = [];
    const reports = [];
    const env = {
      CLOUD_VISIT_URL: "https://cloud.test/visit",
      WEBSITE_SECRET: "secret",
      CLOUD: { fetch: async request => { forwarded.push(await request.json()); return new Response(null, { status: 204 }); } },
    };
    for (const detail of ["nav-start", "closing-start", "pricing-summary"]) {
      const response = await handleFetch(
        new Request("https://beta.orbi.build/cloud/e", {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
          body: JSON.stringify({ kind: "cta_click", path: "/", detail }),
        }),
        env,
        { waitUntil: promise => reports.push(promise) },
      );
      expect(response.status).toBe(204);
    }
    await Promise.all(reports);
    expect(forwarded.map(event => event.detail).sort()).toEqual(["closing-start", "nav-start", "pricing-summary"]);
  });

  it("rejects CTA details outside the Cloud format", async () => {
    const fetchMock = vi.fn();
    const response = await handleFetch(
      new Request("https://beta.orbi.build/cloud/e", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ kind: "cta_click", detail: "Nav Start" }),
      }),
      { CLOUD_VISIT_URL: "https://cloud.test/visit", WEBSITE_SECRET: "secret", CLOUD: { fetch: fetchMock } },
      { waitUntil: vi.fn() },
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("internal maintainer tracking (Issue #718)", () => {
  const assets = {
    fetch: async () => new Response("<html>page</html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
  };

  it("sets and clears the internal cookie from page query parameters", async () => {
    const enabled = await worker.fetch(new Request("https://beta.orbi.build/?internal=1", {
      headers: { Cookie: "vid=ExistingVidValue123456" },
    }), { ASSETS: assets }, {});
    expect(enabled.headers.getSetCookie()).toEqual([
      "orbi_internal=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    ]);

    const disabled = await worker.fetch(new Request("https://beta.orbi.build/?internal=0", {
      headers: { Cookie: "vid=ExistingVidValue123456; orbi_internal=1" },
    }), { ASSETS: assets }, {});
    expect(disabled.headers.getSetCookie()).toEqual([
      "orbi_internal=; Path=/; Max-Age=0; SameSite=Lax; Secure",
    ]);
  });

  it("returns 204 without forwarding maintainer visit and CTA events", async () => {
    const fetchMock = vi.fn();
    const ctx = { waitUntil: vi.fn() };
    for (const event of [
      { kind: "visit", search: "", referrer: "" },
      { kind: "cta_click", detail: "home-hero" },
    ]) {
      const response = await worker.fetch(new Request("https://beta.orbi.build/cloud/e", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: "orbi_internal=1; vid=internal-visitor" },
        body: JSON.stringify(event),
      }), { CLOUD_VISIT_URL: "https://cloud.test/visit", WEBSITE_SECRET: "secret", CLOUD: { fetch: fetchMock } }, ctx);
      expect(response.status).toBe(204);
    }
    expect(ctx.waitUntil).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards non-internal events as before", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const pending = [];
    const ctx = { waitUntil: (promise) => pending.push(promise) };
    const response = await worker.fetch(new Request("https://beta.orbi.build/cloud/e", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "vid=visitor-1", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({ kind: "cta_click", detail: "home-hero" }),
    }), { CLOUD_VISIT_URL: "https://cloud.test/visit", WEBSITE_SECRET: "secret", CLOUD: { fetch: fetchMock } }, ctx);
    expect(response.status).toBe(204);
    await Promise.all(pending);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// Issue #618: visits are reported by the page beacon, not by HTML responses.
describe("page attribution", () => {
  const assets = {
    fetch: async () => new Response("<html>page</html>", {
      headers: { "Content-Type": "text/html; charset=utf-8", ETag: '"asset-etag-1"' },
    }),
  };

  it("seeds attribution cookies without reporting an HTML response", async () => {
    const fetchMock = vi.fn();
    const ctx = { waitUntil: vi.fn() };
    const response = await worker.fetch(new Request("https://beta.orbi.build/?ref=x-2609281823"), { ASSETS: assets, CLOUD_VISIT_URL: "https://cloud.test/visit", WEBSITE_SECRET: "secret", CLOUD: { fetch: fetchMock } }, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^vid=[A-Za-z0-9_-]{22}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure$/),
      expect.stringContaining("ref=x-2609281823;"),
    ]);
    expect(response.headers.get("ETag")).toBe('"asset-etag-1"');
    expect(ctx.waitUntil).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps direct, derived first-touch, and explicit last-touch ref cookie semantics", async () => {
    const baseEnv = { ASSETS: assets };

    const direct = await worker.fetch(new Request("https://beta.orbi.build/"), baseEnv, {});
    expect(direct.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^vid=[A-Za-z0-9_-]{22}; /),
    ]);

    const referred = await worker.fetch(new Request("https://beta.orbi.build/", {
      headers: { Referer: "https://News.Ycombinator.com/item?id=1" },
    }), baseEnv, {});
    expect(referred.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^vid=[A-Za-z0-9_-]{22}; /),
      expect.stringContaining("ref=news.ycombinator.com;"),
    ]);

    const repeat = await worker.fetch(new Request("https://beta.orbi.build/?ref=BBB", {
      headers: { Cookie: "vid=ExistingVidValue123456; ref=aaa" },
    }), baseEnv, {});
    expect(repeat.headers.getSetCookie()).toEqual([
      "ref=bbb; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure",
    ]);
  });

  it("keeps internal referrals out of the ref cookie", async () => {
    const response = await worker.fetch(new Request("https://beta.orbi.build/", {
      headers: { Referer: "https://orbi.build/" },
    }), { ASSETS: assets }, {});
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^vid=[A-Za-z0-9_-]{22}; /),
    ]);
  });

  it("keeps utm_source first-touch and preserves an existing ref cookie", async () => {
    const first = await worker.fetch(
      new Request("https://beta.orbi.build/?utm_source=ChatGPT.com"),
      { ASSETS: assets },
      {},
    );
    expect(first.headers.getSetCookie()).toContain(
      "ref=chatgpt.com; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure",
    );

    const repeat = await worker.fetch(new Request("https://beta.orbi.build/?utm_source=other.com", {
      headers: { Cookie: "vid=ExistingVidValue123456; ref=chatgpt.com" },
    }), { ASSETS: assets }, {});
    expect(repeat.headers.getSetCookie()).toEqual([]);
  });

  it("keeps attribution cookies non-Secure over http", async () => {
    const response = await worker.fetch(
      new Request("http://beta.orbi.build/?ref=xtest"),
      { ASSETS: assets },
      {},
    );
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^vid=[A-Za-z0-9_-]{22}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=7776000$/),
      "ref=xtest; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000",
    ]);
  });

  it("keeps planting a campaign ref on the Cloud login handoff", async () => {
    const response = await worker.fetch(new Request("https://beta.orbi.build/cloud/login?ref=x-2609201530", {
      headers: { Cookie: "vid=ExistingVidValue123456" },
    }), {
      CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login",
      ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) },
    }, {});
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://beta.orbi.build/api/login");
    expect(response.headers.getSetCookie()).toEqual([
      "ref=x-2609201530; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure",
    ]);
  });

  it("does not report non-HTML responses either", async () => {
    const fetchMock = vi.fn();
    const response = await worker.fetch(new Request("https://beta.orbi.build/styles.css"), {
      ASSETS: { fetch: async () => new Response("body", { headers: { "Content-Type": "text/css" } }) },
      CLOUD_VISIT_URL: "https://cloud.test/visit", WEBSITE_SECRET: "secret", CLOUD: { fetch: fetchMock },
    }, { waitUntil: vi.fn() });
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// The unrelated request.cf diagnostic contract remains covered while server-side
// HTML visit reporting is removed.
describe("/__cf diagnostic (Issue #251)", () => {
  function requestWithCf(url, cf) {
    const request = new Request(url);
    request.cf = cf;
    return request;
  }

  const env = {
    ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) },
  };
  const notFoundAssets = {
    ASSETS: { fetch: () => Promise.resolve(new Response("missing", { status: 404 })) },
  };

  it("echoes request.cf fields without caching on beta", async () => {
    const response = await handleFetch(
      requestWithCf("https://beta.orbi.build/__cf", { botManagement: { score: 7 }, asn: 24940, colo: "FRA" }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ botManagement: { score: 7 }, asn: 24940, colo: "FRA" });
  });

  it("answers null when botManagement or request.cf is absent", async () => {
    const partial = await handleFetch(
      requestWithCf("https://beta.orbi.build/__cf", { asn: 24940, colo: "HKG" }),
      env,
    );
    expect(await partial.json()).toEqual({ botManagement: null, asn: 24940, colo: "HKG" });

    const local = await handleFetch(new Request("https://beta.orbi.build/__cf/"), env);
    expect(local.status).toBe(200);
    expect(await local.json()).toEqual({ botManagement: null, asn: undefined, colo: undefined });
  });

  it("stays unavailable on production hosts", async () => {
    const apex = await handleFetch(new Request("https://orbi.build/__cf"), notFoundAssets);
    expect(apex.status).toBe(404);
    const aiready = await handleFetch(new Request("https://aiready.sh/__cf"), notFoundAssets);
    expect(aiready.status).toBe(302);
    expect(aiready.headers.get("Location")).toBe("https://orbi.build/__cf");
  });
});
