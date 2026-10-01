#!/usr/bin/env node
// Builds every page in public/ from shared fragments plus per-page sources:
//   site/partials/nav.html     — the one primary navigation, {{SLOTS}} filled per page
//   site/partials/footer.html  — the one site footer (EN and ZH labels built in)
//   site/pages/**              — one source per page: a JSON header (lang, mirror,
//                                layout, nav params) followed by the page body with
//                                <!--@nav--> and <!--@footer--> markers where the
//                                fragments belong.
//   content/blog/<slug>.md     — one Markdown file per blog post (Issue #212),
//   content/blog/zh/<slug>.md    YAML front matter plus a CommonMark body; the
//                                build renders the body (marked) into the post
//                                template and derives the /blog/ indexes and
//                                /blog/feed.xml from the post list.
//
// Usage: node scripts/build-pages.mjs [--out <dir>]   (default: public)
//
// A `layout: "minified"` page receives both fragments joined onto one line,
// the shape those ten files were authored in; everything else gets the
// indented form. Either way the rendered fragment is byte-exact, so editing
// a fragment and rebuilding never reflows a page that declares minified.

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { marked } from "marked";
import { renderSocialProof, validateSocialProof } from "./social-proof.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES_DIR = join(ROOT, "site", "pages");
const PARTIALS_DIR = join(ROOT, "site", "partials");
const CONTENT_DIR = join(ROOT, "content", "blog");
const SOCIAL_PROOF_PATH = join(ROOT, "site", "data", "social-proof.json");
const GUIDES_DATA_PATH = join(ROOT, "site", "data", "guides.json");

// Inline, first-party engagement telemetry. It sends only event metadata and
// uses Beacon so page exits do not block navigation or rendering.
const CLOUDFLARE_ANALYTICS_SCRIPT = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "44c2c3310e2e46b7955bb09f04c93fd1"}'></script>`;

const ENGAGEMENT_SCRIPT = `<script>(()=>{
  const endpoint="/cloud/e", start=Date.now();
  let visible=document.visibilityState!=="hidden", visibleAt=visible?start:0, visibleMs=0, interacted=false, engagedSent=false, depthSent=false, maxDepth=0;
  const send=(kind,detail,extra)=>{const body={kind,path:location.pathname};if(detail!==undefined)body.detail=String(detail);if(extra)Object.assign(body,extra);try{if(!navigator.sendBeacon(endpoint,new Blob([JSON.stringify(body)],{type:"application/json"})))console.warn("engagement_report_failed","sendBeacon returned false");}catch(error){console.warn("engagement_report_failed",error);}};
  send("visit",undefined,{search:location.search,referrer:document.referrer});
  const elapsed=()=>visibleMs+(visible?Date.now()-visibleAt:0);
  const check=()=>{if(!engagedSent&&interacted&&elapsed()>=10000){engagedSent=true;send("engaged");}};
  const schedule=()=>setTimeout(check,Math.max(0,10000-elapsed()));
  const markInteraction=()=>{interacted=true;check();};
  ["scroll","pointerdown","keydown","touchstart"].forEach(type=>addEventListener(type,markInteraction,{passive:true}));
  const depth=()=>{const height=document.documentElement.scrollHeight;maxDepth=Math.max(maxDepth,height<=0?100:Math.min(100,Math.floor((scrollY+innerHeight)/height*100)));};
  addEventListener("scroll",depth,{passive:true});
  schedule();
  const hide=()=>{depth();if(visible){visibleMs+=Date.now()-visibleAt;visible=false;}check();if(!depthSent){depthSent=true;send("scroll_depth",Math.max(25,Math.min(100,Math.floor(maxDepth/25)*25)));}};
  const show=()=>{if(!visible){visible=true;visibleAt=Date.now();schedule();}};
  addEventListener("visibilitychange",()=>document.visibilityState==="hidden"?hide():show());
  addEventListener("pagehide",hide);
  addEventListener("click",event=>{const link=event.target.closest?.("[data-cta]");if(link)send("cta_click",link.dataset.cta);},{passive:true});
  const sectionViews=new Set();
  const sectionDetail=section=>section.id||section.classList?.[0];
  if(typeof IntersectionObserver!=="undefined"){
    const sections=[...document.querySelectorAll("main section")].filter(section=>!section.parentElement?.closest("section"));
    const thresholds=[.3,...sections.map(section=>{const height=section.getBoundingClientRect().height;return height>0?Math.min(.3,innerHeight*.5/height):.3;})];
    const sectionObserver=new IntersectionObserver(entries=>{entries.forEach(entry=>{
      const detail=sectionDetail(entry.target);
      if(detail&&!sectionViews.has(entry.target)&&((entry.intersectionRatio||0)>=.3||(entry.intersectionRect?.height||0)>=innerHeight*.5)){
        sectionViews.add(entry.target);send("section_view",detail);sectionObserver.unobserve(entry.target);
      }
    });},{threshold:thresholds});
    sections.forEach(section=>sectionObserver.observe(section));
  }
})();</script>`;

// The four pages that carry the data-driven social-proof section (Issue #226):
// the two homes render the capped grid, the two evidence pages the full
// grouped list. A page in this map without the <!--@social-proof--> marker
// fails the build, like a blog index without <!--@posts-->.
const SOCIAL_PROOF_VARIANTS = {
  "index.html": "home",
  "zh/index.html": "home",
  "evidence/index.html": "evidence",
  "zh/evidence/index.html": "evidence",
};

// Footer deep dives, in the order the /compare/ grid and the browser smoke
// test pin them. Href prefix per language; anchor text is the competitors'
// shared "Orbi vs X" naming (the ZH pages' own h1 wording).
const DEEP_DIVES = [
  ["orca", "Orbi vs Orca"],
  ["openclaw", "Orbi vs OpenClaw"],
  ["github-copilot-coding-agent", "Orbi vs GitHub Copilot cloud agent"],
  ["managed-agents", "Orbi vs Claude Managed Agents"],
  ["claude-code", "Orbi vs Claude Code"],
  ["openhands", "Orbi vs OpenHands"],
  ["hermes-agent", "Orbi vs Hermes Agent"],
  ["keelen", "Orbi vs Keelen"],
  ["codex", "Orbi vs OpenAI Codex"],
  ["devin", "Orbi vs Devin"],
  ["jules", "Orbi vs Google Jules"],
  ["cursor", "Orbi vs Cursor Cloud Agents"],
];

// Footer guides row (Issue #611): the SEO landing pages lived only in the
// sitemap — no internal page linked them — so the footer carries a guides row
// next to the compare row, giving every URL below a sitewide inbound link.
// [EN href, ZH href, EN label, ZH label]; labels are short forms of each
// page's own H1, matching the anchors already used inside the site body.
const GUIDES = [
  ["/guides/issue-to-release/", "/zh/guides/issue-to-release/", "Issue to release", "Issue 到发版"],
  ["/guides/ci-gates/", "/zh/guides/ci-gates/", "CI gates", "CI 门禁"],
  [
    "/guides/auto-merge-ai-prs/",
    "/zh/guides/auto-merge-ai-prs/",
    "Auto-merge AI PRs",
    "自动合并 AI PR",
  ],
  [
    "/guides/autonomous-coding-agent/",
    "/zh/guides/autonomous-coding-agent/",
    "Autonomous coding agent",
    "自主编程 agent",
  ],
  [
    "/guides/self-hosted-coding-agent/",
    "/zh/guides/self-hosted-coding-agent/",
    "Self-hosted coding agent",
    "自托管编程 agent",
  ],
  [
    "/guides/codex-github-issues/",
    "/zh/guides/codex-github-issues/",
    "Codex on GitHub Issues",
    "Codex 处理 GitHub Issue",
  ],
  ["https://aiready.sh/", "https://aiready.sh/zh/", "ai-ready: 12 factors", "ai-ready 十二要素"],
];

// Everything in the fragments that is a pure function of the page language.
const LANG = {
  en: {
    homeHref: "/",
    homeAria: "Orbi home",
    toggleAria: "Open navigation",
    toggleOpen: "Open navigation",
    toggleClose: "Close navigation",
    navAria: "Primary navigation",
    systemLabel: "How it works",
    guidesLabel: "Guides",
    guidesHref: "/guides/",
    comparisonsLabel: "Orbi vs alternatives",
    comparisonsDescription: "Claude Code, Codex, Devin and more, fact-checked",
    costLabel: "Pricing",
    evidenceLabel: "Orbi builds Orbi",
    evidenceDescription: "Public issues, PRs and releases on GitHub",
    docsLabel: "Docs",
    resourcesLabel: "Resources",
    methodLabel: "ai-ready: 12 factors",
    methodDescription: "What makes an Issue safe to hand to an AI",
    methodHref: "/aiready/",
    benchmarkLabel: "How we test the harness",
    benchmarkDescription: "Delivery runs on open-source bugs, graded by maintainers' tests",
    benchmarkHref: "/benchmark/",
    selfHostedDocsLabel: "Self-hosted Docs",
    cloudDocsNavLabel: "Cloud Docs",
    blogLabel: "Blog",
    costPerPrLabel: "Cost per merged PR",
    costPerPrDescription: "Measured on our own repos, with sample size and limits",
    productHeading: "Product",
    resourcesHeading: "Resources",
    guidesHeading: "Guides",
    compareHeading: "Compare",
    companyHeading: "Company",
    friendsLabel: "Friends",
    friendsAria: "Friends",
    langGroupAria: "Language",
    currentLangLabel: "EN",
    otherLangAttr: "zh-CN",
    otherLangLabel: "ZH",
    otherLangAria: "简体中文",
    langPrefix: "",
    tagline: "Software production that survives the session.",
    footerNavAria: "Footer navigation",
    docsHref: "https://docs.orbi.build",
    cloudDocsHref: "https://cloud-docs.orbi.build/?ref=footer",
    cloudDocsLabel: "Cloud Docs",
    applyLabel: "Start free",
    signInLabel: "Sign in",
    cloudLabel: "Cloud",
    compareLabel: "Compare",
    faqLabel: "FAQ",
    releasesLabel: "Releases",
    statusLabel: "Status",
    privacyLabel: "Privacy",
    termsLabel: "Terms",
    supportLabel: "Support",
    directionLabel: "Direction",
    roadmapLabel: "Roadmap",
    deepAria: "Compare deep dives",
    deepSpan: "Compare",
    guidesAria: "Guides",
    guidesSpan: "Guides",
  },
  zh: {
    homeHref: "/zh/",
    homeAria: "Orbi 首页",
    toggleAria: "打开导航菜单",
    toggleOpen: "打开导航菜单",
    toggleClose: "关闭导航菜单",
    navAria: "主导航",
    systemLabel: "产品怎么运作",
    guidesLabel: "指南",
    guidesHref: "/zh/guides/",
    comparisonsLabel: "与同类工具对比",
    comparisonsDescription: "Claude Code、Codex、Devin 等，逐条核实",
    costLabel: "价格",
    evidenceLabel: "Orbi 交付自己的记录",
    evidenceDescription: "公开的 Issue、PR 和发版，都在 GitHub 上",
    docsLabel: "文档",
    resourcesLabel: "资源",
    methodLabel: "ai-ready 12 要素",
    methodDescription: "什么样的 Issue 能交给 AI 无人值守交付",
    methodHref: "/aiready/zh/",
    benchmarkLabel: "我们怎么测 harness",
    benchmarkDescription: "在开源 bug 上跑交付，用维护者的测试打分",
    benchmarkHref: "/zh/benchmark/",
    selfHostedDocsLabel: "自托管文档",
    cloudDocsNavLabel: "Cloud 文档",
    blogLabel: "博客",
    costPerPrLabel: "每个 PR 花多少钱",
    costPerPrDescription: "在自家仓库实测，附样本量和限制",
    productHeading: "产品",
    resourcesHeading: "资源",
    guidesHeading: "指南",
    compareHeading: "对比",
    companyHeading: "公司",
    friendsLabel: "Friends",
    friendsAria: "Friends",
    langGroupAria: "语言",
    currentLangLabel: "ZH",
    otherLangAttr: "en",
    otherLangLabel: "EN",
    otherLangAria: "English",
    langPrefix: "/zh",
    tagline: "不会随 Session 消失的软件生产。",
    footerNavAria: "页脚导航",
    docsHref: "https://docs.orbi.build/zh",
    cloudDocsHref: "https://cloud-docs.orbi.build/?ref=footer",
    cloudDocsLabel: "Cloud 文档",
    applyLabel: "免费开始",
    signInLabel: "登录",
    cloudLabel: "Cloud",
    compareLabel: "竞品对比",
    faqLabel: "常见问题",
    releasesLabel: "发布记录",
    statusLabel: "状态",
    privacyLabel: "隐私政策",
    termsLabel: "服务条款",
    supportLabel: "支持",
    directionLabel: "方向",
    roadmapLabel: "路线图",
    deepAria: "竞品深度对比",
    deepSpan: "深度对比",
    guidesAria: "指南",
    guidesSpan: "指南",
  },
};

function fill(template, slots) {
  let out = template;
  for (const [name, value] of Object.entries(slots)) {
    out = out.replaceAll(`{{${name}}}`, value);
  }
  if (out.includes("{{")) {
    const leftover = out.match(/\{\{[A-Z_]+\}\}/g)?.join(", ");
    throw new Error(`fragment has unfilled slots: ${leftover}`);
  }
  return out;
}

// Issue #610: a page that also lives on another host (aiready.sh serves the
// aiready pages) prefixes its chrome links with the site base, so nav and
// footer links land on orbi.build instead of dead paths on the other host.
function withSiteBase(nav, href) {
  return nav?.siteBase && href.startsWith("/") ? `${nav.siteBase}${href}` : href;
}

const NAV_DROPDOWN_INDICATOR = '<svg class="nav-dropdown-indicator" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M3 5.5 8 10.5 13 5.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

export function renderNav(page, partial = NAV_PARTIAL) {
  if (!partial) throw new Error("nav partial not loaded; call buildPages() first or pass the partial");
  const t = LANG[page.lang];
  const n = page.nav;
  if (!n) throw new Error(`${page.output}: page has no nav params`);
  const base = (href) => withSiteBase(n, href);
  const compareAttrs =
    (n.compareDataCta ? ' data-cta="comparisons"' : "") +
    (n.compareCurrent ? ' aria-current="page"' : "");
  const costAttrs = n.costCurrent ? ' aria-current="page"' : "";
  const currentLine = `<span aria-current="page">${t.currentLangLabel}</span>`;
  const otherLine = `<a href="${base(n.langSwitchHref)}" lang="${t.otherLangAttr}" aria-label="${t.otherLangAria}">${t.otherLangLabel}</a>`;
  const [lineA, lineB] = n.langCurrentFirst
    ? [currentLine, otherLine]
    : [otherLine, currentLine];
  return fill(partial, {
    HOME_HREF: base(t.homeHref),
    HOME_ARIA: t.homeAria,
    TOGGLE_ARIA: t.toggleAria,
    TOGGLE_OPEN: t.toggleOpen,
    TOGGLE_CLOSE: t.toggleClose,
    NAV_ID: n.navId,
    NAV_ARIA: t.navAria,
    SYSTEM_HREF: base(n.systemHref),
    SYSTEM_LABEL: t.systemLabel,
    COMPARE_HREF: base(n.compareHref),
    COMPARE_ATTRS: compareAttrs,
    COMPARE_LABEL: n.compareLabel,
    COMPARE_COST_JOIN: join,
    COST_HREF: base(n.costHref),
    COST_ATTRS: costAttrs,
    COST_LABEL: t.costLabel,
    DOCS_HREF: t.docsHref,
    DOCS_LABEL: t.docsLabel,
    SIGNIN_LABEL: t.signInLabel,
    SIGNIN_HREF: base("/api/login"),
    APPLY_LABEL: t.applyLabel,
    CLOUD_HREF: base(`${t.langPrefix}/cloud/login`),
  });
}

export function renderFooter(page) {
  const t = LANG[page.lang];
  const isHome = page.output === "index.html" || page.output === "zh/index.html";
  // Anchors #faq/#direction live on the language home; other pages need the
  // absolute path in front — "/#faq" on EN pages, "/zh/#faq" on ZH pages
  // (Issue #106: the anchor-prefix rule).
  const anchorPrefix = isHome ? "" : `${t.langPrefix}/`;
  const base = (href) => withSiteBase(page.nav, href);
  const currentLine = `<span aria-current="page">${t.currentLangLabel}</span>`;
  const otherLine = `<a href="${base(page.nav.langSwitchHref)}" lang="${t.otherLangAttr}" aria-label="${t.otherLangAria}">${t.otherLangLabel}</a>`;
  const [lineA, lineB] = page.nav.langCurrentFirst
    ? [currentLine, otherLine]
    : [otherLine, currentLine];
  const deepLinks = DEEP_DIVES.map(
    ([slug, name]) =>
      `      <a href="${base(`${t.langPrefix}/compare/${slug}/`)}">${name}</a>`
  ).join("\n");
  const guideLinks = GUIDES.map(
    ([en, zh, enLabel, zhLabel]) =>
      `      <a href="${base(t.langPrefix ? zh : en)}">${t.langPrefix ? zhLabel : enLabel}</a>`
  ).join("\n");
  return `${renderSubscribe(page.lang)}\n  <script src="/subscribe.js" defer></script>\n\n${fill(FOOTER_PARTIAL, {
    HOME_HREF: base(t.homeHref),
    HOME_ARIA: t.homeAria,
    TAGLINE: t.tagline,
    FOOTER_NAV_ARIA: t.footerNavAria,
    PRODUCT_HEADING: t.productHeading,
    PRODUCT_LINKS: [`<li><a href="${base(`${t.langPrefix}/cloud/`)}">${t.cloudLabel}</a></li>`,`<li><a href="${base(`${t.langPrefix}/cloud/#pricing`)}">${t.costLabel}</a></li>`,`<li><a href="${base(page.nav.systemHref)}">${t.systemLabel}</a></li>`,`<li><a href="${base(`${t.langPrefix}/evidence/`)}">${t.evidenceLabel}</a></li>`,`<li><a href="https://github.com/orbi-build/orbi/releases">${t.releasesLabel}</a></li>`,`<li><a href="https://status.orbi.build">${t.statusLabel}</a></li>`].join(""),
    RESOURCES_HEADING: t.resourcesHeading,
    RESOURCES_LINKS: [`<li><a href="${base(`${t.langPrefix}/evidence/`)}">${t.evidenceLabel}</a></li>`,`<li><a href="${base(t.benchmarkHref)}">${t.benchmarkLabel}</a></li>`,`<li><a href="${base(`${t.langPrefix}/cost/`)}">${t.costPerPrLabel}</a></li>`,`<li><a href="${base(t.methodHref)}">${t.methodLabel}</a></li>`,`<li><a href="${base(page.nav.compareHref)}">${t.comparisonsLabel}</a></li>`,`<li><a href="${base(`${t.langPrefix}/blog/`)}">${t.blogLabel}</a></li>`,`<li><a href="${t.docsHref}">${t.selfHostedDocsLabel}</a></li>`,`<li><a href="${t.cloudDocsHref}">${t.cloudDocsLabel}</a></li>`,`<li><a href="${base(`${anchorPrefix}#faq`)}">${t.faqLabel}</a></li>`].join(""),
    GUIDES_HEADING: t.guidesHeading,
    GUIDES_LINKS: guideLinks.replaceAll("      ", "").replaceAll("\n", "").replaceAll("<a ", "<li><a ").replaceAll("</a>", "</a></li>"),
    COMPARE_HEADING: t.compareHeading,
    COMPARE_LINKS: `${deepLinks.replaceAll("      ", "").replaceAll("\n", "").replaceAll("<a ", "<li><a ").replaceAll("</a>", "</a></li>")}<li><a href="${base(`${t.langPrefix}/compare/`)}">${t.compareLabel === "竞品对比" ? "全部对比" : "All comparisons"}</a></li>`,
    COMPANY_HEADING: t.companyHeading,
    COMPANY_LINKS: [`<li><a href="${base(`${t.langPrefix}/support/`)}">${t.supportLabel}</a></li>`,`<li><a href="${base(`${anchorPrefix}#direction`)}">${t.directionLabel}</a></li>`,`<li><a href="https://github.com/orbi-build/orbi/milestones">${t.roadmapLabel}</a></li>`,`<li><a href="${base(`${t.langPrefix}/privacy/`)}">${t.privacyLabel}</a></li>`,`<li><a href="${base(`${t.langPrefix}/terms/`)}">${t.termsLabel}</a></li>`,`<li><a href="https://github.com/orbi-build/orbi">GitHub</a></li>`,`<li><a href="https://x.com/xqliu" rel="me">X</a></li>`,`<li><a href="https://www.youtube.com/@orbibuild" rel="me">YouTube</a></li>`].join(""),
    LANGUAGE_SWITCH: `<div class="footer-language language" role="group" aria-label="${t.langGroupAria}">${lineA}${lineB}</div>`,
    FRIENDS_ARIA: t.friendsAria,
    FRIENDS_LABEL: t.friendsLabel,
  })}`;
}

// "minified" pages authored their chrome on one line: join the fragment's
// lines with nothing. Text content is never split across those lines, so
// trimming line edges cannot eat a byte of content. The pretty form drops
// the template file's trailing newline: the marker it replaces sits mid-page,
// and the page source owns the line breaks around it.
function toLayout(fragment, layout) {
  const body = fragment.replace(/\n$/, "");
  if (layout === "minified") return body.split("\n").map((l) => l.trim()).join("");
  if (layout === "pretty") return body;
  throw new Error(`unknown layout ${JSON.stringify(layout)}`);
}

function parsePage(name, source) {
  const match = source.match(/^<!--orbi:page\n([\s\S]*?)\n-->\n/);
  if (!match) throw new Error(`${name}: missing the <!--orbi:page ...--> JSON header`);
  let header;
  try {
    header = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`${name}: header is not valid JSON: ${error.message}`);
  }
  return { ...header, body: source.slice(match[0].length) };
}

// The public/ URL a page's output path maps to: "cloud/index.html" →
// "/cloud/", "index.html" → "/".
export function pathToHref(output) {
  return `/${output.replace(/index\.html$/, "")}`.replace("//", "/");
}

function contentKey(output) {
  return output.replace(/^zh\//, "").replace(/\/index\.html$/, "");
}

function renderBreadcrumb(page) {
  const href = pathToHref(page.output);
  const zh = page.lang === "zh";
  const isGuide = contentKey(page.output).startsWith("guides/");
  const root = zh ? "/zh/" : "/";
  const section = isGuide ? (zh ? "指南" : "Guides") : (zh ? "竞品对比" : "Compare");
  const sectionHref = isGuide ? `${root}guides/` : `${root}compare/`;
  const current = page.body.match(/<h1\b[^>]*>([^<]+)<\/h1>/)?.[1];
  if (!current) throw new Error(`${page.source}: breadcrumb page needs a plain-text h1`);
  const items = [{ name: zh ? "首页" : "Home", item: `https://orbi.build${root}` }, { name: section, item: `https://orbi.build${sectionHref}` }, { name: current, item: `https://orbi.build${href}` }];
  const json = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((entry, index) => ({ "@type": "ListItem", position: index + 1, name: entry.name, item: entry.item })) });
  return `<nav class="breadcrumbs compare-hero shell" aria-label="${zh ? "面包屑" : "Breadcrumb"}"><a href="${root}">${zh ? "首页" : "Home"}</a><span aria-hidden="true"> › </span><a href="${sectionHref}">${section}</a><span aria-hidden="true"> › </span><span aria-current="page" title="${escAttr(current)}">${escAttr(current)}</span></nav><script type="application/ld+json">${json}</script>`;
}

function renderRelated(page, data) {
  const key = contentKey(page.output);
  const related = data.related[key] || [];
  const zh = page.lang === "zh";
  if (!related.length) return "";
  const links = related.map((target) => {
    const slug = target.replace(/^guides\//, "").replace(/^compare\//, "");
    const guide = data.guides.find((entry) => entry.slug === slug);
    const label = target.startsWith("guides/") ? guide?.[zh ? "zh" : "en"]?.title : `Orbi vs ${slug.replaceAll("-", " ")}`;
    return `<li><a href="${zh ? "/zh/" : "/"}${target}/">${escAttr(label)}</a></li>`;
  }).join("");
  const heading = key.startsWith("guides/") ? (zh ? "相关对比" : "Related comparisons") : (zh ? "相关指南" : "Related guides");
  return `<section class="related-links shell" aria-labelledby="related-links-title"><h2 id="related-links-title">${heading}</h2><ul>${links}</ul></section>`;
}

function renderGuideIndex(page, data) {
  const zh = page.lang === "zh";
  return data.guides.map((guide) => { const copy = guide[zh ? "zh" : "en"]; return `<article class="guide-index-entry"><a class="guide-index-link" href="${zh ? "/zh/" : "/"}guides/${guide.slug}/"><h2 class="guide-index-title">${escAttr(copy.title)}</h2><p class="guide-index-summary">${escAttr(copy.summary)}</p></a></article>`; }).join("\n");
}

// The UTC day a source's lastmod carries. %ct is the timezone-independent
// commit epoch; rendering it to the UTC day matches the untracked-file
// fallback exactly. A local-day format (%cs, or slicing %cI) moves with the
// committer's timezone and disagrees with a UTC CI whenever a commit and a
// build straddle local midnight.
function utcDay(epochSeconds) {
  return new Date(Number(epochSeconds) * 1000).toISOString().slice(0, 10);
}

export function lastCommitDate(source, root = ROOT) {
  const relativeSource = relative(root, source);
  // Content outside the repository (the fixture builds in the tests) has no
  // git history to ask: same fallback as an untracked file.
  if (relativeSource.startsWith("..")) return new Date().toISOString().slice(0, 10);
  try {
    // A source with uncommitted changes is being committed right now: the
    // build runs before the commit, so git log would return the PREVIOUS
    // commit's epoch and the shipped sitemap would lag by one commit — a CI
    // rebuild (file committed) then computes a different lastmod and the
    // byte-for-byte gate goes red (Issue #279). Use the current UTC day,
    // the day the change is committed.
    const dirty = execFileSync("git", ["status", "--porcelain", "--", relativeSource], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    if (dirty) return new Date().toISOString().slice(0, 10);
    const epoch = execFileSync("git", ["log", "-1", "--format=%ct", "--", relativeSource], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    return epoch ? utcDay(epoch) : new Date().toISOString().slice(0, 10);
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`unable to get git lastmod for ${relativeSource}: ${detail}`);
  }
}

// Attribute-value escaping for the generated meta lines, index entries and
// feed items (the hand-written page bodies escape their own copy).
function escAttr(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// --- Blog posts: Markdown files under content/blog (Issue #212) ---

// The blog's YAML subset: one `key: value` per line, values are plain
// single-line strings (they may contain colons — the split is on the first
// one). This keeps the dependency count at one: marked renders, this reads.
export function parseFrontMatter(displayName, source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${displayName}: missing the --- front-matter block`);
  const fields = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const pair = line.match(/^([A-Za-z_]+):\s?(.*)$/);
    if (!pair) throw new Error(`${displayName}: front-matter line is not "key: value": ${JSON.stringify(line)}`);
    fields[pair[1]] = pair[2].trim();
  }
  return { fields, body: source.slice(match[0].length) };
}

// One content file -> one validated post record. displayName is the path
// relative to the content directory ("docker-image-third-try.md",
// "zh/docker-image-third-try.md"); the directory half fixes the expected lang,
// so front matter contradicting the location fails the build. The slug is the
// file name; the output path follows the site's directory convention.
// `mirror` (Issue #214) is the optional declared counterpart slug in the
// other language directory; collectPosts resolves it to the switcher target
// once both sides exist.
const POST_HTML_TAGS = new Set(["figure", "figcaption", "img", "iframe"]);
const POST_SVG_TAGS = new Set([
  "svg", "title", "desc", "g", "defs", "use", "symbol", "rect", "circle", "ellipse", "line",
  "polyline", "polygon", "path", "text", "tspan", "textpath", "marker", "lineargradient",
  "radialgradient", "stop", "clippath", "mask", "pattern",
]);

const HTML_TAG = /<\/?([A-Za-z][\w-]*)(?:"[^"]*"|'[^']*'|[^'"<>])*>/g;
const HTML_ATTRIBUTE = /\s([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s'"=<>`]+)))?/g;

function tagAttributes(markup) {
  const attributes = new Map();
  for (const match of markup.matchAll(HTML_ATTRIBUTE)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function requireSvgAccessibleName(label, svg) {
  const ariaLabel = svg.attributes.get("aria-label")?.trim();
  const role = svg.attributes.get("role")?.trim().toLowerCase();
  if (!(role === "img" && ariaLabel) && !svg.hasTitle) {
    throw new Error(`${label}: every <svg> in a blog body needs a non-empty aria-label with role="img" or a non-empty <title>`);
  }
}

function validateSvgMarkup(label, html) {
  const svgStack = [];
  const titleStack = [];

  for (const match of html.matchAll(HTML_TAG)) {
    const markup = match[0];
    const tag = match[1].toLowerCase();
    const closing = markup.startsWith("</");
    const selfClosing = /\/\s*>$/.test(markup);
    const attributes = closing ? new Map() : tagAttributes(markup);

    for (const name of attributes.keys()) {
      if (name.startsWith("on")) throw new Error(`${label}: event handler attributes are not allowed in a blog body`);
    }

    if (closing) {
      if (tag === "title" && titleStack.length > 0) {
        const title = titleStack.pop();
        if (html.slice(title.contentStart, match.index).replace(/<[^>]*>/g, "").trim()) {
          for (const svg of svgStack) svg.hasTitle = true;
        }
      } else if (tag === "svg" && svgStack.length > 0) {
        requireSvgAccessibleName(label, svgStack.pop());
      }
      continue;
    }

    if (tag === "svg") {
      const svg = { attributes, hasTitle: false };
      svgStack.push(svg);
      if (selfClosing) requireSvgAccessibleName(label, svgStack.pop());
    }

    if (svgStack.length > 0) {
      for (const name of ["href", "xlink:href"]) {
        if (attributes.has(name) && !attributes.get(name).trim().startsWith("#")) {
          throw new Error(`${label}: external SVG href is not allowed; use a local #id reference`);
        }
      }
      if (tag === "title" && !selfClosing) titleStack.push({ contentStart: match.index + markup.length });
    }
  }

  for (const svg of svgStack) requireSvgAccessibleName(label, svg);
}

// Markdown remains CommonMark, but these tags are deliberately allowed for
// article media. SVG gets a separate safety/accessibility pass below.
export function validatePostBody(label, body) {
  const prose = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  for (const match of prose.matchAll(/<\/?([A-Za-z][\w-]*)(?:\s[^>]*)?>/g)) {
    const tag = match[1].toLowerCase();
    if (!POST_HTML_TAGS.has(tag) && !POST_SVG_TAGS.has(tag)) throw new Error(`${label}: HTML tag <${tag}> is not allowed in blog body`);
    if (tag === "img" && !match[0].match(/\balt\s*=\s*["'][^"']+\s*["']/i)) {
      throw new Error(`${label}: every <img> in a blog body needs a non-empty alt`);
    }
  }
  validateSvgMarkup(label, prose);
}

export function wrapRenderedTables(html) {
  const tableTag = /<\/?table\b[^>]*>/gi;

  function renderRange(start, end) {
    let output = "";
    let cursor = start;
    while (cursor < end) {
      tableTag.lastIndex = cursor;
      const opening = tableTag.exec(html);
      if (!opening || opening.index >= end || opening[0].startsWith("</")) {
        output += html.slice(cursor, end);
        break;
      }
      output += html.slice(cursor, opening.index);
      let depth = 1;
      let scan = opening.index + opening[0].length;
      let closingStart = -1;
      let closingEnd = -1;
      while (depth > 0) {
        tableTag.lastIndex = scan;
        const tag = tableTag.exec(html);
        if (!tag || tag.index >= end) throw new Error("rendered blog table is missing its closing tag");
        if (tag[0].startsWith("</")) {
          depth -= 1;
          if (depth === 0) {
            closingStart = tag.index;
            closingEnd = tag.index + tag[0].length;
          }
        } else {
          depth += 1;
        }
        scan = tag.index + tag[0].length;
      }
      output += `<div class="post-table-scroll">${opening[0]}${renderRange(opening.index + opening[0].length, closingStart)}${html.slice(closingStart, closingEnd)}</div>`;
      cursor = closingEnd;
    }
    return output;
  }

  return renderRange(0, html.length);
}

// Issue #522: phones stack tables with 4+ columns row-by-row, so each cell
// must carry its column's header. The build marks such tables .table-stack
// and adds a data-label to every <td> (the matching thead text); tables with
// 3 or fewer columns stay plain, and page sources are never hand-labelled.
const TABLE_TAG = /<\/?table\b[^>]*>/gi;
const TABLE_ROW_TAG = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const TABLE_CELL_TAG = /<(t[dh])\b[^>]*>([\s\S]*?)<\/\1>/gi;
const COLSPAN_ATTR = /colspan\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decodeEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#\d+);/g, (entity) => {
    if (entity.startsWith("&#")) return String.fromCodePoint(Number(entity.slice(2, -1)));
    return NAMED_ENTITIES[entity.slice(1, -1)] ?? entity;
  });
}

// Keep a single inline token together (notably CLI flags containing hyphens),
// while marking code that contains spaces so it can still wrap at those spaces.
function classifyInlineCode(html) {
  return html.replace(/<code>([\s\S]*?)<\/code>/g, (tag, content) => {
    const className = /\s/.test(decodeEntities(content))
      ? "post-code--spaced"
      : "post-code--single";
    return `<code class="${className}">${content}</code>`;
  });
}

function tableCellText(markup) {
  return decodeEntities(markup.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function colspanOf(markup) {
  const value = markup.match(COLSPAN_ATTR);
  return Math.max(1, Number(value?.[1] ?? value?.[2] ?? value?.[3] ?? 1) || 1);
}

function withStackClass(openingTag) {
  if (/class\s*=\s*"/i.test(openingTag)) {
    return openingTag.replace(/class\s*=\s*"([^"]*)"/i, (attr, value) => `class="${value} table-stack"`);
  }
  if (/class\s*=\s*'/i.test(openingTag)) {
    return openingTag.replace(/class\s*=\s*'([^']*)'/i, (attr, value) => `class='${value} table-stack'`);
  }
  return openingTag.replace(/^<table\b/i, '<table class="table-stack"');
}

function labelBodyRows(segment, labels) {
  return segment.replace(TABLE_ROW_TAG, (rowMarkup) => {
    let column = 0;
    return rowMarkup.replace(TABLE_CELL_TAG, (cellMarkup, tag) => {
      const index = column;
      column += colspanOf(cellMarkup);
      if (tag.toLowerCase() !== "td") return cellMarkup;
      const label = labels[index];
      // An empty header would render a nameless「：值」line; leave the cell
      // unlabelled rather than ship that.
      if (!label) return cellMarkup;
      return cellMarkup.replace(/^<td\b/i, `<td data-label="${escAttr(label)}"`);
    });
  });
}

export function addTableDataLabels(html) {
  let output = "";
  let cursor = 0;
  for (const opening of html.matchAll(/<table\b[^>]*>/gi)) {
    if (opening.index < cursor) continue; // inside an already-processed table
    let depth = 1;
    let scan = opening.index + opening[0].length;
    let closeStart = -1;
    while (depth > 0) {
      TABLE_TAG.lastIndex = scan;
      const tag = TABLE_TAG.exec(html);
      if (!tag) throw new Error("addTableDataLabels: table is missing its closing tag");
      if (tag[0].startsWith("</")) {
        depth -= 1;
        if (depth === 0) closeStart = tag.index;
      } else {
        depth += 1;
      }
      scan = tag.index + tag[0].length;
    }
    const inner = html.slice(opening.index + opening[0].length, closeStart);
    const head = inner.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
    const headRow = head?.[1].match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i);
    let rendered = opening[0] + inner;
    if (head && headRow) {
      const labels = [];
      for (const cell of headRow[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)) {
        const label = tableCellText(cell[1]);
        for (let i = 0; i < colspanOf(cell[0]); i += 1) labels.push(label);
      }
      // Issue #526: the threshold is 3, not 4 — at phone widths a table-form
      // 3-column layout crushes its first column below word width and splits
      // words mid-word, so every 3+-column table stacks row-by-row.
      if (labels.length >= 3) {
        const headEnd = head.index + head[0].length;
        rendered = withStackClass(opening[0]) + inner.slice(0, headEnd) + labelBodyRows(inner.slice(headEnd), labels);
      }
    }
    output += html.slice(cursor, opening.index) + rendered;
    cursor = closeStart;
  }
  return output + html.slice(cursor);
}

export function validateRenderedPostBody(label, html) {
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!match[0].match(/\balt\s*=\s*["'][^"']+\s*["']/i)) {
      throw new Error(`${label}: every image in a blog body needs a non-empty alt`);
    }
  }
  validateSvgMarkup(label, html);
}

function requiredField(label, fields, name) {
  if (typeof fields[name] !== "string" || fields[name].trim() === "") {
    throw new Error(`${label}: front matter needs a non-empty "${name}"`);
  }
  return fields[name];
}

function parseRelated(label, fields) {
  if (fields.related === undefined) return [];
  let related;
  try {
    related = JSON.parse(fields.related);
  } catch {
    const value = fields.related.trim();
    if (!value.startsWith("[") || !value.endsWith("]")) {
      throw new Error(`${label}: front matter "related" must be an array of English slugs`);
    }
    related = value.slice(1, -1).split(",").map((slug) => slug.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  }
  if (!Array.isArray(related) || related.some((slug) => typeof slug !== "string" || !slug)) {
    throw new Error(`${label}: front matter "related" must be a JSON array of English slugs`);
  }
  return related;
}

function parseVideo(label, fields) {
  const names = ["video_name", "video_description", "video_thumbnail", "video_upload_date", "video_duration", "video_embed_url"];
  const present = names.filter((name) => fields[name] !== undefined);
  if (present.length === 0) return null;
  if (present.length !== names.length) throw new Error(`${label}: video front matter needs all fields: ${names.join(", ")}`);
  return {
    name: requiredField(label, fields, "video_name"),
    description: requiredField(label, fields, "video_description"),
    thumbnailUrl: requiredField(label, fields, "video_thumbnail"),
    uploadDate: requiredField(label, fields, "video_upload_date"),
    duration: requiredField(label, fields, "video_duration"),
    embedUrl: requiredField(label, fields, "video_embed_url"),
  };
}

function headingText(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function renderPostHeadings(html, label) {
  const used = new Set();
  const headings = [];
  const rendered = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (full, inner) => {
    const text = headingText(inner);
    const base = text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "section";
    let id = base;
    for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
    used.add(id);
    headings.push({ id, text });
    return `<h2 id="${escAttr(id)}">${inner}</h2>`;
  });
  validateRenderedPostBody(label, rendered);
  return { html: rendered, headings };
}

function renderPostToc(post) {
  if (post.headings.length < 5) return { desktop: "", inline: "" };
  const title = post.lang === "zh" ? "本页目录" : "On this page";
  const entries = post.headings.map(({ id, text }) => `          <li><a class="post-toc-link" href="#${escAttr(id)}">${escAttr(text)}</a></li>`).join("\n");
  return {
    desktop: `        <nav class="post-toc" aria-label="${title}">\n          <h2>${title}</h2>\n          <ol>\n${entries}\n          </ol>\n        </nav>`,
    inline: `        <details class="post-toc-inline">\n          <summary>${title} · ${post.headings.length} ${post.lang === "zh" ? "节" : "sections"}</summary>\n          <ol>\n${entries}\n          </ol>\n        </details>`,
  };
}

export function postFromSource(displayName, source) {
  const label = `content/blog/${displayName}`;
  const lang = displayName.startsWith("zh/") ? "zh" : "en";
  const { fields, body } = parseFrontMatter(label, source);
  for (const field of ["title", "date", "summary", "lang", "author", "image"]) requiredField(label, fields, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) {
    throw new Error(`${label}: front matter needs "date" as YYYY-MM-DD, got "${fields.date}"`);
  }
  if (fields.lang !== lang) {
    throw new Error(`${label}: front matter says lang: ${fields.lang}, but its directory fixes lang: ${lang}`);
  }
  if (fields.mirror !== undefined && fields.mirror === "") {
    throw new Error(`${label}: front matter needs a non-empty "mirror"`);
  }
  validatePostBody(label, body);
  const parsedHtml = classifyInlineCode(addTableDataLabels(wrapRenderedTables(marked.parse(body))));
  const { html, headings } = renderPostHeadings(parsedHtml, label);
  const video = parseVideo(label, fields);
  const related = lang === "en" ? parseRelated(label, fields) : [];
  const slug = displayName.slice(displayName.lastIndexOf("/") + 1).replace(/\.md$/, "");
  const output = lang === "en" ? `blog/${slug}/index.html` : `zh/blog/${slug}/index.html`;
  return {
    slug,
    lang,
    source: displayName,
    output,
    mirror: fields.mirror,
    href: pathToHref(output),
    title: fields.title,
    headline: fields.title,
    date: fields.date,
    summary: fields.summary,
    author: fields.author,
    image: fields.image,
    video,
    related,
    html,
    headings,
  };
}

// Every post in the content directory, validated and paired (Issue #214),
// newest first (slug breaks ties). A post pairs with the file its `mirror:`
// names in the other language directory, or — with no declaration — with a
// same-slug file there (the Issue #212 default); with neither it publishes
// as a single-language post. A `mirror:` naming a file that does not exist,
// or one the named file does not name back, fails the build naming both
// files: no silent skip, no page whose language switcher 404s.
export async function collectPosts(contentDir = CONTENT_DIR) {
  const readDir = async (rel) => {
    try {
      return (await readdir(join(contentDir, rel), { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name);
    } catch {
      return [];
    }
  };
  const enFiles = await readDir(".");
  const zhFiles = await readDir("zh");
  if (enFiles.length + zhFiles.length === 0) {
    throw new Error(`${contentDir}: no posts found (expected *.md and zh/*.md)`);
  }
  const posts = [];
  for (const [dir, names] of [[".", enFiles], ["zh", zhFiles]]) {
    for (const name of names) {
      const displayName = dir === "." ? name : `${dir}/${name}`;
      posts.push(postFromSource(displayName, await readFile(join(contentDir, dir, name), "utf8")));
    }
  }
  const label = (post) => `content/blog/${post.source}`;
  const otherLang = (post) => (post.lang === "en" ? "zh" : "en");
  const byKey = new Map(posts.map((post) => [`${post.lang}/${post.slug}`, post]));
  const englishSlugs = new Set(posts.filter((post) => post.lang === "en").map((post) => post.slug));
  for (const post of posts.filter((post) => post.lang === "en")) {
    for (const related of post.related) {
      if (related === post.slug) throw new Error(`${label(post)}: related: cannot name itself: ${related}`);
      if (!englishSlugs.has(related)) throw new Error(`${label(post)}: related: English slug does not exist: ${related}`);
    }
  }
  for (const post of posts) {
    if (post.mirror === undefined) continue;
    if (!byKey.has(`${otherLang(post)}/${post.mirror}`)) {
      const missing = post.lang === "en"
        ? `content/blog/zh/${post.mirror}.md`
        : `content/blog/${post.mirror}.md`;
      throw new Error(`${label(post)}: mirror: ${post.mirror} names a file that does not exist: ${missing} (Issue #214)`);
    }
  }
  // Counterpart per post: the declared mirror, else the same-slug default,
  // else none.
  for (const post of posts) {
    post.counterpartSlug = post.mirror
      ?? (byKey.has(`${otherLang(post)}/${post.slug}`) ? post.slug : null);
  }
  // The pairing is mutual: what a post names must name it back.
  for (const post of posts) {
    if (post.counterpartSlug === null) continue;
    const other = byKey.get(`${otherLang(post)}/${post.counterpartSlug}`);
    if (other.counterpartSlug !== post.slug) {
      const named = other.counterpartSlug === null
        ? "no mirror"
        : label(byKey.get(`${otherLang(other)}/${other.counterpartSlug}`));
      throw new Error(`${label(post)} names ${label(other)} as its mirror, but ${label(other)} names ${named} (Issue #214)`);
    }
  }
  for (const post of posts) {
    const other = post.counterpartSlug === null
      ? null
      : byKey.get(`${otherLang(post)}/${post.counterpartSlug}`);
    post.paired = other !== null;
    // A single-language post switches languages at the other language's blog
    // index — never at a page that does not exist.
    post.mirrorOutput = other
      ? other.output
      : post.lang === "en" ? "zh/blog/index.html" : "blog/index.html";
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.href.localeCompare(b.href));
}

// The canonical + article og block the build derives from the post front
// matter, so the meta cannot drift from the title/summary/date the post ships.
function renderPostMeta(post) {
  const url = `https://orbi.build${post.href}`;
  const image = `https://orbi.build${post.image}`;
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.headline,
    datePublished: post.date,
    author: { "@type": "Organization", name: post.author },
    image,
    inLanguage: post.lang === "zh" ? "zh-CN" : "en",
    description: post.summary,
    url,
  };
  const blocks = [article];
  const alternates = post.paired ? [
    `  <link rel="alternate" hreflang="en" href="https://orbi.build${post.lang === "en" ? post.href : pathToHref(post.mirrorOutput)}">`,
    `  <link rel="alternate" hreflang="zh-CN" href="https://orbi.build${post.lang === "zh" ? post.href : pathToHref(post.mirrorOutput)}">`,
    `  <link rel="alternate" hreflang="x-default" href="https://orbi.build${post.lang === "en" ? post.href : pathToHref(post.mirrorOutput)}">`,
  ] : [];
  if (post.video) blocks.push({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: post.video.name,
    description: post.video.description,
    thumbnailUrl: post.video.thumbnailUrl.startsWith("http") ? post.video.thumbnailUrl : `https://orbi.build${post.video.thumbnailUrl}`,
    uploadDate: post.video.uploadDate,
    duration: post.video.duration,
    embedUrl: post.video.embedUrl,
  });
  const json = (value) => JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
  return [
    `  <link rel="canonical" href="${url}">`,
    ...alternates,
    `  <meta property="og:type" content="article">`,
    `  <meta property="og:title" content="${escAttr(post.headline)}">`,
    `  <meta property="og:description" content="${escAttr(post.summary)}">`,
    `  <meta property="og:url" content="${url}">`,
    `  <meta property="og:image" content="${image}">`,
    `  <meta property="og:image:alt" content="${escAttr(post.headline)}">`,
    `  <meta property="article:published_time" content="${post.date}">`,
    ...blocks.map((block) => `  <script type="application/ld+json">${json(block)}</script>`),
  ].join("\n");
}

// Per-language bits only the post template needs. Nav params mirror the
// hand-written content pages' (compare the old post page sources), except
// langSwitchHref, which the build derives from the post's own mirror.
const POST_LANG = {
  en: {
    htmlLang: "en",
    fontLink: `  <link rel="stylesheet" href="/fonts/fonts.css">`,
    skipLabel: "Skip to content",
    eyebrow: "Blog",
    nav: {
      navId: "primary-navigation",
      systemHref: "/#system",
      compareHref: "/compare/",
      compareLabel: "Compare",
      costHref: "/cloud/#pricing",
      docsHref: "https://docs.orbi.build",
      langCurrentFirst: true,
    },
  },
  zh: {
    htmlLang: "zh-CN",
    fontLink: `  <link rel="stylesheet" href="/fonts/fonts.css">`,
    skipLabel: "跳到正文",
    eyebrow: "博客",
    nav: {
      navId: "primary-navigation-zh",
      systemHref: "/zh/#system",
      compareHref: "/zh/compare/",
      compareLabel: "竞品对比",
      costHref: "/zh/cloud/#pricing",
      docsHref: "https://docs.orbi.build/zh",
      langCurrentFirst: true,
    },
  },
};

// A post's page: the rendered CommonMark body inside the post template, with
// the shared nav and footer rendered exactly as for site/pages/**.
function renderSubscribe(lang) {
  const zh = lang === "zh";
  return fill(SUBSCRIBE_PARTIAL, {
    SUBSCRIBE_TITLE: zh ? "每周一个真实交付" : "One real delivery, every week",
    SUBSCRIBE_SUCCESS: zh ? "已订阅" : "Subscribed",
    SUBSCRIBE_INVALID: zh ? "邮箱格式不对" : "That email address doesn't look right",
    SUBSCRIBE_UNAVAILABLE: zh ? "暂时无法订阅，请重试。" : "Subscription is temporarily unavailable. Please try again.",
    SUBSCRIBE_LABEL: zh ? "邮箱地址" : "Email address",
    SUBSCRIBE_PLACEHOLDER: zh ? "你的邮箱" : "you@example.com",
    SUBSCRIBE_LANG: lang,
    SUBSCRIBE_BUTTON: zh ? "订阅" : "Subscribe",
    SUBSCRIBE_NOTE: zh ? "每周一封，讲一次真实交付。随时退订。" : "One email a week about one real delivery. Unsubscribe anytime.",
  });
}

function renderPost(post, template) {
  const t = POST_LANG[post.lang];
  const toc = renderPostToc(post);
  const tocScript = post.headings.length >= 5 ? `<script>(()=>{try{const links=[...document.querySelectorAll('.post-toc-link')];const targetOf=(link)=>link.getAttribute('href').slice(1);const headings=[...new Set(links.map(link=>document.getElementById(targetOf(link))).filter(Boolean))];const setCurrent=(heading)=>{links.forEach((link)=>link.classList.toggle('is-current',targetOf(link)===heading.id));};if('IntersectionObserver' in window){const update=()=>{const current=headings.findLast((heading)=>heading.getBoundingClientRect().top<=innerHeight*.4)??headings[0];if(current)setCurrent(current);};const observer=new IntersectionObserver(update,{rootMargin:'-24px 0px -60% 0px',threshold:0});headings.forEach((heading)=>observer.observe(heading));addEventListener('scroll',update,{passive:true});update();}}catch(error){console.warn('post_toc_observer_failed',error);}})();</script>` : "";
  const page = {
    lang: post.lang,
    output: post.output,
    mirror: post.mirrorOutput,
    nav: {
      ...t.nav,
      compareDataCta: false,
      compareCurrent: false,
      costCurrent: false,
      compareCostSameLine: false,
      langSwitchHref: pathToHref(post.mirrorOutput),
    },
  };
  return fill(template, {
    LANG_ATTR: t.htmlLang,
    TITLE: escAttr(`${post.title} | Orbi`),
    DESCRIPTION: escAttr(post.summary),
    POST_META: renderPostMeta(post),
    FONT_LINK: t.fontLink,
    SKIP_LABEL: t.skipLabel,
    NAV: toLayout(renderNav(page), "pretty"),
    EYEBROW: t.eyebrow,
    DATE: post.date,
    HEADLINE: escAttr(post.title),
    SUMMARY: escAttr(post.summary),
    POST_TOC: toc.desktop,
    INLINE_TOC: toc.inline,
    BODY: post.html,
    RELATED_MARKER: "<!--orbi:related-posts-->",
    FOOTER: toLayout(renderFooter(page), "pretty"),
  }).replace("</body>", `${tocScript}${ENGAGEMENT_SCRIPT}${CLOUDFLARE_ANALYTICS_SCRIPT}</body>`);
}

// The blog index entry list: title, date, one-line summary, link — one
// article per post, newest first, per language tree.
function renderPostList(posts) {
  return posts
    .map((post) => [
      `    <article class="post-entry">`,
      `      <h2 class="post-entry-title"><a href="${post.href}">${escAttr(post.headline)}</a></h2>`,
      `      <p class="post-entry-meta"><time datetime="${post.date}">${post.date}</time></p>`,
      `      <p class="post-entry-summary">${escAttr(post.summary)}</p>`,
      `    </article>`,
    ].join("\n"))
    .join("\n");
}

// RSS 2.0 feed of the English posts at /blog/feed.xml.
function renderFeed(posts) {
  const items = posts
    .map((post) => {
      const url = `https://orbi.build${post.href}`;
      return `    <item>
      <title>${escAttr(post.headline)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escAttr(post.summary)}</description>
    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Orbi Blog</title>
    <link>https://orbi.build/blog/</link>
    <description>Notes from shipping Orbi in the open: delivery runs, failures, fixes, and measurements.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
}

// llms.txt (Issue #215): the hand-written prose lives in site/llms.txt, next
// to the other page sources, and stays editable there. The build generates
// only the Blog section's post list — one entry per post per language,
// newest first, in the format the hand-maintained file used — by replacing
// the <!--@llms-blog--> marker. A source without the marker fails the build
// instead of silently shipping a stale Blog section.
export function renderLlms(source, posts) {
  const marker = "<!--@llms-blog-->";
  if (!source.includes(marker)) {
    throw new Error("site/llms.txt: missing the <!--@llms-blog--> marker for the generated Blog section");
  }
  const label = { en: "English", zh: "Chinese" };
  const list = posts
    .map((post) => `- ${post.title} (${label[post.lang]}):\n  https://orbi.build${post.href}`)
    .join("\n");
  return source.replace(marker, () => list);
}

function renderSitemap(pages, posts = [], contentDir = CONTENT_DIR) {
  const urls = pages.filter(({ page }) => !page.standalone).map(({ page, path }) => {
    const href = pathToHref(page.output);
    const mirror = pathToHref(page.mirror);
    const base = "https://orbi.build";
    const isHome = page.output === "index.html" || page.output === "zh/index.html";
    const priority = page.output === "index.html" ? "1.0" : page.output === "zh/index.html" ? "0.9" : "0.8";
    return `  <url>\n    <loc>${base}${href}</loc>\n    <xhtml:link rel="alternate" hreflang="en" href="${base}${page.lang === "en" ? href : mirror}"/>\n    <xhtml:link rel="alternate" hreflang="zh-CN" href="${base}${page.lang === "zh" ? href : mirror}"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${base}${page.lang === "en" ? href : mirror}"/>\n    <lastmod>${lastCommitDate(path)}</lastmod>\n    <changefreq>${isHome ? "weekly" : "monthly"}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  });
  // Blog posts: rendered from content/blog, one URL per published post
  // regardless of pairing (Issue #214). Paired posts carry hreflang
  // alternates to each other; a single-language post lists itself only — an
  // alternate to the blog index would promise a translation that does not
  // exist.
  for (const post of posts) {
    const base = "https://orbi.build";
    const href = post.href;
    const tail = `\n    <lastmod>${lastCommitDate(join(contentDir, post.source))}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    if (!post.paired) {
      urls.push(`  <url>\n    <loc>${base}${href}</loc>${tail}`);
      continue;
    }
    const mirror = pathToHref(post.mirrorOutput);
    urls.push(`  <url>\n    <loc>${base}${href}</loc>\n    <xhtml:link rel="alternate" hreflang="en" href="${base}${post.lang === "en" ? href : mirror}"/>\n    <xhtml:link rel="alternate" hreflang="zh-CN" href="${base}${post.lang === "zh" ? href : mirror}"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${base}${post.lang === "en" ? href : mirror}"/>${tail}`);
  }
  urls.push(`  <url>\n    <loc>https://orbi.build/compare/matrix.csv</loc>\n    <lastmod>${lastCommitDate(join(ROOT, "site", "pages", "compare", "index.html"))}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}

export async function loadPages() {
  const sources = await walkPages(PAGES_DIR);
  const pages = [];
  for (const path of sources) {
    const page = parsePage(path, await readFile(path, "utf8"));
    // The source path relative to site/pages, POSIX form: "blog/post.html".
    // Identity for the blog conventions, and the file name the build's
    // errors carry.
    page.source = relative(PAGES_DIR, path).split("\\").join("/");
    pages.push(page);
  }
  return pages;
}

async function walkPages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkPages(full)));
    else if (entry.name.endsWith(".html")) files.push(full);
  }
  return files.sort();
}

let NAV_PARTIAL;
let FOOTER_PARTIAL;
let SUBSCRIBE_PARTIAL;

function renderLlmsFull(template, renderedPages, matrixCsv) {
  const sections = {
    "<!--@cost-body-->": renderedPages.get("cost/index.html"),
    "<!--@evidence-body-->": renderedPages.get("evidence/index.html"),
  };
  let output = template;
  for (const [marker, html] of Object.entries(sections)) {
    const body = html?.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1]?.trim();
    if (!body) throw new Error(`llms-full.txt cannot extract ${marker} source body`);
    if (!output.includes(marker)) throw new Error(`llms-full.txt is missing ${marker}`);
    output = output.replace(marker, body);
  }
  if (!output.includes("<!--@comparison-matrix-->")) {
    throw new Error("llms-full.txt is missing <!--@comparison-matrix-->");
  }
  return output.replace("<!--@comparison-matrix-->", matrixCsv.trim()).trimEnd() + "\n";
}

export async function buildPages(outDir, { contentDir = CONTENT_DIR, socialProofPath = SOCIAL_PROOF_PATH } = {}) {
  NAV_PARTIAL = await readFile(join(PARTIALS_DIR, "nav.html"), "utf8");
  FOOTER_PARTIAL = await readFile(join(PARTIALS_DIR, "footer.html"), "utf8");
  SUBSCRIBE_PARTIAL = await readFile(join(PARTIALS_DIR, "subscribe.html"), "utf8");
  const POST_TEMPLATE = await readFile(join(PARTIALS_DIR, "post.html"), "utf8");
  const pages = await loadPages();
  const posts = await collectPosts(contentDir);
  const guidesData = JSON.parse(await readFile(GUIDES_DATA_PATH, "utf8"));
  // Issue #226: the consent gate runs here, once, before anything renders —
  // a quote without recorded consent fails the build even if no page carried
  // the section marker.
  const socialProof = validateSocialProof(
    JSON.parse(await readFile(socialProofPath, "utf8")),
    relative(ROOT, socialProofPath).split("\\").join("/"),
  );
  const postsFor = (indexSource) =>
    posts.filter((post) => post.lang === (indexSource.startsWith("zh/") ? "zh" : "en"));
  await mkdir(outDir, { recursive: true });
  const renderedPages = new Map();
  for (const page of pages) {
    let html = page.body;
    if (page.nav) {
      const nav = toLayout(renderNav(page), page.layout);
      if (!html.includes("<!--@nav-->")) {
        throw new Error(`${page.output}: source has nav params but no <!--@nav--> marker`);
      }
      html = html.replace("<!--@nav-->", () => nav);
    } else if (html.includes("<!--@nav-->")) {
      throw new Error(`${page.output}: source has an <!--@nav--> marker but no nav params`);
    }
    if (!page.standalone) {
      const footer = toLayout(renderFooter(page), page.layout);
      if (!html.includes("<!--@footer-->")) {
        throw new Error(`${page.output}: missing the <!--@footer--> marker`);
      }
      html = html.replace("<!--@footer-->", () => footer);
    } else if (html.includes("<!--@footer-->")) {
      throw new Error(`${page.output}: standalone page must not carry an <!--@footer--> marker`);
    }
    if (page.output === "guides/index.html" || page.output === "zh/guides/index.html") {
      if (!html.includes("<!--@guide-index-->")) throw new Error(`${page.source}: missing guide index marker`);
      html = html.replace("<!--@guide-index-->", () => renderGuideIndex(page, guidesData));
    }
    const isGuideOrCompare = page.output.includes("guides/") || page.output.includes("compare/");
    if (isGuideOrCompare && page.output !== "guides/index.html" && page.output !== "zh/guides/index.html") {
      if (!html.includes("<!--@related-links-->")) throw new Error(`${page.source}: missing related links marker`);
      html = html.replace("<!--@related-links-->", () => renderRelated(page, guidesData));
      const breadcrumb = renderBreadcrumb(page);
      const breadcrumbJson = breadcrumb.match(/<script[\s\S]*<\/script>/)?.[0] ?? "";
      const breadcrumbNav = breadcrumb.replace(breadcrumbJson, "");
      if (!html.includes('<div class="night">')) {
        throw new Error(`${page.source}: detail page is missing the hero night wrapper`);
      }
      html = html.replace('<div class="night">', `<div class="night">${breadcrumbNav}`);
      html = html.replace("</head>", `${breadcrumbJson}</head>`);
    }
    if (!html.includes("</body>")) throw new Error(`${page.source}: missing </body> for engagement script`);
    html = html.replace("</body>", `${ENGAGEMENT_SCRIPT}${CLOUDFLARE_ANALYTICS_SCRIPT}</body>`);
    if (page.source === "blog/index.html" || page.source === "zh/blog/index.html") {
      if (!html.includes("<!--@posts-->")) {
        throw new Error(`${page.source}: blog index is missing the <!--@posts--> marker`);
      }
      html = html.replace("<!--@posts-->", () => renderPostList(postsFor(page.source)));
    }
    const socialVariant = SOCIAL_PROOF_VARIANTS[page.source];
    if (socialVariant) {
      if (!html.includes("<!--@social-proof-->")) {
        throw new Error(`${page.source}: missing the <!--@social-proof--> marker for the social-proof section`);
      }
      html = html.replace(
        "<!--@social-proof-->",
        () => toLayout(renderSocialProof(socialProof, page.lang, socialVariant), page.layout),
      );
    }
    const out = join(outDir, page.output);
    html = addTableDataLabels(html);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, html);
    renderedPages.set(page.output, html);
  }
  for (const post of posts) {
    const out = join(outDir, post.output);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, renderPost(post, POST_TEMPLATE));
  }
  await writeFile(
    join(outDir, "sitemap.xml"),
    renderSitemap(pages.map((page) => ({ page, path: join(PAGES_DIR, page.source) })), posts, contentDir),
  );
  await mkdir(join(outDir, "blog"), { recursive: true });
  const englishPosts = posts.filter((post) => post.lang === "en");
  await writeFile(join(outDir, "blog", "posts.json"), JSON.stringify(englishPosts.map((post) => {
    const zh = post.paired ? posts.find((candidate) => candidate.lang === "zh" && candidate.slug === post.counterpartSlug) : null;
    return {
      slug: post.slug,
      title: post.title,
      summary: post.summary,
      zhSlug: zh?.slug ?? null,
      zhTitle: zh?.title ?? null,
      related: post.related,
    };
  }), null, 2) + "\n");
  await writeFile(join(outDir, "blog", "feed.xml"), renderFeed(englishPosts));
  await writeFile(join(outDir, "llms.txt"), renderLlms(await readFile(join(ROOT, "site", "llms.txt"), "utf8"), posts));
  await writeFile(
    join(outDir, "llms-full.txt"),
    renderLlmsFull(
      await readFile(join(ROOT, "site", "llms-full.txt"), "utf8"),
      renderedPages,
      await readFile(join(ROOT, "public", "compare", "matrix.csv"), "utf8"),
    ),
  );
  return pages.length + posts.length;
}

// Run only when executed directly, so tests and the migration can import
// the render helpers without writing to public/.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf("--out");
  if (outIndex >= 0 && (!argv[outIndex + 1] || argv[outIndex + 1].startsWith("--"))) {
    console.error("usage: node scripts/build-pages.mjs [--out <dir>]");
    process.exit(2);
  }
  const outDir = outIndex >= 0 ? resolve(argv[outIndex + 1]) : join(ROOT, "public");
  buildPages(outDir)
    .then((count) => {
      console.log(`built ${count} pages into ${outDir}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
