import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";

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
  assertNoExternalRequests();
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
    const activeBreaks = [...heading.querySelectorAll("br")]
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
    const page = await guardedPage(browser, baseUrl);
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
          if (path === "/" || path === "/zh/") {
            if (width >= 900) expect(metrics.fontSize, `${context} font size`).toBe(68);
            if (width < 700) expect(metrics.fontSize, `${context} font size`).toBe(42);
            expect(metrics.activeBreaks, `${context} forced heading breaks`).toBe(1);
            expect(metrics.lineCount, `${context} line count`).toBe(2);
          } else if (width >= 768) {
            expect(metrics.activeBreaks, `${context} forced heading breaks`).toBe(0);
          }
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
          ).toBeLessThanOrEqual(path === "/" || path === "/zh/" ? 68 / 42 : 1.2);
        }
      }
    } finally {
      await page.close();
    }
  }, 60_000);

  it("stacks the secondary self-host link below the closing CTA", async () => {
    const page = await guardedPage(browser, baseUrl);
    try {
      for (const path of ["/", "/zh/"]) {
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
          const positions = await page.locator(".closing .cta-row").evaluate((row) => {
            const button = row.querySelector('[data-cta="closing-start"]').getBoundingClientRect();
            const selfHost = row.querySelector('[data-cta="closing-selfhost"]').getBoundingClientRect();
            return { buttonBottom: button.bottom, selfHostTop: selfHost.top };
          });
          expect(positions.selfHostTop, `${path} at ${width}px: self-host link below CTA`).toBeGreaterThanOrEqual(
            positions.buttonBottom,
          );
        }
      }
    } finally {
      await page.close();
    }
  });

  it("keeps conservative proof values when live stats are unavailable", async () => {
    const page = await guardedPage(browser, baseUrl);
    try {
      for (const path of ["/", "/zh/"]) {
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        await expect.poll(
          () => page.locator(".hero-proof-bar [data-stat]").allTextContents(),
          { message: `${path}: proof bar fallback values` },
        ).toEqual(["150", "8"]);
      }
    } finally {
      await page.close();
    }
  });

  it("uses one CSS width source and scopes the homepage headline treatment", async () => {
    const css = await readFile("public/styles.css", "utf8");

    expect(css).toContain("--hero-copy-width: 48rem;");
    expect(css.match(/max-width: var\(--hero-copy-width\);/g)).toHaveLength(2);
    expect(css).toContain(".responsive-break { display: none; }");
    expect(css).toContain(".hero.homepage-hero h1 {\n  font-size: 68px;\n  line-height: 1.02;\n  letter-spacing: -2px;\n}");
    expect(css).toContain("@media (max-width: 699px) {\n  .hero.homepage-hero h1 {\n    font-size: 42px;\n  }\n}");
  });
});

// Issue #860: on blog posts and guides the hero (h1, .hero-lede) must share the
// body text column's edges, or the heading reads narrower than the article it
// introduces. The nine shared-hero pages above keep their own 48rem source.
const articlePages = [
  "/blog/pi-agent-harness/",
  "/zh/blog/pi-agent-harness/",
  "/guides/pi-coding-agent/",
  "/zh/guides/pi-coding-agent/",
];
const articleViewports = [390, 1280, 1440, 1920, 2560];

describe("article hero alignment (Issue #860)", () => {
  it("puts the h1 and lede on the body text edges at every acceptance viewport", async () => {
    const page = await guardedPage(browser, baseUrl);
    try {
      for (const path of articlePages) {
        for (const width of articleViewports) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
          await page.evaluate(() => document.fonts.ready);
          const metrics = await page.evaluate(() => {
            const edges = (element) => {
              const rect = element.getBoundingClientRect();
              return { left: rect.left, right: rect.right };
            };
            const body = document.querySelector(".post-body, .guide-body");
            return {
              body: edges(body.querySelector("p")),
              heading: edges(document.querySelector("h1")),
              lede: edges(document.querySelector(".hero-lede")),
            };
          });
          const context = `${path} at ${width}px`;
          for (const [name, rect] of [["h1", metrics.heading], [".hero-lede", metrics.lede]]) {
            expect(Math.abs(rect.left - metrics.body.left), `${context} ${name} left edge`).toBeLessThanOrEqual(1);
            expect(Math.abs(rect.right - metrics.body.right), `${context} ${name} right edge`).toBeLessThanOrEqual(1);
          }
        }
      }
    } finally {
      await page.close();
    }
  }, 90_000);
});

