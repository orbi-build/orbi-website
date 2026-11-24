// Issue #1459: the credits estimator inside the Codex credits article.
//
// tests/credits-calculator.test.js pins the build (the widget's rates come from
// the article's own table, and the no-JavaScript result is computed from them).
// What it cannot prove is the reader's path, so this suite drives the committed
// public/ bytes in Chromium: the default example, the Luna and Fast numbers the
// article quotes, the hint a negative or empty field shows instead of NaN, and
// the panel's fit on a phone.

import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const EN_PAGE = "/blog/codex-usage-limits/";
const ZH_PAGE = "/zh/blog/codex-usage-limits/";
const WIDGET = "[data-credits-calculator]";

let browser;
let server;
let origin;

async function serve(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\/|\\)+/, "");
  if (relative.split("/").includes("..")) return null;
  const direct = join("public", relative || "index.html");
  const directFile = await readFile(direct).catch(() => null);
  if (directFile !== null) return [direct, directFile];
  const index = join(direct, "index.html");
  const indexFile = await readFile(index).catch(() => null);
  return indexFile === null ? null : [index, indexFile];
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = await serve(pathname);
    if (!file) { response.writeHead(404); response.end("not found"); return; }
    response.writeHead(200, { "content-type": types[extname(file[0])] ?? "application/octet-stream" });
    response.end(file[1]);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
  assertNoExternalRequests();
});

// A page with any console error or uncaught exception kept for the assertion.
async function openPage(route, width = 1440) {
  const page = await guardedPage(browser, origin, { viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
  });
  await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
  return { page, errors };
}

const text = (page, selector) => page.locator(selector).first().textContent();
const cost = (page) => text(page, "[data-credits-cost]");
const tasks = (page) => text(page, "[data-credits-tasks]");

describe("credits estimator (Issue #1459)", () => {
  it("opens on the article's example: about 5.4 credits, about 186 tasks", async () => {
    for (const route of [EN_PAGE, ZH_PAGE]) {
      const { page, errors } = await openPage(route);
      try {
        await page.locator(WIDGET).waitFor({ state: "visible" });
        expect(await page.locator(`${WIDGET} [data-credits-model]`).inputValue()).toBe("GPT-6.1 Sol");
        expect(await cost(page)).toBe("5.4");
        expect(await tasks(page)).toBe("186");
        expect(await page.locator("[data-credits-result]").isVisible()).toBe(true);
        expect(await page.locator("[data-credits-error]").isVisible()).toBe(false);
        expect(errors).toEqual([]);
      } finally {
        await page.close();
      }
    }
  }, 60_000);

  it("names the model) and the fields in the page's language", async () => {
    const en = await openPage(EN_PAGE);
    try {
      expect(await text(en.page, ".credits-calculator-title")).toBe("Estimate what a task costs in credits");
      expect(await text(en.page, ".credits-calculator-field span >> nth=0")).toBe("Model");
      expect(await text(en.page, ".credits-calculator-fast span")).toBe("Fast (credits double)");
    } finally {
      await en.page.close();
    }
    const zh = await openPage(ZH_PAGE);
    try {
      expect(await text(zh.page, ".credits-calculator-title")).toBe("算一下你的任务要多少 credits");
      expect(await text(zh.page, ".credits-calculator-field span >> nth=0")).toBe("模型");
      expect(await text(zh.page, ".credits-calculator-fast span")).toBe("Fast（扣量翻倍）");
    } finally {
      await zh.page.close();
    }
  }, 60_000);

  it("prices the same task) on GPT-6 Luna at about 0.29 credits and 3,480 tasks", async () => {
    for (const route of [EN_PAGE, ZH_PAGE]) {
      const { page, errors } = await openPage(route);
      try {
        await page.selectOption(`${WIDGET} [data-credits-model]`, "GPT-6 Luna");
        expect(await cost(page)).toBe("0.29");
        expect(await tasks(page)).toBe("3,480");
        await page.selectOption(`${WIDGET} [data-credits-model]`, "GPT-6.1 Sol");
        expect(await cost(page)).toBe("5.4");
        expect(await tasks(page)).toBe("186");
        expect(errors).toEqual([]);
      } finally {
        await page.close();
      }
    }
  }, 60_000);

  it("doubles the cost) on GPT-6.1 Sol when Fast is ticked", async () => {
    const { page, errors } = await openPage(EN_PAGE);
    try {
      await page.check(`${WIDGET} [data-credits-fast]`);
      expect(await cost(page)).toBe("10.8");
      expect(await tasks(page)).toBe("93");
      await page.uncheck(`${WIDGET} [data-credits-fast]`);
      expect(await cost(page)).toBe("5.4");
      expect(await tasks(page)).toBe("186");
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("shows a hint) instead of NaN for a negative or empty field, and recovers", async () => {
    const { page, errors } = await openPage(ZH_PAGE);
    try {
      await page.fill(`${WIDGET} [data-credits-fresh]`, "-5");
      expect(await page.locator("[data-credits-error]").isVisible()).toBe(true);
      expect(await page.locator("[data-credits-result]").isVisible()).toBe(false);
      expect(await text(page, "[data-credits-error]")).toBe("每个 token 输入框和余额都填 0 或更大的数字。");
      expect(await text(page, WIDGET)).not.toMatch(/NaN|Infinity/);

      await page.fill(`${WIDGET} [data-credits-fresh]`, "50000");
      expect(await page.locator("[data-credits-error]").isVisible()).toBe(false);
      expect(await cost(page)).toBe("5.4");

      await page.fill(`${WIDGET} [data-credits-cached]`, "");
      expect(await page.locator("[data-credits-error]").isVisible()).toBe(true);
      expect(await page.locator("[data-credits-result]").isVisible()).toBe(false);
      expect(await text(page, WIDGET)).not.toMatch(/NaN|Infinity/);

      await page.fill(`${WIDGET} [data-credits-cached]`, "150000");
      expect(await page.locator("[data-credits-result]").isVisible()).toBe(true);
      expect(await cost(page)).toBe("5.4");
      expect(await tasks(page)).toBe("186");
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("fits a 390px) phone without widening the page", async () => {
    for (const route of [EN_PAGE, ZH_PAGE]) {
      const { page, errors } = await openPage(route, 390);
      try {
        await page.locator(WIDGET).waitFor({ state: "visible" });
        const fit = await page.evaluate((selector) => {
          const panel = document.querySelector(selector).getBoundingClientRect();
          const article = document.querySelector(".post-body").getBoundingClientRect();
          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            left: panel.left,
            right: panel.right,
            articleLeft: article.left,
            articleRight: article.right,
          };
        }, WIDGET);
        expect(fit.scrollWidth, route).toBeLessThanOrEqual(fit.clientWidth + 1);
        expect(fit.left).toBeGreaterThanOrEqual(fit.articleLeft - 1);
        expect(fit.right).toBeLessThanOrEqual(fit.articleRight + 1);
        expect(await cost(page)).toBe("5.4");
        expect(errors).toEqual([]);
      } finally {
        await page.close();
      }
    }
  }, 60_000);
});
