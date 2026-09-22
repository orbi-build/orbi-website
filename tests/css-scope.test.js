import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const css = await readFile("public/styles.css", "utf8");
const pages = ["public/blog/index.html", "public/zh/blog/index.html", "public/compare/index.html", "public/cloud/index.html"];

describe("component typography selectors (Issue #402)", () => {
  it("does not ship descendant selectors that target bare content tags", () => {
    const leaked = css.match(/^\s*\.[a-z-]+ (?:h[1-6]|p|a|ul|li|table|img)\b[^\{]*\{/gm) ?? [];
    expect(leaked, leaked.join("\n")).toEqual([]);
  });

  it("uses the explicit comparison heading class without applying it to blog entries", async () => {
    const html = await Promise.all(pages.map((path) => readFile(path, "utf8")));
    expect(html[0]).not.toContain("orbi-compare-section-h2");
    expect(html[1]).not.toContain("orbi-compare-section-h2");
    expect(html[2]).toContain("orbi-compare-section-h2");
    expect(html[3]).toContain("orbi-compare-section-h2");
  });
});
