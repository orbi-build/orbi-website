// Issue #1479: the site-level About page (/about/, /zh/about/) states what
// Orbi is, who runs it, why it exists, what AI does versus what a person
// decides, how it is paid for and how this site is written — with the company
// subject and contact details a "who is responsible for this site" page needs.
//
// These tests read the shipped bytes in public/ (the files the Worker deploys),
// so a hand edit that skips `npm run build` fails here. The footer entry, the
// language mirror, the sitemap entry and the inbound link are pinned by
// tests/pages.test.js and tests/inbound-links.test.js; this file pins the
// page's own contract: its approved copy, its counted numbers and their
// sources, and its structured data.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const YOUTUBE = "https://www.youtube.com/@orbibuild";
const REDDIT = "https://www.reddit.com/r/OrbiBuild/";

const PAGES = [
  {
    output: "about/index.html",
    canonical: "https://orbi.build/about/",
    mirror: "https://orbi.build/zh/about/",
    h1: "The lights-out software factory that builds itself.",
    h2: [
      "Larry 🍀 Orbi, creator of Orbi",
      "A lights-out factory for software",
      "Where AI does the work, and where a person decides",
      "Every claim points to its source",
    ],
    h3: ["AI agents do", "You decide", "The engine is open source", "Orbi’s own deliveries are public", "It stays in your GitHub"],
    kickers: [
      "Who runs Orbi",
      "Why Orbi exists",
      "How Orbi works",
      "Open source",
      "Orbi builds Orbi",
      "Your code",
      "How Orbi makes money",
      "How I write this site",
      "Company",
      "Contact",
    ],
    copy: [
      "Say what you want in one sentence and Orbi takes it all the way to a release. Orbi’s own code ships the same way.",
      "I write the delivery rules and decide what Orbi works on next.",
      "I step in when a delivery stops for a human decision.",
      "Orbi’s own changes go through Orbi: I file Issues, and it plans, codes, reviews and releases them.",
      "Posts here are drafted with AI agents; I choose the topics, check the facts and decide what gets published.",
      "20 years writing software. Father of two, based in Singapore. On X I share what works and what breaks when AI writes the code.",
      "One person, several businesses.",
      "Room for AI to grow.",
      "Software goes lights-out.",
      "Turn your one-sentence request into an Issue with acceptance criteria, then write a plan",
      "The final controls: branch protection, required checks and access all stay on GitHub",
      "AGPL-3.0, or the Sustainable Use License if AGPL is ruled out. Self-hosting is free either way, and you can read exactly what Orbi does in the code.",
      "Every step is recorded in your own repository, and one step on GitHub revokes Orbi Cloud’s access.",
      "The engine is free to self-host. Orbi Cloud runs it for you as a paid hosted service, and those subscriptions are how Orbi is paid for.",
      "Orbi is self-funded, with no investors.",
      "Numbers link to where they came from:",
      "Pages show their dates.",
      "Tests say what they ran on:",
      "Other products are described from their current official docs,",
      "Orbi and Orbi Cloud are operated by <strong>Low Code, LLC</strong>, a limited liability company registered in the United States. Card payments are handled by Stripe and appear on statements as ORBI CLOUD.",
      "One sentence in. <span>A release out.</span>",
    ],
    numbers: [
      ["164", "https://github.com/orbi-build/orbi/releases", "tagged releases of the engine ↗"],
      ["995", "https://github.com/orbi-build/orbi/issues?q=is%3Aissue+label%3Aai-merged", "Issues Orbi has taken from label to merge since 2026-08-26 ↗"],
      ["208", "https://github.com/orbi-build/orbi/issues?q=is%3Aissue+label%3Aai-merged+closed%3A2026-10-26..2026-11-25", "of them in the last 30 days ↗"],
      ["100%", "https://status.orbi.build", "Orbi Cloud dashboard uptime since monitoring began on 2026-09-18 ↗"],
    ],
    sourceNote: "Counted on 2026-11-25 from the public orbi-build/orbi repository and status.orbi.build. Each number opens the page it was counted from.",
    links: [
      ["/cloud/login", "Try Cloud with GitHub"],
      ["https://github.com/orbi-build/orbi", "Read the engine on GitHub ↗"],
      ["/about/larry-orbi/", "All posts by Larry →"],
      ["/cloud/", "See how a release runs, end to end →"],
      ["/trust/#not-covered", "What Orbi does not promise →"],
      ["/evidence/", "Open six real deliveries →"],
      ["/trust/", "Read the nine trust questions →"],
      ["/cloud/#pricing", "See plans and the free trial →"],
      ["https://t.me/+kJRTTpFGBRU0M2Y9", "Orbi Telegram group ↗"],
      ["mailto:support@orbi.build", "support@orbi.build"],
      ["https://github.com/orbi-build/orbi/issues", "GitHub Issues ↗"],
      ["https://github.com/orbi-build/orbi-website/issues", "orbi-build/orbi-website"],
      ["https://docs.orbi.build", "Self-host the engine ↗"],
    ],
  },
  {
    output: "zh/about/index.html",
    canonical: "https://orbi.build/zh/about/",
    mirror: "https://orbi.build/about/",
    h1: "这座软件黑灯工厂，一直在造它自己。",
    h2: ["Larry 🍀 Orbi", "软件黑灯工厂", "哪些交给 AI，哪些由人决定", "每一个说法都标出处"],
    h3: ["AI 代理负责", "你来决定", "引擎开源", "Orbi 自己的交付全部公开", "代码留在你的 GitHub"],
    kickers: ["谁在做 ORBI", "为什么做 ORBI", "ORBI 怎么运转", "开源", "ORBI 做 ORBI", "你的代码", "ORBI 靠什么赚钱", "本站怎么写", "公司", "联系方式"],
    copy: [
      "一句话说清需求，Orbi 一路做到发版；Orbi 自己的代码也是这样交付的。",
      "我定交付规则，决定 Orbi 下一步做什么。",
      "交付停下来要人拿主意时，由我出面。",
      "Orbi 自己的改动也交给 Orbi：我开 Issue，它规划、写代码、评审、发布。",
      "本站文章由 AI 代理起草，选题、核对事实、决定发不发由我负责。",
      "写了 20 年代码，两个孩子的爸爸，住在新加坡。在 X 上分享 AI 写代码时哪些管用、哪些会翻车。",
      "Orbi 的创始人",
      "一个人，好几条业务线。",
      "给 AI 留空间。",
      "软件也会黑灯生产。",
      "把你的一句话写成带验收条件的 Issue，再写计划",
      "最终控制权：分支保护、必需检查和访问权限都留在 GitHub",
      "AGPL-3.0；不能用 AGPL 的话可选 Sustainable Use License。自己部署都免费，Orbi 做了什么，代码里都查得到。",
      "每一步都记在你自己的仓库里，在 GitHub 上一步就能收回 Orbi Cloud 的访问权限。",
      "引擎可以免费自己部署。Orbi Cloud 是替你运行它的付费托管服务，Orbi 靠这些订阅运转。",
      "没有人投钱，Orbi 是自己出钱做的。",
      "数字链接到来源：",
      "页面标日期。",
      "测评写明条件：",
      "写别家产品，以对方当前的官方文档为准，",
      "Orbi 和 Orbi Cloud 由在美国注册的有限责任公司 <strong>Low Code, LLC</strong> 运营。刷卡由 Stripe 处理，账单上显示 ORBI CLOUD。",
      "一句话进去，<span>Release 出来。</span>",
    ],
    numbers: [
      ["164", "https://github.com/orbi-build/orbi/releases", "个引擎发布版本 ↗"],
      ["995", "https://github.com/orbi-build/orbi/issues?q=is%3Aissue+label%3Aai-merged", "个 Issue 由 Orbi 从打标签做到合并，2026-08-26 起 ↗"],
      ["208", "https://github.com/orbi-build/orbi/issues?q=is%3Aissue+label%3Aai-merged+closed%3A2026-10-26..2026-11-25", "个是近 30 天做完的 ↗"],
      ["100%", "https://status.orbi.build", "Orbi Cloud 控制台可用率，2026-09-18 起监测 ↗"],
    ],
    sourceNote: "2026-11-25 从公开仓库 orbi-build/orbi 和 status.orbi.build 统计。点数字打开对应来源。",
    links: [
      ["/zh/cloud/login", "用 GitHub 试用 Cloud"],
      ["https://github.com/orbi-build/orbi", "在 GitHub 上看引擎源码 ↗"],
      ["/zh/about/larry-orbi/", "Larry 的全部文章 →"],
      ["/zh/cloud/", "看一次发布从头到尾怎么跑 →"],
      ["/zh/trust/#not-covered", "Orbi 不承诺的事 →"],
      ["/zh/evidence/", "打开六次真实交付 →"],
      ["/zh/trust/", "看九个关于信任的问题 →"],
      ["/zh/cloud/#pricing", "看套餐和免费试用 →"],
      ["https://t.me/+kJRTTpFGBRU0M2Y9", "Orbi Telegram 群 ↗"],
      ["mailto:support@orbi.build", "support@orbi.build"],
      ["https://github.com/orbi-build/orbi/issues", "GitHub Issues ↗"],
      ["https://github.com/orbi-build/orbi-website/issues", "orbi-build/orbi-website"],
      ["https://docs.orbi.build/zh", "自己部署引擎 ↗"],
    ],
  },
];

const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, "");
const textOf = (fragment) => fragment.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function ldJson(html) {
  const blocks = [...stripComments(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks.flatMap(([, body]) => {
    const data = JSON.parse(body);
    return data["@graph"] ? data["@graph"] : [data];
  });
}

const nodeOfType = (html, type) => ldJson(html).find((node) => node["@type"] === type);

let shipped;
let homepages;
let sitemap;
let llms;

beforeAll(async () => {
  shipped = new Map();
  for (const page of PAGES) shipped.set(page.output, await readFile(join(ROOT, "public", page.output), "utf8"));
  homepages = {
    en: await readFile(join(ROOT, "public", "index.html"), "utf8"),
    zh: await readFile(join(ROOT, "public", "zh", "index.html"), "utf8"),
  };
  sitemap = await readFile(join(ROOT, "public", "sitemap.xml"), "utf8");
  llms = await readFile(join(ROOT, "public", "llms.txt"), "utf8");
});

describe("the About pages ship the approved copy (Issue #1479)", () => {
  for (const page of PAGES) {
    it(`${page.output}: canonical, mutual hreflang and exactly one H1`, () => {
      const html = shipped.get(page.output);
      const zh = page.canonical.includes("/zh/");
      expect(html).toContain(`<link rel="canonical" href="${page.canonical}">`);
      expect(html).toContain(`<link rel="alternate" hreflang="en" href="${zh ? page.mirror : page.canonical}">`);
      expect(html).toContain(`<link rel="alternate" hreflang="zh-CN" href="${zh ? page.canonical : page.mirror}">`);
      expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${zh ? page.mirror : page.canonical}">`);
      expect(stripComments(html).match(/<h1\b/g)).toHaveLength(1);
      expect(textOf(stripComments(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]), `${page.output}: h1`).toBe(page.h1);
    });

    it(`${page.output}: carries the approved section headings and body copy`, () => {
      const html = stripComments(shipped.get(page.output));
      const headings = (tag) =>
        [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map(([, body]) => textOf(body));
      for (const heading of page.h2) {
        expect(headings("h2"), `${page.output}: H2 "${heading}"`).toContain(heading);
      }
      expect(headings("h3"), `${page.output}: H3 order`).toEqual(page.h3);
      const kickers = [...html.matchAll(/<p class="about-kicker"[^>]*>([\s\S]*?)<\/p>/g)].map(([, body]) => textOf(body));
      expect(kickers, `${page.output}: section labels`).toEqual(page.kickers);
      for (const sentence of page.copy) {
        expect(html.replace(/\s+/g, " "), `${page.output}: copy "${textOf(sentence)}"`).toContain(sentence);
      }
      expect(html).toMatch(/<p class="eyebrow">[^<]*2026-11-25<\/p>/);
      // Issue #1490: the Company section states the operator and the billing
      // name only — no mailing address, and no styles left behind for one.
      expect(html, `${page.output}: mailing address removed`).not.toContain("One-North Gateway");
      expect(html, `${page.output}: address styles removed`).not.toContain("about-address");
    });

    it(`${page.output}: links the approved destinations with the approved labels`, () => {
      const html = stripComments(shipped.get(page.output));
      for (const [href, label] of page.links) {
        const anchor = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
          .find(([, target, body]) => target === href && textOf(body) === label);
        expect(anchor, `${page.output}: missing <a href="${href}">${label}</a>`).toBeTruthy();
      }
    });
  }
});

describe("the four counted numbers are static links to their sources (Issue #1479)", () => {
  for (const page of PAGES) {
    it(`${page.output}: every number is a link to where it was counted, with the date beside it`, () => {
      const html = stripComments(shipped.get(page.output));
      const numbers = [...html.matchAll(/<a class="about-number" href="([^"]+)"><strong>([^<]+)<\/strong><span>([\s\S]*?)<\/span><\/a>/g)]
        .map(([, href, value, label]) => [value, href, textOf(label)]);
      expect(numbers, `${page.output}: the four numbers`).toEqual(page.numbers);
      const note = html.match(/<p class="about-number-source">([\s\S]*?)<\/p>/)?.[1];
      expect(textOf(note ?? ""), `${page.output}: source note`).toBe(page.sourceNote);
      expect(textOf(note ?? "")).toContain("2026-11-25");
    });

    it(`${page.output}: only the release count uses the accent colour`, () => {
      const html = shipped.get(page.output);
      expect(html).toContain(".about-number:first-child strong { color: var(--run); }");
      const accentRules = [...html.matchAll(/\.about-number[^{]*\{[^}]*var\(--run\)[^}]*\}/g)].map(([rule]) => rule);
      expect(accentRules, `${page.output}: accent rules`).toEqual([".about-number:first-child strong { color: var(--run); }"]);
    });
  }
});

describe("the About pages carry AboutPage structured data (Issue #1479)", () => {
  const organizationId = "https://orbi.build/#organization";

  it("points AboutPage.mainEntity at the homepage Organization", () => {
    for (const page of PAGES) {
      const html = shipped.get(page.output);
      const homepageOrganization = nodeOfType(homepages[page.canonical.includes("/zh/") ? "zh" : "en"], "Organization");
      const about = nodeOfType(html, "AboutPage");
      expect(about, `${page.output}: AboutPage node`).toBeTruthy();
      expect(about.mainEntity, `${page.output}: mainEntity`).toEqual({ "@id": organizationId });
      expect(homepageOrganization["@id"], `${page.output}: homepage Organization @id`).toBe(organizationId);
      expect(nodeOfType(html, "Organization")["@id"], `${page.output}: local Organization @id`).toBe(organizationId);
    }
  });

  it("adds YouTube and Reddit to the Organization sameAs on both homes", () => {
    for (const [lang, html] of Object.entries(homepages)) {
      const organization = nodeOfType(html, "Organization");
      expect(organization.sameAs, `${lang} home sameAs`).toEqual(expect.arrayContaining([YOUTUBE, REDDIT]));
    }
  });
});

describe("the About pages are discoverable (Issue #1479)", () => {
  it("appears in the sitemap with its language alternates", () => {
    for (const page of PAGES) {
      const at = sitemap.indexOf(`<loc>${page.canonical}</loc>`);
      expect(at, `${page.canonical}: sitemap entry`).toBeGreaterThan(-1);
      const entry = sitemap.slice(at, sitemap.indexOf("</url>", at));
      expect(entry, `${page.canonical}: alternates`).toContain(`hreflang="en" href="${page.canonical.includes("/zh/") ? page.mirror : page.canonical}"`);
      expect(entry, `${page.canonical}: alternates`).toContain(`hreflang="zh-CN" href="${page.canonical.includes("/zh/") ? page.canonical : page.mirror}"`);
    }
  });

  it("is listed in site/llms.txt for both languages", () => {
    const links = llms.slice(llms.indexOf("## Links"));
    expect(links).toContain("- About Orbi — what it is, who runs it, why it exists (English): https://orbi.build/about/");
    expect(links).toContain("- About Orbi — what it is, who runs it, why it exists (Chinese): https://orbi.build/zh/about/");
  });
});

describe("the About page portrait (Issue #1479)", () => {
  it("ships the 320x320 author avatar the page displays at 160 px", async () => {
    const png = await readFile(join(ROOT, "public", "img", "larry-orbi.png"));
    expect(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "PNG signature").toBe(true);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)], "avatar pixel box").toEqual([320, 320]);
    for (const page of PAGES) {
      const html = shipped.get(page.output);
      expect(html, page.output).toContain('<img src="/img/larry-orbi.png" alt="Larry 🍀 Orbi" width="320" height="320">');
      // 160 px at deviceScaleFactor 1 needs 160 source pixels; 320 leaves a 2x margin.
      expect(html, page.output).toContain(".about-portrait img { width: 160px; height: 160px; }");
    }
  });
});

describe("the About page sells nothing it does not state (Issue #1479)", () => {
  it("keeps prices and trial days off the page, linking the pricing section instead", () => {
    for (const page of PAGES) {
      const html = stripComments(shipped.get(page.output));
      expect(html, page.output).not.toMatch(/US\$\s?\d/);
      expect(html, page.output).not.toMatch(/\d+-day free trial/);
      expect(html, page.output).not.toMatch(/免费试用\s*\d+\s*天/);
      expect(html, page.output).toContain("/cloud/#pricing");
    }
  });
});
