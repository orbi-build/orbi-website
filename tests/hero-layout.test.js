import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
};
const viewports = [390, 768, 1024, 1440, 1619];
const pages = [
  "/",
  "/cloud/",
  "/pricing/",
  "/cost/",
  "/compare/",
  "/zh/",
  "/zh/cloud/",
  "/zh/pricing/",
  "/zh/cost/",
];
const lineCountPages = new Set(["/cloud/", "/pricing/", "/zh/cloud/", "/zh/pricing/"]);

let server;
let browser;
let baseUrl;

async function serve(pathname) {
  // The Worker permanently redirects these aliases to the Cloud pricing section;
  // mirror that existing route contract so this test measures the rendered page.
  if (pathname === "/pricing/" || pathname === "/pricing") return { redirect: "/cloud/#pricing" };
  if (pathname === "/zh/pricing/" || pathname === "/zh/pricing") return { redirect: "/zh/cloud/#pricing" };

  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\/|\\)+/, "");
  if (relative.split("/").includes("..")) return null;
  const directPath = join("public", relative);
  const direct = await readFile(directPath).catch(() => null);
  if (direct !== null) return { path: directPath, body: direct };
  const indexPath = join(directPath, "index.html");
  const index = await readFile(indexPath).catch(() => null);
  return index === null ? null : { path: indexPath, body: index };
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const file = await serve(new URL(request.url, "http://localhost").pathname);
    if (!file) {
      response.writeHead(404);
      response.end();
      return;
    }
    if (file.redirect) {
      response.writeHead(301, { location: file.redirect });
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": contentTypes[extname(file.path)] ?? "application/octet-stream" });
    response.end(file.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

function heroMetrics(page) {
  return page.locator("h1").evaluate((heading) => {
    const range = document.createRange();
    const lineTops = new Set();
    const visit = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          for (let index = 0; index < child.length; index += 1) {
            range.setStart(child, index);
            range.setEnd(child, index + 1);
            const rect = range.getClientRects()[0];
            if (rect) lineTops.add(Math.round(rect.top));
          }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          visit(child);
        }
      }
    };
    visit(heading);

    const headingRect = heading.getBoundingClientRect();
    const ledeRect = document.querySelector(".hero-lede").getBoundingClientRect();
    const activeBreaks = [...heading.querySelectorAll("br.responsive-break")]
      .filter((element) => getComputedStyle(element).display !== "none").length;
    return {
      activeBreaks,
      fontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
      heightRatio: headingRect.height / innerHeight,
      lineCount: lineTops.size,
      rightDifference: Math.abs(headingRect.right - ledeRect.right),
    };
  });
}

describe("shared hero layout (Issue #355)", () => {
  it("meets the nine-page heading geometry contract at every acceptance viewport", async () => {
    const page = await browser.newPage();
    try {
      for (const path of pages) {
        const fontSizes = [];
        for (const width of viewports) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
          await page.evaluate(() => document.fonts.ready);
          const metrics = await heroMetrics(page);
          const context = `${path} at ${width}px`;

          fontSizes.push(metrics.fontSize);
          const rightEdgeTolerance = path === "/" || path === "/zh/" ? 0 : 2;
          expect(metrics.rightDifference, `${context} heading/lede right edges`).toBeLessThanOrEqual(rightEdgeTolerance);
          expect(metrics.heightRatio, `${context} heading height`).toBeLessThanOrEqual(0.18);
          if (width >= 1440) expect(metrics.fontSize, `${context} font size`).toBeLessThanOrEqual(64);
          if (width >= 768) expect(metrics.activeBreaks, `${context} forced heading breaks`).toBe(0);
          if (lineCountPages.has(path) && width >= 1024) {
            expect(metrics.lineCount, `${context} line count`).toBeLessThanOrEqual(2);
          }
          if (lineCountPages.has(path) && width === 390) {
            expect(metrics.lineCount, `${context} line count`).toBeLessThanOrEqual(3);
          }
        }

        for (let index = 1; index < fontSizes.length; index += 1) {
          const adjacentRatio = Math.max(fontSizes[index], fontSizes[index - 1])
            / Math.min(fontSizes[index], fontSizes[index - 1]);
          expect(
            adjacentRatio,
            `${path} font-size jump from ${viewports[index - 1]}px to ${viewports[index]}px`,
          ).toBeLessThanOrEqual(1.2);
        }
      }
    } finally {
      await page.close();
    }
  }, 60_000);

  it("uses one CSS width source and enables authored breaks only on narrow screens", async () => {
    const css = await readFile("public/styles.css", "utf8");

    expect(css).toContain("--hero-copy-width: 48rem;");
    expect(css.match(/max-width: var\(--hero-copy-width\);/g)).toHaveLength(2);
    expect(css).toContain(".responsive-break { display: none; }");
    expect(css).toContain("@media (max-width: 767px) {\n  .responsive-break { display: inline; }\n}");
  });
});
