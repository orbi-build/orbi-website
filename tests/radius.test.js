import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = await readFile("public/styles.css", "utf8");
const postTemplate = await readFile("site/partials/post.html", "utf8");

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith(".html") ? [path] : [];
  }));
  return nested.flat();
}

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

  it("uses the card radius for the named panels", () => {
    for (const selector of [
      ".hero-receipt",
      ".stats",
      ".proof-card",
      ".production-map",
      ".faq-item",
      ".pricing-card",
      ".subscribe-box",
    ]) {
      const rule = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")} \\{[\\s\\S]*?\\}`));
      expect(rule?.[0], selector).toContain("border-radius: var(--radius-card)");
    }
  });

  it("has no un-tokenized non-circular radius", () => {
    const declarations = [...css.matchAll(/border-radius\s*:\s*([^;]+);/g)].map((match) => match[1].trim());
    const nonCircular = declarations.filter((value) => !["50%", "999px"].includes(value));
    expect(nonCircular.every((value) =>
      value.includes("var(--radius-control)") || value.includes("var(--radius-card)"),
    )).toBe(true);
  });

  it("uses the shared radii for blog panels and embedded media", () => {
    expect(postTemplate).toMatch(/\.post-toc-inline\s*\{[^}]*border-radius:\s*var\(--radius-card\)/);
    expect(postTemplate).toMatch(/\.post-body pre\s*\{[^}]*border-radius:\s*var\(--radius-card\)/);
    expect(postTemplate).toMatch(/\.post-media img, \.post-media iframe, \.post-media svg\s*\{[^}]*border-radius:\s*var\(--radius-card\)/);

    const declarations = [...postTemplate.matchAll(/border-radius\s*:\s*([^;]+);/g)].map((match) => match[1].trim());
    expect(declarations.every((value) =>
      value.includes("var(--radius-control)") || value.includes("var(--radius-card)"),
    )).toBe(true);
  });

  it("tokenizes radii in page and partial styles too", async () => {
    for (const path of await htmlFiles("site")) {
      const source = await readFile(path, "utf8");
      const declarations = [...source.matchAll(/border-radius\s*:\s*([^;]+);/g)].map((match) => match[1].trim());
      expect(declarations.every((value) =>
        value.includes("var(--radius-control)") || value.includes("var(--radius-card)")
          || ["50%", "999px"].includes(value),
      ), path).toBe(true);
    }
  });

  it("keeps language-option keyboard focus visible inside the clipping frame", () => {
    expect(css).toMatch(/\.language > \*:focus-visible\s*\{[^}]*outline-offset:\s*-3px;/);
  });
});
