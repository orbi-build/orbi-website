import { chromium, request } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
const targetURL = process.env.BASE_URL || baseURL;
const artifacts = ".orbi";

// The homepage's one-line install command. aiready.sh is the canonical
// public entry (Issue #186): a visitor on any environment is told to fetch
// the same production script, never a preview host. The underlying asset
// remains public/install.sh; this line is the user-facing command.
const installCommand = "curl -fsSL https://aiready.sh | sh";

// Same order as the /compare/ grid; anchor text matches each page's own title.
const deepDives = [
  ["Orbi vs Orca", "/compare/orca/"],
  ["Orbi vs OpenClaw", "/compare/openclaw/"],
  ["Orbi vs GitHub Copilot coding agent", "/compare/github-copilot-coding-agent/"],
  ["Orbi vs Claude Managed Agents", "/compare/managed-agents/"],
  ["Orbi vs Claude Code", "/compare/claude-code/"],
  ["Orbi vs OpenHands", "/compare/openhands/"],
  ["Orbi vs Hermes Agent", "/compare/hermes-agent/"],
  ["Orbi vs OpenAI Codex", "/compare/codex/"],
  ["Orbi vs Devin", "/compare/devin/"],
  ["Orbi vs Google Jules", "/compare/jules/"],
  ["Orbi vs Cursor Cloud Agents", "/compare/cursor/"],
];

// Issue #91: the hero claims delivery to a tagged release. Issue #259 moved
// the three-segment breakdown to the trust line (heroTrustLine below) and
// shortened the lede to one sentence pair so the primary CTA stays inside
// the first screen; the lede keeps the workspace claim and the
// source-of-truth boundary.
const releaseClaims = {
  "/": {
    h1: "Turn GitHub Issues into tagged releases",
    lede: [
      "No new workspace.",
      "Orbi runs the delivery line on the Issues already in your repository",
      "GitHub stays the source of truth",
    ],
    title: "tagged releases",
  },
  "/zh/": {
    h1: "让 GitHub Issue 变成打 Tag 的发布",
    lede: [
      "不用迁移工作流。",
      "在仓库里已有的 Issue 上跑完整条交付线",
      "GitHub 始终是唯一事实源",
    ],
    title: "打 Tag 的 Release",
  },
};

// Issue #119: the hero trust line is the 5-second scan zone and must carry
// exactly the three delivery capabilities no competitor documents. The
// fair-code / self-host / BYOK attributes every competitor shares moved to
// the end of the How-it-works section — decision-stage (licence, data
// boundary, model lock-in), not first-glance, information.
const heroTrustLine = {
  "/": [
    "Independent review that fixes and re-tests",
    "Only the reviewed commit merges",
    "Frozen SHA, tag, release",
  ],
  "/zh/": [
    "独立审查能改代码并重跑测试",
    "只合并审过的那个 commit",
    "冻结 SHA、打 Tag、发 Release",
  ],
};
const sharedAttributes = {
  "/": [
    "Fair-code, free forever",
    "Self-hosted — code never leaves your machine",
    "Bring your own model",
  ],
  "/zh/": [
    "Fair-code，永久免费",
    "自托管 — 代码不离开你的机器",
    "自带模型",
  ],
};

// Issue #102: the shipped files carry the monthly price as a token and the
// site Worker resolves it while serving (src/worker.js). Issue #138 added the
// included-token quota to the same seam. This local server is the stand-in
// for that Worker, so it applies the same substitutions from the same single
// source before a page reaches the browser.
const pricing = JSON.parse(await readFile(new URL("../src/pricing.json", import.meta.url), "utf8"));

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

async function serveFile(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\/|\\)+/, "");
  if (relative.split("/").includes("..")) return null;
  const base = join("public", relative);
  const direct = await readFile(base).catch(() => null);
  if (direct !== null) return { path: base, body: direct };
  if (!extname(base)) {
    const index = await readFile(join(base, "index.html")).catch(() => null);
    if (index !== null) return { path: join(base, "index.html"), body: index };
  }
  return null;
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const { pathname } = new URL(request.url, "http://127.0.0.1");
      const file = await serveFile(pathname);
      if (!file) {
        response.writeHead(404);
        response.end();
        return;
      }
      const type = CONTENT_TYPES[extname(file.path).toLowerCase()] ?? "application/octet-stream";
      const body = type.startsWith("text/html")
        ? Buffer.from(
            file.body.toString("utf8")
              .replaceAll(pricing.monthlyUsdToken, String(pricing.cloudMonthlyUsd))
              .replaceAll(pricing.includedTokensToken, String(pricing.includedTokensLabel)),
          )
        : file.body;
      response.writeHead(200, { "content-type": type });
      response.end(body);
    } catch {
      response.writeHead(500);
      response.end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function stopServer(server) {
  if (!server || !server.listening) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function assertFooterDeepDives(page, label) {
  const links = await page.locator(".site-footer .footer-compare a").evaluateAll((nodes) =>
    nodes.map((a) => [a.textContent.trim(), a.getAttribute("href")])
  );
  for (const [text, href] of deepDives) {
    const match = links.find(([, linkHref]) => linkHref === href);
    if (!match) throw new Error(`${label}: footer is missing deep dive ${href}`);
    if (match[0] !== text) throw new Error(`${label}: ${href} anchor is "${match[0]}", expected "${text}"`);
  }
}

// Issue #74: the Cloud login contract differs per environment and is declared
// by the deploy workflow via CLOUD_LOGIN_EXPECT — never guessed here.
// Issue #76: the website's own login handoff is /cloud/login (never /api/ or
// any other prefix the Cloud control plane owns on the shared beta hostname).
// Issue #77: production configures no CLOUD_LOGIN_URL until a production
// control plane exists, so its /cloud/login fail-closes with the site
// Worker's stamped 503 and the served pages send the Cloud CTA to the docs.
// beta keeps the one verified Cloud login endpoint (docs/cloud-endpoints.md):
// its /cloud/login 302s to CLOUD_LOGIN_URL — Cloud's /api/login — which
// answers with the GitHub OAuth redirect.
export function resolveCloudLoginExpect(raw) {
  if (raw === undefined) return "fail-closed-404";
  if (raw !== "oauth-302" && raw !== "fail-closed-503" && raw !== "fail-closed-404") {
    throw new Error(
      `CLOUD_LOGIN_EXPECT must be oauth-302, fail-closed-503, or fail-closed-404, got ${JSON.stringify(raw)}`
    );
  }
  return raw;
}

export async function assertCloudLoginRedirect(targetURL) {
  if (!process.env.BASE_URL) return;
  const expectation = resolveCloudLoginExpect(process.env.CLOUD_LOGIN_EXPECT);
  const context = await request.newContext();
  try {
    // Issue #134: users and clients append the site's natural trailing slash,
    // so the environment's declared contract must hold on both spellings of
    // the handoff — neither form may fall through to the static-asset 404.
    for (const path of ["/cloud/login", "/cloud/login/"]) {
      const response = await context.get(`${targetURL}${path}`, { maxRedirects: 0 });
      const headers = response.headers();
      if (expectation === "oauth-302") {
        // beta: the website's handoff must 302 to the configured Cloud login
        // URL, and that URL must answer with the GitHub OAuth redirect. One
        // manual hop each: the responses themselves are the contract, not
        // where a browser would finally land.
        if (response.status() !== 302) {
          throw new Error(`Cloud login ${path} expected 302, got ${response.status()}`);
        }
        const handoff = new URL(headers.location || "", targetURL).toString();
        const cloud = await context.get(handoff, { maxRedirects: 0 });
        const cloudLocation = cloud.headers().location || "";
        if (cloud.status() !== 302
            || !cloudLocation.startsWith("https://github.com/login/oauth/authorize?")) {
          throw new Error(
            `Cloud login ${path} did not redirect to GitHub OAuth: ${cloud.status()} ${cloudLocation}`
          );
        }
      } else if (expectation === "fail-closed-503") {
        // production (Issue #77): no CLOUD_LOGIN_URL, so the site Worker
        // fail-closes the login route with its stamped 503.
        if (response.status() !== 503) {
          throw new Error(`Cloud login ${path} expected the fail-closed 503, got ${response.status()}`);
        }
        const stamped =
          headers["x-content-type-options"] === "nosniff" &&
          headers["x-frame-options"] === "DENY" &&
          headers["referrer-policy"] === "strict-origin-when-cross-origin";
        if (!stamped) {
          throw new Error(
            `Cloud login ${path} 503 carries not the site Worker's security-header stamp, so it is not the site's fail-closed answer: ${JSON.stringify(headers)}`
          );
        }
      } else {
        // fail-closed-404: the strict default for an environment that declared
        // no contract. The site Worker's own 404 carries its security-header
        // stamp, which the Cloud control plane's responses do not.
        if (response.status() !== 404) {
          throw new Error(`Cloud login ${path} expected fail-closed 404, got ${response.status()}`);
        }
        const stamped =
          headers["x-content-type-options"] === "nosniff" &&
          headers["x-frame-options"] === "DENY" &&
          headers["referrer-policy"] === "strict-origin-when-cross-origin";
        if (!stamped) {
          throw new Error(
            `Cloud login ${path} 404 carries not the site Worker's security-header stamp, so it is not the site's fail-closed answer: ${JSON.stringify(headers)}`
          );
        }
      }
    }
  } finally {
    await context.dispose();
  }
}

// Issue #107: a Cloud CTA's contract is where its click lands — the endpoint
// CLOUD_LOGIN_EXPECT declares (Issue #74) — never the href literal. The
// shipped href="/cloud/login" is rewritten to https://docs.orbi.build by the
// site Worker where CLOUD_LOGIN_URL is unset (Issue #179), so deriving the
// expected href from CLOUD_LOGIN_EXPECT copied that rewrite into the test and
// broke on implementation changes while the site was fine. What each
// expectation declares is the landing:
//   oauth-302        → the GitHub OAuth authorize page (beta; the handoff
//                      chain is pinned by assertCloudLoginRedirect)
//   fail-closed-503  → the self-host docs (production, Issue #179)
//   fail-closed-404  → the /cloud/login handoff route itself (local static
//                      serving: no worker completes the chain, the click
//                      must still reach the handoff)
// The landing must also answer with the status its contract promises: the
// OAuth pages render (<400), and the fail-closed handoff answers 404 — a
// static server locally, the site Worker's stamped 404 where one is
// deployed (assertCloudLoginRedirect checks the stamp).
export function expectedCtaLanding(expectation) {
  if (expectation === "oauth-302") {
    return {
      describe: "GitHub's OAuth authorize flow",
      statusOk: (status) => status < 400,
      matches: (url) =>
        url.hostname === "github.com" &&
        (url.pathname === "/login/oauth/authorize" ||
          // A signed-out visitor is bounced once more by GitHub to its
          // sign-in page, which preserves the authorize request in
          // return_to (observed live 2026-09-12 against beta). A bare
          // /login without it is not the OAuth flow.
          (url.pathname === "/login"
            && (url.searchParams.get("return_to") || "").startsWith("/login/oauth/authorize"))),
    };
  }
  if (expectation === "fail-closed-503") {
    return {
      describe: "the self-host docs",
      statusOk: (status) => status < 400,
      matches: (url) => url.hostname === "docs.orbi.build",
    };
  }
  return {
    describe: "the /cloud/login handoff",
    statusOk: (status) => status === 404,
    matches: (url) => url.pathname === "/cloud/login",
  };
}

// Follow every listed Cloud CTA to the endpoint CLOUD_LOGIN_EXPECT declares.
// Issue #110: the CTA is never clicked. A click on beta navigates across
// documents into GitHub's OAuth flow, and locators that survive that
// navigation die with "Execution context was destroyed" — a failure the
// local static serving (whose /cloud/login is a plain 404, no navigation)
// cannot reproduce. Instead each href is read from the served DOM — the page
// itself never navigates, so no locator crosses one — and followed with the
// context's API request through the redirect chain, arriving at the same
// landing a click reaches, with that landing's real status: GitHub serves a
// 404 at the very authorize URL when the client_id is wrong, and the
// fail-closed routes answer their status codes — the URL alone cannot see
// that. Runs in its own context (desktop width, where the nav is not
// collapsed) so nothing external touches the homepage assertions'
// console/request gates. The smoke never signs in: it stops at the landing
// the contract declares.
async function assertCtaLandsAtEndpoint(browser, path, ctas) {
  const landing = expectedCtaLanding(resolveCloudLoginExpect(process.env.CLOUD_LOGIN_EXPECT));
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(`${targetURL}${path}`, { waitUntil: "load" });
    const targets = [];
    for (const [label, selector] of ctas) {
      const links = page.locator(selector);
      const count = await links.count();
      if (count < 1) throw new Error(`${path}: no ${label} CTA on the page`);
      for (let i = 0; i < count; i += 1) {
        const cta = links.nth(i);
        await cta.scrollIntoViewIfNeeded();
        if (!(await cta.isVisible())) throw new Error(`${path}: ${label} CTA is not visible`);
        const href = await cta.getAttribute("href");
        if (!href) throw new Error(`${path}: the ${label} CTA carries no href`);
        targets.push([label, new URL(href, `${targetURL}${path}`).toString()]);
      }
    }
    await page.close();
    for (const [label, href] of targets) {
      const response = await context.request.get(href);
      if (!landing.matches(new URL(response.url()))) {
        throw new Error(`${path}: ${label} CTA landed at ${response.url()}, expected ${landing.describe}`);
      }
      if (!landing.statusOk(response.status())) {
        throw new Error(`${path}: ${label} CTA landing answered ${response.status()} at ${response.url()}`);
      }
    }
  } finally {
    await context.close();
  }
}

// Issue #273: exercise the campaign user's actual browser action. On beta the
// first request asks the real Worker to plant the ref cookie; the local static
// fixture cannot do that, so it starts from the same documented precondition.
// The clicked request must be query-free, carry the campaign cookie, and must
// not receive a replacement ref cookie from the handoff.
async function assertCampaignRefSurvivesHeroClick(browser) {
  const expectation = resolveCloudLoginExpect(process.env.CLOUD_LOGIN_EXPECT);
  if (process.env.BASE_URL && expectation !== "oauth-302") return;

  const token = "x-2609201530";
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  try {
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st");
    await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
    await page.route("**datafa.st/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
    page.on("console", (message) => {
      if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) {
        consoleErrors.push(message.text());
      }
    });
    page.on("requestfailed", (request) => {
      if (!isTelemetry(request.url())) failedRequests.push(`${request.method()} ${request.url()}`);
    });

    await page.goto(`${targetURL}/?ref=${token}`, { waitUntil: "networkidle" });
    if (!process.env.BASE_URL) {
      await context.addCookies([{ name: "ref", value: token, url: targetURL }]);
    }
    const landedRef = (await context.cookies(targetURL)).find((cookie) => cookie.name === "ref");
    if (landedRef?.value !== token) {
      throw new Error(`campaign landing cookie is ${JSON.stringify(landedRef?.value)}, expected ${token}`);
    }
    await page.screenshot({ path: `${artifacts}/campaign-ref-hero.png`, fullPage: false });

    const handoffResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      const target = new URL(targetURL);
      return url.origin === target.origin && url.pathname === "/cloud/login";
    });
    await page.locator('[data-cta="cloud-start"]').click({ noWaitAfter: true });
    const response = await handoffResponse;
    const requestURL = new URL(response.request().url());
    if (requestURL.search !== "") {
      throw new Error(`hero CTA sent query-bearing handoff ${requestURL}`);
    }
    const requestCookie = (await response.request().allHeaders()).cookie || "";
    if (!requestCookie.split(/;\s*/).includes(`ref=${token}`)) {
      throw new Error(`hero CTA handoff lost campaign cookie: ${JSON.stringify(requestCookie)}`);
    }
    const setCookies = (await response.headersArray())
      .filter(({ name }) => name.toLowerCase() === "set-cookie")
      .map(({ value }) => value);
    if (setCookies.some((value) => value.startsWith("ref="))) {
      throw new Error(`hero CTA handoff overwrote campaign ref: ${JSON.stringify(setCookies)}`);
    }
    const finalRef = (await context.cookies(targetURL)).find((cookie) => cookie.name === "ref");
    if (finalRef?.value !== token) {
      throw new Error(`campaign cookie after hero click is ${JSON.stringify(finalRef?.value)}, expected ${token}`);
    }
    if (consoleErrors.length || failedRequests.length) {
      throw new Error(`campaign handoff console errors=${JSON.stringify(consoleErrors)} failed requests=${JSON.stringify(failedRequests)}`);
    }
  } finally {
    await context.close();
  }
}

// Issue #101: /stats answers one group per repository, and this fixture
// leaves orbi-cloud null on purpose — a repo that fails must degrade only its
// own group to the HTML floors while the other two still show live numbers.
// Locally the static server has no /stats at all, so without the fixture the
// page could only ever render the all-floors fallback.
export const localStatsFixture = {
  repos: {
    orbi: { started: "2025-01-01T00:00:00Z", issues_closed: 1, prs_merged: 1, releases: 1, stars: 2, star_history: [{ stars: 1 }, { stars: 2 }] },
    "orbi-website": { started: "2025-01-01T00:00:00Z", issues_closed: 1, prs_merged: 1, releases: 0, stars: 0, star_history: [], deploys: 1 },
    "orbi-cloud": null,
  },
};

// Issue #126: the stats wait holds the render against the exact payload the
// page received — the Worker's real /stats response where BASE_URL is set,
// the local fixture everywhere else — never against the fixture's specific
// numbers, so the same assertion stands in both environments. It mirrors
// demo.js's contract: a repo's days come from its started date, each count
// from its mapped field, and a repo that is null (or missing the field for a
// stat) degrades exactly its own element to the HTML data-floor; a /stats
// that never delivered a payload degrades every group. One repo's failure
// must never blur the values another group was served (Issue #101).
export function statsMatchServedStats(served, root = document) {
  const statFields = { issues: "issues_closed", prs: "prs_merged", releases: "releases", deploys: "deploys" };
  const repos = (served && served.repos) || {};
  return Array.from(root.querySelectorAll("[data-repo-group]")).every((group) => {
    const repo = repos[group.getAttribute("data-repo-group")];
    return Array.from(group.querySelectorAll("[data-stat]")).every((element) => {
      let value;
      if (repo) {
        const field = element.getAttribute("data-stat");
        if (field === "days") {
          value = Math.max(0, Math.floor((Date.now() - Date.parse(repo.started)) / 86400000));
        } else {
          value = repo[statFields[field]];
        }
      }
      if (!Number.isFinite(value)) value = element.getAttribute("data-floor");
      return element.textContent.trim() === String(value);
    });
  });
}

async function assertHomepage(browser, path, comparisonPath, size, screenshot) {
  const page = await browser.newPage({ viewport: size });
  const consoleErrors = [];
  const failedRequests = [];
  let statsRequested = false;
  const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st");
  await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
  // Issue #101: /stats answers one group per repository, and the local
  // fixture leaves orbi-cloud null on purpose — a repo that fails must
  // degrade only its own group to the HTML floors while the other two still
  // show live numbers. Issue #126: where BASE_URL is set the route passes the
  // real Worker response through and records it; without BASE_URL the static
  // server has no /stats, so the same handler fulfills the request with the
  // fixture. Either way servedStats carries the exact payload the page
  // received, and the wait below asserts the render against that payload —
  // the pre-check above can only pass once a payload was rendered, so the
  // recorded payload can never miss the window.
  let servedStats = null;
  await page.route("**/stats", async (route) => {
    if (process.env.BASE_URL) {
      const response = await route.fetch();
      const body = await response.text();
      try {
        servedStats = JSON.parse(body);
      } catch {
        servedStats = null;
      }
      await route.fulfill({
        status: response.status(),
        contentType: response.headers()["content-type"] || "application/json",
        body,
      });
      return;
    }
    servedStats = localStatsFixture;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(localStatsFixture),
    });
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/stats") statsRequested = true;
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) consoleErrors.push(`${message.location().url}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    // Issue #262: on the homepage the proof-loop video plays (asserted in
    // assertProofLoop), and Chromium's media element abandons its metadata
    // connection once the data connection opens — Playwright records that
    // churn as net::ERR_ABORTED while the page is still open. Probed
    // 2026-09-20: paused=false, currentTime advancing, only the old
    // request aborts. A no-op on pages without the video.
    const abortedMedia = request.failure()?.errorText === "net::ERR_ABORTED"
      && request.url().includes("/video/delivery-loop");
    if (!isTelemetry(request.url()) && !abortedMedia) failedRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(`${targetURL}${path}`, { waitUntil: "networkidle" });
  const hero = page.locator(".hero");
  const claim = releaseClaims[path];
  const heroH1 = (await hero.locator("h1").textContent()).replace(/\s+/g, " ").trim();
  if (heroH1 !== claim.h1) {
    throw new Error(`${path}: hero h1 is ${JSON.stringify(heroH1)}, expected the release claim ${JSON.stringify(claim.h1)}`);
  }
  const lede = await hero.locator(".hero-lede").textContent();
  for (const segment of claim.lede) {
    if (!lede.includes(segment)) {
      throw new Error(`${path}: hero lede is missing the segment ${JSON.stringify(segment)}: ${JSON.stringify(lede)}`);
    }
  }
  if (!(await page.title()).includes(claim.title)) {
    throw new Error(`${path}: title ${JSON.stringify(await page.title())} does not carry the release claim`);
  }
  // Issue #119: the rendered hero trust line is exactly the three unmatched
  // capabilities, and the shared attributes still render in How-it-works.
  const trustTexts = (await hero.locator(".trust-line li").allTextContents())
    .map((item) => item.replace(/\s+/g, " ").trim());
  const expectedTrust = heroTrustLine[path];
  if (trustTexts.length !== expectedTrust.length
      || expectedTrust.some((item, i) => trustTexts[i] !== item)) {
    throw new Error(`${path}: hero trust line is ${JSON.stringify(trustTexts)}, expected exactly ${JSON.stringify(expectedTrust)}`);
  }
  const systemText = await page.locator("#system").textContent();
  for (const attribute of sharedAttributes[path]) {
    if (!systemText.includes(attribute)) {
      throw new Error(`${path}: the How-it-works section lost the shared attribute ${JSON.stringify(attribute)}`);
    }
  }
  const stats = page.locator("[data-stat]");
  await stats.last().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("[data-stat], [data-star-total]"))
    .every((element) => element.textContent.trim() && element.textContent.trim() !== "0"));
  if (!statsRequested) throw new Error(`${path}: /stats was not requested`);
  // Issue #101: one repo's failure must not blur the other two. Issue #126:
  // the wait asserts that contract against whatever payload the page actually
  // received (the real Worker response on beta, the fixture locally), so the
  // same wait stands in both environments.
  await page.waitForFunction(statsMatchServedStats, servedStats).catch(async () => {
    // Timeout with no diff is undiagnosable: rethrow with what actually rendered.
    const dump = await page.evaluate(() => [...document.querySelectorAll("#orbi-stats [data-stat]")]
      .map((el) => `${el.getAttribute("data-repo")}/${el.getAttribute("data-stat")}=${el.textContent.trim()}(floor ${el.getAttribute("data-floor")})`)
      .join(" "));
    throw new Error(`${path}: stats render did not match the served /stats payload: ${dump}`);
  });
  // Issue #99: the homepage carries exactly one primary hero CTA, visible,
  // plus the card CTA and the nav "Start Cloud" keeping the same promise —
  // one click into the login handoff, never a second identical button.
  // Issue #107: where that click lands is the environment contract
  // (assertCtaLandsAtEndpoint), never a pinned href — the Worker rewrites
  // the shipped href where CLOUD_LOGIN_URL is unset (Issue #77).
  if (await hero.locator(".button-signal").count() !== 1) throw new Error(`${path}: expected one primary CTA`);
  const cloudCta = hero.locator('[data-cta="cloud-start"]');
  await cloudCta.scrollIntoViewIfNeeded();
  if (!(await cloudCta.isVisible())) throw new Error(`${path}: cloud-start CTA is not visible`);
  // Issue #51: the compare entry belongs to the top navigation; the hero
  // must not carry a competing focus.
  if (await hero.locator('[data-cta="comparisons"]').count() !== 0) {
    throw new Error(`${path}: compare CTA must not live in the hero`);
  }
  // The install alt-CTA's target is a real page contract of its own: a
  // visitor on any environment is sent to the canonical docs host.
  const installCta = hero.locator('[data-cta="install"]');
  await installCta.scrollIntoViewIfNeeded();
  if (!(await installCta.isVisible())) throw new Error(`${path}: install CTA is not visible`);
  const installHref = path.startsWith("/zh") ? "https://docs.orbi.build/zh" : "https://docs.orbi.build";
  if ((await installCta.getAttribute("href")) !== installHref) {
    throw new Error(`${path}: install CTA has wrong href`);
  }
  if ((await page.locator('[data-cta="cloud-start-card"]').count()) !== 1) {
    throw new Error(`${path}: expected exactly one cloud-start-card CTA`);
  }
  if ((await page.locator("[data-primary-nav] .nav-apply").count()) !== 1) {
    throw new Error(`${path}: expected exactly one nav Start Cloud`);
  }
  const cardText = await page.locator(".run-option-cloud").textContent();
  if (!cardText.includes("US$79")) throw new Error(`${path}: the Managed Cloud card hides the US$79 price`);
  if (!cardText.includes("100% off")) throw new Error(`${path}: the Managed Cloud card hides the Founding coupon terms`);
  const navCompare = page.locator('[data-primary-nav] [data-cta="comparisons"]');
  if ((await navCompare.getAttribute("href")) !== comparisonPath) {
    throw new Error(`${path}: nav comparisons link has wrong href`);
  }
  // Issue #165: Pricing in the primary nav is the subscription-price entry,
  // not the measured-cost essay. A real click must land on #pricing.
  const pricingHref = path.startsWith("/zh") ? "/zh/cloud/#pricing" : "/cloud/#pricing";
  const pricingLabel = path.startsWith("/zh") ? "价格" : "Pricing";
  const navPricing = page.locator(`[data-primary-nav] a[href="${pricingHref}"]`);
  if ((await navPricing.count()) !== 1) {
    throw new Error(`${path}: nav missing Pricing link ${pricingHref}`);
  }
  if ((await navPricing.textContent()).trim() !== pricingLabel) {
    throw new Error(`${path}: Pricing label is ${JSON.stringify((await navPricing.textContent()).trim())}`);
  }
  // Desktop nav is visible; below 900px the menu is collapsed. Click the
  // real entry only where the visitor can see it without opening the menu.
  if (size.width > 900) {
    await navPricing.click();
    await page.waitForURL((url) => url.hash === "#pricing" && url.pathname.endsWith("/cloud/"));
    const pricingSection = page.locator("#pricing");
    if ((await pricingSection.count()) !== 1) {
      throw new Error(`${path}: click on Pricing did not reach #pricing`);
    }
    if (!(await pricingSection.isVisible())) {
      throw new Error(`${path}: #pricing is not visible after the Pricing click`);
    }
    await page.goBack({ waitUntil: "networkidle" });
  }
  const footerHrefs = await page.locator(".site-footer a").evaluateAll((nodes) =>
    nodes.map((a) => a.getAttribute("href"))
  );
  // Issue #99: with the main CTAs going straight to the login handoff, the
  // /cloud/ explainer stays reachable from the footer.
  const explainerHref = path.startsWith("/zh") ? "/zh/cloud/" : "/cloud/";
  if (!footerHrefs.includes(explainerHref)) {
    throw new Error(`${path}: footer lost the ${explainerHref} explainer link`);
  }
  if (path === "/") {
    await assertFooterDeepDives(page, path);
  } else {
    if (!footerHrefs.includes("/zh/compare/")) throw new Error(`${path}: ZH footer must link /zh/compare/`);
    if (footerHrefs.some((href) => href && href.startsWith("/compare/"))) {
      throw new Error(`${path}: ZH footer must not link EN deep dives: ${JSON.stringify(footerHrefs)}`);
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`${path}: horizontal overflow of ${overflow}px at ${size.width}x${size.height}`);
  const shownCommand = (await page.locator(".install-block [data-copy-source]").textContent()).trim();
  if (shownCommand !== installCommand) {
    throw new Error(`${path}: install block shows ${JSON.stringify(shownCommand)}, expected the one-liner`);
  }
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  await page.locator(".site-footer").screenshot({ path: `${artifacts}/footer-${screenshot}` });
  // Below 900px the navigation is collapsed; open it before clicking through.
  const menuToggle = page.locator("[data-menu-toggle]");
  if (await menuToggle.isVisible()) await menuToggle.click();
  await navCompare.click();
  await page.waitForLoadState("networkidle");
  if (new URL(page.url()).pathname !== comparisonPath) {
    throw new Error(`${path}: expected ${comparisonPath}, got ${page.url()}`);
  }
  if (consoleErrors.length || failedRequests.length) {
    throw new Error(`${path}: console errors=${JSON.stringify(consoleErrors)} failed requests=${JSON.stringify(failedRequests)}`);
  }
  await page.close();
}

// Issue #259: the hero used to push the primary CTA to 630px — under every
// competitor's first screen — and the trust line out of a phone's fold
// (874px at 390×844). The copy fix is pinned byte-exactly in
// tests/hero-above-fold.test.js; this measurement is the acceptance itself:
// geometry, not strings.
async function assertHeroAboveFold(browser, path, size, screenshot) {
  const page = await browser.newPage({ viewport: size });
  await page.goto(`${targetURL}${path}`, { waitUntil: "networkidle" });
  const ctaTop = await page.locator('.hero [data-cta="cloud-start"]')
    .evaluate((el) => el.getBoundingClientRect().top);
  // Scoped to the hero: a second .trust-line.trust-line-paper sits further
  // down the page (Product attributes).
  const trust = await page.locator(".hero .trust-line").evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });
  const footnoteTop = await page.locator(".hero .hero-footnote a")
    .evaluate((el) => el.getBoundingClientRect().top);
  const view = `${path} ${size.width}x${size.height}`;
  // Acceptance 2: on a 1366×768 laptop the primary CTA stays above 450px.
  if (size.width >= 1000 && ctaTop >= 450) {
    throw new Error(`${view}: primary CTA top is ${ctaTop}, must stay < 450`);
  }
  // Acceptance 3: on the same laptop the trust line ends inside the fold.
  if (size.width >= 1000 && trust.bottom >= 768) {
    throw new Error(`${view}: trust-line bottom is ${trust.bottom}, must stay < 768`);
  }
  // Acceptance 4: on a phone the trust line top stays inside the fold.
  if (trust.top >= size.height) {
    throw new Error(`${view}: trust-line top is ${trust.top}, must stay < ${size.height}`);
  }
  // Acceptance 5: the 12-factors footnote never precedes the primary CTA.
  if (footnoteTop <= ctaTop) {
    throw new Error(`${view}: footnote top ${footnoteTop} must come after the primary CTA top ${ctaTop}`);
  }
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  await page.close();
}

// Issue #267: at the ≤980px breakpoint the hero collapses to one column and
// came apart on the Z Fold 8's unfolded viewport: the factory-trace figure
// right-shifted ~372px off the copy's left edge (the 980px rule's
// margin-left:auto right-aligns the shrink-to-fit figure), the "Prefer to
// self-host?" CTA sagged 15px below its row-mates (the base .hero-alt
// margin-top inside a flex-start row), and the trust-line checklist spread
// across the full column while the copy above it sat on a narrower measure.
// This measures the repaired geometry — acceptance in pixels, not strings:
// the figure shares the copy column's left edge, CTAs sharing a visual row
// share its top (aligned within 1px, or genuinely wrapped to their own row),
// and no checklist row runs wider than the copy measure the h1 box anchors.
async function assertHeroSingleColumn(browser, path, size, screenshot) {
  const page = await browser.newPage({ viewport: size });
  await page.goto(`${targetURL}${path}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const view = `${path} ${size.width}x${size.height}`;
  const hero = await page.evaluate(() => {
    const rect = (nodeOrSelector) => {
      const el = typeof nodeOrSelector === "string" ? document.querySelector(nodeOrSelector) : nodeOrSelector;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top };
    };
    return {
      columns: getComputedStyle(document.querySelector(".hero")).gridTemplateColumns.split(" ").length,
      copy: rect(".hero-copy"),
      figure: rect(".hero figure.factory-trace"),
      ctas: [
        rect('.hero [data-cta="cloud-start"]'),
        rect(".hero .hero-alt"),
        rect(".hero .hero-proof-link"),
      ],
      h1: rect(".hero h1"),
      checklist: [...document.querySelectorAll(".hero .trust-line li")].map(rect),
    };
  });
  // The two-column hero (≥981px) has its own alignment contract; the checks
  // below are the single-column repair's, so only run where it applies.
  if (hero.columns === 1) {
    const leftDrift = Math.abs(hero.figure.left - hero.copy.left);
    if (leftDrift > 1) {
      throw new Error(`${view}: figure left ${hero.figure.left} vs .hero-copy left ${hero.copy.left} — drift ${leftDrift}px > 1px`);
    }
    const tops = hero.ctas.map((cta) => cta.top).sort((a, b) => a - b);
    for (let i = 1; i < tops.length; i += 1) {
      const gap = tops[i] - tops[i - 1];
      // A wrapped CTA's row starts at least a line below the previous one;
      // anything between "aligned" and "wrapped" is the 15px sag again.
      if (gap > 1 && gap < 24) {
        throw new Error(`${view}: CTA tops ${JSON.stringify(hero.ctas.map((cta) => cta.top))} — a ${gap}px offset is neither aligned nor a line break`);
      }
    }
    for (const row of hero.checklist) {
      if (row.right > hero.h1.right + 1) {
        throw new Error(`${view}: checklist row runs to ${row.right}, past the copy column edge ${hero.h1.right}`);
      }
    }
  }
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  await page.close();
}

// Issue #264: the proof section's delivery loop, retold as measured
// rendering, not copy: the autoplay contract plus controls one by one —
// the asset carries a narration track, so a visitor must be able to unmute
// and pause — the video fitting its container at the laptop and phone
// widths the Issue names, and no horizontal scroll from the block.
// The midway CTA directly under the video carries the video's own ref token —
// the signup attribution this Issue exists for.
async function assertProofLoop(browser, path, size, screenshot) {
  const page = await browser.newPage({ viewport: size });
  await page.goto(`${targetURL}${path}`, { waitUntil: "networkidle" });
  const view = `${path} ${size.width}x${size.height}`;
  const video = page.locator(".proof-loop-video");
  if ((await video.count()) !== 1) throw new Error(`${view}: expected exactly one .proof-loop-video`);
  for (const attribute of ["autoplay", "loop", "muted", "playsinline", "controls"]) {
    if ((await video.getAttribute(attribute)) === null) {
      throw new Error(`${view}: .proof-loop-video is missing ${attribute}`);
    }
  }
  // The loop must actually play — the strongest signal a visitor's browser
  // can give that the asset loads and the autoplay contract holds. Chromium
  // defers autoplay while the video is offscreen (probed 2026-09-20: at
  // viewport top 4939px paused=true; scrollIntoView → paused=false with
  // currentTime advancing, no user gesture), so walk the visitor's real path:
  // scroll the proof section into view, then wait for playback. A broken or
  // missing file surfaces here as a timeout, not as a network event (the
  // element's connection churn aborts benignly, see the requestfailed filter
  // in assertHomepage).
  await page.locator(".proof-loop").scrollIntoViewIfNeeded();
  try {
    await page.waitForFunction(() => {
      const video = document.querySelector(".proof-loop-video");
      return video && !video.paused && video.readyState >= 3 && video.currentTime > 0;
    }, null, { timeout: 5000 });
  } catch {
    const state = await video.evaluate((video) => ({
      paused: video.paused,
      readyState: video.readyState,
      networkState: video.networkState,
      currentTime: video.currentTime,
      error: video.error && video.error.code,
    }));
    throw new Error(`${view}: proof-loop video is not playing: ${JSON.stringify(state)}`);
  }
  const geometry = await page.evaluate(() => {
    const video = document.querySelector(".proof-loop-video");
    return {
      width: video.getBoundingClientRect().width,
      containerWidth: video.closest(".proof-loop").getBoundingClientRect().width,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  if (!(geometry.width > 0) || geometry.width > geometry.containerWidth + 0.5) {
    throw new Error(`${view}: .proof-loop-video width ${geometry.width} must be > 0 and within its container ${geometry.containerWidth}`);
  }
  const overflow = geometry.scrollWidth - geometry.clientWidth;
  if (overflow > 1) throw new Error(`${view}: horizontal overflow of ${overflow}px`);
  const captionLinks = await page.locator(".proof-loop figcaption a")
    .evaluateAll((nodes) => nodes.map((a) => a.getAttribute("href")));
  const expectedCaption = [
    "https://github.com/orbi-build/orbi/issues/1018",
    "https://github.com/orbi-build/orbi/pull/1023",
    "https://github.com/orbi-build/orbi/releases/tag/v0.5.17",
  ];
  if (JSON.stringify(captionLinks) !== JSON.stringify(expectedCaption)) {
    throw new Error(`${view}: figcaption links are ${JSON.stringify(captionLinks)}, expected ${JSON.stringify(expectedCaption)}`);
  }
  const midwayHref = await page.locator('[data-cta="midway-cloud"]').getAttribute("href");
  const expectedHref = "/cloud/login";
  if (midwayHref !== expectedHref) {
    throw new Error(`${view}: midway CTA href is ${midwayHref}, expected ${expectedHref}`);
  }
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  await page.close();
}

// Issue #262: the reduced-motion degradation path a vestibular user actually
// gets — the autoplaying video is hidden and the static poster takes its
// place. emulated here, because no string check exercises the media query.
async function assertProofLoopReducedMotion(browser, path) {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    reducedMotion: "reduce",
  });
  await page.goto(`${targetURL}${path}`, { waitUntil: "load" });
  const state = await page.evaluate(() => {
    const video = document.querySelector(".proof-loop-video");
    const figure = document.querySelector(".proof-loop");
    return {
      display: getComputedStyle(video).display,
      background: getComputedStyle(figure).backgroundImage,
    };
  });
  if (state.display !== "none") {
    throw new Error(`${path}: reduced motion must hide the video, got display=${state.display}`);
  }
  if (!state.background.includes("delivery-loop-poster.jpg")) {
    throw new Error(`${path}: reduced motion must show the static poster, got background=${state.background}`);
  }
  await page.close();
}

// Issue #79: /cloud/ is the indexable page the homepage Cloud CTA leads
// with. The page must render cleanly at phone and desktop widths, and its
// login buttons keep the environment's declared login contract: a click
// lands at the endpoint CLOUD_LOGIN_EXPECT declares (assertCtaLandsAtEndpoint,
// Issue #107) — never a pinned href, which the site Worker may rewrite where
// CLOUD_LOGIN_URL is unset (Issue #77).
// Issue #97: the claim advances to the end of the delivery line — the three
// segments no competitor covers — and the release boundary is stated
// honestly: the human opens the release Issue and applies ai-release, CI is
// what the release is tested against. Never "automatic releases".
// Issue #129: the GitHub Actions fact is framed as the lever it is — what
// you put in CI decides what Orbi guarantees — and the boundary survives:
// with no check runs both gates pass, and the release ships minus its only
// test-acceptance gate.
const cloudPages = {
  "/cloud/": {
    zh: "/zh/cloud/",
    // Issue #237: the title now leads with the search term; the release
    // claim itself stays pinned on the h1 below and in the body.
    title: "Self-hosted or cloud coding agent",
    h1: "Orbi Cloud: GitHub Issues in, tagged releases out",
    loop: "GitHub Issue in, tagged release out",
    // Issue #156: the zero-warning handoff — the microcopy under the hero CTA.
    ctaMicrocopy: "Next step happens on GitHub: sign in and choose which repositories Orbi can access. You can authorize a single repository, and change it any time on GitHub.",
    metaNeedle: ["tagged GitHub Release", "US$79"],
    oldClaim: "reviewed pull request",
    text: [
      "exact-head merge",
      "tagged GitHub Release",
      "cuts the tag",
      "closes the milestone",
      // the release boundary: you start it, Orbi runs it
      "never automatic",
      "ai-release",
      "only humans",
      "GitHub Actions",
      // Issue #129: the lever framing and the no-CI boundary
      "what you put in CI decides what Orbi guarantees",
      "business-flow e2e",
      "no check runs, both gates pass",
      "test-acceptance gate",
      // Issue #108 + #137 + #138 + #145: the $79 regular price with the
      // included-token quota (rendered from the pricing.json label; since #145
      // that is 300M, the same quota the Founder plan carries); the
      // over-limit behavior is the pause, not a $0.10 overage price
      "US$79", "300M tokens", "new deliveries pause", "100% off",
      // Issue #180: COST, MEASURED is a headline that links to /cost/, not
      // a clone of the measurement table, three limits, or competitor audit.
      "2,220,637", "4,742,066", "100 deliveries a month", "prompt caching",
    ],
    guideHref: "/guides/ci-gates/",
  },
  "/zh/cloud/": {
    zh: "/cloud/",
    title: "GitHub Issue 进，打好 Tag 的 Release 出",
    h1: "Orbi Cloud：GitHub Issue 进，打好 Tag 的 Release 出",
    loop: "GitHub Issue 进，打好 Tag 的 Release 出",
    // Issue #156: the zero-warning handoff — the microcopy under the hero CTA.
    ctaMicrocopy: "下一步在 GitHub 上完成：登录并选择 Orbi 可以访问的仓库。可以只授权一个仓库，随时在 GitHub 上修改。",
    metaNeedle: ["打 Tag", "GitHub Release", "US$79"],
    oldClaim: "审查过的 PR",
    text: [
      "exact-head merge",
      "冻结 SHA",
      "打 Tag",
      "GitHub Release",
      "关闭 milestone",
      "从不是全自动",
      "ai-release",
      "只有人能打",
      "GitHub Actions",
      // Issue #129: the lever framing and the no-CI boundary
      "CI 里放什么，决定了 Orbi 替你保证什么",
      "业务闭环",
      "两道门禁都放行",
      "测试验收闸门",
      // Issue #108 + #137 + #138 + #145: the $79 regular price with the
      // included-token quota (rendered from the pricing.json label; zh rides
      // the same label, 300M since #145)
      "US$79", "300M token", "新交付暂停", "100% off",
      // Issue #180: COST, MEASURED is a headline that links to /zh/cost/.
      "2,220,637", "4,742,066", "100 次交付/月", "prompt caching",
    ],
    guideHref: "/zh/guides/ci-gates/",
  },
};

async function assertCloudPage(browser, path, size, screenshot) {
  const claim = cloudPages[path];
  const page = await browser.newPage({ viewport: size });
  const consoleErrors = [];
  const failedRequests = [];
  const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st");
  await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
  page.on("console", (message) => {
    if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) consoleErrors.push(`${message.location().url}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    if (!isTelemetry(request.url())) failedRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(`${targetURL}${path}`, { waitUntil: "networkidle" });
  const h1Count = await page.locator("h1").count();
  if (h1Count !== 1) throw new Error(`${path}: expected exactly one h1, got ${h1Count}`);
  const heroH1 = (await page.locator("h1").textContent()).replace(/\s+/g, " ").trim();
  if (heroH1 !== claim.h1) {
    throw new Error(`${path}: h1 is ${JSON.stringify(heroH1)}, expected the release claim ${JSON.stringify(claim.h1)}`);
  }
  const pageTitle = await page.title();
  if (!pageTitle.includes(claim.title)) {
    throw new Error(`${path}: title ${JSON.stringify(pageTitle)} does not carry the release claim`);
  }
  // The three meta descriptions carry the same advanced claim.
  const metaDescriptions = await Promise.all([
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ].map((selector) => page.locator(selector).getAttribute("content")));
  for (const needle of claim.metaNeedle) {
    for (const content of metaDescriptions) {
      if (!content.includes(needle)) {
        throw new Error(`${path}: meta description ${JSON.stringify(content)} is missing ${JSON.stringify(needle)}`);
      }
    }
  }
  // The stop-at-the-PR claim is gone — from the title, the h1, the loop
  // heading, and the body.
  for (const [label, value] of [["title", pageTitle], ["h1", heroH1]]) {
    if (value.includes(claim.oldClaim)) {
      throw new Error(`${path}: ${label} still stops at the old claim ${JSON.stringify(claim.oldClaim)}: ${JSON.stringify(value)}`);
    }
  }
  const text = (await page.locator("main").textContent()).replace(/\s+/g, " ");
  if (text.includes(claim.oldClaim)) {
    throw new Error(`${path}: main still stops at the old claim ${JSON.stringify(claim.oldClaim)}`);
  }
  for (const needle of [claim.loop, ...claim.text]) {
    if (!text.includes(needle)) {
      throw new Error(`${path}: missing the required claim ${JSON.stringify(needle)}`);
    }
  }
  if ((await page.getByText("US$79").count()) < 1) throw new Error(`${path}: the regular US$79 price is not on the page`);
  // Issue #108: the JSON-LD Offer prices the regular plan, with the coupon in
  // its description — never the retired US$15.
  const offers = (await Promise.all(
    (await page.locator('script[type="application/ld+json"]').allTextContents()).map((s) => JSON.parse(s))
  )).flatMap((data) => data["@graph"] ?? [data]).filter((node) => node["@type"] === "Offer");
  if (offers.length !== 1 || offers[0].price !== "79" || !String(offers[0].description).includes("100% off")) {
    throw new Error(`${path}: JSON-LD Offer must price the regular plan at 79 with the coupon terms, got ${JSON.stringify(offers)}`);
  }
  // Issue #107: the login buttons' contract is the click's landing
  // (assertCtaLandsAtEndpoint); here the buttons must exist and be visible.
  const loginButtons = page.locator("a.button-signal");
  if ((await loginButtons.count()) < 1) throw new Error(`${path}: no Cloud CTA on the page`);
  for (let i = 0; i < (await loginButtons.count()); i += 1) {
    if (!(await loginButtons.nth(i).isVisible())) throw new Error(`${path}: Cloud CTA is not visible`);
  }
  // Issue #156: the handoff is three redirects into GitHub's password box,
  // and the microcopy under the hero CTA is the only warning the user gets
  // (no intermediate screen by design). It must render below the button and
  // carry the three layers — where the next step happens, that repositories
  // are chosen, that the choice is revisable — without adding a jump.
  const ctaBlock = page.locator(".compare-hero .hero-primary");
  if ((await ctaBlock.count()) !== 1) throw new Error(`${path}: expected one hero-primary CTA block in the hero`);
  const microcopy = (await ctaBlock.locator("p").first().textContent()).replace(/\s+/g, " ").trim();
  if (microcopy !== claim.ctaMicrocopy) {
    throw new Error(`${path}: hero CTA microcopy is ${JSON.stringify(microcopy)}, expected ${JSON.stringify(claim.ctaMicrocopy)}`);
  }
  if ((await ctaBlock.locator("p a").count()) !== 0) {
    throw new Error(`${path}: the CTA microcopy must not carry links of its own`);
  }
  // Issue #128: the "needs GitHub Actions" sentence links the CI-gates
  // guide — the explanation of what that requirement actually buys.
  if ((await page.locator(`main a[href="${claim.guideHref}"]`).count()) !== 1) {
    throw new Error(`${path}: expected exactly one link to ${claim.guideHref}`);
  }
  // Issue #165: the PRICING section is the nav target; it must be on the page
  // and keep a door to the measured-cost essay.
  if ((await page.locator("#pricing").count()) !== 1) {
    throw new Error(`${path}: missing id=pricing on the PRICING section`);
  }
  const costHref = path.startsWith("/zh") ? "/zh/cost/" : "/cost/";
  if ((await page.locator(`#pricing a[href="${costHref}"]`).count()) < 1) {
    throw new Error(`${path}: PRICING section lost the ${costHref} link`);
  }
  const pricingHref = path.startsWith("/zh") ? "/zh/cloud/#pricing" : "/cloud/#pricing";
  const navPricing = page.locator(`[data-primary-nav] a[href="${pricingHref}"]`);
  if ((await navPricing.getAttribute("aria-current")) !== "page") {
    throw new Error(`${path}: Pricing is not aria-current on /cloud/`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`${path}: horizontal overflow of ${overflow}px at ${size.width}x${size.height}`);
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  if (consoleErrors.length || failedRequests.length) {
    throw new Error(`${path}: console errors=${JSON.stringify(consoleErrors)} failed requests=${JSON.stringify(failedRequests)}`);
  }
  await page.close();
}

// Issue #90: the cost-transparency pages must carry the measured dataset, the
// money math, all three stated limits, and the competitor non-disclosure
// sources with their verification date — in both languages, with the numbers
// identical across the two.
// Issue #118: the dataset is a snapshot as of a stated date (the sample moves
// as worktrees are cleaned up), so the page pins "measured 2026-09-12 · n=46"
// with the re-derivation recipe in the source note; the smoke reads the n
// each rendered page actually shows and asserts the two languages agree.
const costPages = {
  "/cost/": {
    zh: "/zh/cost/",
    h1: "What one Issue delivery actually costs",
    text: [
      // measurement date + sample size (a snapshot, not a permanent fact)
      "measured 2026-09-12", "n=46",
      "n is a snapshot as of the stated date, not a permanent fact",
      // the re-derivation recipe: which files, which grouping, which field
      ".pi-session/*.jsonl", "usage.totalTokens", "nearest rank",
      // the full measured distribution
      "2,220,637", "3,961,248", "13,290,932", "16,555,250", "37,627,783", "4,742,066",
      // composition
      "95.9%", "3.4%", "0.7%",
      // DeepSeek list prices and the money math
      "$0.003", "$0.15", "$0.60", "$0.058", "$0.115", "$0.46", "$0.92", "~$5.77", "~$11.55", "$6–12",
      // the three limits
      "not a promise to everyone", "order of magnitude", "totalTokens",
      // competitor non-disclosure, verified
      "Quota not published", "~10x Pro usage", "verified 2026-09-11",
    ],
    hrefs: [
      "https://docs.devin.ai/admin/billing/self-serve",
      "https://docs.factory.ai/pricing/individuals",
      "https://api-docs.deepseek.com/quick_start/pricing",
    ],
    verified: "verified 2026-09-11",
  },
  "/zh/cost/": {
    zh: "/cost/",
    h1: "跑一个 Issue 到底花多少钱",
    text: [
      "截至 2026-09-12 实测", "n=46",
      "n 是截至标注日期的快照,不是永久事实",
      ".pi-session/*.jsonl", "usage.totalTokens", "nearest-rank",
      "2,220,637", "3,961,248", "13,290,932", "16,555,250", "37,627,783", "4,742,066",
      "95.9%", "3.4%", "0.7%",
      "$0.003", "$0.15", "$0.60", "$0.058", "$0.115", "$0.46", "$0.92", "~$5.77", "~$11.55", "$6–12",
      "不是对所有人的承诺", "一个数量级", "totalTokens",
      "额度未公布", "~10x Pro usage", "核实于 2026-09-11",
    ],
    hrefs: [
      "https://docs.devin.ai/admin/billing/self-serve",
      "https://docs.factory.ai/pricing/individuals",
      "https://api-docs.deepseek.com/quick_start/pricing",
    ],
    verified: "核实于 2026-09-11",
  },
};

async function assertCostPage(browser, path, size, screenshot) {
  const claim = costPages[path];
  const page = await browser.newPage({ viewport: size });
  const consoleErrors = [];
  const failedRequests = [];
  const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st");
  await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
  page.on("console", (message) => {
    if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) consoleErrors.push(`${message.location().url}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    if (!isTelemetry(request.url())) failedRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(`${targetURL}${path}`, { waitUntil: "networkidle" });
  const h1Count = await page.locator("h1").count();
  if (h1Count !== 1) throw new Error(`${path}: expected exactly one h1, got ${h1Count}`);
  const heroH1 = (await page.locator("h1").textContent()).replace(/\s+/g, " ").trim();
  if (heroH1 !== claim.h1) {
    throw new Error(`${path}: h1 is ${JSON.stringify(heroH1)}, expected ${JSON.stringify(claim.h1)}`);
  }
  const text = (await page.locator("main").textContent()).replace(/\s+/g, " ");
  for (const needle of claim.text) {
    if (!text.includes(needle)) {
      throw new Error(`${path}: missing the required data point ${JSON.stringify(needle)}`);
    }
  }
  // Issue #118: the sample size each rendered page actually shows — the main
  // text, not a pinned constant — so the two languages can be compared.
  const shownN = text.match(/n=(\d+)/);
  if (!shownN) throw new Error(`${path}: no n=<sample size> annotation in the rendered page`);
  for (const href of claim.hrefs) {
    if ((await page.locator(`a[href="${href}"]`).count()) < 1) {
      throw new Error(`${path}: missing a link to the source ${href}`);
    }
  }
  // The verification date belongs to the source notes specifically, not
  // just anywhere on the page.
  if (!text.includes(claim.verified)) throw new Error(`${path}: sources carry no ${JSON.stringify(claim.verified)} date`);
  // Issue #165: the primary-nav price item now points at /cloud/#pricing, so
  // /cost/ is no longer a current nav entry. Language switch still leads to
  // the counterpart cost page.
  const pricingHref = path.startsWith("/zh") ? "/zh/cloud/#pricing" : "/cloud/#pricing";
  const navPricing = page.locator(`[data-primary-nav] a[href="${pricingHref}"]`);
  if ((await navPricing.count()) !== 1) {
    throw new Error(`${path}: nav lost the Pricing link to ${pricingHref}`);
  }
  if ((await navPricing.getAttribute("aria-current")) === "page") {
    throw new Error(`${path}: Pricing must not be aria-current on the cost page`);
  }
  const navSwitch = page.locator("[data-primary-nav] .language a");
  if ((await navSwitch.getAttribute("href")) !== claim.zh) {
    throw new Error(`${path}: language switch does not lead to ${claim.zh}`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`${path}: horizontal overflow of ${overflow}px at ${size.width}x${size.height}`);
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  if (consoleErrors.length || failedRequests.length) {
    throw new Error(`${path}: console errors=${JSON.stringify(consoleErrors)} failed requests=${JSON.stringify(failedRequests)}`);
  }
  await page.close();
  return shownN[1];
}

// Issue #89: the /compare/ matrix splits Delivery into three rows —
// independent review / auto-merge / tag + Release — and the vendors' verbatim
// quotes for those rows must render in both languages, with Orbi the only
// "Yes" in the Release row.
const compareMatrix = {
  "/compare/": {
    zh: "/zh/compare/",
    rows: ["Independent review (can edit code and rerun tests)", "Auto-merge", "Tag / Release"],
    yes: "Yes",
    quotes: [
      "Pull request authors cannot approve their own pull requests.",
      "Each Copilot cloud agent session has a maximum execution time of 59 minutes.",
      "Findings are tagged by severity and don’t approve or block your PR, so existing review workflows stay intact.",
      "The check run always completes with a neutral conclusion so it never blocks merging through branch protection rules.",
      "toggle auto-merge directly from Devin Review without leaving the page",
    ],
    hrefs: [
      "https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews",
      "https://code.claude.com/docs/en/code-review",
      "https://docs.devin.ai/work-with-devin/devin-review",
    ],
    dates: ["2026-09-10", "2026-09-11"],
  },
  "/zh/compare/": {
    zh: "/compare/",
    rows: ["独立评审（能改代码重跑测试）", "自动 merge", "打 Tag / 发 Release"],
    yes: "是",
    quotes: [
      "Pull request authors cannot approve their own pull requests.",
      "Each Copilot cloud agent session has a maximum execution time of 59 minutes.",
      "Findings are tagged by severity and don’t approve or block your PR, so existing review workflows stay intact.",
      "The check run always completes with a neutral conclusion so it never blocks merging through branch protection rules.",
      "toggle auto-merge directly from Devin Review without leaving the page",
    ],
    hrefs: [
      "https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews",
      "https://code.claude.com/docs/en/code-review",
      "https://docs.devin.ai/work-with-devin/devin-review",
    ],
    dates: ["2026-09-10", "2026-09-11"],
  },
};

async function assertCompareMatrix(browser, path, size, screenshot) {
  const claim = compareMatrix[path];
  const page = await browser.newPage({ viewport: size });
  const consoleErrors = [];
  const failedRequests = [];
  const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st");
  await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
  page.on("console", (message) => {
    if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) consoleErrors.push(`${message.location().url}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    if (!isTelemetry(request.url())) failedRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(`${targetURL}${path}`, { waitUntil: "networkidle" });
  // The three new rows must render, and the Tag / Release row must carry
  // exactly one "Yes" — in the Orbi column.
  const matrix = page.locator("table.compare-table").first();
  const rowHeads = await matrix.locator("tbody th").evaluateAll((nodes) =>
    nodes.map((th) => th.textContent.replace(/\s+/g, " ").trim())
  );
  for (const row of claim.rows) {
    if (!rowHeads.includes(row)) {
      throw new Error(`${path}: matrix is missing the delivery row ${JSON.stringify(row)}; has ${JSON.stringify(rowHeads)}`);
    }
  }
  const releaseRow = matrix.locator("tbody tr", { has: page.locator("th", { hasText: claim.rows[2] }) });
  const releaseCells = await releaseRow.locator("td").evaluateAll((nodes) =>
    nodes.map((td) => td.textContent.replace(/\s+/g, " ").trim())
  );
  const yesCount = releaseCells.filter((cell) => cell === claim.yes).length;
  if (yesCount !== 1 || releaseCells[0] !== claim.yes) {
    throw new Error(`${path}: Release row must carry exactly one ${JSON.stringify(claim.yes)} in the Orbi column, got ${JSON.stringify(releaseCells)}`);
  }
  // The verbatim vendor quotes, their URLs, and the verification dates.
  const text = (await page.locator("main").textContent()).replace(/\s+/g, " ");
  for (const quote of claim.quotes) {
    if (!text.includes(quote)) {
      throw new Error(`${path}: the verbatim vendor quote is missing: ${JSON.stringify(quote)}`);
    }
  }
  for (const href of claim.hrefs) {
    if ((await page.locator(`a[href="${href}"]`).count()) < 1) {
      throw new Error(`${path}: missing a link to the official source ${href}`);
    }
  }
  for (const date of claim.dates) {
    if (!text.includes(date)) throw new Error(`${path}: missing the verification date ${date}`);
  }
  // Navigation consistency, same contract as the cost pages.
  const navSelf = page.locator(`[data-primary-nav] a[href="${path}"]`);
  if ((await navSelf.getAttribute("aria-current")) !== "page") {
    throw new Error(`${path}: nav does not mark ${path} as the current page`);
  }
  const navSwitch = page.locator("[data-primary-nav] .language a");
  if ((await navSwitch.getAttribute("href")) !== claim.zh) {
    throw new Error(`${path}: language switch does not lead to ${claim.zh}`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`${path}: horizontal overflow of ${overflow}px at ${size.width}x${size.height}`);
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  if (consoleErrors.length || failedRequests.length) {
    throw new Error(`${path}: console errors=${JSON.stringify(consoleErrors)} failed requests=${JSON.stringify(failedRequests)}`);
  }
  await page.close();
}

// Issue #170: /compare/ is on the buyer-decision path. The nav CTA a visitor
// sees there must be Start Cloud (ZH: 开始 Cloud) pointing at the Cloud
// login handoff — the same promise as every other page. Apply still 200s, so
// a wrong destination would not 404; the text and href are the evidence.
async function assertCompareNavCta(browser, path, label) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${targetURL}${path}`, { waitUntil: "load" });
    const cta = page.locator("[data-primary-nav] .nav-apply");
    if ((await cta.count()) !== 1) {
      throw new Error(`${path}: expected exactly one nav CTA, got ${await cta.count()}`);
    }
    await cta.scrollIntoViewIfNeeded();
    if (!(await cta.isVisible())) throw new Error(`${path}: nav CTA is not visible`);
    const text = (await cta.textContent()).trim();
    if (text !== label) {
      throw new Error(`${path}: nav CTA is ${JSON.stringify(text)}, expected ${JSON.stringify(label)}`);
    }
    const href = await cta.getAttribute("href");
    if (href !== "/cloud/login") {
      throw new Error(`${path}: nav CTA href is ${JSON.stringify(href)}, expected "/cloud/login"`);
    }
    await page.screenshot({ path: `${artifacts}/compare-nav-cta${path.replace(/\//g, "-")}.png`, fullPage: false });
  } finally {
    await page.close();
  }
}

// Issue #117: the Orca deep dive answers the first external positioning test
// (“我今天安装了 Orca，好像和你的项目差不多”). The rendered page must carry
// the verbatim official self-descriptions, at least four honest "Not
// verified"/「未能核实」 cells (the undocumented delivery capabilities never
// written as "No"), the plainly stated licence disadvantage, and the measured
// GitHub-API counts with their measurement date — in both languages.
const orcaPages = {
  "/compare/orca/": {
    zh: "/zh/compare/orca/",
    h1: "Orbi vs Orca",
    quotes: [
      "The AI Orchestrator for 100x builders",
      "ADE for working with a fleet of parallel agents",
      "Drop comments on any diff line and ship them back to the agent",
    ],
    unverified: "Not verified",
    licence: ["MIT", "fair-code", "Sustainable Use"],
    counts: ["66,832", "4,391", "5,867", "2,815", "294", "18", "measured 2026-09-12"],
  },
  "/zh/compare/orca/": {
    zh: "/compare/orca/",
    h1: "Orbi vs Orca",
    quotes: [
      "The AI Orchestrator for 100x builders",
      "ADE for working with a fleet of parallel agents",
      "Drop comments on any diff line and ship them back to the agent",
    ],
    unverified: "未能核实",
    licence: ["MIT", "fair-code", "Sustainable Use"],
    counts: ["66,832", "4,391", "5,867", "2,815", "294", "18", "实测于 2026-09-12"],
  },
};

async function assertOrcaPage(browser, path, size, screenshot) {
  const claim = orcaPages[path];
  const page = await browser.newPage({ viewport: size });
  const consoleErrors = [];
  const failedRequests = [];
  const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st");
  await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
  page.on("console", (message) => {
    if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) consoleErrors.push(`${message.location().url}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    if (!isTelemetry(request.url())) failedRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(`${targetURL}${path}`, { waitUntil: "networkidle" });
  const h1Count = await page.locator("h1").count();
  if (h1Count !== 1) throw new Error(`${path}: expected exactly one h1, got ${h1Count}`);
  const heroH1 = (await page.locator("h1").textContent()).replace(/\s+/g, " ").trim();
  if (heroH1 !== claim.h1) {
    throw new Error(`${path}: h1 is ${JSON.stringify(heroH1)}, expected ${JSON.stringify(claim.h1)}`);
  }
  const text = (await page.locator("main").textContent()).replace(/\s+/g, " ");
  for (const quote of claim.quotes) {
    if (!text.includes(quote)) {
      throw new Error(`${path}: the verbatim official quote is missing: ${JSON.stringify(quote)}`);
    }
  }
  const unverifiedCount = text.split(claim.unverified).length - 1;
  if (unverifiedCount < 4) {
    throw new Error(`${path}: expected at least 4 ${JSON.stringify(claim.unverified)} cells, got ${unverifiedCount}`);
  }
  for (const term of claim.licence) {
    if (!text.includes(term)) throw new Error(`${path}: the licence section is missing ${JSON.stringify(term)}`);
  }
  for (const count of claim.counts) {
    if (!text.includes(count)) throw new Error(`${path}: missing the measured count ${JSON.stringify(count)}`);
  }
  // Navigation consistency, same contract as the cost pages.
  const navSwitch = page.locator("[data-primary-nav] .language a");
  if ((await navSwitch.getAttribute("href")) !== claim.zh) {
    throw new Error(`${path}: language switch does not lead to ${claim.zh}`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`${path}: horizontal overflow of ${overflow}px at ${size.width}x${size.height}`);
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  if (consoleErrors.length || failedRequests.length) {
    throw new Error(`${path}: console errors=${JSON.stringify(consoleErrors)} failed requests=${JSON.stringify(failedRequests)}`);
  }
  await page.close();
}

// Issue #128: the CI-gates guide states the engine contract on the page —
// what the gates read (check-run conclusions, quoted verbatim from
// runner.py / release.py), what that makes Orbi guarantee (whatever CI
// runs: pytest in → code logic; Playwright business flows in → the loop
// closes), and the four boundaries with the fail-open stated prominently —
// the hero carries it, not just the body. Both complete workflow files
// must render as text (verbatim copyable), and the cross links to the
// cost page and the cloud page must exist in the page's own language tree.
const ciGatesPages = {
  "/guides/ci-gates/": {
    zh: "/zh/guides/ci-gates/",
    title: "what you put in CI is what Orbi guarantees",
    h1: "What you put in CI is what Orbi guarantees",
    hero: [
      "with no check runs at all, both gates pass",
      "do not know pytest from Playwright",
    ],
    text: [
      // the verbatim engine quotes and their decision rule
      '("success", "neutral", "skipped")',
      "no check runs (nothing to gate)",
      // the ladder
      "Unit tests only",
      "+ integration tests",
      "+ business-flow e2e (Playwright)",
      "The business loop closes",
      // the four boundaries
      "No check runs, nothing to gate — both gates pass",
      "Neutral and skipped conclusions count as passing",
      "Coverage proves the tests touch the code — not that the code is right",
      "pytest-specific",
      "never read the test log",
      // both complete workflow files render
      "name: CI",
      "runs-on: ubuntu-latest",
      "actions/setup-python@v5",
      "npx playwright install --with-deps chromium",
      "npx playwright test",
      // provenance
      "verified 2026-09-12",
    ],
    hrefs: [
      "https://github.com/orbi-build/orbi/blob/main/src/orbi/runner.py",
      "https://github.com/orbi-build/orbi/blob/main/src/orbi/release.py",
      "https://docs.github.com/en/rest/checks/runs",
    ],
    localHrefs: ["/cost/", "/cloud/"],
  },
  "/zh/guides/ci-gates/": {
    zh: "/guides/ci-gates/",
    title: "CI 里放什么，Orbi 就保证什么",
    h1: "CI 里放什么，Orbi 就保证什么",
    hero: [
      "一个 check run 都没有时，两道门禁都放行",
      "不认识 pytest，也不认识 Playwright",
    ],
    text: [
      '("success", "neutral", "skipped")',
      "no check runs (nothing to gate)",
      "只有单测",
      "+ 集成测试",
      "+ 业务流程 e2e（Playwright）",
      "业务闭环是通的",
      "一个 check run 都没有，两道门禁都放行",
      "neutral 和 skipped 同样算通过",
      "覆盖率证明测试碰过这些代码，不证明代码做对了业务",
      "pytest 专属",
      "从不读测试日志",
      "name: CI",
      "runs-on: ubuntu-latest",
      "actions/setup-python@v5",
      "npx playwright install --with-deps chromium",
      "npx playwright test",
      "核实于 2026-09-12",
    ],
    hrefs: [
      "https://github.com/orbi-build/orbi/blob/main/src/orbi/runner.py",
      "https://github.com/orbi-build/orbi/blob/main/src/orbi/release.py",
      "https://docs.github.com/en/rest/checks/runs",
    ],
    localHrefs: ["/zh/cost/", "/zh/cloud/"],
  },
};

// Issue #177: the bootstrap evidence page is the inspectable entrance.
// The visitor must land on a page that (a) explains Orbi builds Orbi,
// (b) offers at least three public GitHub records as real <a href>,
// (c) never links the private repos, (d) tells the visitor what to look
// for on each timeline, and (e) does not invent a licence name or write a
// qualitative claim as a fact. Screenshots land in .orbi/ next to the other flows.
const evidencePages = {
  "/evidence/": {
    zh: "/zh/evidence/",
    title: "Orbi builds Orbi",
    h1: "Orbi builds Orbi. The record is GitHub",
    hero: [
      "Orbi is the delivery line that ships Orbi",
      "Click them",
    ],
    text: [
      "Issue #852",
      "Issue #842",
      "Issue #825",
      "PR #854",
      "PR #845",
      "PR #830",
      "Release v0.5.5",
      "What to look for on the timeline",
      "review_rounds",
      "xqliu",
      "verified 2026-09-14",
    ],
    hrefs: [
      "https://github.com/orbi-build/orbi/issues/852",
      "https://github.com/orbi-build/orbi/pull/854",
      "https://github.com/orbi-build/orbi/releases/tag/v0.5.5",
      "https://github.com/orbi-build/orbi/issues/842",
      "https://github.com/orbi-build/orbi/pull/845",
      "https://github.com/orbi-build/orbi/releases/tag/v0.5.4",
      "https://github.com/orbi-build/orbi/issues/825",
      "https://github.com/orbi-build/orbi/pull/830",
      "https://github.com/orbi-build/orbi/releases/tag/v0.5.3",
      "https://github.com/orbi-build/orbi/releases",
    ],
    forbiddenHrefs: [
      "https://github.com/orbi-build/orbi-website",
      "https://github.com/orbi-build/orbi-cloud",
    ],
    localHrefs: ["/cloud/"],
    homeEntry: "/",
    homeLink: "/evidence/",
  },
  "/zh/evidence/": {
    zh: "/evidence/",
    title: "Orbi 在造 Orbi",
    h1: "Orbi 在造 Orbi。记录在 GitHub",
    hero: [
      "Orbi 是把 Orbi 自己交付出去的那条产线",
      "请点开",
    ],
    text: [
      "Issue #852",
      "Issue #842",
      "Issue #825",
      "PR #854",
      "PR #845",
      "PR #830",
      "Release v0.5.5",
      "在时间线上看什么",
      "review_rounds",
      "xqliu",
      "核实于 2026-09-14",
    ],
    hrefs: [
      "https://github.com/orbi-build/orbi/issues/852",
      "https://github.com/orbi-build/orbi/pull/854",
      "https://github.com/orbi-build/orbi/releases/tag/v0.5.5",
      "https://github.com/orbi-build/orbi/issues/842",
      "https://github.com/orbi-build/orbi/pull/845",
      "https://github.com/orbi-build/orbi/releases/tag/v0.5.4",
      "https://github.com/orbi-build/orbi/issues/825",
      "https://github.com/orbi-build/orbi/pull/830",
      "https://github.com/orbi-build/orbi/releases/tag/v0.5.3",
      "https://github.com/orbi-build/orbi/releases",
    ],
    forbiddenHrefs: [
      "https://github.com/orbi-build/orbi-website",
      "https://github.com/orbi-build/orbi-cloud",
    ],
    localHrefs: ["/zh/cloud/"],
    homeEntry: "/zh/",
    homeLink: "/zh/evidence/",
  },
};

async function assertEvidencePage(browser, path, size, screenshot) {
  const claim = evidencePages[path];
  const page = await browser.newPage({ viewport: size });
  const consoleErrors = [];
  const failedRequests = [];
  const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st");
  await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
  page.on("console", (message) => {
    if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) consoleErrors.push(`${message.location().url}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    if (!isTelemetry(request.url())) failedRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(`${targetURL}${path}`, { waitUntil: "networkidle" });
  const h1Count = await page.locator("h1").count();
  if (h1Count !== 1) throw new Error(`${path}: expected exactly one h1, got ${h1Count}`);
  const heroH1 = (await page.locator("h1").textContent()).replace(/\s+/g, " ").trim();
  if (heroH1 !== claim.h1) {
    throw new Error(`${path}: h1 is ${JSON.stringify(heroH1)}, expected ${JSON.stringify(claim.h1)}`);
  }
  if (!(await page.title()).includes(claim.title)) {
    throw new Error(`${path}: title ${JSON.stringify(await page.title())} does not carry the claim`);
  }
  const heroText = (await page.locator(".compare-hero").textContent()).replace(/\s+/g, " ");
  for (const needle of claim.hero) {
    if (!heroText.includes(needle)) {
      throw new Error(`${path}: the hero is missing ${JSON.stringify(needle)}: ${JSON.stringify(heroText)}`);
    }
  }
  const text = (await page.locator("main").textContent()).replace(/\s+/g, " ");
  for (const needle of claim.text) {
    if (!text.includes(needle)) {
      throw new Error(`${path}: missing the required claim ${JSON.stringify(needle)}`);
    }
  }
  if (text.toLowerCase().includes("apache")) {
    throw new Error(`${path}: invented or conflicting licence name Apache`);
  }
  for (const href of claim.hrefs) {
    if ((await page.locator(`main a[href="${href}"]`).count()) < 1) {
      throw new Error(`${path}: missing a public evidence link ${href}`);
    }
  }
  const evidenceLinks = await page.locator("main a[data-evidence]").evaluateAll((nodes) =>
    nodes.map((node) => ({ href: node.getAttribute("href"), kind: node.getAttribute("data-evidence") })),
  );
  if (evidenceLinks.length < 3) {
    throw new Error(`${path}: expected at least 3 data-evidence links, got ${evidenceLinks.length}`);
  }
  const kinds = new Set(evidenceLinks.map((link) => link.kind));
  for (const kind of ["issue", "pr", "release"]) {
    if (!kinds.has(kind)) throw new Error(`${path}: missing a ${kind} evidence link`);
  }
  for (const href of claim.forbiddenHrefs) {
    if ((await page.locator(`a[href="${href}"]`).count()) !== 0) {
      throw new Error(`${path}: private repo must not be linked: ${href}`);
    }
  }
  for (const href of claim.localHrefs) {
    if ((await page.locator(`main a[href="${href}"]`).count()) < 1) {
      throw new Error(`${path}: missing the cross link ${href}`);
    }
  }
  const navSwitch = page.locator("[data-primary-nav] .language a");
  if ((await navSwitch.getAttribute("href")) !== claim.zh) {
    throw new Error(`${path}: language switch does not lead to ${claim.zh}`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`${path}: horizontal overflow of ${overflow}px at ${size.width}x${size.height}`);
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  if (consoleErrors.length || failedRequests.length) {
    throw new Error(`${path}: console errors=${JSON.stringify(consoleErrors)} failed requests=${JSON.stringify(failedRequests)}`);
  }
  await page.close();
}

async function assertHomeEvidenceEntry(browser, homePath, evidenceHref) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${targetURL}${homePath}`, { waitUntil: "networkidle" });
    const proof = page.locator('[data-cta="proof"]');
    if ((await proof.count()) !== 1) throw new Error(`${homePath}: expected one hero proof link`);
    if ((await proof.getAttribute("href")) !== evidenceHref) {
      throw new Error(`${homePath}: proof href is ${JSON.stringify(await proof.getAttribute("href"))}, expected ${evidenceHref}`);
    }
    const live = page.locator("#orbi-stats a.stats-evidence");
    if ((await live.count()) !== 1) throw new Error(`${homePath}: LIVE block missing the evidence entrance`);
    if ((await live.getAttribute("href")) !== evidenceHref) {
      throw new Error(`${homePath}: LIVE evidence href is ${JSON.stringify(await live.getAttribute("href"))}`);
    }
    await proof.click();
    const expected = evidenceHref.replace(/\/+$/, "");
    await page.waitForURL((url) => url.pathname.replace(/\/+$/, "") === expected);
    if ((await page.locator("h1").count()) !== 1) {
      throw new Error(`${homePath}: evidence page after click has no h1`);
    }
  } finally {
    await page.close();
  }
}

async function assertCiGatesPage(browser, path, size, screenshot) {
  const claim = ciGatesPages[path];
  const page = await browser.newPage({ viewport: size });
  const consoleErrors = [];
  const failedRequests = [];
  const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st");
  await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
  page.on("console", (message) => {
    if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) consoleErrors.push(`${message.location().url}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    if (!isTelemetry(request.url())) failedRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(`${targetURL}${path}`, { waitUntil: "networkidle" });
  const h1Count = await page.locator("h1").count();
  if (h1Count !== 1) throw new Error(`${path}: expected exactly one h1, got ${h1Count}`);
  const heroH1 = (await page.locator("h1").textContent()).replace(/\s+/g, " ").trim();
  if (heroH1 !== claim.h1) {
    throw new Error(`${path}: h1 is ${JSON.stringify(heroH1)}, expected ${JSON.stringify(claim.h1)}`);
  }
  if (!(await page.title()).includes(claim.title)) {
    throw new Error(`${path}: title ${JSON.stringify(await page.title())} does not carry the claim`);
  }
  // The fail-open boundary is prominent: carried by the hero itself, not
  // only the boundaries section further down.
  const heroText = (await page.locator(".compare-hero").textContent()).replace(/\s+/g, " ");
  for (const needle of claim.hero) {
    if (!heroText.includes(needle)) {
      throw new Error(`${path}: the hero is missing the prominent claim ${JSON.stringify(needle)}: ${JSON.stringify(heroText)}`);
    }
  }
  const text = (await page.locator("main").textContent()).replace(/\s+/g, " ");
  for (const needle of claim.text) {
    if (!text.includes(needle)) {
      throw new Error(`${path}: missing the required claim ${JSON.stringify(needle)}`);
    }
  }
  for (const href of claim.hrefs) {
    if ((await page.locator(`main a[href="${href}"]`).count()) < 1) {
      throw new Error(`${path}: missing a link to the engine source ${href}`);
    }
  }
  for (const href of claim.localHrefs) {
    if ((await page.locator(`main a[href="${href}"]`).count()) < 1) {
      throw new Error(`${path}: missing the cross link ${href}`);
    }
  }
  // Navigation consistency: the language switch leads to the counterpart page.
  const navSwitch = page.locator("[data-primary-nav] .language a");
  if ((await navSwitch.getAttribute("href")) !== claim.zh) {
    throw new Error(`${path}: language switch does not lead to ${claim.zh}`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`${path}: horizontal overflow of ${overflow}px at ${size.width}x${size.height}`);
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  if (consoleErrors.length || failedRequests.length) {
    throw new Error(`${path}: console errors=${JSON.stringify(consoleErrors)} failed requests=${JSON.stringify(failedRequests)}`);
  }
  await page.close();
}

async function assertInstallCopiesOneLiner(browser, path) {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  try {
    const page = await context.newPage();
    await page.goto(`${targetURL}${path}`, { waitUntil: "networkidle" });
    await page.locator(".install-copy").click();
    // is-copied flips exactly when the write promise resolved, so the
    // clipboard read below cannot race the copy.
    await page.waitForFunction(() => document.querySelector(".install-copy").classList.contains("is-copied"));
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    if (copied !== installCommand) {
      throw new Error(`${path}: copy button produced ${JSON.stringify(copied)}, expected ${JSON.stringify(installCommand)}`);
    }
    await page.close();
  } finally {
    await context.close();
  }
}

async function assertPublishedInstallScript(browser) {
  const context = await browser.newContext();
  try {
    const response = await context.request.get(`${targetURL}/install.sh`);
    if (response.status() !== 200) throw new Error(`/install.sh returned ${response.status()}`);
    const body = await response.text();
    if (!body.startsWith("#!/usr/bin/env bash") || !body.includes("orbi setup")) {
      throw new Error("/install.sh does not look like the orbi install script");
    }
    // Locally the served bytes must equal the published file; remotely the
    // drift check in CI owns the equality, so a shape check is enough.
    if (!process.env.BASE_URL) {
      const { readFile } = await import("node:fs/promises");
      if (body !== await readFile("public/install.sh", "utf8")) {
        throw new Error("/install.sh is not served from public/install.sh verbatim");
      }
    }
  } finally {
    await context.close();
  }
}

async function main() {
  await mkdir(artifacts, { recursive: true });
  const server = process.env.BASE_URL ? null : await startServer();
  let browser;
  let cleanupPromise;
  const cleanup = () => {
    if (!cleanupPromise) {
      cleanupPromise = (async () => {
        try {
          if (browser) await browser.close();
        } finally {
          await stopServer(server);
        }
      })();
    }
    return cleanupPromise;
  };
  const onSignal = (signal) => {
    void cleanup()
      .then(() => process.exit(signal === "SIGINT" ? 130 : 143))
      .catch((error) => {
        console.error(`Failed to clean up after ${signal}:`, error.stack || error);
        process.exit(1);
      });
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : {}),
      headless: true,
    });
    await assertCloudLoginRedirect(targetURL);
    await assertPublishedInstallScript(browser);
    await assertInstallCopiesOneLiner(browser, "/");
    await assertHomepage(browser, "/", "/compare/", { width: 1440, height: 900 }, "homepage-en-desktop.png");
    await assertHomepage(browser, "/", "/compare/", { width: 390, height: 844 }, "homepage-en-mobile.png");
    await assertHomepage(browser, "/zh/", "/zh/compare/", { width: 1440, height: 900 }, "homepage-zh-desktop.png");
    await assertHomepage(browser, "/zh/", "/zh/compare/", { width: 390, height: 844 }, "homepage-zh-mobile.png");
    await assertCampaignRefSurvivesHeroClick(browser);
    // Issue #259: first-screen geometry at the two sizes that decide the
    // fold — the 1366×768 laptop and the 390×844 phone.
    await assertHeroAboveFold(browser, "/", { width: 1366, height: 768 }, "hero-fold-en-laptop.png");
    await assertHeroAboveFold(browser, "/", { width: 390, height: 844 }, "hero-fold-en-phone.png");
    await assertHeroAboveFold(browser, "/zh/", { width: 1366, height: 768 }, "hero-fold-zh-laptop.png");
    await assertHeroAboveFold(browser, "/zh/", { width: 390, height: 844 }, "hero-fold-zh-phone.png");
    // Issue #267: the single-column hero geometry at the breakpoint the
    // Issue reproduces (960×850, Z Fold 8 unfolded), both languages; the
    // 1080×960 shot watches the two-column layout just above the breakpoint
    // for regression. 1440×900 and 390×844 are shot by assertHomepage above.
    await assertHeroSingleColumn(browser, "/", { width: 960, height: 850 }, "hero-single-en-960.png");
    await assertHeroSingleColumn(browser, "/zh/", { width: 960, height: 850 }, "hero-single-zh-960.png");
    await assertHeroSingleColumn(browser, "/", { width: 1080, height: 960 }, "hero-two-en-1080.png");
    // Issue #262: the proof-loop video renders inside its container at the
    // laptop and phone widths the Issue names, with no horizontal scroll,
    // and the reduced-motion visitor gets the static poster.
    await assertProofLoop(browser, "/", { width: 1366, height: 768 }, "proof-loop-en-laptop.png");
    await assertProofLoop(browser, "/", { width: 390, height: 844 }, "proof-loop-en-phone.png");
    await assertProofLoop(browser, "/zh/", { width: 1366, height: 768 }, "proof-loop-zh-laptop.png");
    await assertProofLoop(browser, "/zh/", { width: 390, height: 844 }, "proof-loop-zh-phone.png");
    await assertProofLoopReducedMotion(browser, "/");
    await assertProofLoopReducedMotion(browser, "/zh/");
    // Issue #107: follow a real click from every Cloud CTA — hero, card and
    // nav share one promise — to the endpoint CLOUD_LOGIN_EXPECT declares.
    const homepageCloudCtas = [
      ["cloud-start", '[data-cta="cloud-start"]'],
      ["cloud-start-card", '[data-cta="cloud-start-card"]'],
      ["midway-cloud", '[data-cta="midway-cloud"]'],
      ["nav Start Cloud", "[data-primary-nav] .nav-apply"],
    ];
    await assertCtaLandsAtEndpoint(browser, "/", homepageCloudCtas);
    await assertCtaLandsAtEndpoint(browser, "/zh/", homepageCloudCtas);
    // Issue #97: both Cloud pages, both languages, phone and desktop widths.
    await assertCloudPage(browser, "/cloud/", { width: 1440, height: 900 }, "cloud-en-desktop.png");
    await assertCloudPage(browser, "/cloud/", { width: 390, height: 844 }, "cloud-en-mobile.png");
    await assertCloudPage(browser, "/zh/cloud/", { width: 1440, height: 900 }, "cloud-zh-desktop.png");
    await assertCloudPage(browser, "/zh/cloud/", { width: 390, height: 844 }, "cloud-zh-mobile.png");
    // Issue #107: the /cloud/ page's login buttons land at the same contract.
    await assertCtaLandsAtEndpoint(browser, "/cloud/", [["Start Cloud", "a.button-signal"]]);
    await assertCtaLandsAtEndpoint(browser, "/zh/cloud/", [["开始 Cloud", "a.button-signal"]]);
    // Issue #90: both cost pages, both languages, phone and desktop widths.
    // Issue #118: the two languages' rendered sample sizes must agree — the
    // page's whole credibility is that the numbers reconcile.
    const costEnN = await assertCostPage(browser, "/cost/", { width: 1440, height: 900 }, "cost-en-desktop.png");
    await assertCostPage(browser, "/cost/", { width: 390, height: 844 }, "cost-en-mobile.png");
    const costZhN = await assertCostPage(browser, "/zh/cost/", { width: 1440, height: 900 }, "cost-zh-desktop.png");
    await assertCostPage(browser, "/zh/cost/", { width: 390, height: 844 }, "cost-zh-mobile.png");
    if (costEnN !== costZhN) {
      throw new Error(`cost pages disagree on the sample size: /cost/ shows n=${costEnN}, /zh/cost/ shows n=${costZhN}`);
    }
    // Issue #89: both compare indexes, both languages, phone and desktop widths.
    await assertCompareMatrix(browser, "/compare/", { width: 1440, height: 900 }, "compare-en-desktop.png");
    await assertCompareMatrix(browser, "/compare/", { width: 390, height: 844 }, "compare-en-mobile.png");
    await assertCompareMatrix(browser, "/zh/compare/", { width: 1440, height: 900 }, "compare-zh-desktop.png");
    await assertCompareMatrix(browser, "/zh/compare/", { width: 390, height: 844 }, "compare-zh-mobile.png");
    // Issue #170: /compare/ is a buyer-decision hop. The nav CTA must be the
    // same Cloud login as every other page, not Apply — a silent /apply
    // still 200s, so the funnel would break without a 404.
    await assertCompareNavCta(browser, "/compare/", "Start Cloud");
    await assertCompareNavCta(browser, "/zh/compare/", "开始 Cloud");
    await assertCtaLandsAtEndpoint(browser, "/compare/", [["nav Start Cloud", "[data-primary-nav] .nav-apply"]]);
    await assertCtaLandsAtEndpoint(browser, "/zh/compare/", [["nav Start Cloud", "[data-primary-nav] .nav-apply"]]);
    // Issue #117: the Orca deep dive, both languages, phone and desktop widths.
    await assertOrcaPage(browser, "/compare/orca/", { width: 1440, height: 900 }, "compare-orca-en-desktop.png");
    await assertOrcaPage(browser, "/compare/orca/", { width: 390, height: 844 }, "compare-orca-en-mobile.png");
    await assertOrcaPage(browser, "/zh/compare/orca/", { width: 1440, height: 900 }, "compare-orca-zh-desktop.png");
    await assertOrcaPage(browser, "/zh/compare/orca/", { width: 390, height: 844 }, "compare-orca-zh-mobile.png");
    // Issue #128: the CI-gates guide, both languages, phone and desktop widths.
    await assertCiGatesPage(browser, "/guides/ci-gates/", { width: 1440, height: 900 }, "ci-gates-en-desktop.png");
    await assertCiGatesPage(browser, "/guides/ci-gates/", { width: 390, height: 844 }, "ci-gates-en-mobile.png");
    await assertCiGatesPage(browser, "/zh/guides/ci-gates/", { width: 1440, height: 900 }, "ci-gates-zh-desktop.png");
    await assertCiGatesPage(browser, "/zh/guides/ci-gates/", { width: 390, height: 844 }, "ci-gates-zh-mobile.png");
    // Issue #169: bootstrap evidence page, both languages, phone and desktop.
    await assertHomeEvidenceEntry(browser, "/", "/evidence/");
    await assertHomeEvidenceEntry(browser, "/zh/", "/zh/evidence/");
    await assertEvidencePage(browser, "/evidence/", { width: 1440, height: 900 }, "evidence-en-desktop.png");
    await assertEvidencePage(browser, "/evidence/", { width: 390, height: 844 }, "evidence-en-mobile.png");
    await assertEvidencePage(browser, "/zh/evidence/", { width: 1440, height: 900 }, "evidence-zh-desktop.png");
    await assertEvidencePage(browser, "/zh/evidence/", { width: 390, height: 844 }, "evidence-zh-mobile.png");
    const assetContext = await browser.newContext();
    try {
      for (const path of [...deepDives.map(([, href]) => href), "/zh/compare/orca/", "/cloud/", "/zh/cloud/", "/zh/compare/", "/cost/", "/zh/cost/", "/guides/ci-gates/", "/zh/guides/ci-gates/", "/evidence/", "/zh/evidence/"]) {
        const response = await assetContext.request.get(`${targetURL}${path}`);
        if (response.status() !== 200) throw new Error(`${path} returned ${response.status()}`);
      }
      const sitemap = await (await assetContext.request.get(`${targetURL}/sitemap.xml`)).text();
      for (const href of [...deepDives.map(([, href]) => href), "/cloud/", "/zh/cloud/", "/cost/", "/zh/cost/", "/guides/ci-gates/", "/zh/guides/ci-gates/", "/evidence/", "/zh/evidence/"]) {
        if (!sitemap.includes(`https://orbi.build${href}"`)) throw new Error(`sitemap.xml is missing https://orbi.build${href}`);
      }
    } finally {
      await assetContext.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    const failures = [];
    const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st") || url.includes("fonts.googleapis.com");
    await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
    if (!process.env.BASE_URL) {
      await page.route("**/stats", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ repos: {
          orbi: { started: "2025-01-01T00:00:00Z", issues_closed: 1, prs_merged: 1, releases: 1, stars: 1, star_history: [] },
          "orbi-website": { started: "2025-01-01T00:00:00Z", issues_closed: 1, prs_merged: 1, releases: 0, stars: 0, star_history: [], deploys: 1 },
          "orbi-cloud": null,
        } }),
      }));
    }
    page.on("console", (message) => { if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) errors.push(`${message.location().url}: ${message.text()}`); });
    page.on("requestfailed", (request) => { if (!isTelemetry(request.url())) failures.push(request.url()); });
    await page.goto(`${targetURL}/compare/`, { waitUntil: "networkidle" });
    await assertFooterDeepDives(page, "/compare/");
    await page.getByRole("link", { name: "Orbi vs Cursor Cloud Agents", exact: true }).click();
    await page.waitForLoadState("networkidle");
    if (new URL(page.url()).pathname !== "/compare/cursor/") throw new Error(`detail route: ${page.url()}`);
    await assertFooterDeepDives(page, "/compare/cursor/");
    if ((await page.getByRole("link", { name: "中文", exact: true }).getAttribute("href")) !== "/zh/compare/cursor/") throw new Error("detail language switch is wrong");
    await page.getByRole("heading", { name: "Orbi vs Cursor Cloud Agents", exact: true }).waitFor();
    await page.screenshot({ path: `${artifacts}/comparison-cursor.png`, fullPage: false });
    if (errors.length || failures.length) throw new Error(`comparison page errors=${JSON.stringify(errors)} failed=${JSON.stringify(failures)}`);
    await page.close();
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await cleanup();
  }
}

// Run only when executed directly, so vitest can import the contract helpers
// above without starting the browser or the local server.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
