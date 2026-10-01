import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(`${ROOT}${path}`, "utf8");

const cases = [
  {
    source: "site/pages/index.html",
    built: "public/index.html",
    h1: "File an Issue.<br> <span>Get a release.</span>",
    lede: "An AI agent that takes your Issues all the way to a release.",
    href: "/cloud/login",
    button: "Try __FREE_DELIVERIES__ deliveries free →",
    note: '<span class="hero-cta-note-first">No credit card required</span> <span class="hero-cta-note-separator" aria-hidden="true">·</span> <span>Orbi only sees the repos you pick</span>',
  },
  {
    source: "site/pages/zh/index.html",
    built: "public/zh/index.html",
    h1: "提个 Issue，<br><span>收个版本</span>",
    lede: "AI 把你的 Issue 一路做到发版。",
    href: "/zh/cloud/login",
    button: "免费试 __FREE_DELIVERIES__ 次 →",
    note: '<span class="hero-cta-note-first">不用绑定信用卡</span> <span class="hero-cta-note-separator" aria-hidden="true">·</span> <span>只授权你选的仓库</span>',
  },
];

const hero = (html) => html.match(/<section class="hero[\s\S]*?<\/section>/)?.[0] ?? "";
const heroCopy = (html) => hero(html).match(/<div class="hero-copy">([\s\S]*?)<\/div>/)?.[1].trim() ?? "";

function expectedCopy(item) {
  return [
    `<h1>${item.h1}</h1>`,
    `<p class="hero-lede">${item.lede}</p>`,
    `<a class="button button-signal hero-cta" data-cta="cloud-start" href="${item.href}">${item.button}</a>`,
    `<p class="hero-cta-note">${item.note}</p>`,
  ].join("\n");
}

const normalizeIndent = (value) => value.split("\n").map((line) => line.trim()).join("\n");

describe("homepage hero CTA (Issue #704)", () => {
  it("renders exactly the four requested hero-copy elements in both languages", async () => {
    for (const item of cases) {
      for (const path of [item.source, item.built]) {
        const html = await read(path);
        expect(normalizeIndent(heroCopy(html)), path).toBe(expectedCopy(item));
        expect(hero(html).match(/<a\b/g), `${path}: hero links`).toHaveLength(1);
        expect(hero(html), `${path}: film entry removed`).not.toContain('data-cta="film-play"');
      }
    }
  });

  it("uses the same responsive note markup across home and Cloud heroes", async () => {
    for (const path of [
      "site/pages/index.html",
      "site/pages/zh/index.html",
      "site/pages/cloud/index.html",
      "site/pages/zh/cloud/index.html",
      "public/index.html",
      "public/zh/index.html",
      "public/cloud/index.html",
      "public/zh/cloud/index.html",
    ]) {
      const html = await read(path);
      expect(html).toContain('<span class="hero-cta-note-separator" aria-hidden="true">·</span>');
    }
  });

  it("makes the sole hero CTA large and the global nav CTA outlined", async () => {
    const css = await read("public/styles.css");
    expect(css).toContain(".hero-cta {\n  min-height: 64px;\n  padding: 0 32px;\n  font-size: 1.25rem;");
    expect(css).toContain(".hero-cta-note {\n  margin: 12px 0 0;\n  color: #91aaa4;\n  font-size: 0.82rem;");
    const mobile = css.match(/@media \(max-width: 760px\) \{\n  \.hero-cta-note \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(mobile).toContain("margin-top: 12px;");
    expect(mobile).not.toContain("margin-top: 0;");
    expect(css).toContain(".hero-cta { width: 100%; }");
    expect(css).toContain(".site-header nav > a.nav-apply {\n  min-width: 76px;");
    expect(css).toContain("background: transparent;");
    for (const item of cases) {
      const html = await read(item.built);
      const nav = html.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
      expect(nav).toContain('class="nav-apply"');
      expect(nav).not.toContain("button-signal");
    }
  });
});
