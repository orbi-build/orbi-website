import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import pricing from "../src/pricing.json";

async function comparisonPages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const pages = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) pages.push(...await comparisonPages(path));
    else if (entry.name === "index.html") pages.push(path);
  }
  return pages;
}

function plainText(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
}

async function comparisonCells() {
  const pages = [
    ...await comparisonPages("site/pages/compare"),
    ...await comparisonPages("site/pages/zh/compare"),
  ];
  const cells = [];

  for (const path of pages) {
    const html = await readFile(path, "utf8");
    for (const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)) {
      const header = table[1].match(/<thead>[\s\S]*?<\/thead>/)?.[0] ?? "";
      const columns = [...header.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((match) => plainText(match[1]));
      const orbiColumn = columns.findIndex((column) => /\bOrbi\b/.test(column));
      const body = table[1].match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";

      for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
        const rowCells = [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)];
        for (const [column, cell] of rowCells.entries()) {
          if (!cell[0].startsWith("<td")) continue;
          cells.push({ path, column, html: cell[1], isOrbi: column === orbiColumn });
        }
      }
    }
  }

  return cells;
}

describe("comparison pricing", () => {
  it("keeps placeholders out of every non-Orbi comparison column", async () => {
    const failures = (await comparisonCells())
      .filter(({ isOrbi, html }) => !isOrbi && html.includes("__"))
      .map(({ path, column, html }) => `${path} competitor column ${column + 1}: ${plainText(html)}`);

    expect(failures, "competitor comparison cells must use literal values").toEqual([]);
  });

  it("keeps Orbi's monthly price tokenized in comparison columns", async () => {
    const literalMonthlyPrice = new RegExp(`(?:US)?\\$${pricing.cloudMonthlyUsd}(?![\\d,])`);
    const failures = (await comparisonCells())
      .filter(({ isOrbi, html }) => isOrbi && literalMonthlyPrice.test(plainText(html)))
      .map(({ path, column, html }) => `${path} Orbi column ${column + 1}: ${plainText(html)}`);

    expect(failures, "Orbi comparison cells must use the monthly price placeholder").toEqual([]);
  });
});
