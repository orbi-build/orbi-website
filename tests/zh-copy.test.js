// Issue #1218: /zh/compare/ and /zh/benchmark/ have to read Chinese. A copy
// review found them systematically mixing English words into Chinese
// sentences ("你审计的是 vendor 的承诺", "原样的 Orbi runner 认领 issue"), which
// nails down one reading: the words this gate names are translated once, the
// same way on every page, and never come back through a new comparison page.
//
// What stays English on purpose: product names, commands in <code>, and quoted
// source text (a <blockquote> or a quoted original sentence is evidence, not
// our prose). The gate reads the shipped pages in public/ — the same bytes the
// Worker deploys — so a source edit that skips `npm run build` fails here.

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
// The two page families the Issue names.
const SCOPE = ["zh/compare", "zh/benchmark"];

// The Issue's 验收 list — vendor, provider, artifacts, session-hour,
// green and gated, cattle — plus the two terms its 统一译法 section replaces
// (runner → 托管运行环境, head → 提交), which read just as English mid-sentence.
const BANNED = [
  ["vendor", /\bvendors?\b/i],
  ["provider", /\bproviders?\b/i],
  ["artifacts", /\bartifacts?\b/i],
  ["session-hour", /session-hour/i],
  ["green and gated", /green and gated/i],
  ["cattle", /\bcattle\b/i],
  ["runner", /\brunner\b/i],
  ["head", /\bheads?\b/i],
];

// Every index.html under the two scope directories, slash-separated.
async function walkPages(dir) {
  const pages = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) pages.push(...(await walkPages(full)));
    else if (entry.name === "index.html") pages.push(relative(PUBLIC_DIR, full).split(sep).join("/"));
  }
  return pages;
}

// The copy a visitor reads as prose. Dropped on purpose:
//   - HTML comments (not rendered),
//   - <blockquote> … </blockquote>, 「…」 and “…”: quoted source text, exempt in
//     the Issue the same way tests/pages.test.js exempts it (Issue #527),
//   - <code> … </code>: commands, also exempt,
//   - every tag, which also drops href values — "…/docs/providers.mdx" is a URL,
//     not a word in a sentence.
// Attribute prose that does reach a visitor (meta/og content, img alt) is
// checked alongside the text.
function readableCopy(html) {
  const withoutQuotes = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi, " ")
    .replace(/「[^」]*」/g, " ")
    .replace(/“[^”]*”/g, " ")
    .replace(/<code\b[\s\S]*?<\/code>/gi, " ");
  const attributes = [...withoutQuotes.matchAll(/\s(?:content|alt)="([^"]*)"/gi)].map((match) => match[1]);
  const text = withoutQuotes.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ");
  return [text, ...attributes].join("\n");
}

let copyByPage; // page path → readable copy

beforeAll(async () => {
  copyByPage = new Map();
  for (const scope of SCOPE) {
    for (const page of (await walkPages(join(PUBLIC_DIR, scope))).sort()) {
      copyByPage.set(page, readableCopy(await readFile(join(PUBLIC_DIR, page), "utf8")));
    }
  }
});

describe("the Chinese comparison and benchmark pages read Chinese (Issue #1218)", () => {
  it("uses Chinese for every word the Issue translates (quotes and commands excepted)", () => {
    const leaked = [];
    for (const [page, copy] of copyByPage) {
      for (const [word, pattern] of BANNED) {
        const match = copy.match(pattern);
        if (!match) continue;
        const at = copy.slice(Math.max(0, match.index - 40), match.index + 40).replace(/\s+/g, " ");
        leaked.push(`${page} → ${word} → …${at}…`);
      }
    }
    expect(leaked, `English left in Chinese prose (page → word → context):\n${leaked.join("\n")}`).toEqual([]);
  });

  // A walk that read nothing would make the check above pass on no evidence.
  it("walks the pages the Issue names", () => {
    expect([...copyByPage.keys()], "pages read under zh/compare and zh/benchmark").toEqual(
      expect.arrayContaining(["zh/compare/index.html", "zh/compare/devin/index.html", "zh/benchmark/index.html"]),
    );
    expect(copyByPage.size, "zh/compare + zh/benchmark pages").toBeGreaterThanOrEqual(13);
    for (const [page, copy] of copyByPage) expect(copy.length, `copy length of ${page}`).toBeGreaterThan(500);
  });
});
