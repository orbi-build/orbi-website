// Issue #1210: a visitor must never reach a self-hosted 404 by clicking a
// link on our own pages. Every <a href> in the shipped HTML that points back
// at this site — site-absolute paths, relative paths, and the orbi.build
// domain in either spelling, with ?query and #fragment dropped — has to land
// on a file that ships in public/ (a page's index.html, or an asset such as
// the compare CSV) or on a route the site actually answers.
//
// This is the general gate that replaces the per-page link lists: those name
// one page's links and go green whenever that page stops being the one that
// breaks.

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const SITE_HOSTS = new Set(["orbi.build", "www.orbi.build"]);

// "/cloud/" → "/cloud", "/cloud/index.html" → "/cloud", "/" → "" — one form for
// page paths and href paths, so a trailing slash never decides the outcome.
const canon = (path) => path.replace(/\/index\.html$/, "/").replace(/\/+$/, "");

// Routes this Worker answers itself (src/worker.js), so public/ holds no file
// for them. Only entries a browser navigation reaches are listed: POST-only
// endpoints (/subscribe, /cloud/e), the retired /cloud/apply (410 Gone) and
// /status (plaintext for non-HTML Accept only — a browser's text/html Accept
// falls through to the assets and 404s, measured on orbi.build 2026-11-07) are
// left out on purpose: linking those is still a dead end.
const WORKER_ROUTES = new Set([
  "/cloud/login", // CLOUD_LOGIN_ROUTE — 302 to CLOUD_LOGIN_URL
  "/zh/cloud/login", // ZH_CLOUD_LOGIN_ROUTE
  "/pricing", // 301 to /cloud/#pricing
  "/zh/pricing", // 301 to /zh/cloud/#pricing
  "/apply", // 301 to /cloud/
  "/x", // 302 to /?ref=x-bio
  "/stats", // statsResponse JSON
  // PATH_REDIRECTS: retired slugs that still answer 301 to their new page.
  "/issue-to-release",
  "/autonomous-coding-agent",
  "/self-hosted-coding-agent",
  "/codex-github-issues",
  "/zh/issue-to-release",
  "/zh/autonomous-coding-agent",
  "/zh/self-hosted-coding-agent",
  "/zh/codex-github-issues",
  "/about/lawrence-liu",
  "/zh/about/lawrence-liu",
]);

// Routes the Cloud control plane serves on the shared hostname, so a website
// page may link them even though public/ holds no file. A trailing "/" entry
// matches the whole subtree.
//   /api/checkout — the checkout the /cloud/ pricing buttons open; /api*
//     belongs to the Cloud Worker (docs/cloud-endpoints.md), never to us.
//   /proof/…      — the delivery-summary pages the Cloud Worker renders, one
//     path per Issue, so the prefix is all this repository can know
//     (tests/pages.test.js, Issue #1123).
const CLOUD_ROUTES = ["/api/checkout", "/proof/"];

const onRoute = (target) =>
  WORKER_ROUTES.has(target) ||
  CLOUD_ROUTES.some((route) => (route.endsWith("/") ? target.startsWith(route) : target === route));

// Every path that ships under public/, relative and slash-separated. A
// directory on its own is not a page: Assets needs the index.html inside it.
async function walkFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(full)));
    else files.push(relative(PUBLIC_DIR, full).split(sep).join("/"));
  }
  return files;
}

// Internal link targets of one page: [{ href, target }] with href as written
// (so a failure quotes what the page really says) and target canonical.
function internalLinks(html, pagePath) {
  const links = [];
  // The page's own URL as base: every shipped page is a directory page, so a
  // relative href resolves inside that directory.
  const base = `https://orbi.build${pagePath === "" ? "/" : `${pagePath}/`}`;
  // Commented-out markup is not a rendered link.
  for (const anchor of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<a\b[^>]*>/g)) {
    const href = anchor[0].match(/\shref=["']([^"']*)["']/)?.[1];
    if (!href) continue;
    let url;
    try {
      url = new URL(href.replace(/&amp;/g, "&"), base);
    } catch {
      continue;
    }
    // mailto:, tel: and other schemes fall out here: they carry no host.
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (!SITE_HOSTS.has(url.host)) continue;
    links.push({ href, target: canon(url.pathname) });
  }
  return links;
}

let ships; // Set of files under public/, e.g. "blog/index.html", "compare/matrix.csv"
let linksByPage; // page path → [{ href, target }]

beforeAll(async () => {
  ships = new Set(await walkFiles(PUBLIC_DIR));
  linksByPage = new Map();
  for (const file of [...ships].filter((path) => path.endsWith(".html")).sort()) {
    const pagePath = canon(`/${file}`);
    linksByPage.set(pagePath, internalLinks(await readFile(join(PUBLIC_DIR, file), "utf8"), pagePath));
  }
});

describe("every internal link points at a page that exists (Issue #1210)", () => {
  it("resolves each internal link to a shipped file or a known route", () => {
    const broken = [];
    for (const [page, links] of linksByPage) {
      for (const { href, target } of links) {
        if (onRoute(target)) continue;
        const path = target.slice(1); // "" for the homepage
        const shipped = path === "" ? ships.has("index.html") : ships.has(path) || ships.has(`${path}/index.html`);
        if (!shipped) broken.push(`${page || "/"} → ${href}`);
      }
    }
    expect(
      broken,
      `internal links with no page behind them (page → link):\n${broken.join("\n")}`,
    ).toEqual([]);
  });

  // A walk that found nothing would make the check above pass without reading
  // a single page, so pin that it saw the real site.
  it("walks the shipped pages and their internal links", () => {
    expect(linksByPage.size, "HTML pages under public/").toBeGreaterThan(100);
    const targets = new Set([...linksByPage.values()].flat().map((link) => link.target));
    expect(targets.size, "distinct internal link targets").toBeGreaterThan(100);
  });
});
