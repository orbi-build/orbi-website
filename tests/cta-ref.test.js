// Issue #273: internal Cloud login CTAs must not carry a ref token. A campaign
// ref belongs to the visitor's attribution cookie; adding a button-position
// query makes the login handoff overwrite that real channel attribution.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const sourceFiles = [
  "site/partials/nav.html",
  "site/pages/index.html",
  "site/pages/cloud/index.html",
  "site/pages/cost/index.html",
  "site/pages/zh/index.html",
  "site/pages/zh/cloud/index.html",
  "site/pages/zh/cost/index.html",
];

const builtFiles = [
  "public/index.html",
  "public/cloud/index.html",
  "public/cost/index.html",
  "public/zh/index.html",
  "public/zh/cloud/index.html",
  "public/zh/cost/index.html",
];

const read = (file) => readFile(join(ROOT, file), "utf8");

async function walkHtml(dir) {
  const files = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await walkHtml(path));
    else if (entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

const cloudLoginHrefs = (html) => [...html.matchAll(/href="(\/(?:zh\/)?cloud\/login[^\"]*)"/g)].map((m) => m[1]);

describe("internal Cloud login CTA attribution (Issue #273)", () => {
  it("uses bare, language-matching login handoffs in all source CTAs", async () => {
    const html = await Promise.all(sourceFiles.map(read));
    const hrefs = html.flatMap((contents, index) => cloudLoginHrefs(contents).map((href) => [sourceFiles[index], href]));
    expect(hrefs).toHaveLength(14);
    for (const [file, href] of hrefs) expect(href).toBe(file.includes("/zh/") && file.includes("cloud/index") ? "/zh/cloud/login" : "/cloud/login");
  });

  it("keeps the existing data-cta markers on homepage Cloud buttons", async () => {
    const [en, zh] = await Promise.all([read("site/pages/index.html"), read("site/pages/zh/index.html")]);
    for (const html of [en, zh]) {
      expect(html).toContain('data-cta="cloud-start" href="/cloud/login"');
      expect(html).toContain('data-cta="midway-cloud" href="/cloud/login"');
      expect(html).toContain('data-cta="cloud-start-card" href="/cloud/login"');
    }
  });

  it("ships only bare, language-matching login handoffs in the built pages", async () => {
    const html = await Promise.all(builtFiles.map(read));
    const hrefs = html.flatMap((contents, index) => cloudLoginHrefs(contents).map((href) => [builtFiles[index], href]));
    expect(hrefs.length).toBeGreaterThanOrEqual(14);
    for (const [file, href] of hrefs) expect(href).toBe(file.includes("/zh/") && file.includes("cloud/index") ? "/zh/cloud/login" : "/cloud/login");
  });

  it("forbids query-bearing Cloud login links anywhere in source or built HTML", async () => {
    const files = [...await walkHtml("site"), ...await walkHtml("public")];
    for (const file of files) {
      const hrefs = cloudLoginHrefs(await read(file));
      const expected = file.includes("/zh/") && file.includes("cloud/index") ? "/zh/cloud/login" : "/cloud/login";
      expect(hrefs, `${file}: internal Cloud login links must preserve campaign attribution`).toEqual(
        hrefs.map(() => expected),
      );
    }
  });
});
