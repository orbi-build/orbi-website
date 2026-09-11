import { chromium, request } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
const targetURL = process.env.BASE_URL || baseURL;
const artifacts = ".orbi";

// The homepage's one-line install command. Its host is the canonical
// orbi.build: a visitor on any environment must be told to fetch the script
// from production, never from a preview host. install.sh itself carries no
// environment-specific values, so the same line is correct on beta.
const installCommand = "curl -fsSL https://orbi.build/install.sh | bash";

// Same order as the /compare/ grid; anchor text matches each page's own title.
const deepDives = [
  ["Orbi vs OpenClaw", "/compare/openclaw/"],
  ["Orbi vs GitHub Copilot coding agent", "/compare/github-copilot-coding-agent/"],
  ["Orbi vs Claude Managed Agents", "/compare/managed-agents/"],
  ["Orbi vs OpenHands", "/compare/openhands/"],
  ["Orbi vs Hermes Agent", "/compare/hermes-agent/"],
  ["Orbi vs OpenAI Codex", "/compare/codex/"],
  ["Orbi vs Devin", "/compare/devin/"],
];

// Issue #91: the hero claims delivery to a tagged release, and the lede
// names the three segments no competitor covers — independent review that
// repairs and reruns, the exact-head merge, the tag + Release.
const releaseClaims = {
  "/": {
    h1: "Turn GitHub Issues into tagged releases",
    lede: [
      "independent review that repairs code and reruns the suite",
      "merges the exact reviewed head",
      "publishes the result as a tagged Release",
    ],
    title: "tagged releases",
  },
  "/zh/": {
    h1: "让 GitHub Issue 变成打 Tag 的发布",
    lede: [
      "能改代码、会重跑测试的独立审查",
      "只合并审过的那个 Head",
      "冻结 SHA、打 Tag、发正式 Release",
    ],
    title: "打 Tag 的 Release",
  },
};

function startServer() {
  return spawn("python3", ["-m", "http.server", String(port)], {
    cwd: "public",
    stdio: ["ignore", "ignore", "pipe"],
  });
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 1000);
    timer.unref();
    server.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    server.kill();
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
// Worker's stamped 503 and the served pages send the Cloud CTA to /apply.
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
    const response = await context.get(`${targetURL}/cloud/login`, { maxRedirects: 0 });
    const headers = response.headers();
    if (expectation === "oauth-302") {
      // beta: the website's handoff must 302 to the configured Cloud login
      // URL, and that URL must answer with the GitHub OAuth redirect. One
      // manual hop each: the responses themselves are the contract, not
      // where a browser would finally land.
      if (response.status() !== 302) {
        throw new Error(`Cloud login expected 302, got ${response.status()}`);
      }
      const handoff = new URL(headers.location || "", targetURL).toString();
      const cloud = await context.get(handoff, { maxRedirects: 0 });
      const cloudLocation = cloud.headers().location || "";
      if (cloud.status() !== 302
          || !cloudLocation.startsWith("https://github.com/login/oauth/authorize?")) {
        throw new Error(
          `Cloud login did not redirect to GitHub OAuth: ${cloud.status()} ${cloudLocation}`
        );
      }
    } else if (expectation === "fail-closed-503") {
      // production (Issue #77): no CLOUD_LOGIN_URL, so the site Worker
      // fail-closes the login route with its stamped 503.
      if (response.status() !== 503) {
        throw new Error(`Cloud login expected the fail-closed 503, got ${response.status()}`);
      }
      const stamped =
        headers["x-content-type-options"] === "nosniff" &&
        headers["x-frame-options"] === "DENY" &&
        headers["referrer-policy"] === "strict-origin-when-cross-origin";
      if (!stamped) {
        throw new Error(
          `Cloud login 503 carries not the site Worker's security-header stamp, so it is not the site's fail-closed answer: ${JSON.stringify(headers)}`
        );
      }
    } else {
      // fail-closed-404: the strict default for an environment that declared
      // no contract. The site Worker's own 404 carries its security-header
      // stamp, which the Cloud control plane's responses do not.
      if (response.status() !== 404) {
        throw new Error(`Cloud login expected fail-closed 404, got ${response.status()}`);
      }
      const stamped =
        headers["x-content-type-options"] === "nosniff" &&
        headers["x-frame-options"] === "DENY" &&
        headers["referrer-policy"] === "strict-origin-when-cross-origin";
      if (!stamped) {
        throw new Error(
          `Cloud login 404 carries not the site Worker's security-header stamp, so it is not the site's fail-closed answer: ${JSON.stringify(headers)}`
        );
      }
    }
  } finally {
    await context.dispose();
  }
}

// Issue #107: a Cloud CTA's contract is where its click lands — the endpoint
// CLOUD_LOGIN_EXPECT declares (Issue #74) — never the href literal. The
// shipped href="/cloud/login" is rewritten to /apply by the site Worker
// where CLOUD_LOGIN_URL is unset (Issue #77), so deriving the expected href
// from CLOUD_LOGIN_EXPECT copied that rewrite into the test and broke on
// implementation changes while the site was fine. What each expectation
// declares is the landing:
//   oauth-302        → the GitHub OAuth authorize page (beta; the handoff
//                      chain is pinned by assertCloudLoginRedirect)
//   fail-closed-503  → the /apply application page (production, Issue #77)
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
      describe: "the /apply application page",
      statusOk: (status) => status < 400,
      matches: (url) => url.pathname === "/apply",
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

async function assertHomepage(browser, path, comparisonPath, size, screenshot) {
  const page = await browser.newPage({ viewport: size });
  const consoleErrors = [];
  const failedRequests = [];
  let statsRequested = false;
  const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st");
  await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
  if (!process.env.BASE_URL) {
    await page.route("**/stats", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ started: "2025-01-01T00:00:00Z", issues_closed: 1, prs_merged: 1, releases: 1, stars: 2, star_history: [{ stars: 1 }, { stars: 2 }] }),
    }));
  }
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/stats") statsRequested = true;
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) consoleErrors.push(`${message.location().url}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    if (!isTelemetry(request.url())) failedRequests.push(`${request.method()} ${request.url()}`);
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
  const stats = page.locator("[data-stat]");
  await stats.last().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("[data-stat], [data-star-total]"))
    .every((element) => element.textContent.trim() && element.textContent.trim() !== "0"));
  if (!statsRequested) throw new Error(`${path}: /stats was not requested`);
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
const cloudPages = {
  "/cloud/": {
    zh: "/zh/cloud/",
    title: "GitHub Issues in, tagged releases out",
    h1: "Orbi Cloud: GitHub Issues in, tagged releases out",
    loop: "GitHub Issue in, tagged release out",
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
      // Issue #108: the $79 regular price with the 2B-token inclusion
      "US$79", "2 billion tokens", "$0.10 per 1M", "100% off",
      // and the measured cost section with its three limits
      "2026-09-10", "n=46", "2,220,637", "4,667,630", "$0.04–0.11", "92.7%",
      "not a promise to everyone", "order of magnitude", "totalTokens",
      "a significantly larger weekly usage quota", "~10x Pro usage",
    ],
  },
  "/zh/cloud/": {
    zh: "/cloud/",
    title: "GitHub Issue 进，打好 Tag 的 Release 出",
    h1: "Orbi Cloud：GitHub Issue 进，打好 Tag 的 Release 出",
    loop: "GitHub Issue 进，打好 Tag 的 Release 出",
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
      // Issue #108: the $79 regular price with the 2B-token inclusion
      "US$79", "20 亿 token", "$0.10", "100% off",
      // and the measured cost section with its three limits
      "2026-09-10", "n=46", "2,220,637", "4,667,630", "$0.04–0.11", "92.7%",
      "不是对所有人的承诺", "一个数量级", "totalTokens", "~10x Pro usage",
    ],
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
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`${path}: horizontal overflow of ${overflow}px at ${size.width}x${size.height}`);
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  if (consoleErrors.length || failedRequests.length) {
    throw new Error(`${path}: console errors=${JSON.stringify(consoleErrors)} failed requests=${JSON.stringify(failedRequests)}`);
  }
  await page.close();
}

// Issue #90: the cost-transparency pages must carry the measured dataset
// (2026-09-10, n=47), the money math, all three stated limits, and the
// competitor non-disclosure sources with their verification date — in both
// languages, with the numbers identical across the two.
const costPages = {
  "/cost/": {
    zh: "/zh/cost/",
    h1: "What one Issue delivery actually costs",
    text: [
      // measurement date + sample size
      "2026-09-10", "n=47",
      // the full measured distribution
      "2,220,637", "3,961,248", "13,290,932", "16,555,250", "37,627,783", "4,667,630",
      // composition
      "95.9%", "3.4%", "0.7%",
      // DeepSeek list prices and the money math
      "$0.003", "$0.15", "$0.60", "$0.057", "$0.113", "$0.46", "$0.92", "~$5.70", "~$11.30", "$6–11",
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
      "2026-09-10", "n=47",
      "2,220,637", "3,961,248", "13,290,932", "16,555,250", "37,627,783", "4,667,630",
      "95.9%", "3.4%", "0.7%",
      "$0.003", "$0.15", "$0.60", "$0.057", "$0.113", "$0.46", "$0.92", "~$5.70", "~$11.30", "$6–11",
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
  for (const href of claim.hrefs) {
    if ((await page.locator(`a[href="${href}"]`).count()) < 1) {
      throw new Error(`${path}: missing a link to the source ${href}`);
    }
  }
  // The verification date belongs to the source notes specifically, not
  // just anywhere on the page.
  if (!text.includes(claim.verified)) throw new Error(`${path}: sources carry no ${JSON.stringify(claim.verified)} date`);
  // Navigation consistency: the page is its own nav's current entry, and the
  // language switch leads to the counterpart page.
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
  const server = process.env.BASE_URL ? null : startServer();
  let browser;
  try {
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : {}),
      headless: true,
    });
    if (server) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1000);
        server.stderr.once("data", (data) => {
          clearTimeout(timer);
          reject(new Error(data.toString()));
        });
      });
    }
    await assertCloudLoginRedirect(targetURL);
    await assertPublishedInstallScript(browser);
    await assertInstallCopiesOneLiner(browser, "/");
    await assertHomepage(browser, "/", "/compare/", { width: 1440, height: 900 }, "homepage-en-desktop.png");
    await assertHomepage(browser, "/", "/compare/", { width: 390, height: 844 }, "homepage-en-mobile.png");
    await assertHomepage(browser, "/zh/", "/zh/compare/", { width: 1440, height: 900 }, "homepage-zh-desktop.png");
    await assertHomepage(browser, "/zh/", "/zh/compare/", { width: 390, height: 844 }, "homepage-zh-mobile.png");
    // Issue #107: follow a real click from every Cloud CTA — hero, card and
    // nav share one promise — to the endpoint CLOUD_LOGIN_EXPECT declares.
    const homepageCloudCtas = [
      ["cloud-start", '[data-cta="cloud-start"]'],
      ["cloud-start-card", '[data-cta="cloud-start-card"]'],
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
    await assertCostPage(browser, "/cost/", { width: 1440, height: 900 }, "cost-en-desktop.png");
    await assertCostPage(browser, "/cost/", { width: 390, height: 844 }, "cost-en-mobile.png");
    await assertCostPage(browser, "/zh/cost/", { width: 1440, height: 900 }, "cost-zh-desktop.png");
    await assertCostPage(browser, "/zh/cost/", { width: 390, height: 844 }, "cost-zh-mobile.png");
    // Issue #89: both compare indexes, both languages, phone and desktop widths.
    await assertCompareMatrix(browser, "/compare/", { width: 1440, height: 900 }, "compare-en-desktop.png");
    await assertCompareMatrix(browser, "/compare/", { width: 390, height: 844 }, "compare-en-mobile.png");
    await assertCompareMatrix(browser, "/zh/compare/", { width: 1440, height: 900 }, "compare-zh-desktop.png");
    await assertCompareMatrix(browser, "/zh/compare/", { width: 390, height: 844 }, "compare-zh-mobile.png");
    const assetContext = await browser.newContext();
    try {
      for (const path of [...deepDives.map(([, href]) => href), "/cloud/", "/zh/cloud/", "/zh/compare/", "/cost/", "/zh/cost/"]) {
        const response = await assetContext.request.get(`${targetURL}${path}`);
        if (response.status() !== 200) throw new Error(`${path} returned ${response.status()}`);
      }
      const sitemap = await (await assetContext.request.get(`${targetURL}/sitemap.xml`)).text();
      for (const href of [...deepDives.map(([, href]) => href), "/cloud/", "/zh/cloud/", "/cost/", "/zh/cost/"]) {
        if (!sitemap.includes(`https://orbi.build${href}"`)) throw new Error(`sitemap.xml is missing https://orbi.build${href}`);
      }
    } finally {
      await assetContext.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    const failures = [];
    const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st");
    await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
    if (!process.env.BASE_URL) {
      await page.route("**/stats", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ started: "2025-01-01T00:00:00Z", issues_closed: 1, prs_merged: 1, releases: 1, stars: 1, star_history: [] }),
      }));
    }
    page.on("console", (message) => { if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) errors.push(`${message.location().url}: ${message.text()}`); });
    page.on("requestfailed", (request) => { if (!isTelemetry(request.url())) failures.push(request.url()); });
    await page.goto(`${targetURL}/compare/`, { waitUntil: "networkidle" });
    await assertFooterDeepDives(page, "/compare/");
    await page.getByRole("link", { name: "Read the OpenHands deep dive", exact: true }).click();
    await page.waitForLoadState("networkidle");
    if (new URL(page.url()).pathname !== "/compare/openhands/") throw new Error(`detail route: ${page.url()}`);
    await assertFooterDeepDives(page, "/compare/openhands/");
    if ((await page.getByRole("link", { name: "中文", exact: true }).getAttribute("href")) !== "/zh/compare/openhands/") throw new Error("detail language switch is wrong");
    await page.screenshot({ path: `${artifacts}/comparison-detail.png`, fullPage: false });
    if (errors.length || failures.length) throw new Error(`comparison page errors=${JSON.stringify(errors)} failed=${JSON.stringify(failures)}`);
    await page.close();
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await stopServer(server);
    }
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
