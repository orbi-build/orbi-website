#!/usr/bin/env node
// Builds every page in public/ from shared fragments plus per-page sources:
//   site/partials/nav.html     — the one primary navigation, {{SLOTS}} filled per page
//   site/partials/footer.html  — the one site footer (EN and ZH labels built in)
//   site/pages/**              — one source per page: a JSON header (lang, mirror,
//                                layout, nav params) followed by the page body with
//                                <!--@nav--> and <!--@footer--> markers where the
//                                fragments belong.
// Pages listing apply.html keep their whole body in the source and carry no
// markers — a conversion endpoint with no primary nav and no site footer.
//
// Usage: node scripts/build-pages.mjs [--out <dir>]   (default: public)
//
// A `layout: "minified"` page receives both fragments joined onto one line,
// the shape those ten files were authored in; everything else gets the
// indented form. Either way the rendered fragment is byte-exact, so editing
// a fragment and rebuilding never reflows a page that declares minified.

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES_DIR = join(ROOT, "site", "pages");
const PARTIALS_DIR = join(ROOT, "site", "partials");

// Footer deep dives, in the order the /compare/ grid and the browser smoke
// test pin them. Href prefix per language; anchor text is the competitors'
// shared "Orbi vs X" naming (the ZH pages' own h1 wording).
const DEEP_DIVES = [
  ["orca", "Orbi vs Orca"],
  ["openclaw", "Orbi vs OpenClaw"],
  ["github-copilot-coding-agent", "Orbi vs GitHub Copilot coding agent"],
  ["managed-agents", "Orbi vs Claude Managed Agents"],
  ["openhands", "Orbi vs OpenHands"],
  ["hermes-agent", "Orbi vs Hermes Agent"],
  ["codex", "Orbi vs OpenAI Codex"],
  ["devin", "Orbi vs Devin"],
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
    costLabel: "Cost",
    docsLabel: "Docs",
    langGroupAria: "Language",
    currentLangLabel: "EN",
    otherLangAttr: "zh-CN",
    otherLangLabel: "中文",
    langPrefix: "",
    tagline: "Software production that survives the session.",
    footerNavAria: "Footer navigation",
    docsHref: "https://docs.orbi.build",
    cloudLabel: "Cloud",
    compareLabel: "Compare",
    faqLabel: "FAQ",
    releasesLabel: "Releases",
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
    costLabel: "成本",
    docsLabel: "文档",
    langGroupAria: "语言",
    currentLangLabel: "中文",
    otherLangAttr: "en",
    otherLangLabel: "EN",
    langPrefix: "/zh",
    tagline: "不会随 Session 消失的软件生产。",
    footerNavAria: "页脚导航",
    docsHref: "https://docs.orbi.build/zh",
    cloudLabel: "Cloud",
    compareLabel: "竞品对比",
    faqLabel: "常见问题",
    releasesLabel: "发布记录",
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
    APPLY_HREF: n.applyHref,
    APPLY_LABEL: n.applyLabel,
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
// "/cloud/", "index.html" → "/", "apply.html" → "/apply".
export function pathToHref(output) {
  if (output === "apply.html") return "/apply";
  return `/${output.replace(/index\.html$/, "")}`.replace("//", "/");
}

export async function loadPages() {
  const sources = await walkPages(PAGES_DIR);
  const pages = [];
  for (const path of sources) {
    pages.push(parsePage(path, await readFile(path, "utf8")));
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

export async function buildPages(outDir) {
  NAV_PARTIAL = await readFile(join(PARTIALS_DIR, "nav.html"), "utf8");
  FOOTER_PARTIAL = await readFile(join(PARTIALS_DIR, "footer.html"), "utf8");
  const sources = await walkPages(PAGES_DIR);
  await mkdir(outDir, { recursive: true });
  for (const path of sources) {
    const page = parsePage(path, await readFile(path, "utf8"));
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
    const out = join(outDir, page.output);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, html);
  }
  return sources.length;
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
