// Issue #273: internal Cloud login CTAs must not carry a ref token. A campaign
// ref belongs to the visitor's attribution cookie; adding a button-position
// query makes the login handoff overwrite that real channel attribution.

import { readFile } from "node:fs/promises";
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

const cloudLoginHrefs = (html) => [...html.matchAll(/href="(\/cloud\/login[^\"]*)"/g)].map((m) => m[1]);

describe("internal Cloud login CTA attribution (Issue #273)", () => {
  it("uses the bare login handoff in all 15 source CTAs", async () => {
    const html = await Promise.all(sourceFiles.map(read));
    const hrefs = html.flatMap(cloudLoginHrefs);
    expect(hrefs).toHaveLength(15);
    expect(hrefs).toEqual(hrefs.map(() => "/cloud/login"));
  });

  it("keeps the existing data-cta markers on homepage Cloud buttons", async () => {
    const [en, zh] = await Promise.all([read("site/pages/index.html"), read("site/pages/zh/index.html")]);
    for (const html of [en, zh]) {
      expect(html).toContain('data-cta="cloud-start" href="/cloud/login"');
      expect(html).toContain('data-cta="midway-cloud" href="/cloud/login"');
      expect(html).toContain('data-cta="cloud-start-card" href="/cloud/login"');
    }
  });

  it("ships only bare login handoffs in the built pages", async () => {
    const html = await Promise.all(builtFiles.map(read));
    const hrefs = html.flatMap(cloudLoginHrefs);
    expect(hrefs.length).toBeGreaterThanOrEqual(15);
    expect(hrefs).toEqual(hrefs.map(() => "/cloud/login"));
  });
});
