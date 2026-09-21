import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(`${ROOT}${path}`, "utf8");

describe("shared hero layout (Issue #355)", () => {
  it("caps the global heading and shares its width with the lede", async () => {
    const css = await read("public/styles.css");

    expect(css).toContain("--hero-copy-width: 48rem;");
    expect(css).toContain("font-size: clamp(2.5rem, 3.4vw, 4rem);");
    expect(css).toContain("max-width: var(--hero-copy-width);");
    expect(css.match(/max-width: var\(--hero-copy-width\);/g)).toHaveLength(3);
    expect(css).not.toContain("font-size: clamp(3.4rem, 5.4vw, 6rem);");
    expect(css).not.toContain("max-width: 9.4em;");
  });

  it("only enables authored heading breaks on narrow screens", async () => {
    const css = await read("public/styles.css");

    expect(css).toContain(".responsive-break { display: none; }");
    expect(css).toContain("@media (max-width: 767px) {\n  .responsive-break { display: inline; }\n}");
  });
});
