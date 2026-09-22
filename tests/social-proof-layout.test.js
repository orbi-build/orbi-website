import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pages = [
  ["home-en", "/", "#social-proof"],
  ["home-zh", "/zh/", "#social-proof"],
  ["evidence-en", "/evidence/", "#third-party"],
  ["evidence-zh", "/zh/evidence/", "#third-party"],
];
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

let server;
let browser;
let baseUrl;

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
    const file = await serve(new URL(request.url, "http://localhost").pathname);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": contentTypes[extname(file[0])] ?? "application/octet-stream" });
    response.end(file[1]);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

function gridMetrics(section) {
  return section.locator(".social-proof-grid").evaluateAll((grids) => grids.map((grid) => {
    const gridRect = grid.getBoundingClientRect();
    return {
      width: Math.round(gridRect.width),
      cards: [...grid.querySelectorAll(".proof-card")].map((card) => {
        const rect = card.getBoundingClientRect();
        return { top: Math.round(rect.top), width: Math.round(rect.width) };
      }),
    };
  }));
}

describe("social-proof grid layout (Issue #407)", () => {
  for (const [name, path, selector] of pages) {
    it(`${name} uses balanced desktop rows and full-width mobile cards`, async () => {
      const page = await browser.newPage();
      try {
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
          const section = page.locator(selector);
          const grids = await gridMetrics(section);
          expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name} at ${width}px overflow`).toBe(0);

          for (const grid of grids) {
            if (width === 390) {
              expect(grid.cards.every((card) => Math.abs(card.width - grid.width) <= 1)).toBe(true);
              expect(new Set(grid.cards.map((card) => card.top)).size).toBe(grid.cards.length);
            } else if (grid.cards.length === 1) {
              expect(grid.cards[0].width, `${name} singleton card width`).toBe(grid.width);
            } else {
              const rowCounts = [...grid.cards.reduce((rows, card) =>
                rows.set(card.top, (rows.get(card.top) ?? 0) + 1), new Map()).values()];
              expect(rowCounts, `${name} desktop row balance`).toEqual(rowCounts.map(() => 2));
            }
          }
        }
      } finally {
        await page.close();
      }
    }, 30_000);
  }
});
