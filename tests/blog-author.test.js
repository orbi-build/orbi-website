// Issue #887: every post carries a visible byline that links to the author's
// page, the author page carries the bio plus both profile links and lists that
// language's posts, and the structured data names the author as a Person
// (`url` = author page, `sameAs` = GitHub and X) with the homepage
// Organization declaring the same Person as its founder.
//
// These assertions read the shipped bytes in public/ — the same files the
// Worker deploys — and drive the real build only for the failure path, so a
// hand edit that skips `npm run build` fails on the pipeline run, not here.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPages, collectPosts, loadAuthor, loadPages } from "../scripts/build-pages.mjs";
import { handleFetch } from "../src/worker.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// The one author record the build reads; the page sources carry the copy.
const AUTHOR = JSON.parse(await readFile(join(ROOT, "site", "data", "authors.json"), "utf8"));
const PROFILES = ["https://github.com/xqliu", "https://x.com/xqliu"];

const authorPageOutput = (lang) =>
  `${lang === "zh" ? "zh/" : ""}about/${AUTHOR.slug}/index.html`;
const authorPageHref = (lang) => `${lang === "zh" ? "/zh" : ""}/about/${AUTHOR.slug}/`;

const jsonLdObjects = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((match) => JSON.parse(match[1]));
const articleOf = (html) => jsonLdObjects(html).find((entry) => entry["@type"] === "Article");
const graphNodes = (html) => jsonLdObjects(html).flatMap((data) => data["@graph"] ?? [data]);
const heroOf = (html) => html.match(/<section class="post-hero"[\s\S]*?<\/section>/)?.[0] ?? "";

let posts;
let shipped; // output path -> shipped bytes in public/
let sitemap;

beforeAll(async () => {
  posts = await collectPosts();
  shipped = new Map();
  for (const page of await loadPages()) {
    shipped.set(page.output, await readFile(join(ROOT, "public", page.output), "utf8"));
  }
  for (const post of posts) {
    shipped.set(post.output, await readFile(join(ROOT, "public", post.output), "utf8"));
  }
  sitemap = await readFile(join(ROOT, "public", "sitemap.xml"), "utf8");
});

describe("post byline (Issue #887)", () => {
  it("renders the author name linked to that language's author page, below the title, next to the date", () => {
    expect(posts.length, "the blog must ship at least one post").toBeGreaterThan(0);
    for (const post of posts) {
      const hero = heroOf(shipped.get(post.output));
      const byline = hero.match(/<p class="post-byline">([\s\S]*?)<\/p>/)?.[1] ?? "";
      expect(byline, `${post.output}: missing the byline`).not.toBe("");
      const bylineAt = hero.indexOf('<p class="post-byline">');
      expect(bylineAt, `${post.output}: byline must sit below the title`)
        .toBeGreaterThan(hero.indexOf('<h1 id="post-title">'));
      expect(bylineAt, `${post.output}: byline must sit above the lede`)
        .toBeLessThan(hero.indexOf('class="hero-lede"'));
      expect(byline, `${post.output}: author link`)
        .toContain(`<a href="${authorPageHref(post.lang)}">${AUTHOR.name}</a>`);
      expect(byline, `${post.output}: publish date`)
        .toContain(`<time datetime="${post.date}">${post.date}</time>`);
    }
  });

  it("keeps the date in the byline only, never above the title as well", () => {
    for (const post of posts) {
      const eyebrow = heroOf(shipped.get(post.output)).match(/<p class="eyebrow">([^<]*)<\/p>/)?.[1] ?? "";
      expect(eyebrow, `${post.output}: eyebrow`).not.toBe("");
      expect(eyebrow, `${post.output}: the date belongs to the byline`).not.toMatch(/\d/);
    }
  });
});

describe("author pages (Issue #887)", () => {
  it("ships both language pages with one h1, the bio and the two profile links", () => {
    for (const lang of ["en", "zh"]) {
      const output = authorPageOutput(lang);
      const html = shipped.get(output);
      expect(html, `${output}: build output`).toBeTruthy();
      const rendered = html.replace(/<script[\s\S]*?<\/script>/g, "");
      expect((rendered.match(/<h1\b/gi) ?? []), `${output}: h1 count`).toHaveLength(1);
      const h1 = rendered.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1].trim();
      expect(h1, `${output}: h1 is the author name`).toBe(AUTHOR.name);
      expect(html, `${output}: GitHub profile link`).toContain('href="https://github.com/xqliu"');
      expect(html, `${output}: X profile link`).toContain('href="https://x.com/xqliu"');
      expect(html, `${output}: bio`).toMatch(lang === "zh" ? /Orbi 创始人/ : /Creator of Orbi/);
      // The page declares the same Person the posts' `author.url` resolves to:
      // name, its own URL and both profiles, so the entity graph closes.
      const person = jsonLdObjects(html).find((entry) => entry["@type"] === "Person");
      expect(person, `${output}: Person JSON-LD`).toEqual({
        "@context": "https://schema.org",
        "@type": "Person",
        name: AUTHOR.name,
        url: `https://orbi.build${authorPageHref(lang)}`,
        sameAs: PROFILES,
      });
    }
  });

  it("lists exactly the posts of its own language, newest first", () => {
    for (const lang of ["en", "zh"]) {
      const expected = posts.filter((post) => post.lang === lang).map((post) => post.href);
      expect(expected.length, `${lang}: the blog must ship posts`).toBeGreaterThan(0);
      const html = shipped.get(authorPageOutput(lang));
      const entries = [...html.matchAll(/<article class="post-entry">/g)];
      expect(entries, `${authorPageOutput(lang)}: listed post count (the language's post count)`)
        .toHaveLength(expected.length);
      const listed = [...html.matchAll(/<article class="post-entry">[\s\S]*?<a href="([^"]+)"/g)]
        .map((match) => match[1]);
      expect(listed, `${authorPageOutput(lang)}: listed posts`).toEqual(expected);
    }
  });

  it("is canonical, mirrored across languages and listed in the sitemap", () => {
    for (const lang of ["en", "zh"]) {
      const html = shipped.get(authorPageOutput(lang));
      const canonical = `https://orbi.build${authorPageHref(lang)}`;
      expect(html, `${authorPageOutput(lang)}: canonical`).toContain(`<link rel="canonical" href="${canonical}">`);
      expect(html, `${authorPageOutput(lang)}: EN alternate`).toContain('hreflang="en" href="https://orbi.build/about/lawrence-liu/"');
      expect(html, `${authorPageOutput(lang)}: ZH alternate`).toContain('hreflang="zh-CN" href="https://orbi.build/zh/about/lawrence-liu/"');
      expect(sitemap, `${authorPageOutput(lang)}: sitemap`).toContain(`<loc>${canonical}</loc>`);
    }
  });
});

describe("author structured data (Issue #887)", () => {
  it("names a Person author with the author page url and both profiles on every post", () => {
    for (const post of posts) {
      const article = articleOf(shipped.get(post.output));
      expect(article, `${post.output}: Article`).toBeTruthy();
      expect(article.author, post.output).toEqual({
        "@type": "Person",
        name: AUTHOR.name,
        url: `https://orbi.build${authorPageHref(post.lang)}`,
        sameAs: PROFILES,
      });
    }
  });

  it("parses every JSON-LD block on the posts, the author pages and both homepages", () => {
    const outputs = [
      ...posts.map((post) => post.output),
      authorPageOutput("en"),
      authorPageOutput("zh"),
      "index.html",
      "zh/index.html",
    ];
    for (const output of outputs) {
      const blocks = [...shipped.get(output).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      expect(blocks.length, `${output}: JSON-LD blocks`).toBeGreaterThan(0);
      for (const [, block] of blocks) {
        expect(() => JSON.parse(block), `${output}: JSON-LD must parse`).not.toThrow();
      }
    }
  });

  it("declares the author as the Organization's founder on both homepages", () => {
    for (const [output, lang] of [["index.html", "en"], ["zh/index.html", "zh"]]) {
      const organization = graphNodes(shipped.get(output)).find((node) => node["@type"] === "Organization");
      expect(organization, `${output}: Organization node`).toBeTruthy();
      expect(organization.founder, output).toEqual({
        "@type": "Person",
        name: AUTHOR.name,
        url: `https://orbi.build${authorPageHref(lang)}`,
        sameAs: PROFILES,
      });
    }
  });
});

describe("the author record (Issue #887)", () => {
  it("rejects a record that would ship a byline without a target", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbi-author-record-"));
    const file = join(dir, "authors.json");
    try {
      const write = (record) => writeFile(file, JSON.stringify(record));
      const complete = { name: AUTHOR.name, slug: AUTHOR.slug, sameAs: PROFILES };
      await write({ name: AUTHOR.name, slug: AUTHOR.slug });
      await expect(loadAuthor(file)).rejects.toThrow(/missing "sameAs"/);
      await write({ name: AUTHOR.name, slug: "Lawrence Liu", sameAs: PROFILES });
      await expect(loadAuthor(file)).rejects.toThrow(/"slug" is not URL-safe/);
      await write({ name: "  ", slug: AUTHOR.slug, sameAs: PROFILES });
      await expect(loadAuthor(file)).rejects.toThrow(/missing "name"/);
      await write(complete);
      await expect(loadAuthor(file)).resolves.toEqual(complete);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the Worker serves the new routes (Issue #887)", () => {
  // The same ASSETS binding shape production has: the request path maps to the
  // built file, so a 200 here is the real Worker routing plus the real asset.
  const assets = {
    fetch: async (request) => {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const file = await readFile(join(ROOT, "public", pathname.replace(/^\/+/, "") || "index.html")).catch(() => null);
      return file
        ? new Response(file, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })
        : new Response("not found", { status: 404 });
    },
  };

  it("answers both author pages and the posts that link them with 200", async () => {
    const paths = [
      "/about/lawrence-liu/",
      "/zh/about/lawrence-liu/",
      "/blog/k8e-rejected-then-merged/",
      "/zh/blog/k8e-rejected-then-merged/",
    ];
    for (const path of paths) {
      const response = await handleFetch(new Request(`https://orbi.build${path}`), {
        ASSETS: assets,
        CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login",
      });
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toMatch(/^text\/html/);
      expect(await response.text(), path).toContain("Lawrence Liu");
    }
  });
});

describe("author coverage failure path (Issue #887)", () => {
  it("fails the build naming the file when a post names an author with no page", async () => {
    const contentDir = await mkdtemp(join(tmpdir(), "orbi-author-"));
    const outDir = await mkdtemp(join(tmpdir(), "orbi-author-out-"));
    try {
      await writeFile(join(contentDir, "guest.md"), [
        "---",
        "title: Guest",
        "date: 2026-09-18",
        "summary: A guest post.",
        "lang: en",
        "author: Guest Writer",
        "image: /img/blog-t.png",
        "---",
        "",
        "Body paragraph.",
        "",
      ].join("\n"));
      await expect(buildPages(outDir, { contentDir })).rejects
        .toThrow(/content\/blog\/guest\.md[\s\S]*author "Guest Writer" has no author page[\s\S]*site\/data\/authors\.json/);
    } finally {
      await rm(contentDir, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
