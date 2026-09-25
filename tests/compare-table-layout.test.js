import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

let browser;
let origin;
let server;

async function serve(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\/|\\)+/, "");
  if (relative.split("/").includes("..")) return null;
  const direct = join("public", relative || "index.html");
  const directFile = await readFile(direct).catch(() => null);
  if (directFile !== null) return [direct, directFile];
  const index = join(direct, "index.html");
  const indexFile = await readFile(index).catch(() => null);
  return indexFile === null ? null : [index, indexFile];
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
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

// Issue #522: on phones the 8-column comparison table stacks row-by-row (the
// build labels every cell with its column header), and 3-column tables fit
// the viewport without horizontal scrolling. Desktop keeps the scrollable
// wrapper and the sticky first column, unchanged from Issue #416.
describe("compare tables remain usable on mobile (Issue #522)", () => {
  for (const route of ["/compare/", "/zh/compare/"]) {
    it(`${route} stacks the wide matrix into labelled blocks with no horizontal scroll`, async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      try {
        await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
        const result = await page.evaluate(() => {
          const wrapper = document.querySelector(".compare-table-wrap");
          const table = wrapper.querySelector(".compare-table");
          const firstRow = table.querySelector("tbody tr");
          const cells = [...firstRow.querySelectorAll("td")];
          return {
            wrapperOverflow: wrapper.scrollWidth - wrapper.clientWidth,
            documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            theadDisplay: getComputedStyle(table.querySelector("thead")).display,
            cellDisplay: getComputedStyle(cells[0]).display,
            rowDisplay: getComputedStyle(firstRow).display,
            labels: cells.map((cell) => getComputedStyle(cell, "::before").content),
            orbiBackground: getComputedStyle(cells[0]).backgroundColor,
            bodyRowCount: table.querySelectorAll("tbody tr").length,
          };
        });
        expect(result.wrapperOverflow, `${route} wrapper scrolls`).toBeLessThanOrEqual(0);
        expect(result.documentOverflow, `${route} document overflows`).toBe(0);
        expect(result.theadDisplay, `${route} header row hides`).toBe("none");
        expect(result.rowDisplay, `${route} rows become blocks`).toBe("block");
        expect(result.cellDisplay, `${route} cells become blocks`).toBe("block");
        expect(result.bodyRowCount, `${route} every body row stacks`).toBeGreaterThan(0);
        // The Orbi column keeps its mint emphasis after stacking.
        expect(result.orbiBackground, `${route} Orbi block keeps the mint tint`).toBe("rgba(92, 214, 181, 0.13)");
        // Every cell names its column: the header text, not a guessed shape.
        expect(result.labels[0], `${route} Orbi cell names its column`).toContain("Orbi");
        for (const label of result.labels.slice(1)) {
          expect(label, `${route} cells name their columns`).not.toBe("none");
        }
        await page.screenshot({ path: `.orbi/compare-stack-${route.includes("zh") ? "zh" : "en"}-390.png`, fullPage: false });
      } finally {
        await page.close();
      }
    }, 30_000);
  }

  for (const route of ["/compare/keelen/", "/zh/compare/keelen/"]) {
    it(`${route} stacks the 3-column table into labelled blocks (Issue #526)`, async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      try {
        await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
        const result = await page.evaluate(() => {
          const wrapper = document.querySelector(".compare-table-wrap");
          const table = wrapper.querySelector(".compare-table");
          const firstRow = table.querySelector("tbody tr");
          const cells = [...firstRow.querySelectorAll("td")];
          return {
            wrapperOverflow: wrapper.scrollWidth - wrapper.clientWidth,
            documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            theadDisplay: getComputedStyle(table.querySelector("thead")).display,
            cellDisplay: getComputedStyle(cells[0]).display,
            columnCount: firstRow.children.length,
            labels: cells.map((cell) => getComputedStyle(cell, "::before").content),
          };
        });
        expect(result.wrapperOverflow, `${route} wrapper scrolls`).toBeLessThanOrEqual(0);
        expect(result.documentOverflow, `${route} document overflows`).toBe(0);
        expect(result.theadDisplay, `${route} 3-column table stacks its header away`).toBe("none");
        expect(result.cellDisplay, `${route} 3-column table stacks its cells`).toBe("block");
        expect(result.columnCount, `${route} all three columns render`).toBe(3);
        // Every stacked cell names its column: the header text, not a guess.
        for (const label of result.labels) {
          expect(label, `${route} cells name their columns`).not.toBe("none");
        }
        await page.screenshot({ path: `.orbi/compare-keelen-${route.includes("zh") ? "zh" : "en"}-390.png`, fullPage: false });
      } finally {
        await page.close();
      }
    }, 30_000);
  }

  it("keeps the first column sticky on a desktop table that overflows", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(`${origin}/compare/`, { waitUntil: "load", timeout: 25_000 });
      const wrapper = page.locator(".compare-table-wrap").first();
      const overflow = await wrapper.evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow, "desktop table overflow").toBeGreaterThan(0);
      await wrapper.screenshot({ path: ".orbi/compare-table-en-1440.png" });
      await wrapper.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
      const positions = await wrapper.evaluate((element) => ({
        cellLeft: element.querySelector("tbody th").getBoundingClientRect().left,
        contentLeft: element.getBoundingClientRect().left + element.clientLeft,
      }));
      expect(positions.cellLeft, "desktop sticky first column").toBeCloseTo(positions.contentLeft, 0);
    } finally {
      await page.close();
    }
  }, 30_000);
});

// Issue #526: the ≤760px `overflow-wrap: anywhere` on table-form cells let the
// auto table layout crush the first column of 3-column tables to a few
// characters, splitting words like "Free" and "Individual" mid-word. The fix
// stacks every 3+-column table (build threshold) and switches the remaining
// table-form cells to `break-word`, so no word outside <code> is ever split.
describe("no table page splits words on mobile (Issue #526)", () => {
  // Every page under public/ that ships a <table>, EN and ZH alike — scanned,
  // never listed, so adding a page widens the audit automatically.
  async function tableRoutes() {
    async function walk(dir, prefix = "") {
      const out = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) out.push(...(await walk(join(dir, entry.name), `${prefix}${entry.name}/`)));
        else if (entry.name.endsWith(".html")) out.push(`${prefix}${entry.name}`);
      }
      return out;
    }
    const routes = [];
    for (const file of (await walk("public")).sort()) {
      const html = await readFile(join("public", file), "utf8");
      if (!html.includes("<table")) continue;
      routes.push(`/${file.replace(/index\.html$/, "")}`);
    }
    return routes;
  }

  async function auditPage(route, { injectAnywhere = false } = {}) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
      await page.evaluate(() => document.fonts.ready.then(() => null));
      if (injectAnywhere) {
        // Reproduces the pre-#526 cell treatment the regression came from.
        await page.addStyleTag({
          content: ".compare-table th, .compare-table td,"
            + " .post-body .post-table-scroll th, .post-body .post-table-scroll td"
            + " { overflow-wrap: anywhere !important; }",
        });
      }
      return await page.evaluate(() => {
        const problems = [];
        const tables = [...document.querySelectorAll("table")];
        tables.forEach((table, index) => {
          const where = `table #${index}`;
          const wrapper = table.closest(".compare-table-wrap, .post-table-scroll") ?? table.parentElement;
          const overflow = wrapper.scrollWidth - wrapper.clientWidth;
          // 8px absorbs the trailing full-width punctuation of
          // zh/compare/orca's second table, confirmed clipped by eye.
          if (overflow > 8) problems.push(`${where}: wrapper scrolls ${overflow}px past its client width`);
          const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.parentElement?.closest("code")) continue;
            const text = node.nodeValue ?? "";
            for (const match of text.matchAll(/[A-Za-z0-9]{2,}/g)) {
              const range = document.createRange();
              range.setStart(node, match.index);
              range.setEnd(node, match.index + match[0].length);
              const tops = [];
              for (const rect of range.getClientRects()) {
                if (rect.width === 0 || rect.height === 0) continue;
                if (!tops.some((top) => Math.abs(top - rect.top) <= 2)) tops.push(rect.top);
              }
              if (tops.length > 1) {
                problems.push(`${where}: "${match[0]}" is split across ${tops.length} lines (tops ${tops.map((top) => Math.round(top)).join(", ")}px)`);
              }
            }
          }
        });
        return {
          tableCount: tables.length,
          documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          problems,
        };
      });
    } finally {
      await page.close();
    }
  }

  it("every public/ page with tables fits at 390×844 and keeps words whole", async () => {
    const routes = await tableRoutes();
    const failures = [];
    let tableCount = 0;
    for (const route of routes) {
      const result = await auditPage(route);
      tableCount += result.tableCount;
      if (result.documentOverflow !== 0) failures.push(`${route}: document overflows by ${result.documentOverflow}px`);
      failures.push(...result.problems.map((problem) => `${route}: ${problem}`));
    }
    // Loose lower bounds only: the scan must have found the site's table
    // pages, not an empty tree. Exact counts live in table-labels.test.js.
    expect(routes.length, "pages with tables found by the scan").toBeGreaterThanOrEqual(30);
    expect(tableCount, "tables audited").toBeGreaterThanOrEqual(40);
    expect(failures, failures.join("\n")).toEqual([]);
  }, 240_000);

  it("counter-evidence: forcing overflow-wrap:anywhere back makes the split detector go red", async () => {
    // /guides/ci-gates/ ships a 2-column table that keeps its table form on
    // phones; forcing `anywhere` onto those cells reproduces the #526 bug
    // condition (min-content collapses, "integration"/"business"/"Playwright"
    // split mid-word) and must trip the detector the traversal relies on.
    const result = await auditPage("/guides/ci-gates/", { injectAnywhere: true });
    const splits = result.problems.filter((problem) => problem.includes("is split across"));
    expect(
      splits.length,
      `forced anywhere on table-form cells must produce mid-word splits, got: ${splits.join("; ") || "none"}`,
    ).toBeGreaterThan(0);
  }, 60_000);
});
