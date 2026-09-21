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
const widths = [390, 761, 1024, 1440];

let server;
let browser;
let baseUrl;

async function serve(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\/|\\)+/, "");
  if (relative.split("/").includes("..")) return null;
  const directPath = join("public", relative);
  const direct = await readFile(directPath).catch(() => null);
  if (direct !== null) return [directPath, direct];
  const index = await readFile(join(directPath, "index.html")).catch(() => null);
  return index === null ? null : [join(directPath, "index.html"), index];
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
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

function headingMetrics(page) {
  return page.locator("h1").evaluate((heading) => {
    const range = document.createRange();
    range.selectNodeContents(heading);
    const fragments = [...range.getClientRects()]
      .map(({ top, bottom }) => ({ top: Math.round(top), bottom: Math.round(bottom) }))
      .sort((a, b) => a.top - b.top);
    const lines = [];
    for (const fragment of fragments) {
      const line = lines.at(-1);
      if (line && fragment.top === line.top) line.bottom = Math.max(line.bottom, fragment.bottom);
      else lines.push(fragment);
    }
    const style = getComputedStyle(heading);
    return {
      lines,
      fontSize: Number.parseFloat(style.fontSize),
      lineHeight: Number.parseFloat(style.lineHeight),
    };
  });
}

describe("Homepage heading keeps readable line boxes (Issue #366)", () => {
  it("has no overlapping heading lines at every supported width in English and Chinese", async () => {
    const page = await browser.newPage();
    try {
      for (const language of ["", "zh/"]) {
        await page.goto(`${baseUrl}/${language}`, { waitUntil: "load", timeout: 25_000 });
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          const { lines } = await headingMetrics(page);
          expect(lines.length, `${language || "en"} line count at ${width}px`).toBeGreaterThanOrEqual(1);
          for (let index = 1; index < lines.length; index += 1) {
            expect(lines[index].top - lines[index - 1].bottom, `${language || "en"} overlap at ${width}px`).toBeGreaterThanOrEqual(0);
          }
        }
      }
    } finally {
      await page.close();
    }
  }, 30_000);

  it("keeps the English heading to at most two lines at 390px", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "load", timeout: 25_000 });
      await page.setViewportSize({ width: 390, height: 900 });
      expect((await headingMetrics(page)).lines.length).toBeLessThanOrEqual(2);
    } finally {
      await page.close();
    }
  }, 30_000);

  it("keeps the Chinese heading compact at 761px and two lines at 1440px", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/zh/`, { waitUntil: "load", timeout: 25_000 });
      for (const [width, expectedLines] of [[761, 1], [1440, 2]]) {
        await page.setViewportSize({ width, height: 900 });
        expect((await headingMetrics(page)).lines, `${width}px`).toHaveLength(expectedLines);
      }
    } finally {
      await page.close();
    }
  }, 30_000);

  it("does not declare a fixed line-height for h1", async () => {
    const styles = await readFile("public/styles.css", "utf8");
    expect(styles).not.toMatch(/(?:^|\n)\s*h1(?:\s*,[^\{]*)?\s*\{[^}]*line-height\s*:/);
  });
});
