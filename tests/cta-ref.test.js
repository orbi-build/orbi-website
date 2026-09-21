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
    expect(hrefs).toHaveLength(8);
    for (const [file, href] of hrefs) expect(href).toBe(file.includes("/zh/") ? "/zh/cloud/login" : "/cloud/login");
  });

  it("introduces the matching-language Cloud page from all homepage CTAs (Issue #322)", async () => {
    const expectations = [
      ["site/pages/index.html", "/cloud/"],
      ["site/pages/zh/index.html", "/zh/cloud/"],
    ];
    for (const [file, landingPath] of expectations) {
      const html = await read(file);
      for (const marker of ["cloud-start", "midway-cloud", "cloud-start-card"]) {
        expect(html, `${file}: ${marker} must introduce Cloud`).toContain(
          `data-cta="${marker}" href="${landingPath}"`,
        );
      }
      expect(html, `${file}: homepage CTAs must not skip to login`).not.toMatch(
        /data-cta="(?:cloud-start|midway-cloud|cloud-start-card)" href="\/(?:zh\/)?cloud\/login/,
      );
    }
  });

  it("keeps Cloud login links language-prefixed across Chinese pages", async () => {
    for (const file of [...await walkHtml("site"), ...await walkHtml("public")]) {
      if (file.includes("/zh/") || file.startsWith("public/zh/")) {
        expect(await read(file), `${file}: Chinese pages must use /zh/cloud/login`).not.toContain(
          'href="/cloud/login',
        );
      }
    }
  });

  it("ships only bare, language-matching login handoffs in the built pages", async () => {
    const html = await Promise.all(builtFiles.map(read));
    const hrefs = html.flatMap((contents, index) => cloudLoginHrefs(contents).map((href) => [builtFiles[index], href]));
    expect(hrefs.length).toBeGreaterThanOrEqual(8);
    for (const [file, href] of hrefs) expect(href).toBe(file.includes("/zh/") ? "/zh/cloud/login" : "/cloud/login");
  });

  it("forbids query-bearing Cloud login links anywhere in source or built HTML", async () => {
    const files = [...await walkHtml("site"), ...await walkHtml("public")];
    for (const file of files) {
      const hrefs = cloudLoginHrefs(await read(file));
      const expected = file.includes("/zh/") ? "/zh/cloud/login" : "/cloud/login";
      expect(hrefs, `${file}: internal Cloud login links must preserve campaign attribution`).toEqual(
        hrefs.map(() => expected),
      );
    }
  });
});
