import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

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
