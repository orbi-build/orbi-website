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

// Measure the rendered h1 line by line: each distinct glyph top is one line,
// and a line's width is the span from its leftmost to its rightmost character.
function headingLines(page) {
  return page.locator("h1").first().evaluate((heading) => {
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

  it("keeps the homepage hero headline at two lines from 1280 to 2560", async () => {
    const page = await guardedPage(browser, baseUrl);
    try {
      for (const path of ["/", "/zh/"]) {
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
          await page.evaluate(() => document.fonts.ready);
          const lines = await headingLines(page);
          expect(lines, `${path} at ${width}px heading lines`).toHaveLength(2);
        }
      }
    } finally {
      await page.close();
    }
  }, 60_000);
});
