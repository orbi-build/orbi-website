// Issue #826: guide pages render from content/guides/** Markdown, the first
// being the Pi hub at /guides/pi-coding-agent/ (+ /zh/). These tests read the
// shipped bytes in public/ (the files the Worker deploys) and drive the real
// collectors — never a re-implementation of the pipeline.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPages, collectGuides, collectPosts, lastCommitDate } from "../scripts/build-pages.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GUIDES_DIR = join(ROOT, "content", "guides");
const CONTENT_DIR = join(ROOT, "content", "blog");
const PUBLIC = join(ROOT, "public");

const SLUG = "pi-coding-agent";
const PAGES = [
  { lang: "en", output: `guides/${SLUG}/index.html`, source: `${SLUG}.md`, href: `/guides/${SLUG}/`, mirror: `/zh/guides/${SLUG}/` },
  { lang: "zh", output: `zh/guides/${SLUG}/index.html`, source: `zh/${SLUG}.md`, href: `/zh/guides/${SLUG}/`, mirror: `/guides/${SLUG}/` },
];

let guides;
let posts;
let sitemap;

const shipped = (output) => readFile(join(PUBLIC, output), "utf8");
const field = (source, name) => source.match(new RegExp(`^${name}:\\s?(.+)$`, "m"))?.[1].trim();

beforeAll(async () => {
  guides = await collectGuides();
  posts = await collectPosts();
  sitemap = await readFile(join(PUBLIC, "sitemap.xml"), "utf8");
});

describe("Markdown guide rendering (Issue #826)", () => {
  it("renders both Pi hub pages from the guide front matter", async () => {
    const collected = guides.filter((guide) => guide.slug === SLUG);
    expect(collected.map((guide) => guide.lang).sort(), "the Pi guide pair is collected").toEqual(["en", "zh"]);
    for (const page of PAGES) {
      const pageHtml = await shipped(page.output);
      const source = await readFile(join(GUIDES_DIR, page.source), "utf8");
      const title = field(source, "title");
      const summary = field(source, "summary");
      expect(title, `${page.source}: front matter title`).toBeTruthy();
      expect(pageHtml, `${page.output}: <title>`).toContain(`<title>${title}</title>`);
      expect(pageHtml, `${page.output}: description from summary`).toContain(`<meta name="description" content="${summary}">`);
      expect(pageHtml, `${page.output}: canonical points at itself`).toContain(`<link rel="canonical" href="https://orbi.build${page.href}">`);
      expect(pageHtml, `${page.output}: EN hreflang`).toContain(`hreflang="en" href="https://orbi.build${page.lang === "en" ? page.href : page.mirror}"`);
      expect(pageHtml, `${page.output}: ZH hreflang`).toContain(`hreflang="zh-CN" href="https://orbi.build${page.lang === "zh" ? page.href : page.mirror}"`);
      expect((pageHtml.match(/<h1\b/gi) ?? []), `${page.output}: one h1`).toHaveLength(1);
      expect(pageHtml, `${page.output}: h1 is the title`).toContain(`<h1 id="guide-title">${title}</h1>`);
    }
  });

  it("lists every same-language series post in the hub's generated series index", async () => {
    for (const page of PAGES) {
      const pageHtml = await shipped(page.output);
      const seriesPosts = posts.filter((post) => post.series === "pi" && post.lang === page.lang);
      expect(seriesPosts.length, `${page.output}: series posts exist`).toBeGreaterThan(0);
      for (const post of seriesPosts) {
        expect(pageHtml, `${page.output}: series index links ${post.href}`).toContain(`<li><a href="${post.href}">`);
      }
      for (const post of posts.filter((post) => post.series === "pi" && post.lang !== page.lang)) {
        expect(pageHtml, `${page.output}: must not list ${post.href}`).not.toContain(`href="${post.href}"`);
      }
      expect(pageHtml, `${page.output}: series marker replaced`).not.toContain("<!--@series:");
    }
  });

  it("links every series post back to its same-language hub page", async () => {
    const hub = (lang) => PAGES.find((page) => page.lang === lang).href;
    for (const post of posts.filter((entry) => entry.series === "pi")) {
      const pageHtml = await shipped(post.output);
      expect(pageHtml, `${post.output}: series backlink`).toContain('<p class="post-series">');
      expect(pageHtml, `${post.output}: backlink target`).toContain(`href="${hub(post.lang)}"`);
    }
    for (const post of posts.filter((entry) => !entry.series)) {
      expect(await shipped(post.output), `${post.output}: no series backlink`).not.toContain('<p class="post-series">');
    }
  });

  it("lists both hub URLs in the sitemap with a lastmod from the guide md or a series post", () => {
    const seriesPosts = posts.filter((post) => post.series === "pi");
    for (const page of PAGES) {
      const entry = sitemap.match(new RegExp(`<loc>https://orbi\\.build${page.href}</loc>([\\s\\S]*?)</url>`))?.[1];
      expect(entry, `${page.href}: sitemap entry`).toBeTruthy();
      expect(entry, `${page.href}: EN hreflang`).toContain(`hreflang="en" href="https://orbi.build${page.lang === "en" ? page.href : page.mirror}"`);
      expect(entry, `${page.href}: ZH hreflang`).toContain(`hreflang="zh-CN" href="https://orbi.build${page.lang === "zh" ? page.href : page.mirror}"`);
      const expected = [
        lastCommitDate(join(GUIDES_DIR, page.source)),
        ...seriesPosts.map((post) => lastCommitDate(join(CONTENT_DIR, post.source))),
      ].sort().at(-1);
      expect(entry, `${page.href}: lastmod`).toContain(`<lastmod>${expected}</lastmod>`);
    }
  });

  // Issue #845: the hub is a series overview, not a user how-to, so its
  // sitewide footer entry moved from the Guides row to the Resources row,
  // directly after the benchmark entry.
  it("links the hub from the footer Resources row, right after the benchmark entry", async () => {
    for (const page of PAGES) {
      const homeHtml = await shipped(page.lang === "en" ? "index.html" : "zh/index.html");
      const footer = homeHtml.match(/<footer class="site-footer shell">[\s\S]*?<\/footer>/)?.[0] ?? "";
      const heading = page.lang === "en" ? "Resources" : "资源";
      const resources = footer.match(new RegExp(`<h2>${heading}</h2>[\\s\\S]*?</div>`))?.[0] ?? "";
      const items = [...resources.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(([, href, text]) => [href, text]);
      const index = items.findIndex(([href]) => href === page.href);
      expect(index, `${page.lang}: footer Resources row must carry the hub`).toBeGreaterThan(-1);
      expect(items[index][1], `${page.lang}: hub label`).toBe(
        page.lang === "en" ? "Pi series: how Orbi is built" : "Pi 系列：Orbi 是怎么实现的",
      );
      expect(items[index - 1][0], `${page.lang}: hub must follow the benchmark entry`).toBe(
        page.lang === "en" ? "/benchmark/" : "/zh/benchmark/",
      );
    }
  });

  it("links the hub from both self-hosted guide FAQs with the requested anchor text", async () => {
    const expectations = [
      ["guides/self-hosted-coding-agent/index.html", "/guides/pi-coding-agent/", "How Orbi is built on the Pi coding agent"],
      ["zh/guides/self-hosted-coding-agent/index.html", "/zh/guides/pi-coding-agent/", "Orbi 怎么搭在 Pi coding agent 上"],
    ];
    for (const [output, href, anchor] of expectations) {
      expect(await shipped(output), `${output}: FAQ anchor`).toContain(`<a href="${href}">${anchor}</a>`);
    }
  });
});

describe("series backlink legibility on the dark post hero (Issue #833)", () => {
  it("renders .post-series in the dark-band secondary color with a 6px gap before the summary", async () => {
    const pageHtml = await shipped("blog/orbi-on-pi-coding-agent/index.html");
    const inline = pageHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    const rule = inline.match(/\.post-series\s*\{([^}]*)\}/)?.[1];
    expect(rule, "built page inline .post-series rule").toBeTruthy();
    expect(rule).toMatch(/color:\s*#9aada9/);
    expect(rule, "must not use the light-surface secondary ink on the dark hero").not.toMatch(/var\(--ink-soft\)/);
    expect(rule).toMatch(/margin:\s*10px 0 6px/);
  });
});

describe("guide front matter is validated (Issue #826)", () => {
  const fixtureDirs = [];

  afterAll(async () => {
    for (const dir of fixtureDirs) await rm(dir, { recursive: true, force: true });
  });

  it("fails the build, naming the file, when a guide md is missing a required field", async () => {
    const guidesDir = await mkdtemp(join(tmpdir(), "orbi-guides-"));
    const outDir = await mkdtemp(join(tmpdir(), "orbi-guides-build-"));
    fixtureDirs.push(guidesDir, outDir);
    await writeFile(join(guidesDir, "broken.md"), "---\ntitle: Broken\nlang: en\nmirror: broken\npublished: 2026-10-05\nupdated: 2026-10-05\n---\n\nBody.\n");
    await expect(buildPages(outDir, { guidesDir })).rejects.toThrow(/content\/guides\/broken\.md/);
  });
});

// Issue #835: a Markdown guide reuses the blog's On this page TOC — the same
// heading ids, the same five-heading threshold, the same layout — so a reader
// can jump to a layer (the merge gate, the silent-session watchdog) directly.
describe("guide On this page TOC (Issue #835)", () => {
  const guideBody = (html) => html.match(/<article class="guide-body">([\s\S]*?)<\/article>/)?.[1] ?? "";

  it("gives every Markdown H2/H3 a unique id and a TOC entry that points at it", async () => {
    for (const page of PAGES) {
      const html = await shipped(page.output);
      const body = guideBody(html);
      const headings = [...body.matchAll(/<h([23]) id="([^"]+)">[\s\S]*?<\/h\1>/g)];
      const ids = headings.map((match) => match[2]);
      expect(ids.length, `${page.output}: guide body has enough headings for a TOC`).toBeGreaterThanOrEqual(5);
      expect(ids, `${page.output}: every body H2/H3 carries an id`).toHaveLength((body.match(/<h[23]\b/g) ?? []).length);
      expect(new Set(ids).size, `${page.output}: ids are unique`).toBe(ids.length);
      if (page.lang === "zh") {
        expect(ids.some((id) => /[\u4e00-\u9fff]/u.test(id)), `${page.output}: Chinese heading id`).toBe(true);
      }

      const nav = html.match(/<nav class="post-toc"[\s\S]*?<\/nav>/)?.[0] ?? "";
      const inline = html.match(/<details class="post-toc-inline">[\s\S]*?<\/details>/)?.[0] ?? "";
      const title = page.lang === "zh" ? "本页目录" : "On this page";
      const h2Count = headings.filter((match) => match[1] === "2").length;

      expect(nav, `${page.output}: desktop TOC`).not.toBe("");
      expect(nav, `${page.output}: localized desktop label`).toContain(`aria-label="${title}"`);
      expect(nav, `${page.output}: localized desktop title`).toContain(`<h2>${title}</h2>`);
      expect(inline, `${page.output}: inline TOC`).not.toBe("");
      expect(inline, `${page.output}: localized inline summary`).toContain(
        `<summary>${title} · ${h2Count} ${page.lang === "zh" ? "节" : "sections"}</summary>`,
      );

      const navLinks = [...nav.matchAll(/class="post-toc-link" href="#([^"]+)"/g)].map((match) => match[1]);
      expect(navLinks, `${page.output}: one desktop entry per body heading, in document order`).toEqual(ids);
      expect((inline.match(/class="post-toc-link"/g) ?? []).length, `${page.output}: inline entry count`).toBe(ids.length);
      for (const id of navLinks) {
        expect(body, `${page.output}: href #${id} resolves to a body id`).toContain(`id="${id}"`);
      }
      expect(html, `${page.output}: scroll-highlight script`).toContain("post_toc_observer_failed");
    }
  });

  it("keeps the blog's sticky desktop column and the narrow-screen inline TOC layout", async () => {
    const html = await shipped(PAGES[0].output);
    const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    expect(style).toMatch(/@media \(min-width: 1200px\)[\s\S]*?\.guide-grid \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 52rem\) 200px;[^}]*column-gap: 56px;/);
    expect(style).toMatch(/@media \(min-width: 1200px\)[\s\S]*?\.post-toc \{[^}]*grid-column: 2;[^}]*grid-row: 1;/);
    expect(style).toMatch(/@media \(max-width: 1199px\)[\s\S]*?\.post-toc \{[^}]*display: none;/);
    expect(style).toMatch(/@media \(max-width: 1199px\)[\s\S]*?\.post-toc-inline \{[^}]*display: block;/);
    expect(style).toMatch(/\.post-toc \{[^}]*position: sticky;[^}]*top: 24px;/);
  });

  it("omits the TOC when a guide has fewer than five headings, like a post", async () => {
    const guidesDir = await mkdtemp(join(tmpdir(), "orbi-guides-"));
    const contentDir = await mkdtemp(join(tmpdir(), "orbi-blog-"));
    const outDir = await mkdtemp(join(tmpdir(), "orbi-guides-build-"));
    try {
      const source = (title, lang, mirror) => `---
title: ${title}
summary: A short fixture guide.
lang: ${lang}
mirror: ${mirror}
published: 2026-10-05
updated: 2026-10-05
---

## One

First.

## Two

Second.

### Three

Third.
`;
      const postSource = (title, lang) => `---
title: ${title}
date: 2026-10-01
summary: A fixture post next to the fixture guide.
lang: ${lang}
author: Lawrence Liu
image: /img/fixture.png
---

Body of ${title}.
`;
      await writeFile(join(guidesDir, "tiny.md"), source("Tiny", "en", "tiny"));
      await mkdir(join(guidesDir, "zh"), { recursive: true });
      await writeFile(join(guidesDir, "zh", "tiny.md"), source("Tiny ZH", "zh", "tiny"));
      // collectPosts requires at least one post; a non-series pair keeps the
      // fixture focused on the guide without pulling the series check in.
      await mkdir(join(contentDir, "zh"), { recursive: true });
      await writeFile(join(contentDir, "fixture.md"), postSource("Fixture", "en"));
      await writeFile(join(contentDir, "zh", "fixture.md"), postSource("Fixture ZH", "zh"));

      await buildPages(outDir, { guidesDir, contentDir });

      const html = await readFile(join(outDir, "guides", "tiny", "index.html"), "utf8");
      const body = guideBody(html);
      expect((body.match(/<h[23] id="/g) ?? []).length, "every fixture heading still gets its id").toBe(3);
      expect(html, "no desktop TOC below the threshold").not.toMatch(/<nav class="post-toc"/);
      expect(html, "no inline TOC below the threshold").not.toMatch(/<details class="post-toc-inline"/);
      expect(html, "no TOC entry links below the threshold").not.toContain(`class="post-toc-link"`);
      expect(html, "no scroll-highlight script below the threshold").not.toContain("post_toc_observer_failed");
    } finally {
      for (const dir of [guidesDir, contentDir, outDir]) await rm(dir, { recursive: true, force: true });
    }
  });
});
