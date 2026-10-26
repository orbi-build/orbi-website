// Issue #1083: the chat.sh support widget loads on exactly four pages — the
// Cloud pricing pages and the support pages — and nowhere else. The tag is
// defined once in site/partials/chat.html and expanded by the build through
// the <!--@chat--> marker, so these assertions read the shipped bytes in
// public/ (what the Worker deploys), not the sources.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url).pathname;
const WIDGET_TAG =
  '<script src="https://chat.sh/widget.js" data-site="3d9e07ad-8a5f-4356-99b2-a82e52f99ecc" async></script>';
const WIDGET_PAGES = [
  "public/cloud/index.html",
  "public/zh/cloud/index.html",
  "public/support/index.html",
  "public/zh/support/index.html",
];

async function htmlFiles(dir = "public") {
  const result = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await htmlFiles(path));
    else if (entry.name.endsWith(".html")) result.push(path);
  }
  return result;
}

describe("Issue #1083 chat.sh widget", () => {
  it("loads the widget exactly once on the two Cloud pricing pages and the two support pages", async () => {
    for (const file of WIDGET_PAGES) {
      const html = await readFile(join(root, file), "utf8");
      expect((html.match(/https:\/\/chat\.sh\/widget\.js/g) ?? []).length, file).toBe(1);
      expect(html, file).toContain(WIDGET_TAG);
    }
  });

  it("never loads the widget on any other page (home, guides, blog, compare)", async () => {
    const files = await htmlFiles();
    expect(files).toEqual(expect.arrayContaining(WIDGET_PAGES));
    for (const file of files) {
      if (WIDGET_PAGES.includes(file)) continue;
      expect(await readFile(join(root, file), "utf8"), file).not.toContain("chat.sh");
    }
  });
});
