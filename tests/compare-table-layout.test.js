import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const routes = ["/compare/", "/zh/compare/", "/compare/keelen/", "/zh/compare/keelen/"];
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

let browser;
let origin;
let server;

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
    const file = await serve(new URL(request.url, "http://localhost").pathname);
    if (!file) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": contentTypes[extname(file[0])] ?? "application/octet-stream" });
    response.end(file[1]);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

describe("compare tables remain usable on mobile (Issue #416)", () => {
  for (const route of routes) {
    it(`${route} shows the dimension and Orbi columns and keeps the dimension sticky`, async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      try {
        await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
        const table = page.locator(".compare-table").first();
        const wrapper = table.locator("xpath=..");
        const [firstColumn, secondColumn] = await table.locator("thead th").evaluateAll((headers) =>
          headers.slice(0, 2).map((header) => header.getBoundingClientRect().width),
        );
        const wrapperWidth = await wrapper.evaluate((element) => element.clientWidth);
        expect(firstColumn + secondColumn, `${route} first two columns`).toBeLessThanOrEqual(wrapperWidth);
        expect(await wrapper.evaluate((element) => element.scrollWidth)).toBeGreaterThan(wrapperWidth);
        await wrapper.screenshot({ path: `.orbi/compare-table-${route.includes("zh") ? "zh" : "en"}-390.png` });

        await wrapper.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
        await page.waitForFunction((selector) => {
          const element = document.querySelector(selector);
          return element.scrollLeft === element.scrollWidth - element.clientWidth;
        }, ".compare-table-wrap");
        const positions = await wrapper.evaluate((element) => ({
          cellLeft: element.querySelector("tbody th").getBoundingClientRect().left,
          contentLeft: element.getBoundingClientRect().left + element.clientLeft,
        }));
        expect(positions.cellLeft, `${route} sticky first column`).toBeCloseTo(positions.contentLeft, 0);
      } finally {
        await page.close();
      }
    }, 30_000);
  }

  it("keeps the first column sticky on a desktop table that overflows", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(`${origin}/compare/`, { waitUntil: "load", timeout: 25_000 });
      const wrapper = page.locator(".compare-table-wrap").first();
      const overflow = await wrapper.evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow, "desktop table overflow").toBeGreaterThan(0);
      await wrapper.screenshot({ path: ".orbi/compare-table-en-1440.png" });
      await wrapper.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
      const positions = await wrapper.evaluate((element) => ({
        cellLeft: element.querySelector("tbody th").getBoundingClientRect().left,
        contentLeft: element.getBoundingClientRect().left + element.clientLeft,
      }));
      expect(positions.cellLeft, "desktop sticky first column").toBeCloseTo(positions.contentLeft, 0);
    } finally {
      await page.close();
    }
  }, 30_000);
});
