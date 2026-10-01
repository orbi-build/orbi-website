import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const css = await readFile("public/styles.css", "utf8");
const pages = ["public/blog/index.html", "public/zh/blog/index.html", "public/compare/index.html", "public/cloud/index.html"];

describe("component typography selectors (Issue #402)", () => {
  it("keeps the skip link visually hidden until focus (Issue #757)", () => {
    const hidden = css.match(/\.skip-link\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const focused = css.match(/\.skip-link:focus(?:,\s*\.skip-link:focus-visible)?\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(hidden).toContain("position: absolute;");
    expect(hidden).toContain("width: 1px;");
    expect(hidden).toContain("height: 1px;");
    expect(hidden).toContain("overflow: hidden;");
    expect(hidden).toContain("clip-path: inset(50%);");
    expect(hidden).toContain("white-space: nowrap;");
    expect(focused).toContain("position: fixed;");
    expect(focused).toContain("width: auto;");
    expect(focused).toContain("height: auto;");
    expect(focused).toContain("clip-path: none;");
    expect(focused).toContain("transform: translateY(0);");
  });

  it("does not ship descendant selectors that target bare content tags", () => {
    const leaked = css.match(/^\s*\.[a-z-]+ (?:h[1-6]|p|a|ul|li|table|img)\b[^\{]*\{/gm) ?? [];
    expect(leaked, leaked.join("\n")).toEqual([]);
  });

  it("keeps the mobile Start free button border intact", () => {
    const mobileNavApply = css.match(/\.site-header nav > a\.nav-apply\s*\{([\s\S]*?)\n  \}/g)?.at(-1) ?? "";

    expect(mobileNavApply).toContain(".site-header nav > a.nav-apply");
    expect(mobileNavApply).not.toContain("border-top: 0;");
  });

  it("uses the explicit comparison heading class without applying it to blog entries", async () => {
    const html = await Promise.all(pages.map((path) => readFile(path, "utf8")));
    expect(html[0]).not.toContain("orbi-compare-section-h2");
    expect(html[1]).not.toContain("orbi-compare-section-h2");
    expect(html[2]).toContain("orbi-compare-section-h2");
    expect(html[3]).toContain("orbi-compare-section-h2");
  });
});
