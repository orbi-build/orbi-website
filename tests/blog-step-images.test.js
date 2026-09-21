import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const routes = ["/blog/watch-the-six-steps/", "/zh/blog/watch-the-six-steps/"];
const types = { ".html": "text/html", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
let server;
let browser;
let origin;

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const relative = pathname.replace(/^\/+/, "") || "index.html";
    let filePath = join("public", relative);
    let file = await readFile(filePath).catch(() => null);
    if (!file) {
      filePath = join("public", relative, "index.html");
      file = await readFile(filePath).catch(() => null);
    }
    if (!file) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "content-type": types[extname(filePath)] ?? "application/octet-stream" });
    response.end(file);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

describe("seven-step blog images (Issue #356)", () => {
  for (const route of routes) {
    for (const width of [390, 1440]) {
      for (const dpr of [1, 2]) {
        it(`${route} serves every image without distortion at ${width}px and DPR ${dpr}`, async () => {
          const page = await browser.newPage({ deviceScaleFactor: dpr, viewport: { width, height: 900 } });
          try {
            await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
            await page.locator("img[src*='/img/step-']").first().waitFor();
            const results = await page.locator("img[src*='/img/step-']").evaluateAll((images) => images.map((image) => {
              const rect = image.getBoundingClientRect();
              return {
                naturalWidth: image.naturalWidth,
                naturalHeight: image.naturalHeight,
                currentSrc: image.currentSrc,
                dpr: window.devicePixelRatio,
                renderedWidth: rect.width,
                renderedHeight: rect.height,
                ratio: image.naturalWidth / image.naturalHeight,
                renderedRatio: rect.width / rect.height,
              };
            }));
            expect(results).toHaveLength(7);
            for (const result of results) {
              expect(result.currentSrc.endsWith("-2x.png")).toBe(dpr === 2);
              expect(result.naturalWidth).toBeGreaterThanOrEqual(result.renderedWidth * result.dpr);
              expect(Math.abs(result.ratio - result.renderedRatio)).toBeLessThan(0.02);
            }
            expect(new Set(results.map((result) => result.ratio)).size).toBe(1);
          } finally {
            await page.close();
          }
        });
      }
    }
  }
});
