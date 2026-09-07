import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
const targetURL = process.env.BASE_URL || baseURL;
const artifacts = ".orbi";

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

async function assertCloudLoginRedirect(browser) {
  if (!process.env.BASE_URL) return;
  const context = await browser.newContext();
  try {
    const response = await context.request.get(`${targetURL}/api/login`, { maxRedirects: 0 });
    if (response.status() !== 302) {
      throw new Error(`Cloud login expected 302, got ${response.status()}`);
    }
    const location = response.headers().location || "";
    if (!location.startsWith("https://github.com/login/oauth/authorize?")) {
      throw new Error(`Cloud login did not redirect to GitHub OAuth: ${location}`);
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
  const stats = page.locator("[data-stat]");
  await stats.last().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("[data-stat], [data-star-total]"))
    .every((element) => element.textContent.trim() && element.textContent.trim() !== "0"));
  if (!statsRequested) throw new Error(`${path}: /stats was not requested`);
  const hero = page.locator(".hero");
  const paths = {
    "cloud-start": "/api/login",
    install: path.startsWith("/zh") ? "https://docs.orbi.build/zh" : "https://docs.orbi.build",
    comparisons: comparisonPath,
  };
  if (await hero.locator(".button-signal").count() !== 1) throw new Error(`${path}: expected one primary CTA`);
  for (const [cta, href] of Object.entries(paths)) {
    const link = hero.locator(`[data-cta="${cta}"]`);
    await link.scrollIntoViewIfNeeded();
    if (!(await link.isVisible())) throw new Error(`${path}: ${cta} CTA is not visible`);
    if ((await link.getAttribute("href")) !== href) throw new Error(`${path}: ${cta} CTA has wrong href`);
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
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  await page.locator(".site-footer").screenshot({ path: `${artifacts}/footer-${screenshot}` });
  await hero.locator('[data-cta="comparisons"]').click();
  await page.waitForLoadState("networkidle");
  if (new URL(page.url()).pathname !== comparisonPath) {
    throw new Error(`${path}: expected ${comparisonPath}, got ${page.url()}`);
  }
  if (consoleErrors.length || failedRequests.length) {
    throw new Error(`${path}: console errors=${JSON.stringify(consoleErrors)} failed requests=${JSON.stringify(failedRequests)}`);
  }
  await page.close();
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
    await assertCloudLoginRedirect(browser);
    await assertHomepage(browser, "/", "/compare/", { width: 1440, height: 900 }, "homepage-en-desktop.png");
    await assertHomepage(browser, "/", "/compare/", { width: 390, height: 844 }, "homepage-en-mobile.png");
    await assertHomepage(browser, "/zh/", "/zh/compare/", { width: 1440, height: 900 }, "homepage-zh-desktop.png");
    await assertHomepage(browser, "/zh/", "/zh/compare/", { width: 390, height: 844 }, "homepage-zh-mobile.png");
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

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
