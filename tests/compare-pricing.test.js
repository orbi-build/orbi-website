import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

describe("comparison competitor pricing", () => {
  it("keeps placeholders out of every non-Orbi comparison column", async () => {
    const pages = [
      ...await comparisonPages("site/pages/compare"),
      ...await comparisonPages("site/pages/zh/compare"),
    ];
    const failures = [];

    for (const path of pages) {
      const html = await readFile(path, "utf8");
      for (const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)) {
        const header = table[1].match(/<thead>[\s\S]*?<\/thead>/)?.[0] ?? "";
        const columns = [...header.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((match) => plainText(match[1]));
        const orbiColumn = columns.findIndex((column) => column === "Orbi" || column === "Orbi 的取舍");
        if (orbiColumn < 0) continue;

        const body = table[1].match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
        for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
          const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
          for (const [index, cell] of cells.entries()) {
            if (index === orbiColumn - 1) continue;
            if (cell.includes("__")) failures.push(`${path} competitor column ${index + 1}: ${plainText(cell)}`);
          }
        }
      }
    }

    expect(failures, "competitor comparison cells must use literal values").toEqual([]);
  });
});
