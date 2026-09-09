import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { assertCloudLoginRedirect, resolveCloudLoginExpect } from "./homepage.smoke.mjs";

const port = 4173;
const processes = [];

function loginServer(handler) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const stopLoginServer = (server) =>
  new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

// The site Worker stamps these on every asset response, including its 404
// fall-through; the Cloud control plane sends none of them (verified live
// 2026-09-08 against orbi.build and beta.orbi.build /api/login).
const siteWorker404 = (_request, response) => {
  response.writeHead(404, {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
  });
  response.end();
};

// Same stamp, 503: production's fail-closed /cloud/login answer while no
// CLOUD_LOGIN_URL is configured (Issue #77).
const siteWorker503 = (_request, response) => {
  response.writeHead(503, {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
  });
  response.end();
};

const redirect = (location) => (_request, response) => {
  response.writeHead(302, { location });
  response.end();
};

// Issue #76: the full beta login chain is /cloud/login (the website's
// handoff, 302) -> /api/login (the Cloud control plane, 302) -> GitHub
// OAuth. A hijacked handoff leads somewhere that answers the site Worker's
// stamped 404, which the smoke must reject.
const oauthChain = (hijackHandoff = false) => (request, response) => {
  const { pathname } = new URL(request.url, "http://x");
  if (pathname === "/cloud/login") {
    const base = `http://${request.headers.host}`;
    response.writeHead(302, {
      location: hijackHandoff ? `${base}/not-the-handoff` : `${base}/api/login`,
    });
    response.end();
    return;
  }
  if (pathname === "/api/login" && !hijackHandoff) {
    response.writeHead(302, { location: "https://github.com/login/oauth/authorize?client_id=x" });
    response.end();
    return;
  }
  siteWorker404(request, response);
};

afterEach(() => {
  for (const child of processes.splice(0)) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
});

describe("cloud login smoke contract (Issue #74)", () => {
  afterEach(() => {
    delete process.env.BASE_URL;
    delete process.env.CLOUD_LOGIN_EXPECT;
  });

  async function withLoginServer(handler, run) {
    const server = await loginServer(handler);
    try {
      await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
      await stopLoginServer(server);
    }
  }

  it("defaults to fail-closed-404 when CLOUD_LOGIN_EXPECT is missing", async () => {
    expect(resolveCloudLoginExpect(undefined)).toBe("fail-closed-404");
    process.env.BASE_URL = "https://smoke.example";
    await withLoginServer(siteWorker404, (url) =>
      expect(assertCloudLoginRedirect(url)).resolves.toBeUndefined());
  });

  it("fail-closed-404 accepts the site Worker's stamped 404", async () => {
    process.env.BASE_URL = "https://smoke.example";
    process.env.CLOUD_LOGIN_EXPECT = "fail-closed-404";
    await withLoginServer(siteWorker404, (url) =>
      expect(assertCloudLoginRedirect(url)).resolves.toBeUndefined());
  });

  it("fail-closed-404 rejects a 404 from something other than the site Worker", async () => {
    process.env.BASE_URL = "https://smoke.example";
    process.env.CLOUD_LOGIN_EXPECT = "fail-closed-404";
    await withLoginServer((_request, response) => response.writeHead(404).end(), (url) =>
      expect(assertCloudLoginRedirect(url)).rejects.toThrow(/security-header stamp/));
  });

  it("fail-closed-404 rejects a live login handoff", async () => {
    process.env.BASE_URL = "https://smoke.example";
    process.env.CLOUD_LOGIN_EXPECT = "fail-closed-404";
    await withLoginServer(redirect("https://github.com/login/oauth/authorize?client_id=x"), (url) =>
      expect(assertCloudLoginRedirect(url)).rejects.toThrow(/fail-closed 404, got 302/));
  });

  it("oauth-302 accepts the full handoff chain ending in the GitHub OAuth redirect", async () => {
    process.env.BASE_URL = "https://smoke.example";
    process.env.CLOUD_LOGIN_EXPECT = "oauth-302";
    await withLoginServer(oauthChain(), (url) =>
      expect(assertCloudLoginRedirect(url)).resolves.toBeUndefined());
  });

  it("oauth-302 rejects the 404 that caused the 2026-09-08 rollback (run 34190044563)", async () => {
    process.env.BASE_URL = "https://smoke.example";
    process.env.CLOUD_LOGIN_EXPECT = "oauth-302";
    await withLoginServer(siteWorker404, (url) =>
      expect(assertCloudLoginRedirect(url)).rejects.toThrow("Cloud login expected 302, got 404"));
  });

  it("oauth-302 rejects a handoff that never reaches the GitHub OAuth redirect", async () => {
    process.env.BASE_URL = "https://smoke.example";
    process.env.CLOUD_LOGIN_EXPECT = "oauth-302";
    await withLoginServer(oauthChain(true), (url) =>
      expect(assertCloudLoginRedirect(url)).rejects.toThrow(/did not redirect to GitHub OAuth/));
  });

  it("fail-closed-503 accepts the site Worker's stamped 503 (Issue #77 production contract)", async () => {
    process.env.BASE_URL = "https://smoke.example";
    process.env.CLOUD_LOGIN_EXPECT = "fail-closed-503";
    await withLoginServer(siteWorker503, (url) =>
      expect(assertCloudLoginRedirect(url)).resolves.toBeUndefined());
  });

  it("fail-closed-503 rejects a 503 from something other than the site Worker", async () => {
    process.env.BASE_URL = "https://smoke.example";
    process.env.CLOUD_LOGIN_EXPECT = "fail-closed-503";
    await withLoginServer((_request, response) => response.writeHead(503).end(), (url) =>
      expect(assertCloudLoginRedirect(url)).rejects.toThrow(/security-header stamp/));
  });

  it("fail-closed-503 rejects a live login handoff", async () => {
    process.env.BASE_URL = "https://smoke.example";
    process.env.CLOUD_LOGIN_EXPECT = "fail-closed-503";
    await withLoginServer(redirect("https://github.com/login/oauth/authorize?client_id=x"), (url) =>
      expect(assertCloudLoginRedirect(url)).rejects.toThrow(/fail-closed 503, got 302/));
  });

  it("skips the check entirely without BASE_URL (local run)", async () => {
    await withLoginServer(siteWorker404, () =>
      expect(assertCloudLoginRedirect("http://127.0.0.1:9")).resolves.toBeUndefined());
  });

  it("fails fast on an unknown CLOUD_LOGIN_EXPECT value", () => {
    expect(resolveCloudLoginExpect("oauth-302")).toBe("oauth-302");
    expect(resolveCloudLoginExpect("fail-closed-503")).toBe("fail-closed-503");
    expect(resolveCloudLoginExpect("fail-closed-404")).toBe("fail-closed-404");
    expect(() => resolveCloudLoginExpect("")).toThrow(/CLOUD_LOGIN_EXPECT/);
    expect(() => resolveCloudLoginExpect("302")).toThrow(/CLOUD_LOGIN_EXPECT/);
    // Issue #77 removed production's CLOUD_LOGIN_URL, so the handoff 302 is
    // no longer a contract any environment can declare.
    expect(() => resolveCloudLoginExpect("cloud-handoff-302")).toThrow(/CLOUD_LOGIN_EXPECT/);
  });
});

describe("browser smoke lifecycle", () => {
  it("exits non-zero and stops the local server when launch fails", async () => {
    const child = spawn(process.execPath, ["tests/homepage.smoke.mjs"], {
      env: { ...process.env, PLAYWRIGHT_EXECUTABLE_PATH: "/does-not-exist/chromium" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    processes.push(child);

    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("browser smoke did not exit after launch failure"));
      }, 5000);
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });

    expect(result.code).not.toBe(0);
    expect(result.signal).toBeNull();

    const probe = await fetch(`http://127.0.0.1:${port}`).catch(() => null);
    expect(probe).toBeNull();
  }, 10000);
});
