import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
const targetURL = process.env.BASE_URL || baseURL;
const artifacts = ".orbi";

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
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
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
    await assertHomepage(browser, "/", "/compare/", { width: 1440, height: 900 }, "homepage-en-desktop.png");
    await assertHomepage(browser, "/", "/compare/", { width: 390, height: 844 }, "homepage-en-mobile.png");
    await assertHomepage(browser, "/zh/", "/zh/compare/", { width: 1440, height: 900 }, "homepage-zh-desktop.png");
    await assertHomepage(browser, "/zh/", "/zh/compare/", { width: 390, height: 844 }, "homepage-zh-mobile.png");
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
    await page.getByRole("link", { name: "Read the OpenClaw deep dive", exact: true }).click();
    await page.waitForLoadState("networkidle");
    if (new URL(page.url()).pathname !== "/compare/openclaw/") throw new Error(`detail route: ${page.url()}`);
    if ((await page.getByRole("link", { name: "中文", exact: true }).getAttribute("href")) !== "/zh/compare/openclaw/") throw new Error("detail language switch is wrong");
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
