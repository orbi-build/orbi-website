// Issue #106 gates: the shipped pages stay in lockstep with their sources,
// and the two language trees cannot silently drift apart again.
//
// These tests read the shipped bytes in public/ — the same files the Worker
// deploys — not a fixture, so any hand edit to public/ that skips
// `npm run build` fails here (the old failure mode this issue closes).

import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPages, collectGuides, collectPosts, insertInlinePostCta, lastCommitDate, loadPages, pathToHref, postFromSource, renderLlms, validateRenderedPostBody, wrapRenderedTables } from "../scripts/build-pages.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let builtDir;
let pages;
let posts; // the posts collectPosts() derives from content/blog/**
let guides; // the guides collectGuides() derives from content/guides/**
let shipped; // output path -> bytes of public/<path>
let generatedSitemap;
let shippedSitemap;
let shippedFeed; // public/blog/feed.xml, the build-generated RSS 2.0 file
let generatedLlms; // build-generated llms.txt (Issue #215)
let shippedLlms; // public/llms.txt
let generatedLlmsFull; // build-generated llms-full.txt (Issue #438)
let shippedLlmsFull; // public/llms-full.txt
let styles;
let matrixCsv;
let pricing;

beforeAll(async () => {
  // A real build through the real entry point, never a re-implementation.
  builtDir = await mkdtemp(join(tmpdir(), "orbi-pages-"));
  execFileSync("node", [join(ROOT, "scripts", "build-pages.mjs"), "--out", builtDir], {
    timeout: 60_000,
  });
  pages = await loadPages();
  posts = await collectPosts();
  guides = await collectGuides();
  shipped = new Map();
  for (const page of pages) {
    shipped.set(page.output, await readFile(join(ROOT, "public", page.output), "utf8"));
  }
  // Posts are rendered from content/blog and guides from content/guides, not
  // from a page source, so they join the shipped map here.
  for (const post of posts) {
    shipped.set(post.output, await readFile(join(ROOT, "public", post.output), "utf8"));
  }
  for (const guide of guides) {
    shipped.set(guide.output, await readFile(join(ROOT, "public", guide.output), "utf8"));
  }
  generatedSitemap = await readFile(join(builtDir, "sitemap.xml"), "utf8");
  shippedSitemap = await readFile(join(ROOT, "public", "sitemap.xml"), "utf8");
  shippedFeed = await readFile(join(ROOT, "public", "blog", "feed.xml"), "utf8");
  generatedLlms = await readFile(join(builtDir, "llms.txt"), "utf8");
  shippedLlms = await readFile(join(ROOT, "public", "llms.txt"), "utf8");
  generatedLlmsFull = await readFile(join(builtDir, "llms-full.txt"), "utf8");
  shippedLlmsFull = await readFile(join(ROOT, "public", "llms-full.txt"), "utf8");
  styles = await readFile(join(ROOT, "public", "styles.css"), "utf8");
  matrixCsv = await readFile(join(ROOT, "public", "compare", "matrix.csv"), "utf8");
  pricing = JSON.parse(await readFile(join(ROOT, "src", "pricing.json"), "utf8"));
});

afterAll(async () => {
  if (builtDir) await rm(builtDir, { recursive: true, force: true });
});

const region = (html, startMarker, endMarker) => {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  if (start < 0 || end < 0) return "";
  return html.slice(start, end + endMarker.length);
};

const navRegion = (html) => region(html, "<nav id=", "</nav>");
const footerRegion = (html) => region(html, '<footer class="site-footer shell">', "</footer>");
const mainRegion = (html) => region(html, '<main id="main-content">', "</main>");
const countMatches = (html, re) => [...html.matchAll(re)].length;

const proofBar = (html) => region(html, '<div class="hero-proof-bar shell">', '<section class="stats');

describe("inner-page h1 line height (Issue #791)", () => {
  it("keeps wrapped shared h1 titles compact without changing the homepage hero", () => {
    expect(styles).toMatch(/h1\s*\{[^}]*line-height:\s*1\.08;/);
    expect(styles).toMatch(/\.hero\.homepage-hero h1\s*\{[^}]*line-height:\s*1\.02;/);
  });
});

describe("top navigation Docs destination (Issue #762)", () => {
  const expected = {
    en: "https://cloud-docs.orbi.build/?ref=nav",
    zh: "https://cloud-docs.orbi.build/zh/?ref=nav",
  };
  const selfHosted = {
    en: "https://docs.orbi.build",
    zh: "https://docs.orbi.build/zh",
  };

  it("uses the Cloud Docs URL for the Docs link on every generated page", () => {
    for (const [output, html] of shipped) {
      const lang = output.startsWith("zh/") || output.includes("/zh/") ? "zh" : "en";
      const docs = navRegion(html).match(/<a href="([^"]+)">(?:Docs|文档)<\/a>/g) ?? [];
      expect(docs, `${output}: exactly one Docs nav link`).toHaveLength(1);
      expect(docs[0], `${output}: Cloud Docs nav link`).toBe(`<a href="${expected[lang]}">${lang === "zh" ? "文档" : "Docs"}</a>`);
    }
  });

  it("keeps self-hosted Docs in the footer", () => {
    for (const [output, html] of shipped) {
      const lang = output.startsWith("zh/") || output.includes("/zh/") ? "zh" : "en";
      expect(footerRegion(html), `${output}: self-hosted Docs footer link`).toContain(`href="${selfHosted[lang]}"`);
    }
  });

  it("keeps both homepage self-hosted CTAs on self-hosted Docs", () => {
    expect(shipped.get("index.html")).toContain('<a class="button button-outline" data-cta="midway-install" href="https://docs.orbi.build">');
    expect(shipped.get("zh/index.html")).toContain('<a class="button button-outline" data-cta="midway-install" href="https://docs.orbi.build/zh">');
    expect(shipped.get("index.html")).toContain('data-cta="closing-selfhost" href="https://docs.orbi.build"');
    expect(shipped.get("zh/index.html")).toContain('data-cta="closing-selfhost" href="https://docs.orbi.build/zh"');
  });
});

describe("homepage section order (Issue #712)", () => {
  for (const output of ["index.html", "zh/index.html"]) {
    it(`${output} keeps the buyer journey sections adjacent and ordered`, () => {
      const html = mainRegion(shipped.get(output));
      const sectionClasses = [...html.matchAll(/<section class="([^"]+)"/g)]
        .map((match) => match[1].split(" ")[0]);
      expect(sectionClasses).toEqual([
        "hero",
        "system-section",
        "proof",
        "stats",
        "social-proof",
        "avatar-wall",
        "pricing-summary",
        "faq",
        "closing",
      ]);
      for (const removed of ["runtime-proof", "thesis", "ownership", "run-orbi", "direction"]) {
        expect(html, `${output}: ${removed} remains`).not.toContain(`class="${removed}`);
      }
    });
  }
});

describe("homepage hero proof bar (Issue #710)", () => {
  const expected = {
    "index.html": [
      '<strong data-repo="orbi" data-stat="prs" data-floor="600">0</strong><span>PRs merged by Orbi on its own repo</span>',
      '<strong data-repo="orbi" data-stat="releases" data-floor="80">0</strong><span>releases shipped</span>',
      '<strong>Open source</strong><span>AGPL-3.0, self-host free</span>',
    ],
    "zh/index.html": [
      '<strong data-repo="orbi" data-stat="prs" data-floor="600">0</strong><span>Orbi 在自己仓库合并的 PR</span>',
      '<strong data-repo="orbi" data-stat="releases" data-floor="80">0</strong><span>个版本已发布</span>',
      '<strong>开源</strong><span>AGPL-3.0，自托管免费</span>',
    ],
  };

  for (const [output, items] of Object.entries(expected)) {
    it(`${output} keeps live counters and copy in the requested order`, () => {
      const html = shipped.get(output);
      expect(html, `${output}: proof bar follows hero`).toMatch(/<section class="hero [^"]*shell"[\s\S]*?<\/section>\s*<div class="hero-proof-bar shell">/);
      const bar = proofBar(html);
      expect(bar, `${output}: proof bar`).not.toBe("");
      expect(bar.match(/<div class="hero-proof-item">[\s\S]*?<\/div>/g), output).toEqual(items.map((item) => `<div class="hero-proof-item">${item}</div>`));
    });
  }
});

const GUIDE_SLUGS = [
  "issue-to-release",
  "ci-gates",
  "auto-merge-ai-prs",
  "autonomous-coding-agent",
  "self-hosted-coding-agent",
  "codex-github-issues",
  "pi-coding-agent",
];
const MOVED_GUIDE_SLUGS = [
  "issue-to-release",
  "autonomous-coding-agent",
  "self-hosted-coding-agent",
  "codex-github-issues",
];
const COMPARISON_SLUGS = [
  "claude-code",
  "codex",
  "cursor",
  "devin",
  "github-copilot-coding-agent",
  "hermes-agent",
  "jules",
  "keelen",
  "managed-agents",
  "openclaw",
  "openhands",
  "orca",
];

const jsonLdObjects = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((match) => JSON.parse(match[1]));

const articleOf = (html) => jsonLdObjects(html).find((entry) => entry["@type"] === "Article");

const jsonLdNodes = (value) => {
  if (Array.isArray(value)) return value.flatMap(jsonLdNodes);
  if (!value || typeof value !== "object") return [];
  return [value, ...Object.values(value).flatMap(jsonLdNodes)];
};

describe("SoftwareApplication structured data (Issue #683)", () => {
  it("requires offers.price on every emitted SoftwareApplication node", () => {
    for (const [output, html] of shipped) {
      for (const object of jsonLdObjects(html)) {
        for (const node of jsonLdNodes(object).filter((entry) => {
          const types = Array.isArray(entry["@type"]) ? entry["@type"] : [entry["@type"]];
          return types.includes("SoftwareApplication");
        })) {
          expect(node.offers?.price, `${output}: SoftwareApplication offers.price`).toBeDefined();
        }
      }
    }
  });
});

describe("guide collection, breadcrumbs and related content (Issue #625)", () => {
  it("publishes both guide indexes with all seven built guide targets and SEO-length metadata", () => {
    for (const prefix of ["", "zh/"]) {
      const output = `${prefix}guides/index.html`;
      const html = shipped.get(output);
      for (const slug of GUIDE_SLUGS) {
        const target = `${prefix}guides/${slug}/index.html`;
        expect(shipped.has(target), `${output}: built target ${target}`).toBe(true);
        expect(html, `${output}: link to ${target}`).toContain(`href="/${prefix}guides/${slug}/"`);
      }
      const guideMain = mainRegion(html);
      expect(guideMain, output).not.toMatch(/\\n/);
      expect(guideMain, output).not.toContain('class="source-list"');
      expect((guideMain.match(/<article class="guide-index-entry">/g) ?? []).length, output).toBe(7);
      expect((guideMain.match(/<a class="guide-index-link"[^>]*><h2 class="guide-index-title">/g) ?? []).length, output).toBe(7);
      expect(guideMain, output).toContain('<p class="guide-index-summary">');
      expect(guideMain, output).not.toMatch(/<article[^>]*>\s*<h2>/);
      expect(html, `${output}: guide hero uses the shared content container`).toContain('class="compare-hero shell guide-index-container"');
      expect(html, `${output}: guide list uses the shared content container`).toContain('class="compare-section shell guide-index-container"');
      expect(styles, `${output}: shared guide container width`).toMatch(/\.guide-index-container\s*\{[\s\S]*?max-width:\s*68rem/);
      expect(styles, `${output}: guide list has no extra top margin`).toMatch(/\.guide-index-list\s*\{[\s\S]*?margin:\s*0\s*;/);
      const guideTitleSize = styles.match(/\.guide-index-title\s*\{[\s\S]*?font-size:\s*([^;]+)/)?.[1];
      const compareTitleSize = styles.match(/\.dive-list \.orbi-dive-list-strong\s*\{[\s\S]*?font-size:\s*([^;]+)/)?.[1];
      expect(guideTitleSize, `${output}: guide title size`).toBe(compareTitleSize);
      expect(html, output).toContain(`href="/${prefix}compare/"`);
      expect(html, output).toContain(`href="https://aiready.sh/${prefix === "zh/" ? "zh/" : ""}"`);
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
      const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? "";
      expect([...title].length, `${output}: title length`).toBeLessThanOrEqual(60);
      const [min, max] = prefix ? [70, 80] : [150, 160];
      expect([...description].length, `${output}: description length`).toBeGreaterThanOrEqual(min);
      expect([...description].length, `${output}: description length`).toBeLessThanOrEqual(max);
    }
  });

  it("uses only new guide URLs in discovery and page links, with self-consistent metadata", () => {
    expect(shippedSitemap).toContain("https://orbi.build/guides/");
    expect(shippedSitemap).toContain("https://orbi.build/zh/guides/");
    for (const prefix of ["", "zh/"]) {
      for (const slug of MOVED_GUIDE_SLUGS) {
        const oldUrl = `https://orbi.build/${prefix}${slug}/`;
        const newUrl = `https://orbi.build/${prefix}guides/${slug}/`;
        expect(shippedSitemap).not.toContain(`<loc>${oldUrl}</loc>`);
        const html = shipped.get(`${prefix}guides/${slug}/index.html`);
        expect(html).toContain(`<link rel="canonical" href="${newUrl}">`);
        expect(html).toContain(`<meta property="og:url" content="${newUrl}">`);
        expect(html).toContain('hreflang="en" href="https://orbi.build/guides/');
        expect(html).toContain('hreflang="zh-CN" href="https://orbi.build/zh/guides/');
      }
    }
    const rendered = [...shipped.values()].map((html) => html.replace(/<!--[\s\S]*?-->/g, "")).join("\n");
    const oldLink = new RegExp(`(?:href|content)=["'](?:https://orbi\\.build)?/(?:zh/)?(?:${MOVED_GUIDE_SLUGS.join("|")})/`);
    expect(rendered).not.toMatch(oldLink);
    expect(shippedSitemap).not.toMatch(new RegExp(`https://orbi\\.build/(?:zh/)?(?:${MOVED_GUIDE_SLUGS.join("|")})/`));
    expect(shippedLlms).not.toMatch(new RegExp(`https://orbi\\.build/(?:zh/)?(?:${MOVED_GUIDE_SLUGS.join("|")})/`));
  });

  it("renders one canonical BreadcrumbList and the configured related links on all 38 articles", () => {
    const articleOutputs = [];
    for (const prefix of ["", "zh/"]) {
      articleOutputs.push(...GUIDE_SLUGS.map((slug) => `${prefix}guides/${slug}/index.html`));
      articleOutputs.push(...COMPARISON_SLUGS.map((slug) => `${prefix}compare/${slug}/index.html`));
    }
    expect(articleOutputs).toHaveLength(38);
    for (const output of articleOutputs) {
      const html = shipped.get(output);
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      const breadcrumbs = jsonLdObjects(html).filter((entry) => entry["@type"] === "BreadcrumbList");
      expect(breadcrumbs, `${output}: BreadcrumbList count`).toHaveLength(1);
      const items = breadcrumbs[0].itemListElement;
      expect(items.map((item) => item.position), `${output}: breadcrumb positions`).toEqual([1, 2, 3]);
      expect(items.at(-1).item, `${output}: breadcrumb canonical`).toBe(canonical);
      const h1 = html.match(/<h1\b[^>]*>([^<]+)<\/h1>/)?.[1];
      expect(items.at(-1).name, `${output}: current-page breadcrumb name`).toBe(h1);
      const currentBreadcrumb = html.match(/<span aria-current="page" title="([^"]+)">([^<]+)<\/span>/);
      expect(currentBreadcrumb, `${output}: current breadcrumb title`).not.toBeNull();
      expect(currentBreadcrumb[1], `${output}: current breadcrumb title value`).toBe(h1);
      expect(currentBreadcrumb[2], `${output}: current breadcrumb text`).toBe(h1);
      const related = html.match(/<section class="related-links[\s\S]*?<\/section>/)?.[0] ?? "";
      const linkCount = (related.match(/<li><a href=/g) ?? []).length;
      expect(linkCount, `${output}: related link count`).toBeGreaterThanOrEqual(output.includes("guides/") ? 2 : 1);
      expect(linkCount, `${output}: related link count`).toBeLessThanOrEqual(output.includes("guides/") ? 3 : 2);
    }
  });

  it("keeps every article breadcrumb inside the dark hero and aligned with its hero container", () => {
    const articleOutputs = [];
    for (const prefix of ["", "zh/"]) {
      articleOutputs.push(...GUIDE_SLUGS.map((slug) => `${prefix}guides/${slug}/index.html`));
      articleOutputs.push(...COMPARISON_SLUGS.map((slug) => `${prefix}compare/${slug}/index.html`));
    }
    // The content-template guides carry the hero inside .guide-grid beside the
    // body column (Issue #860); every other article page keeps the hero as the
    // .compare-hero band.
    const templateGuideOutputs = new Set(guides.map((guide) => guide.output));
    for (const output of articleOutputs) {
      const html = shipped.get(output);
      const heroMarkup = templateGuideOutputs.has(output)
        ? /<div class="night">\s*<nav class="breadcrumbs compare-hero shell"[\s\S]*?<\/nav>\s*<div class="guide-grid">\s*<section class="guide-hero"/
        : /<div class="night">\s*<nav class="breadcrumbs compare-hero shell"[\s\S]*?<\/nav>\s*<section class="compare-hero shell"/;
      expect(html, `${output}: breadcrumb in hero`).toMatch(heroMarkup);
      expect(html, `${output}: breadcrumb not main child`).not.toMatch(/<main id="main-content"><nav class="breadcrumbs/);
      expect(html, `${output}: separator spacing`).toContain('> › <');
    }
    expect(styles).toMatch(/\.breadcrumbs\.compare-hero\s*\{[\s\S]*?color:\s*#b6c7c3;[\s\S]*?padding:/);
    expect(styles).toMatch(/\.breadcrumbs\.compare-hero a\s*\{[\s\S]*?text-decoration:\s*none;/);
    expect(styles).toMatch(/\.breadcrumbs\.compare-hero\s*>\s*\[aria-hidden="true"\]\s*\{[\s\S]*?margin-inline:\s*0\.(?:[3-9]|[1-9]\d+)em;/);
    expect(styles).toMatch(/\.breadcrumbs\.compare-hero a:hover\s*\{[\s\S]*?text-decoration:\s*underline;/);
    expect(styles).toMatch(/\.night:has\(\.breadcrumbs\.compare-hero\)\s*>\s*\.compare-hero:not\(\.breadcrumbs\)\s*\{[\s\S]*?padding-top:\s*32px;/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.night:has\(\.breadcrumbs\.compare-hero\)\s*>\s*\.compare-hero:not\(\.breadcrumbs\)[\s\S]*?padding-top:\s*24px;/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.breadcrumbs\.compare-hero\s*\{[\s\S]*?white-space:\s*nowrap;/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.breadcrumbs\.compare-hero[^{}]*\[aria-current="page"\][\s\S]*?text-overflow:\s*ellipsis;/);
  });
});

describe("blog title and body alignment (Issue #695)", () => {
  it("renders every post hero and body in the same blog-only layout class", () => {
    for (const post of posts) {
      const html = shipped.get(post.output);
      expect(html, `${post.output}: hero layout`).toMatch(
        /<div class="night">\s*<div class="post-grid">\s*<section class="post-hero"/,
      );
      expect(html, `${post.output}: body layout`).toMatch(
        /<div class="post-grid">\s*(?:<nav class="post-toc"[\s\S]*?<\/nav>\s*)?<article class="post-body">/,
      );
      expect(countMatches(html, /class="post-grid"/g), `${post.output}: shared layout count`).toBe(2);
      expect(html, `${post.output}: shared compare styles stay unused`).not.toContain('class="compare-hero shell" aria-labelledby="post-title"');
    }
  });

  it("renders Unicode-safe unique H2/H3 anchors and a nested TOC at the five-heading threshold", async () => {
    const tocPosts = [];
    for (const post of posts) {
      const html = shipped.get(post.output);
      const body = (html.match(/<article class="post-body">([\s\S]*?)<\/article>/)?.[1] ?? "").replace(/<aside class="post-cta">[\s\S]*?<\/aside>/, "");
      const headings = [...body.matchAll(/<h([23]) id="([^"]+)">[\s\S]*?<\/h\1>/g)];
      const ids = headings.map((match) => match[2]);
      expect(ids, `${post.output}: every H2/H3 has an id`).toHaveLength((body.match(/<h[23]\b/g) ?? []).length);
      expect(new Set(ids).size, `${post.output}: H2/H3 ids are unique`).toBe(ids.length);
      if (post.lang === "zh") {
        expect(headings.some((match) => /[\u4e00-\u9fff]/u.test(match[2])), `${post.output}: Chinese heading id`).toBe(true);
      }
      const h2Count = headings.filter((match) => match[1] === "2").length;
      const desktop = html.match(/<nav class="post-toc"[\s\S]*?<\/nav>/)?.[0] ?? "";
      const inline = html.match(/<details class="post-toc-inline">[\s\S]*?<\/details>/)?.[0] ?? "";
      const tocCount = (desktop.match(/class="post-toc-link"/g) ?? []).length;
      const inlineCount = (inline.match(/class="post-toc-link"/g) ?? []).length;
      if (ids.length >= 5) {
        tocPosts.push(post.output);
        const title = post.lang === "zh" ? "本页目录" : "On this page";
        expect(desktop, `${post.output}: desktop TOC`).not.toBe("");
        expect(desktop, `${post.output}: localized TOC label`).toContain(`aria-label="${title}"`);
        expect(desktop, `${post.output}: localized TOC title`).toContain(`<h2>${title}</h2>`);
        expect(inline, `${post.output}: inline TOC`).not.toBe("");
        expect(inline, `${post.output}: localized inline summary`).toContain(`<summary>${title} · ${h2Count} ${post.lang === "zh" ? "节" : "sections"}</summary>`);
        expect(tocCount, `${post.output}: desktop TOC count`).toBe(ids.length);
        expect(inlineCount, `${post.output}: inline TOC count`).toBe(ids.length);
        for (const id of ids) {
          expect(desktop, `${post.output}: desktop href ${id}`).toContain(`href="#${id}"`);
          expect(inline, `${post.output}: inline href ${id}`).toContain(`href="#${id}"`);
        }
        if (post.output.includes("run-claude-code-unattended")) {
          const h3 = headings.find((match) => match[1] === "3");
          expect(desktop, `${post.output}: H3 nested link ${h3[2]}`).toMatch(new RegExp(`<li>[\\s\\S]*<ol>[\\s\\S]*href="#${h3[2]}"`));
        }
      } else {
        expect(desktop, `${post.output}: no desktop TOC`).toBe("");
        expect(inline, `${post.output}: no inline TOC`).toBe("");
      }
    }
    expect(tocPosts.length).toBeGreaterThan(0);
    expect(tocPosts.some((output) => output.includes("k8e-rejected-then-merged"))).toBe(true);
  });

  it("keeps normalized H2 ids unique when a heading already uses a duplicate suffix", () => {
    const source = `---
title: T
date: 2026-09-18
summary: s
lang: en
author: Orbi
image: /img/blog-t.png
---

## A

## A

## A-2
`;
    const post = postFromSource("t.md", source);
    expect(post.headings.map(({ id }) => id)).toEqual(["a", "a-2", "a-2-2"]);
  });

  it("keeps the blog TOC layout scoped to the established two-column grid", async () => {
    const template = await readFile(join(ROOT, "site", "partials", "post.html"), "utf8");
    expect(template).toContain(".post-body h2, .post-body .related-links h2 { font-family:");
    expect(template).toMatch(/\.post-body h2, \.post-body \.related-links h2 \{[^}]*font-size: 1\.5rem;[^}]*line-height: 1\.25;[^}]*margin: 42px 0 10px;[^}]*scroll-margin-top: 24px;/);
    expect(template).toMatch(/\.post-body \.related-links \{[^}]*margin: 0;/);
    expect(template).toMatch(/\.post-toc \{[^}]*position: sticky;[^}]*top: 24px;[^}]*max-height: calc\(100vh - 48px\);[^}]*overflow-y: auto;/);
    expect(template).toMatch(/\.post-toc \{[^}]*padding-top:\s*26px;/);
    expect(template).toMatch(/\.post-toc h2 \{[^}]*font:\s*500 0\.75rem\/1\.5rem var\(--mono\);[^}]*letter-spacing:\s*0\.1em;[^}]*text-transform:\s*uppercase;/);
    expect(template).not.toContain("counter-reset");
    expect(template).not.toContain("counter-increment");
    expect(template).not.toContain("post-toc-link::before");
    expect(template).toMatch(/\.post-toc \.post-toc-link \{[^}]*font-size:\s*0\.875rem;[^}]*line-height:\s*1\.25rem;/);
    expect(template).toMatch(/\.post-toc \.post-toc-link\.is-current \{[^}]*border-left-color:\s*var\(--ink\);/);
    expect(template).toMatch(/\.post-toc ol ol \{[^}]*border-left:\s*0;/);
    expect(template).toMatch(/\.post-toc ol ol \.post-toc-link \{[^}]*padding-left:\s*27px;/);
    expect(template).toContain("{{POST_TOC}}");
    expect(template).toContain("{{INLINE_TOC}}");
    expect(template).toMatch(/\.post-body \.post-toc-inline ol \{[^}]*padding-left:\s*2\.2em;/);
  });

  it("uses the required desktop grid and one padded 52rem column below 1200px", async () => {
    const template = await readFile(join(ROOT, "site", "partials", "post.html"), "utf8");
    expect(template).toMatch(
      /\.post-grid\s*\{[^}]*max-width:\s*52rem;[^}]*margin:\s*0 auto;[^}]*padding:\s*0 24px;/,
    );
    expect(template).toMatch(
      /@media\s*\(min-width:\s*1200px\)\s*\{[\s\S]*?\.post-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 52rem\) 200px;[^}]*column-gap:\s*56px;[^}]*max-width:\s*calc\(52rem \+ 256px\);[^}]*padding:\s*0;/,
    );
    expect(template).toMatch(
      /@media\s*\(min-width:\s*1200px\)[\s\S]*?\.post-hero, \.post-body\s*\{[^}]*grid-column:\s*1;[^}]*padding-left:\s*16px;[^}]*padding-right:\s*16px;/,
    );
    expect(template).toMatch(/@media\s*\(min-width:\s*1200px\)[\s\S]*?\.post-toc\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/);
  });
});

describe("email subscription forms (Issue #665)", () => {
  it("renders exactly one form and script on every page with the shared footer", () => {
    for (const [output, html] of shipped) {
      if (!html.includes('<footer class="site-footer shell">')) continue;
      expect(countMatches(html, /data-subscribe-form/g), `${output}: form count`).toBe(1);
      expect(countMatches(html, /<script src="\/subscribe\.js" defer><\/script>/g), `${output}: script count`).toBe(1);
      expect(html.indexOf('data-subscribe-form')).toBeLessThan(html.indexOf('<footer class="site-footer shell">'));
      expect(mainRegion(html)).not.toContain("data-subscribe-form");
      const htmlLang = html.match(/<html lang="([^"]+)"/)?.[1];
      const formLang = html.match(/<input type="hidden" name="lang" value="([^"]+)"/)?.[1];
      expect(formLang, `${output}: subscription language`).toBe(htmlLang === "zh-CN" ? "zh" : "en");
      expect(html, `${output}: subscription submit button`).toContain('<button class="button button-ghost" type="submit">');
    }
    expect(styles, "subscription ghost button style").toMatch(/\.subscribe-form \.button-ghost\s*\{[^}]*background:\s*transparent;[^}]*border:\s*1px solid var\(--line\);[^}]*color:\s*var\(--ink\);[^}]*border-radius:\s*var\(--radius-control\);/);
  });

  it("keeps subscription markup in one source partial", async () => {
    const sources = await Promise.all([
      ...pages.map((page) => readFile(join(ROOT, "site", "pages", page.source), "utf8")),
      readFile(join(ROOT, "site", "partials", "post.html"), "utf8"),
    ]);
    expect(sources.join("\n")).not.toMatch(/subscribe-form|subscribe-box/);
    expect(await readFile(join(ROOT, "site", "partials", "subscribe.html"), "utf8")).toMatch(/subscribe-form|subscribe-box/);
  });
});

describe("ai-ready methodology pages (Issue #195)", () => {
  it("renders both language pages with metadata and twelve factor headings", () => {
    for (const output of ["aiready/index.html", "aiready/zh/index.html"]) {
      const html = shipped.get(output);
      expect(html).toContain('<link rel="canonical" href="https://aiready.sh/');
      expect(html).toContain('hreflang="en"');
      expect(html).toContain('hreflang="zh-CN"');
      expect(html).toContain('"@type":"Article"');
      expect(html).toContain('"@type":"FAQPage"');
      expect([...html.matchAll(/<h3>/g)]).toHaveLength(12);
    }
  });

  // Issue #888: both aiready pages live on aiready.sh (their canonical), so
  // every hreflang alternate — x-default included — points there too, never
  // back at orbi.build or at the page itself.
  it("points every aiready hreflang alternate at aiready.sh (Issue #888)", () => {
    for (const output of ["aiready/index.html", "aiready/zh/index.html"]) {
      const alternates = [...shipped.get(output).matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)]
        .map(([, lang, href]) => [lang, href]);
      expect(alternates, `${output}: hreflang alternates`).toEqual([
        ["en", "https://aiready.sh/"],
        ["zh-CN", "https://aiready.sh/zh/"],
        ["x-default", "https://aiready.sh/"],
      ]);
    }
  });

  it("keeps the Cloudflare Web Analytics beacon on every page whose source ships one (Issue #608)", async () => {
    // The beacon is not site-wide: standalone pages (aiready.sh) and pages
    // like privacy never carried one, so presence is pinned per source, not
    // globally. The third-party tracking script is gone everywhere; the exact
    // external script host set is pinned in tests/test_landing.py.
    for (const page of pages) {
      const source = await readFile(join(ROOT, "site", "pages", page.source), "utf8");
      if (!source.includes("static.cloudflareinsights.com/beacon.min.js")) continue;
      expect(shipped.get(page.output), page.output).toContain("static.cloudflareinsights.com/beacon.min.js");
    }
  });

  it("includes the requested ai-ready cross-links", () => {
    for (const page of pages) {
      if (page.output.includes("compare/") || ["index.html", "zh/index.html", "guides/ci-gates/index.html", "zh/guides/ci-gates/index.html"].includes(page.output)) {
        expect(shipped.get(page.output)).toContain("https://aiready.sh/");
      }
    }
  });
});

describe("comparison capability matrix (Issue #201)", () => {
  it("keeps the HTML table and downloadable CSV row and column sets identical", () => {
    const html = shipped.get("compare/index.html");
    const table = html.match(/<table class="compare-table[^\"]*capability-matrix[^\"]*">([\s\S]*?)<\/table>/)?.[1];
    const headers = [...table.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((match) => match[1]);
    const rows = [...table.matchAll(/<tr data-product="([^"]+)">([\s\S]*?)<\/tr>/g)].map((match) => [
      match[1],
      [...match[2].matchAll(/<td[^>]*><a [^>]+>([^<]+)<\/a><\/td>/g)].map((cell) => cell[1]),
    ]);
    const csv = matrixCsv.trim().split("\n").map((line) => line.split(","));
    expect(headers).toEqual(csv[0].slice(0, -2));
    expect(rows).toEqual(csv.slice(1).map((row) => [row[0], row.slice(1, -2)]));
  });

  it("links every capability cell to its dated source", () => {
    for (const html of [shipped.get("compare/index.html"), shipped.get("zh/compare/index.html")]) {
      const table = html.match(/<table class="compare-table[^\"]*capability-matrix[^\"]*">([\s\S]*?)<\/table>/)?.[1];
      for (const row of table.matchAll(/<tr data-product="[^"]+">([\s\S]*?)<\/tr>/g)) {
        for (const cell of row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)) expect(cell[1]).toMatch(/<a href="https?:\/\//);
      }
    }
  });

  // Issue #888: the sitemap lists indexable HTML pages only. The CSV is a
  // downloadable asset, not a page — it stays out of the sitemap while the
  // compare page keeps linking it.
  it("keeps the CSV asset out of the sitemap while the compare page links it", () => {
    expect(shippedSitemap).not.toContain("https://orbi.build/compare/matrix.csv");
    for (const output of ["compare/index.html", "zh/compare/index.html"]) {
      expect(shipped.get(output), `${output}: CSV download link`).toContain('href="/compare/matrix.csv"');
    }
  });
});


// Issue #870: /compare/codex/ targets the "codex alternatives" query. The EN
// page carries the term in its title and h1 (keeping the Orbi-vs comparison
// intent), gains a #codex-alternatives section that links the six existing
// comparison pages, and dates every newly cited source; the /compare/ overview
// points its Codex row at that section. The Issue scopes this to English pages,
// so the ZH mirror is deliberately untouched.
describe("Codex alternatives (Issue #870)", () => {
  const alternatives = [
    "/compare/claude-code/",
    "/compare/jules/",
    "/compare/github-copilot-coding-agent/",
    "/compare/openhands/",
    "/compare/devin/",
    "/compare/cursor/",
  ];
  const newSources = [
    "https://code.claude.com/docs/en/github-actions",
    "https://jules.google/docs/running-tasks/",
    "https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent",
    "https://github.com/All-Hands-AI/OpenHands",
    "https://docs.openhands.dev/openhands/usage",
    "https://docs.devin.ai/get-started/devin-intro",
    "https://cursor.com/docs/cloud-agent",
  ];

  it("carries 'Codex alternatives' in the title and h1 without losing the comparison", () => {
    const html = shipped.get("compare/codex/index.html");
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
    const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
    expect(title, "title must carry the search term").toContain("Codex alternatives");
    expect(title, "title must keep the comparison intent").toContain("Orbi vs");
    expect(h1, "h1 must carry the search term").toContain("Codex alternatives");
    expect(h1, "h1 must keep the comparison intent").toContain("Orbi vs");
  });

  it("anchors the alternatives section and links the six comparison pages", () => {
    const html = shipped.get("compare/codex/index.html");
    const start = html.indexOf('id="codex-alternatives"');
    expect(start, "missing the #codex-alternatives h2").toBeGreaterThan(-1);
    expect(html.slice(start - 60, start)).toContain("<h2");
    const section = html.slice(start, html.indexOf("</section>", start));
    const hrefs = [...section.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    for (const href of alternatives) {
      expect(hrefs, `${href} must be linked from the alternatives section`).toContain(href);
    }
  });

  it("lists every newly cited source in 'Sources and verification dates' with a date", () => {
    const html = shipped.get("compare/codex/index.html");
    const list = html.match(/<ul class="source-list">([\s\S]*?)<\/ul>/)?.[1] ?? "";
    const items = list.split('<li class="orbi-source-list-li">').slice(1).map((chunk) => chunk.split("</li>")[0]);
    for (const href of newSources) {
      const item = items.find((chunk) => chunk.includes(href));
      expect(item, `${href} must appear in Sources and verification dates`).toBeTruthy();
      expect(item, `${href}: source must carry a verification date`).toMatch(/class="source-date">[^<]*verified 20\d\d-\d\d-\d\d/);
    }
  });

  it("points the /compare/ Codex row at the alternatives section", () => {
    expect(shipped.get("compare/index.html")).toContain(
      '<a href="/compare/codex/#codex-alternatives">Codex alternatives</a>',
    );
  });
});

// Issue #869: /compare/claude-code/ targets the "claude code alternatives"
// query while keeping the Orbi-vs-Claude-Code comparison. The EN page carries
// both phrases in its title, gains a #claude-code-alternatives section that
// names the seven terminal/IDE agents (Pi links its guide) and links the three
// Orbi-wraps-Claude-Code comparisons, dates every newly cited source, and the
// /compare/ overview points its Claude Code row at that section. The Issue
// scopes this to English pages, so the ZH mirror is deliberately untouched.
describe("Claude Code alternatives (Issue #869)", () => {
  const tools = ["Codex CLI", "Cursor", "Aider", "Cline", "OpenCode", "Gemini CLI", "Pi"];
  const sectionLinks = [
    "/guides/pi-coding-agent/",
    "/compare/codex/",
    "/compare/openhands/",
    "/compare/github-copilot-coding-agent/",
  ];
  const newSources = [
    "https://developers.openai.com/codex/cli/",
    "https://cursor.com/docs/agent/overview",
    "https://aider.chat/docs/",
    "https://docs.cline.bot/cline-overview",
    "https://opencode.ai/docs/",
    "https://github.com/google-gemini/gemini-cli",
    "https://pi.dev/",
  ];

  it("carries 'Claude Code alternatives' in the title without losing the comparison", () => {
    const html = shipped.get("compare/claude-code/index.html");
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
    expect(title, "title must carry the search term").toContain("Claude Code alternatives");
    expect(title, "title must keep the comparison intent").toContain("Orbi vs Claude Code");
  });

  it("anchors the alternatives section, names the seven tools and links the four targets", () => {
    const html = shipped.get("compare/claude-code/index.html");
    const start = html.indexOf('id="claude-code-alternatives"');
    expect(start, "missing the #claude-code-alternatives h2").toBeGreaterThan(-1);
    expect(html.slice(start - 60, start)).toContain("<h2");
    const section = html.slice(start, html.indexOf("</section>", start));
    for (const tool of tools) {
      expect(section, `${tool} must be named in the alternatives section`).toContain(`>${tool}</strong>`);
    }
    const hrefs = [...section.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    for (const href of sectionLinks) {
      expect(hrefs, `${href} must be linked from the alternatives section`).toContain(href);
    }
    expect(section, "the section must say Orbi is open source").toMatch(/open source/i);
  });

  it("lists every newly cited source in 'Sources and verification dates' with a date", () => {
    const html = shipped.get("compare/claude-code/index.html");
    const list = html.match(/<ul class="source-list">([\s\S]*?)<\/ul>/)?.[1] ?? "";
    const items = list.split('<li class="orbi-source-list-li">').slice(1).map((chunk) => chunk.split("</li>")[0]);
    for (const href of newSources) {
      const item = items.find((chunk) => chunk.includes(href));
      expect(item, `${href} must appear in Sources and verification dates`).toBeTruthy();
      expect(item, `${href}: source must carry a verification date`).toMatch(/class="source-date">[^<]*verified 20\d\d-\d\d-\d\d/);
    }
  });

  it("points the /compare/ Claude Code row at the alternatives section", () => {
    expect(shipped.get("compare/index.html")).toContain(
      '<a href="/compare/claude-code/#claude-code-alternatives">Claude Code alternatives</a>',
    );
  });
});

// Issue #907: /compare/github-copilot-coding-agent/ targets the "github
// copilot alternatives" query. The EN page carries the term in its title
// while keeping the Orbi-vs-Copilot comparison h1, gains a
// #github-copilot-alternatives section naming four IDE-side swaps and Orbi
// (linking three comparison pages), dates every newly cited source, and the
// /compare/ capability matrix points its Copilot row at that section. The
// Issue scopes this to English pages, so the ZH mirror is deliberately
// untouched.
//
// The maintainer's content-quality gate (2026-10-08) adds three demands on
// the same section: a comparison table as its figure, Orbi's own public
// delivery record as first-hand material, and no template copy — its 8-gram
// overlap with the other comparison pages stays under 10%.
describe("GitHub Copilot alternatives (Issue #907)", () => {
  const editorTools = ["Cursor", "Windsurf", "Cline", "Tabnine"];
  const sectionLinks = ["/compare/claude-code/", "/compare/codex/", "/compare/openhands/"];
  const newSources = [
    "https://cursor.com/docs/agent/overview",
    "https://docs.devin.ai/desktop/devin-desktop-faq",
    "https://docs.cline.bot/cline-overview",
    "https://docs.tabnine.com/main",
  ];
  const page = () => shipped.get("compare/github-copilot-coding-agent/index.html");
  const alternativesSection = (html) => {
    const start = html.indexOf('id="github-copilot-alternatives"');
    return start < 0 ? "" : html.slice(start, html.indexOf("</section>", start));
  };
  const words = (html) =>
    (html.replace(/<[^>]+>/g, " ").replace(/&#?\w+;/g, " ").toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const eightGrams = (list) => {
    const grams = new Set();
    for (let i = 0; i + 8 <= list.length; i += 1) grams.add(list.slice(i, i + 8).join(" "));
    return grams;
  };

  it("carries 'GitHub Copilot alternatives' in the title without losing the comparison", () => {
    const html = page();
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
    const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
    expect(title, "title must carry the search term").toContain("GitHub Copilot alternatives");
    expect(title, "title must keep the comparison intent").toContain("Orbi vs");
    expect([...title].length, "title must stay within the search-result limit").toBeLessThanOrEqual(60);
    expect(h1, "h1 must not change").toBe("Orbi vs GitHub Copilot cloud agent");
  });

  it("anchors the alternatives section, names the editor tools and Orbi, and links the three comparisons", () => {
    const html = page();
    const start = html.indexOf('id="github-copilot-alternatives"');
    expect(start, "missing the #github-copilot-alternatives h2").toBeGreaterThan(-1);
    expect(html.slice(start - 60, start)).toContain("<h2");
    const section = alternativesSection(html);
    for (const tool of editorTools) {
      expect(section, tool + " must be named in the alternatives section").toContain(">" + tool);
    }
    expect(section, "Windsurf's rename to Devin Desktop must be stated").toContain("Devin Desktop");
    const hrefs = [...section.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    for (const href of sectionLinks) {
      expect(hrefs, href + " must be linked from the alternatives section").toContain(href);
    }
  });

  it("lists every newly cited source in the Sources section with a date", () => {
    const html = page();
    const list = html.match(/<ul class="source-list">([\s\S]*?)<\/ul>/)?.[1] ?? "";
    const items = list.split('<li class="orbi-source-list-li">').slice(1).map((chunk) => chunk.split("</li>")[0]);
    for (const href of newSources) {
      const item = items.find((chunk) => chunk.includes(href));
      expect(item, href + " must appear in Sources").toBeTruthy();
      expect(item, href + ": source must carry a verification date").toMatch(/class="source-date">[^<]*verified 20\d\d-\d\d-\d\d/);
    }
  });

  it("points the /compare/ Copilot capability-matrix row at the alternatives section", () => {
    expect(shipped.get("compare/index.html")).toContain(
      '<a href="/compare/github-copilot-coding-agent/#github-copilot-alternatives">GitHub Copilot alternatives</a>',
    );
  });

  it("carries a comparison table as its figure", () => {
    const section = alternativesSection(page());
    expect(section, "the alternatives section must carry a comparison table").toContain('<table class="compare-table');
    const rows = section.match(/<tr>/g) ?? [];
    expect(rows.length, "one header row plus one row per editor tool").toBeGreaterThanOrEqual(5);
  });

  it("cites Orbi's own public delivery record as first-hand material", () => {
    const section = alternativesSection(page());
    expect(section, "a real orbi-build delivery record must be linked").toMatch(/github\.com\/orbi-build\/orbi-website\/pull\/\d+/);
    expect(section, "the evidence page must be linked").toContain('href="/evidence/"');
  });

  it("keeps 8-gram overlap with the other comparison pages under 10%", () => {
    // The gate is measured against the other comparison pages' body text, not
    // only their alternatives sections (Issue #907's wording).
    const mine = [...eightGrams(words(alternativesSection(page())))];
    expect(mine.length, "the section must be long enough to measure").toBeGreaterThan(40);
    for (const output of shipped.keys()) {
      if (output === "compare/github-copilot-coding-agent/index.html") continue;
      if (!/^(zh\/)?compare\/[^/]+\/index\.html$/.test(output)) continue;
      const theirs = eightGrams(words(shipped.get(output)));
      const shared = mine.filter((gram) => theirs.has(gram));
      const ratio = shared.length / mine.length;
      expect(
        ratio,
        output + " shares " + (ratio * 100).toFixed(1) + "% of the 8-grams, e.g. " + shared.slice(0, 2).join(" / "),
      ).toBeLessThan(0.1);
    }
  });
});

// Issue #908: /compare/devin/ answers the "devin vs claude code" query with a
// dedicated section while keeping the page's "open-source Devin alternative"
// title and H1, and /compare/claude-code/ links into that section from its
// "finish the delivery line" paragraph. The Issue scopes this to English
// pages, so the ZH mirrors are deliberately untouched.
describe("Devin vs Claude Code section (Issue #908)", () => {
  const newSources = [
    "https://code.claude.com/docs/en/overview",
    "https://code.claude.com/docs/en/costs",
  ];

  it("keeps the Devin title and H1 while naming the comparison in the description", () => {
    const html = shipped.get("compare/devin/index.html");
    expect(html).toContain("<title>Open-source Devin alternative, self-hosted | Orbi</title>");
    expect(html).toContain('<h1 id="compare-title">Open-source Devin alternative: Orbi vs Devin</h1>');
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? "";
    expect(description, "description must name the comparison").toContain("Devin vs Claude Code");
    expect([...description].length, "description is " + [...description].length + " chars").toBeLessThanOrEqual(155);
  });

  it("anchors a #devin-vs-claude-code section that links the Claude Code comparison", () => {
    const html = shipped.get("compare/devin/index.html");
    const start = html.indexOf('id="devin-vs-claude-code"');
    expect(start, "missing the #devin-vs-claude-code h2").toBeGreaterThan(-1);
    expect(html.slice(start - 60, start)).toContain("<h2");
    const section = html.slice(start, html.indexOf("</section>", start));
    expect(section, "the section must link /compare/claude-code/").toContain('href="/compare/claude-code/"');
  });

  it("lists every newly cited source in 'Sources and verification dates' with a date", () => {
    const list = shipped.get("compare/devin/index.html").match(/<ul class="source-list">([\s\S]*?)<\/ul>/)?.[1] ?? "";
    const items = list.split('<li class="orbi-source-list-li">').slice(1).map((chunk) => chunk.split("</li>")[0]);
    for (const href of newSources) {
      const item = items.find((chunk) => chunk.includes(href));
      expect(item, href + " must appear in Sources and verification dates").toBeTruthy();
      expect(item, href + ": source must carry a verification date").toMatch(/class="source-date">[^<]*verified 20\d\d-\d\d-\d\d/);
    }
  });

  it("links the new section from the Claude Code delivery-line paragraph, not the terminal list", () => {
    const html = shipped.get("compare/claude-code/index.html");
    const sectionStart = html.indexOf('id="claude-code-alternatives"');
    const deliveryLine = html.indexOf("IF YOU WANT CLAUDE CODE TO FINISH THE DELIVERY LINE");
    expect(deliveryLine, "missing the delivery-line paragraph").toBeGreaterThan(sectionStart);
    const delivery = html.slice(deliveryLine, html.indexOf("</section>", deliveryLine));
    expect(delivery, "the delivery-line paragraph must link the Devin section").toContain('href="/compare/devin/#devin-vs-claude-code"');
    expect(html.slice(sectionStart, deliveryLine), "the link must not sit in the terminal/IDE list").not.toContain("/compare/devin/#devin-vs-claude-code");
  });

  it("carries first-hand Orbi material, not only a description", () => {
    const html = shipped.get("compare/devin/index.html");
    const start = html.indexOf('id="devin-vs-claude-code"');
    const section = html.slice(start, html.indexOf("</section>", start));
    const hrefs = [...section.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    const firstHand = hrefs.filter(
      (href) => /^https:\/\/github\.com\/orbi-build\/orbi\/(issues|pull)\/\d+$/.test(href) || href.startsWith("/proof/") || href === "/evidence/",
    );
    expect(firstHand, "a real delivery to link: " + hrefs.join(", ")).not.toHaveLength(0);
  });

  it("shares under 10% of its 8-grams with the other comparison pages", () => {
    // The content-quality gate forbids shipping this section as a copy of the
    // sibling alternatives sections. Compare the section's word 8-grams against
    // every other /compare/ page's body text, English and Chinese.
    const gramsOf = (list, size) => {
      const grams = new Set();
      for (let index = 0; index + size <= list.length; index += 1) {
        grams.add(list.slice(index, index + size).join(" "));
      }
      return grams;
    };
    const wordsOf = (html) =>
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&(?:nbsp|mdash|ndash|amp|#39|rsquo|quot);/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase()
        .trim()
        .split(" ")
        .filter(Boolean);

    const devin = shipped.get("compare/devin/index.html");
    const start = devin.indexOf('id="devin-vs-claude-code"');
    const mine = gramsOf(wordsOf(devin.slice(start, devin.indexOf("</section>", start))), 8);
    expect(mine.size, "the section must be long enough for an 8-gram comparison").toBeGreaterThan(50);

    for (const output of shipped.keys()) {
      if (output === "compare/devin/index.html") continue;
      if (!/^(zh\/)?compare\/[^/]+\/index\.html$/.test(output)) continue;
      const theirs = gramsOf(wordsOf(shipped.get(output)), 8);
      const shared = [...mine].filter((gram) => theirs.has(gram));
      const ratio = shared.length / mine.size;
      expect(
        ratio,
        output + " shares " + (ratio * 100).toFixed(1) + "% of the 8-grams, e.g. " + shared.slice(0, 2).join(" / "),
      ).toBeLessThan(0.1);
    }
  });
});

describe("SEO metadata is descriptive (Issue #405, #413)", () => {
  it("keeps exactly one H1 on every sitemap HTML page", () => {
    const violations = [];
    const sitemapOutputs = [...shippedSitemap.matchAll(/<loc>https:\/\/orbi\.build(\/[^<]*)<\/loc>/g)]
      .map((match) => match[1])
      .map((urlPath) => urlPath.endsWith("/")
        ? `${urlPath.slice(1)}index.html`
        : (urlPath.endsWith(".html") ? urlPath.slice(1) : null))
      .filter(Boolean);

    for (const output of sitemapOutputs) {
      const route = `/${output.replace(/index\.html$/, "")}`;
      const html = shipped.get(output);
      if (html === undefined) {
        violations.push(`${route} HTML output missing (maximum missing pages: 0)`);
        continue;
      }
      // Comments can contain examples of headings; they are not part of the
      // rendered document.
      const rendered = html.replace(/<!--[\s\S]*?-->/g, "");
      const h1Count = (rendered.match(/<h1\b/gi) || []).length;
      if (h1Count !== 1) violations.push(`${route} h1 count ${h1Count}, expected exactly 1`);
    }

    expect(violations, `heading violations:\n${violations.join("\n")}`).toEqual([]);
  });

  it("requires social sharing metadata on every sitemap HTML page", () => {
    const missing = [];
    const sitemapOutputs = [...shippedSitemap.matchAll(/<loc>https:\/\/orbi\.build(\/[^<]*)<\/loc>/g)]
      .map((match) => match[1])
      .map((urlPath) => urlPath.endsWith("/")
        ? `${urlPath.slice(1)}index.html`
        : (urlPath.endsWith(".html") ? urlPath.slice(1) : null))
      .filter(Boolean);

    for (const output of sitemapOutputs) {
      const html = shipped.get(output);
      const rendered = html?.replace(/<!--[\s\S]*?-->/g, "") ?? "";
      for (const contract of [
        /<meta\s+property=["']og:title["'][^>]*>/i,
        /<meta\s+property=["']og:image["'][^>]*>/i,
        /<meta\s+name=["']twitter:card["'][^>]*>/i,
      ]) {
        if (!contract.test(rendered)) missing.push(`${output}: ${contract.source}`);
      }
    }

    expect(missing, `Missing social sharing metadata:\n${missing.join("\n")}`).toEqual([]);
  });

  it("requires every local Open Graph PNG to be 1200×630 (Issue #502)", async () => {
    const violations = [];

    for (const [output, html] of shipped) {
      if (!output.endsWith(".html")) continue;
      const imageUrl = html.match(/<meta\s+property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const image = imageUrl?.startsWith("http") ? new URL(imageUrl).pathname : imageUrl;
      if (!image?.startsWith("/img/") || !image.endsWith(".png")) {
        violations.push(`${output}: og:image is not a local PNG (${imageUrl ?? "missing"})`);
        continue;
      }
      const png = await readFile(join(ROOT, "public", image.slice(1)));
      const validPng = png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const width = validPng ? png.readUInt32BE(16) : 0;
      const height = validPng ? png.readUInt32BE(20) : 0;
      if (!validPng || width !== 1200 || height !== 630) {
        violations.push(`${output}: ${image} is ${width}×${height}, expected 1200×630`);
      }
    }

    expect(violations, `Invalid Open Graph images:\n${violations.join("\n")}`).toEqual([]);
  });
});

describe("public link safety (Issue #500)", () => {
  it("does not ship links to the private orbi-cloud repository", () => {
    for (const [output, html] of shipped) {
      if (output.endsWith(".html")) {
        expect(html, output).not.toContain("github.com/orbi-build/orbi-cloud");
      }
    }
  });
});

describe("auto-merge AI PR guide (Issue #459)", () => {
  it("renders mutual language mirrors and CI-gates cross-links", () => {
    const en = shipped.get("guides/auto-merge-ai-prs/index.html");
    const zh = shipped.get("zh/guides/auto-merge-ai-prs/index.html");
    expect(en).toContain('<link rel="alternate" hreflang="en" href="https://orbi.build/guides/auto-merge-ai-prs/">');
    expect(en).toContain('<link rel="alternate" hreflang="zh-CN" href="https://orbi.build/zh/guides/auto-merge-ai-prs/">');
    expect(zh).toContain('<link rel="alternate" hreflang="en" href="https://orbi.build/guides/auto-merge-ai-prs/">');
    expect(zh).toContain('<link rel="alternate" hreflang="zh-CN" href="https://orbi.build/zh/guides/auto-merge-ai-prs/">');
    expect(shipped.get("guides/ci-gates/index.html")).toContain('href="/guides/auto-merge-ai-prs/"');
    expect(shipped.get("zh/guides/ci-gates/index.html")).toContain('href="/zh/guides/auto-merge-ai-prs/"');
  });
});

describe("Issue #438 wording and internal-link contracts", () => {
  it("uses the current AGPL/SUL wording everywhere", () => {
    expect(shippedLlms).toContain("AGPL-3.0");
    expect(shippedLlms).toContain("Sustainable Use License");
  });

  it("links cost and the CI gates guide from both homepages", () => {
    for (const [output, prefix] of [["index.html", ""], ["zh/index.html", "/zh"]]) {
      const html = shipped.get(output);
      expect(html, `${output}: cost link`).toContain(`href="${prefix}/cost/"`);
      expect(html, `${output}: CI gates link`).toContain(`href="${prefix}/guides/ci-gates/"`);
    }
  });

  it("ends every blog body with two or three contextual links", () => {
    for (const post of posts) {
      const html = shipped.get(post.output);
      const relatedStart = Math.max(html.lastIndexOf("<h2 id=\"related\">Related</h2>"), html.lastIndexOf("<h2 id=\"相关\">相关</h2>"));
      const related = html.slice(relatedStart, html.indexOf("</main>", relatedStart));
      const prefix = post.lang === "zh" ? "/zh" : "";
      const links = [...related.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
      if (post.slug === "deepseek-coding-agent-cost-per-merged-pr") {
        expect(links, `${post.output}: DeepSeek related links`).toEqual([
          `${prefix}/cost/`, `${prefix}/cloud/`, `${prefix}/guides/auto-merge-ai-prs/`,
        ]);
        continue;
      }
      const contextual = links.filter((href) => href.startsWith(`${prefix}/compare/`) || href === `${prefix}/cloud/`);
      expect(contextual.length, `${post.output}: related links`).toBeGreaterThanOrEqual(2);
      expect(contextual.length, `${post.output}: related links`).toBeLessThanOrEqual(3);
      expect(contextual.some((href) => href.startsWith(`${prefix}/compare/`)), `${post.output}: compare link`).toBe(true);
      expect(contextual, `${post.output}: Cloud link`).toContain(`${prefix}/cloud/`);
    }
  });
});

// Issue #527: the ZH managed-agents page shipped whole English blocks Orbi
// itself wrote — the differences table (header, six row labels, both columns),
// three src-notes, the thesis punch, the source-list descriptions and their
// verified tags, and the closing paragraph. Everything Orbi wrote must read
// Chinese; English survives only as <code>, link text, 「」 quotations, product
// names, prices, and external link titles. On the unfixed beta build this
// probe hits 15 English runs of 5+ words; after the fix it must hit none.
describe("zh managed-agents page has no untranslated Orbi copy (Issue #527)", () => {
  // Element boundaries cut text runs; <code>, <a> text and 「」 quotes are
  // exempt; then the Issue's 5-consecutive-English-words regex decides.
  const englishRuns = (html) => {
    const text = html
      .slice(html.indexOf('<main id="main-content">'), html.indexOf("</main>"))
      .replace(/<code[\s\S]*?<\/code>/gi, "\n")
      .replace(/<a[\s\S]*?<\/a>/gi, "\n")
      .replace(/「[^」]*」/g, " ")
      .replace(/<[^>]+>/g, "\n");
    const runs = [];
    for (const line of text.split("\n")) {
      for (const match of line.replace(/\s+/g, " ").trim().matchAll(/(?:[A-Za-z][A-Za-z'’,.;:()/$0-9-]*[ \t]+){5,}/g)) {
        runs.push(match[0].trim());
      }
    }
    return runs;
  };

  it("keeps runs of 5+ English words out of the ZH main text", () => {
    const runs = englishRuns(shipped.get("zh/compare/managed-agents/index.html"));
    expect(runs, `untranslated English runs: ${JSON.stringify(runs, null, 2)}`).toEqual([]);
  });

  it("keeps the comparison table shaped like the EN page", () => {
    const tableOf = (html) => html.match(/<table class="compare-table">([\s\S]*?)<\/table>/)?.[1] ?? "";
    const en = tableOf(shipped.get("compare/managed-agents/index.html"));
    const zh = tableOf(shipped.get("zh/compare/managed-agents/index.html"));
    const shape = (table) =>
      table.split("<tr>").slice(1).map((row) => (row.match(/<(?:th|td)[^>]*>/g) ?? []).length);
    const hrefs = (table) => [...table.matchAll(/href="([^"]+)"/g)].map((match) => match[1]).sort();
    expect(shape(zh), "ZH table rows/columns drifted from EN").toEqual(shape(en));
    expect(hrefs(zh), "ZH table links drifted from EN").toEqual(hrefs(en));
  });
});

describe("build output is committed (npm run build ran)", () => {
  it("produces exactly the files that exist under public/", async () => {
    const listFiles = async (dir, prefix = "") => {
      const out = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) out.push(...(await listFiles(join(dir, entry.name), `${prefix}${entry.name}/`)));
        else out.push(`${prefix}${entry.name}`);
      }
      return out.sort();
    };
    // The build owns the HTML, sitemap, blog feed and llms.txt; public/ also
    // carries assets (styles.css, img/, …) that no page source generates.
    const generatedTextAssets = new Set(["llms.txt", "llms-full.txt"]);
    const built = (await listFiles(builtDir)).filter((f) => f.endsWith(".html") || f.endsWith(".xml") || generatedTextAssets.has(f));
    const committed = (await listFiles(join(ROOT, "public"))).filter((f) => f.endsWith(".html") || f.endsWith(".xml") || generatedTextAssets.has(f));
    expect(built).toEqual(committed);
  });

  it("reproduces every committed page byte-for-byte", async () => {
    const drifted = [];
    for (const page of pages) {
      const built = await readFile(join(builtDir, page.output), "utf8");
      if (built !== shipped.get(page.output)) drifted.push(page.output);
    }
    // Posts have no page source; their rendered output must reproduce from the
    // committed content/blog/** the same way, or a body edit without a rebuild
    // would ship stale. llms.txt is generated too (Issue #215): a hand edit to
    // public/llms.txt that skips the build fails here.
    for (const post of posts) {
      const built = await readFile(join(builtDir, post.output), "utf8");
      if (built !== shipped.get(post.output)) drifted.push(post.output);
    }
    for (const guide of guides) {
      const built = await readFile(join(builtDir, guide.output), "utf8");
      if (built !== shipped.get(guide.output)) drifted.push(guide.output);
    }
    if (generatedLlms !== shippedLlms) drifted.push("llms.txt");
    if (generatedLlmsFull !== shippedLlmsFull) drifted.push("llms-full.txt");
    expect(
      drifted,
      `public/ disagrees with site/ — run npm run build after editing site/** or content/** (drifted: ${drifted.join(", ")})`,
    ).toEqual([]);
  });

  it("generates a sitemap for every orbi.build page with git lastmod dates", () => {
    // Issue #888: a page is listed only when it is indexable HTML at its own
    // orbi.build URL — its canonical. The two aiready pages canonically live
    // on aiready.sh and /compare/matrix.csv is not a page, so none of the
    // three is listed.
    const pagesForSitemap = pages.filter((page) =>
      page.body.includes(`<link rel="canonical" href="https://orbi.build${pathToHref(page.output)}">`),
    );
    expect(generatedSitemap).toBe(shippedSitemap);
    expect([...generatedSitemap.matchAll(/<url>/g)]).toHaveLength(pagesForSitemap.length + posts.length + guides.length);
    expect(new Set([...generatedSitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1])).size)
      .toBeGreaterThanOrEqual(2);

    const source = "site/pages/zh/cloud/index.html";
    // Same basis as the build's lastCommitDate: the commit epoch, rendered to
    // the UTC day.
    const epoch = execFileSync("git", ["log", "-1", "--format=%ct", "--", source], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--", source], { cwd: ROOT, encoding: "utf8" }).trim();
    const expectedDate = dirty ? new Date().toISOString().slice(0, 10) : new Date(Number(epoch) * 1000).toISOString().slice(0, 10);
    const cloudUrl = generatedSitemap.match(/<loc>https:\/\/orbi\.build\/zh\/cloud\/<\/loc>([\s\S]*?)<\/url>/)?.[1];
    expect(cloudUrl).toContain(`<lastmod>${expectedDate}</lastmod>`);
  });

  // Issue #888: every URL in the sitemap must be an indexable HTML page that
  // declares itself canonical. A URL that is not HTML (the CSV) or whose
  // canonical points at another host (the two aiready pages, canonical
  // aiready.sh) has no business in the sitemap — GSC reports exactly that as
  // "Discovered — currently not indexed".
  it("lists only HTML pages whose canonical is the listed URL", () => {
    const locs = [...shippedSitemap.matchAll(/<loc>https:\/\/orbi\.build(\/[^<]*)<\/loc>/g)].map((match) => match[1]);
    expect(locs.length).toBeGreaterThan(0);
    const failures = [];
    for (const href of locs) {
      const output = href === "/" ? "index.html" : `${href.slice(1)}index.html`;
      const html = shipped.get(output);
      if (!html) {
        failures.push(`${href}: no HTML build output at ${output}`);
        continue;
      }
      if (!/^<!DOCTYPE html>/i.test(html.trimStart())) failures.push(`${href}: build output is not HTML`);
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      if (canonical !== `https://orbi.build${href}`) failures.push(`${href}: canonical is ${canonical ?? "missing"}`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  // Issue #279: the build runs before the commit, so a source with
  // uncommitted changes must carry the current UTC day (the day the change
  // is committed), not the previous commit's epoch. A clean source keeps the
  // committed epoch. Both are timezone-independent.
  describe("lastCommitDate (Issue #279)", () => {
    let repo;
    const git = (args) =>
      execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: "pipe" });

    beforeAll(async () => {
      repo = await mkdtemp(join(tmpdir(), "orbi-lastmod-"));
      git(["init", "-q"]);
      git(["config", "user.email", "test@orbi.build"]);
      git(["config", "user.name", "orbi-test"]);
      await writeFile(join(repo, "page.html"), "<p>one</p>\n");
      git(["add", "page.html"]);
      // Commit with a fixed PAST date so the committed epoch's UTC day
      // (2026-09-19) differs from the current UTC day — otherwise the
      // clean-source and dirty-source tests cannot tell the behaviors apart.
      execFileSync("git", ["commit", "-q", "-m", "initial"], {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, GIT_COMMITTER_DATE: "2026-09-19T12:00:00Z", GIT_AUTHOR_DATE: "2026-09-19T12:00:00Z" },
      });
    });

    afterAll(async () => {
      if (repo) await rm(repo, { recursive: true, force: true });
    });

    it("returns the committed epoch's UTC day for a clean source", () => {
      const epoch = git(["log", "-1", "--format=%ct", "--", "page.html"]).trim();
      const expected = new Date(Number(epoch) * 1000).toISOString().slice(0, 10);
      // The fixed commit date is 2026-09-19, so this asserts the committed
      // epoch is used — not the current UTC day.
      expect(expected).toBe("2026-09-19");
      expect(lastCommitDate(join(repo, "page.html"), repo)).toBe("2026-09-19");
    });

    it("returns the current UTC day for a source with uncommitted changes", async () => {
      await writeFile(join(repo, "page.html"), "<p>two</p>\n"); // dirty, uncommitted
      const todayUtc = new Date().toISOString().slice(0, 10);
      expect(lastCommitDate(join(repo, "page.html"), repo)).toBe(todayUtc);
      // Restore so the clean-source test stays valid on rerun.
      git(["checkout", "--", "page.html"]);
    });
  });

  it("leaves no build markers or unfilled slots in shipped pages", () => {
    for (const [, html] of shipped) {
      expect(html).not.toContain("<!--@nav-->");
      expect(html).not.toContain("<!--@footer-->");
      expect(html).not.toContain("<!--@posts-->");
      expect(html).not.toContain("<!--@post-meta-->");
      expect(html).not.toContain("<!--@social-proof-->");
      expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });
});

describe("language mirrors (the forgotten-zh gate)", () => {
  it("pairs every EN page with a ZH page and vice versa", () => {
    const content = pages.filter((p) => !p.standalone);
    const outputs = new Set(pages.map((p) => p.output));
    for (const page of content) {
      expect(outputs, `${page.output} has no mirror ${page.mirror}`).toContain(page.mirror);
      const other = pages.find((p) => p.output === page.mirror);
      expect(other.mirror, `${page.output} and ${page.mirror} are not mutual mirrors`).toBe(page.output);
      expect(other.lang).not.toBe(page.lang);
    }
    const enPaths = content.filter((p) => p.lang === "en").map((p) => p.output);
    const zhPaths = content.filter((p) => p.lang === "zh").map((p) => p.output);
    // The ZH tree mirrors the EN paths (zh/<path>); the aiready pages are the
    // one nested pair (aiready/zh/, the aiready.sh /zh route), so the check
    // follows each page's own mirror declaration — a missing or extra ZH page
    // still fails.
    expect(zhPaths).toEqual(enPaths.map((p) => pages.find((page) => page.output === p).mirror).sort());
  });

  it("keeps nav, footer and CTA counts equal across each mirror pair", () => {
    const content = pages.filter((p) => !p.standalone);
    for (const page of content) {
      const other = pages.find((p) => p.output === page.mirror);
      const a = shipped.get(page.output);
      const b = shipped.get(other.output);
      const count = (html, re) => countMatches(html, re);
      expect(count(navRegion(a), /<a /g), `${page.output}: nav <a> count drifted`)
        .toBe(count(navRegion(b), /<a /g));
      expect(count(footerRegion(a), /<a /g), `${page.output}: footer <a> count drifted`)
        .toBe(count(footerRegion(b), /<a /g));
      const ctas = (html) =>
        // Issue #571 made the film CTAs EN-only and this count excluded them;
        // Issue #575 gives the ZH homepage the same set, so the general rule
        // counts every data-cta again (the exact film set parity is pinned in
        // film.test.js).
        count(mainRegion(html), /<a class="button/g) + count(mainRegion(html), /data-cta="/g);
      expect(ctas(a), `${page.output}: CTA count drifted`).toBe(ctas(b));
    }
  });
});

describe("one unified footer on every content page", () => {
  const content = () => pages.filter((p) => !p.standalone);

  it("carries five labeled footer groups on every content page", () => {
    for (const page of content()) {
      const footer = footerRegion(shipped.get(page.output));
      const nav = region(footer, '<nav aria-label="Footer navigation">', "</nav>")
        || region(footer, '<nav aria-label="页脚导航">', "</nav>");
      const groups = [...nav.matchAll(/<div class="footer-group(?: [^"]+)?">\s*<h2>([^<]+)<\/h2>\s*<ul>([\s\S]*?)<\/ul>\s*<\/div>/g)];
      expect(groups.map((match) => match[1]), `${page.output}: footer groups`).toEqual(
        page.lang === "zh"
          ? ["产品", "资源", "指南", "对比", "公司"]
          : ["Product", "Resources", "Guides", "Compare", "Company"],
      );
      const linkCounts = groups.map((match) => [...match[2].matchAll(/<a href="([^"]+)"/g)].length);
      // Issue #845 moved the Pi hub from the Guides row to the Resources row:
      // the Resources row gained one link and the Guides row lost one.
      expect(linkCounts, `${page.output}: footer group link counts`).toEqual([6, 10, 8, 13, 7]);
      const companyLinks = [...groups[4][2].matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
        .map(([, href, label]) => [href, label]);
      const siteBase = page.nav.siteBase ?? "";
      expect(companyLinks, `${page.output}: Company links`).toEqual(page.lang === "zh"
        ? [[`${siteBase}/zh/support/`, "支持"], ["https://github.com/orbi-build/orbi/milestones", "路线图"], [`${siteBase}/zh/privacy/`, "隐私政策"], [`${siteBase}/zh/terms/`, "服务条款"], ["https://github.com/orbi-build/orbi", "GitHub"], ["https://x.com/xqliu", "X"], ["https://www.youtube.com/@orbibuild", "YouTube"]]
        : [[`${siteBase}/support/`, "Support"], ["https://github.com/orbi-build/orbi/milestones", "Roadmap"], [`${siteBase}/privacy/`, "Privacy"], [`${siteBase}/terms/`, "Terms"], ["https://github.com/orbi-build/orbi", "GitHub"], ["https://x.com/xqliu", "X"], ["https://www.youtube.com/@orbibuild", "YouTube"]]);
      const items = [...nav.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
      expect(items, `${page.output}: footer nav drifted`).toHaveLength(44);
    }
  });

  it("links YouTube in the footer with the verbatim anchor, on en and zh (Issue #255)", () => {
    for (const output of ["index.html", "zh/index.html"]) {
      const footer = footerRegion(shipped.get(output));
      expect(footer, `${output}: YouTube footer anchor drifted`).toContain(
        '<a href="https://www.youtube.com/@orbibuild" rel="me">YouTube</a>',
      );
    }
  });

  // Issue #270: opensourcealternatives.to requires a crawlable backlink before
  // the free listing goes live — no nofollow, or the review rejects it.
  it("links Open Source Alternatives from the footer without nofollow, on en and zh", () => {
    for (const output of ["index.html", "zh/index.html"]) {
      const footer = footerRegion(shipped.get(output));
      expect(footer, `${output}: Open Source Alternatives footer anchor drifted`).toContain(
        '<a href="https://www.opensourcealternatives.to/" rel="noopener">Open Source Alternatives</a>',
      );
      expect(footer, `${output}: the backlink must be crawlable`).not.toContain("nofollow");
    }
  });

  // Issue #856: the maintainer removed the ez背单词 (ezbdc.dashu.ai) friend
  // link from the shared footer, so no page that renders a footer may carry
  // the domain again.
  it("carries no ez背单词 link on any footer page (Issue #856)", () => {
    for (const page of content()) {
      const footer = footerRegion(shipped.get(page.output));
      expect(footer, `${page.output}: footer still carries ezbdc.dashu.ai`)
        .not.toContain("ezbdc.dashu.ai");
    }
  });

  // Issue #854: agentic.ai drives the most signups of any external directory —
  // Orbi ranks #1 on its free coding agents list — so it gets a text friend
  // link back, right after Open Source Alternatives and before the badge row.
  // The link points at the free list (not the homepage) and must stay
  // crawlable (no nofollow, no ref parameter).
  it("links Agentic.ai from the footer without nofollow on every footer page", () => {
    const anchor = '<a href="https://agentic.ai/best/free-coding-agents" rel="noopener">Agentic.ai</a>';
    for (const page of content()) {
      const footer = footerRegion(shipped.get(page.output));
      expect(footer, `${page.output}: Agentic.ai footer anchor drifted`).toContain(anchor);
      expect(footer, `${page.output}: the Agentic.ai backlink must be crawlable`).not.toContain("nofollow");
      expect(footer.indexOf(anchor), `${page.output}: Agentic.ai must follow Open Source Alternatives`)
        .toBeGreaterThan(footer.indexOf('<a href="https://www.opensourcealternatives.to/" rel="noopener">Open Source Alternatives</a>'));
      expect(footer.indexOf(anchor), `${page.output}: Agentic.ai must precede the badge row`)
        .toBeLessThan(footer.indexOf('<div class="footer-badges">'));
    }
  });

  // Issue #798: LaunchNest (launchnest.io) grants the dofollow backlink only
  // once the site carries this badge. The maintainer's embed is copied
  // verbatim — LaunchNest checks the anchor and img attributes on review — so
  // both lines are pinned character for character on every footer page.
  it("carries the LaunchNest badge with a dofollow backlink on every footer page", () => {
    const anchor = '<a href="https://launchnest.io/p/orbi" rel="dofollow" title="orbi.build — Domain Rating by LaunchNest">';
    const image = '<img src="https://launchnest.io/api/badge/dr?domain=orbi.build&style=small&shape=round&color=dark" alt="orbi.build Domain Rating" width="240" />';
    for (const page of content()) {
      const footer = footerRegion(shipped.get(page.output));
      expect(footer, `${page.output}: LaunchNest badge anchor drifted`).toContain(anchor);
      expect(footer, `${page.output}: LaunchNest badge image drifted`).toContain(image);
    }
  });

  // Issue #801: aiagentsdirectory.com and aiagentslisting.com both trade the
  // free listing for a live, crawlable backlink badge. The maintainer-supplied
  // embeds are copied verbatim (each directory checks the attributes on
  // review); width/height are scaled 200x50 -> 168x42 to match the LaunchNest
  // badge's 42px rendered height.
  it("carries the AI Agents Directory badge on every footer page", () => {
    const anchor = '<a href="https://aiagentsdirectory.com/agent/orbi" target="_blank" rel="noopener" title="Discover Orbi on AI Agents Directory">';
    const image = '<img src="https://aiagentsdirectory.com/featured-badge.svg?v=2024" alt="Orbi - Featured on AI Agents Directory" width="168" height="42" />';
    for (const page of content()) {
      const footer = footerRegion(shipped.get(page.output));
      expect(footer, `${page.output}: AI Agents Directory badge anchor drifted`).toContain(anchor);
      expect(footer, `${page.output}: AI Agents Directory badge image drifted`).toContain(image);
    }
  });

  it("carries the AI Agents Listing badge on every footer page", () => {
    const anchor = '<a href="https://aiagentslisting.com/orbi?utm_source=aiagentslisting&utm_medium=badge&utm_campaign=embed">';
    const image = '<img src="https://aiagentslisting.com/orbi/badge.svg?theme=dark" alt="Orbi badge" width="168" height="42" loading="lazy" />';
    for (const page of content()) {
      const footer = footerRegion(shipped.get(page.output));
      expect(footer, `${page.output}: AI Agents Listing badge anchor drifted`).toContain(anchor);
      expect(footer, `${page.output}: AI Agents Listing badge image drifted`).toContain(image);
    }
  });

  // Issue #832: toolradar.com grants the dofollow backlink — and the verified
  // vendor mark — once the site carries this badge, so the maintainer-supplied
  // embed is copied verbatim after the AI Agents Listing badge. Only width and
  // height differ from the original: 280x80 scaled to 147x42 so the badge
  // matches the 42px height of the other three. The link must stay crawlable
  // (no nofollow) or Toolradar never verifies it. Issue #843 switched the
  // embed from style=dark to style=light so the badge matches the two light
  // Featured badges on the same row; type, version, size and the anchor stay
  // as #832 shipped them.
  it("carries the Toolradar badge with a crawlable backlink on every footer page", () => {
    const anchor = '<a href="https://toolradar.com/tools/orbi" target="_blank" rel="noopener">';
    const image = '<img src="https://toolradar.com/api/badge/orbi?type=review&style=light&v=4" alt="Orbi on Toolradar" width="147" height="42" />';
    const listing = '<a href="https://aiagentslisting.com/orbi?utm_source=aiagentslisting&utm_medium=badge&utm_campaign=embed">';
    for (const page of content()) {
      const footer = footerRegion(shipped.get(page.output));
      expect(footer, `${page.output}: Toolradar badge anchor drifted`).toContain(anchor);
      expect(footer, `${page.output}: Toolradar badge image drifted`).toContain(image);
      expect(footer.indexOf(anchor), `${page.output}: Toolradar badge must follow AI Agents Listing`)
        .toBeGreaterThan(footer.indexOf(listing));
      expect(footer, `${page.output}: the Toolradar backlink must be crawlable`).not.toContain("nofollow");
    }
  });

  // Issue #805: the directory badges take their own bottom row, so they live
  // in one wrapper that is the last child of footer-friends, after the text
  // friends (the Friends label + the text links). Issue #832 appends the
  // Toolradar badge to that row.
  it("keeps the directory badges in their own wrapper after the text friends (Issue #805)", () => {
    const badgeHrefs = [
      "https://launchnest.io/p/orbi",
      "https://aiagentsdirectory.com/agent/orbi",
      "https://aiagentslisting.com/orbi?utm_source=aiagentslisting&utm_medium=badge&utm_campaign=embed",
      "https://toolradar.com/tools/orbi",
    ];
    for (const page of content()) {
      const nav = region(shipped.get(page.output), '<nav class="footer-friends"', "</nav>");
      expect(nav, `${page.output}: footer-friends missing`).not.toBe("");
      const wrapper = region(nav, '<div class="footer-badges">', "</div>");
      expect(wrapper, `${page.output}: badge wrapper missing`).not.toBe("");
      expect([...wrapper.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]), `${page.output}: badges in the wrapper`)
        .toEqual(badgeHrefs);
      // The text friends stay above the wrapper, never inside it.
      expect(wrapper, `${page.output}: text friends leaked into the badge row`)
        .not.toMatch(/Open Source Alternatives|Agentic\.ai/);
      // Nothing but whitespace and the closing tag follows the wrapper, so it
      // is the last child of footer-friends.
      const after = nav.slice(nav.indexOf(wrapper) + wrapper.length);
      expect(after, `${page.output}: the badge wrapper must be the last child of footer-friends`)
        .toMatch(/^\s*<\/nav>$/);
    }
  });

  it("carries the 11 compare deep dives, in the right language tree", () => {
    for (const page of content()) {
      const footer = footerRegion(shipped.get(page.output));
      const deep = footer.match(/<div class="footer-group footer-compare">[\s\S]*?<h2>(?:Compare|对比)<\/h2>[\s\S]*?<\/div>/)?.[0] ?? "";
      const hrefs = [...deep.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]).filter((href) => /\/compare\/[a-z-]+\/$/.test(href));
      expect(hrefs, `${page.output}: deep-dive links drifted`).toHaveLength(12);
      const prefix = page.lang === "zh" ? "/zh" : "";
      const base = (page.nav?.siteBase ?? "").replaceAll(".", "\\.");
      for (const href of hrefs) {
        expect(href, `${page.output}: deep dive ${href} must live under ${prefix}/compare/`).toMatch(
          new RegExp(`^${base}${prefix}/compare/[a-z-]+/$`),
        );
      }
      // Issue #91 smoke contract: the ZH footer must never link the EN tree.
      const wrongTree = hrefs.filter((href) =>
        page.lang === "zh" ? href.startsWith("/compare/") : href.startsWith("/zh/compare/"),
      );
      expect(wrongTree, `${page.output}: footer links the other language's deep dives`).toEqual([]);
    }
  });

  it("switches language to the mirror page from the footer", () => {
    for (const page of pages.filter((p) => p.mirror && !p.standalone)) {
      const html = shipped.get(page.output);
      const expected = `${page.nav?.siteBase ?? ""}${pathToHref(page.mirror)}`;
      const footerSwitch = [...footerRegion(html).matchAll(/<a href="([^"]+)" lang="(?:zh-CN|en)"[^>]*>/g)]
        .map((m) => m[1]);
      expect(footerSwitch, `${page.output}: footer language switch`).toEqual([expected]);
      expect(navRegion(html), `${page.output}: language switch belongs in the footer`)
        .not.toMatch(/<a href="[^"]+" lang="(?:zh-CN|en)"/);
    }
  });
});

// Issue #519: the switch must read on systems with no CJK font installed,
// where 「中文」 renders as tofu boxes. The visible label is pure ASCII
// (ZH/EN); the full target-language name lives in aria-label for screen
// readers. Flags emoji are banned too (Windows shows no flag emoji).
describe("ASCII language switch with aria-labels (Issue #519)", () => {
  const switchAnchors = (html) =>
    [...html.matchAll(/<a href="[^"]*" lang="(?:zh-CN|en)"[^>]*>[^<]*<\/a>/g)];

  it("labels every switch link with visible ZH/EN only", () => {
    for (const page of pages.filter((p) => p.mirror && !p.standalone)) {
      const html = shipped.get(page.output);
      const anchors = switchAnchors(html);
      expect(anchors.length, `${page.output}: nav switch anchor`).toBe(1);
      for (const [tag] of anchors) {
        const label = tag.match(/>([^<]*)<\/a>/)[1];
        expect(["ZH", "EN"], `${page.output}: visible switch label on ${tag}`).toContain(label);
      }
    }
  });

  it("names the switch target language in full via aria-label", () => {
    for (const page of pages.filter((p) => p.mirror && !p.standalone)) {
      const html = shipped.get(page.output);
      for (const [tag] of switchAnchors(html)) {
        const lang = tag.match(/lang="([^"]+)"/)[1];
        const aria = tag.match(/aria-label="([^"]+)"/)?.[1];
        expect(aria, `${page.output}: aria-label on ${tag}`).toBe(
          lang === "zh-CN" ? "简体中文" : "English",
        );
      }
    }
  });
});

describe("per-page head parameters (title / description / canonical)", () => {
  it("keeps the canonical URL equal to the page's own URL", () => {
    for (const page of pages) {
      const canonical = shipped
        .get(page.output)
        .match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      const expectedBase = page.output.startsWith("aiready/") ? "https://aiready.sh" : "https://orbi.build";
      expect(canonical, `${page.output}: canonical drifted`).toBe(
        `${expectedBase}${page.output.startsWith("aiready/") ? (page.output === "aiready/index.html" ? "/" : "/zh/") : pathToHref(page.output)}`,
      );
    }
  });

  it("keeps a real title and description on every page", () => {
    for (const page of pages) {
      const html = shipped.get(page.output);
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
      const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
      expect(title, `${page.output}: title is missing`).toBeTruthy();
      expect(description, `${page.output}: description is missing`).toBeTruthy();
    }
  });

  // Issue #891: a search result truncates a title or description that runs
  // past the words that fit, so the missing words never reach the user. The
  // shipped bytes every indexable page carries — hand-written pages, blog
  // posts and guides alike — keep <title> within 60 characters and
  // <meta name="description"> within 155, counted in characters (one CJK
  // character is one character). The message names the page, its count and
  // its text, so the author knows exactly which source to shorten.
  it("keeps every indexable title within 60 and description within 155 characters", () => {
    const decode = (value) => value
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"');
    const over = [];
    for (const [output, html] of shipped) {
      const title = decode(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
      const description = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");
      if ([...title].length > 60) over.push(`${output}: title ${[...title].length} chars - "${title}"`);
      if ([...description].length > 155) over.push(`${output}: description ${[...description].length} chars - "${description}"`);
    }
    expect(over, `metadata over the search-result limit:\n${over.join("\n")}`).toEqual([]);
  });
});

describe("Cloud hero single CTA (Issue #741)", () => {
  const expectations = {
    "cloud/index.html": {
      lede: "Orbi runs your Issues all the way to a release, on infrastructure we operate. No Issue yet? Describe the change in a sentence and Orbi drafts it from your code.",
      href: "/cloud/login",
      button: "Try __FREE_DELIVERIES__ deliveries free →",
      note: "No credit card required · Orbi only sees the repos you pick",
    },
    "zh/cloud/index.html": {
      lede: "Orbi 在我们运营的机器上，把你的 Issue 一路做到发版。还没写 Issue？说一句想改什么，Orbi 读你的代码写成 Issue 草稿。",
      href: "/zh/cloud/login",
      button: "免费试 __FREE_DELIVERIES__ 次 →",
      note: "不用绑定信用卡 · 只授权你选的仓库",
    },
  };

  it("keeps only the ordered h1, lede, CTA, and CTA note in the Cloud hero", () => {
    for (const [output, expected] of Object.entries(expectations)) {
      const html = shipped.get(output);
      const hero = region(html, '<section class="compare-hero', '</section>');
      const h1 = hero.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, "").trim();
      const elements = [...hero.matchAll(/<(h1|p|a)\b[^>]*>([\s\S]*?)<\/\1>/g)]
        .map(([, tag, body]) => ({ tag, body: body.replace(/<[^>]+>/g, "").trim() }));
      expect(h1, `${output}: h1 remains`).toBeTruthy();
      expect(elements, `${output}: hero content order`).toEqual([
        { tag: "h1", body: h1 },
        { tag: "p", body: expected.lede },
        { tag: "a", body: expected.button },
        { tag: "p", body: expected.note },
      ]);
      expect(hero).toContain(`class="button button-signal hero-cta" data-cta="cloud-hero" href="${expected.href}"`);
      expect(hero).not.toContain("k8e");
      expect(hero).not.toContain("cloud-docs");
      expect(hero).not.toContain("Run Orbi yourself");
      expect(hero).not.toContain("How an Issue becomes a tagged release");
    }
  });
});

describe("Cloud documentation links (Issue #315)", () => {
  const expectations = {
    "cloud/index.html": {
      docs: "https://cloud-docs.orbi.build/?ref=footer",
      selfHost: "https://docs.orbi.build",
    },
    "zh/cloud/index.html": {
      docs: "https://cloud-docs.orbi.build/?ref=footer",
      selfHost: "https://docs.orbi.build/zh",
    },
  };

  // Issue #741 removes the Cloud docs and self-hosting links from the hero;
  // the footer remains the durable place for both resources.
  it("keeps Cloud and self-hosting links in the footer", () => {
    for (const [output, expected] of Object.entries(expectations)) {
      const footer = footerRegion(shipped.get(output));
      expect(footer, `${output}: Cloud Docs link`).toContain(`href="${expected.docs}"`);
      expect(footer, `${output}: engine docs are in the Resources group`).toContain(
        `href="${expected.selfHost}"`,
      );
    }
  });
});

describe("anchor prefixes (home-relative only on the homes)", () => {
  it("uses bare #section anchors only on the language homes", () => {
    for (const page of pages.filter((p) => !p.standalone)) {
      const chrome = navRegion(shipped.get(page.output)) + footerRegion(shipped.get(page.output));
      const anchors = [...chrome.matchAll(/href="(#[^"]+)"/g)].map((m) => m[1]);
      const isHome = page.output === "index.html" || page.output === "zh/index.html";
      if (isHome) {
        expect(anchors.length, `${page.output}: home chrome should anchor locally`).toBeGreaterThan(0);
      } else {
        expect(anchors, `${page.output}: non-home chrome must not use bare ${anchors.join(", ")}`).toEqual([]);
      }
      // Wherever they appear, section anchors must point at the page's own
      // language home, never across languages.
      for (const href of chrome.matchAll(/href="((?:\/zh)?\/#[^"]+)"/g)) {
        const expected = page.lang === "zh" ? "/zh/#" : "/#";
        expect(href[1].startsWith(expected), `${page.output}: cross-language anchor ${href[1]}`).toBe(true);
      }
    }
  });
});

// Issue #165: buyers looking for the subscription price get Pricing in the
// primary nav (the /cloud/ PRICING section), not the measured-cost essay.
describe("fixed monthly Cloud pricing copy (Issue #481)", () => {
  it("keeps the unsupported per-PR claim off every page that does not measure cost", () => {
    // Index pages list every post's published headline, so the cost post's own
    // title ("... cost per merged PR") appears on them without making a price
    // claim: the blog index, and since Issue #887 the author page that lists
    // the same posts.
    const measuredCostOutputs = new Set([
      "cost/index.html",
      "zh/cost/index.html",
      "blog/deepseek-coding-agent-cost-per-merged-pr/index.html",
      "blog/index.html",
      "about/lawrence-liu/index.html",
    ]);
    for (const [output, html] of shipped) {
      if (!output.endsWith(".html")) continue;
      expect(html, output).not.toContain("$1–3");
      if (!measuredCostOutputs.has(output)) {
        const pageBody = html.replace(navRegion(html), "").replace(footerRegion(html), "");
        expect(pageBody, output).not.toContain("per merged PR");
        expect(pageBody, output).not.toContain("每个合并 PR 约");
      }
    }
  });
});

// Issue #886: /cost/ has one headline cost figure — the 169 merged deliveries
// Orbi Cloud recorded (median $0.082 off-peak). The 20-PR / $0.125 sample stays
// published, but only as the labelled earlier sample, and the Dataset JSON-LD
// describes the 169-delivery dataset.
describe("cost page leads with the 169-delivery sample (Issue #886)", () => {
  const COST_PAGES = [
    { output: "cost/index.html", earlier: "Earlier sample", datasetUrl: "https://orbi.build/cost/" },
    { output: "zh/cost/index.html", earlier: "早期样本", datasetUrl: "https://orbi.build/zh/cost/" },
  ];

  it("shows $0.082 and n=169 in the hero, and $0.125 only inside the earlier sample", () => {
    for (const { output, earlier } of COST_PAGES) {
      const html = shipped.get(output);
      const heroRegion = html.match(/<section class="compare-hero shell"[\s\S]*?<\/section>/)?.[0];
      expect(heroRegion, `${output}: hero region`).toBeTruthy();
      expect(heroRegion, `${output}: hero median`).toContain("$0.082");
      expect(heroRegion, `${output}: hero sample size`).toContain("169");
      expect(heroRegion, `${output}: hero must not lead with the old median`).not.toContain("$0.125");
      const earlierAt = html.indexOf(earlier);
      expect(earlierAt, `${output}: earlier-sample section`).toBeGreaterThan(-1);
      for (let at = html.indexOf("$0.125"); at !== -1; at = html.indexOf("$0.125", at + 1)) {
        expect(at, `${output}: $0.125 before the earlier sample`).toBeGreaterThan(earlierAt);
      }
      expect(html.slice(earlierAt), `${output}: earlier sample keeps $0.125`).toContain("$0.125");
    }
  });

  it("states a mean its own 169-delivery total supports, not the Pi post's single-delivery $0.12", () => {
    for (const { output, meanLabel, totalLabel, n } of [
      { output: "cost/index.html", meanLabel: "Mean cost per merged delivery", totalLabel: "All 169 deliveries together", n: 169 },
      { output: "zh/cost/index.html", meanLabel: "每次合并交付平均成本", totalLabel: "169 次合计", n: 169 },
    ]) {
      const html = shipped.get(output);
      const cell = (label) => html.match(new RegExp(`<th scope="row">${label}</th><td>\\$([\\d.]+)</td>`))?.[1];
      const mean = Number(cell(meanLabel));
      expect(Number.isFinite(mean), `${output}: mean row`).toBe(true);
      // Issue #886: the page must publish mean = total / n. The Pi post's
      // $0.12 belongs to one delivery (#1554), not to the sample; its
      // published average for these 169 is $0.113, which rounds to $0.11.
      expect(mean, `${output}: mean is not the 169-delivery average`).toBeCloseTo(Number(cell(totalLabel)) / n, 2);
    }
  });

  it("describes the 169-delivery dataset in parseable JSON-LD", () => {
    for (const { output, datasetUrl } of COST_PAGES) {
      const raw = shipped.get(output).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
      const dataset = JSON.parse(raw)["@graph"].find((entry) => entry["@type"] === "Dataset");
      expect(dataset, `${output}: Dataset entry`).toBeTruthy();
      expect(dataset.url, `${output}: Dataset url`).toBe(datasetUrl);
      expect(dataset.temporalCoverage, `${output}: temporalCoverage`).toBe("2026-09-16/2026-10-05");
      expect(JSON.stringify(dataset), `${output}: Dataset must describe 169 samples`).toContain("169");
    }
  });

  it("points the DeepSeek cost post at /cost/ for the current figure, in both languages", () => {
    for (const { output, href, earlier } of [
      { output: "blog/deepseek-coding-agent-cost-per-merged-pr/index.html", href: 'href="/cost/"', earlier: "earlier sample" },
      { output: "zh/blog/deepseek-coding-agent-cost-per-merged-pr/index.html", href: 'href="/zh/cost/"', earlier: "更早的一组样本" },
    ]) {
      const html = shipped.get(output);
      expect(html, `${output}: cost page link`).toContain(href);
      const body = stripTags(html.slice(html.indexOf("<main"), html.indexOf("</main>")));
      expect(body, `${output}: earlier-sample note`).toContain(earlier);
      expect(body, `${output}: current median`).toContain("$0.082");
    }
  });

  it("keeps the retired $0.125 headline off the guide pages that quote the cost", () => {
    for (const output of [
      "guides/autonomous-coding-agent/index.html",
      "zh/guides/autonomous-coding-agent/index.html",
      "guides/self-hosted-coding-agent/index.html",
      "zh/guides/self-hosted-coding-agent/index.html",
      "guides/codex-github-issues/index.html",
      "zh/guides/codex-github-issues/index.html",
    ]) {
      expect(shipped.get(output), output).not.toContain("$0.125");
      expect(shipped.get(output), output).toContain("$0.082");
    }
  });
});

describe("pricing nav entry (Issue #165)", () => {
  it("anchors the PRICING section on both Cloud pages", () => {
    for (const output of ["cloud/index.html", "zh/cloud/index.html"]) {
      const hits = countMatches(shipped.get(output), /id="pricing"/g);
      expect(hits, `${output}: expected exactly one id=\"pricing\"`).toBe(1);
    }
  });

  it("points every page's Cost/Pricing nav item at the Cloud pricing section", () => {
    for (const page of pages.filter((p) => p.nav)) {
      const nav = navRegion(shipped.get(page.output));
      const base = page.nav?.siteBase ?? "";
      const href = `${base}${page.lang === "zh" ? "/zh/cloud/#pricing" : "/cloud/#pricing"}`;
      const label = page.lang === "zh" ? "价格" : "Pricing";
      expect(nav, `${page.output}: nav missing ${href}`).toContain(`href="${href}"`);
      expect(nav, `${page.output}: nav missing label ${label}`).toContain(`>${label}<`);
      const marked = `href="${href}" aria-current="page"`;
      const isCloud = page.output === "cloud/index.html" || page.output === "zh/cloud/index.html";
      if (isCloud) {
        expect(nav, `${page.output}: Pricing should be aria-current on /cloud/`).toContain(marked);
      } else {
        expect(nav, `${page.output}: Pricing must not be aria-current here`).not.toContain(marked);
      }
    }
  });

  it("keeps a /cost/ entry from the Cloud pricing copy", () => {
    expect(shipped.get("cloud/index.html")).toMatch(/href="\/cost\/"/);
    expect(shipped.get("zh/cloud/index.html")).toMatch(/href="\/zh\/cost\/"/);
  });
});

// Issue #166: buyer-facing FAQ on /cloud/ — last click-blocking questions,
// not the homepage's self-host FAQ. JSON-LD must parse and stay in lockstep
// with the visible <details>; a trailing comma is a silent SEO failure.
const CLOUD_FAQ_PAGES = [
  { output: "cloud/index.html", faqId: "https://orbi.build/cloud/#faq" },
  { output: "zh/cloud/index.html", faqId: "https://orbi.build/zh/cloud/#faq" },
];

const stripTags = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const cloudFaqItems = (html) => {
  const section = region(html, '<section class="faq" id="faq"', "</section>");
  return [...section.matchAll(/<details class="faq-item"( open)?>([\s\S]*?)<\/details>/g)].map(
    (match) => {
      const body = match[2];
      const question = stripTags(
        (body.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? "").replace(/<span>[^<]*<\/span>/, ""),
      );
      const answer = stripTags(body.match(/<div class="faq-answer">([\s\S]*?)<\/div>/)?.[1] ?? "");
      return { open: match[1] === " open", question, answer };
    },
  );
};

const jsonLdGraph = (html) => {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1]),
  );
  return scripts.flatMap((data) => data["@graph"] ?? [data]);
};

describe("Issue-to-release landing pages (Issue #514)", () => {
  const landingPages = [
    { output: "guides/issue-to-release/index.html" },
    { output: "zh/guides/issue-to-release/index.html" },
  ];

  it("ships mutual hreflang, discovery entries, and all requested internal links", () => {
    for (const { output } of landingPages) {
      const html = shipped.get(output);
      expect(html, `${output}: English hreflang`).toContain('hreflang="en" href="https://orbi.build/guides/issue-to-release/"');
      expect(html, `${output}: Chinese hreflang`).toContain('hreflang="zh-CN" href="https://orbi.build/zh/guides/issue-to-release/"');
    }
    expect(shippedSitemap).toContain("https://orbi.build/guides/issue-to-release/");
    expect(shippedSitemap).toContain("https://orbi.build/zh/guides/issue-to-release/");
    expect(shippedLlms).toContain("https://orbi.build/guides/issue-to-release/");
    expect(shippedLlms).toContain("https://orbi.build/zh/guides/issue-to-release/");
    for (const output of ["index.html", "cloud/index.html", "guides/auto-merge-ai-prs/index.html"]) {
      expect(shipped.get(output), output).toContain('href="/guides/issue-to-release/"');
      expect(shipped.get(`zh/${output}`), `zh/${output}`).toContain('href="/zh/guides/issue-to-release/"');
    }
  });
});

// Issue #556: the self-hosted keyword page. The endpoint of its story is the
// release, so the H1 and title must name it in both languages; the card is
// the page's own, the four requested internal links live in the language
// tree, and CTAs carry the page's ref tag.
describe("Self-hosted landing pages (Issue #556)", () => {
  const landingPages = [
    { output: "guides/self-hosted-coding-agent/index.html", prefix: "" },
    { output: "zh/guides/self-hosted-coding-agent/index.html", prefix: "/zh" },
  ];

  it("ships mutual hreflang, sitemap entries and the page's own OG card", () => {
    for (const { output } of landingPages) {
      const html = shipped.get(output);
      expect(html, `${output}: English hreflang`).toContain('hreflang="en" href="https://orbi.build/guides/self-hosted-coding-agent/"');
      expect(html, `${output}: Chinese hreflang`).toContain('hreflang="zh-CN" href="https://orbi.build/zh/guides/self-hosted-coding-agent/"');
      expect((html.match(/<h1\b/gi) || []), output).toHaveLength(1);
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
      expect(title.length, `${output}: title is ${title.length} chars`).toBeLessThanOrEqual(60);
      expect(title, `${output}: title must name the release`).toMatch(/release|发版/);
      expect(html, `${output}: og:image`).toContain('content="https://orbi.build/img/og-self-hosted-coding-agent.png"');
    }
    expect(shippedSitemap).toContain("https://orbi.build/guides/self-hosted-coding-agent/");
    expect(shippedSitemap).toContain("https://orbi.build/zh/guides/self-hosted-coding-agent/");
  });

  it("keeps descriptions in the SEO band (EN 150–160 chars, ZH 70–80 字)", () => {
    for (const { output } of landingPages) {
      const description = shipped.get(output).match(/<meta name="description" content="([^"]+)"/)?.[1] ?? "";
      const length = [...description].length;
      const [min, max] = output.startsWith("zh/") ? [70, 80] : [150, 160];
      expect(length, `${output}: description is ${length} chars`).toBeGreaterThanOrEqual(min);
      expect(length, `${output}: description is ${length} chars`).toBeLessThanOrEqual(max);
    }
  });

  it("carries the four requested internal links and ref-tagged CTAs", () => {
    for (const { output, prefix } of landingPages) {
      const html = shipped.get(output);
      for (const path of ["/guides/issue-to-release/", "/cost/", "/compare/devin/", "/cloud/"]) {
        expect(html, `${output}: ${path} link`).toContain(`href="${prefix}${path}`);
      }
      const refTagged = (html.match(/href="[^"]*\?ref=seo-self-hosted-coding-agent"/g) ?? []).length;
      expect(refTagged, `${output}: ref-tagged CTA count`).toBe(4);
    }
  });

  it("keeps the setup commands on separate lines without changing printf's format", () => {
    for (const { output } of landingPages) {
      const html = shipped.get(output);
      expect(html, `${output}: setup commands use a real newline`).toContain(
        "mkdir -p .orbi\nprintf '%s\\n'",
      );
      expect(html, `${output}: setup commands do not contain a literal separator`).not.toContain(
        "mkdir -p .orbi\\nprintf",
      );
    }
  });

  it("keeps FAQ JSON-LD in lockstep with 3–6 visible questions", () => {
    for (const { output } of landingPages) {
      const html = shipped.get(output);
      const section = region(html, '<div class="source-list">', "</div>");
      const visible = (section.match(/<strong>/g) ?? []).length;
      expect(visible, `${output}: visible FAQ count`).toBeGreaterThanOrEqual(3);
      expect(visible, `${output}: visible FAQ count`).toBeLessThanOrEqual(6);
      const faq = jsonLdGraph(html).find((node) => node["@type"] === "FAQPage");
      expect(faq, `${output}: FAQPage JSON-LD`).toBeTruthy();
      expect(faq.mainEntity, `${output}: JSON-LD lockstep`).toHaveLength(visible);
    }
  });
});

describe("homepage closing Cloud CTA (Issue #714)", () => {
  const expected = {
    "index.html": {
      tag: "MANAGED CLOUD",
      title: "Try it on your own repository",
      description: "Try __FREE_DELIVERIES__ deliveries free on your own repository, then let Orbi carry the work to a tagged release.",
      // Issue #899 names Cloud in the hero button only; the closing CTA keeps
      // the free-deliveries promise, on the hero's own handoff.
      trial: "Try __FREE_DELIVERIES__ deliveries free →",
      selfHost: '<a class="text-link" data-cta="closing-selfhost" href="https://docs.orbi.build">Prefer to self-host? Read the install guide →</a>',
    },
    "zh/index.html": {
      tag: "托管 Cloud",
      title: "在你自己的仓库上试一试",
      description: "在你自己的仓库上免费试 __FREE_DELIVERIES__ 次，再让 Orbi 把工作推进到打 Tag 的正式发布。",
      trial: "免费试 __FREE_DELIVERIES__ 次 →",
      selfHost: '<a class="text-link" data-cta="closing-selfhost" href="https://docs.orbi.build/zh">想自己部署？看安装文档 →</a>',
    },
  };

  const cta = (html, name) => {
    const match = html.match(new RegExp(`<a class="([^"]+)" data-cta="${name}" href="([^"]+)">([^<]+)</a>`));
    return match ? { className: match[1], href: match[2], text: match[3] } : null;
  };

  for (const [output, contract] of Object.entries(expected)) {
    it(`${output} keeps the closing CTA in the Cloud trial context`, () => {
      const html = shipped.get(output);
      const closing = region(html, '<section class="closing shell"', "</section>");
      expect(closing, `${output}: Cloud context`).toContain(`<p class="section-tag">${contract.tag}</p>`);
      expect(closing, `${output}: closing section`).toContain(`<h2 class="orbi-closing-h2" id="closing-title">${contract.title}`);
      expect(closing, `${output}: free trial description`).toContain(`<p>${contract.description}</p>`);
      const heroCta = cta(html, "cloud-start");
      expect(cta(closing, "closing-start"), `${output}: closing CTA keeps the hero's handoff`).toEqual({
        ...heroCta,
        text: contract.trial,
      });
      expect(closing, `${output}: self-host link`).toContain(contract.selfHost);
      expect(closing.match(/<a /g) ?? [], `${output}: only Cloud CTA and self-host link`).toHaveLength(2);
    });
  }
});

describe("cloud buyer FAQ (Issue #166)", () => {
  it("sits between the three-step section and the closing CTA on both languages", () => {
    for (const { output } of CLOUD_FAQ_PAGES) {
      const main = mainRegion(shipped.get(output));
      const steps = main.indexOf('aria-labelledby="steps-title"');
      const faq = main.indexOf('<section class="faq" id="faq"');
      const closing = main.indexOf('class="closing');
      expect(steps, `${output}: three-step section missing`).toBeGreaterThan(-1);
      expect(faq, `${output}: FAQ section missing`).toBeGreaterThan(steps);
      expect(closing, `${output}: FAQ must precede the closing CTA`).toBeGreaterThan(faq);
    }
  });

  it("keeps the same item count on EN and ZH, first two open", () => {
    const counts = CLOUD_FAQ_PAGES.map(({ output }) => {
      const items = cloudFaqItems(shipped.get(output));
      expect(items.length, `${output}: need 5–7 buyer questions`).toBeGreaterThanOrEqual(5);
      expect(items.length, `${output}: need 5–7 buyer questions`).toBeLessThanOrEqual(7);
      expect(
        items.map((item) => item.open),
        `${output}: first two open, the rest collapsed (homepage pattern)`,
      ).toEqual(items.map((_, i) => i < 2));
      for (const [i, item] of items.entries()) {
        expect(item.question, `${output} FAQ ${i + 1} summary`).not.toBe("");
        expect(item.answer, `${output} FAQ ${i + 1} answer`).not.toBe("");
      }
      return items.length;
    });
    expect(counts[0], "EN/ZH FAQ counts drifted").toBe(counts[1]);
  });

  it("parses JSON-LD and keeps FAQPage mainEntity in lockstep with the visible items", () => {
    for (const { output, faqId } of CLOUD_FAQ_PAGES) {
      const html = shipped.get(output);
      const items = cloudFaqItems(html);
      const graph = jsonLdGraph(html);
      const faqPages = graph.filter((node) => node["@type"] === "FAQPage");
      expect(faqPages, `${output}: one FAQPage node`).toHaveLength(1);
      expect(faqPages[0]["@id"], output).toBe(faqId);
      const entities = faqPages[0].mainEntity;
      expect(entities, `${output}: mainEntity count`).toHaveLength(items.length);
      for (const [i, entity] of entities.entries()) {
        expect(entity["@type"], `${output} Q${i + 1} type`).toBe("Question");
        expect(entity.name, `${output} Q${i + 1} name`).toBe(items[i].question);
        const schemaText = String(entity.acceptedAnswer?.text ?? "").replace(/\s+/g, " ").trim();
        expect(schemaText, `${output} Q${i + 1} schema`).toBe(items[i].answer);
      }
    }
  });

  it("does not copy the homepage self-host FAQ onto /cloud/", () => {
    const home = cloudFaqItems(shipped.get("index.html")).map((item) => item.question);
    expect(home.length, "homepage FAQ missing").toBeGreaterThan(0);
    for (const { output } of CLOUD_FAQ_PAGES) {
      const questions = cloudFaqItems(shipped.get(output)).map((item) => item.question);
      expect(questions, `${output} reused a homepage question`).not.toEqual(home);
      for (const question of questions) {
        expect(home, `${output}: ${question}`).not.toContain(question);
      }
    }
  });

  it("states the two-plan trial terms in visible FAQ and sharing descriptions", () => {
    const expectations = {
      "cloud/index.html": {
        faq: /Cloud has two paid plans, Solo and Pro\. Each plan starts with a trial of __FREE_DELIVERIES__ successful merged deliveries — no credit card required, and failed deliveries don't count\./,
        share: /Solo and Pro are the two paid plans, at US\$__SOLO_MONTHLY_USD__\/month and US\$__CLOUD_MONTHLY_USD__\/month; each starts with a trial of __FREE_DELIVERIES__ successful merged deliveries, no credit card required, and failed deliveries don't count\./g,
      },
      "zh/cloud/index.html": {
        faq: /Cloud 有 Solo 和 Pro 两个付费套餐。每个套餐先提供 __FREE_DELIVERIES__ 次成功合并交付的试用，不用绑定信用卡，失败交付不计次数。/,
        share: /Solo 和 Pro 两个付费套餐，每月分别为 US\$__SOLO_MONTHLY_USD__ 和 US\$__CLOUD_MONTHLY_USD__；每个套餐先提供 __FREE_DELIVERIES__ 次成功合并交付的试用，不用绑定信用卡，失败交付不计次数。/g,
      },
    };
    for (const [output, expected] of Object.entries(expectations)) {
      const html = shipped.get(output);
      expect(cloudFaqItems(html)[0].answer, `${output}: visible FAQ trial terms`).toMatch(expected.faq);
      expect(html.match(/<meta (?:property="og:description"|name="twitter:description") content="([^"]+)"/g) ?? [], `${output}: sharing descriptions`).toHaveLength(2);
      expect(html.match(expected.share) ?? [], `${output}: sharing trial terms`).toHaveLength(2);
    }
  });
});

describe("Devin comparison SEO and pricing (Issue #511)", () => {
  it("ships the price-source link, pricing tokens, internal links, and one H1 in both languages", () => {
    const expectations = [
      ["compare/devin/index.html", ["/cost/", "/guides/auto-merge-ai-prs/", "/cloud/"]],
      ["zh/compare/devin/index.html", ["/zh/cost/", "/zh/guides/auto-merge-ai-prs/", "/zh/cloud/"]],
    ];
    for (const [output, links] of expectations) {
      const html = shipped.get(output).replace(/<!--[\s\S]*?-->/g, "");
      expect((html.match(/<h1\b/gi) || []), output).toHaveLength(1);
      expect(html, output).toContain('href="https://devin.ai/pricing"');
      for (const token of [
        pricing.freeDeliveriesToken,
        pricing.soloMonthlyUsdToken,
        pricing.soloIncludedTokensToken,
        pricing.soloRepositoriesToken,
        pricing.monthlyUsdToken,
        pricing.includedTokensToken,
        pricing.proRepositoriesToken,
      ]) expect(html, `${output}: ${token}`).toContain(token);
      for (const link of links) expect(html, `${output}: ${link}`).toContain(`href="${link}`);
    }
  });

  it("keeps visible FAQ answers and FAQPage JSON-LD in lockstep", () => {
    for (const output of ["compare/devin/index.html", "zh/compare/devin/index.html"]) {
      const html = shipped.get(output);
      const faqSection = html.match(/<section class="compare-section compare-section-tint shell faq"[\s\S]*?<\/section>/)?.[0] ?? "";
      const items = [...faqSection.matchAll(/<details class="faq-item"(?: open)?[^>]*>[\s\S]*?<summary><span>[^<]*<\/span>([\s\S]*?)<\/summary>[\s\S]*?<div class="faq-answer">([\s\S]*?)<\/div>[\s\S]*?<\/details>/g)].map((match) => ({ question: stripTags(match[1]), answer: stripTags(match[2]) }));
      expect(items, output).toHaveLength(4);
      const faq = jsonLdGraph(html).find((node) => node["@type"] === "FAQPage");
      expect(faq, output).toBeTruthy();
      expect(faq.mainEntity, output).toHaveLength(items.length);
      for (const [index, entity] of faq.mainEntity.entries()) {
        expect(entity.name, `${output} Q${index + 1}`).toBe(items[index].question);
        expect(entity.acceptedAnswer.text, `${output} Q${index + 1}`).toBe(items[index].answer);
      }
    }
  });

  // Issue #795: the page claimed a "Free, Solo, Pro" Cloud tier, while /cloud/
  // sells two paid plans (Solo, Pro) each starting with a __FREE_DELIVERIES__
  // successful-merged-delivery trial. The FAQ sentence appears twice per page
  // (JSON-LD answer + visible answer) and must stay in lockstep.
  it("describes Cloud as two paid plans with a trial, never a Free tier (Issue #795)", () => {
    const expectations = [
      [
        "compare/devin/index.html",
        "Orbi Cloud has two paid plans, Solo and Pro, each starting with a trial of __FREE_DELIVERIES__ successful merged deliveries;",
        "or run as Cloud on a Solo or Pro plan, each starting with a free trial of __FREE_DELIVERIES__ merged deliveries.",
      ],
      [
        "zh/compare/devin/index.html",
        "Orbi Cloud 有 Solo、Pro 两档付费套餐，各自先送 __FREE_DELIVERIES__ 次成功合并交付的试用；",
        "也可以用 Cloud 的 Solo 或 Pro 套餐，各自先送 __FREE_DELIVERIES__ 次合并交付的免费试用。",
      ],
    ];
    for (const [output, faqSentence, ledeSentence] of expectations) {
      const html = shipped.get(output);
      expect(html.split(faqSentence).length - 1, `${output}: FAQ sentence occurrences`).toBe(2);
      expect(html, `${output}: pricing section lede`).toContain(ledeSentence);
      // The only remaining "Free" mentions are Devin's own plan names in the
      // dated source list, never Orbi's Cloud tiers (Issue #795).
      expect(html, `${output}: no Free Cloud tier`).not.toMatch(/Free,\s*Solo|Free、Solo/);
    }
  });
});

// Issue #540 removed the privacy-copy regex tests (Issue #276): they pinned
// the privacy sentences verbatim. The private-repo link ban lives on in the
// "public link safety (Issue #500)" block below.

// Issue #221: status.orbi.build went live 2026-09-18; the only way to find it
// was to already know the URL. The footer links it on every page (after
// Releases, no target="_blank", same as GitHub and X).
describe("status page link (Issue #221)", () => {
  it("links https://status.orbi.build from the footer right after Releases, on en and zh", () => {
    for (const output of ["index.html", "zh/index.html"]) {
      const footer = footerRegion(shipped.get(output));
      const releases = footer.indexOf('href="https://github.com/orbi-build/orbi/releases"');
      const status = footer.indexOf('href="https://status.orbi.build"');
      expect(releases, `${output}: Releases link missing`).toBeGreaterThan(-1);
      expect(status, `${output}: status link missing from the footer`).toBeGreaterThan(releases);
    }
  });

  it("labels the link Status on en and 状态 on zh, with no target attribute", () => {
    const en = footerRegion(shipped.get("index.html"));
    const zh = footerRegion(shipped.get("zh/index.html"));
    expect(en).toContain('href="https://status.orbi.build">Status</a>');
    expect(zh, "the zh footer must not show the English label").toContain('href="https://status.orbi.build">状态</a>');
    for (const [output, footer] of [["index.html", en], ["zh/index.html", zh]]) {
      expect(footer, `${output}: status link must not open a new tab`).not.toMatch(
        /<a[^>]*status\.orbi\.build[^>]*target=/,
      );
    }
  });
});

// Issue #308: the primary-nav CTA introduces Cloud before authorization. Walking
// every built index.html keeps both language trees on the same funnel contract.
describe("nav CTA introduces the Cloud page (Issue #308)", () => {
  it("uses a language-aware Cloud landing href in the shared partial", async () => {
    const partial = await readFile(join(ROOT, "site", "partials", "nav.html"), "utf8");
    expect(partial).toContain('href="{{CLOUD_HREF}}"');
  });

  it("offers returning users a Sign in text link left of the nav CTA (Issue #528)", async () => {
    // /api/login is the Cloud control plane's own login route: on every
    // deployed host the cloud Worker owns /api*, so the plain relative href
    // (how the slot fills on pages without a nav.siteBase) reaches the right
    // environment without per-env configuration; pages living on another host
    // (aiready.sh, Issue #610) fill the slot with the absolute orbi.build URL.
    // It is a plain text link (no class of its own) and sits before the Start
    // Cloud button in DOM order — its left in the nav row.
    const partial = await readFile(join(ROOT, "site", "partials", "nav.html"), "utf8");
    expect(partial, "nav partial carries the Sign in slot").toContain(
      '<a data-cta="nav-signin" href="{{SIGNIN_HREF}}">{{SIGNIN_LABEL}}</a>',
    );
    expect(partial, "nav partial carries the GitHub tracking slot").toContain(
      '<a data-cta="nav-github" href="https://github.com/orbi-build/orbi">GitHub</a>',
    );
    expect(partial.indexOf('href="{{SIGNIN_HREF}}"')).toBeLessThan(partial.indexOf('class="nav-apply"'));
    for (const [output, label] of [["index.html", "Sign in"], ["zh/index.html", "登录"]]) {
      const nav = navRegion(shipped.get(output));
      const link = nav.match(/<a data-cta="nav-signin" href="\/api\/login">([^<]*)<\/a>/);
      expect(link, `${output}: nav Sign in link or tracking attribute missing`).toBeTruthy();
      expect(link[1], `${output}: nav Sign in label`).toBe(label);
      expect(nav, `${output}: nav GitHub tracking attribute missing`).toContain(
        '<a data-cta="nav-github" href="https://github.com/orbi-build/orbi">GitHub</a>',
      );
    }
  });

  it("points the primary-nav CTA at the language Cloud page on every built index.html", async () => {
    const listIndex = async (dir, prefix = "") => {
      const out = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          out.push(...(await listIndex(join(dir, entry.name), `${prefix}${entry.name}/`)));
        } else if (entry.name === "index.html") {
          out.push(`${prefix}${entry.name}`);
        }
      }
      return out.sort();
    };
    // Walk the build products, never a hardcoded page list: a new page that
    // forgets the Cloud login destination fails here instead of shipping Apply.
    const outputs = (await listIndex(builtDir)).filter((output) => !output.startsWith("aiready/"));
    expect(outputs.length, "need at least the five funnel pages").toBeGreaterThanOrEqual(5);
    for (const output of outputs) {
      const html = await readFile(join(builtDir, output), "utf8");
      const nav = navRegion(html);
      const cta = nav.match(/<a class="nav-apply" data-cta="nav-start" href="([^"]+)">([^<]*)<\/a>/);
      expect(cta, `${output}: missing the primary-nav CTA`).toBeTruthy();
      const loginPath = output.startsWith("zh/") ? "/zh/cloud/login" : "/cloud/login";
      expect(cta[1], `${output}: nav CTA must use the language login handoff`).toBe(loginPath);
      const label = output.startsWith("zh/") ? "免费开始" : "Start free";
      expect(cta[2], `${output}: nav CTA label`).toBe(label);
    }
  });

  it("keeps Cloud page CTAs on the matching language login handoff", () => {
    for (const [output, loginPath] of [["cloud/index.html", "/cloud/login"], ["zh/cloud/index.html", "/zh/cloud/login"]]) {
      const html = shipped.get(output);
      expect(html.split(`href="${loginPath}"`).length - 1, `${output}: missing language login CTA`).toBe(5);
    }
  });
});

// Issue #711: every page has the same six-link primary nav. The former Guides
// entry, every Resources destination and the language switch live in the
// footer; the mobile hamburger opens the same six-link nav DOM.
describe("six-link primary nav and relocated links (Issue #711)", () => {
  const RESOURCES = {
    en: {
      label: "Resources",
      items: [
        ["/evidence/", "Orbi builds Orbi", "Public issues, PRs and releases on GitHub"],
        ["/benchmark/", "How we test the harness", "Delivery runs on open-source bugs, graded by maintainers' tests"],
        ["/guides/pi-coding-agent/", "Pi series: how Orbi is built", "The runner around the Pi coding agent"],
        ["/cost/", "Cost per merged PR", "Measured on our own repos, with sample size and limits"],
        ["/aiready/", "ai-ready: 12 factors", "What makes an Issue safe to hand to an AI"],
        ["/compare/", "Orbi vs alternatives", "Claude Code, Codex, Devin and more, fact-checked"],
        ["/blog/", "Blog", ""],
      ],
    },
    zh: {
      label: "资源",
      items: [
        ["/zh/evidence/", "Orbi 交付自己的记录", "公开的 Issue、PR 和发版，都在 GitHub 上"],
        ["/zh/benchmark/", "我们怎么测 harness", "在开源 bug 上跑交付，用维护者的测试打分"],
        ["/zh/guides/pi-coding-agent/", "Pi 系列：Orbi 是怎么实现的", "Pi coding agent 外面那个 runner 是怎么运转的"],
        ["/zh/cost/", "每个 PR 花多少钱", "在自家仓库实测，附样本量和限制"],
        ["/aiready/zh/", "ai-ready 12 要素", "什么样的 Issue 能交给 AI 无人值守交付"],
        ["/zh/compare/", "与同类工具对比", "Claude Code、Codex、Devin 等，逐条核实"],
        ["/zh/blog/", "博客", ""],
      ],
    },
  };

  it("keeps the primary navigation to six links", () => {
    for (const page of [...pages.filter((p) => p.nav), ...posts]) {
      const links = [...navRegion(shipped.get(page.output)).matchAll(/<a\b[^>]*>([^<]*)<\/a>/g)]
        .map(([, label]) => label.trim());
      expect(links, `${page.output}: primary navigation`).toEqual(
        page.lang === "zh"
          ? ["产品怎么运作", "价格", "文档", "GitHub", "登录", "免费开始"]
          : ["How it works", "Pricing", "Docs", "GitHub", "Sign in", "Start free"],
      );
      const nav = navRegion(shipped.get(page.output));
      expect(nav, `${page.output}: GitHub CTA tracking`).toContain(
        '<a data-cta="nav-github" href="https://github.com/orbi-build/orbi">GitHub</a>',
      );
      const signInLabel = page.lang === "zh" ? "登录" : "Sign in";
      expect(nav, `${page.output}: Sign in CTA tracking`).toMatch(
        new RegExp(`<a data-cta="nav-signin" href="(?:/api/login|https://orbi\\.build/api/login)">${signInLabel}</a>`),
      );
    }
  });

  it("keeps Guides and Resources links in the footer", () => {
    for (const page of [...pages.filter((p) => p.nav), ...posts]) {
      const footer = footerRegion(shipped.get(page.output));
      const siteBase = page.nav?.siteBase ?? "";
      const guidesHref = `${siteBase}${page.lang === "zh" ? "/zh/guides/" : "/guides/"}`;
      expect(footer, `${page.output}: footer lost the Guides index`).toContain(
        `<a href="${guidesHref}">${page.lang === "zh" ? "指南" : "Guides"}</a>`,
      );
      expect(footer, `${page.output}: footer lost Guides`).toContain(page.lang === "zh" ? "Issue 到发版" : "Issue to release");
      expect(footer, `${page.output}: footer lost Resources`).toContain(page.lang === "zh" ? "博客" : "Blog");
      expect(footer, `${page.output}: footer lost language switch`).toMatch(/<a href="[^"]+" lang="(?:zh-CN|en)"/);
    }
  });

  it("uses all seven resource labels in the footer without dropdown descriptions", () => {
    const surfaces = [...pages.filter((p) => p.nav), ...posts];
    for (const page of surfaces) {
      const expected = RESOURCES[page.lang];
      const siteBase = page.nav?.siteBase ?? "";
      const footer = footerRegion(shipped.get(page.output));
      const resources = region(footer, `<h2>${page.lang === "zh" ? "资源" : "Resources"}</h2>`, `</div>`);
      const items = [...resources.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)]
        .map((match) => [match[1], match[2]]);
      const expectedItems = expected.items.map(([href, label]) => [
        `${siteBase}${href}`,
        label,
      ]);
      expect(items.slice(0, expectedItems.length), `${page.output}: footer resource labels drifted`).toEqual(expectedItems);
      for (const [, , description] of expected.items) {
        if (description) expect(resources, `${page.output}: footer includes ${description}`).not.toContain(description);
      }
    }
  });

  it("does not ship the old resource labels as navigation or footer link text", () => {
    const rendered = [...shipped.values()].map((html) => html.replace(/<!--[\s\S]*?-->/g, "")).join("\n");
    for (const label of ["证据", "方法", "对比", "Evidence", "Method", "Comparisons"]) {
      expect(rendered).not.toMatch(new RegExp(`<(?:a|button)[^>]*>\\s*${label}\\s*(?:<|$)`));
    }
  });

  // demo.js boots the hamburger and the dropdown (demo.js bootNavigation); a
  // nav page without the script ships controls that can never open.
  it("loads demo.js on every page carrying the primary nav", () => {
    const surfaces = [...pages.filter((p) => p.nav), ...posts];
    for (const page of surfaces) {
      expect(shipped.get(page.output), `${page.output}: nav page must load /demo.js`).toContain(
        '<script src="/demo.js" defer></script>',
      );
    }
  });

  it("lands the Method entry on a page the build actually ships", () => {
    for (const output of ["aiready/index.html", "aiready/zh/index.html"]) {
      expect(shipped.get(output), `${output} must ship for the nav Method link`).toBeTruthy();
    }
  });
});

// Issue #180: /cloud/ is the pricing page, not a clone of /cost/. Coupon and
// forever contract wording appear once; Devin/Factory billing docs stay on
// /cost/. The grep is the site source — the same files the Issue names.
describe("cloud copy is not a cost-page clone (Issue #180)", () => {
  const countIn = (html, needle) => html.split(needle).length - 1;

  it("keeps coupon and forever phrasing once and drops competitor billing docs", async () => {
    const en = await readFile(join(ROOT, "site", "pages", "cloud", "index.html"), "utf8");
    const zh = await readFile(join(ROOT, "site", "pages", "zh", "cloud", "index.html"), "utf8");
    expect(countIn(en, "not a price increase"), "EN not a price increase").toBeLessThanOrEqual(1);
    expect(countIn(en, "written on the subscription alone"), "EN forever phrasing").toBeLessThanOrEqual(1);
    expect(countIn(zh, "不是涨价"), "ZH 不是涨价").toBeLessThanOrEqual(1);
    expect(countIn(zh, "只写在订阅"), "ZH 只写在订阅").toBeLessThanOrEqual(1);
  });
});

// Issue #186: the homepage one-liner is the canonical aiready.sh entry.
// orbi.build/install.sh remains the underlying asset, never the primary command.
describe("canonical install one-liner (Issue #186)", () => {
  const canonical = "curl -fsSL https://aiready.sh | sh";

  const snippetOf = (html) => html.match(/<code data-copy-source>([^<]*)<\/code>/)?.[1] ?? null;

  it("uses aiready.sh on the English and Chinese homepages", () => {
    for (const output of ["index.html", "zh/index.html"]) {
      const snippet = snippetOf(shipped.get(output));
      expect(snippet, `${output}: missing copyable install snippet`).toBe(canonical);
    }
  });

  it("keeps homepage sources on the same command", async () => {
    for (const rel of ["site/pages/index.html", "site/pages/zh/index.html"]) {
      const html = await readFile(join(ROOT, rel), "utf8");
      expect(snippetOf(html), `${rel}: missing copyable install snippet`).toBe(canonical);
    }
  });
});

// Issue #807: Cursor 2.0 renamed Background Agents to Cloud Agents (2025-10-29),
// but the old name still carries more search demand than the new one. The page
// leads with the old name on title, h1, hero lede and share metadata, names the
// current one beside it, and cites the changelog that recorded the rename.
describe("Cursor page names the Background Agents rename (Issue #807)", () => {
  const pages = {
    "compare/cursor/index.html": {
      title: "<title>Orbi vs Cursor Background Agents (now Cloud Agents)</title>",
      h1: '<h1 id="compare-title">Orbi vs Cursor Background Agents</h1>',
      lede: "Cursor Background Agents, now called Cloud Agents, run tasks",
      meta: 'content="Orbi vs Cursor Background Agents (now Cloud Agents): ',
      og: '<meta property="og:title" content="Orbi vs Cursor Background Agents (now Cloud Agents)',
      twitter: '<meta name="twitter:title" content="Orbi vs Cursor Background Agents (now Cloud Agents)">',
      headline: '"headline":"Orbi vs Cursor Background Agents (now Cloud Agents)',
      source: ["Cursor 2.0 changelog", "Background Agents renamed to Cloud Agents"],
    },
    "zh/compare/cursor/index.html": {
      title: "<title>Orbi vs Cursor Background Agents（现名 Cloud Agents）：交付对比</title>",
      h1: '<h1 id="compare-title">Orbi vs Cursor Background Agents</h1>',
      lede: "Cursor Background Agents（现名 Cloud Agents）",
      meta: 'content="Orbi vs Cursor Background Agents（现名 Cloud Agents）：',
      og: '<meta property="og:title" content="Orbi vs Cursor Background Agents（现名 Cloud Agents）',
      twitter: '<meta name="twitter:title" content="Orbi vs Cursor Background Agents（现名 Cloud Agents）">',
      headline: '"headline":"Orbi vs Cursor Background Agents（现名 Cloud Agents）',
      source: ["Cursor 2.0 changelog", "Background Agents 改名为 Cloud Agents"],
    },
  };

  it("leads with the old name and names the current one beside it", () => {
    for (const [output, expected] of Object.entries(pages)) {
      const html = shipped.get(output);
      expect(html, `${output}: title`).toContain(expected.title);
      expect(html, `${output}: h1`).toContain(expected.h1);
      const hero = region(html, '<p class="hero-lede">', "</p>");
      expect(hero, `${output}: hero lede`).toContain(expected.lede);
      expect(html, `${output}: meta description`).toContain(expected.meta);
      expect(html, `${output}: og:title`).toContain(expected.og);
      expect(html, `${output}: twitter:title`).toContain(expected.twitter);
      expect(html, `${output}: JSON-LD headline`).toContain(expected.headline);
    }
  });

  it("cites the 2.0 changelog that recorded the rename", () => {
    for (const [output, expected] of Object.entries(pages)) {
      const sources = region(shipped.get(output), '<ul class="source-list">', "</ul>");
      expect(sources, `${output}: changelog source link`).toContain(
        'href="https://cursor.com/changelog/2-0"',
      );
      for (const text of expected.source) {
        expect(sources, `${output}: changelog source description`).toContain(text);
      }
    }
  });
});

describe("Cursor Cloud Agents comparison contract (Issue #199)", () => {
  it("ships both Cursor mirrors with Article metadata, hreflang, and sitemap entries", () => {
    const en = shipped.get("compare/cursor/index.html");
    const zh = shipped.get("zh/compare/cursor/index.html");
    for (const [output, html, canonical, mirror] of [
      ["compare/cursor/index.html", en, "https://orbi.build/compare/cursor/", "https://orbi.build/zh/compare/cursor/"],
      ["zh/compare/cursor/index.html", zh, "https://orbi.build/zh/compare/cursor/", "https://orbi.build/compare/cursor/"],
    ]) {
      expect(html, `${output}: missing output`).toBeTruthy();
      expect(html).toContain('type="application/ld+json"');
      expect(html).toContain('"@type":"Article"');
      expect(html).toContain(`rel="canonical" href="${canonical}"`);
      expect(html).toContain(`hreflang="${output.startsWith("zh/") ? "en" : "zh-CN"}" href="${mirror}"`);
    }
    expect(shippedSitemap).toContain("https://orbi.build/compare/cursor/");
    expect(shippedSitemap).toContain("https://orbi.build/zh/compare/cursor/");
  });
});

describe("Claude Code comparison contract (Issue #198)", () => {
  it("ships both Claude Code mirrors with Article metadata, hreflang, and discovery links", () => {
    const en = shipped.get("compare/claude-code/index.html");
    const zh = shipped.get("zh/compare/claude-code/index.html");
    for (const [output, html, canonical, mirror] of [
      ["compare/claude-code/index.html", en, "https://orbi.build/compare/claude-code/", "https://orbi.build/zh/compare/claude-code/"],
      ["zh/compare/claude-code/index.html", zh, "https://orbi.build/zh/compare/claude-code/", "https://orbi.build/compare/claude-code/"],
    ]) {
      expect(html, `${output}: missing output`).toBeTruthy();
      expect(html).toContain('type="application/ld+json"');
      expect(html).toContain('"@type":"Article"');
      expect(html).toContain(`rel="canonical" href="${canonical}"`);
      expect(html).toContain(`hreflang="${output.startsWith("zh/") ? "en" : "zh-CN"}" href="${mirror}"`);
    }
    expect(shippedSitemap).toContain("https://orbi.build/compare/claude-code/");
    expect(shippedSitemap).toContain("https://orbi.build/zh/compare/claude-code/");
    expect(shipped.get("compare/index.html")).toContain("/compare/claude-code/");
    expect(shipped.get("zh/compare/index.html")).toContain("/zh/compare/claude-code/");
    expect(shipped.get("index.html")).toContain("/compare/claude-code/");
    expect(shipped.get("zh/index.html")).toContain("/zh/compare/claude-code/");
  });
});

describe("Google Jules comparison contract (Issue #200)", () => {
  it("ships both Jules mirrors with Article metadata, hreflang, and sitemap entries", () => {
    const en = shipped.get("compare/jules/index.html");
    const zh = shipped.get("zh/compare/jules/index.html");
    for (const [output, html, canonical, mirror] of [
      ["compare/jules/index.html", en, "https://orbi.build/compare/jules/", "https://orbi.build/zh/compare/jules/"],
      ["zh/compare/jules/index.html", zh, "https://orbi.build/zh/compare/jules/", "https://orbi.build/compare/jules/"],
    ]) {
      expect(html, `${output}: missing output`).toBeTruthy();
      expect(html).toContain('type="application/ld+json"');
      expect(html).toContain('"@type":"Article"');
      expect(html).toContain(`rel="canonical" href="${canonical}"`);
      expect(html).toContain(`hreflang="${output.startsWith("zh/") ? "en" : "zh-CN"}" href="${mirror}"`);
    }
    expect(shippedSitemap).toContain("https://orbi.build/compare/jules/");
    expect(shippedSitemap).toContain("https://orbi.build/zh/compare/jules/");
  });
});

// Issue #889: the dated comparison, benchmark and guide pages state a real
// publish and update date in their Article JSON-LD, so a search engine reads
// the same freshness a reader sees instead of a missing-date default.
// dateModified is the newest verification or update date the page visibly
// states; the current dates are pinned here, and each one must still appear in
// the page outside its JSON-LD, so a guessed date cannot ship.
describe("Article publish and update dates (Issue #889)", () => {
  const DATED_PAGES = {
    "compare/claude-code/index.html": ["2026-09-17", "2026-10-06"],
    "zh/compare/claude-code/index.html": ["2026-09-17", "2026-09-17"],
    "compare/codex/index.html": ["2026-09-07", "2026-10-06"],
    "zh/compare/codex/index.html": ["2026-09-07", "2026-09-07"],
    "compare/cursor/index.html": ["2026-09-17", "2026-10-04"],
    "zh/compare/cursor/index.html": ["2026-09-17", "2026-10-04"],
    "compare/devin/index.html": ["2026-09-07", "2026-10-08"],
    "zh/compare/devin/index.html": ["2026-09-07", "2026-09-24"],
    "compare/github-copilot-coding-agent/index.html": ["2026-09-07", "2026-10-08"],
    "zh/compare/github-copilot-coding-agent/index.html": ["2026-09-07", "2026-09-24"],
    "compare/hermes-agent/index.html": ["2026-09-07", "2026-09-24"],
    "zh/compare/hermes-agent/index.html": ["2026-09-07", "2026-09-24"],
    "compare/jules/index.html": ["2026-09-17", "2026-09-17"],
    "zh/compare/jules/index.html": ["2026-09-17", "2026-09-17"],
    "compare/keelen/index.html": ["2026-09-24", "2026-09-24"],
    "zh/compare/keelen/index.html": ["2026-09-24", "2026-09-24"],
    "compare/managed-agents/index.html": ["2026-09-07", "2026-09-07"],
    "zh/compare/managed-agents/index.html": ["2026-09-07", "2026-09-07"],
    "compare/openclaw/index.html": ["2026-09-07", "2026-09-07"],
    "zh/compare/openclaw/index.html": ["2026-09-07", "2026-09-07"],
    "compare/openhands/index.html": ["2026-09-07", "2026-09-07"],
    "zh/compare/openhands/index.html": ["2026-09-07", "2026-09-07"],
    "compare/orca/index.html": ["2026-09-12", "2026-09-12"],
    "zh/compare/orca/index.html": ["2026-09-12", "2026-09-12"],
    "benchmark/index.html": ["2026-09-30", "2026-09-30"],
    "zh/benchmark/index.html": ["2026-09-30", "2026-09-30"],
    "guides/self-hosted-coding-agent/index.html": ["2026-09-26", "2026-10-05"],
    "zh/guides/self-hosted-coding-agent/index.html": ["2026-09-26", "2026-10-05"],
    "guides/pi-coding-agent/index.html": ["2026-10-05", "2026-10-06"],
    "zh/guides/pi-coding-agent/index.html": ["2026-10-05", "2026-10-06"],
  };
  const PUBLISHER = {
    "@type": "Organization",
    name: "Orbi",
    url: "https://orbi.build/",
    logo: { "@type": "ImageObject", url: "https://orbi.build/logo-mark.svg" },
  };

  // Dates inside the JSON-LD do not count as visible: the structured data must
  // agree with a date the reader can see, not only with itself.
  const visibleDates = (html) => [...html
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "")
    .matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0]);

  it("carries datePublished, dateModified, a Person author and a publisher", () => {
    for (const [output, [published, modified]] of Object.entries(DATED_PAGES)) {
      const html = shipped.get(output);
      expect(html, `${output}: missing output`).toBeTruthy();
      const article = articleOf(html);
      expect(article, `${output}: missing Article`).toBeTruthy();
      expect(article.datePublished, `${output}: datePublished`).toBe(published);
      expect(article.dateModified, `${output}: dateModified`).toBe(modified);
      expect(article.author, output).toEqual({ "@type": "Person", name: "Lawrence Liu" });
      expect(article.publisher, output).toEqual(PUBLISHER);
    }
  });

  it("keeps dateModified equal to the newest date the page visibly states", () => {
    for (const [output, [, modified]] of Object.entries(DATED_PAGES)) {
      const visible = visibleDates(shipped.get(output));
      expect(visible, `${output}: the page states no date outside its JSON-LD`).toContain(modified);
      expect(visible.slice().sort().at(-1), `${output}: newest visible date`).toBe(modified);
    }
  });

  it("gives the Pi hub an Article next to its breadcrumb", () => {
    for (const output of ["guides/pi-coding-agent/index.html", "zh/guides/pi-coding-agent/index.html"]) {
      const html = shipped.get(output);
      expect(articleOf(html), `${output}: Article`).toBeTruthy();
      expect(jsonLdObjects(html).some((entry) => entry["@type"] === "BreadcrumbList"), `${output}: breadcrumb`).toBe(true);
    }
  });
});

// Issue #212: /blog/ on the root domain. Posts are Markdown files under
// content/blog/ (en) and content/blog/zh/ (zh); the build renders them through
// the shared chrome, derives both language indexes from the content directory
// (no hand-maintained list), and ships the English posts as an RSS 2.0 feed
// at /blog/feed.xml.
describe("blog (Issue #212)", () => {
  const enPost = () => posts.find((post) => post.lang === "en");
  const zhPost = () => posts.find((post) => post.lang === "zh");

  it("derives the posts from the content directory, sorted newest first with the slug as tiebreaker", async () => {
    expect(enPost(), "the first post must ship").toBeTruthy();
    expect(zhPost(), "the first post must have a zh mirror").toBeTruthy();
    const dates = posts.map((post) => post.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("renders both language indexes from the content directory with title, date, summary and link", () => {
    expect(enPost(), "the first post must ship").toBeTruthy();
    expect(zhPost(), "the first post must have a zh mirror").toBeTruthy();
    for (const [indexOutput, post] of [["blog/index.html", enPost()], ["zh/blog/index.html", zhPost()]]) {
      const html = shipped.get(indexOutput);
      expect(html, `${indexOutput}: missing output`).toBeTruthy();
      expect(html, `${indexOutput}: post link`).toContain(`<a href="${post.href}">${post.headline}</a>`);
      expect(html, `${indexOutput}: post summary`).toContain(post.summary);
      expect(html, `${indexOutput}: post date`).toContain(`<time datetime="${post.date}">${post.date}</time>`);
    }
  });

  it("renders each post with the shared chrome, a canonical link and article og meta from its front matter", () => {
    for (const post of [enPost(), zhPost()]) {
      const html = shipped.get(post.output);
      const url = `https://orbi.build${post.href}`;
      expect(html).toContain(`<link rel="canonical" href="${url}">`);
      expect(html).toContain('<meta property="og:type" content="article">');
      expect(html).toContain(`<meta property="og:title" content="${post.headline}">`);
      expect(html).toContain(`<meta property="og:description" content="${post.summary}">`);
      expect(html).toContain(`<meta property="og:url" content="${url}">`);
      expect(html).toContain(`<meta property="article:published_time" content="${post.date}">`);
      expect(html, `${post.output}: shared nav must render`).toContain('<nav id="');
      expect(html, `${post.output}: shared footer must render`).toContain('<footer class="site-footer shell">');
    }
  });

  // Issue #863: the post template used to hard-code the site default
  // og.png on top of the per-post card renderPostMeta() derives from front
  // matter, so every post page shipped two og:image tags and a crawler could
  // pick the generic one. The per-post card must be the only one.
  it("ships exactly one og:image per post page, taken from that post's front matter (Issue #863)", async () => {
    const expected = new Map(posts.map((post) => [post.output, `https://orbi.build${post.image}`]));
    expect(expected.size, "the blog must ship at least one post").toBeGreaterThan(0);

    // The gate reads the shipped public/ tree, so a post directory that the
    // content list does not know about cannot hide a duplicate here.
    const outputs = [];
    for (const dir of ["blog", "zh/blog"]) {
      const entries = await readdir(join(ROOT, "public", dir), { withFileTypes: true });
      const slugs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
      expect(slugs.length, `public/${dir}`).toBeGreaterThan(0);
      outputs.push(...slugs.map((slug) => `${dir}/${slug}/index.html`));
    }
    expect(outputs.sort(), "every post directory must come from content/blog/**").toEqual([...expected.keys()].sort());

    for (const output of outputs) {
      const html = shipped.get(output);
      const tags = [...html.matchAll(/<meta\s+property=["']og:image["'][^>]*>/gi)].map((match) => match[0]);
      expect(tags, `${output}: og:image count`).toHaveLength(1);
      expect(tags[0], `${output}: og:image must be this post's card`)
        .toContain(`content="${expected.get(output)}"`);
    }
  });

  it("renders one compact localized CTA after the second paragraph on posts with three paragraphs", () => {
    for (const post of posts) {
      const html = shipped.get(post.output);
      const body = html.match(/<article class="post-body">([\s\S]*?)<aside class="post-cta">/)?.[1] ?? "";
      const paragraphs = [...body.matchAll(/<p\b[\s\S]*?<\/p>/g)];
      const inline = body.match(/<aside class="post-cta-inline">[\s\S]*?<\/aside>/g) ?? [];
      expect(paragraphs.length, `${post.output}: rendered paragraphs`).toBeGreaterThanOrEqual(3);
      expect(inline, `${post.output}: inline CTA count`).toHaveLength(1);
      const secondParagraphEnd = paragraphs[1].index + paragraphs[1][0].length;
      const inlineStart = body.indexOf(inline[0]);
      expect(inlineStart, `${post.output}: inline CTA follows paragraph two`).toBe(secondParagraphEnd);
      const expected = post.lang === "zh"
        ? {
            title: "Orbi 把你的 Issue 一路做到发版。",
            button: "免费试 __FREE_DELIVERIES__ 次 →",
            href: "/zh/cloud/login",
          }
        : {
            title: "Orbi takes your Issues all the way to a release.",
            button: "Try __FREE_DELIVERIES__ deliveries free →",
            href: "/cloud/login",
          };
      expect(inline[0]).toContain(`<span>${expected.title}</span>`);
      expect(inline[0]).toContain(`<a class="button button-signal" data-cta="post-inline-start" href="${expected.href}">${expected.button}</a>`);
    }
  });

  it("does not add the inline CTA when fewer than three paragraphs are rendered", () => {
    const cta = `<aside class="post-cta-inline">inline</aside>`;
    expect(insertInlinePostCta("<p>one</p><p>two</p>", cta)).toBe("<p>one</p><p>two</p>");
    expect(insertInlinePostCta("<p>one</p><p>two</p><p>three</p>", cta)).toBe(`<p>one</p><p>two</p>${cta}<p>three</p>`);
  });

  it("renders one localized registration CTA after every post body and before related posts", () => {
    for (const post of posts) {
      const html = shipped.get(post.output);
      const cta = html.match(/<aside class="post-cta">[\s\S]*?<\/aside>/g) ?? [];
      const expected = post.lang === "zh"
        ? {
            title: "Orbi 把你的 Issue 一路做到发版。",
            button: "免费试 __FREE_DELIVERIES__ 次 →",
            note: "不用绑定信用卡 · 只授权你选的仓库",
            href: "/zh/cloud/login",
            selfHost: "想自己部署？开源免费（AGPL）→",
          }
        : {
            title: "Orbi takes your Issues all the way to a release.",
            button: "Try __FREE_DELIVERIES__ deliveries free →",
            note: "No credit card required · Orbi only sees the repos you pick",
            href: "/cloud/login",
            selfHost: "Prefer to self-host? It's open source (AGPL) →",
          };
      expect(cta, `${post.output}: CTA count`).toHaveLength(1);
      const [block] = cta;
      const relatedHeading = post.lang === "zh" ? '<h2 id="相关">' : '<h2 id="related">';
      expect(html.indexOf(block), `${post.output}: CTA precedes related posts`).toBeLessThan(html.indexOf(relatedHeading));
      expect(block).toContain(`<h2>${expected.title}</h2>`);
      expect(block).toContain(`<a class="button button-signal" data-cta="post-start" href="${expected.href}">${expected.button}</a>`);
      expect(block).toContain(`<p class="post-cta-note">${expected.note}</p>`);
      expect(block).toContain(`<a class="post-cta-link" data-cta="post-selfhost" href="https://github.com/orbi-build/orbi">${expected.selfHost}</a>`);
    }
  });

  it("renders each post's Markdown body as HTML under the front-matter title", () => {
    for (const post of [enPost(), zhPost()]) {
      const html = shipped.get(post.output);
      expect(html, `${post.output}: title from front matter`).toContain(`<h1 id="post-title">${post.title}</h1>`);
      // Every post ships Markdown links; the rendered body must carry them
      // as HTML, produced by marked. Assert the shapes, not one post's URL,
      // so a later post cannot fail on its own links. Not every post ships a
      // fenced code block (the Issue #552 post ships none), so only the
      // absence of raw fences is pinned here.
      expect(html, `${post.output}: no raw markdown fences survive`).not.toContain("```");
      expect(html, `${post.output}: rendered link`).toMatch(/<a href="https:\/\/[^"]+">/);
      expect(html, `${post.output}: no raw markdown link syntax survives`).not.toMatch(/\]\(https:\/\//);
    }
  });

  it("generates an RSS 2.0 feed of the English posts that parses as XML with one item per post", async () => {
    const builtFeed = await readFile(join(builtDir, "blog", "feed.xml"), "utf8");
    expect(builtFeed, "public/blog/feed.xml drifted from the build").toBe(shippedFeed);
    // A real XML parse, not a regex, over the shipped file's actual bytes:
    // python3 is already a standing requirement of this repository's CI
    // (tests.test_landing runs on it in every workflow).
    const parsed = JSON.parse(execFileSync("python3", ["-c", `
import json, sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
channel = root.find("channel")
print(json.dumps({
    "root": root.tag,
    "version": root.get("version"),
    "title": channel.findtext("title"),
    "link": channel.findtext("link"),
    "items": [{"title": i.findtext("title"), "link": i.findtext("link"),
               "guid": i.findtext("guid"), "guidAttr": i.find("guid").get("isPermaLink"),
               "pubDate": i.findtext("pubDate"), "description": i.findtext("description")}
              for i in channel.findall("item")],
}))
`, join(ROOT, "public", "blog", "feed.xml")], { timeout: 30_000, encoding: "utf8" }));
    const enItems = posts.filter((post) => post.lang === "en");
    expect(parsed.root).toBe("rss");
    expect(parsed.version).toBe("2.0");
    expect(parsed.title).toBe("Orbi Blog");
    expect(parsed.link).toBe("https://orbi.build/blog/");
    expect(parsed.items, "one item per English post, newest first").toHaveLength(enItems.length);
    for (const [i, item] of parsed.items.entries()) {
      expect(item.title).toBe(enItems[i].headline);
      expect(item.link).toBe(`https://orbi.build${enItems[i].href}`);
      expect(item.guid).toBe(`https://orbi.build${enItems[i].href}`);
      expect(item.guidAttr).toBe("true");
      expect(item.pubDate).toBe(new Date(`${enItems[i].date}T00:00:00Z`).toUTCString());
      expect(item.description).toBe(enItems[i].summary);
    }
  });

  it("lists /blog/, /zh/blog/ and every post URL in the sitemap", () => {
    for (const post of posts) {
      expect(shippedSitemap).toContain(`<loc>https://orbi.build${post.href}</loc>`);
    }
    expect(shippedSitemap).toContain("<loc>https://orbi.build/blog/</loc>");
    expect(shippedSitemap).toContain("<loc>https://orbi.build/zh/blog/</loc>");
  });

  it("keeps the same-date rule on the same-slug pairs that exist (Issue #214)", async () => {
    const enDir = join(ROOT, "content", "blog");
    const enFiles = (await readdir(enDir)).filter((f) => f.endsWith(".md"));
    expect(enFiles.length, "the blog must ship at least one post").toBeGreaterThan(0);
    const zhFiles = new Set((await readdir(join(enDir, "zh"))).filter((f) => f.endsWith(".md")));
    // Each same-slug zh mirror is compared against its own en counterpart's
    // front-matter date, not against the newest post's: with two posts of
    // different dates the newest-only check would fail the older pair falsely.
    // An en file with no same-slug zh file is a single-language post — valid
    // since Issue #214, nothing to compare.
    const frontDate = (source, name) => {
      const block = source.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
      expect(block, `${name}: missing the --- front-matter block`).toBeTruthy();
      const date = block.match(/^date:\s?(.+)$/m)?.[1]?.trim();
      expect(date, `${name}: missing the date field`).toBeTruthy();
      return date;
    };
    for (const file of enFiles) {
      const enDate = frontDate(await readFile(join(enDir, file), "utf8"), `content/blog/${file}`);
      if (!zhFiles.has(file)) continue;
      const zhSource = await readFile(join(enDir, "zh", file), "utf8");
      expect(frontDate(zhSource, `content/blog/zh/${file}`), `content/blog/zh/${file}: mirror must carry the same date as content/blog/${file}`).toBe(enDate);
    }
  });

  it("links the blog from the primary nav on both language homes", () => {
    expect(footerRegion(shipped.get("index.html"))).toContain('<a href="/blog/">Blog</a>');
    expect(footerRegion(shipped.get("zh/index.html"))).toContain('<a href="/zh/blog/">博客</a>');
  });
});

// Issue #540 removed the blog positioning-copy test (Issue #398): it pinned
// description lengths and positioning phrases verbatim.

// Issue #215: the Blog section of llms.txt is generated from content/blog/**
// like the indexes, feed and sitemap — adding a post never needs a second
// manual edit in another file. The hand-written prose (every section above
// and below) lives in site/llms.txt; only the post list at the
// <!--@llms-blog--> marker is generated, newest first, in the format the
// hand-maintained file used.
describe("llms.txt Blog section is generated (Issue #215)", () => {
  const entryRe = /^- (.+) \((English|Chinese)\):\n  (https:\/\/orbi\.build\/(?:zh\/)?blog\/[^/\s]+\/)$/gm;

  it("builds llms.txt from site/llms.txt byte-for-byte", () => {
    expect(generatedLlms, "public/llms.txt drifted from the build").toBe(shippedLlms);
  });

  it("keeps the hand-written prose in the source, with the marker and no hand-listed posts", async () => {
    const source = await readFile(join(ROOT, "site", "llms.txt"), "utf8");
    const section = source.slice(source.indexOf("## Blog"), source.indexOf("## Links"));
    expect(section, "site/llms.txt: Blog prose missing").toContain("Shipping notes from the root domain");
    expect(section, "site/llms.txt: RSS feed link missing").toContain("https://orbi.build/blog/feed.xml");
    expect(section, "site/llms.txt: missing the <!--@llms-blog--> marker").toContain("<!--@llms-blog-->");
    expect([...section.matchAll(/^- /gm)], "site/llms.txt must not hand-list posts").toEqual([]);
  });

  it("ships no build marker in public/llms.txt", () => {
    expect(shippedLlms).not.toContain("<!--@llms-blog-->");
  });

  it("lists exactly the content/blog posts — newest first, one entry per language, nothing else", () => {
    const start = shippedLlms.indexOf("## Blog");
    const end = shippedLlms.indexOf("## Links");
    expect(start, "Blog section missing").toBeGreaterThan(-1);
    expect(end, "Links section missing").toBeGreaterThan(start);
    const section = shippedLlms.slice(start, end);
    const matched = [...section.matchAll(entryRe)];
    // Nothing else: every "- " line parses as an entry, so a removed post
    // cannot leave a stale line and no foreign line can hide here.
    expect([...section.matchAll(/^- /gm)], "unparseable list lines in the Blog section")
      .toHaveLength(matched.length);
    expect(matched.map((m) => m[3])).toEqual(posts.map((post) => `https://orbi.build${post.href}`));
    for (const [i, m] of matched.entries()) {
      expect(m[1], `entry ${i} title`).toBe(posts[i].title);
      expect(m[2], `entry ${i} language`).toBe(posts[i].lang === "zh" ? "Chinese" : "English");
    }
  });

  it("replaces each marker: the prose around them survives byte-for-byte", () => {
    const source = "## Blog\n\nIntro prose.\n\n<!--@llms-blog-->\n\n## Guides\n\n<!--@llms-guides-->\n\n## Links\n";
    const out = renderLlms(
      source,
      [{ lang: "en", title: "Fixture", href: "/blog/fixture/" }],
      [{ slug: "fixture-guide", en: { title: "Guide", summary: "Summary." }, zh: { title: "指南", summary: "摘要。" } }],
    );
    expect(out).toBe(
      "## Blog\n\nIntro prose.\n\n- Fixture (English):\n  https://orbi.build/blog/fixture/\n\n## Guides\n\n"
      + "- Guide (English):\n  https://orbi.build/guides/fixture-guide/\n  Summary.\n"
      + "- 指南 (Chinese):\n  https://orbi.build/zh/guides/fixture-guide/\n  摘要。\n\n## Links\n",
    );
  });

  it("fails the build when the source lost the Blog marker", () => {
    expect(() => renderLlms("## Blog\n\nno marker here\n", []))
      .toThrow(/site\/llms\.txt[\s\S]*<!--@llms-blog-->/);
  });

  it("fails the build when the source lost the Guides marker", () => {
    expect(() => renderLlms("## Blog\n\n<!--@llms-blog-->\n\n## Guides\n\nno marker here\n", []))
      .toThrow(/site\/llms\.txt[\s\S]*<!--@llms-guides-->/);
  });
});

// Issue #212 failure path: a post missing any front-matter field must fail
// the build with the file path in the error, never skip silently.
describe("blog failure path (Issue #212)", () => {
  const front = (fields) =>
    `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\nBody paragraph.\n`;
  const full = { title: "T", date: "2026-09-18", summary: "s", lang: "en", author: "Orbi", image: "/img/blog-t.png" };

  it("fails with the file path when the front-matter block is missing", () => {
    expect(() => postFromSource("t.md", "no front matter here"))
      .toThrow(/content\/blog\/t\.md/);
  });

  it("fails with the file path when a post has no title", () => {
    const { title, ...fields } = full;
    expect(() => postFromSource("t.md", front(fields)))
      .toThrow(/content\/blog\/t\.md[\s\S]*"title"/);
  });

  it("fails with the file path when a post has no date", () => {
    const { date, ...fields } = full;
    expect(() => postFromSource("t.md", front(fields)))
      .toThrow(/content\/blog\/t\.md[\s\S]*"date"/);
  });

  it("fails with the file path when the date is not YYYY-MM-DD", () => {
    expect(() => postFromSource("t.md", front({ ...full, date: "September 18" })))
      .toThrow(/content\/blog\/t\.md[\s\S]*"date"/);
  });

  it("fails with the file path when a post has no summary", () => {
    const { summary, ...fields } = full;
    expect(() => postFromSource("t.md", front(fields)))
      .toThrow(/content\/blog\/t\.md[\s\S]*"summary"/);
  });

  it("fails with the file path when the summary is empty", () => {
    expect(() => postFromSource("t.md", front({ ...full, summary: "  " })))
      .toThrow(/content\/blog\/t\.md[\s\S]*"summary"/);
  });

  it("fails with the file path when a post has no lang", () => {
    const { lang, ...fields } = full;
    expect(() => postFromSource("t.md", front(fields)))
      .toThrow(/content\/blog\/t\.md[\s\S]*"lang"/);
  });

  it("fails with the file path when lang contradicts the file's directory", () => {
    expect(() => postFromSource("zh/t.md", front({ ...full, lang: "en" })))
      .toThrow(/content\/blog\/zh\/t\.md[\s\S]*lang/);
  });
});

describe("blog table rendering (Issue #393)", () => {
  const front = (body) => `---\ntitle: T\ndate: 2026-09-18\nsummary: s\nlang: en\nauthor: Orbi\nimage: /img/blog-t.png\n---\n\n${body}\n`;

  it("wraps each Markdown table in one scroll container", () => {
    const post = postFromSource("t.md", front(`| A | B |
| - | - |
| 1 | 2 |`));
    expect(post.html).toContain('<div class="post-table-scroll"><table>');
    expect(post.html.match(/class="post-table-scroll"/g)).toHaveLength(1);
  });

  it("wraps nested tables recursively without double-wrapping a table", () => {
    const html = '<table><tr><td><table><tr><td>x</td></tr></table></td></tr></table>';
    const wrapped = wrapRenderedTables(html);
    expect(wrapped).toBe('<div class="post-table-scroll"><table><tr><td><div class="post-table-scroll"><table><tr><td>x</td></tr></table></div></td></tr></table></div>');
    expect(wrapped.match(/<div class="post-table-scroll"><table/g)).toHaveLength(2);
  });

  it("defines the table scroll and token-based table styles in the post template", async () => {
    const template = await readFile(join(ROOT, "site", "partials", "post.html"), "utf8");
    expect(template).toContain(".post-table-scroll { overflow-x: auto; }");
    expect(template).toContain("border-collapse: collapse");
    expect(template).toContain("border: 1px solid var(--line)");
    expect(template).toContain("background: var(--paper-2)");
    expect(template).not.toMatch(/\.post-body table[^}]*#[0-9a-f]{3,8}/i);
  });
});

describe("blog rich metadata and safe media (Issue #328)", () => {
  const expectUniquePostImages = (blogPosts) => {
    const english = blogPosts.filter((post) => post.lang === "en");
    expect(new Set(blogPosts.map((post) => post.image)).size).toBe(english.length);
  };

  const front = (fields, body = "Body paragraph.") =>
    `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n${body}\n`;
  const full = {
    title: "T", date: "2026-09-18", summary: "s", lang: "en", author: "Orbi",
    image: "/img/blog-t.png",
  };

  it("requires a post image and author, and carries optional video metadata", () => {
    expect(() => postFromSource("t.md", front({ ...full, author: "" }))).toThrow(/author/);
    expect(() => postFromSource("t.md", front({ ...full, image: "" }))).toThrow(/image/);
    const post = postFromSource("t.md", front({
      ...full,
      video_name: "Setup",
      video_description: "The setup.",
      video_thumbnail: "/img/blog-t.png",
      video_upload_date: "2026-09-18",
      video_duration: "PT66S",
      video_embed_url: "https://www.youtube.com/embed/example",
    }));
    expect(post.author).toBe("Orbi");
    expect(post.image).toBe("/img/blog-t.png");
    expect(post.video.embedUrl).toContain("youtube.com/embed");
  });

  it("rejects any image without a non-empty alt and raw HTML outside the media whitelist", () => {
    expect(() => postFromSource("t.md", front(full, '<img src="/x.png">'))).toThrow(/alt/);
    expect(() => postFromSource("t.md", front(full, "![](/x.png)"))).toThrow(/alt/);
    expect(() => postFromSource("t.md", front(full, "<div>not allowed</div>"))).toThrow(/HTML tag.*div/);
  });

  it("renders allowed figure, image, and iframe HTML", () => {
    const post = postFromSource("t.md", front(full, '<figure><img src="/x.png" alt="A screen"><iframe src="https://www.youtube.com/embed/x" title="Video"></iframe></figure>'));
    expect(post.html).toContain('<img src="/x.png" alt="A screen">');
    expect(post.html).toContain("youtube.com/embed/x");
  });

  it("renders accessible inline SVG and keeps local references", () => {
    const svg = '<figure><svg role="img" aria-label="Pipeline" viewBox="0 0 100 40"><title>Pipeline</title><defs><symbol id="box"><rect width="20" height="10" /></symbol></defs><use href="#box" /></svg><figcaption>Pipeline</figcaption></figure>';
    const post = postFromSource("t.md", front(full, svg));
    expect(post.html).toContain('<svg role="img" aria-label="Pipeline"');
    expect(post.html).toContain('<use href="#box" />');
  });

  it("rejects every SVG without an accessible name", () => {
    expect(() => postFromSource("t.md", front(full, '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>')))
      .toThrow(/svg.*aria-label.*title/);
    expect(() => postFromSource("t.md", front(full, '<svg role="img" data-aria-label="not an accessible name"><rect /></svg>')))
      .toThrow(/svg.*aria-label.*title/);
    expect(() => postFromSource("t.md", front(full, '<svg role="img" aria-label="Outer"><svg><rect /></svg></svg>')))
      .toThrow(/svg.*aria-label.*title/);
  });

  it.each([
    ["script", "<script>alert(1)</script>"],
    ["foreignObject", "<foreignObject></foreignObject>"],
    ["animate", "<animate attributeName=\"x\" />"],
    ["image", "<image href=\"#asset\" />"],
  ])("rejects SVG tag <%s>", (_tag, element) => {
    expect(() => postFromSource("t.md", front(full, `<svg role="img" aria-label="Diagram">${element}</svg>`)))
      .toThrow(/HTML tag/);
  });

  it("rejects event handlers and external SVG hrefs but permits local hrefs", () => {
    expect(() => postFromSource("t.md", front(full, '<svg role="img" aria-label="Diagram" onclick="alert(1)"></svg>')))
      .toThrow(/event handler/);
    expect(() => postFromSource("t.md", front(full, '<figure onmouseover="alert(1)"><img src="/x" alt="x"></figure>')))
      .toThrow(/event handler/);
    expect(() => postFromSource("t.md", front(full, '<svg role="img" aria-label="Diagram"><use href="https://example.com/icon.svg#x" /></svg>')))
      .toThrow(/external.*href/);
    expect(() => postFromSource("t.md", front(full, '<svg role="img" aria-label="Diagram"><use href=https://example.com/icon.svg#x /></svg>')))
      .toThrow(/external.*href/);
    expect(() => postFromSource("t.md", front(full, '<svg role="img" aria-label="Diagram"><use href="javascript:alert(1)" /></svg>')))
      .toThrow(/external.*href/);
    expect(() => postFromSource("t.md", front(full, '<svg role="img" aria-label="Diagram"><use href="#local" /></svg>'))).not.toThrow();
  });

  it("rechecks SVG safety after Markdown rendering", () => {
    expect(() => validateRenderedPostBody("content/blog/t.md", '<p><svg role="img" aria-label="Diagram"><use href="https://example.com/x" /></svg></p>'))
      .toThrow(/external.*href/);
  });

  it("emits responsive SVG styles in the post template", async () => {
    const template = await readFile(join(ROOT, "site", "partials", "post.html"), "utf8");
    expect(template).toContain(".post-body svg { max-width: 100%; height: auto; }");
  });

  it("fails incomplete video front matter instead of emitting partial structured data", () => {
    expect(() => postFromSource("t.md", front({ ...full, video_name: "Setup" }))).toThrow(/video/);
  });

  it("ships one Article per post and a VideoObject for the video post", () => {
    for (const post of posts) {
      const html = shipped.get(post.output);
      expect(html.match(/<script type="application\/ld\+json">/g)).toHaveLength(post.video ? 2 : 1);
      expect(html).toContain(`\"@type\":\"Article\"`);
      // Issue #887: every post names the same Person, with the author page
      // (see tests/blog-author.test.js for the full contract).
      expect(articleOf(html).author["@type"], post.output).toBe("Person");
      expect(articleOf(html).author.name, post.output).toBe(post.author);
      expect(html).toContain(`https://orbi.build${post.image}`);
    }
    const watch = shipped.get("blog/watch-the-six-steps/index.html");
    expect(watch).toContain('"@type":"VideoObject"');
    expectUniquePostImages(posts);
  });

  // Issue #862: the Article author must name the real author, and every post
  // carries a publisher and mainEntityOfPage so search and AI answers can
  // attribute it. Issue #887 gives that Person the author page URL and both
  // profiles; tests/blog-author.test.js pins the full object for all posts.
  it("names each post's author as a Person with publisher and mainEntityOfPage (Issues #862, #887)", () => {
    const firstPerson = [
      ["blog/pi-agent-harness/index.html", "https://orbi.build/blog/pi-agent-harness/"],
      ["zh/blog/pi-agent-harness/index.html", "https://orbi.build/zh/blog/pi-agent-harness/"],
      ["blog/orbi-on-pi-coding-agent/index.html", "https://orbi.build/blog/orbi-on-pi-coding-agent/"],
      ["zh/blog/orbi-on-pi-coding-agent/index.html", "https://orbi.build/zh/blog/orbi-on-pi-coding-agent/"],
      ["blog/run-claude-code-unattended/index.html", "https://orbi.build/blog/run-claude-code-unattended/"],
      ["zh/blog/run-claude-code-unattended/index.html", "https://orbi.build/zh/blog/run-claude-code-unattended/"],
    ];
    for (const [output, canonical] of firstPerson) {
      const html = shipped.get(output);
      expect(html, `${output}: missing output`).toBeTruthy();
      const article = articleOf(html);
      expect(article.author["@type"], output).toBe("Person");
      expect(article.author.name, output).toBe("Lawrence Liu");
      expect(article.publisher, output).toEqual({
        "@type": "Organization",
        name: "Orbi",
        url: "https://orbi.build/",
        logo: { "@type": "ImageObject", url: "https://orbi.build/logo-mark.svg" },
      });
      expect(html, output).toContain(`<link rel="canonical" href="${canonical}">`);
      expect(article.mainEntityOfPage, output).toBe(canonical);
    }
  });

  it("names the publisher and mainEntityOfPage on every post, never an Organization author (Issue #887)", () => {
    // Issue #887 retired the per-post Organization author: the k8e post (and
    // every other) now attributes a Person, so the corpus cannot drift back.
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      const article = articleOf(shipped.get(post.output));
      expect(article.author, post.output).not.toEqual({ "@type": "Organization", name: "Orbi" });
      expect(article.publisher, post.output).toEqual({
        "@type": "Organization",
        name: "Orbi",
        url: "https://orbi.build/",
        logo: { "@type": "ImageObject", url: "https://orbi.build/logo-mark.svg" },
      });
      expect(article.mainEntityOfPage, post.output).toBe(`https://orbi.build${post.href}`);
    }
  });

  it("rejects shared images between articles but permits an EN/ZH mirror pair", () => {
    const sharedImage = "/img/blog-shared.png";
    expect(() => expectUniquePostImages([
      { lang: "en", image: sharedImage },
      { lang: "en", image: sharedImage },
    ])).toThrow();

    expect(() => expectUniquePostImages([
      { lang: "en", image: sharedImage },
      { lang: "zh", image: sharedImage },
    ])).not.toThrow();
  });

  it("keeps all seven onboarding screenshot sources at one uniform 2560 x 1440 size", async () => {
    const watch = shipped.get("blog/watch-the-six-steps/index.html");
    const stepImages = [...watch.matchAll(/<img src="(\/img\/step-[^"]+\.png)"[^>]+>/g)];
    expect(stepImages).toHaveLength(7);

    for (const [, src] of stepImages) {
      const baseSrc = src.replace(/-2x\.png$/, ".png");
      const png = await readFile(join(ROOT, "public", baseSrc));
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      const width = png.readUInt32BE(16);
      const height = png.readUInt32BE(20);
      expect({ src, width, height }).toEqual({ src, width: 2560, height: 1440 });
    }
    for (const match of stepImages) {
      expect(match[0]).toContain(`width="2560" height="1440"`);
      const base = match[1].replace(/\.png$/, "");
      expect(match[0]).toContain(`srcset="${base}-1600.webp 1600w, ${base}-2400.webp 2400w"`);
      expect(match[0]).toContain('sizes="(min-width: 900px) 784px, 100vw"');
    }
  });
});

// Issue #214: pairing is no longer "same slug or nothing". A post may declare
// `mirror: <slug>` naming its counterpart in the other language directory, a
// same-slug file pairs by default, and a post with neither publishes alone —
// its language switcher at the other language's blog index, never a 404. A
// dangling or non-mutual `mirror:` fails the build naming both files.
describe("blog mirror pairing (Issue #214)", () => {
  const front = (fields) =>
    `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\nBody paragraph.\n`;
  const full = { title: "T", date: "2026-09-18", summary: "s", lang: "en", author: "Orbi", image: "/img/blog-t.png" };
  const writePost = async (contentDir, name, fields) => {
    await mkdir(dirname(join(contentDir, name)), { recursive: true });
    await writeFile(join(contentDir, name), front(fields));
  };
  const withContent = (fn) =>
    mkdtemp(join(tmpdir(), "orbi-content-")).then(async (contentDir) => {
      try {
        return await fn(contentDir);
      } finally {
        await rm(contentDir, { recursive: true, force: true });
      }
    });

  it("keeps the same-slug pair working with no front-matter change", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "same.md", { ...full, title: "Same" });
      await writePost(contentDir, "zh/same.md", { ...full, title: "Same 旧", lang: "zh" });
      const posts = await collectPosts(contentDir);
      expect(posts.map((post) => post.output).sort()).toEqual([
        "blog/same/index.html",
        "zh/blog/same/index.html",
      ]);
      for (const post of posts) {
        expect(post.paired, `${post.output}: paired`).toBe(true);
        expect(post.mirrorOutput, `${post.output}: switcher target`).toBe(
          post.lang === "en" ? "zh/blog/same/index.html" : "blog/same/index.html",
        );
      }
    }));

  it("pairs a mirror:-declared pair across different slugs, both directions", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "alpha.md", { ...full, title: "Alpha", mirror: "beta" });
      await writePost(contentDir, "zh/beta.md", { ...full, title: "Beta 旧", lang: "zh", mirror: "alpha" });
      const posts = await collectPosts(contentDir);
      expect(posts).toHaveLength(2);
      const alpha = posts.find((post) => post.slug === "alpha");
      const beta = posts.find((post) => post.slug === "beta");
      expect(alpha.mirrorOutput, "alpha switches to beta").toBe("zh/blog/beta/index.html");
      expect(beta.mirrorOutput, "beta switches to alpha").toBe("blog/alpha/index.html");
    }));

  it("publishes a single-language post with the switcher at the other language's blog index", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "solo.md", { ...full, title: "Solo" });
      let posts = await collectPosts(contentDir);
      expect(posts).toHaveLength(1);
      expect(posts[0].paired).toBe(false);
      expect(posts[0].mirrorOutput).toBe("zh/blog/index.html");

      await rm(join(contentDir, "solo.md"));
      await writePost(contentDir, "zh/solo.md", { ...full, title: "Solo 旧", lang: "zh" });
      posts = await collectPosts(contentDir);
      expect(posts).toHaveLength(1);
      expect(posts[0].paired).toBe(false);
      expect(posts[0].mirrorOutput).toBe("blog/index.html");
    }));

  it("fails naming both files when mirror: names a file that does not exist", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "a.md", { ...full, mirror: "b" });
      await expect(collectPosts(contentDir)).rejects
        .toThrow(/content\/blog\/a\.md[\s\S]*mirror: b[\s\S]*content\/blog\/zh\/b\.md/);
    }));

  it("fails naming both files when the named mirror names nothing back", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "a.md", { ...full, mirror: "b" });
      await writePost(contentDir, "zh/b.md", { ...full, lang: "zh" });
      await expect(collectPosts(contentDir)).rejects
        .toThrow(/content\/blog\/a\.md names content\/blog\/zh\/b\.md as its mirror, but content\/blog\/zh\/b\.md names no mirror/);
    }));

  it("fails naming both files when the named mirror names a different post", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "a.md", { ...full, mirror: "b" });
      await writePost(contentDir, "c.md", { ...full, title: "C", mirror: "b" });
      await writePost(contentDir, "zh/b.md", { ...full, lang: "zh", mirror: "c" });
      await expect(collectPosts(contentDir)).rejects
        .toThrow(/content\/blog\/a\.md names content\/blog\/zh\/b\.md as its mirror, but content\/blog\/zh\/b\.md names content\/blog\/c\.md/);
    }));

  it("fails naming the file when mirror: is empty", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "a.md", { ...full, mirror: "" });
      await expect(collectPosts(contentDir)).rejects
        .toThrow(/content\/blog\/a\.md[\s\S]*"mirror"/);
    }));
});

describe("blog hreflang metadata (Issue #696)", () => {
  it("emits exactly three mutual alternates for every paired post", () => {
    const paired = posts.filter((post) => post.paired);
    expect(paired.length).toBeGreaterThan(0);
    for (const post of paired) {
      const html = shipped.get(post.output);
      const enHref = `https://orbi.build${post.lang === "en" ? post.href : pathToHref(post.mirrorOutput)}`;
      const zhHref = `https://orbi.build${post.lang === "zh" ? post.href : pathToHref(post.mirrorOutput)}`;
      const links = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)]
        .map((match) => [match[1], match[2]]);
      expect(links, `${post.output}: exactly three hreflang links`).toEqual([
        ["en", enHref],
        ["zh-CN", zhHref],
        ["x-default", enHref],
      ]);
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      expect(links.find(([lang]) => lang === (post.lang === "en" ? "en" : "zh-CN"))[1], `${post.output}: self canonical`)
        .toBe(canonical);
    }
    for (const post of posts.filter((candidate) => !candidate.paired)) {
      expect(shipped.get(post.output), `${post.output}: single-language post`).not.toMatch(/hreflang=/);
    }
  });
});

// Issue #212 acceptance 7: a brand-new post fixture goes through the real
// build — post page with title and rendered body HTML, index entry newest
// first, feed item, sitemap URL — never a re-implementation of the pipeline.
describe("blog content pipeline end to end (Issue #212 acceptance 7)", () => {
  const md = (title, date, summary, lang) => `---
title: ${title}
date: ${date}
summary: ${summary}
lang: ${lang}
author: Lawrence Liu
image: /img/fixture.png
---

Intro for ${title} with \`inline code\`.

\`\`\`bash
echo hello from ${title}
\`\`\`

See [the docs](https://docs.orbi.build/docker).
`;

  it("drives fixture posts through the real build into page, index, feed and sitemap", async () => {
    const contentDir = await mkdtemp(join(tmpdir(), "orbi-content-"));
    const outDir = await mkdtemp(join(tmpdir(), "orbi-fixture-build-"));
    try {
      await mkdir(join(contentDir, "zh"), { recursive: true });
      await writeFile(join(contentDir, "fixture-old.md"), md("Fixture old", "2026-09-01", "The older fixture post.", "en"));
      await writeFile(join(contentDir, "zh", "fixture-old.md"), md("Fixture 旧", "2026-09-01", "The older fixture post, in Chinese.", "zh"));
      await writeFile(join(contentDir, "fixture-new.md"), md("Fixture new", "2026-09-10", "The newer fixture post.", "en"));
      await writeFile(join(contentDir, "zh", "fixture-new.md"), md("Fixture 新", "2026-09-10", "The newer fixture post, in Chinese.", "zh"));

      await buildPages(outDir, { contentDir });

      // The rendered post: title and body HTML plus the derived meta.
      const newHtml = await readFile(join(outDir, "blog", "fixture-new", "index.html"), "utf8");
      expect(newHtml).toContain("<title>Fixture new | Orbi</title>");
      expect(newHtml).toContain('<h1 id="post-title">Fixture new</h1>');
      expect(newHtml).toContain('<link rel="canonical" href="https://orbi.build/blog/fixture-new/">');
      expect(newHtml).toContain('<meta property="article:published_time" content="2026-09-10">');
      expect(newHtml).toContain('Intro for Fixture new with <code class="post-code--spaced">inline code</code>');
      expect(newHtml).toContain("<pre><code");
      expect(newHtml).toContain("echo hello from Fixture new");
      expect(newHtml).toContain('<a href="https://docs.orbi.build/docker">the docs</a>');
      expect(newHtml, "shared nav must render").toContain('<nav id="');
      expect(newHtml, "shared footer must render").toContain('<footer class="site-footer shell">');

      // The index: both entries present, the newer one first.
      const index = await readFile(join(outDir, "blog", "index.html"), "utf8");
      const newAt = index.indexOf('<a href="/blog/fixture-new/">Fixture new</a>');
      const oldAt = index.indexOf('<a href="/blog/fixture-old/">Fixture old</a>');
      expect(newAt, "the newer fixture post must be listed").toBeGreaterThan(-1);
      expect(oldAt, "the older fixture post must be listed").toBeGreaterThan(-1);
      expect(newAt, "newest first").toBeLessThan(oldAt);
      const zhIndex = await readFile(join(outDir, "zh", "blog", "index.html"), "utf8");
      expect(zhIndex).toContain('<a href="/zh/blog/fixture-new/">Fixture 新</a>');

      // The feed: real XML parse, one item per English post, newest first.
      const parsed = JSON.parse(execFileSync("python3", ["-c", `
import json, sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
channel = root.find("channel")
print(json.dumps({
    "items": [{"title": i.findtext("title"), "link": i.findtext("link")}
              for i in channel.findall("item")],
}))
`, join(outDir, "blog", "feed.xml")], { timeout: 30_000, encoding: "utf8" }));
      expect(parsed.items.map((item) => item.link)).toEqual([
        "https://orbi.build/blog/fixture-new/",
        "https://orbi.build/blog/fixture-old/",
      ]);

      // The sitemap: every fixture post URL, both languages.
      const sitemap = await readFile(join(outDir, "sitemap.xml"), "utf8");
      for (const href of ["/blog/fixture-new/", "/blog/fixture-old/", "/zh/blog/fixture-new/", "/zh/blog/fixture-old/"]) {
        expect(sitemap).toContain(`<loc>https://orbi.build${href}</loc>`);
      }

      // Issue #215: the generated llms.txt Blog section picks the fixture
      // posts up with no manual edit anywhere — newest first, both languages,
      // and none of the real posts (the list is built from the content dir,
      // not from a hand-maintained file).
      const llms = await readFile(join(outDir, "llms.txt"), "utf8");
      const llmsSection = llms.slice(llms.indexOf("## Blog"), llms.indexOf("## Links"));
      expect(llmsSection).toContain("- Fixture new (English):\n  https://orbi.build/blog/fixture-new/");
      expect(llmsSection).toContain("- Fixture 新 (Chinese):\n  https://orbi.build/zh/blog/fixture-new/");
      expect(llmsSection).toContain("- Fixture old (English):\n  https://orbi.build/blog/fixture-old/");
      expect(llmsSection.indexOf("fixture-new"), "newest first").toBeLessThan(llmsSection.indexOf("fixture-old"));
      expect(llmsSection, "generated Blog section must not list real posts").not.toContain("docker-image-third-try");
    } finally {
      await rm(contentDir, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });
});

describe("legal contact addresses (Issue #307)", () => {
  it("uses domain mailboxes on every English and Chinese legal/support page", () => {
    const expected = {
      "privacy/index.html": ["privacy@orbi.build", 2],
      "zh/privacy/index.html": ["privacy@orbi.build", 2],
      "terms/index.html": ["support@orbi.build", 2],
      "zh/terms/index.html": ["support@orbi.build", 2],
      "support/index.html": ["support@orbi.build", 4],
      "zh/support/index.html": ["support@orbi.build", 4],
    };

    for (const [output, [address, count]] of Object.entries(expected)) {
      const html = shipped.get(output);
      expect(html, `${output} is shipped`).toBeTruthy();
      expect(html, `${output} must not expose Gmail`).not.toMatch(/gmail\.com/i);
      expect(html.split(address).length - 1).toBe(count);
      expect(html).toContain(`mailto:${address}`);
    }
  });
});

// Issue #813: the terms billing paragraph is the contract the /cloud/
// pricing page actually sells — the yearly interval and the one-time
// Alipay / WeChat Pay path must not diverge between the two.
describe("terms billing copy matches the Cloud pricing page (Issue #813)", () => {
  const expected = {
    "terms/index.html": [
      "Card subscriptions are handled by Stripe, which provides invoices and the customer portal. They renew monthly or yearly, matching the interval you chose, until you cancel in that portal. Alipay and WeChat Pay are one-time payments for the period you buy and do not renew automatically.",
      "A subscription renews monthly until you cancel it through that portal.",
    ],
    "zh/terms/index.html": [
      "银行卡订阅由 Stripe 处理，提供发票和客户门户，按你选择的周期每月或每年续费，直到你在门户中取消。支付宝和微信支付是按所购周期一次性付款，不会自动续费。",
      "订阅会每月续费，直到你在门户中取消。",
    ],
  };

  for (const [output, [current, stale]] of Object.entries(expected)) {
    it(`${output} states the yearly interval and the one-time payments`, () => {
      const html = shipped.get(output);
      expect(html, `${output} is shipped`).toBeTruthy();
      expect(html, `${output}: billing paragraph`).toContain(current);
      expect(html, `${output}: stale monthly-only sentence`).not.toContain(stale);
    });
  }
});

// Issue #214 evidence: all three shapes through the real build — the
// same-slug pair, a mirror:-declared pair across different slugs, and
// single-language posts in both languages — with the rendered language
// switchers, indexes, feed, sitemap and llms.txt each shape must produce.
describe("blog mirror pairing end to end (Issue #214 evidence)", () => {
  const md = (title, date, summary, lang, mirror) => `---
title: ${title}
date: ${date}
summary: ${summary}
lang: ${lang}${mirror === undefined ? "" : `\nmirror: ${mirror}`}
author: Lawrence Liu
image: /img/fixture.png
---

Body of ${title} with [a link](https://docs.orbi.build/docker).
`;

  const switchTargets = async (outDir, output) => {
    const html = await readFile(join(outDir, output), "utf8");
    return [...html.matchAll(/<a href="([^"]+)" lang="(?:zh-CN|en)"[^>]*>[^<]*<\/a>/g)].map((m) => m[1]);
  };

  it("publishes the same-slug pair, the declared pair and both single-language posts", async () => {
    const contentDir = await mkdtemp(join(tmpdir(), "orbi-content-"));
    const outDir = await mkdtemp(join(tmpdir(), "orbi-fixture-build-"));
    try {
      await mkdir(join(contentDir, "zh"), { recursive: true });
      await writeFile(join(contentDir, "pair.md"), md("Pair", "2026-09-01", "The same-slug pair.", "en"));
      await writeFile(join(contentDir, "zh", "pair.md"), md("Pair 旧", "2026-09-01", "The same-slug pair, in Chinese.", "zh"));
      await writeFile(join(contentDir, "alpha.md"), md("Alpha", "2026-09-02", "English comparison intent.", "en", "beta"));
      await writeFile(join(contentDir, "zh", "beta.md"), md("Beta", "2026-09-05", "Chinese method intent.", "zh", "alpha"));
      await writeFile(join(contentDir, "solo-en.md"), md("Solo EN", "2026-09-03", "English only.", "en"));
      await writeFile(join(contentDir, "zh", "solo-zh.md"), md("Solo ZH", "2026-09-04", "Chinese only.", "zh"));

      await buildPages(outDir, { contentDir });

      // Paired posts emit the same three absolute alternates in both heads;
      // each page's own alternate must match its canonical URL.
      const hreflangTags = (html) => [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)]
        .map((match) => [match[1], match[2]]);
      const expectedAlternates = [
        ["en", "https://orbi.build/blog/pair/"],
        ["zh-CN", "https://orbi.build/zh/blog/pair/"],
        ["x-default", "https://orbi.build/blog/pair/"],
      ];
      for (const output of ["blog/pair/index.html", "zh/blog/pair/index.html"]) {
        const html = await readFile(join(outDir, output), "utf8");
        expect(hreflangTags(html), `${output}: hreflang`).toEqual(expectedAlternates);
        const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
        expect(expectedAlternates.find(([lang]) => lang === (output.startsWith("zh/") ? "zh-CN" : "en"))[1])
          .toBe(canonical);
      }
      const alphaHtml = await readFile(join(outDir, "blog/alpha/index.html"), "utf8");
      const betaHtml = await readFile(join(outDir, "zh/blog/beta/index.html"), "utf8");
      const declaredAlternates = [
        ["en", "https://orbi.build/blog/alpha/"],
        ["zh-CN", "https://orbi.build/zh/blog/beta/"],
        ["x-default", "https://orbi.build/blog/alpha/"],
      ];
      expect(hreflangTags(alphaHtml), "declared EN pair: hreflang").toEqual(declaredAlternates);
      expect(hreflangTags(betaHtml), "declared ZH pair: hreflang").toEqual(declaredAlternates);
      for (const output of ["blog/solo-en/index.html", "zh/blog/solo-zh/index.html"]) {
        expect(hreflangTags(await readFile(join(outDir, output), "utf8")), `${output}: no hreflang`).toEqual([]);
      }

      // The nav language switcher points at the counterpart page for a pair,
      // or the other language's blog index for a single-language post — never
      // a page that does not exist.
      expect(await switchTargets(outDir, "blog/pair/index.html")).toEqual(["/zh/blog/pair/"]);
      expect(await switchTargets(outDir, "blog/alpha/index.html")).toEqual(["/zh/blog/beta/"]);
      expect(await switchTargets(outDir, "zh/blog/beta/index.html")).toEqual(["/blog/alpha/"]);
      expect(await switchTargets(outDir, "blog/solo-en/index.html")).toEqual(["/zh/blog/"]);
      expect(await switchTargets(outDir, "zh/blog/solo-zh/index.html")).toEqual(["/blog/"]);

      // Indexes: every post in its own language, never the other's.
      const enIndex = await readFile(join(outDir, "blog", "index.html"), "utf8");
      for (const href of ["/blog/pair/", "/blog/alpha/", "/blog/solo-en/"]) {
        expect(enIndex, `en index lists ${href}`).toContain(`<a href="${href}">`);
      }
      for (const href of ["/zh/blog/beta/", "/zh/blog/solo-zh/"]) {
        expect(enIndex, `en index must not list ${href}`).not.toContain(`href="${href}"`);
      }
      const zhIndex = await readFile(join(outDir, "zh", "blog", "index.html"), "utf8");
      for (const href of ["/zh/blog/pair/", "/zh/blog/beta/", "/zh/blog/solo-zh/"]) {
        expect(zhIndex, `zh index lists ${href}`).toContain(`<a href="${href}">`);
      }
      expect(zhIndex, "zh index must not list the en-only post").not.toContain('href="/blog/alpha/"');

      // The feed carries every English post regardless of pairing.
      const feed = await readFile(join(outDir, "blog", "feed.xml"), "utf8");
      for (const href of ["/blog/pair/", "/blog/alpha/", "/blog/solo-en/"]) {
        expect(feed, `feed lists ${href}`).toContain(`<link>https://orbi.build${href}</link>`);
      }
      expect(feed, "feed must not list the zh-only post").not.toContain("/blog/beta/");

      // The sitemap lists all six posts; pairs carry hreflang alternates to
      // each other, a single-language post lists itself with no alternate.
      const sitemap = await readFile(join(outDir, "sitemap.xml"), "utf8");
      for (const href of ["/blog/pair/", "/zh/blog/pair/", "/blog/alpha/", "/zh/blog/beta/", "/blog/solo-en/", "/zh/blog/solo-zh/"]) {
        expect(sitemap, `sitemap lists ${href}`).toContain(`<loc>https://orbi.build${href}</loc>`);
      }
      const soloUrl = sitemap.match(/<url>\n    <loc>https:\/\/orbi\.build\/blog\/solo-en\/<\/loc>[\s\S]*?<\/url>/)?.[0];
      expect(soloUrl, "solo post sitemap entry").toBeTruthy();
      expect(soloUrl, "a single-language post carries no hreflang alternate").not.toContain("xhtml:link");
      const alphaUrl = sitemap.match(/<url>\n    <loc>https:\/\/orbi\.build\/blog\/alpha\/<\/loc>[\s\S]*?<\/url>/)?.[0];
      expect(alphaUrl, "the declared pair's alternates cross-link").toContain(
        '<xhtml:link rel="alternate" hreflang="zh-CN" href="https://orbi.build/zh/blog/beta/"/>',
      );

      // llms.txt lists every published post regardless of pairing.
      const llms = await readFile(join(outDir, "llms.txt"), "utf8");
      const llmsSection = llms.slice(llms.indexOf("## Blog"), llms.indexOf("## Links"));
      for (const [title, lang, href] of [
        ["Alpha", "English", "https://orbi.build/blog/alpha/"],
        ["Beta", "Chinese", "https://orbi.build/zh/blog/beta/"],
        ["Solo EN", "English", "https://orbi.build/blog/solo-en/"],
        ["Solo ZH", "Chinese", "https://orbi.build/zh/blog/solo-zh/"],
      ]) {
        expect(llmsSection, `llms.txt lists ${title}`).toContain(`- ${title} (${lang}):\n  ${href}`);
      }
    } finally {
      await rm(contentDir, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });
});

// Issue #540 removed the GitHub sign-in disclosure test (Issue #524): it
// pinned the privacy-page sentences as regexes. The no-"signins"-table guard
// and the rest of the privacy wording are no longer pinned here.


describe("homepage evidence screenshots lazy-load (Issue #586)", () => {
  it("ships the three proof screenshots deferred on both homes", () => {
    for (const output of ["index.html", "zh/index.html"]) {
      const html = shipped.get(output);
      for (const src of ["/img/issue-48.png", "/img/pr-193.png", "/img/release-v020.png"]) {
        const img = html.match(new RegExp(`<img[^>]*src="${src}"[^>]*>`))?.[0];
        expect(img, `${output}: ${src} tag`).toBeTruthy();
        expect(img, `${output}: ${src} loading`).toContain('loading="lazy"');
        expect(img, `${output}: ${src} decoding`).toContain('decoding="async"');
      }
    }
  });
});

// Issue #890: a first-time visitor — and an AI answer engine quoting the page —
// must be able to read what Orbi is in the homepage body, not only in the
// <head> metadata. Both homes carry the definition under the H1. Issue #899
// replaced the long AGPL-first sentence with the approved two-sentence lede
// (open source + where it runs); the assertion follows the new copy.
describe("homepage body carries an Orbi definition sentence (Issues #890, #899)", () => {
  const body = (html) => html.slice(html.indexOf("<body"));
  const homes = {
    "index.html": /An open-source AI agent that takes your GitHub Issues all the way to a release\. Run it on your own machine, or on Orbi Cloud, where one sentence is enough to start\./,
    "zh/index.html": /开源的 AI 编程 agent，接过 GitHub Issue，一直做到合并发版。可以部署在自己的机器上，也可以交给 Orbi Cloud 托管，在 Cloud 上说一句话就能开始。/,
  };

  for (const [output, definition] of Object.entries(homes)) {
    it(`${output} states the definition in the rendered body`, () => {
      const html = shipped.get(output);
      expect(body(html), `${output}: body definition sentence`).toMatch(definition);
      expect(region(html, '<p class="hero-lede">', "</p>"), `${output}: definition under the H1`).toMatch(definition);
    });
  }
});
