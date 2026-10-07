import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";
import { fillHomepageStats } from "../src/worker.js";

// Issue #882: countUp animated every counter from 0, so the totals the Worker
// already wrote into the served HTML (Issue #873) dropped to "0 PRs merged /
// 0 releases" for about a second after load. The local server below serves the
// homepage the way the Worker does — through the real fillHomepageStats(),
// which writes the cached totals on a hit and each element's data-floor on a
// miss (tests/worker.test.js) — and this suite samples the two hero counters
// every 40ms from before demo.js runs until the count-up settles.
const FLOORS = { prs: 600, releases: 80 };
const STATS = {
  repos: {
    orbi: {
      started: "2025-01-01T00:00:00Z",
      issues_closed: 853,
      prs_merged: 615,
      releases: 87,
      stars: 195,
      star_history: [
        { date: "2026-09-01", stars: 180 },
        { date: "2026-10-01", stars: 195 },
      ],
    },
  },
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

let server;
let browser;
let baseUrl;
// The state of the Worker's stats cache when the homepage is served: a hit
// (STATS) writes the live totals, a miss ({ repos: {} }) writes the floors.
let servedStats = STATS;

async function serve(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\/|\\)+/, "");
  if (relative.split("/").includes("..")) return null;
  const directPath = join("public", relative);
  const direct = await readFile(directPath).catch(() => null);
  if (direct !== null) return [directPath, direct];
  const indexPath = join(directPath, "index.html");
  const index = await readFile(indexPath).catch(() => null);
  return index === null ? null : [indexPath, index];
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url, "http://localhost");
    // The page ships an engagement beacon; the Worker answers it with 204.
    if (pathname === "/cloud/e" && request.method === "POST") {
      request.resume();
      response.writeHead(204);
      response.end();
      return;
    }
    const file = await serve(pathname);
    if (!file) {
      response.writeHead(404);
      response.end();
      return;
    }
    const type = contentTypes[extname(file[0])] ?? "application/octet-stream";
    const body = type.startsWith("text/html")
      ? Buffer.from(fillHomepageStats(String(file[1]), servedStats))
      : file[1];
    response.writeHead(200, { "content-type": type });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
  assertNoExternalRequests();
});

// Record the hero counters from the first parsed frame: the init script runs
// before any page script on every navigation, so the samples include the
// served values, every animation frame and the settled result.
async function installCounterSampler(page) {
  await page.addInitScript(() => {
    window.__heroCounterSamples = [];
    const collect = () => {
      const counters = document.querySelectorAll(".hero-proof-bar [data-stat]");
      if (!counters.length) return;
      window.__heroCounterSamples.push(Array.from(counters, (counter) => counter.textContent.trim()));
    };
    collect();
    document.addEventListener("DOMContentLoaded", collect);
    window.setInterval(collect, 40);
  });
}

async function mockStats(page) {
  await page.route("**/stats", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(STATS),
  }));
}

function watchBrowserErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => errors.push(`request failed: ${request.url()}`));
  return errors;
}

describe("hero proof counters never reset to zero (Issue #882)", () => {
  for (const [name, stats] of [
    ["the served HTML carries the live totals", STATS],
    ["the served HTML carries the conservative floors", { repos: {} }],
  ]) {
    it(`keeps every sample at or above data-floor when ${name}`, async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        servedStats = stats;
        const errors = watchBrowserErrors(page);
        await installCounterSampler(page);
        await mockStats(page);
        await page.goto(`${baseUrl}/`, { waitUntil: "load", timeout: 25_000 });
        // The slowest counter runs 1.1s; wait past it so the sampler covers the
        // whole animation before reading the settled numbers.
        await page.waitForTimeout(2000);
        expect(await page.locator(".hero-proof-bar [data-stat]").allTextContents()).toEqual(["615", "87"]);

        const samples = await page.evaluate(() => window.__heroCounterSamples);
        expect(samples.length).toBeGreaterThan(1);
        for (const sample of samples) {
          expect(sample, "both counters are sampled together").toHaveLength(2);
          for (const [index, stat] of ["prs", "releases"].entries()) {
            const value = Number.parseInt(sample[index], 10);
            expect(Number.isFinite(value), `sample ${JSON.stringify(sample)} is not a number`).toBe(true);
            expect(value, `sample ${JSON.stringify(sample)} is below the ${stat} floor`).toBeGreaterThanOrEqual(FLOORS[stat]);
          }
        }
        expect(errors).toEqual([]);
      } finally {
        await page.close();
      }
    }, 30_000);
  }

  it("shows the /stats target directly under prefers-reduced-motion", async () => {
    const page = await guardedPage(browser, baseUrl, { reducedMotion: "reduce" });
    try {
      servedStats = { repos: {} };
      await mockStats(page);
      await page.goto(`${baseUrl}/zh/`, { waitUntil: "load", timeout: 25_000 });
      await expect.poll(
        () => page.locator(".hero-proof-bar [data-stat]").allTextContents(),
        { timeout: 5000 },
      ).toEqual(["615", "87"]);
    } finally {
      await page.close();
    }
  }, 30_000);
});
