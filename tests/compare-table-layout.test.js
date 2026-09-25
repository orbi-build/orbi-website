import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
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
    it(`${route} fits the 3-column table in the viewport, every column visible`, async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      try {
        await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
        const result = await page.evaluate(() => {
          const wrapper = document.querySelector(".compare-table-wrap");
          const table = wrapper.querySelector(".compare-table");
          const firstRow = table.querySelector("tbody tr");
          const wrapperRect = wrapper.getBoundingClientRect();
          const lastCell = firstRow.lastElementChild.getBoundingClientRect();
          return {
            wrapperOverflow: wrapper.scrollWidth - wrapper.clientWidth,
            documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            theadDisplay: getComputedStyle(table.querySelector("thead")).display,
            firstCellDisplay: getComputedStyle(firstRow.firstElementChild).display,
            columnCount: firstRow.children.length,
            lastColumnInside: lastCell.right <= wrapperRect.right + 1,
          };
        });
        expect(result.wrapperOverflow, `${route} wrapper scrolls`).toBeLessThanOrEqual(0);
        expect(result.documentOverflow, `${route} document overflows`).toBe(0);
        expect(result.theadDisplay, `${route} small tables keep their header row`).not.toBe("none");
        expect(result.firstCellDisplay, `${route} small tables keep table cells`).toBe("table-cell");
        expect(result.columnCount, `${route} all three columns render`).toBe(3);
        expect(result.lastColumnInside, `${route} last column is visible`).toBe(true);
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
