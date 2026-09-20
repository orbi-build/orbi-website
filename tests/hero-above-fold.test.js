// Issue #259: the homepage hero said the same thing twice — the lede
// repeated the trust line's three sentences, pushing the primary CTA to
// 630px (below every competitor's first screen) and, on a 390×844 phone,
// the trust line to 874px, out of the fold. The fix is the copy the Issue
// prescribes verbatim: the lede shrinks to one sentence pair and the
// `12 factors` link moves below the trust line as a `.hero-footnote`.
// These tests pin acceptance 1 (byte-exact file content) and acceptance 6
// (the English lede at ≤ 22 words); the first-screen geometry itself is
// measured by the browser smoke (assertHeroAboveFold in
// tests/homepage.smoke.mjs, run in CI by ci.yml).

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const read = (path) => readFile(`${ROOT}${path}`, "utf8");

const enLede =
  '        <p class="hero-lede"><strong>No new workspace.</strong> Orbi runs the delivery line on the Issues already in your repository. GitHub stays the source of truth.</p>';
const zhLede =
  '        <p class="hero-lede"><strong>不用迁移工作流。</strong>Orbi 在仓库里已有的 Issue 上跑完整条交付线。GitHub 始终是唯一事实源。</p>';
const enFootnote =
  '</ul>\n        <p class="hero-footnote"><a href="https://aiready.sh/">How to write an ai-ready Issue (12 factors) ↗</a></p>';
const zhFootnote =
  '</ul>\n        <p class="hero-footnote"><a href="https://aiready.sh/zh/">如何写一张 ai-ready Issue（12 个要素）↗</a></p>';
const footnoteCss = [
  ".hero-footnote { margin: 14px 0 0; font-size: 0.9rem; }",
  ".hero-footnote a { color: var(--ink-soft); }",
].join("\n");

const ledeElement = (page) => /<p class="hero-lede">[\s\S]*?<\/p>/.exec(page)[0];
const ledeText = (page) => ledeElement(page).replace(/<[^>]+>/g, "").trim();

describe("hero copy: lede + 12-factors footnote (Issue #259)", () => {
  it("replaces the English hero lede line verbatim", async () => {
    const source = await read("site/pages/index.html");
    expect(source).toContain(enLede);
    expect(source.match(/class="hero-lede"/g)).toHaveLength(1);
  });

  it("replaces the Chinese hero lede line verbatim", async () => {
    const source = await read("site/pages/zh/index.html");
    expect(source).toContain(zhLede);
    expect(source.match(/class="hero-lede"/g)).toHaveLength(1);
  });

  it("moves the 12-factors link below the trust line in English", async () => {
    const source = await read("site/pages/index.html");
    // Contiguous: the footnote line directly follows the trust line's </ul>.
    expect(source).toContain(enFootnote);
    expect(source.match(/hero-footnote/g)).toHaveLength(1);
  });

  it("moves the 12-factors link below the trust line in Chinese, to aiready.sh/zh/", async () => {
    const source = await read("site/pages/zh/index.html");
    expect(source).toContain(zhFootnote);
    expect(source.match(/hero-footnote/g)).toHaveLength(1);
  });

  it("first screen order: lede, CTA, trust line, footnote", async () => {
    for (const path of ["site/pages/index.html", "site/pages/zh/index.html"]) {
      const source = await read(path);
      const lede = source.indexOf('class="hero-lede"');
      const cta = source.indexOf('data-cta="cloud-start"');
      const trust = source.indexOf('class="trust-line"');
      const footnote = source.indexOf('class="hero-footnote"');
      expect(lede).toBeLessThan(cta);
      expect(cta).toBeLessThan(trust);
      expect(trust).toBeLessThan(footnote);
    }
  });

  it("adds .hero-footnote after the .hero-alt rules", async () => {
    const css = await read("public/styles.css");
    expect(css).toContain(footnoteCss);
    expect(css.indexOf(".hero-footnote {")).toBeGreaterThan(css.indexOf(".hero-alt a:hover"));
  });

  it("English lede is at most 22 words", async () => {
    const source = await read("site/pages/index.html");
    const words = ledeText(source).split(/\s+/).filter(Boolean);
    expect(words.length).toBeLessThanOrEqual(22);
  });

  it("the old duplicated copy is gone from both pages", async () => {
    expect(await read("site/pages/index.html")).not.toContain("Orbi takes the Issues, dependencies, and milestones");
    expect(await read("site/pages/zh/index.html")).not.toContain("直接读取仓库里已有的 Issue、依赖和 Milestone");
  });

  it("Chinese lede shrank to at most 60 characters", async () => {
    const source = await read("site/pages/zh/index.html");
    expect(ledeText(source).length).toBeLessThanOrEqual(60);
  });

  it("the built pages ship the new lede", async () => {
    expect(await read("public/index.html")).toContain(enLede.trim());
    expect(await read("public/zh/index.html")).toContain(zhLede.trim());
  });
});
