import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(`${ROOT}${path}`, "utf8");

const cases = [
  ["site/pages/index.html", "public/index.html", "/cloud/login", "Orbi writes the code, has a second session review it, merges only the reviewed commit, and tags the release. You file Issues; releases come out.", "Try __FREE_DELIVERIES__ merged deliveries free →", "No card. Install the GitHub App on one repository. Runs that don't merge don't count.", "Founding partners: 50% off for life, __FOUNDING_PARTNER_LIMIT__ places total."],
  ["site/pages/zh/index.html", "public/zh/index.html", "/zh/cloud/login", "Orbi 写代码，由另一个会话独立审查，只合并审过的那个 commit，然后打 tag 发版。你只管提 Issue。", "免费试 __FREE_DELIVERIES__ 次合并交付 →", "不用绑卡。在一个仓库装上 GitHub App 就能开始。没合并的不算次数。", "创始合作伙伴：终身五折，一共 __FOUNDING_PARTNER_LIMIT__ 个名额。"],
];

describe("homepage hero CTA (Issue #704)", () => {
  it("keeps only the requested copy and one CTA link in each hero", async () => {
    for (const [sourcePath, builtPath, href, lede, button, note, foundingNote] of cases) {
      const source = await read(sourcePath);
      const hero = source.match(/<section class="hero[\s\S]*?<\/section>/)?.[0] ?? "";
      const copy = hero.match(/<div class="hero-copy">[\s\S]*?<\/div>/)?.[0] ?? "";
      expect(copy).toContain(lede);
      expect(copy).toContain(button);
      expect(copy).toContain(note);
      expect(copy).toContain(foundingNote);
      expect(hero).toContain(`data-cta="cloud-start" href="${href}"`);
      expect(copy.match(/<a\b/g)).toHaveLength(1);
      for (const removed of ["hero-alt", "hero-proof-link", "trust-line", "hero-footnote", "orbi-hero-primary-p", "film-play"]) {
        expect(hero).not.toContain(removed);
      }
      expect(await read(builtPath)).toContain(button);
    }
  });

  it("makes the CTA large and the nav CTA outlined", async () => {
    const css = await read("public/styles.css");
    expect(css).toContain(".hero-cta {\n  min-height: 64px;");
    expect(css).toContain(".hero-cta { width: 100%; }");
    expect(css).toContain(".site-header nav > a.nav-apply {\n  min-width: 76px;");
    expect(css).toContain("background: transparent;");
    for (const path of ["public/index.html", "public/zh/index.html"]) {
      const html = await read(path);
      const nav = html.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
      expect(nav).toContain('class="nav-apply"');
      expect(nav).not.toContain('class="button-signal nav-apply"');
    }
  });
});
