// Issue #1465: every page whose structured data names an author carries the
// same byline the blog posts do — the author name linked to that language's
// author page, below the title and above the lede, beside the page's own
// publish date (and its update date once it was revised). The structured data
// names the same Person the posts do: the author page URL plus the GitHub and
// X profiles from site/data/authors.json.
//
// The check walks the build artifacts in public/ — the bytes the Worker
// deploys and tests/pages.test.js already pins byte-for-byte to a fresh build —
// and takes the page list from what it finds there, so a page added later that
// carries an author but no byline fails here without anyone maintaining a list.
// The failure-path cases drive the exported build helper directly.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { applyAuthorAttribution, loadAuthor } from "../scripts/build-pages.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// The one author record the build reads; the page sources carry only the name.
const AUTHOR = JSON.parse(await readFile(join(ROOT, "site", "data", "authors.json"), "utf8"));
const AUTHOR_RECORD = await loadAuthor();

const authorHref = (lang) => `${lang === "zh" ? "/zh" : ""}/about/${AUTHOR.slug}/`;
const authorUrl = (lang) => `https://orbi.build${authorHref(lang)}`;

const jsonLdObjects = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((match) => JSON.parse(match[1]));
const articleOf = (html) => jsonLdObjects(html).find((entry) => entry["@type"] === "Article");
const langOf = (html) => (html.includes('<html lang="zh-CN"') ? "zh" : "en");
const bylineOf = (html) => html.match(/<p class="post-byline">([\s\S]*?)<\/p>/)?.[1] ?? "";

// One page's whole contract: the structured data, then the visible byline that
// has to agree with it.
function expectAuthorAttribution(output, html) {
  const article = articleOf(html);
  if (!article?.author) return;
  const lang = langOf(html);
  expect(article.author, `${output}: structured data author`).toEqual({
    "@type": "Person",
    name: AUTHOR.name,
    url: authorUrl(lang),
    sameAs: AUTHOR.sameAs,
  });
  expect(article.datePublished, `${output}: datePublished`).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  const byline = bylineOf(html);
  expect(byline, `${output}: missing <p class="post-byline">`).not.toBe("");
  expect(html.match(/class="post-byline"/g), `${output}: one byline per page`).toHaveLength(1);
  const bylineAt = html.indexOf('<p class="post-byline">');
  expect(bylineAt, `${output}: byline must sit below the title`).toBeGreaterThan(html.indexOf("</h1>"));
  const ledeAt = html.indexOf('class="hero-lede"');
  if (ledeAt >= 0) expect(bylineAt, `${output}: byline must sit above the lede`).toBeLessThan(ledeAt);
  expect(byline, `${output}: author link`).toContain(`<a href="${authorHref(lang)}">${AUTHOR.name}</a>`);
  expect(byline, `${output}: the page's own publish date`)
    .toContain(`<time datetime="${article.datePublished}">${article.datePublished}</time>`);

  const revised = Boolean(article.dateModified) && article.dateModified !== article.datePublished;
  if (revised) {
    expect(byline, `${output}: the revision date of a revised page`)
      .toContain(`<time class="post-updated" datetime="${article.dateModified}">`);
  } else {
    expect(byline, `${output}: an unrevised page shows no update date`).not.toContain('class="post-updated"');
  }
}

let pages; // { output, html } for every shipped page whose structured data names an author

beforeAll(async () => {
  const files = (await readdir(join(ROOT, "public"), { recursive: true }))
    .map((file) => file.split("\\").join("/"))
    .filter((file) => file.endsWith(".html"));
  pages = [];
  for (const output of files) {
    const html = await readFile(join(ROOT, "public", output), "utf8");
    if (!articleOf(html)?.author) continue;
    pages.push({ output, html });
  }
});

describe("author byline on every page that names an author (Issue #1465)", () => {
  it("walks the built pages, not a hand-maintained list", () => {
    expect(pages.length, "the build must ship pages with an author").toBeGreaterThan(20);
    expect(new Set(pages.map((page) => page.output)).size, "one entry per output").toBe(pages.length);
  });

  it("links the author name to that language's author page beside the page's own dates", () => {
    for (const { output, html } of pages) expectAuthorAttribution(output, html);
  });

  it("names the same Person as the posts in structured data on every one of them", () => {
    for (const { output, html } of pages) {
      const article = articleOf(html);
      expect(article.author.url, `${output}: author page url`).toBe(authorUrl(langOf(html)));
      expect(article.author.sameAs, `${output}: profiles`).toEqual(AUTHOR.sameAs);
    }
  });

  it("fails on a page that names an author but lost its byline", () => {
    const sample = pages[0];
    expect(sample, "a page with an author to mutate").toBeTruthy();
    const broken = sample.html.replace(/<p class="post-byline">[\s\S]*?<\/p>/, "");
    expect(() => expectAuthorAttribution(sample.output, broken)).toThrow(/missing <p class="post-byline">/);
  });
});

describe("the build's author attribution (Issue #1465)", () => {
  const author = AUTHOR_RECORD;
  const page = (body) => `<!DOCTYPE html><html lang="en"><head><script type="application/ld+json">${JSON.stringify(body)}</script></head><body><main><h1 id="t">Title</h1><p class="hero-lede">Lede.</p></main></body></html>`;
  const article = { "@context": "https://schema.org", "@type": "Article", headline: "Title", datePublished: "2026-09-07", dateModified: "2026-09-07", author: { "@type": "Person", name: author.name } };

  it("fills in the author page url and profiles from the one author record", () => {
    const html = applyAuthorAttribution(page(article), author, "en", "test/index.html");
    expect(articleOf(html).author).toEqual({
      "@type": "Person",
      name: author.name,
      url: "https://orbi.build/about/larry-orbi/",
      sameAs: author.sameAs,
    });
    expect(bylineOf(html)).toContain(`<a href="/about/larry-orbi/">${author.name}</a> · <time datetime="2026-09-07">2026-09-07</time>`);
  });

  it("adds the revised date only when the page was revised", () => {
    const revised = applyAuthorAttribution(page({ ...article, dateModified: "2026-10-18" }), author, "en", "test/index.html");
    expect(bylineOf(revised)).toContain(' · <time class="post-updated" datetime="2026-10-18">Updated 18 Oct 2026</time>');
    const zh = applyAuthorAttribution(page({ ...article, dateModified: "2026-10-18" }), author, "zh", "zh/test/index.html");
    expect(bylineOf(zh)).toContain(' · <time class="post-updated" datetime="2026-10-18">更新于 2026-10-18</time>');
    expect(bylineOf(zh)).toContain('<a href="/zh/about/larry-orbi/">');
  });

  it("leaves a page that carries neither structured data nor an author untouched", () => {
    const plain = '<!DOCTYPE html><html lang="en"><body><h1>Title</h1></body></html>';
    expect(applyAuthorAttribution(plain, author, "en", "test/index.html")).toBe(plain);
  });

  it("keeps the post template's own byline instead of shipping a second one", () => {
    const post = page(article).replace("</h1>", `</h1><p class="post-byline"><a href="/about/larry-orbi/">${author.name}</a></p>`);
    const html = applyAuthorAttribution(post, author, "en", "content/blog/x.md");
    expect(html.match(/class="post-byline"/g)).toHaveLength(1);
  });

  it("fails the build when a page names an author but carries no date to show", () => {
    const { datePublished, ...undated } = article;
    expect(() => applyAuthorAttribution(page(undated), author, "en", "test/index.html"))
      .toThrow(/test\/index\.html[\s\S]*datePublished/);
  });

  it("fails the build when a page has no h1 to carry the byline", () => {
    const headless = page(article).replace(/<h1 id="t">Title<\/h1>/, "");
    expect(() => applyAuthorAttribution(headless, author, "en", "test/index.html"))
      .toThrow(/test\/index\.html[\s\S]*no <h1>/);
  });

  it("fails the build when a page names an author the site has no page for", () => {
    const guest = page({ ...article, author: { "@type": "Person", name: "Guest Writer" } });
    expect(() => applyAuthorAttribution(guest, author, "en", "test/index.html"))
      .toThrow(/author "Guest Writer" has no author page/);
  });
});
