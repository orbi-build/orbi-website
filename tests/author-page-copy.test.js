// Issue #1480: the author page claimed "Every post on this blog is written by
// him." — the posts are in fact drafted by AI agents, and he picks the topics,
// checks the facts and decides what gets published. A page that says otherwise
// is a factual claim a reader (and a search engine's summary of the author)
// acts on, so the honest description is pinned here, in both languages.
//
// The check reads the shipped bytes in public/ — what the Worker deploys, and
// what tests/pages.test.js already pins to a fresh build — so a source edit
// that skips `npm run build` fails here instead of shipping the old claim.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// The Issue's table, one row per page: the lede's closing sentence and the
// sentence both the meta description and og:description end with.
const PAGES = [
  {
    output: "about/larry-orbi/index.html",
    lede: "Posts are drafted with AI agents; he chooses the topics, checks the facts and decides what gets published.",
    description: "Posts are drafted with AI agents and checked and published by him.",
  },
  {
    output: "zh/about/larry-orbi/index.html",
    lede: "本站文章由 AI 代理起草，选题、核对事实、决定发布由他负责。",
    description: "本站文章由 AI 代理起草，由他核对并发布。",
  },
];

// The claim the Issue replaces: no page may carry it in any language.
const RETIRED = [
  "Every post on this blog is written by him.",
  "He writes every post on this blog.",
  "本站博客文章都是他写的。",
];

// `opening` is the meta tag's identifying attributes, e.g. name="description".
const metaContent = (html, opening) =>
  html.match(new RegExp(`<meta ${opening} content="([^"]*)">`))?.[1] ?? "";
const ledeOf = (html) => html.match(/<p class="hero-lede">([\s\S]*?)<\/p>/)?.[1] ?? "";

let pages; // output → html

beforeAll(async () => {
  pages = new Map();
  for (const page of PAGES) {
    pages.set(page.output, await readFile(join(ROOT, "public", page.output), "utf8"));
  }
});

describe("the author page says how the posts are produced (Issue #1480)", () => {
  it("closes the lede with the drafted-by-agents sentence", () => {
    for (const page of PAGES) {
      const lede = ledeOf(pages.get(page.output));
      expect(lede, `${page.output}: missing <p class="hero-lede">`).not.toBe("");
      expect(lede.trim().endsWith(page.lede), `${page.output}: lede → ${lede}`).toBe(true);
    }
  });

  it("ends the meta description and og:description with the same sentence", () => {
    for (const page of PAGES) {
      const html = pages.get(page.output);
      for (const opening of ['name="description"', 'property="og:description"']) {
        const content = metaContent(html, opening);
        expect(content, `${page.output}: <meta ${opening}> missing`).not.toBe("");
        expect(content.endsWith(page.description), `${page.output}: <meta ${opening}> → ${content}`).toBe(true);
      }
    }
  });

  it("drops the retired claim from every page", () => {
    for (const page of PAGES) {
      for (const claim of RETIRED) {
        expect(pages.get(page.output), `${page.output}: still says "${claim}"`).not.toContain(claim);
      }
    }
  });
});
