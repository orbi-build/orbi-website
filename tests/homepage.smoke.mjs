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
  const stats = page.locator("[data-stat]");
  await stats.last().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("[data-stat], [data-star-total]"))
    .every((element) => element.textContent.trim() && element.textContent.trim() !== "0"));
  if (!statsRequested) throw new Error(`${path}: /stats was not requested`);
  const hero = page.locator(".hero");
  // Issue #79: the homepage Cloud CTA leads with the /cloud/ explainer page,
  // a static asset served identically in every environment — the login
  // handoff now lives only on /cloud/ itself.
  const heroPaths = {
    "cloud-start": "/cloud/",
    install: path.startsWith("/zh") ? "https://docs.orbi.build/zh" : "https://docs.orbi.build",
  };
  if (await hero.locator(".button-signal").count() !== 1) throw new Error(`${path}: expected one primary CTA`);
  // Issue #51: the compare entry belongs to the top navigation; the hero
  // must not carry a competing focus.
  if (await hero.locator('[data-cta="comparisons"]').count() !== 0) {
    throw new Error(`${path}: compare CTA must not live in the hero`);
  }
  for (const [cta, href] of Object.entries(heroPaths)) {
    const link = hero.locator(`[data-cta="${cta}"]`);
    await link.scrollIntoViewIfNeeded();
    if (!(await link.isVisible())) throw new Error(`${path}: ${cta} CTA is not visible`);
    if ((await link.getAttribute("href")) !== href) throw new Error(`${path}: ${cta} CTA has wrong href`);
  }
  const navCompare = page.locator('[data-primary-nav] [data-cta="comparisons"]');
  if ((await navCompare.getAttribute("href")) !== comparisonPath) {
    throw new Error(`${path}: nav comparisons link has wrong href`);
  }
  const footerHrefs = await page.locator(".site-footer a").evaluateAll((nodes) =>
    nodes.map((a) => a.getAttribute("href"))
  );
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
// login buttons keep the environment's declared login contract: the shipped
// /cloud/login handoff everywhere except a fail-closed-503 deployment (no
// CLOUD_LOGIN_URL, Issue #77), where the Worker serves them rewritten to
// /apply.
async function assertCloudPage(browser, size, screenshot) {
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

  await page.goto(`${targetURL}/cloud/`, { waitUntil: "networkidle" });
  const h1Count = await page.locator("h1").count();
  if (h1Count !== 1) throw new Error(`/cloud/: expected exactly one h1, got ${h1Count}`);
  if ((await page.getByText("US$15").count()) < 1) throw new Error("/cloud/: the Founding Pilot price US$15 is not on the page");
  const loginHref = process.env.CLOUD_LOGIN_EXPECT === "fail-closed-503" ? "/apply" : "/cloud/login";
  const loginButton = page.locator(`a.button-signal[href="${loginHref}"]`).first();
  if (!(await loginButton.isVisible())) throw new Error(`/cloud/: no visible Cloud CTA to ${loginHref}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`/cloud/: horizontal overflow of ${overflow}px at ${size.width}x${size.height}`);
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  if (consoleErrors.length || failedRequests.length) {
    throw new Error(`/cloud/: console errors=${JSON.stringify(consoleErrors)} failed requests=${JSON.stringify(failedRequests)}`);
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
    await assertCloudPage(browser, { width: 1440, height: 900 }, "cloud-en-desktop.png");
    await assertCloudPage(browser, { width: 390, height: 844 }, "cloud-en-mobile.png");
    const assetContext = await browser.newContext();
    try {
      for (const path of [...deepDives.map(([, href]) => href), "/zh/compare/"]) {
        const response = await assetContext.request.get(`${targetURL}${path}`);
        if (response.status() !== 200) throw new Error(`${path} returned ${response.status()}`);
      }
      const sitemap = await (await assetContext.request.get(`${targetURL}/sitemap.xml`)).text();
      for (const [, href] of deepDives) {
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
