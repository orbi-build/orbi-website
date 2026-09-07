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
      new Request("https://orbi.build/api/login?tenant=untrusted"),
      "https://cloud.orbi.build",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://cloud.orbi.build/login");
  });

  it("routes the public API login path to the Cloud handoff", async () => {
    const response = await handleFetch(
      new Request("https://orbi.build/api/login?tenant=untrusted"),
      { CLOUD_BASE_URL: "https://cloud.orbi.build", ASSETS: { fetch: () => Promise.reject(new Error("asset fallback")) } },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://cloud.orbi.build/login");
  });

  it("fails clearly when Cloud is not configured", async () => {
    const response = cloudLoginResponse(new Request("https://orbi.build/api/login"));
    expect(response.status).toBe(503);
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
