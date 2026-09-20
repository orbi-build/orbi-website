// Issue #256: every shipped /cloud/login CTA carries a ?ref= token, so the
// cloud control plane can attribute the signup (tenants.source) instead of
// recording direct/NULL. orbi-cloud validates the token with REF_TOKEN
// /^[a-z0-9_-]{1,32}$/; on the website side the token rides the request URL,
// where src/worker.js withAttribution plants the shared-domain `ref` cookie
// that /api/login reads (orbi-cloud #716 fallback chain). These tests pin the
// Issue's acceptance: exact hrefs, built output, the token regex, and no
// bare link anywhere.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// The receiving side's validator, verbatim from orbi-cloud src/index.ts.
const REF_TOKEN = /^[a-z0-9_-]{1,32}$/;

// The seven CTAs the Issue names, with the exact hrefs its table assigns
// (acceptance 1: byte-exact match against the source and the built page).
const issueCtas = [
  ["site/pages/index.html", "public/index.html", 'data-cta="cloud-start" href="/cloud/login?ref=home-hero"'],
  ["site/pages/index.html", "public/index.html", 'data-cta="midway-cloud" href="/cloud/login?ref=home-video"'],
  ["site/pages/index.html", "public/index.html", 'data-cta="cloud-start-card" href="/cloud/login?ref=home-runorbi"'],
  ["site/pages/zh/index.html", "public/zh/index.html", 'data-cta="cloud-start" href="/cloud/login?ref=zh-hero"'],
  ["site/pages/zh/index.html", "public/zh/index.html", 'data-cta="midway-cloud" href="/cloud/login?ref=zh-video"'],
  ["site/pages/zh/index.html", "public/zh/index.html", 'data-cta="cloud-start-card" href="/cloud/login?ref=zh-runorbi"'],
  ["site/partials/nav.html", "public/index.html", 'class="nav-apply" href="/cloud/login?ref=nav"'],
];

// The other bare /cloud/login CTAs the site actually ships (the cloud and
// cost pages, EN and ZH). Acceptance 4 leaves no bare link, so each page's
// pair takes a page-level ref, distinct from every other value.
const siblingCtas = [
  ["site/pages/cloud/index.html", "public/cloud/index.html", 'href="/cloud/login?ref=cloud-page"'],
  ["site/pages/zh/cloud/index.html", "public/zh/cloud/index.html", 'href="/cloud/login?ref=zh-cloud-page"'],
  ["site/pages/cost/index.html", "public/cost/index.html", 'href="/cloud/login?ref=cost-page"'],
  ["site/pages/zh/cost/index.html", "public/zh/cost/index.html", 'href="/cloud/login?ref=zh-cost-page"'],
];

async function walkFiles(dir) {
  const files = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(path)));
    } else {
      files.push(path);
    }
  }
  return files.sort();
}

describe("cloud login CTA ref tokens (Issue #256)", () => {
  it("carries the Issue's seven exact ref hrefs in the source and the built page", async () => {
    for (const [source, built, href] of issueCtas) {
      const sourceHtml = await readFile(join(ROOT, source), "utf8");
      expect(sourceHtml, `${source}: missing ${href}`).toContain(href);
      const builtHtml = await readFile(join(ROOT, built), "utf8");
      expect(builtHtml, `${built}: missing ${href}`).toContain(href);
    }
  });

  it("carries the page-level ref on both cloud and cost page CTAs, source and built", async () => {
    for (const [source, built, href] of siblingCtas) {
      const sourceHtml = await readFile(join(ROOT, source), "utf8");
      expect(sourceHtml.match(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")), `${source}: expected both CTAs on ${href}`).toHaveLength(2);
      const builtHtml = await readFile(join(ROOT, built), "utf8");
      expect(builtHtml, `${built}: missing ${href}`).toContain(href);
    }
  });

  it("validates every shipped ref token against the receiving side's REF_TOKEN and keeps the Issue's seven distinct", async () => {
    const tokens = new Set();
    for (const dir of ["site", "public"]) {
      for (const file of await walkFiles(dir)) {
        const html = await readFile(join(ROOT, file), "utf8");
        // Permissive extraction: any /cloud/login?… link must carry exactly
        // one ref parameter with a valid token — a link with other params
        // and no ref would slip past the bare-link grep below.
        for (const match of html.matchAll(/href="\/cloud\/login\?([^"]*)"/g)) {
          const params = new URLSearchParams(match[1]);
          expect([...params.keys()], `${file}: /cloud/login query must be exactly one ref param`).toEqual(["ref"]);
          const token = params.get("ref");
          expect(REF_TOKEN.test(token), `${file}: ref token ${JSON.stringify(token)} fails REF_TOKEN`).toBe(true);
          tokens.add(token);
        }
      }
    }
    // Issue #262: the proof section's midway CTA sits directly under the new
    // proof-loop video, so its token became home-video/zh-video — tenants
    // carrying those values signed up from the video screen. home-proof and
    // zh-proof no longer ship.
    const seven = ["home-hero", "home-video", "home-runorbi", "zh-hero", "zh-video", "zh-runorbi", "nav"];
    expect(new Set(seven).size, "the Issue's seven ref values must be mutually distinct").toBe(7);
    for (const token of seven) {
      expect(tokens.has(token), `expected ref token ${token} to be shipped`).toBe(true);
    }
  });

  it("ships no /cloud/login link without a ref parameter", async () => {
    // Acceptance 4: `grep -r 'cloud/login"' site/` must come back empty —
    // the trailing quote matches the parameterless form only. The same scan
    // runs over public/, the bytes the Worker actually serves.
    for (const dir of ["site", "public"]) {
      for (const file of await walkFiles(dir)) {
        const html = await readFile(join(ROOT, file), "utf8");
        expect(html.includes('cloud/login"'), `${file}: bare /cloud/login link found`).toBe(false);
      }
    }
  });
});
