import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// 2026-10-11: on a 390px phone, /blog/claude-code-sandbox/ was 433px wide and its Chinese
// mirror 671px. Inline code had `white-space: nowrap`, so `overflow-wrap: anywhere` never
// applied: a long name (permissions.blockReadsOutsideWorkingDirectories) or a run of codes
// joined by 、 (which may not start a line) could not break and pushed the page wider.
// Inline code stays on one line, but as an inline-block capped at the column width it moves
// to the next line whole, and a token longer than the column scrolls inside its own box.
describe("inline code never widens the page", () => {
  for (const [file, scope] of [["site/partials/post.html", ".post-body"], ["site/partials/guide.html", ".guide-body"]]) {
    it(`${scope} code is a capped inline-block in ${file}`, async () => {
      const html = await readFile(file, "utf8");
      const rule = html.match(new RegExp(`\\${scope} code \\{([^}]*)\\}`))?.[1] ?? "";
      expect(rule).toContain("display: inline-block;");
      expect(rule).toContain("max-width: 100%;");
      expect(rule).toContain("overflow-x: auto;");
    });
  }
});
