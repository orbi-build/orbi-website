// Issue #975 made a phone-width article table a native two-dimensional table
// — visible column headers, the first column pinned on opaque paper, the rest
// scrolling inside the article width, a localized swipe hint and a
// keyboard-focusable scroll region (Design System components/DataTable,
// "Article comparison matrices") — but only for posts that opted in with
// `table_layout: comparison`. Every other article kept the #522/#526 phone
// stacking, so the next post written without that line (codex-usage-limits,
// 2026-10-17) shipped its table as a pile of bordered boxes, one box per cell.
// Since then every Markdown article table — blog posts and Markdown guides, in
// both languages — renders this way by default, with nothing to declare.
//
// The shipped articles are asserted through the bytes in public/ — the same
// bytes the Worker deploys — so a hand edit that skips `npm run build` fails
// here; the rendering contract itself is driven through postFromSource.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectGuides, collectPosts, postFromSource } from "../scripts/build-pages.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EN_HINT = "Swipe horizontally to see all columns.";
const ZH_HINT = "左右滑动查看所有列。";

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

describe("article tables are native scrolling tables by default (Issue #975)", () => {
  it("renders a post table as a scoped native table with a focusable scroll region, with nothing declared", () => {
    const post = postFromSource("t.md", front(base, TABLE));
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
    // table stays directly under the table. It ships hidden: demo.js shows it
    // only while the table actually overflows its region.
    expect(post.html.indexOf(`<p class="post-table-hint" hidden>${EN_HINT}</p>`))
      .toBeGreaterThan(-1);
    expect(post.html.indexOf(`<p class="post-table-hint" hidden>${EN_HINT}</p>`))
      .toBeLessThan(post.html.indexOf('<div class="post-table-scroll"'));
  });

  it("localizes the swipe hint", () => {
    const zhTable = TABLE.replace("| Action |", "| 动作 |");
    const post = postFromSource("zh/t.md", front({ ...base, lang: "zh" }, zhTable));
    expect(post.html).toContain(`<p class="post-table-hint" hidden>${ZH_HINT}</p>`);
    expect(post.html).toContain(`aria-label="${ZH_HINT}"`);
    expect(post.html).not.toContain(EN_HINT);
  });

  it("ships every blog and guide table, in both languages, as a native table and never as stacked cards", async () => {
    const articles = [...await collectPosts(), ...await collectGuides()];
    let checked = 0;
    for (const article of articles) {
      const html = await readFile(join(ROOT, "public", article.output), "utf8");
      const hint = article.lang === "zh" ? ZH_HINT : EN_HINT;
      const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/g)].map((match) => match[0]);
      // The stacked layout is the build's .table-stack marker plus a
      // data-label on every cell; neither may reach an article page.
      expect(html, article.output).not.toContain("table-stack");
      expect(html, article.output).not.toContain("data-label=");
      for (const table of tables) {
        expect(table, article.output).toMatch(/^<table class="table-comparison">/);
        expect(table, article.output).toContain('<th scope="col">');
        expect(table, article.output).toContain('<th scope="row">');
      }
      expect(html.split('<div class="post-table-scroll" tabindex="0" role="region"').length - 1, article.output)
        .toBe(tables.length);
      if (tables.length) {
        expect(html, article.output).toContain(`aria-label="${hint}"`);
        expect(html, article.output).toContain(`<p class="post-table-hint" hidden>${hint}</p>`);
      }
      checked += tables.length;
    }
    // The articles that motivated the default, and the ones fixed before it,
    // must really be in the sweep: an empty sweep would pass vacuously.
    const outputs = articles.map((article) => article.output);
    for (const output of [
      "blog/codex-usage-limits/index.html",
      "zh/blog/codex-usage-limits/index.html",
      "blog/claude-code-yolo-mode/index.html",
      "zh/blog/codex-yolo-mode/index.html",
      "zh/guides/pi-coding-agent/index.html",
    ]) expect(outputs).toContain(output);
    expect(checked).toBeGreaterThan(20);
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
