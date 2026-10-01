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
    note: '<span class="hero-cta-note-first">No credit card required ·</span> <span>Orbi only sees the repos you pick</span>',
  },
  {
    source: "site/pages/zh/index.html",
    built: "public/zh/index.html",
    h1: "提个 Issue，<br><span>收个版本</span>",
    lede: "AI 把你的 Issue 一路做到发版。",
    href: "/zh/cloud/login",
    button: "免费试 __FREE_DELIVERIES__ 次 →",
    note: "不用绑定信用卡 · 只授权你选的仓库",
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

  it("makes the sole hero CTA large and the global nav CTA outlined", async () => {
    const css = await read("public/styles.css");
    expect(css).toContain(".hero-cta {\n  min-height: 64px;\n  padding: 0 32px;\n  font-size: 1.25rem;");
    expect(css).toContain("@media (min-width: 761px) {\n  .hero-cta {\n    min-width: 340px;\n  }\n}");
    expect(css).toContain(".hero-cta-note {\n  margin: 8px 0 0;\n  color: #91aaa4;\n  font-size: 0.82rem;");
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
