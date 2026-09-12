import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  assertCloudLoginRedirect,
  expectedCtaLanding,
  localStatsFixture,
  resolveCloudLoginExpect,
  statsMatchServedStats,
} from "./homepage.smoke.mjs";

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

// Issue #107: a Cloud CTA's contract is where its click lands — the endpoint
// CLOUD_LOGIN_EXPECT declares — never the href literal, which the site Worker
// rewrites where CLOUD_LOGIN_URL is unset (Issue #77). Pinning the href copied
// that rewrite into the test and broke beta's deploy smoke while the site
// itself was fine.
describe("Cloud CTA landing contract (Issue #107)", () => {
  it("oauth-302 lands the click in GitHub's OAuth authorize flow", () => {
    const landing = expectedCtaLanding("oauth-302");
    // A signed-in browser renders the authorize prompt at its own URL.
    expect(landing.matches(new URL("https://github.com/login/oauth/authorize?client_id=x"))).toBe(true);
    // A signed-out browser is bounced once more by GitHub to its sign-in
    // page, which preserves the authorize request in return_to — the real
    // landing observed live 2026-09-12 against beta (run 8ba73105).
    expect(landing.matches(new URL(
      "https://github.com/login?client_id=Iv23lihVKDs2CXkoaLg2"
      + "&return_to=%2Flogin%2Foauth%2Fauthorize%3Fclient_id%3DIv23lihVKDs2CXkoaLg2"
      + "%26redirect_uri%3Dhttps%253A%252F%252Fbeta.orbi.build%252Fapi%252Fauth%252Fcallback"
    ))).toBe(true);
    expect(landing.matches(new URL("https://beta.orbi.build/cloud/login"))).toBe(false);
    expect(landing.matches(new URL("https://beta.orbi.build/apply"))).toBe(false);
    // A bare sign-in page carries no authorize request: not the OAuth flow.
    expect(landing.matches(new URL("https://github.com/login"))).toBe(false);
  });

  it("fail-closed-503 lands the click on the /apply application page", () => {
    const landing = expectedCtaLanding("fail-closed-503");
    expect(landing.matches(new URL("https://orbi.build/apply"))).toBe(true);
    expect(landing.matches(new URL("https://orbi.build/cloud/login"))).toBe(false);
  });

  it("fail-closed-404 (local, no worker) lands the click on the /cloud/login handoff route", () => {
    const landing = expectedCtaLanding("fail-closed-404");
    expect(landing.matches(new URL("http://127.0.0.1:4173/cloud/login"))).toBe(true);
    expect(landing.matches(new URL("http://127.0.0.1:4173/apply"))).toBe(false);
  });

  it("each landing must answer with the status its contract promises", () => {
    expect(expectedCtaLanding("oauth-302").statusOk(200)).toBe(true);
    expect(expectedCtaLanding("oauth-302").statusOk(404)).toBe(false);
    expect(expectedCtaLanding("fail-closed-503").statusOk(200)).toBe(true);
    expect(expectedCtaLanding("fail-closed-503").statusOk(503)).toBe(false);
    // The fail-closed handoff answers 404 — statically locally, stamped by
    // the site Worker where one is deployed.
    expect(expectedCtaLanding("fail-closed-404").statusOk(404)).toBe(true);
    expect(expectedCtaLanding("fail-closed-404").statusOk(200)).toBe(false);
    expect(expectedCtaLanding("fail-closed-404").statusOk(503)).toBe(false);
  });
});

// Issue #126: the smoke's stats wait must hold against whatever /stats the
// page actually receives — the Worker's real response on beta, the local
// fixture (orbi-cloud null) locally — never against the fixture's specific
// numbers. The predicate mirrors demo.js's render contract: a repo's days
// come from its started date, each count from its mapped field, and a repo
// that is null (or missing the field for a stat) degrades exactly its own
// element to the HTML floor. These tests drive it through a minimal fake of
// the queried DOM instead of a real browser.
describe("stats render matches the served /stats payload (Issue #126)", () => {
  const daysSince = (iso) => String(Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000)));

  const stat = (name, floor, text) => ({
    getAttribute: (attr) => (attr === "data-stat" ? name : attr === "data-floor" ? floor : null),
    textContent: text,
  });
  const group = (name, stats) => ({
    getAttribute: (attr) => (attr === "data-repo-group" ? name : null),
    querySelectorAll: () => stats,
  });
  const rootOf = (groups) => ({ querySelectorAll: () => groups });

  // The three groups' HTML floors (site/pages/index.html).
  const orbiGroup = (days, issues, prs, releases) =>
    group("orbi", [stat("days", "12", days), stat("issues", "150", issues), stat("prs", "150", prs), stat("releases", "8", releases)]);
  const websiteGroup = (days, issues, prs, deploys) =>
    group("orbi-website", [stat("days", "7", days), stat("issues", "30", issues), stat("prs", "28", prs), stat("deploys", "20", deploys)]);
  const cloudGroup = (days, issues, prs, releases) =>
    group("orbi-cloud", [stat("days", "7", days), stat("issues", "60", issues), stat("prs", "60", prs), stat("releases", "2", releases)]);

  it("accepts the real beta payload whose render timed out the failing run (regression)", () => {
    // The shape run 34673771698 rendered before the fix (orbi/issues=376,
    // orbi-website/deploys=43, orbi-cloud/issues=122 …): the old assertion
    // pinned the fixture's 1s and could never accept this.
    const served = { repos: {
      orbi: { started: "2026-08-25T00:00:00Z", issues_closed: 376, prs_merged: 298, releases: 19, stars: 623, star_history: [{ stars: 1 }, { stars: 623 }] },
      "orbi-website": { started: "2026-09-01T00:00:00Z", issues_closed: 62, prs_merged: 59, releases: 6, stars: 0, star_history: [], deploys: 43 },
      "orbi-cloud": { started: "2026-09-01T00:00:00Z", issues_closed: 122, prs_merged: 125, releases: 3, stars: 0, star_history: [], deploys: 5 },
    } };
    const rendered = [
      orbiGroup(daysSince("2026-08-25T00:00:00Z"), "376", "298", "19"),
      websiteGroup(daysSince("2026-09-01T00:00:00Z"), "62", "59", "43"),
      cloudGroup(daysSince("2026-09-01T00:00:00Z"), "122", "125", "3"),
    ];
    expect(statsMatchServedStats(served, rootOf(rendered))).toBe(true);
  });

  it("accepts the local fixture: null orbi-cloud degrades exactly its floors while the live groups show the served values (Issue #101)", () => {
    const days = daysSince(localStatsFixture.repos.orbi.started);
    const rendered = [
      orbiGroup(days, "1", "1", "1"),
      websiteGroup(days, "1", "1", "1"),
      cloudGroup("7", "60", "60", "2"),
    ];
    expect(statsMatchServedStats(localStatsFixture, rootOf(rendered))).toBe(true);
  });

  it("rejects blur in both directions: floors leaking into a served group, live values into the degraded group", () => {
    const served = { repos: {
      orbi: { started: "2025-01-01T00:00:00Z", issues_closed: 1, prs_merged: 1, releases: 1, stars: 2 },
      "orbi-website": { started: "2025-01-01T00:00:00Z", issues_closed: 1, prs_merged: 1, releases: 0, deploys: 1 },
      "orbi-cloud": null,
    } };
    const days = daysSince("2025-01-01T00:00:00Z");
    const cloudShowsLive = [
      orbiGroup(days, "1", "1", "1"),
      websiteGroup(days, "1", "1", "1"),
      cloudGroup(days, "122", "60", "2"),
    ];
    expect(statsMatchServedStats(served, rootOf(cloudShowsLive))).toBe(false);
    const orbiShowsFloors = [
      orbiGroup("12", "150", "150", "8"),
      websiteGroup(days, "1", "1", "1"),
      cloudGroup("7", "60", "60", "2"),
    ];
    expect(statsMatchServedStats(served, rootOf(orbiShowsFloors))).toBe(false);
  });

  it("degrades exactly the elements whose served field is missing and holds the rest on the served values", () => {
    const served = { repos: {
      orbi: { started: "2026-08-25T00:00:00Z", issues_closed: 376, prs_merged: 298 },
      "orbi-website": { started: "2026-09-01T00:00:00Z", issues_closed: 62, prs_merged: 59, deploys: 43 },
      "orbi-cloud": { started: "2026-09-01T00:00:00Z", issues_closed: 122, prs_merged: 125, releases: 3 },
    } };
    const rendered = [
      orbiGroup(daysSince("2026-08-25T00:00:00Z"), "376", "298", "8"),
      websiteGroup(daysSince("2026-09-01T00:00:00Z"), "62", "59", "43"),
      cloudGroup(daysSince("2026-09-01T00:00:00Z"), "122", "125", "3"),
    ];
    expect(statsMatchServedStats(served, rootOf(rendered))).toBe(true);
  });

  it("degrades every group to its floors when no payload reached the page (failed or unparseable /stats)", () => {
    const floors = [orbiGroup("12", "150", "150", "8"), websiteGroup("7", "30", "28", "20"), cloudGroup("7", "60", "60", "2")];
    expect(statsMatchServedStats(null, rootOf(floors))).toBe(true);
    expect(statsMatchServedStats(undefined, rootOf(floors))).toBe(true);
    const live = [orbiGroup("18", "376", "298", "19"), websiteGroup("7", "30", "28", "20"), cloudGroup("7", "60", "60", "2")];
    expect(statsMatchServedStats(null, rootOf(live))).toBe(false);
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
