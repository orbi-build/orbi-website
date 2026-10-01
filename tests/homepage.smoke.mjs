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
  ["Orbi vs GitHub Copilot cloud agent", "/compare/github-copilot-coding-agent/"],
  ["Orbi vs Claude Managed Agents", "/compare/managed-agents/"],
  ["Orbi vs Claude Code", "/compare/claude-code/"],
  ["Orbi vs OpenHands", "/compare/openhands/"],
  ["Orbi vs Hermes Agent", "/compare/hermes-agent/"],
  ["Orbi vs Keelen", "/compare/keelen/"],
  ["Orbi vs OpenAI Codex", "/compare/codex/"],
  ["Orbi vs Devin", "/compare/devin/"],
  ["Orbi vs Google Jules", "/compare/jules/"],
  ["Orbi vs Cursor Cloud Agents", "/compare/cursor/"],
];

// Issue #704: the hero uses the approved short lede and keeps one pricing
// CTA as its only link.
const releaseClaims = {
  "/": {
    h1: "File an Issue. Get a release.",
    lede: ["An AI agent that takes your Issues all the way to a release."],
    title: "File an Issue. Get a release.",
  },
  "/zh/": {
    h1: "提个 Issue，收个版本",
    lede: ["AI 把你的 Issue 一路做到发版。"],
    title: "提个 Issue，收个版本",
  },
};
const sharedAttributes = {
  "/": [
    "Open source (AGPL-3.0), free forever",
    "Self-hosted — code never leaves your machine",
    "Bring your own model",
  ],
  "/zh/": [
    "开源（AGPL-3.0），永久免费",
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
const localFoundingLogins = Array.from({ length: 11 }, (_, index) => `founder-${index + 1}`);
const localFoundingAvatars = localFoundingLogins
  .map((login) => `<img class="orbi-avatar-wall-list-img" alt="" title="${login}" src="https://avatars.githubusercontent.com/${login}?s=80" loading="lazy" decoding="async">`)
  .join("");

export function countServerRenderedAvatars(html) {
  return html.match(/<img\b[^>]*class=["'][^"']*\borbi-avatar-wall-list-img\b[^"']*["'][^>]*>/g)?.length ?? 0;
}

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
      // The site Worker answers the engagement beacon with 204 (src/worker.js
      // engagementResponse); the stand-in does the same.
      if (pathname === "/cloud/e" && request.method === "POST") {
        request.resume();
        response.writeHead(204);
        response.end();
        return;
      }
      // Issue #541: the site Worker answers /subscribe with JSON only —
      // the no-JS 303 fallback is gone. This JSON stand-in is what the
      // browser smoke's JS submission flow talks to in local mode.
      if (pathname === "/subscribe" && request.method === "POST") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = Buffer.concat(chunks).toString("utf8");
        const invalid = body.includes("invalid@example.com");
        response.writeHead(invalid ? 400 : 200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(invalid ? { error: "invalid_email" } : { ok: true }));
        return;
      }
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
              .replaceAll(pricing.soloMonthlyUsdToken, String(pricing.soloMonthlyUsd))
              .replaceAll(pricing.soloAnnualUsdToken, String(pricing.soloAnnualUsd))
              .replaceAll(pricing.proAnnualUsdToken, String(pricing.proAnnualUsd))
              .replaceAll(pricing.soloAnnualMonthlyUsdToken, String(pricing.soloAnnualMonthlyUsd))
              .replaceAll(pricing.proAnnualMonthlyUsdToken, String(pricing.proAnnualMonthlyUsd))
              .replaceAll(pricing.soloAnnualSavingsPercentToken, String(pricing.soloAnnualSavingsPercent))
              .replaceAll(pricing.proAnnualSavingsPercentToken, String(pricing.proAnnualSavingsPercent))
              .replaceAll(pricing.annualSavingsPercentToken, String(pricing.annualSavingsPercent))
              .replaceAll(pricing.soloIncludedTokensToken, String(pricing.soloIncludedTokensLabel))
              .replaceAll(pricing.soloRepositoriesToken, String(pricing.soloRepositories))
              .replaceAll(pricing.proRepositoriesToken, String(pricing.proRepositories))
              .replaceAll(pricing.foundingPartnerLimitToken, String(pricing.foundingPartnerLimit))
              .replaceAll(pricing.foundingPromoCodeToken, pricing.foundingPromoCode)
              .replaceAll(pricing.includedTokensToken, String(pricing.includedTokensLabel))
              .replaceAll(pricing.freeDeliveriesToken, String(pricing.freeDeliveries))
              .replaceAll(
                pricing.measuredSmallRepositoryDeliveryRangeToken,
                String(pricing.measuredSmallRepositoryDeliveryRange),
              )
              .replaceAll(
                pricing.measuredSoloRepositoryDeliveryRangeToken,
                String(pricing.measuredSoloRepositoryDeliveryRange),
              )
              .replaceAll(
                pricing.measuredLargeCodebaseDeliveriesToken,
                String(pricing.measuredLargeCodebaseDeliveries),
              )
              .replaceAll(
                pricing.measuredSoloLargeCodebaseDeliveriesToken,
                String(pricing.measuredSoloLargeCodebaseDeliveries),
              )
              .replaceAll("__FOUNDING_AVATARS_HIDDEN__", localFoundingLogins.length ? "" : "hidden")
              .replaceAll("__FOUNDING_AVATARS__", localFoundingAvatars),
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
// Issue #570: the handoff 302s to CLOUD_LOGIN_URL — Cloud's sign-in entry
// /api/login (measured live 2026-09-26 against beta.orbi.build) — whose own
// 302 opens GitHub's OAuth authorize page. A visitor who authorized Orbi
// before returns from there at once; one who comes back without an App
// installation is sent on to the installation page by Cloud itself. #528's
// one-step /api/start stranded a user who had installed the App but was not
// signed in to Orbi on the installation page, unable to reach the console.
export function resolveCloudLoginExpect(raw) {
  if (raw === undefined) return "fail-closed-404";
  if (raw !== "github-app-302" && raw !== "fail-closed-503" && raw !== "fail-closed-404") {
    throw new Error(
      `CLOUD_LOGIN_EXPECT must be github-app-302, fail-closed-503, or fail-closed-404, got ${JSON.stringify(raw)}`
    );
  }
  return raw;
}

// Every page ships the engagement beacon (POST /cloud/e), which the site
// Worker answers with 204. A stand-in that 404s it turns a page-leave beacon
// into a console error whenever it lands before a check ends (flaky CI).
export async function assertEngagementEndpoint(targetURL) {
  const response = await fetch(`${targetURL}/cloud/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "engaged", path: "/" }),
  });
  if (response.status !== 204) {
    throw new Error(`POST /cloud/e answered ${response.status}, expected 204 like the site Worker`);
  }
}

async function assertSubscriptionFlow(browser, path, expectedSuccess, expectedInvalid) {
  const page = await browser.newPage();
  try {
    await page.goto(`${targetURL}${path}`, { waitUntil: "load" });
    const email = page.locator("[data-subscribe-form] input[type=email]");
    const submit = page.locator("[data-subscribe-form] button[type=submit]");
    const status = page.locator("[data-subscribe-status]");
    const waitForStatus = (expected) => page.waitForFunction(
      ([selector, text]) => document.querySelector(selector)?.textContent?.trim() === text,
      ["[data-subscribe-status]", expected],
    );

    await email.fill("invalid@example.com");
    await submit.click();
    await waitForStatus(expectedInvalid);
    await email.fill("smoke@example.com");
    await submit.click();
    await waitForStatus(expectedSuccess);
    const text = (await status.textContent())?.trim();
    if (text !== expectedSuccess) {
      throw new Error(`${path} subscription displayed ${JSON.stringify(text)}, expected ${JSON.stringify(expectedSuccess)}`);
    }
  } finally {
    await page.close();
  }
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
      if (expectation === "github-app-302") {
        // Issue #570: the website's handoff must 302 to /api/login on the
        // same host — the hop carries the ref attribution as the request's
        // cookie, so the handoff must never overwrite it — and /api/login
        // must answer with GitHub's OAuth authorize redirect carrying
        // client_id and redirect_uri. One manual hop each: the responses
        // themselves are the contract, not where a browser would finally land.
        if (response.status() !== 302) {
          throw new Error(`Cloud login ${path} expected 302, got ${response.status()}`);
        }
        const handoff = new URL(headers.location || "", targetURL);
        if (handoff.origin !== new URL(targetURL).origin || handoff.pathname !== "/api/login") {
          throw new Error(`Cloud login ${path} expected a 302 to /api/login, got ${headers.location}`);
        }
        const refOverwritten = response
          .headersArray()
          .some(({ name, value }) => name.toLowerCase() === "set-cookie" && value.startsWith("ref="));
        if (refOverwritten) {
          throw new Error(`Cloud login ${path} overwrote the campaign ref cookie`);
        }
        const cloud = await context.get(handoff.toString(), { maxRedirects: 0 });
        const cloudLocation = cloud.headers().location || "";
        let authorize = null;
        if (cloud.status() === 302) {
          try {
            authorize = new URL(cloudLocation);
          } catch {
            authorize = null;
          }
        }
        if (!authorize
            || authorize.origin !== "https://github.com"
            || authorize.pathname !== "/login/oauth/authorize"
            || !authorize.searchParams.get("client_id")
            || !authorize.searchParams.get("redirect_uri")) {
          throw new Error(
            `Cloud login ${path} did not redirect to GitHub's OAuth authorize: ${cloud.status()} ${cloudLocation}`
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
//   github-app-302   → GitHub's sign-in authorization (beta, Issue #570; the
//                      handoff chain is pinned by assertCloudLoginRedirect)
//   fail-closed-503  → the self-host docs (Issue #179's unconfigured shape)
//   fail-closed-404  → the /cloud/login handoff route itself (local static
//                      serving: no worker completes the chain, the click
//                      must still reach the handoff)
// The landing must also answer with the status its contract promises: the
// GitHub pages render (<400), and the fail-closed handoff answers 404 — a
// static server locally, the site Worker's stamped 404 where one is
// deployed (assertCloudLoginRedirect checks the stamp).
export function expectedCtaLanding(expectation) {
  if (expectation === "github-app-302") {
    return {
      describe: "GitHub's sign-in authorization",
      statusOk: (status) => status < 400,
      matches: (url) =>
        url.hostname === "github.com" &&
        (url.pathname === "/login/oauth/authorize" ||
          // A visitor not signed in to GitHub is bounced once more by GitHub
          // to its sign-in page, which preserves the authorization request in
          // return_to (Issue #570). A bare /login without it is not the flow.
          (url.pathname === "/login"
            && /^\/login\/oauth\/authorize/.test(url.searchParams.get("return_to") || ""))),
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
    matches: (url) => url.pathname === "/cloud/login" || url.pathname === "/zh/cloud/login",
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

// Issues #273/#322: exercise the campaign user's actual two-step browser
// journey. On beta the first request asks the real Worker to plant the ref
// cookie; the local static fixture cannot do that, so it starts from the same
// documented precondition. The homepage CTA must first introduce Cloud, then
// the login request must be query-free, carry the campaign cookie, and must not
// receive a replacement ref cookie from the handoff.
async function assertCampaignRefSurvivesHeroClick(browser) {
  const expectation = resolveCloudLoginExpect(process.env.CLOUD_LOGIN_EXPECT);
  if (process.env.BASE_URL && expectation !== "github-app-302") return;

  const token = "x-2609201530";
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  try {
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    const isTelemetry = (url) => url.includes("cloudflareinsights.com");
    await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
    if (!process.env.BASE_URL) {
      await page.route("**/stats", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(localStatsFixture),
      }));
      await page.route("**/cloud/login", (route) => route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Cloud login handoff</title>",
      }));
    }
    page.on("console", (message) => {
      if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) {
        consoleErrors.push(message.text());
      }
    });
    page.on("requestfailed", (request) => {
      const abortedMedia = request.failure()?.errorText === "net::ERR_ABORTED"
        && request.url().includes("/video/delivery-loop");
      if (!isTelemetry(request.url()) && !abortedMedia) {
        failedRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.goto(`${targetURL}/?ref=${token}`, { waitUntil: "load" });
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
    await page.locator('[data-cta="cloud-start"]').click(
      process.env.BASE_URL ? { noWaitAfter: true } : {},
    );
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
export function isDisposedRequestContextError(error) {
  return typeof error?.message === "string" && error.message.includes("Request context disposed");
}

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
  const isTelemetry = (url) => url.includes("cloudflareinsights.com");
  await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
  await page.route("https://avatars.githubusercontent.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#3ddc97"/></svg>',
  }));
  // Issue #101: /stats answers one group per repository, and the local
  // fixture leaves orbi-cloud null on purpose — a repo that fails must
  // degrade only its own group to the HTML floors while the other two still
  // show live numbers. Issue #126: where BASE_URL is set the route passes the
  // real Worker response through and records it; without BASE_URL the static
  // server has no /stats, so the same handler fulfills the request with the
  // fixture. Either way servedStats carries the exact payload the page
  // received, and the wait below asserts the render against that payload.
  let servedStats = null;
  let liveStatsFetched = false;
  await page.route("**/stats", async (route) => {
    if (process.env.BASE_URL && !liveStatsFetched) {
      let response;
      try {
        response = await route.fetch();
      } catch (error) {
        if (isDisposedRequestContextError(error)) return;
        throw error;
      }
      const body = await response.text();
      try {
        servedStats = JSON.parse(body);
      } catch {
        servedStats = null;
      }
      liveStatsFetched = true;
      await route.fulfill({
        status: response.status(),
        contentType: response.headers()["content-type"] || "application/json",
        body,
      });
      return;
    }
    if (!process.env.BASE_URL) servedStats = localStatsFixture;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(servedStats),
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

  // The homepage has an autoplaying video, so networkidle depends on media
  // download timing and can stall the bounded CI suite. Wait only for the
  // functional /stats response; DOM load is the correct navigation gate.
  const statsResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/stats").catch(() => null);
  const navigationResponse = await page.goto(`${targetURL}${path}`, { waitUntil: "load" });
  let serverAvatarCount;
  if (process.env.BASE_URL) {
    if (!navigationResponse?.ok()) {
      throw new Error(`${path}: homepage HTML answered ${navigationResponse?.status() ?? "no response"}`);
    }
    serverAvatarCount = countServerRenderedAvatars(await navigationResponse.text());
    if (serverAvatarCount < 1) {
      throw new Error(`${path}: server-rendered homepage contains no avatars`);
    }
  }
  const hero = page.locator(".hero");
  const heroProofBox = await page.locator(".hero-proof-bar").boundingBox();
  if (!heroProofBox || heroProofBox.y < 0 || heroProofBox.y + heroProofBox.height > size.height) {
    throw new Error(`${path}: hero proof bar is outside the first ${size.width}x${size.height} viewport: ${JSON.stringify(heroProofBox)}`);
  }
  const claim = releaseClaims[path];
  const heroH1 = (await hero.locator("h1").textContent()).replace(/\s+/g, " ").trim();
  if (heroH1 !== claim.h1) {
    throw new Error(`${path}: hero h1 is ${JSON.stringify(heroH1)}, expected the release claim ${JSON.stringify(claim.h1)}`);
  }
  const heroLayout = await hero.locator("h1").evaluate((h1) => {
    const style = getComputedStyle(h1);
    return {
      lines: Math.round(h1.getBoundingClientRect().height / parseFloat(style.lineHeight)),
      overflows: h1.scrollWidth > h1.clientWidth,
    };
  });
  if (heroLayout.lines !== 2) {
    throw new Error(`${path}: hero h1 rendered ${heroLayout.lines} lines at ${size.width}px, expected 2`);
  }
  if (heroLayout.overflows) {
    throw new Error(`${path}: hero h1 overflows horizontally at ${size.width}px`);
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
  if (await hero.locator("a").count() !== 1 || await hero.locator('[data-cta="cloud-start"]').count() !== 1) {
    throw new Error(`${path}: hero must contain exactly one cloud-start link`);
  }
  if (await hero.locator('[data-cta="film-play"]').count() !== 0) {
    throw new Error(`${path}: removed film control remains in the hero`);
  }
  const systemText = await page.locator("#system").textContent();
  for (const attribute of sharedAttributes[path]) {
    if (!systemText.includes(attribute)) {
      throw new Error(`${path}: the How-it-works section lost the shared attribute ${JSON.stringify(attribute)}`);
    }
  }
  const receivedStatsResponse = await statsResponse;
  if (!receivedStatsResponse || !statsRequested) {
    throw new Error(`${path}: /stats before scroll response=${Boolean(receivedStatsResponse)} request=${statsRequested}`);
  }
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
  const flagship = servedStats?.repos?.orbi;
  const heroProofValues = await page.locator(".hero-proof-bar [data-stat]").allTextContents();
  const expectedHeroProofValues = [flagship?.prs_merged, flagship?.releases].map(String);
  if (JSON.stringify(heroProofValues) !== JSON.stringify(expectedHeroProofValues)) {
    throw new Error(`${path}: hero proof rendered ${JSON.stringify(heroProofValues)}, expected live values ${JSON.stringify(expectedHeroProofValues)}`);
  }
  if (!flagship) throw new Error(`${path}: stats payload has no flagship repository`);
  if ((await page.locator("[data-runtime-proof]").count()) !== 0) {
    throw new Error(`${path}: removed runtime proof section remains`);
  }
  // Avatar identities are server-rendered into the HTML, deliberately not
  // carried by the public /stats payload. Exercise the complete browser path:
  // the aggregate endpoint stays identity-free and every rendered image
  // finishes loading once scrolled to. Local mode additionally
  // pins all 11 injected identities below.
  if (servedStats?.founding && Object.hasOwn(servedStats.founding, "github_logins")) {
    throw new Error(`${path}: /stats exposes founding GitHub logins`);
  }
  const wall = page.locator("[data-avatar-wall]");
  const browserAvatarCount = await wall.locator("img").count();
  if (process.env.BASE_URL && browserAvatarCount !== serverAvatarCount) {
    throw new Error(`${path}: browser rendered ${browserAvatarCount} avatars, server HTML rendered ${serverAvatarCount}`);
  }
  if (!process.env.BASE_URL && browserAvatarCount !== 11) {
    throw new Error(`${path}: expected 11 server-rendered avatars`);
  }
  const images = wall.locator("img");
  for (let index = 0; index < browserAvatarCount; index += 1) {
    const image = images.nth(index);
    await image.waitFor({ state: "visible" });
    // Issue #586: the avatars are lazy, so visibility no longer implies a
    // started download. Scroll each one to the viewport, wait out its load
    // (the error event fails fast instead of hanging), then assert it.
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(
      (element) =>
        element.complete
          ? undefined
          : new Promise((resolve, reject) => {
            element.addEventListener("load", resolve, { once: true });
            element.addEventListener("error", () => reject(new Error("image failed to load")), { once: true });
          }),
    );
    if (!(await image.evaluate((element) => element.complete && element.naturalWidth > 0))) {
      throw new Error(`${path}: avatar ${index + 1} did not load`);
    }
  }
  if (!process.env.BASE_URL) {
    const titles = await images.evaluateAll((items) => items.map((image) => image.title));
    if (titles.join("|") !== localFoundingLogins.join("|")) {
      throw new Error(`${path}: server-rendered avatar identities changed`);
    }
  }
  await wall.screenshot({ path: `${artifacts}/avatar-wall-${screenshot}` });
  // Issue #711: the homepage carries exactly one primary hero CTA, visible,
  // plus the proof CTA and the nav "Start free" keeping the same promise.
  // The hero and proof handoff go straight to login.
  if (await hero.locator(".button-signal").count() !== 1) throw new Error(`${path}: expected one primary CTA`);
  const cloudCta = hero.locator('[data-cta="cloud-start"]');
  await cloudCta.scrollIntoViewIfNeeded();
  if (!(await cloudCta.isVisible())) throw new Error(`${path}: cloud-start CTA is not visible`);
  // Issue #51: the compare entry belongs to the top navigation; the hero
  // must not carry a competing focus.
  if (await hero.locator('[data-cta="comparisons"]').count() !== 0) {
    throw new Error(`${path}: compare CTA must not live in the hero`);
  }
  if ((await page.locator('[data-cta="midway-cloud"]').count()) !== 1) {
    throw new Error(`${path}: expected exactly one midway-cloud CTA`);
  }
  if ((await page.locator("[data-primary-nav] .nav-apply").count()) !== 1) {
    throw new Error(`${path}: expected exactly one nav Start free`);
  }
  const summary = page.locator(".pricing-summary");
  if (await summary.count() !== 1) throw new Error(`${path}: pricing summary is missing`);
  const summaryText = await summary.textContent();
  for (const value of [pricing.soloMonthlyUsd, pricing.cloudMonthlyUsd, pricing.soloIncludedTokensLabel, pricing.includedTokensLabel, pricing.soloRepositories, pricing.proRepositories, pricing.freeDeliveries, pricing.foundingPartnerLimit]) {
    if (!summaryText.includes(String(value))) throw new Error(`${path}: pricing summary is missing ${value}`);
  }
  const summaryHref = path.startsWith("/zh") ? "/zh/cloud/#pricing" : "/cloud/#pricing";
  const summaryLink = summary.locator(`[data-cta="pricing-summary"][href="${summaryHref}"]`);
  if (await summaryLink.count() !== 1) throw new Error(`${path}: pricing summary link has wrong target`);
  await summary.scrollIntoViewIfNeeded();
  await summary.screenshot({ path: `${artifacts}/pricing-summary-${screenshot}` });
  const resourcesHeading = path.startsWith("/zh") ? "资源" : "Resources";
  const resourcesGroup = page.locator(".footer-group", {
    has: page.locator("h2", { hasText: resourcesHeading }),
  });
  const footerCompare = resourcesGroup.locator(`a[href="${comparisonPath}"]`);
  if ((await footerCompare.count()) !== 1) {
    throw new Error(`${path}: Resources footer comparison link has wrong href`);
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
    await page.goBack({ waitUntil: "load" });
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
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`${path}: horizontal overflow of ${overflow}px at ${size.width}x${size.height}`);
  const shownCommand = (await page.locator(".install-block [data-copy-source]").textContent()).trim();
  if (shownCommand !== installCommand) {
    throw new Error(`${path}: install block shows ${JSON.stringify(shownCommand)}, expected the one-liner`);
  }
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  await page.locator(".site-footer").screenshot({ path: `${artifacts}/footer-${screenshot}` });
  await footerCompare.click();
  await page.waitForLoadState("networkidle");
  if (new URL(page.url()).pathname !== comparisonPath) {
    throw new Error(`${path}: expected ${comparisonPath}, got ${page.url()}`);
  }
  if (consoleErrors.length || failedRequests.length) {
    throw new Error(`${path}: console errors=${JSON.stringify(consoleErrors)} failed requests=${JSON.stringify(failedRequests)}`);
  }
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.close();
}

// Issue #259: the hero used to push the primary CTA to 630px — under every
// competitor's first screen — and the trust line out of a phone's fold
// (874px at 390×844). The copy fix is pinned byte-exactly in
// tests/hero-above-fold.test.js; this measurement is the acceptance itself:
// geometry, not strings.
async function assertHeroAboveFold(browser, path, size, screenshot) {
  const page = await browser.newPage({ viewport: size });
  await page.goto(`${targetURL}${path}`, { waitUntil: "load" });
  const ctaTop = await page.locator('.hero [data-cta="cloud-start"]')
    .evaluate((el) => el.getBoundingClientRect().top);
  const view = `${path} ${size.width}x${size.height}`;
  if (size.width >= 1000 && ctaTop >= 450) {
    throw new Error(`${view}: primary CTA top is ${ctaTop}, must stay < 450`);
  }
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  await page.close();
}

// Issue #267: at the ≤980px breakpoint the hero collapses to one column and
// came apart on the Z Fold 8's unfolded viewport: the hero receipt
// right-shifted off the copy's left edge (the 980px rule's
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
  await page.goto(`${targetURL}${path}`, { waitUntil: "load" });
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
      figure: rect(".hero figure.hero-receipt"),
      ctas: [rect('.hero [data-cta="cloud-start"]')],
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
  await page.goto(`${targetURL}${path}`, { waitUntil: "load" });
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
  const midwayCta = page.locator('[data-cta="midway-cloud"]');
  const heroCta = page.locator('[data-cta="cloud-start"]');
  const midwayText = (await midwayCta.textContent()).trim();
  const heroText = (await heroCta.textContent()).trim();
  if (midwayText !== heroText) {
    throw new Error(`${view}: midway CTA text is ${JSON.stringify(midwayText)}, expected hero text ${JSON.stringify(heroText)}`);
  }
  const midwayHref = await midwayCta.getAttribute("href");
  const expectedHref = path.startsWith("/zh/") ? "/zh/cloud/login" : "/cloud/login";
  if (midwayHref !== expectedHref) {
    throw new Error(`${view}: midway CTA href is ${midwayHref}, expected ${expectedHref}`);
  }
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  await page.close();
}

// Issue #262 / #318: the homepage autoplay proof is replaced by its static
// poster under reduced motion. The Cloud walkthrough keeps its video and
// controls visible (Issue #578): with autoplay gone it never moves on its
// own — playback starts only on the visitor's click — so there is no motion
// to reduce, and the poster background stand-in is gone with the hide rule.
// Emulated here because no string check exercises the media query.
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
      visible: video.offsetParent !== null,
      background: getComputedStyle(figure).backgroundImage,
    };
  });
  if (path.includes("/cloud/")) {
    if (state.display === "none" || !state.visible) {
      throw new Error(`${path}: reduced motion must keep the Cloud video visible, got display=${state.display} visible=${state.visible}`);
    }
    if (state.background !== "none") {
      throw new Error(`${path}: reduced motion must not give the Cloud demo a poster background stand-in, got background=${state.background}`);
    }
  } else {
    if (state.display !== "none") {
      throw new Error(`${path}: reduced motion must hide the homepage video, got display=${state.display}`);
    }
    if (!state.background.includes("delivery-loop-poster.jpg")) {
      throw new Error(`${path}: reduced motion must show the delivery-loop poster, got background=${state.background}`);
    }
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
    h1: "Orbi Cloud: file an Issue, get a release",
    loop: "GitHub Issue in, tagged release out",
    // Issue #156: the zero-warning handoff — the microcopy under the hero CTA.
    ctaMicrocopy: "Next step happens on GitHub: sign in and choose which repositories Orbi can access. You can authorize a single repository, and change it any time on GitHub.",
    metaNeedle: ["US$29", "US$79"],
    text: [
      "exact-head merge",
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
      // that is 1.2B, the same quota the Founder plan carries); the
      // over-limit behavior is the pause, not a $0.10 overage price
      "US$29", "US$290", "US$79", "US$790", "1.2B tokens", "deliveries pause", "50% off forever",
      // Issue #744: the short measured ranges sit in their paid cards; the
      // detailed measurement remains on /cost/.
      "Fixed monthly price. No overage bills.",
      "≈ 80–210 merged deliveries / month", "≈ 240–630 merged deliveries / month",
      "How we measured →", "prompt caching",
    ],
    guideHref: "/guides/ci-gates/",
  },
  "/zh/cloud/": {
    zh: "/cloud/",
    title: "提个 Issue，收个版本",
    h1: "Orbi Cloud：提个 Issue，收个版本",
    loop: "GitHub Issue 进，打好 Tag 的 Release 出",
    // Issue #156: the zero-warning handoff — the microcopy under the hero CTA.
    ctaMicrocopy: "下一步在 GitHub 上完成：登录并选择 Orbi 可以访问的仓库。可以只授权一个仓库，随时在 GitHub 上修改。",
    metaNeedle: ["US$29", "US$79"],
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
      // the same label, 1.2B since #663)
      "US$29", "US$290", "US$79", "US$790", "1.2B token", "交付暂停", "永久 5 折",
      // Issue #744: the short measured ranges sit in their paid cards.
      "固定月费，不会超额扣费。",
      "每月约 80–210 次合并交付", "每月约 240–630 次合并交付",
      "怎么测的 →", "prompt caching",
    ],
    guideHref: "/zh/guides/ci-gates/",
  },
};

async function assertCloudPage(browser, path, size, screenshot) {
  const claim = cloudPages[path];
  const page = await browser.newPage({ viewport: size });
  const consoleErrors = [];
  const failedRequests = [];
  const isTelemetry = (url) => url.includes("cloudflareinsights.com");
  await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
  if (!process.env.BASE_URL) {
    await page.route("**/stats", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ repos: {} }),
    }));
  }
  page.on("console", (message) => {
    if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) consoleErrors.push(`${message.location().url}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    // Chromium abandons a media request when it reopens it for playback.
    // Every other media/network failure remains fatal.
    const abortedMedia = request.failure()?.errorText === "net::ERR_ABORTED"
      && request.url().includes("/video/");
    if (!isTelemetry(request.url()) && !abortedMedia) failedRequests.push(`${request.method()} ${request.url()}`);
  });

  // DOM load is the bounded navigation gate. The walkthrough is
  // user-initiated (Issue #578): the smoke presses play further down and
  // asserts playback with sound, the strongest local signal the asset loads.
  await page.goto(`${targetURL}${path}`, { waitUntil: "load" });
  const demo = page.locator(".cloud-demo");
  const video = demo.locator(".proof-loop-video");
  if ((await demo.count()) !== 1 || (await video.count()) !== 1) {
    throw new Error(`${path}: expected exactly one Cloud walkthrough video`);
  }
  for (const attribute of ["playsinline", "controls"]) {
    if ((await video.getAttribute(attribute)) === null) {
      throw new Error(`${path}: Cloud walkthrough is missing ${attribute}`);
    }
  }
  // Issue #578: the walkthrough carries narration — the visitor presses
  // play and hears it. The element must move on the visitor's action only.
  const ctaBottom = await page.locator(".hero-cta").evaluate((element) => element.getBoundingClientRect().bottom);
  const demoTop = await demo.evaluate((element) => element.getBoundingClientRect().top);
  if (demoTop < ctaBottom) throw new Error(`${path}: Cloud walkthrough must follow the hero CTA`);
  await demo.scrollIntoViewIfNeeded();
  // The shot pins the visitor's first sight: poster frame plus native
  // controls, nothing moving, nothing fetched yet (preload=none).
  await demo.screenshot({ path: `${artifacts}/${screenshot.replace(/\.png$/, "-video.png")}` });
  const initialState = await video.evaluate((element) => ({ paused: element.paused, muted: element.muted, readyState: element.readyState }));
  if (!initialState.paused || initialState.muted) {
    throw new Error(`${path}: Cloud walkthrough must start paused and unmuted, got ${JSON.stringify(initialState)}`);
  }
  // The visitor's real path on the native controls, keyboard edition (probe
  // 2026-09-27: a position-click on the play button does not register in
  // headless Chromium, but Space on the focused element — the same native
  // controls — starts playback as a trusted user gesture). Playback with
  // sound is the strongest local signal the asset loads and the no-mute
  // contract holds; a visible browser stays the maintainer gate.
  await video.focus();
  await page.keyboard.press("Space");
  try {
    await page.waitForFunction(() => {
      const element = document.querySelector(".cloud-demo .proof-loop-video");
      return element && !element.paused && element.currentTime > 0;
    }, null, { timeout: 10000 });
  } catch {
    const state = await video.evaluate((element) => ({
      paused: element.paused,
      muted: element.muted,
      readyState: element.readyState,
      networkState: element.networkState,
      currentTime: element.currentTime,
      error: element.error && element.error.code,
    }));
    throw new Error(`${path}: Cloud walkthrough does not play after the visitor presses play: ${JSON.stringify(state)}`);
  }
  const playState = await video.evaluate((element) => ({ paused: element.paused, muted: element.muted }));
  if (playState.paused || playState.muted) {
    throw new Error(`${path}: Cloud walkthrough must play with sound after the visitor presses play, got ${JSON.stringify(playState)}`);
  }

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
  // Issue #413 gives search descriptions a strict language-specific length.
  // The independently authored social descriptions keep the price claim.
  const socialDescriptions = await Promise.all([
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ].map((selector) => page.locator(selector).getAttribute("content")));
  for (const needle of claim.metaNeedle) {
    for (const content of socialDescriptions) {
      if (!content.includes(needle)) {
        throw new Error(`${path}: social description ${JSON.stringify(content)} is missing ${JSON.stringify(needle)}`);
      }
    }
  }
  // The stop-at-the-PR claim is gone — from the title, the h1, the loop
  // heading, and the body.
  const text = (await page.locator("main").textContent()).replace(/\s+/g, " ");
  for (const needle of [claim.loop, ...claim.text]) {
    if (!text.includes(needle)) {
      throw new Error(`${path}: missing the required claim ${JSON.stringify(needle)}`);
    }
  }
  // Issue #275: the onboarding must end with a concrete execution switch,
  // not merely "the first Issue can start". Assert the rendered four-step
  // path at both desktop and phone widths; the overflow check below catches
  // a layout that squeezes or clips the instruction.
  const stepList = page.locator(".proof-ledger-four");
  const steps = stepList.locator(":scope > li");
  if (await steps.count() !== 4) throw new Error(`${path}: expected four onboarding steps`);
  const stepText = (await steps.allTextContents()).join(" ").replace(/\s+/g, " ");
  for (const needle of path === "/cloud/"
    ? ["Label one Issue ai-ready", "<repo>/issues/new?labels=ai-ready", "within 5 minutes", "comments on the Issue"]
    : ["给一个 Issue 加上 ai-ready 标签", "<repo>/issues/new?labels=ai-ready", "5 分钟内认领", "Issue 下留言"]) {
    if (!stepText.includes(needle)) throw new Error(`${path}: onboarding step is missing ${JSON.stringify(needle)}`);
  }
  const stepBoxes = await steps.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top, left: box.left, right: box.right, width: box.width };
  }));
  if (size.width > 760) {
    if (Math.max(...stepBoxes.map(({ top }) => top)) - Math.min(...stepBoxes.map(({ top }) => top)) > 1) {
      throw new Error(`${path}: four desktop onboarding steps do not fit on one row`);
    }
  } else if (!stepBoxes.every((box, index) => index === 0 || box.top > stepBoxes[index - 1].top)) {
    throw new Error(`${path}: mobile onboarding steps are not stacked in order`);
  }
  if (stepBoxes.some(({ left, right, width }) => width <= 0 || left < 0 || right > size.width + 1)) {
    throw new Error(`${path}: onboarding steps are clipped at ${size.width}px`);
  }
  await stepList.screenshot({ path: `${artifacts}/${screenshot.replace(/\.png$/, "-steps.png")}` });
  if ((await page.getByText("US$79").count()) < 1) throw new Error(`${path}: the regular US$79 price is not on the page`);
  // Issue #108 + #451: the JSON-LD aggregate publishes both paid plans,
  // with the coupon in its description — never a single-plan or retired price.
  const offers = (await Promise.all(
    (await page.locator('script[type="application/ld+json"]').allTextContents()).map((s) => JSON.parse(s))
  )).flatMap((data) => data["@graph"] ?? [data]).filter((node) => node["@type"] === "AggregateOffer");
  if (offers.length !== 1
    || JSON.stringify(offers[0].offers?.map(({ price }) => price)) !== JSON.stringify(["29", "79"])
    || !String(offers[0].description).includes(path.startsWith("/zh") ? "永久 5 折" : "50% off forever")) {
    throw new Error(`${path}: JSON-LD AggregateOffer must price Solo and Pro with the founding partner terms, got ${JSON.stringify(offers)}`);
  }
  // Issue #107: the login buttons' contract is the click's landing
  // (assertCtaLandsAtEndpoint); here the buttons must exist and be visible.
  const loginButtons = page.locator("a.button-signal");
  if ((await loginButtons.count()) < 1) throw new Error(`${path}: no Cloud CTA on the page`);
  for (let i = 0; i < (await loginButtons.count()); i += 1) {
    if (!(await loginButtons.nth(i).isVisible())) throw new Error(`${path}: Cloud CTA is not visible`);
  }
  // Issue #741: the Cloud hero has one action and one concise reassurance,
  // matching the homepage's first-screen conversion path.
  const hero = page.locator(".compare-hero");
  const expectedHero = path === "/cloud/"
    ? {
      lede: "Orbi runs your Issues all the way to a release, on infrastructure we operate.",
      button: `Try ${pricing.freeDeliveries} deliveries free →`,
      note: "No card · Only the repos you pick",
      href: "/cloud/login",
    }
    : {
      lede: "Orbi 在我们运营的机器上，把你的 Issue 一路做到发版。",
      button: `免费试 ${pricing.freeDeliveries} 次 →`,
      note: "不用绑卡 · 只授权你选的仓库",
      href: "/zh/cloud/login",
    };
  const heroSequence = await hero.locator(":scope > *").evaluateAll((elements) =>
    elements.map((element) => ({ tag: element.tagName, text: element.textContent.trim() })));
  const expectedSequence = [
    { tag: "H1", text: claim.h1 },
    { tag: "P", text: expectedHero.lede },
    { tag: "A", text: expectedHero.button },
    { tag: "P", text: expectedHero.note },
  ];
  if (JSON.stringify(heroSequence) !== JSON.stringify(expectedSequence)) {
    throw new Error(`${path}: hero must contain only h1, lede, one CTA, and reassurance in order; got ${JSON.stringify(heroSequence)}`);
  }
  const heroButton = hero.locator("a.hero-cta");
  if (await heroButton.count() !== 1
    || await heroButton.getAttribute("href") !== expectedHero.href
    || await heroButton.getAttribute("data-cta") !== "cloud-hero") {
    throw new Error(`${path}: Cloud hero CTA contract is incorrect`);
  }
  for (const forbidden of ["k8e", "cloud-docs", "Run Orbi yourself", "自己运行 Orbi", "How an Issue becomes a tagged release", "Issue 如何变成打了 tag 的 Release"]) {
    if (await hero.getByText(forbidden, { exact: false }).count()) {
      throw new Error(`${path}: forbidden first-screen copy remains: ${forbidden}`);
    }
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
// Issue #118: the older delivery dataset is a snapshot as of a stated date
// (the sample moves as worktrees are cleaned up), so its section retains the
// date, n=46, and re-derivation recipe. Issue #512 adds the dated n=20 merged-PR
// sample; the smoke reads the hero n each rendered page shows and asserts the
// two languages agree.
const costPages = {
  "/cost/": {
    zh: "/zh/cost/",
    h1: "What an AI coding agent costs per merged pull request",
    text: [
      // merged-PR measurement date, sample size, and median costs
      "measured 2026-09-24", "n=20", "$0.125", "$0.249", "10,612,802",
      // older per-delivery snapshot remains available
      "2026-09-12", "n=46",
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
    h1: "AI 编程 agent 每合并一个 PR 花多少钱",
    text: [
      "截至 2026-09-24 实测", "n=20", "$0.125", "$0.249", "10,612,802",
      "2026-09-12", "n=46",
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
  const isTelemetry = (url) => url.includes("cloudflareinsights.com");
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
  // /cost/ is no longer a current nav entry. The footer language switch leads
  // to the counterpart cost page (Issue #711).
  const pricingHref = path.startsWith("/zh") ? "/zh/cloud/#pricing" : "/cloud/#pricing";
  const navPricing = page.locator(`[data-primary-nav] a[href="${pricingHref}"]`);
  if ((await navPricing.count()) !== 1) {
    throw new Error(`${path}: nav lost the Pricing link to ${pricingHref}`);
  }
  if ((await navPricing.getAttribute("aria-current")) === "page") {
    throw new Error(`${path}: Pricing must not be aria-current on the cost page`);
  }
  const languageSwitch = page.locator(".site-footer .language a");
  if ((await languageSwitch.getAttribute("href")) !== claim.zh) {
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
  const isTelemetry = (url) => url.includes("cloudflareinsights.com");
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
  // Issue #711 moved the comparison entry and language switch to the footer.
  if ((await page.locator(`.site-footer a[href="${path}"]`).count()) < 1) {
    throw new Error(`${path}: footer lost its comparison entry`);
  }
  const languageSwitch = page.locator(".site-footer .language a");
  if ((await languageSwitch.getAttribute("href")) !== claim.zh) {
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

// Issues #308/#322/#745: exercise an actual homepage journey at each
// acceptance viewport, then verify its language-specific login handoff
// without following the interactive GitHub OAuth page.
export async function assertHomeCloudFlow(
  browser,
  path,
  size,
  screenshot,
  selector = "[data-primary-nav] .nav-apply",
  { flowTargetURL = targetURL, requestGet } = {},
) {
  const context = await browser.newContext({ viewport: size });
  try {
    const page = await context.newPage();
    await page.goto(`${flowTargetURL}${path}`, { waitUntil: "load" });
    const entry = page.locator(selector);
    if (!(await entry.isVisible()) && selector.includes("data-primary-nav")) {
      await page.locator("[data-menu-toggle]").click();
    }
    const cloudPath = path.startsWith("/zh/") ? "/zh/cloud/" : "/cloud/";
    const loginPath = path.startsWith("/zh/") ? "/zh/cloud/login" : "/cloud/login";
    if (selector === '[data-cta="cloud-start"]' || selector === '[data-cta="midway-cloud"]') {
      const href = await entry.getAttribute("href");
      if (href !== loginPath) {
        throw new Error(`${path}: ${selector} href is ${JSON.stringify(href)}, expected ${loginPath}`);
      }
      const landing = expectedCtaLanding(resolveCloudLoginExpect(process.env.CLOUD_LOGIN_EXPECT));
      const target = new URL(href, `${flowTargetURL}${path}`).toString();
      const response = await (requestGet ? requestGet(target) : context.request.get(target));
      if (!landing.matches(new URL(response.url())) || !landing.statusOk(response.status())) {
        throw new Error(
          `${path}: ${selector} landed at ${response.url()} with ${response.status()}, expected ${landing.describe}`
        );
      }
      await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
      return;
    }
    if (selector !== "[data-primary-nav] .nav-apply") {
      await entry.click();
      const landedPath = new URL(page.url()).pathname;
      if (landedPath !== cloudPath) {
        throw new Error(`${path}: ${selector} landed at ${page.url()}, expected ${cloudPath}`);
      }
      const cta = page.locator("a.button-signal").first();
      const href = await cta.getAttribute("href");
      if (href !== loginPath) {
        throw new Error(`${cloudPath}: page CTA does not use ${loginPath}`);
      }
      const landing = expectedCtaLanding(resolveCloudLoginExpect(process.env.CLOUD_LOGIN_EXPECT));
      const target = new URL(href, page.url()).toString();
      const response = await (requestGet ? requestGet(target) : context.request.get(target));
      if (!landing.matches(new URL(response.url())) || !landing.statusOk(response.status())) {
        throw new Error(`${cloudPath}: page CTA landed at ${response.url()} with ${response.status()}, expected ${landing.describe}`);
      }
      await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
      return;
    }
    const href = await entry.getAttribute("href");
    if (href !== loginPath) {
      throw new Error(`${path}: navigation CTA href is ${JSON.stringify(href)}, expected ${loginPath}`);
    }
    const landing = expectedCtaLanding(resolveCloudLoginExpect(process.env.CLOUD_LOGIN_EXPECT));
    const target = new URL(href, `${flowTargetURL}${path}`).toString();
    const response = await (requestGet ? requestGet(target) : context.request.get(target));
    if (!landing.matches(new URL(response.url())) || !landing.statusOk(response.status())) {
      throw new Error(`${path}: navigation CTA landed at ${response.url()} with ${response.status()}, expected ${landing.describe}`);
    }
    await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  } finally {
    await context.close();
  }
}

// Issue #711: /compare/ uses the same six-link nav and direct login handoff.
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
    const expectedHref = path.startsWith("/zh/") ? "/zh/cloud/login" : "/cloud/login";
    if (href !== expectedHref) {
      throw new Error(`${path}: nav CTA href is ${JSON.stringify(href)}, expected ${JSON.stringify(expectedHref)}`);
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
    licence: ["MIT", "AGPL-3.0", "Sustainable Use"],
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
    licence: ["MIT", "AGPL-3.0", "Sustainable Use"],
    counts: ["66,832", "4,391", "5,867", "2,815", "294", "18", "实测于 2026-09-12"],
  },
};

async function assertOrcaPage(browser, path, size, screenshot) {
  const claim = orcaPages[path];
  const page = await browser.newPage({ viewport: size });
  const consoleErrors = [];
  const failedRequests = [];
  const isTelemetry = (url) => url.includes("cloudflareinsights.com");
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
  // Issue #711 moved the language switch to the footer.
  const languageSwitch = page.locator(".site-footer .language a");
  if ((await languageSwitch.getAttribute("href")) !== claim.zh) {
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
  const isTelemetry = (url) => url.includes("cloudflareinsights.com");
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
  const languageSwitch = page.locator(".site-footer .language a");
  if ((await languageSwitch.getAttribute("href")) !== claim.zh) {
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
    // Do not wait for networkidle on a page with an autoplaying video.
    await page.goto(`${targetURL}${homePath}`, { waitUntil: "load" });
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
  const isTelemetry = (url) => url.includes("cloudflareinsights.com");
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
  const heroText = (await page.locator("section.compare-hero").textContent()).replace(/\s+/g, " ");
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
  // Issue #711: the footer language switch leads to the counterpart page.
  const languageSwitch = page.locator(".site-footer .language a");
  if ((await languageSwitch.getAttribute("href")) !== claim.zh) {
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
    await page.goto(`${targetURL}${path}`, { waitUntil: "load" });
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

async function assertLegalPage(browser, path, expectedHeading, expectedAddress, size, screenshot) {
  const page = await browser.newPage({ viewport: size });
  const errors = [];
  const failures = [];
  await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => failures.push(request.url()));
  try {
    const response = await page.goto(`${targetURL}${path}`, { waitUntil: "networkidle" });
    if (!response || response.status() !== 200) {
      throw new Error(`${path} returned ${response?.status() ?? "no response"}`);
    }
    await page.getByRole("heading", { level: 1, name: expectedHeading, exact: true }).waitFor();
    const mainText = await page.locator("main").textContent();
    if (mainText.includes("__CLOUD_") || mainText.includes("__INCLUDED_")) {
      throw new Error(`${path}: pricing placeholder reached the rendered page`);
    }
    const contact = await page.locator(`main a[href="mailto:${expectedAddress}"]`).count();
    if (contact < 1) throw new Error(`${path}: verified ${expectedAddress} email is missing`);
    const legalHrefs = await page.locator(".site-footer nav:first-of-type a").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href"))
    );
    const prefix = path.startsWith("/zh/") ? "/zh" : "";
    for (const href of [`${prefix}/privacy/`, `${prefix}/terms/`, `${prefix}/support/`]) {
      if (!legalHrefs.includes(href)) throw new Error(`${path}: footer is missing ${href}`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`${path}: horizontal overflow ${overflow}px at ${size.width}px`);
    await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: true });
    if (errors.length || failures.length) {
      throw new Error(`${path}: console errors=${JSON.stringify(errors)} failed requests=${JSON.stringify(failures)}`);
    }
  } finally {
    await page.close();
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
    await assertEngagementEndpoint(targetURL);
    await assertCloudLoginRedirect(targetURL);
    if (!process.env.BASE_URL) {
      await assertSubscriptionFlow(browser, "/evidence/", "Subscribed", "That email address doesn't look right");
      await assertSubscriptionFlow(browser, "/zh/evidence/", "已订阅", "邮箱格式不对");
    }
    await assertPublishedInstallScript(browser);
    await assertInstallCopiesOneLiner(browser, "/");
    await assertHomepage(browser, "/", "/compare/", { width: 1440, height: 900 }, "homepage-en-desktop.png");
    await assertHomepage(browser, "/", "/compare/", { width: 390, height: 844 }, "homepage-en-mobile.png");
    await assertHomepage(browser, "/", "/compare/", { width: 360, height: 844 }, "homepage-en-narrow.png");
    await assertHomepage(browser, "/zh/", "/zh/compare/", { width: 1440, height: 900 }, "homepage-zh-desktop.png");
    await assertHomepage(browser, "/zh/", "/zh/compare/", { width: 390, height: 844 }, "homepage-zh-mobile.png");
    // Issue #711 removes the old nav dropdowns; the shared footer retains
    // their destinations and the language switch.
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
    const homepageCloudCtas = [
      ["cloud-start", '[data-cta="cloud-start"]'],
      ["midway-cloud", '[data-cta="midway-cloud"]'],
    ];
    // Issues #704/#712/#745 send the remaining hero and evidence CTAs
    // directly to the language-matching login handoff.
    for (const [label, selector] of homepageCloudCtas) {
      await assertHomeCloudFlow(browser, "/", { width: 1440, height: 900 }, `cloud-${label}-en.png`, selector);
      await assertHomeCloudFlow(browser, "/zh/", { width: 1440, height: 900 }, `cloud-${label}-zh.png`, selector);
    }
    await assertHomeCloudFlow(browser, "/", { width: 1440, height: 900 }, "cloud-nav-en-desktop.png");
    await assertHomeCloudFlow(browser, "/", { width: 390, height: 844 }, "cloud-nav-en-mobile.png");
    await assertHomeCloudFlow(browser, "/zh/", { width: 1440, height: 900 }, "cloud-nav-zh-desktop.png");
    await assertHomeCloudFlow(browser, "/zh/", { width: 390, height: 844 }, "cloud-nav-zh-mobile.png");
    // Issue #97: both Cloud pages, both languages, phone and desktop widths.
    await assertCloudPage(browser, "/cloud/", { width: 1440, height: 900 }, "cloud-en-desktop.png");
    await assertCloudPage(browser, "/cloud/", { width: 390, height: 844 }, "cloud-en-mobile.png");
    await assertCloudPage(browser, "/zh/cloud/", { width: 1440, height: 900 }, "cloud-zh-desktop.png");
    await assertCloudPage(browser, "/zh/cloud/", { width: 390, height: 844 }, "cloud-zh-mobile.png");
    await assertProofLoopReducedMotion(browser, "/cloud/");
    await assertProofLoopReducedMotion(browser, "/zh/cloud/");
    // Issues #107/#742: both pricing cards' trial buttons land at the same
    // language-matching login contract.
    await assertCtaLandsAtEndpoint(browser, "/cloud/", [
      ["Solo trial", 'a[data-cta="pricing-solo-trial"][href="/cloud/login"]'],
      ["Pro trial", 'a[data-cta="pricing-pro-trial"][href="/cloud/login"]'],
    ]);
    await assertCtaLandsAtEndpoint(browser, "/zh/cloud/", [
      ["Solo trial", 'a[data-cta="pricing-solo-trial"][href="/zh/cloud/login"]'],
      ["Pro trial", 'a[data-cta="pricing-pro-trial"][href="/zh/cloud/login"]'],
    ]);
    // Issue #287: all policy/support URLs render at the acceptance widths in
    // both languages, without browser errors or horizontal overflow.
    const legalPages = [
      ["/privacy/", "Privacy policy", "privacy@orbi.build", "privacy-en"],
      ["/terms/", "Terms of service", "support@orbi.build", "terms-en"],
      ["/support/", "Support that starts with a useful report", "support@orbi.build", "support-en"],
      ["/zh/privacy/", "隐私政策", "privacy@orbi.build", "privacy-zh"],
      ["/zh/terms/", "服务条款", "support@orbi.build", "terms-zh"],
      ["/zh/support/", "从有用的报告开始支持", "support@orbi.build", "support-zh"],
    ];
    for (const [path, heading, address, name] of legalPages) {
      await assertLegalPage(browser, path, heading, address, { width: 1440, height: 900 }, `${name}-desktop.png`);
      await assertLegalPage(browser, path, heading, address, { width: 390, height: 844 }, `${name}-mobile.png`);
    }
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
    await assertCompareNavCta(browser, "/compare/", "Start free");
    await assertCompareNavCta(browser, "/zh/compare/", "免费开始");
    // assertCompareNavCta checks the language-specific direct-login href;
    // assertHomeCloudFlow above verifies the same nav handoff lands correctly.
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
    // Issue #169: evidence page, both languages, phone and desktop.
    await assertEvidencePage(browser, "/evidence/", { width: 1440, height: 900 }, "evidence-en-desktop.png");
    await assertEvidencePage(browser, "/evidence/", { width: 390, height: 844 }, "evidence-en-mobile.png");
    await assertEvidencePage(browser, "/zh/evidence/", { width: 1440, height: 900 }, "evidence-zh-desktop.png");
    await assertEvidencePage(browser, "/zh/evidence/", { width: 390, height: 844 }, "evidence-zh-mobile.png");
    const assetContext = await browser.newContext();
    try {
      const legalPaths = ["/privacy/", "/terms/", "/support/", "/zh/privacy/", "/zh/terms/", "/zh/support/"];
      for (const path of [...deepDives.map(([, href]) => href), "/zh/compare/orca/", "/cloud/", "/zh/cloud/", "/zh/compare/", "/cost/", "/zh/cost/", "/guides/ci-gates/", "/zh/guides/ci-gates/", "/evidence/", "/zh/evidence/", ...legalPaths]) {
        const response = await assetContext.request.get(`${targetURL}${path}`);
        if (response.status() !== 200) throw new Error(`${path} returned ${response.status()}`);
      }
      const sitemap = await (await assetContext.request.get(`${targetURL}/sitemap.xml`)).text();
      for (const href of [...deepDives.map(([, href]) => href), "/cloud/", "/zh/cloud/", "/cost/", "/zh/cost/", "/guides/ci-gates/", "/zh/guides/ci-gates/", "/evidence/", "/zh/evidence/", ...legalPaths]) {
        if (!sitemap.includes(`https://orbi.build${href}"`)) throw new Error(`sitemap.xml is missing https://orbi.build${href}`);
      }
    } finally {
      await assetContext.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    const failures = [];
    // Issue #585: pages must not request Google Fonts at all, so it is no
    // longer allowed for here — a request would surface as a failure.
    const isTelemetry = (url) => url.includes("cloudflareinsights.com");
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
    // Issue #519: the switch link's accessible name comes from aria-label.
    const languageSwitch = page.locator('.site-footer a[aria-label="简体中文"]');
    if ((await languageSwitch.count()) !== 1 || (await languageSwitch.getAttribute("href")) !== "/zh/compare/cursor/") {
      throw new Error("detail language switch is wrong");
    }
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
