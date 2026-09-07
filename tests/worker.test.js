import { describe, expect, it } from "vitest";
import { cloudLoginResponse, configuredCloudLoginUrl, field, fetchAsset, githubHeaders, handleFetch } from "../src/worker.js";

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
      new Request("https://orbi.build/api/login?tenant=untrusted"),
      "https://beta.orbi.build/api/login",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://beta.orbi.build/api/login");
  });

  it("routes the public API login path to the Cloud handoff", async () => {
    const response = await handleFetch(
      new Request("https://orbi.build/api/login?tenant=untrusted"),
      { CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login", ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) } },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://beta.orbi.build/api/login");
  });

  it.each([
    ["production", "https://cloud.orbi.build/api/login"],
    ["beta", "https://beta.orbi.build/api/login"],
  ])("redirects the %s Cloud login URL", async (_environment, loginUrl) => {
    const response = cloudLoginResponse(new Request("https://orbi.build/api/login"), loginUrl);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(loginUrl);
  });

  it.each([undefined, "not a URL", "http://cloud.orbi.build/api/login", "https://cloud.orbi.build/login"])(
    "fails closed for invalid Cloud login configuration (%s)", async (loginUrl) => {
      expect(configuredCloudLoginUrl(loginUrl).error).toBeTruthy();
      const response = cloudLoginResponse(new Request("https://orbi.build/api/login"), loginUrl);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Cloud is temporarily unavailable" });
    },
  );

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
