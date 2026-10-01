import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const css = await readFile("public/styles.css", "utf8");

describe("site radius tokens", () => {
  it("defines the shared control and card radii", () => {
    expect(css).toContain("--radius-control: 8px");
    expect(css).toContain("--radius-card: 12px");
  });

  it("uses the control radius for the required controls", () => {
    for (const selector of [
      ".button",
      ".site-header nav > a.nav-apply",
      ".menu-toggle",
      ".language",
      "button, input, textarea, select",
    ]) {
      const rule = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")} \\{[\\s\\S]*?\\}`));
      expect(rule?.[0], selector).toContain("border-radius: var(--radius-control)");
    }
  });

  it("has no un-tokenized non-circular radius", () => {
    const declarations = [...css.matchAll(/border-radius\s*:\s*([^;]+);/g)].map((match) => match[1].trim());
    const nonCircular = declarations.filter((value) => !["50%", "999px"].includes(value));
    expect(nonCircular.every((value) =>
      value.includes("var(--radius-control)") || value.includes("var(--radius-card)"),
    )).toBe(true);
  });
});
