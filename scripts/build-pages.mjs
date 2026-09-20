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
  ["github-copilot-coding-agent", "Orbi vs GitHub Copilot coding agent"],
  ["managed-agents", "Orbi vs Claude Managed Agents"],
  ["claude-code", "Orbi vs Claude Code"],
  ["openhands", "Orbi vs OpenHands"],
  ["hermes-agent", "Orbi vs Hermes Agent"],
  ["codex", "Orbi vs OpenAI Codex"],
  ["devin", "Orbi vs Devin"],
  ["jules", "Orbi vs Google Jules"],
  ["cursor", "Orbi vs Cursor Cloud Agents"],
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
    costLabel: "Pricing",
    docsLabel: "Docs",
    blogLabel: "Blog",
    langGroupAria: "Language",
    currentLangLabel: "EN",
    otherLangAttr: "zh-CN",
    otherLangLabel: "中文",
    langPrefix: "",
    tagline: "Software production that survives the session.",
    footerNavAria: "Footer navigation",
    docsHref: "https://docs.orbi.build",
    applyLabel: "Start Cloud",
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
  },
  zh: {
    homeHref: "/zh/",
    homeAria: "Orbi 首页",
    toggleAria: "打开导航菜单",
    toggleOpen: "打开导航菜单",
    toggleClose: "关闭导航菜单",
    navAria: "主导航",
    systemLabel: "产品怎么运作",
    costLabel: "价格",
    docsLabel: "文档",
    blogLabel: "博客",
    langGroupAria: "语言",
    currentLangLabel: "中文",
    otherLangAttr: "en",
    otherLangLabel: "EN",
    langPrefix: "/zh",
    tagline: "不会随 Session 消失的软件生产。",
    footerNavAria: "页脚导航",
    docsHref: "https://docs.orbi.build/zh",
    applyLabel: "开始 Cloud",
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

export function renderNav(page, partial = NAV_PARTIAL) {
  if (!partial) throw new Error("nav partial not loaded; call buildPages() first or pass the partial");
  const t = LANG[page.lang];
  const n = page.nav;
  if (!n) throw new Error(`${page.output}: page has no nav params`);
  const compareAttrs =
    (n.compareDataCta ? ' data-cta="comparisons"' : "") +
    (n.compareCurrent ? ' aria-current="page"' : "");
  const costAttrs = n.costCurrent ? ' aria-current="page"' : "";
  const join = n.compareCostSameLine ? "" : "\n        ";
  const currentLine = `<span aria-current="page">${t.currentLangLabel}</span>`;
  const otherLine = `<a href="${n.langSwitchHref}" lang="${t.otherLangAttr}">${t.otherLangLabel}</a>`;
  const [lineA, lineB] = n.langCurrentFirst
    ? [currentLine, otherLine]
    : [otherLine, currentLine];
  return fill(partial, {
    HOME_HREF: t.homeHref,
    HOME_ARIA: t.homeAria,
    TOGGLE_ARIA: t.toggleAria,
    TOGGLE_OPEN: t.toggleOpen,
    TOGGLE_CLOSE: t.toggleClose,
    NAV_ID: n.navId,
    NAV_ARIA: t.navAria,
    SYSTEM_HREF: n.systemHref,
    SYSTEM_LABEL: t.systemLabel,
    COMPARE_HREF: n.compareHref,
    COMPARE_ATTRS: compareAttrs,
    COMPARE_LABEL: n.compareLabel,
    COMPARE_COST_JOIN: join,
    COST_HREF: n.costHref,
    COST_ATTRS: costAttrs,
    COST_LABEL: t.costLabel,
    DOCS_HREF: n.docsHref,
    DOCS_LABEL: t.docsLabel,
    BLOG_HREF: `${t.langPrefix}/blog/`,
    BLOG_LABEL: t.blogLabel,
    APPLY_LABEL: t.applyLabel,
    CLOUD_HREF: `${t.langPrefix}/cloud/`,
    LANG_GROUP_ARIA: t.langGroupAria,
    LANG_LINE_A: lineA,
    LANG_LINE_B: lineB,
  });
}

export function renderFooter(page) {
  const t = LANG[page.lang];
  const isHome = page.output === "index.html" || page.output === "zh/index.html";
  // Anchors #faq/#direction live on the language home; other pages need the
  // absolute path in front — "/#faq" on EN pages, "/zh/#faq" on ZH pages
  // (Issue #106: the anchor-prefix rule).
  const anchorPrefix = isHome ? "" : `${t.langPrefix}/`;
  const deepLinks = DEEP_DIVES.map(
    ([slug, name]) =>
      `      <a href="${t.langPrefix}/compare/${slug}/">${name}</a>`
  ).join("\n");
  return fill(FOOTER_PARTIAL, {
    HOME_HREF: t.homeHref,
    HOME_ARIA: t.homeAria,
    TAGLINE: t.tagline,
    FOOTER_NAV_ARIA: t.footerNavAria,
    DOCS_HREF: t.docsHref,
    DOCS_LABEL: t.docsLabel,
    CLOUD_HREF: `${t.langPrefix}/cloud/`,
    CLOUD_LABEL: t.cloudLabel,
    COMPARE_HREF: `${t.langPrefix}/compare/`,
    COMPARE_LABEL: t.compareLabel,
    FAQ_HREF: `${anchorPrefix}#faq`,
    FAQ_LABEL: t.faqLabel,
    RELEASES_LABEL: t.releasesLabel,
    STATUS_LABEL: t.statusLabel,
    PRIVACY_HREF: `${t.langPrefix}/privacy/`,
    PRIVACY_LABEL: t.privacyLabel,
    TERMS_HREF: `${t.langPrefix}/terms/`,
    TERMS_LABEL: t.termsLabel,
    SUPPORT_HREF: `${t.langPrefix}/support/`,
    SUPPORT_LABEL: t.supportLabel,
    DIRECTION_HREF: `${anchorPrefix}#direction`,
    DIRECTION_LABEL: t.directionLabel,
    ROADMAP_LABEL: t.roadmapLabel,
    // mirror "zh/cloud/index.html" → "/zh/cloud/"; "index.html" → "/"
    LANG_SWITCH_HREF: `/${page.mirror.replace(/index\.html$/, "")}`.replace("//", "/"),
    OTHER_LANG_ATTR: t.otherLangAttr,
    OTHER_LANG_LABEL: t.otherLangLabel,
    DEEP_ARIA: t.deepAria,
    DEEP_SPAN: t.deepSpan,
    DEEP_LINKS: deepLinks,
  });
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
export function postFromSource(displayName, source) {
  const label = `content/blog/${displayName}`;
  const lang = displayName.startsWith("zh/") ? "zh" : "en";
  const { fields, body } = parseFrontMatter(label, source);
  for (const field of ["title", "date", "summary", "lang"]) {
    if (typeof fields[field] !== "string" || fields[field].trim() === "") {
      throw new Error(`${label}: front matter needs a non-empty "${field}"`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) {
    throw new Error(`${label}: front matter needs "date" as YYYY-MM-DD, got "${fields.date}"`);
  }
  if (fields.lang !== lang) {
    throw new Error(`${label}: front matter says lang: ${fields.lang}, but its directory fixes lang: ${lang}`);
  }
  if (fields.mirror !== undefined && fields.mirror === "") {
    throw new Error(`${label}: front matter needs a non-empty "mirror"`);
  }
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
    html: marked.parse(body),
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
  return [
    `  <link rel="canonical" href="${url}">`,
    `  <meta property="og:type" content="article">`,
    `  <meta property="og:title" content="${escAttr(post.headline)}">`,
    `  <meta property="og:description" content="${escAttr(post.summary)}">`,
    `  <meta property="og:url" content="${url}">`,
    `  <meta property="article:published_time" content="${post.date}">`,
  ].join("\n");
}

// Per-language bits only the post template needs. The zh page loads Noto Sans
// SC; the en page must not. Nav params mirror the hand-written content pages'
// (compare the old post page sources), except langSwitchHref, which the build
// derives from the post's own mirror.
const POST_LANG = {
  en: {
    htmlLang: "en",
    fontLink: `  <link href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">`,
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
    fontLink: `  <link href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet">`,
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
function renderPost(post, template) {
  const t = POST_LANG[post.lang];
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
    BODY: post.html,
    FOOTER: toLayout(renderFooter(page), "pretty"),
  });
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

export async function buildPages(outDir, { contentDir = CONTENT_DIR, socialProofPath = SOCIAL_PROOF_PATH } = {}) {
  NAV_PARTIAL = await readFile(join(PARTIALS_DIR, "nav.html"), "utf8");
  FOOTER_PARTIAL = await readFile(join(PARTIALS_DIR, "footer.html"), "utf8");
  const POST_TEMPLATE = await readFile(join(PARTIALS_DIR, "post.html"), "utf8");
  const pages = await loadPages();
  const posts = await collectPosts(contentDir);
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
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, html);
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
  await writeFile(join(outDir, "blog", "feed.xml"), renderFeed(posts.filter((post) => post.lang === "en")));
  await writeFile(join(outDir, "llms.txt"), renderLlms(await readFile(join(ROOT, "site", "llms.txt"), "utf8"), posts));
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
