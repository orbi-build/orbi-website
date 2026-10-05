import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const routes = ["/blog/watch-the-six-steps/", "/zh/blog/watch-the-six-steps/"];
const types = { ".html": "text/html", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
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
        // Same 30s budget as the other browser tests: page.goto alone may
        // wait 25s, and the footer's third-party badges (Toolradar since
        // #836) can hold the load event past vitest's 5s default.
        it(`${route} serves every image without distortion at ${width}px and DPR ${dpr}`, async () => {
          const page = await browser.newPage({ deviceScaleFactor: dpr, viewport: { width, height: 900 } });
          try {
            await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
            const images = page.locator("img[src*='/img/step-']");
            await images.first().waitFor();
            // Issue #587: steps 3-7 are loading="lazy", so each image is
            // scrolled into view and awaited before its metrics are read —
            // an unscrolled lazy image reports naturalWidth 0.
            const results = [];
            for (let index = 0; index < 7; index++) {
              const image = images.nth(index);
              await image.scrollIntoViewIfNeeded();
              await image.evaluate((element) => element.complete
                ? Promise.resolve()
                : new Promise((resolve) => element.addEventListener("load", resolve, { once: true })));
              results.push(await image.evaluate(async (image) => {
                const rect = image.getBoundingClientRect();
                // With w-descriptor srcset the browser density-corrects
                // naturalWidth down to the sizes pixel value, so sharpness is
                // measured on the selected resource itself: a detached Image
                // without srcset reports its raw intrinsic width.
                const probe = await new Promise((resolve, reject) => {
                  const detached = new Image();
                  detached.onload = () => resolve(detached);
                  detached.onerror = () => reject(new Error(`probe failed to load ${image.currentSrc}`));
                  detached.src = image.currentSrc;
                });
                return {
                  naturalWidth: probe.naturalWidth,
                  naturalHeight: probe.naturalHeight,
                  currentSrc: image.currentSrc,
                  dpr: window.devicePixelRatio,
                  renderedWidth: rect.width,
                  renderedHeight: rect.height,
                  ratio: probe.naturalWidth / probe.naturalHeight,
                  renderedRatio: rect.width / rect.height,
                };
              }));
            }
            expect(results).toHaveLength(7);
            for (const result of results) {
              expect(result.currentSrc.endsWith(".webp")).toBe(true);
              expect(result.naturalWidth).toBeGreaterThanOrEqual(result.renderedWidth * result.dpr);
              expect(Math.abs(result.ratio - result.renderedRatio)).toBeLessThan(0.02);
            }
            expect(new Set(results.map((result) => result.ratio)).size).toBe(1);
          } finally {
            await page.close();
          }
        }, 30_000);
      }
    }
  }
});
