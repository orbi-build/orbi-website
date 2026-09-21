import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pages = [
  ["home-en", "/"],
  ["blog-en", "/blog/claude-code-github-actions-who-merges/"],
  ["home-zh", "/zh/"],
  ["blog-zh", "/zh/blog/claude-code-github-actions-who-merges/"],
];
const widths = [1440, 1100, 1026, 900, 390];
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
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
  if (!extname(directPath)) {
    const indexPath = join(directPath, "index.html");
    const index = await readFile(indexPath).catch(() => null);
    if (index !== null) return [indexPath, index];
  }
  return null;
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url, "http://localhost");
    const file = await serve(pathname);
    if (!file) {
      response.writeHead(404);
      response.end();
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

describe("footer layout stays within the viewport (Issue #337)", () => {
  for (const [name, path] of pages) {
    it(`${name} has no horizontal overflow at every supported width`, async () => {
      const page = await browser.newPage();
      try {
        await page.setViewportSize({ width: widths[0], height: 900 });
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          const footer = page.locator("nav.footer-compare");
          const result = await footer.evaluate((element) => {
            const style = getComputedStyle(element);
            const documentElement = document.documentElement;
            const rect = element.getBoundingClientRect();
            const links = [...element.querySelectorAll("a")];
            return {
              display: style.display,
              flexWrap: style.flexWrap,
              minWidth: style.minWidth,
              footerWidth: Math.round(rect.width),
              overflow: documentElement.scrollWidth - documentElement.clientWidth,
              linkCount: links.length,
              linkRowCount: new Set(links.map((link) => Math.round(link.getBoundingClientRect().top))).size,
              linksOutsideFooter: links.some((link) => {
                const linkRect = link.getBoundingClientRect();
                return linkRect.left < rect.left || linkRect.right > rect.right;
              }),
            };
          });
          expect(result.display, `${path} at ${width}px display`).toBe("flex");
          expect(result.flexWrap, `${path} at ${width}px flex-wrap`).toBe("wrap");
          expect(result.minWidth, `${path} at ${width}px min-width`).toBe("0px");
          expect(result.footerWidth, `${path} at ${width}px footer width`).toBeLessThanOrEqual(width);
          expect(result.overflow, `${path} at ${width}px document overflow`).toBe(0);
          expect(result.linkCount, `${path} at ${width}px links`).toBeGreaterThan(0);
          expect(result.linksOutsideFooter, `${path} at ${width}px clipped links`).toBe(false);
          if (width === 390) {
            expect(result.linkRowCount, `${path} at ${width}px wrapped link rows`).toBeGreaterThan(1);
          }
          if (width === 1440 || width === 390) {
            await page.locator("footer.site-footer").screenshot({
              path: `.orbi/footer-overflow-${name}-${width}.png`,
            });
          }
        }
      } finally {
        await page.close();
      }
    }, 30_000);
  }
});
