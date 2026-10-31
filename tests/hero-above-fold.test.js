import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(`${ROOT}${path}`, "utf8");

// Issue #1127: LaunchIgniter grants the free listing only while its badge is
// visible in the homepage first screen, so the hero copy closes with it. The
// vendor's own embed, plus the rel=noopener every badge anchor here carries;
// the link stays dofollow (no nofollow) and the image stays on their host.
const HERO_BADGE = '<a class="hero-badge" href="https://launchigniter.com/product/orbi?ref=badge-orbi" target="_blank" rel="noopener"><img class="hero-badge-img" src="https://launchigniter.com/api/badge/orbi?theme=light" alt="Featured on LaunchIgniter" width="212" height="55" /></a>';

// Issue #977: the hero now leads with what Orbi delivers, keeps the Cloud and
// the self-host entries apart, and names the GitHub authorization before the
// click. The free-delivery count still comes from the Worker's placeholder.
const cases = [
  {
    source: "site/pages/index.html",
    built: "public/index.html",
    kicker: "The lights-out software factory for the Agent era",
    h1: "File an Issue.<wbr> <span>Get a release.</span>",
    lede: "Orbi writes code for your GitHub Issues with AI. It arranges independent AI review, merges approved changes, and follows your repository’s release process. You don’t have to supervise every step.",
    href: "/cloud/login",
    button: "Try Orbi Cloud free →",
    note: '<span class="hero-cta-note-first">GitHub authorization and App installation required. __FREE_DELIVERIES__ deliveries free, no credit card</span> <span class="hero-cta-note-separator" aria-hidden="true">·</span> <span><a href="https://github.com/orbi-build/orbi" data-cta="hero-github">Open source · Self-host ↗</a></span>',
    badge: HERO_BADGE,
  },
  {
    source: "site/pages/zh/index.html",
    built: "public/zh/index.html",
    kicker: "Agent 时代的软件黑灯工厂",
    h1: "提个 Issue，<wbr><span>收个版本</span>",
    lede: "Orbi 用 AI 完成 GitHub 上的开发任务。代码经过独立 AI 评审，通过后自动合并，再按仓库流程发版。你不用一直守着。",
    href: "/zh/cloud/login",
    button: "免费试用 Orbi Cloud →",
    note: '<span class="hero-cta-note-first">需 GitHub 授权并安装 App 前 __FREE_DELIVERIES__ 次交付免费，不用绑卡</span> <span class="hero-cta-note-separator" aria-hidden="true">·</span> <span><a href="https://github.com/orbi-build/orbi" data-cta="hero-github">开源自托管 ↗</a></span>',
    badge: HERO_BADGE,
  },
];

const hero = (html) => html.match(/<section class="hero[\s\S]*?<\/section>/)?.[0] ?? "";
const heroCopy = (html) => hero(html).match(/<div class="hero-copy">([\s\S]*?)<\/div>/)?.[1].trim() ?? "";

function expectedCopy(item) {
  return [
    `<p class="hero-kicker">${item.kicker}</p>`,
    `<h1>${item.h1}</h1>`,
    `<p class="hero-lede">${item.lede}</p>`,
    `<a class="button button-signal hero-cta" data-cta="cloud-start" href="${item.href}">${item.button}</a>`,
    `<p class="hero-cta-note">${item.note}</p>`,
    item.badge,
  ].join("\n");
}

const normalizeIndent = (value) => value.split("\n").map((line) => line.trim()).join("\n");
const count = (html, pattern) => [...html.matchAll(pattern)].length;

describe("homepage hero CTA (Issues #704, #899)", () => {
  it("renders exactly the six requested hero-copy elements in both languages", async () => {
    for (const item of cases) {
      for (const path of [item.source, item.built]) {
        const html = await read(path);
        expect(normalizeIndent(heroCopy(html)), path).toBe(expectedCopy(item));
        // Issue #899: the note's self-host text link is the hero's second link;
        // the two data-cta values are what the cta_click beacon reports apart.
        const ctas = [...hero(html).matchAll(/data-cta="([^"]+)"/g)].map((match) => match[1]);
        expect(ctas, `${path}: hero CTAs`).toEqual(["cloud-start", "hero-github"]);
        // Issue #1127 adds the LaunchIgniter badge anchor to the two data-cta
        // links: the hero carries three anchors, still two reported data-cta.
        expect(hero(html).match(/<a\b/g), `${path}: hero links`).toHaveLength(3);
        expect(hero(html), `${path}: film entry removed`).not.toContain('data-cta="film-play"');
      }
    }
  });

  it("drops the repo-authorisation reassurance from the homepage first screen", async () => {
    for (const item of cases) {
      for (const path of [item.source, item.built]) {
        const html = await read(path);
        expect(hero(html), `${path}: removed reassurance`).not.toMatch(/only sees the repos you pick|只授权你选的仓库/);
      }
    }
  });

  it("points the note's text link at the public repository", async () => {
    for (const item of cases) {
      for (const path of [item.source, item.built]) {
        const html = await read(path);
        expect(hero(html), `${path}: self-host link`).toContain(
          '<a href="https://github.com/orbi-build/orbi" data-cta="hero-github">',
        );
      }
    }
  });

  // Issue #977: the forced <br> is gone, so the headline shows one line where
  // the copy column has room and wraps naturally where it does not. The <wbr>
  // only offers the browser a break opportunity; it is not a rendered break.
  it("wraps the headline naturally and keeps the emphasised second sentence", async () => {
    for (const item of cases) {
      for (const path of [item.source, item.built]) {
        const html = await read(path);
        const headline = hero(html).match(/<h1>[\s\S]*?<\/h1>/)?.[0];
        expect(headline, `${path}: headline`).toBe(`<h1>${item.h1}</h1>`);
        expect(headline, `${path}: forced break removed`).not.toContain("<br");
        expect(headline, `${path}: emphasised second sentence`).toMatch(/<span>\S[^<]*<\/span>/);
      }
    }
  });

  // Issue #977: "Agent" is a proper noun in the positioning line, so the capital
  // is synced everywhere that sentence repeats — meta, OG, JSON-LD and the
  // kicker — while ordinary nouns like "AI coding agents" stay lowercase.
  it("capitalises Agent in the positioning line only", async () => {
    const positioned = {
      "site/pages/index.html": { line: "the Agent era", occurrences: 4, noun: "AI coding agents" },
      "site/pages/zh/index.html": { line: "Agent 时代", occurrences: 5, noun: "AI 编程 agent" },
    };
    for (const [path, { line, occurrences, noun }] of Object.entries(positioned)) {
      const html = await read(path);
      const head = html.slice(0, html.indexOf("<body"));
      expect(html.split(line).length - 1, `${path}: positioning line copies`).toBe(occurrences);
      expect(head, `${path}: meta, OG and JSON-LD`).toContain(line);
      expect(html, `${path}: lowercase positioning line`).not.toContain(line.toLowerCase());
      expect(html, `${path}: ordinary noun stays lowercase`).toContain(noun);
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
    expect(css).toContain("@media (min-width: 761px) {\n  .hero-cta {\n    min-width: 340px;\n  }\n}");
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

// Issue #1127: LaunchIgniter's free listing is verified against the homepage
// first screen, so the hero copy closes with their badge — the vendor's embed
// unmodified, eager (no loading attribute: it sits in the first screen and a
// lazy image would arrive after the fold), on their host, and dofollow so the
// directory can read the backlink from the shipped bytes. Turbo0's listing
// needs its badge present in the homepage HTML; the shared footer badge row
// carries it (Issue #1116), and this pins that the homepage still does.
describe("homepage LaunchIgniter and Turbo0 badges (Issue #1127)", () => {
  const homepages = [
    ["site/pages/index.html", "EN source"],
    ["public/index.html", "EN build"],
    ["site/pages/zh/index.html", "ZH source"],
    ["public/zh/index.html", "ZH build"],
  ];

  it("closes the homepage hero copy with the vendor's LaunchIgniter badge", async () => {
    for (const [path, label] of homepages) {
      const html = await read(path);
      const copy = normalizeIndent(heroCopy(html));
      expect(copy.split("\n").at(-1), `${path} (${label}): the badge is the hero copy's last element`)
        .toBe(HERO_BADGE);
      const anchor = hero(html).match(new RegExp(`<a class="hero-badge"[^>]*>`))?.[0] ?? "";
      expect(anchor, `${path} (${label}): the hero badge anchor`)
        .toBe('<a class="hero-badge" href="https://launchigniter.com/product/orbi?ref=badge-orbi" target="_blank" rel="noopener">');
      // The directory verifies a crawlable backlink, so neither the hero nor
      // any other copy of the badge may carry nofollow.
      expect(anchor, `${path} (${label}): the hero badge backlink must stay dofollow`)
        .not.toContain("nofollow");
      const image = hero(html).match(/<img class="hero-badge-img"[^>]*>/)?.[0] ?? "";
      expect(image, `${path} (${label}): the badge image`)
        .toBe('<img class="hero-badge-img" src="https://launchigniter.com/api/badge/orbi?theme=light" alt="Featured on LaunchIgniter" width="212" height="55" />');
      // Above the fold means loaded with the page: a lazy badge is a badge the
      // reviewer never sees in the first screen.
      expect(image, `${path} (${label}): the first-screen badge must load eagerly`)
        .not.toContain("loading=");
      // The vendor counts the impression from the image request, so the badge
      // must stay on launchigniter.com rather than a self-hosted copy.
      expect(count(html, /src="\/img\/[^"]*launchigniter[^"]*"/gi), `${path} (${label}): the badge must not be self-hosted`)
        .toBe(0);
      expect(count(hero(html), /class="hero-badge"/g), `${path} (${label}): exactly one hero badge`)
        .toBe(1);
    }
  });

  it("keeps the Turbo0 badge in the homepage footer badge row", async () => {
    // The badge lives in the shared footer partial, so the built homepages and
    // that partial are where Turbo0's listing requirement is met.
    for (const [path, label] of [
      ["site/partials/footer.html", "shared footer"],
      ["public/index.html", "EN build"],
      ["public/zh/index.html", "ZH build"],
    ]) {
      const html = await read(path);
      expect(html, `${path} (${label}): the Turbo0 badge`)
        .toContain('<a href="https://turbo0.com/item/orbi" target="_blank" rel="noopener noreferrer"><img src="https://img.turbo0.com/badge-listed-light.svg" alt="Listed on Turbo0" width="482" height="161" />');
    }
  });

  it("sizes the hero badge itself, outside the footer's shared 28px mark", async () => {
    const css = await read("public/styles.css");
    const rule = css.match(/\.hero-badge \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(rule, "the hero badge needs its own spacing under the CTA note").toContain("margin-top: 18px;");
    expect(css, "the badge image must not add a line-box descender inside the anchor")
      .toContain(".hero-badge-img { display: block; }");
  });
});
