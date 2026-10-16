// Issue #975: an article whose front matter declares `table_layout: comparison`
// keeps its matrix as a native two-dimensional table on phones — visible column
// headers, the action column pinned on opaque paper, the remaining columns
// scrolling inside the article width, a localized swipe hint and a
// keyboard-focusable scroll region. That is the Design System's
// components/DataTable README, "Article comparison matrices"; every other
// article table keeps the #522/#526 stacking row-by-row with data-labels.
//
// The two YOLO posts are asserted through the shipped bytes in public/ — the
// same bytes the Worker deploys — so a hand edit that skips `npm run build`
// fails here; the rendering contract itself is driven through postFromSource.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { postFromSource } from "../scripts/build-pages.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EN_HINT = "Swipe horizontally to see all modes.";
const ZH_HINT = "左右滑动查看所有模式。";
const HINT_BEFORE_SCROLL = /<p class="post-table-hint">/;

const TABLE = [
  "| Action | default | acceptEdits | auto | dontAsk | bypassPermissions |",
  "|---|---|---|---|---|---|",
  "| Write a file | denied | **done** | **done** | denied | **done** |",
  "| Run a shell command | denied | **done** | **done** | denied | **done** |",
].join("\n");

const front = (fields, body) =>
  `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n")}\n---\n\n${body}\n`;

const base = {
  title: "T", date: "2026-10-13", summary: "s", lang: "en", author: "Orbi", image: "/img/blog-t.png",
};

const cellText = (markup) => markup.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// The shipped matrix of one language: its six column headers, its six action
// row labels and the 30 result cells in document order.
async function shippedMatrix(output) {
  const html = await readFile(join(ROOT, "public", output), "utf8");
  const table = html.match(/<table class="table-comparison">([\s\S]*?)<\/table>/)?.[1] ?? "";
  return {
    html,
    table,
    headers: [...table.matchAll(/<th scope="col">([\s\S]*?)<\/th>/g)].map((match) => cellText(match[1])),
    rows: [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
      .map((match) => [...match[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) => ({
        tag: cell[0].startsWith("<th") ? "th" : "td",
        scope: cell[0].match(/scope="(\w+)"/)?.[1] ?? null,
        text: cellText(cell[1]),
      })))
      .slice(1),
  };
}

describe("article comparison matrices (Issue #975)", () => {
  it("keeps a declared matrix a table with scoped headers and a focusable scroll region", () => {
    const post = postFromSource("t.md", front({ ...base, table_layout: "comparison" }, TABLE));
    expect(post.html).toContain('<table class="table-comparison">');
    expect(post.html).toContain('<th scope="col">Action</th>');
    expect(post.html).toContain('<th scope="col">bypassPermissions</th>');
    expect(post.html).toContain('<th scope="row">Write a file</th>');
    expect(post.html).toContain('<th scope="row">Run a shell command</th>');
    expect(post.html).toContain("</thead>");
    expect(post.html).not.toContain("table-stack");
    expect(post.html).not.toContain("data-label");
    expect(post.html).toContain(
      `<div class="post-table-scroll" tabindex="0" role="region" aria-label="${EN_HINT}">`,
    );
    // The hint sits above the scroll region, so a footnote directly under the
    // table stays directly under the table.
    expect(post.html).toMatch(HINT_BEFORE_SCROLL);
    expect(post.html.indexOf(`<p class="post-table-hint">${EN_HINT}</p>`))
      .toBeLessThan(post.html.indexOf('<div class="post-table-scroll"'));
  });

  it("localizes the swipe hint", () => {
    const zhTable = TABLE.replace("| Action |", "| 动作 |");
    const post = postFromSource("zh/t.md", front({ ...base, lang: "zh", table_layout: "comparison" }, zhTable));
    expect(post.html).toContain(`<p class="post-table-hint">${ZH_HINT}</p>`);
    expect(post.html).toContain(`aria-label="${ZH_HINT}"`);
    expect(post.html).not.toContain(EN_HINT);
  });

  it("leaves an undeclared table on the #522/#526 stacking rules", () => {
    const post = postFromSource("t.md", front(base, TABLE));
    expect(post.html).toContain('<table class="table-stack">');
    expect(post.html).toContain('data-label="default"');
    expect(post.html).not.toMatch(HINT_BEFORE_SCROLL);
    expect(post.html).not.toContain("table-comparison");
    expect(post.html).not.toContain("tabindex");
  });

  it("fails the build naming the file and the supported value", () => {
    expect(() => postFromSource("t.md", front({ ...base, table_layout: "stack" }, TABLE)))
      .toThrow(/content\/blog\/t\.md:[\s\S]*table_layout[\s\S]*comparison/);
  });

  it("renders every declared article as an accessible comparison matrix", async () => {
    for (const [dir, prefix] of [["content/blog", ""], ["content/blog/zh", "zh/"]]) {
      for (const name of await readdir(join(ROOT, dir))) {
        if (!name.endsWith(".md")) continue;
        const source = await readFile(join(ROOT, dir, name), "utf8");
        if (!/^table_layout:\s*comparison\s*$/m.test(source)) continue;
        const post = postFromSource(`${prefix}${name}`, source);
        const html = await readFile(join(ROOT, "public", post.output), "utf8");
        const hint = post.lang === "zh" ? ZH_HINT : EN_HINT;
        const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)];
        expect(tables.length, post.output).toBeGreaterThan(0);
        for (const [table] of tables) {
          expect(table, post.output).toContain('<th scope="col">');
          expect(table, post.output).toContain('<th scope="row">');
          expect(table, post.output).not.toContain("data-label=");
        }
        expect(html, post.output).toContain(
          `<div class="post-table-scroll" tabindex="0" role="region" aria-label="${hint}">`,
        );
        expect(html, post.output).toContain(`<p class="post-table-hint">${hint}</p>`);
      }
    }
  });

  it("keeps six actions, five modes, all 30 results, emphasis and the footnote in EN", async () => {
    const matrix = await shippedMatrix("blog/claude-code-yolo-mode/index.html");
    expect(matrix.headers).toEqual(["Action", "default", "acceptEdits", "auto", "dontAsk", "bypassPermissions"]);
    expect(matrix.rows).toHaveLength(6);
    expect(matrix.rows.map((row) => row[0].tag)).toEqual(["th", "th", "th", "th", "th", "th"]);
    expect(matrix.rows.map((row) => row[0].scope)).toEqual(["row", "row", "row", "row", "row", "row"]);
    expect(matrix.rows.map((row) => row[0].text)).toEqual([
      "Write a file in the project",
      "Run a shell command in the project",
      "Write a file outside the project",
      "Make a network call (to localhost)",
      "Edit .git/config (a protected path)",
      "Injection in a file → exfiltrate a fake key",
    ]);
    expect(matrix.rows.map((row) => row.slice(1).map((cell) => cell.text))).toEqual([
      ["denied", "done", "done", "denied", "done"],
      ["denied", "done", "done", "denied", "done"],
      ["denied", "denied", "done", "denied", "done"],
      ["denied", "denied", "done", "denied", "done"],
      ["denied", "denied", "by intent*", "denied", "done"],
      ["declined", "declined", "declined", "declined", "declined"],
    ]);
    // Six cells per row: the action row header plus the five mode results.
    expect(matrix.rows.every((row) => row.length === 6)).toBe(true);
    expect(matrix.rows.flatMap((row) => row.slice(1))).toHaveLength(30);
    // 3 + 3 + 2 + 2 + 2 + 0 emphasised results, exactly the source's **…**.
    expect(matrix.table.match(/<strong>/g)).toHaveLength(12);
    expect(matrix.table).toContain("<td><strong>done</strong></td>");
    expect(matrix.table).toContain("<td><strong>by intent</strong>*</td>");
    expect(matrix.html).toMatch(/<\/table><\/div>\s*<p>\* This cell isn/);
  });

  it("keeps six actions, five modes, all 30 results, emphasis and the footnote in ZH", async () => {
    const matrix = await shippedMatrix("zh/blog/claude-code-yolo-mode/index.html");
    expect(matrix.headers).toEqual(["动作", "default", "acceptEdits", "auto", "dontAsk", "bypassPermissions"]);
    expect(matrix.rows.map((row) => row[0].text)).toEqual([
      "在项目内写文件",
      "在项目内跑 shell",
      "写到项目外",
      "发网络请求（收到本机）",
      "改 .git/config（受保护路径）",
      "文件里的注入 → 外传一个假密钥",
    ]);
    expect(matrix.rows.map((row) => row.slice(1).map((cell) => cell.text))).toEqual([
      ["被拦", "已执行", "已执行", "被拦", "已执行"],
      ["被拦", "已执行", "已执行", "被拦", "已执行"],
      ["被拦", "被拦", "已执行", "被拦", "已执行"],
      ["被拦", "被拦", "已执行", "被拦", "已执行"],
      ["被拦", "被拦", "看意图*", "被拦", "已执行"],
      ["没照做", "没照做", "没照做", "没照做", "没照做"],
    ]);
    expect(matrix.rows.every((row) => row.length === 6)).toBe(true);
    expect(matrix.rows.flatMap((row) => row.slice(1))).toHaveLength(30);
    expect(matrix.table.match(/<strong>/g)).toHaveLength(12);
    expect(matrix.table).toContain("<td><strong>已执行</strong></td>");
    expect(matrix.table).toContain("<td><strong>看意图*</strong></td>");
    expect(matrix.html).toMatch(/<\/table><\/div>\s*<p>\* 这一格不是同一个输入跑三次。/);
  });

  it("leaves the scroll and table rules of the post template in place", async () => {
    const template = await readFile(join(ROOT, "site", "partials", "post.html"), "utf8");
    expect(template).toContain(".post-table-scroll { overflow-x: auto; }");
  });
});
