// Issue #522: on phones, tables with 4+ columns stack row-by-row and every
// cell must therefore know its column's header. The build injects a
// data-label per <td> (and a .table-stack marker class) at render time; the
// mobile CSS turns those into the「列名：值」lines. These tests pin the
// transform itself and the shipped bytes across every table on the site.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { addTableDataLabels } from "../scripts/build-pages.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function decodeEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#\d+);/g, (entity) => {
    if (entity.startsWith("&#")) return String.fromCodePoint(Number(entity.slice(2, -1)));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" }[entity.slice(1, -1)] ?? entity;
  });
}

const cellText = (markup) => decodeEntities(markup.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
const colspan = (attrs) => Number(attrs.match(/colspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1);

// (classes, headers, body rows of {tag, index, attrs, label}) per <table>.
// Test-local re-parse of the shipped bytes: deliberately not sharing the
// build's walker, so a walker bug cannot hide behind its own checker.
function parseTables(html) {
  return [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/g)].map((table) => {
    const classes = (table[1].match(/class\s*=\s*"([^"]*)"/i)?.[1] ?? "").split(/\s+/).filter(Boolean);
    const inner = table[2];
    const headEnd = inner.match(/<\/thead>/i)?.index ?? -1;
    const head = inner.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
    const headers = [];
    const headRow = head?.[1].match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i);
    for (const cell of headRow?.[1]?.matchAll(/<th\b[^>]*([^>]*)>([\s\S]*?)<\/th>/gi) ?? []) {
      const text = cellText(cell[2]);
      for (let i = 0; i < colspan(cell[1]); i += 1) headers.push(text);
    }
    const bodyRows = [...inner.slice(headEnd + 1).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => {
      let index = 0;
      return [...row[1].matchAll(/<(t[dh])\b([^>]*)>/gi)].map((cell) => {
        const column = index;
        index += colspan(cell[2]);
        return {
          tag: cell[1].toLowerCase(),
          index: column,
          attrs: cell[2],
          hasLabel: /\bdata-label\s*=/i.test(cell[2]),
          label: decodeEntities(cell[2].match(/data-label\s*=\s*"([^"]*)"/i)?.[1] ?? ""),
        };
      });
    });
    return { classes, headers, bodyRows };
  });
}

async function listHtml(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...(await listHtml(join(dir, entry.name), `${prefix}${entry.name}/`)));
    else if (entry.name.endsWith(".html")) out.push(`${prefix}${entry.name}`);
  }
  return out.sort();
}

describe("addTableDataLabels (the build-time transform)", () => {
  const fourColumn = `<table class="compare-table">
    <thead><tr><th scope="col"></th><th scope="col">Orbi</th><th scope="col">Devin</th><th scope="col">OpenAI Codex</th></tr></thead>
    <tbody>
      <tr><th scope="row">Price</th><td>US$79/mo</td><td>$200+</td><td>per usage</td></tr>
      <tr><th scope="row">Merges the PR</th><td>yes</td><td>no</td><td>no</td></tr>
    </tbody>
  </table>`;

  it("leaves tables with three or fewer columns untouched", () => {
    const three = '<table class="compare-table"><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><th scope="row">r</th><td>1</td><td>2</td></tr></tbody></table>';
    const two = "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>";
    expect(addTableDataLabels(three)).toBe(three);
    expect(addTableDataLabels(two)).toBe(two);
  });

  it("marks 4+-column tables .table-stack and labels every td with its header", () => {
    const out = addTableDataLabels(fourColumn);
    expect(out).toContain('class="compare-table table-stack"');
    expect(out).toContain('<td data-label="Orbi">US$79/mo</td>');
    expect(out).toContain('<td data-label="Devin">$200+</td>');
    expect(out).toContain('<td data-label="OpenAI Codex">per usage</td>');
    expect(out).toContain('<td data-label="Orbi">yes</td>');
    // Row headers are the stacked block titles; they never carry a label.
    expect(out).not.toMatch(/<th[^>]*data-label=/);
  });

  it("adds the marker class to a table with no class attribute", () => {
    const out = addTableDataLabels('<table><thead><tr><th>a</th><th>b</th><th>c</th><th>d</th></tr></thead><tbody><tr><th>r</th><td>1</td><td>2</td><td>3</td></tr></tbody></table>');
    expect(out).toContain('<table class="table-stack">');
    // The leading th takes column a; the first td sits under header b.
    expect(out).toContain('<td data-label="b">1</td>');
  });

  it("keeps attributes the td already carries", () => {
    const out = addTableDataLabels('<table class="t"><thead><tr><th>a</th><th>b</th><th>c</th><th>d</th></tr></thead><tbody><tr><th>r</th><td class="x">1</td><td>2</td><td>3</td></tr></tbody></table>');
    expect(out).toContain('<td data-label="b" class="x">1</td>');
  });

  it("escapes header text into the attribute and round-trips entities", () => {
    const out = addTableDataLabels('<table><thead><tr><th>a</th><th>A &amp; B</th><th>c</th><th>d</th></tr></thead><tbody><tr><th>r</th><td>1</td><td>2</td><td>3</td></tr></tbody></table>');
    expect(out).toContain('<td data-label="A &amp; B">1</td>');
    const parsed = parseTables(out);
    expect(parsed[0].bodyRows[0][1].label).toBe("A & B");
  });

  it("leaves tables without a thead untouched", () => {
    const bare = "<table><tbody><tr><td>1</td><td>2</td><td>3</td><td>4</td></tr></tbody></table>";
    expect(addTableDataLabels(bare)).toBe(bare);
  });
});

describe("shipped tables carry their column labels (Issue #522)", () => {
  it("labels every td of every 4+-column table in public/ and none of the smaller tables", async () => {
    const problems = [];
    let wideTables = 0;
    for (const file of await listHtml(join(ROOT, "public"))) {
      const html = await readFile(join(ROOT, "public", file), "utf8");
      for (const [tableIndex, table] of parseTables(html).entries()) {
        if (table.headers.length < 4) {
          if (table.classes.includes("table-stack")) problems.push(`${file} #${tableIndex}: 3-column table carries .table-stack`);
          for (const [rowIndex, row] of table.bodyRows.entries()) {
            for (const cell of row) {
              if (cell.hasLabel) problems.push(`${file} #${tableIndex} row ${rowIndex}: small table carries data-label`);
            }
          }
          continue;
        }
        wideTables += 1;
        if (!table.classes.includes("table-stack")) problems.push(`${file} #${tableIndex}: 4+-column table lacks .table-stack`);
        for (const [rowIndex, row] of table.bodyRows.entries()) {
          for (const cell of row) {
            if (cell.tag !== "td") continue;
            if (!cell.hasLabel) problems.push(`${file} #${tableIndex} row ${rowIndex} col ${cell.index}: td missing data-label`);
            else if (cell.label !== table.headers[cell.index]) {
              problems.push(`${file} #${tableIndex} row ${rowIndex} col ${cell.index}: label "${cell.label}" != header "${table.headers[cell.index]}"`);
            }
          }
        }
      }
    }
    // The 8-column matrix, the 7-column capability matrix and the 5-column
    // cost quantiles table, each in both languages.
    expect(wideTables, "expected the six wide tables").toBe(6);
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("labels the /compare/ 8-column matrix cells with their product headers", async () => {
    const html = await readFile(join(ROOT, "public", "compare", "index.html"), "utf8");
    const matrix = parseTables(html).find((table) => table.headers.length === 8);
    expect(matrix.headers).toEqual([
      "Dimension", "Orbi", "Claude Managed Agents", "Copilot cloud agent",
      "OpenAI Codex", "Devin", "OpenHands", "Hermes Agent*",
    ]);
    const firstRow = matrix.bodyRows[0];
    expect(firstRow[0]).toMatchObject({ tag: "th", hasLabel: false });
    expect(firstRow.slice(1).map((cell) => cell.label)).toEqual([
      "Orbi", "Claude Managed Agents", "Copilot cloud agent", "OpenAI Codex", "Devin", "OpenHands", "Hermes Agent*",
    ]);
  });

  it("leaves the /compare/keelen/ 3-column table unlabelled", async () => {
    const html = await readFile(join(ROOT, "public", "compare", "keelen", "index.html"), "utf8");
    const tables = parseTables(html);
    expect(tables).toHaveLength(1);
    expect(tables[0].headers).toHaveLength(3);
    expect(tables[0].classes).not.toContain("table-stack");
    expect(tables[0].bodyRows.flat().some((cell) => cell.hasLabel)).toBe(false);
  });

  it("drops min-width: 620px from the stylesheet and stacks via attr(data-label)", async () => {
    const css = await readFile(join(ROOT, "public", "styles.css"), "utf8");
    expect(css).not.toContain("min-width: 620px");
    expect(css).toMatch(/\.table-stack thead\s*\{[^}]*display:\s*none/);
    expect(css).toContain("content: attr(data-label)");
  });
});
