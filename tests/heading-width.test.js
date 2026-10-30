import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

// Issue #1112: the shared h1 rule carried `text-wrap: balance` (#861). On a
// phone it equalised every line of a three-line title, so each line stopped at
// ~70% of the box and the heading wrapped early. `pretty` only fine-tunes the
// last line, so the rest fills the container like normal wrapping does.
describe("shared h1 wrapping (Issue #1112)", () => {
  test("fills the container with text-wrap: pretty, never balance", () => {
    const rule = css.match(/^h1 \{[^}]*\}/m)?.[0] ?? "";
    expect(rule, "the shared h1 rule").toContain("text-wrap: pretty;");
    expect(rule, "the shared h1 rule").not.toContain("text-wrap: balance;");
  });

  // #861's balanced lines stay for the desktop layout: with plain filling, the
  // Pi agent harness post title ends on "kill -9" alone at 1280 (86.9px of an
  // 800px box). Below 761px the phone layout fills instead (Issue #1112).
  test("keeps the balanced lines from the desktop layout up", () => {
    expect(css).toMatch(/@media \(min-width: 761px\) \{\s*h1 \{ text-wrap: balance; \}/);
  });
});

describe("desktop section heading widths", () => {
  test("pricing summary heading uses a wide balanced measure", () => {
    expect(css).toMatch(
      /\.pricing-summary \.orbi-pricing-summary-h2\s*\{[^}]*max-width:\s*22ch;[^}]*text-wrap:\s*balance;/,
    );
  });

  test("closing heading uses a wide balanced measure", () => {
    expect(css).toMatch(
      /\.closing \.orbi-closing-h2\s*\{[^}]*max-width:\s*22ch;[^}]*text-wrap:\s*balance;/,
    );
  });
});
