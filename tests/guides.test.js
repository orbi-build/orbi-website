// Issue #826: guide pages render from content/guides/** Markdown, the first
// being the Pi hub at /guides/pi-coding-agent/ (+ /zh/). These tests read the
// shipped bytes in public/ (the files the Worker deploys) and drive the real
// collectors — never a re-implementation of the pipeline.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  it("links the hub from both guides indexes and the footer guides row", async () => {
    for (const page of PAGES) {
      const indexHtml = await shipped(page.lang === "en" ? "guides/index.html" : "zh/guides/index.html");
      expect(indexHtml, `${page.lang}: guides index`).toContain(`href="${page.href}"`);
      const homeHtml = await shipped(page.lang === "en" ? "index.html" : "zh/index.html");
      const footer = homeHtml.match(/<footer class="site-footer shell">[\s\S]*?<\/footer>/)?.[0] ?? "";
      expect(footer, `${page.lang}: footer guides row`).toContain(`href="${page.href}"`);
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

describe("guide front matter is validated (Issue #826)", () => {
  const fixtureDirs = [];

  afterAll(async () => {
    for (const dir of fixtureDirs) await rm(dir, { recursive: true, force: true });
  });

  it("fails the build, naming the file, when a guide md is missing a required field", async () => {
    const guidesDir = await mkdtemp(join(tmpdir(), "orbi-guides-"));
    const outDir = await mkdtemp(join(tmpdir(), "orbi-guides-build-"));
    fixtureDirs.push(guidesDir, outDir);
    await writeFile(join(guidesDir, "broken.md"), "---\ntitle: Broken\nlang: en\nmirror: broken\nupdated: 2026-10-05\n---\n\nBody.\n");
    await expect(buildPages(outDir, { guidesDir })).rejects.toThrow(/content\/guides\/broken\.md/);
  });
});
