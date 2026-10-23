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

// The nine pages tests/hero-layout.test.js already covers, plus the four pages
// Issue #861 measured (the Pi guide and the Pi agent harness post, EN + ZH).
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
  "/blog/pi-agent-harness/",
  "/zh/blog/pi-agent-harness/",
  "/guides/pi-coding-agent/",
  "/zh/guides/pi-coding-agent/",
];
const widths = [1280, 1440, 1920, 2560];

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

// Measure an element's rendered text line by line: each distinct glyph top is
// one line, and a line's width is the span from its leftmost to its rightmost
// character.
function textLines(locator) {
  return locator.evaluate((heading) => {
    const range = document.createRange();
    const lines = new Map();
    const visit = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          for (let index = 0; index < child.length; index += 1) {
            range.setStart(child, index);
            range.setEnd(child, index + 1);
            const rect = range.getClientRects()[0];
            if (!rect || rect.width === 0) continue;
            const top = Math.round(rect.top);
            const line = lines.get(top) ?? { top, left: Infinity, right: -Infinity };
            line.left = Math.min(line.left, rect.left);
            line.right = Math.max(line.right, rect.right);
            lines.set(top, line);
          }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          visit(child);
        }
      }
    };
    visit(heading);
    return [...lines.values()]
      .sort((a, b) => a.top - b.top)
      .map((line) => line.right - line.left);
  });
}

function headingLines(page) {
  return textLines(page.locator("h1").first());
}

describe("h1 wrapping (Issue #861)", () => {
  it("keeps every wrapped heading line at least a third of the longest line", async () => {
    const page = await guardedPage(browser, baseUrl);
    try {
      for (const path of pages) {
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
          await page.evaluate(() => document.fonts.ready);
          const lines = await headingLines(page);
          const context = `${path} at ${width}px`;
          expect(lines.length, `${context} heading lines`).toBeGreaterThanOrEqual(1);
          if (lines.length < 2) continue;
          const longest = Math.max(...lines);
          const shortest = Math.min(...lines);
          expect(
            shortest / longest,
            `${context}: shortest line ${shortest.toFixed(1)}px vs longest ${longest.toFixed(1)}px (lines ${lines
              .map((line) => line.toFixed(1))
              .join(", ")})`,
          ).toBeGreaterThanOrEqual(1 / 3);
        }
      }
    } finally {
      await page.close();
    }
  }, 120_000);

  // Issue #977: with the forced <br> gone, the wide two-column layout fits the
  // whole headline on one line in both languages.
  it("keeps the homepage hero headline at one line from 1280 to 2560", async () => {
    const page = await guardedPage(browser, baseUrl);
    try {
      for (const path of ["/", "/zh/"]) {
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
          await page.evaluate(() => document.fonts.ready);
          const lines = await headingLines(page);
          expect(lines, `${path} at ${width}px heading lines`).toHaveLength(1);
        }
      }
    } finally {
      await page.close();
    }
  }, 60_000);
});

// Issue #1057: the three short H3s under "Claude Code alternatives" are
// sub-headings of that section's copy column, not content headings. At 1440
// they carried the H2 role class and its 26ch measure (deleted in this Issue,
// see the content-heading cases below), which cut the Chinese heading after
// "许可" and left "界面" alone on a second line. They are native H3s now and
// follow the same column-width rule as the H2s below.
const alternativesPages = ["/compare/claude-code/", "/zh/compare/claude-code/"];
const alternativesSubheadings = "#claude-code-alternatives ~ h3";

describe("Claude Code alternatives sub-headings (Issue #1057)", () => {
  it("keeps each of the three short H3s on one line at 1440", async () => {
    const page = await guardedPage(browser, baseUrl);
    try {
      for (const path of alternativesPages) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        await page.evaluate(() => document.fonts.ready);
        const subheadings = page.locator(alternativesSubheadings);
        expect(await subheadings.count(), `${path} sub-heading count`).toBe(3);
        for (let index = 0; index < 3; index += 1) {
          const subheading = subheadings.nth(index);
          const text = (await subheading.textContent()).trim();
          const lines = await textLines(subheading);
          expect(lines, `${path} at 1440px "${text}" heading lines`).toHaveLength(1);
        }
      }
    } finally {
      await page.close();
    }
  }, 60_000);

  it("wraps them inside the copy column without page overflow at 390 and 320", async () => {
    const page = await guardedPage(browser, baseUrl);
    try {
      for (const path of alternativesPages) {
        for (const width of [390, 320]) {
          await page.setViewportSize({ width, height: 844 });
          await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
          await page.evaluate(() => document.fonts.ready);
          const subheadings = page.locator(alternativesSubheadings);
          expect(await subheadings.count(), `${path} at ${width}px sub-heading count`).toBe(3);
          for (let index = 0; index < 3; index += 1) {
            const subheading = subheadings.nth(index);
            const text = (await subheading.textContent()).trim();
            const context = `${path} at ${width}px "${text}"`;
            const lines = await textLines(subheading);
            expect(lines.length, `${context} heading lines`).toBeGreaterThanOrEqual(1);
            const box = await subheading.evaluate((element) => ({
              width: element.getBoundingClientRect().width,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
            }));
            for (const line of lines) {
              expect(line, `${context} line ${line.toFixed(1)}px vs box ${box.width.toFixed(1)}px`)
                .toBeLessThanOrEqual(box.width + 1);
            }
            expect(box.scrollWidth, `${context} clipped text`).toBeLessThanOrEqual(box.clientWidth + 1);
          }
          const viewport = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          }));
          expect(
            viewport.scrollWidth,
            `${path} at ${width}px page scrollWidth ${viewport.scrollWidth}px vs viewport ${viewport.innerWidth}px`,
          ).toBeLessThanOrEqual(viewport.innerWidth + 1);
        }
      }
    } finally {
      await page.close();
    }
  }, 90_000);
});

// Issue #1057's measured samples for the deleted 26ch measure, in both
// languages: at 1440 the whole heading fits the parent column, so it is one
// line; the 26ch rule wrapped each of them into two. The exact values the Issue
// recorded on production were 693.04px of heading inside a 1345px column.
const contentHeadings = [
  { path: "/compare/", selector: "#risk-title", text: "Convenience should not mean surrendering the boundary" },
  { path: "/zh/cost/", selector: "#merged-pr-title", text: "169 次合并交付，来自 Orbi Cloud 的实测记录" },
];

describe("generic content heading measure (Issue #1057)", () => {
  it("keeps the EN /compare/ and ZH /zh/cost/ H2 to one line at 1440", async () => {
    const page = await guardedPage(browser, baseUrl);
    try {
      for (const heading of contentHeadings) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${baseUrl}${heading.path}`, { waitUntil: "load", timeout: 25_000 });
        await page.evaluate(() => document.fonts.ready);
        const locator = page.locator(heading.selector);
        expect(await locator.count(), `${heading.path} ${heading.selector} count`).toBe(1);
        const text = (await locator.textContent()).trim();
        expect(text, `${heading.path} ${heading.selector} text`).toBe(heading.text);
        const lines = await textLines(locator);
        expect(
          lines,
          `${heading.path} at 1440px "${text}" heading lines ${lines.map((line) => line.toFixed(1)).join(" + ")}`,
        ).toHaveLength(1);
      }
    } finally {
      await page.close();
    }
  }, 60_000);

  it("wraps them inside the parent column without page overflow at 390 and 320", async () => {
    const page = await guardedPage(browser, baseUrl);
    try {
      for (const heading of contentHeadings) {
        for (const width of [390, 320]) {
          await page.setViewportSize({ width, height: 844 });
          await page.goto(`${baseUrl}${heading.path}`, { waitUntil: "load", timeout: 25_000 });
          await page.evaluate(() => document.fonts.ready);
          const locator = page.locator(heading.selector);
          expect(await locator.count(), `${heading.path} at ${width}px ${heading.selector} count`).toBe(1);
          const text = (await locator.textContent()).trim();
          const context = `${heading.path} at ${width}px "${text}"`;
          const lines = await textLines(locator);
          const box = await locator.evaluate((element) => ({
            width: element.getBoundingClientRect().width,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          }));
          expect(lines.length, `${context} heading lines`).toBeGreaterThanOrEqual(1);
          for (const line of lines) {
            expect(line, `${context} line ${line.toFixed(1)}px vs box ${box.width.toFixed(1)}px`)
              .toBeLessThanOrEqual(box.width + 1);
          }
          expect(box.scrollWidth, `${context} clipped text`).toBeLessThanOrEqual(box.clientWidth + 1);
          const viewport = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          }));
          expect(
            viewport.scrollWidth,
            `${context} page scrollWidth ${viewport.scrollWidth}px vs viewport ${viewport.innerWidth}px`,
          ).toBeLessThanOrEqual(viewport.innerWidth + 1);
        }
      }
    } finally {
      await page.close();
    }
  }, 90_000);
});
