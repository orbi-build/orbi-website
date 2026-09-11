import { describe, expect, it } from "vitest";
import { cloudLoginResponse, field, fetchAsset, githubHeaders, handleFetch } from "../src/worker.js";

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

  it("fails clearly when Cloud is not configured", async () => {
    const response = cloudLoginResponse(new Request("https://orbi.build/cloud/login"));
    expect(response.status).toBe(503);
  });

  it("fail-closes the login route with 503 when CLOUD_LOGIN_URL is absent (Issue #77)", async () => {
    const response = await handleFetch(
      new Request("https://orbi.build/cloud/login"),
      { ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) } },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Cloud is temporarily unavailable" });
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
