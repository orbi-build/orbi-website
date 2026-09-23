import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPages } from "../scripts/build-pages.mjs";

const existingRoutes = [
  "/blog/",
  "/blog/claude-code-github-actions-who-merges/",
  "/blog/docker-image-third-try/",
  "/blog/watch-the-six-steps/",
  "/blog/what-autonomous-actually-means/",
  "/zh/blog/claude-code-github-actions-who-merges/",
  "/zh/blog/docker-image-third-try/",
  "/zh/blog/watch-the-six-steps/",
  "/zh/blog/what-autonomous-actually-means/",
];
const widths = [390, 1440];
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8" };
let browser;
let fixtureRoot;
let server;
let origin;

async function serve(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\/|\\)+/, "");
  if (relative.split("/").includes("..")) return null;
  const direct = join(fixtureRoot, relative || "index.html");
  const directFile = await readFile(direct).catch(() => null);
  if (directFile !== null) return [direct, directFile];
  const index = join(direct, "index.html");
  const indexFile = await readFile(index).catch(() => null);
  return indexFile === null ? null : [index, indexFile];
}

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), "orbi-blog-table-"));
  const contentDir = join(root, "content");
  fixtureRoot = join(root, "public");
  await cp(join("content", "blog"), contentDir, { recursive: true });
  const row = `| ${"unbreakable".repeat(12)} | ${"wide".repeat(30)} |`;
  const table = `| Column A | Column B |\n| --- | --- |\n${row}`;
  await writeFile(join(contentDir, "table-fixture.md"), `---\ntitle: Table fixture\ndate: 2026-09-22\nsummary: Five deliberately wide tables\nlang: en\nauthor: Orbi\nimage: /img/og.png\n---\n\n${Array(5).fill(table).join("\n\n")}\n`);
  await buildPages(fixtureRoot, { contentDir });
  await cp(join("public", "styles.css"), join(fixtureRoot, "styles.css"));

  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/pricing/") {
      response.writeHead(302, { location: "/cloud/#pricing" });
      response.end();
      return;
    }
    const file = await serve(pathname);
    if (!file) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "content-type": types[extname(file[0])] ?? "application/octet-stream" });
    response.end(file[1]);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
  if (fixtureRoot) await rm(join(fixtureRoot, ".."), { recursive: true, force: true });
});

async function overflowAt(route, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
    return await page.evaluate(() => {
      const de = document.documentElement;
      const tables = [...document.querySelectorAll(".post-body table")];
      return {
        overflow: de.scrollWidth - de.clientWidth,
        tableCount: tables.length,
        wrappersAreExactParents: tables.every((table) => table.parentElement?.classList.contains("post-table-scroll")),
        scrollableWrappers: [...document.querySelectorAll(".post-table-scroll")]
          .filter((wrapper) => wrapper.scrollWidth > wrapper.clientWidth).length,
      };
    });
  } finally {
    await page.close();
  }
}

async function blogLayoutAt(route, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
    return await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      entries: [...document.querySelectorAll(".post-entry")].map((entry) => {
        const title = entry.querySelector(".post-entry-title");
        const summary = entry.querySelector(".post-entry-summary");
        const titleStyle = getComputedStyle(title);
        return {
          titleWidth: title.getBoundingClientRect().width,
          summaryWidth: summary.getBoundingClientRect().width,
          titleHeight: title.getBoundingClientRect().height,
          titleLineHeight: Number.parseFloat(titleStyle.lineHeight),
          titleText: title.textContent.trim(),
        };
      }),
    }));
  } finally {
    await page.close();
  }
}

async function constrainedHeadingAt(route, selector, ch) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
    return await page.locator(selector).first().evaluate((heading, expectedCh) => {
      const expected = document.createElement("span");
      const style = getComputedStyle(heading);
      expected.style.cssText = `position:absolute; width:${expectedCh}ch; font:${style.font};`;
      document.body.append(expected);
      const expectedWidth = expected.getBoundingClientRect().width;
      expected.remove();
      return {
        maxWidth: Number.parseFloat(getComputedStyle(heading).maxWidth),
        width: heading.getBoundingClientRect().width,
        expectedWidth,
      };
    }, ch);
  } finally {
    await page.close();
  }
}

describe("blog titles use the post entry width (Issue #401)", () => {
  it("matches title and summary widths in both languages and keeps long English titles on one line", async () => {
    for (const route of ["/blog/", "/zh/blog/"]) {
      const result = await blogLayoutAt(route, 1440);
      expect(result.overflow, `${route} at desktop document overflow`).toBe(0);
      for (const entry of result.entries) {
        expect(entry.titleWidth, `${route} title width for ${entry.titleText}`).toBeCloseTo(entry.summaryWidth, 1);
      }
      if (route === "/blog/") {
        for (const title of [
          "The engine waited for an answer users could not give",
          "What an autonomous coding agent does when it says no",
        ]) {
          const entry = result.entries.find((candidate) => candidate.titleText === title);
          expect(entry, `missing title ${title}`).toBeDefined();
          expect(entry.titleHeight, `${title} should fit on one line`).toBeLessThanOrEqual(entry.titleLineHeight + 1);
        }
      }
    }
  });

  it("wraps narrow titles without document overflow", async () => {
    for (const route of ["/blog/", "/zh/blog/"]) {
      const result = await blogLayoutAt(route, 390);
      expect(result.overflow, `${route} at mobile document overflow`).toBe(0);
      expect(result.entries.some((entry) => entry.titleHeight > entry.titleLineHeight + 1)).toBe(true);
    }
  });

  it("keeps the recorded desktop heading widths on compare, cloud, pricing, FAQ, and closing", async () => {
    const cases = [
      ["/compare/", ".compare-section h2", 26, 1124],
      ["/cloud/", ".compare-section h2", 26, 1124],
      ["/pricing/", ".compare-section h2", 26, 1124],
      ["/", ".faq h2", 24, 1038],
      ["/", ".closing h2", 12, 519],
    ];
    for (const [route, selector, ch, productionWidth] of cases) {
      const result = await constrainedHeadingAt(route, selector, ch);
      expect(result.maxWidth, `${route} ${selector}: explicit ${ch}ch rule`).toBeCloseTo(result.expectedWidth, 1);
      expect(result.width, `${route} ${selector}: rendered width`).toBeCloseTo(result.expectedWidth, 1);
      // CI's fallback font is up to 6px narrower than the production webfont.
      expect(Math.abs(result.width - productionWidth), `${route} ${selector}: production baseline`).toBeLessThanOrEqual(6);
    }
  }, 30_000);
});

describe("blog tables stay within the viewport (Issue #393)", () => {
  it("contains all five wide tables at mobile and desktop widths", async () => {
    for (const width of widths) {
      const result = await overflowAt("/blog/table-fixture/", width);
      expect(result.overflow, `table fixture at ${width}px document overflow`).toBe(0);
      expect(result.tableCount).toBe(5);
      expect(result.wrappersAreExactParents).toBe(true);
      expect(result.scrollableWrappers, `table fixture at ${width}px scrollable wrappers`).toBe(5);
    }
  });

  it("keeps every existing post free of document overflow", async () => {
    for (const route of existingRoutes) {
      for (const width of widths) {
        const result = await overflowAt(route, width);
        expect(result.overflow, `${route} at ${width}px document overflow`).toBe(0);
      }
    }
  }, 30_000);
});
