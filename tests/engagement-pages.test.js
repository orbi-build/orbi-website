import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url).pathname;
async function htmlFiles(dir) {
  const result = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await htmlFiles(path));
    else if (entry.name.endsWith(".html")) result.push(path);
  }
  return result;
}

const read = file => readFile(join(root, file), "utf8");

describe("Issue #409 engagement build contract", () => {
  it("injects the first-party reporter into every generated HTML page", async () => {
    for (const file of await htmlFiles("public")) {
      const html = await read(file);
      expect(html, file).toContain('const endpoint="/cloud/e"');
      expect(html, file).toContain('send("engaged")');
      expect(html, file).toContain('send("scroll_depth"');
    }
  });

  it("tags the Cloud and homepage CTA links with valid details in both languages", async () => {
    for (const file of ["public/index.html", "public/zh/index.html", "public/cloud/index.html", "public/zh/cloud/index.html"]) {
      const html = await read(file);
      const ctas = [...html.matchAll(/data-cta="([^"]+)"/g)].map(match => match[1]);
      expect(ctas.length, file).toBeGreaterThan(0);
      for (const cta of ctas) expect(cta).toMatch(/^[a-z0-9-]{1,40}$/);
    }
    for (const file of ["public/cloud/index.html", "public/zh/cloud/index.html"]) {
      const html = await read(file);
      expect(html).toMatch(/data-cta="cloud-hero"[^>]*>[^<]*(Start Cloud|开始 Cloud|用 GitHub)/);
      expect(html).toContain('data-cta="cloud-docs"');
      expect(html).toContain('data-cta="pricing"');
      expect(html).toContain('data-cta="install"');
    }
  });

  it("describes all three events on both privacy pages", async () => {
    for (const file of ["public/privacy/index.html", "public/zh/privacy/index.html"]) {
      const html = await read(file);
      for (const kind of ["engaged", "cta_click", "scroll_depth"]) expect(html, file).toContain(kind);
    }
  });
});
