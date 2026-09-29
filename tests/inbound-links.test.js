// Issue #611: a URL that lives only in sitemap.xml is invisible to visitors —
// no path of internal links reaches it, and search engines get no internal
// link equity for it. The three SEO landing pages shipped exactly that way.
//
// This gate walks every shipped HTML page in public/, collects internal
// <a href>s, and requires every sitemap URL to have at least one inbound link
// from a page that is neither the URL itself nor its other-language mirror
// (a page's own footer link and its mirror's language switch add nothing).
// It also pins the footer "Guides" group that supplies those links, one
// language tree per page, on every page carrying the site footer.

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");

// "/cost/" → "/cost", "/" → "" — one canonical form for sitemap URLs, page
// paths and hrefs, so membership checks never miss on a trailing slash.
const canon = (path) => path.replace(/\/index\.html$/, "/").replace(/\/+$/, "");

// The other language's URL of the same page: "/" ↔ "/zh", "/cost/" ↔ "/zh/cost/".
const mirrorOf = (path) =>
  path === "/zh" || path.startsWith("/zh/") ? canon(path.slice(3)) || "/" : canon(`/zh${path}`);

// Internal targets of every <a href> on one page: same-host absolute URLs and
// site-absolute paths, reduced to canonical paths. Comments are stripped
// first — commented-out examples are not rendered links.
function hrefTargets(html, pagePath) {
  const targets = new Set();
  const rendered = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const anchor of rendered.matchAll(/<a\b[^>]*>/g)) {
    const href = anchor[0].match(/\shref=["']([^"']*)["']/)?.[1];
    if (!href) continue;
    let url;
    try {
      url = new URL(href, `https://orbi.build${pagePath}`);
    } catch {
      continue;
    }
    if (url.host !== "orbi.build" && url.host !== "www.orbi.build") continue;
    targets.add(canon(url.pathname));
  }
  return targets;
}

async function walkHtml(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkHtml(full)));
    else if (entry.name.endsWith(".html")) files.push(full);
  }
  return files;
}

let sitemapPaths; // URL paths from public/sitemap.xml, in file order
let htmlByPage; // canonical page path → shipped HTML
let linksByPage; // canonical page path → Set of internal target paths

beforeAll(async () => {
  const sitemap = await readFile(join(PUBLIC_DIR, "sitemap.xml"), "utf8");
  sitemapPaths = [...sitemap.matchAll(/<loc>https:\/\/orbi\.build(\/[^<]*)<\/loc>/g)].map(
    (match) => match[1],
  );
  htmlByPage = new Map();
  for (const file of await walkHtml(PUBLIC_DIR)) {
    htmlByPage.set(canon(`/${relative(PUBLIC_DIR, file)}`), await readFile(file, "utf8"));
  }
  linksByPage = new Map([...htmlByPage].map(([path, html]) => [path, hrefTargets(html, path)]));
});

describe("internal inbound links for every sitemap URL (Issue #611)", () => {
  it("gives every sitemap URL an inbound link from a page that is neither the URL itself nor its mirror", () => {
    const orphans = [];
    for (const sitemapPath of sitemapPaths) {
      const target = canon(sitemapPath);
      const hasInbound = [...linksByPage].some(
        ([page, links]) => links.has(target) && page !== target && mirrorOf(page) !== target,
      );
      if (!hasInbound) orphans.push(sitemapPath);
    }
    expect(
      orphans,
      `orphan sitemap URLs — listed in sitemap.xml but no internal page links them:\n${orphans.join("\n")}`,
    ).toEqual([]);
  });

  // The guides group is what gives the landing pages their inbound link, so
  // it must ship on every page with the site footer — always the page's own
  // language tree: EN pages never link /zh/, ZH pages never link the EN tree.
  it("carries a footer guides group with only the page's own language tree on every footer page", () => {
    const enGuides = [
      "/guides/issue-to-release/",
      "/guides/ci-gates/",
      "/guides/auto-merge-ai-prs/",
      "/guides/autonomous-coding-agent/",
      "/guides/self-hosted-coding-agent/",
      "/guides/codex-github-issues/",
      "https://aiready.sh/",
    ];
    const zhGuides = [
      "/zh/guides/issue-to-release/",
      "/zh/guides/ci-gates/",
      "/zh/guides/auto-merge-ai-prs/",
      "/zh/guides/autonomous-coding-agent/",
      "/zh/guides/self-hosted-coding-agent/",
      "/zh/guides/codex-github-issues/",
      "https://aiready.sh/zh/",
    ];
    const drift = [];
    for (const [page, html] of htmlByPage) {
      const footer = html.match(/<footer class="site-footer shell">[\s\S]*?<\/footer>/)?.[0];
      if (!footer) continue; // standalone pages (compare) ship no site footer
      const guides = footer.match(/<div class="footer-group footer-guides">[\s\S]*?<h2>(?:Guides|指南)<\/h2>[\s\S]*?<\/div>/)?.[0];
      if (!guides) {
        drift.push(`${page}: footer Guides group missing`);
        continue;
      }
      const hrefs = [...guides.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1]);
      // The page's own html lang, not the path prefix: the aiready ZH page
      // lives at /aiready/zh (the aiready.sh /zh route), outside the zh/ tree.
      const isZh = /<html lang="zh-CN"/.test(html);
      const expected = isZh ? zhGuides : enGuides;
      // Issue #610: pages living on another host (aiready.sh) prefix their
      // chrome links with the site base — same targets, absolute orbi.build form.
      const prefixed = (href) => (href.startsWith("/") ? `https://orbi.build${href}` : href);
      const driftedHrefs =
        hrefs.length !== expected.length ||
        expected.some((href, i) => hrefs[i] !== href && hrefs[i] !== prefixed(href));
      if (driftedHrefs) {
        drift.push(`${page}: guides hrefs drifted — got ${hrefs.join(" ") || "(none)"}`);
      }
    }
    expect(drift, `footer guides drift:\n${drift.join("\n")}`).toEqual([]);
  });
});
