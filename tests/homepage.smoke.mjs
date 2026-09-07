import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
const artifacts = ".orbi";

function startServer() {
  return spawn("python3", ["-m", "http.server", String(port)], {
    cwd: "public",
    stdio: ["ignore", "ignore", "pipe"],
  });
}

async function assertHomepage(browser, path, label, comparisonPath, size, screenshot) {
  const page = await browser.newPage({ viewport: size });
  const consoleErrors = [];
  const failedRequests = [];
  const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st");
  await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
  await page.route("**/stats", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ started: "2025-01-01T00:00:00Z", issues_closed: 1, prs_merged: 1, releases: 1, stars: 1, star_history: [] }),
  }));
  page.on("console", (message) => {
    if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) consoleErrors.push(`${message.location().url}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    if (!isTelemetry(request.url())) failedRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle" });
  const entry = page.getByRole("link", { name: label, exact: true }).first();
  await entry.scrollIntoViewIfNeeded();
  if (!(await entry.isVisible())) throw new Error(`${path}: comparison entry is not visible`);
  await page.screenshot({ path: `${artifacts}/${screenshot}`, fullPage: false });
  await entry.click();
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
  const server = startServer();
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1000);
      server.stderr.once("data", (data) => {
        clearTimeout(timer);
        reject(new Error(data.toString()));
      });
    });
    await assertHomepage(browser, "/", "Compare Orbi ↗", "/compare/", { width: 1440, height: 900 }, "homepage-en-desktop.png");
    await assertHomepage(browser, "/", "Compare Orbi ↗", "/compare/", { width: 390, height: 844 }, "homepage-en-mobile.png");
    await assertHomepage(browser, "/zh/", "查看竞品对比 ↗", "/zh/compare/", { width: 1440, height: 900 }, "homepage-zh-desktop.png");
    await assertHomepage(browser, "/zh/", "查看竞品对比 ↗", "/zh/compare/", { width: 390, height: 844 }, "homepage-zh-mobile.png");

    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    const failures = [];
    const isTelemetry = (url) => url.includes("cloudflareinsights.com") || url.includes("datafa.st");
    await page.route("**cloudflareinsights.com/**", (route) => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }));
    await page.route("**/stats", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ started: "2025-01-01T00:00:00Z", issues_closed: 1, prs_merged: 1, releases: 1, stars: 1, star_history: [] }),
    }));
    page.on("console", (message) => { if (message.type() === "error" && !isTelemetry(message.location().url) && !isTelemetry(message.text())) errors.push(`${message.location().url}: ${message.text()}`); });
    page.on("requestfailed", (request) => { if (!isTelemetry(request.url())) failures.push(request.url()); });
    await page.goto(`${baseURL}/compare/`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Read the OpenClaw deep dive", exact: true }).click();
    await page.waitForLoadState("networkidle");
    if (new URL(page.url()).pathname !== "/compare/openclaw/") throw new Error(`detail route: ${page.url()}`);
    if ((await page.getByRole("link", { name: "中文", exact: true }).getAttribute("href")) !== "/zh/compare/openclaw/") throw new Error("detail language switch is wrong");
    await page.screenshot({ path: `${artifacts}/comparison-detail.png`, fullPage: false });
    if (errors.length || failures.length) throw new Error(`comparison page errors=${JSON.stringify(errors)} failed=${JSON.stringify(failures)}`);
    await page.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
