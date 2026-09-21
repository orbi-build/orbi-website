import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(`${ROOT}${path}`, "utf8");

describe("shared hero layout (Issue #355)", () => {
  it("caps the global heading and shares its width with the lede", async () => {
    const css = await read("public/styles.css");

    expect(css).toContain("--hero-copy-width: 48rem;");
    expect(css).toContain("font-size: clamp(2.5rem, 3.3vw, 4rem);");
    expect(css).toContain("max-width: var(--hero-copy-width);");
    expect(css.match(/max-width: var\(--hero-copy-width\);/g)).toHaveLength(3);
    expect(css).not.toContain("font-size: clamp(3.4rem, 5.4vw, 6rem);");
    expect(css).not.toContain("max-width: 9.4em;");
  });

  it("keeps heading-size changes within 20% across acceptance viewports", async () => {
    const css = await read("public/styles.css");
    const match = css.match(/h1 \{[\s\S]*?font-size: clamp\(([\d.]+)rem, ([\d.]+)vw, ([\d.]+)rem\);/);
    expect(match).not.toBeNull();

    const [, minRem, fluidVw, maxRem] = match.map(Number);
    const fontSize = (viewport) => Math.min(maxRem * 16, Math.max(minRem * 16, viewport * fluidVw / 100));
    const sizes = [390, 768, 1024, 1440, 1619].map(fontSize);

    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index] / sizes[index - 1]).toBeLessThanOrEqual(1.2);
    }
    expect(fontSize(1440)).toBeLessThanOrEqual(64);
    expect(fontSize(1619)).toBeLessThanOrEqual(64);
  });

  it("only enables authored heading breaks on narrow screens", async () => {
    const css = await read("public/styles.css");

    expect(css).toContain(".responsive-break { display: none; }");
    expect(css).toContain("@media (max-width: 767px) {\n  .responsive-break { display: inline; }\n}");
  });
});
