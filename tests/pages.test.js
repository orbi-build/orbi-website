// Issue #106 gates: the shipped pages stay in lockstep with their sources,
// and the two language trees cannot silently drift apart again.
//
// These tests read the shipped bytes in public/ — the same files the Worker
// deploys — not a fixture, so any hand edit to public/ that skips
// `npm run build` fails here (the old failure mode this issue closes).

import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPages, collectPosts, lastCommitDate, loadPages, pathToHref, postFromSource, renderLlms } from "../scripts/build-pages.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let builtDir;
let pages;
let posts; // the posts collectPosts() derives from content/blog/**
let shipped; // output path -> bytes of public/<path>
let generatedSitemap;
let shippedSitemap;
let shippedFeed; // public/blog/feed.xml, the build-generated RSS 2.0 file
let generatedLlms; // build-generated llms.txt (Issue #215)
let shippedLlms; // public/llms.txt
let matrixCsv;

beforeAll(async () => {
  // A real build through the real entry point, never a re-implementation.
  builtDir = await mkdtemp(join(tmpdir(), "orbi-pages-"));
  execFileSync("node", [join(ROOT, "scripts", "build-pages.mjs"), "--out", builtDir], {
    timeout: 60_000,
  });
  pages = await loadPages();
  posts = await collectPosts();
  shipped = new Map();
  for (const page of pages) {
    shipped.set(page.output, await readFile(join(ROOT, "public", page.output), "utf8"));
  }
  // Posts are rendered from content/blog, not from a page source, so they
  // join the shipped map here.
  for (const post of posts) {
    shipped.set(post.output, await readFile(join(ROOT, "public", post.output), "utf8"));
  }
  generatedSitemap = await readFile(join(builtDir, "sitemap.xml"), "utf8");
  shippedSitemap = await readFile(join(ROOT, "public", "sitemap.xml"), "utf8");
  shippedFeed = await readFile(join(ROOT, "public", "blog", "feed.xml"), "utf8");
  generatedLlms = await readFile(join(builtDir, "llms.txt"), "utf8");
  shippedLlms = await readFile(join(ROOT, "public", "llms.txt"), "utf8");
  matrixCsv = await readFile(join(ROOT, "public", "compare", "matrix.csv"), "utf8");
});

afterAll(async () => {
  if (builtDir) await rm(builtDir, { recursive: true, force: true });
});

const region = (html, startMarker, endMarker) => {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  if (start < 0 || end < 0) return "";
  return html.slice(start, end + endMarker.length);
};

const navRegion = (html) => region(html, "<nav id=", "</nav>");
const footerRegion = (html) => region(html, '<footer class="site-footer shell">', "</footer>");
const mainRegion = (html) => region(html, '<main id="main-content">', "</main>");
const countMatches = (html, re) => [...html.matchAll(re)].length;

describe("ai-ready methodology pages (Issue #195)", () => {
  it("renders both language pages with metadata and twelve ordered factor headings", () => {
    const expected = [
      "One Issue, one runtime outcome.", "Acceptance is written before the work, in the Issue.",
      "Dependencies are native relations, not prose.", "One label is the execution switch; state lives only in labels.",
      "Issue text is data, never instructions.", "The contract lives in the repository; identity lives on the host.",
      "CI is the only test authority.", "Coverage is a gate, line and branch measured separately.",
      "The default branch is protected and only the runner merges.", "Review is a second session, and its verdict is bound to one SHA.",
      "Every loop has a limit, and beyond the limit is a human decision.", "A release is a state machine, not a script.",
    ];
    for (const output of ["aiready/index.html", "aiready/zh/index.html"]) {
      const html = shipped.get(output);
      expect(html).toContain('<link rel="canonical" href="https://aiready.sh/');
      expect(html).toContain('hreflang="en"');
      expect(html).toContain('hreflang="zh-CN"');
      expect(html).toContain('"@type":"Article"');
      expect(html).toContain('"@type":"FAQPage"');
      expect(html).toContain("datafa.st/js/script.js");
      if (output === "aiready/index.html") {
        expect([...html.matchAll(/<h3>\d+\. ([^<]+)/g)].map((m) => m[1])).toEqual(expected);
      }
      expect([...html.matchAll(/<h3>/g)]).toHaveLength(12);
    }
  });

  it("includes the requested ai-ready cross-links", () => {
    for (const page of pages) {
      if (page.output.includes("compare/") || ["index.html", "zh/index.html", "guides/ci-gates/index.html", "zh/guides/ci-gates/index.html"].includes(page.output)) {
        expect(shipped.get(page.output)).toContain("https://aiready.sh/");
      }
    }
  });
});

describe("comparison capability matrix (Issue #201)", () => {
  it("keeps the HTML table and downloadable CSV row and column sets identical", () => {
    const html = shipped.get("compare/index.html");
    const table = html.match(/<table class="compare-table[^\"]*capability-matrix">([\s\S]*?)<\/table>/)?.[1];
    const headers = [...table.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((match) => match[1]);
    const rows = [...table.matchAll(/<tr data-product="([^"]+)">([\s\S]*?)<\/tr>/g)].map((match) => [
      match[1],
      [...match[2].matchAll(/<td><a [^>]+>([^<]+)<\/a><\/td>/g)].map((cell) => cell[1]),
    ]);
    const csv = matrixCsv.trim().split("\n").map((line) => line.split(","));
    expect(headers).toEqual(csv[0].slice(0, -2));
    expect(rows).toEqual(csv.slice(1).map((row) => [row[0], row.slice(1, -2)]));
  });

  it("links every capability cell to its dated source", () => {
    for (const html of [shipped.get("compare/index.html"), shipped.get("zh/compare/index.html")]) {
      const table = html.match(/<table class="compare-table[^\"]*capability-matrix">([\s\S]*?)<\/table>/)?.[1];
      for (const row of table.matchAll(/<tr data-product="[^"]+">([\s\S]*?)<\/tr>/g)) {
        for (const cell of row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)) expect(cell[1]).toMatch(/<a href="https?:\/\//);
      }
    }
  });

  it("lists the CSV asset in the sitemap", () => {
    expect(shippedSitemap).toContain("https://orbi.build/compare/matrix.csv");
  });
});

describe("build output is committed (npm run build ran)", () => {
  it("produces exactly the files that exist under public/", async () => {
    const listFiles = async (dir, prefix = "") => {
      const out = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) out.push(...(await listFiles(join(dir, entry.name), `${prefix}${entry.name}/`)));
        else out.push(`${prefix}${entry.name}`);
      }
      return out.sort();
    };
    // The build owns the HTML, sitemap, blog feed and llms.txt; public/ also
    // carries assets (styles.css, img/, …) that no page source generates.
    const built = (await listFiles(builtDir)).filter((f) => f.endsWith(".html") || f.endsWith(".xml") || f === "llms.txt");
    const committed = (await listFiles(join(ROOT, "public"))).filter((f) => f.endsWith(".html") || f.endsWith(".xml") || f === "llms.txt");
    expect(built).toEqual(committed);
  });

  it("reproduces every committed page byte-for-byte", async () => {
    const drifted = [];
    for (const page of pages) {
      const built = await readFile(join(builtDir, page.output), "utf8");
      if (built !== shipped.get(page.output)) drifted.push(page.output);
    }
    // Posts have no page source; their rendered output must reproduce from the
    // committed content/blog/** the same way, or a body edit without a rebuild
    // would ship stale. llms.txt is generated too (Issue #215): a hand edit to
    // public/llms.txt that skips the build fails here.
    for (const post of posts) {
      const built = await readFile(join(builtDir, post.output), "utf8");
      if (built !== shipped.get(post.output)) drifted.push(post.output);
    }
    if (generatedLlms !== shippedLlms) drifted.push("llms.txt");
    expect(
      drifted,
      `public/ disagrees with site/ — run npm run build after editing site/** or content/** (drifted: ${drifted.join(", ")})`,
    ).toEqual([]);
  });

  it("generates a sitemap for every orbi.build page with git lastmod dates", () => {
    const pagesForSitemap = pages.filter((page) => !page.standalone);
    expect(generatedSitemap).toBe(shippedSitemap);
    expect([...generatedSitemap.matchAll(/<url>/g)]).toHaveLength(pagesForSitemap.length + posts.length + 1);
    expect(new Set([...generatedSitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1])).size)
      .toBeGreaterThanOrEqual(2);

    const source = "site/pages/zh/cloud/index.html";
    // Same basis as the build's lastCommitDate: the commit epoch, rendered to
    // the UTC day.
    const epoch = execFileSync("git", ["log", "-1", "--format=%ct", "--", source], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    const expectedDate = new Date(Number(epoch) * 1000).toISOString().slice(0, 10);
    const cloudUrl = generatedSitemap.match(/<loc>https:\/\/orbi\.build\/zh\/cloud\/<\/loc>([\s\S]*?)<\/url>/)?.[1];
    expect(cloudUrl).toContain(`<lastmod>${expectedDate}</lastmod>`);
  });

  // Issue #279: the build runs before the commit, so a source with
  // uncommitted changes must carry the current UTC day (the day the change
  // is committed), not the previous commit's epoch. A clean source keeps the
  // committed epoch. Both are timezone-independent.
  describe("lastCommitDate (Issue #279)", () => {
    let repo;
    const git = (args) =>
      execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: "pipe" });

    beforeAll(async () => {
      repo = await mkdtemp(join(tmpdir(), "orbi-lastmod-"));
      git(["init", "-q"]);
      git(["config", "user.email", "test@orbi.build"]);
      git(["config", "user.name", "orbi-test"]);
      await writeFile(join(repo, "page.html"), "<p>one</p>\n");
      git(["add", "page.html"]);
      // Commit with a fixed PAST date so the committed epoch's UTC day
      // (2026-09-19) differs from the current UTC day — otherwise the
      // clean-source and dirty-source tests cannot tell the behaviors apart.
      execFileSync("git", ["commit", "-q", "-m", "initial"], {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, GIT_COMMITTER_DATE: "2026-09-19T12:00:00Z", GIT_AUTHOR_DATE: "2026-09-19T12:00:00Z" },
      });
    });

    afterAll(async () => {
      if (repo) await rm(repo, { recursive: true, force: true });
    });

    it("returns the committed epoch's UTC day for a clean source", () => {
      const epoch = git(["log", "-1", "--format=%ct", "--", "page.html"]).trim();
      const expected = new Date(Number(epoch) * 1000).toISOString().slice(0, 10);
      // The fixed commit date is 2026-09-19, so this asserts the committed
      // epoch is used — not the current UTC day.
      expect(expected).toBe("2026-09-19");
      expect(lastCommitDate(join(repo, "page.html"), repo)).toBe("2026-09-19");
    });

    it("returns the current UTC day for a source with uncommitted changes", async () => {
      await writeFile(join(repo, "page.html"), "<p>two</p>\n"); // dirty, uncommitted
      const todayUtc = new Date().toISOString().slice(0, 10);
      expect(lastCommitDate(join(repo, "page.html"), repo)).toBe(todayUtc);
      // Restore so the clean-source test stays valid on rerun.
      git(["checkout", "--", "page.html"]);
    });
  });

  it("leaves no build markers or unfilled slots in shipped pages", () => {
    for (const [, html] of shipped) {
      expect(html).not.toContain("<!--@nav-->");
      expect(html).not.toContain("<!--@footer-->");
      expect(html).not.toContain("<!--@posts-->");
      expect(html).not.toContain("<!--@post-meta-->");
      expect(html).not.toContain("<!--@social-proof-->");
      expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });
});

describe("language mirrors (the forgotten-zh gate)", () => {
  it("pairs every EN page with a ZH page and vice versa", () => {
    const content = pages.filter((p) => !p.standalone);
    const outputs = new Set(pages.map((p) => p.output));
    for (const page of content) {
      expect(outputs, `${page.output} has no mirror ${page.mirror}`).toContain(page.mirror);
      const other = pages.find((p) => p.output === page.mirror);
      expect(other.mirror, `${page.output} and ${page.mirror} are not mutual mirrors`).toBe(page.output);
      expect(other.lang).not.toBe(page.lang);
    }
    const enPaths = content.filter((p) => p.lang === "en").map((p) => p.output);
    const zhPaths = content.filter((p) => p.lang === "zh").map((p) => p.output);
    expect(zhPaths).toEqual(enPaths.map((p) => `zh/${p}`));
  });

  it("keeps nav, footer and CTA counts equal across each mirror pair", () => {
    const content = pages.filter((p) => !p.standalone);
    for (const page of content) {
      const other = pages.find((p) => p.output === page.mirror);
      const a = shipped.get(page.output);
      const b = shipped.get(other.output);
      const count = (html, re) => countMatches(html, re);
      expect(count(navRegion(a), /<a /g), `${page.output}: nav <a> count drifted`)
        .toBe(count(navRegion(b), /<a /g));
      expect(count(footerRegion(a), /<a /g), `${page.output}: footer <a> count drifted`)
        .toBe(count(footerRegion(b), /<a /g));
      const ctas = (html) =>
        count(mainRegion(html), /<a class="button/g) + count(mainRegion(html), /data-cta="/g);
      expect(ctas(a), `${page.output}: CTA count drifted`).toBe(ctas(b));
    }
  });
});

describe("one unified footer on every content page", () => {
  const content = () => pages.filter((p) => !p.standalone);

  it("carries the 13-item footer nav on every content page", () => {
    for (const page of content()) {
      const footer = footerRegion(shipped.get(page.output));
      const nav = region(footer, '<nav aria-label="Footer navigation">', "</nav>")
        || region(footer, '<nav aria-label="页脚导航">', "</nav>");
      const items = [...nav.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
      const prefix = page.lang === "zh" ? "/zh" : "";
      const anchor = page.output === "index.html" || page.output === "zh/index.html" ? "" : `${prefix}/`;
      expect(items, `${page.output}: footer nav drifted`).toEqual([
        "https://docs.orbi.build" + (page.lang === "zh" ? "/zh" : ""),
        `${prefix}/cloud/`,
        `${prefix}/compare/`,
        "https://github.com/orbi-build/orbi",
        "https://x.com/xqliu",
        "https://www.youtube.com/@orbibuild",
        `${anchor}#faq`,
        "https://github.com/orbi-build/orbi/releases",
        "https://status.orbi.build",
        `${anchor}#direction`,
        "https://github.com/orbi-build/orbi/milestones",
        pathToHref(page.mirror),
        "https://www.opensourcealternatives.to/",
      ]);
    }
  });

  it("links YouTube in the footer with the verbatim anchor, on en and zh (Issue #255)", () => {
    for (const output of ["index.html", "zh/index.html"]) {
      const footer = footerRegion(shipped.get(output));
      expect(footer, `${output}: YouTube footer anchor drifted`).toContain(
        '<a href="https://www.youtube.com/@orbibuild" rel="me">YouTube</a>',
      );
    }
  });

  // Issue #270: opensourcealternatives.to requires a crawlable backlink before
  // the free listing goes live — no nofollow, or the review rejects it.
  it("links Open Source Alternatives from the footer without nofollow, on en and zh", () => {
    for (const output of ["index.html", "zh/index.html"]) {
      const footer = footerRegion(shipped.get(output));
      expect(footer, `${output}: Open Source Alternatives footer anchor drifted`).toContain(
        '<a href="https://www.opensourcealternatives.to/" rel="noopener">Open Source Alternatives</a>',
      );
      expect(footer, `${output}: the backlink must be crawlable`).not.toContain("nofollow");
    }
  });

  it("carries the 11 compare deep dives, in the right language tree", () => {
    for (const page of content()) {
      const footer = footerRegion(shipped.get(page.output));
      const deep = region(footer, '<nav class="footer-compare"', "</nav>");
      const hrefs = [...deep.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
      expect(hrefs, `${page.output}: deep-dive links drifted`).toHaveLength(11);
      const prefix = page.lang === "zh" ? "/zh" : "";
      for (const href of hrefs) {
        expect(href, `${page.output}: deep dive ${href} must live under ${prefix}/compare/`).toMatch(
          new RegExp(`^${prefix}/compare/[a-z-]+/$`),
        );
      }
      // Issue #91 smoke contract: the ZH footer must never link the EN tree.
      const wrongTree = hrefs.filter((href) =>
        page.lang === "zh" ? href.startsWith("/compare/") : href.startsWith("/zh/compare/"),
      );
      expect(wrongTree, `${page.output}: footer links the other language's deep dives`).toEqual([]);
    }
  });

  it("switches language to the mirror page from nav and footer", () => {
    for (const page of pages.filter((p) => p.mirror && !p.standalone)) {
      const html = shipped.get(page.output);
      const expected = pathToHref(page.mirror);
      const navSwitch = [...navRegion(html).matchAll(/<a href="([^"]+)" lang="(?:zh-CN|en)">/g)]
        .map((m) => m[1]);
      expect(navSwitch, `${page.output}: nav language switch`).toEqual([expected]);
      const footerSwitch = [...footerRegion(html).matchAll(/<a href="([^"]+)" lang="(?:zh-CN|en)">/g)]
        .map((m) => m[1]);
      expect(footerSwitch, `${page.output}: footer language switch`).toEqual([expected]);
    }
  });
});

describe("per-page head parameters (title / description / canonical)", () => {
  it("keeps the canonical URL equal to the page's own URL", () => {
    for (const page of pages) {
      const canonical = shipped
        .get(page.output)
        .match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      const expectedBase = page.output.startsWith("aiready/") ? "https://aiready.sh" : "https://orbi.build";
      expect(canonical, `${page.output}: canonical drifted`).toBe(
        `${expectedBase}${page.output.startsWith("aiready/") ? (page.output === "aiready/index.html" ? "/" : "/zh/") : pathToHref(page.output)}`,
      );
    }
  });

  it("keeps a real title and description on every page", () => {
    for (const page of pages) {
      const html = shipped.get(page.output);
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
      const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
      expect(title, `${page.output}: title is missing`).toBeTruthy();
      expect(description, `${page.output}: description is missing`).toBeTruthy();
    }
  });

  // Issue #237 (growth #41): the six keyword-aligned titles are delivered
  // copy — pin them verbatim (and the two rewritten descriptions) so a later
  // rebrand cannot silently undo the search-term targeting.
  it("carries the Issue #237 target-keyword titles and descriptions verbatim", () => {
    const expected = {
      "compare/devin/index.html": {
        title: "Open-source Devin alternative: Orbi vs Devin, with the bill | Orbi",
        description:
          "Looking for an open-source Devin alternative? A sourced comparison of Orbi and Devin: ACU credit billing versus measured per-delivery cost, cloud execution versus self-hosted, model lock-in, and when each one wins. Every claim sourced and dated.",
      },
      "compare/github-copilot-coding-agent/index.html": {
        title: "GitHub Copilot coding agent alternative: who merges the PR | Orbi",
        description:
          "A GitHub Copilot coding agent alternative that merges and releases. Sourced comparison: Copilot cannot approve or merge its own pull requests; Orbi runs independent review, an exact-head merge gate, and a tagged release. Cost and auditability compared.",
      },
      "cost/index.html": {
        title: "AI coding agent cost comparison: what one delivery actually costs | Orbi",
      },
      "cloud/index.html": {
        title: "Self-hosted or cloud coding agent: Orbi Cloud | Orbi",
      },
      "zh/compare/index.html": {
        title: "AI 编程 agent 工具对比：Orbi 与各家逐条核实 | Orbi",
      },
      "zh/cost/index.html": {
        title: "AI 编程成本实测：跑一个 Issue 到底花多少钱 | Orbi",
      },
    };
    for (const [output, slots] of Object.entries(expected)) {
      const html = shipped.get(output);
      expect(html.match(/<title>([^<]+)<\/title>/)?.[1], `${output}: title`).toBe(slots.title);
      if (slots.description) {
        expect(
          html.match(/<meta name="description" content="([^"]+)"/)?.[1],
          `${output}: description`,
        ).toBe(slots.description);
      }
    }
  });
});

describe("cloud hero CTA microcopy (Issue #156)", () => {
  // The hero CTA fires three instant redirects into GitHub's password box.
  // With no intermediate screen by design, the line under the button is the
  // only warning the user gets: it must say where the next step happens,
  // that repositories are chosen there, and that the choice is revisable —
  // and it must add no jump of its own.
  const microcopyExpectations = {
    "cloud/index.html":
      "Next step happens on GitHub: sign in and choose which repositories Orbi can access. You can authorize a single repository, and change it any time on GitHub.",
    "zh/cloud/index.html":
      "下一步在 GitHub 上完成：登录并选择 Orbi 可以访问的仓库。可以只授权一个仓库，随时在 GitHub 上修改。",
  };

  const heroCtaHref = {
    "cloud/index.html": 'href="/cloud/login?ref=cloud-page"',
    "zh/cloud/index.html": 'href="/cloud/login?ref=zh-cloud-page"',
  };

  const heroCtaBlock = (output) => {
    const hero = region(shipped.get(output), '<section class="compare-hero', "</section>");
    return hero.match(/<div class="hero-primary">([\s\S]*?)<\/div>/)?.[1] ?? "";
  };

  it("carries the handoff warning directly under the hero CTA on both languages", () => {
    for (const [output, expected] of Object.entries(microcopyExpectations)) {
      const block = heroCtaBlock(output);
      const button = block.indexOf(heroCtaHref[output]);
      expect(button, `${output}: hero CTA missing`).toBeGreaterThan(-1);
      const paragraph = block.indexOf("<p>");
      expect(paragraph, `${output}: CTA microcopy paragraph missing`).toBeGreaterThan(button);
      const text = block.match(/<p>([\s\S]*?)<\/p>/)?.[1]?.replace(/\s+/g, " ").trim();
      expect(text, `${output}: CTA microcopy drifted`).toBe(expected);
    }
  });

  it("adds no link of its own", () => {
    for (const output of Object.keys(microcopyExpectations)) {
      const block = heroCtaBlock(output);
      const paragraph = block.slice(block.indexOf("<p>"));
      expect(paragraph, `${output}: CTA microcopy must not carry links`).not.toContain("<a ");
    }
  });
});

describe("anchor prefixes (home-relative only on the homes)", () => {
  it("uses bare #section anchors only on the language homes", () => {
    for (const page of pages.filter((p) => !p.standalone)) {
      const chrome = navRegion(shipped.get(page.output)) + footerRegion(shipped.get(page.output));
      const anchors = [...chrome.matchAll(/href="(#[^"]+)"/g)].map((m) => m[1]);
      const isHome = page.output === "index.html" || page.output === "zh/index.html";
      if (isHome) {
        expect(anchors.length, `${page.output}: home chrome should anchor locally`).toBeGreaterThan(0);
      } else {
        expect(anchors, `${page.output}: non-home chrome must not use bare ${anchors.join(", ")}`).toEqual([]);
      }
      // Wherever they appear, section anchors must point at the page's own
      // language home, never across languages.
      for (const href of chrome.matchAll(/href="((?:\/zh)?\/#[^"]+)"/g)) {
        const expected = page.lang === "zh" ? "/zh/#" : "/#";
        expect(href[1].startsWith(expected), `${page.output}: cross-language anchor ${href[1]}`).toBe(true);
      }
    }
  });
});

// Issue #165: buyers looking for the subscription price get Pricing in the
// primary nav (the /cloud/ PRICING section), not the measured-cost essay.
describe("pricing nav entry (Issue #165)", () => {
  it("anchors the PRICING section on both Cloud pages", () => {
    for (const output of ["cloud/index.html", "zh/cloud/index.html"]) {
      const hits = countMatches(shipped.get(output), /id="pricing"/g);
      expect(hits, `${output}: expected exactly one id=\"pricing\"`).toBe(1);
    }
  });

  it("points every page's Cost/Pricing nav item at the Cloud pricing section", () => {
    for (const page of pages.filter((p) => p.nav)) {
      const nav = navRegion(shipped.get(page.output));
      const href = page.lang === "zh" ? "/zh/cloud/#pricing" : "/cloud/#pricing";
      const label = page.lang === "zh" ? "价格" : "Pricing";
      expect(nav, `${page.output}: nav missing ${href}`).toContain(`href="${href}"`);
      expect(nav, `${page.output}: nav missing label ${label}`).toContain(`>${label}<`);
      const marked = `href="${href}" aria-current="page"`;
      const isCloud = page.output === "cloud/index.html" || page.output === "zh/cloud/index.html";
      if (isCloud) {
        expect(nav, `${page.output}: Pricing should be aria-current on /cloud/`).toContain(marked);
      } else {
        expect(nav, `${page.output}: Pricing must not be aria-current here`).not.toContain(marked);
      }
    }
  });

  it("keeps a /cost/ entry from the Cloud pricing copy", () => {
    expect(shipped.get("cloud/index.html")).toMatch(/href="\/cost\/"/);
    expect(shipped.get("zh/cloud/index.html")).toMatch(/href="\/zh\/cost\/"/);
  });
});

// Issue #166: buyer-facing FAQ on /cloud/ — last click-blocking questions,
// not the homepage's self-host FAQ. JSON-LD must parse and stay in lockstep
// with the visible <details>; a trailing comma is a silent SEO failure.
const CLOUD_FAQ_PAGES = [
  { output: "cloud/index.html", faqId: "https://orbi.build/cloud/#faq" },
  { output: "zh/cloud/index.html", faqId: "https://orbi.build/zh/cloud/#faq" },
];

const stripTags = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const cloudFaqItems = (html) => {
  const section = region(html, '<section class="faq" id="faq"', "</section>");
  return [...section.matchAll(/<details class="faq-item"( open)?>([\s\S]*?)<\/details>/g)].map(
    (match) => {
      const body = match[2];
      const question = stripTags(
        (body.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? "").replace(/<span>[^<]*<\/span>/, ""),
      );
      const answer = stripTags(body.match(/<div class="faq-answer">([\s\S]*?)<\/div>/)?.[1] ?? "");
      return { open: match[1] === " open", question, answer };
    },
  );
};

const jsonLdGraph = (html) => {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1]),
  );
  return scripts.flatMap((data) => data["@graph"] ?? [data]);
};

describe("cloud buyer FAQ (Issue #166)", () => {
  it("sits between the three-step section and the closing CTA on both languages", () => {
    for (const { output } of CLOUD_FAQ_PAGES) {
      const main = mainRegion(shipped.get(output));
      const steps = main.indexOf('aria-labelledby="steps-title"');
      const faq = main.indexOf('<section class="faq" id="faq"');
      const closing = main.indexOf('class="closing');
      expect(steps, `${output}: three-step section missing`).toBeGreaterThan(-1);
      expect(faq, `${output}: FAQ section missing`).toBeGreaterThan(steps);
      expect(closing, `${output}: FAQ must precede the closing CTA`).toBeGreaterThan(faq);
    }
  });

  it("keeps the same item count on EN and ZH, first two open", () => {
    const counts = CLOUD_FAQ_PAGES.map(({ output }) => {
      const items = cloudFaqItems(shipped.get(output));
      expect(items.length, `${output}: need 5–7 buyer questions`).toBeGreaterThanOrEqual(5);
      expect(items.length, `${output}: need 5–7 buyer questions`).toBeLessThanOrEqual(7);
      expect(
        items.map((item) => item.open),
        `${output}: first two open, the rest collapsed (homepage pattern)`,
      ).toEqual(items.map((_, i) => i < 2));
      for (const [i, item] of items.entries()) {
        expect(item.question, `${output} FAQ ${i + 1} summary`).not.toBe("");
        expect(item.answer, `${output} FAQ ${i + 1} answer`).not.toBe("");
      }
      return items.length;
    });
    expect(counts[0], "EN/ZH FAQ counts drifted").toBe(counts[1]);
  });

  it("parses JSON-LD and keeps FAQPage mainEntity in lockstep with the visible items", () => {
    for (const { output, faqId } of CLOUD_FAQ_PAGES) {
      const html = shipped.get(output);
      const items = cloudFaqItems(html);
      const graph = jsonLdGraph(html);
      const faqPages = graph.filter((node) => node["@type"] === "FAQPage");
      expect(faqPages, `${output}: one FAQPage node`).toHaveLength(1);
      expect(faqPages[0]["@id"], output).toBe(faqId);
      const entities = faqPages[0].mainEntity;
      expect(entities, `${output}: mainEntity count`).toHaveLength(items.length);
      for (const [i, entity] of entities.entries()) {
        expect(entity["@type"], `${output} Q${i + 1} type`).toBe("Question");
        expect(entity.name, `${output} Q${i + 1} name`).toBe(items[i].question);
        const schemaText = String(entity.acceptedAnswer?.text ?? "").replace(/\s+/g, " ").trim();
        expect(schemaText, `${output} Q${i + 1} schema`).toBe(items[i].answer);
      }
    }
  });

  it("does not copy the homepage self-host FAQ onto /cloud/", () => {
    const home = cloudFaqItems(shipped.get("index.html")).map((item) => item.question);
    expect(home.length, "homepage FAQ missing").toBeGreaterThan(0);
    for (const { output } of CLOUD_FAQ_PAGES) {
      const questions = cloudFaqItems(shipped.get(output)).map((item) => item.question);
      expect(questions, `${output} reused a homepage question`).not.toEqual(home);
      for (const question of questions) {
        expect(home, `${output}: ${question}`).not.toContain(question);
      }
    }
  });
});

// Issue #221: status.orbi.build went live 2026-09-18; the only way to find it
// was to already know the URL. The footer links it on every page (after
// Releases, no target="_blank", same as GitHub and X) and the cloud FAQ
// answers the incident question with the link. The zh label must come from
// the translation table, so the zh page never shows the English word.
describe("status page link (Issue #221)", () => {
  it("links https://status.orbi.build from the footer right after Releases, on en and zh", () => {
    for (const output of ["index.html", "zh/index.html"]) {
      const footer = footerRegion(shipped.get(output));
      const releases = footer.indexOf('href="https://github.com/orbi-build/orbi/releases"');
      const status = footer.indexOf('href="https://status.orbi.build"');
      expect(releases, `${output}: Releases link missing`).toBeGreaterThan(-1);
      expect(status, `${output}: status link missing from the footer`).toBeGreaterThan(releases);
    }
  });

  it("labels the link Status on en and 状态 on zh, with no target attribute", () => {
    const en = footerRegion(shipped.get("index.html"));
    const zh = footerRegion(shipped.get("zh/index.html"));
    expect(en).toContain('href="https://status.orbi.build">Status</a>');
    expect(zh, "the zh footer must not show the English label").toContain('href="https://status.orbi.build">状态</a>');
    for (const [output, footer] of [["index.html", en], ["zh/index.html", zh]]) {
      expect(footer, `${output}: status link must not open a new tab`).not.toMatch(
        /<a[^>]*status\.orbi\.build[^>]*target=/,
      );
    }
  });

  it("answers the incident question in the cloud FAQ of both languages with the status link", () => {
    for (const [output, question] of [
      ["cloud/index.html", "What happens when Orbi Cloud has an incident?"],
      ["zh/cloud/index.html", "Orbi Cloud 出故障了怎么办？"],
    ]) {
      const html = shipped.get(output);
      const item = cloudFaqItems(html).find((entry) => entry.question === question);
      expect(item, `${output}: incident FAQ entry missing`).toBeTruthy();
      expect(item.answer, `${output}: FAQ answer must name the status page`).toContain("status.orbi.build");
      expect(html, `${output}: FAQ answer must link the status page`).toContain('href="https://status.orbi.build"');
    }
  });
});

// Issue #170: the primary-nav CTA is Start Cloud by default in the shared
// partial. Walking every built index.html (not a hardcoded page list) is the
// recurrence gate: a new page that forgets the Cloud login destination fails
// here instead of silently shipping Apply.
describe("nav CTA is Cloud login on every content page (Issue #170)", () => {
  it("defaults the shared partial to Cloud login, not Apply", async () => {
    const partial = await readFile(join(ROOT, "site", "partials", "nav.html"), "utf8");
    expect(partial).toContain('href="/cloud/login?ref=nav"');
    expect(partial).not.toContain('href="/apply"');
    expect(partial).not.toContain("{{APPLY_HREF}}");
  });

  it("points the primary-nav CTA at /cloud/login on every built index.html", async () => {
    const listIndex = async (dir, prefix = "") => {
      const out = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          out.push(...(await listIndex(join(dir, entry.name), `${prefix}${entry.name}/`)));
        } else if (entry.name === "index.html") {
          out.push(`${prefix}${entry.name}`);
        }
      }
      return out.sort();
    };
    // Walk the build products, never a hardcoded page list: a new page that
    // forgets the Cloud login destination fails here instead of shipping Apply.
    const outputs = (await listIndex(builtDir)).filter((output) => !output.startsWith("aiready/"));
    expect(outputs.length, "need at least the five funnel pages").toBeGreaterThanOrEqual(5);
    for (const output of outputs) {
      const html = await readFile(join(builtDir, output), "utf8");
      const nav = navRegion(html);
      const cta = nav.match(/<a class="nav-apply" href="([^"]+)">([^<]*)<\/a>/);
      expect(cta, `${output}: missing the primary-nav CTA`).toBeTruthy();
      expect(cta[1], `${output}: nav CTA must be the Cloud login handoff`).toBe("/cloud/login?ref=nav");
      expect(cta[1], `${output}: nav CTA must not be the Apply form`).not.toBe("/apply");
      const label = output.startsWith("zh/") ? "开始 Cloud" : "Start Cloud";
      expect(cta[2], `${output}: nav CTA label`).toBe(label);
    }
  });

  it("does not ship apply.html — /apply is a 301, not a conversion page", async () => {
    expect(shipped.has("apply.html"), "public/apply.html must not ship").toBe(false);
  });
});

// Issue #180: /cloud/ is the pricing page, not a clone of /cost/. Coupon and
// forever contract wording appear once; Devin/Factory billing docs stay on
// /cost/. The grep is the site source — the same files the Issue names.
describe("cloud copy is not a cost-page clone (Issue #180)", () => {
  const countIn = (html, needle) => html.split(needle).length - 1;

  it("keeps coupon and forever phrasing once and drops competitor billing docs", async () => {
    const en = await readFile(join(ROOT, "site", "pages", "cloud", "index.html"), "utf8");
    const zh = await readFile(join(ROOT, "site", "pages", "zh", "cloud", "index.html"), "utf8");
    expect(countIn(en, "not a price increase"), "EN not a price increase").toBeLessThanOrEqual(1);
    expect(countIn(en, "written on the subscription alone"), "EN forever phrasing").toBeLessThanOrEqual(1);
    expect(en, "EN docs.devin.ai").not.toContain("docs.devin.ai");
    expect(en, "EN docs.factory.ai").not.toContain("docs.factory.ai");
    expect(countIn(zh, "不是涨价"), "ZH 不是涨价").toBeLessThanOrEqual(1);
    expect(countIn(zh, "只写在订阅"), "ZH 只写在订阅").toBeLessThanOrEqual(1);
    expect(zh, "ZH docs.devin.ai").not.toContain("docs.devin.ai");
    expect(zh, "ZH docs.factory.ai").not.toContain("docs.factory.ai");
  });
});

// Issue #178: /compare/ and /compare/orca/ are visitor-facing. Delivery-status
// badges, private-repo ticket links, and audit-reasoning sentences belong in
// docs/comparison-audit.md, not on the pages a stranger opens.
describe("compare pages drop internal-reviewer copy (Issue #178)", () => {
  const outputs = [
    "compare/index.html",
    "zh/compare/index.html",
    "compare/orca/index.html",
    "zh/compare/orca/index.html",
  ];
  const forbidden = [
    "Research ticket",
    "dive-status",
    "orbi-website/issues/8",
    "orbi-website/issues/4",
    "comparison epic",
    "honestly",
    "after the 2026-09-10 audit",
    "described us",
    "研究票",
  ];

  it("keeps the four page sources free of those strings", async () => {
    for (const output of outputs) {
      const source = await readFile(join(ROOT, "site", "pages", output), "utf8");
      for (const needle of forbidden) {
        expect(source, `${output} still contains ${JSON.stringify(needle)}`).not.toContain(needle);
      }
    }
  });
});

// Issue #177: /evidence/ is a visitor page, not a restated ticket. Lock the
// forbidden ticket-voice strings out of the sources. Do not pin sentences —
// a later rewrite that keeps the visitor voice should still pass.
describe("evidence page visitor voice (Issue #177)", () => {
  const sources = ["site/pages/evidence/index.html", "site/pages/zh/evidence/index.html"];
  const forbidden = [
    "vmark",
    "#158",
    "PROPOSAL",
    "does not claim",
    "this page does not",
    "We do not restate",
    "本页不",
    "这张票",
  ];

  it("keeps ticket-voice copy out of both evidence sources", async () => {
    for (const rel of sources) {
      const html = await readFile(join(ROOT, rel), "utf8");
      for (const needle of forbidden) {
        expect(html, `${rel}: forbidden ${JSON.stringify(needle)}`).not.toContain(needle);
      }
    }
  });
});

// Issue #186: the homepage one-liner is the canonical aiready.sh entry.
// orbi.build/install.sh remains the underlying asset, never the primary command.
describe("canonical install one-liner (Issue #186)", () => {
  const canonical = "curl -fsSL https://aiready.sh | sh";
  const stalePrimary = "curl -fsSL https://orbi.build/install.sh";

  const snippetOf = (html) => html.match(/<code data-copy-source>([^<]*)<\/code>/)?.[1] ?? null;

  it("uses aiready.sh on the English and Chinese homepages", () => {
    for (const output of ["index.html", "zh/index.html"]) {
      const snippet = snippetOf(shipped.get(output));
      expect(snippet, `${output}: missing copyable install snippet`).toBe(canonical);
    }
  });

  it("keeps homepage sources on the same command", async () => {
    for (const rel of ["site/pages/index.html", "site/pages/zh/index.html"]) {
      const html = await readFile(join(ROOT, rel), "utf8");
      expect(snippetOf(html), `${rel}: missing copyable install snippet`).toBe(canonical);
    }
  });

  it("names the exact file when a primary snippet still uses orbi.build/install.sh", async () => {
    const stale = [];
    for (const [output, html] of shipped) {
      if (html.includes(stalePrimary)) stale.push(`public/${output}`);
    }
    for (const page of pages) {
      // Posts are no longer page sources; every page source still sits under
      // site/pages, addressed by page.source.
      const html = await readFile(join(ROOT, "site", "pages", page.source), "utf8");
      if (html.includes(stalePrimary)) stale.push(`site/pages/${page.source}`);
    }
    const llms = await readFile(join(ROOT, "public", "llms.txt"), "utf8");
    if (llms.includes(stalePrimary)) stale.push("public/llms.txt");
    expect(stale, `stale primary install URL in: ${stale.join(", ")}`).toEqual([]);
  });
});

describe("Cursor Cloud Agents comparison contract (Issue #199)", () => {
  it("ships both Cursor mirrors with Article metadata, all sourced quotes, and sitemap entries", () => {
    const en = shipped.get("compare/cursor/index.html");
    const zh = shipped.get("zh/compare/cursor/index.html");
    for (const [output, html, canonical, mirror] of [
      ["compare/cursor/index.html", en, "https://orbi.build/compare/cursor/", "https://orbi.build/zh/compare/cursor/"],
      ["zh/compare/cursor/index.html", zh, "https://orbi.build/zh/compare/cursor/", "https://orbi.build/compare/cursor/"],
    ]) {
      expect(html, `${output}: missing output`).toBeTruthy();
      expect(html).toContain('type="application/ld+json"');
      expect(html).toContain('"@type":"Article"');
      expect(html).toContain(`rel="canonical" href="${canonical}"`);
      expect(html).toContain(`hreflang="${output.startsWith("zh/") ? "en" : "zh-CN"}" href="${mirror}"`);
      for (const quote of [
        "open pull requests in the repos it changes",
        "produce merge-ready PRs with artifacts to demo their changes",
        "work on a separate branch, then push changes to your repo for handoff",
      ]) expect(html, `${output}: missing sourced quote`).toContain(quote);
      expect(html).toContain("2026-09-17");
    }
    expect(shippedSitemap).toContain("https://orbi.build/compare/cursor/");
    expect(shippedSitemap).toContain("https://orbi.build/zh/compare/cursor/");
  });
});

describe("Claude Code comparison contract (Issue #198)", () => {
  it("ships both Claude Code mirrors with Article metadata, sourced quotes, and sitemap entries", () => {
    const en = shipped.get("compare/claude-code/index.html");
    const zh = shipped.get("zh/compare/claude-code/index.html");
    for (const [output, html, canonical, mirror] of [
      ["compare/claude-code/index.html", en, "https://orbi.build/compare/claude-code/", "https://orbi.build/zh/compare/claude-code/"],
      ["zh/compare/claude-code/index.html", zh, "https://orbi.build/zh/compare/claude-code/", "https://orbi.build/compare/claude-code/"],
    ]) {
      expect(html, `${output}: missing output`).toBeTruthy();
      expect(html).toContain('type="application/ld+json"');
      expect(html).toContain('"@type":"Article"');
      expect(html).toContain(`rel="canonical" href="${canonical}"`);
      expect(html).toContain(`hreflang="${output.startsWith("zh/") ? "en" : "zh-CN"}" href="${mirror}"`);
      for (const quote of [
        "The check run always completes with a neutral conclusion so it never blocks merging.",
        "Grant the workflow only the permissions it needs, and review Claude's changes before merging.",
      ]) expect(html, `${output}: missing sourced quote`).toContain(quote);
      expect(html).toContain("2026-09-17");
    }
    expect(shippedSitemap).toContain("https://orbi.build/compare/claude-code/");
    expect(shippedSitemap).toContain("https://orbi.build/zh/compare/claude-code/");
    expect(shipped.get("compare/index.html")).toContain("/compare/claude-code/");
    expect(shipped.get("zh/compare/index.html")).toContain("/zh/compare/claude-code/");
    expect(shipped.get("index.html")).toContain("/compare/claude-code/");
    expect(shipped.get("zh/index.html")).toContain("/zh/compare/claude-code/");
  });
});

describe("Google Jules comparison contract (Issue #200)", () => {
  it("ships both Jules mirrors with Article metadata, all sourced quotes, and sitemap entries", () => {
    const en = shipped.get("compare/jules/index.html");
    const zh = shipped.get("zh/compare/jules/index.html");
    for (const [output, html, canonical, mirror] of [
      ["compare/jules/index.html", en, "https://orbi.build/compare/jules/", "https://orbi.build/zh/compare/jules/"],
      ["zh/compare/jules/index.html", zh, "https://orbi.build/zh/compare/jules/", "https://orbi.build/compare/jules/"],
    ]) {
      expect(html, `${output}: missing output`).toBeTruthy();
      expect(html).toContain('type="application/ld+json"');
      expect(html).toContain('"@type":"Article"');
      expect(html).toContain(`rel="canonical" href="${canonical}"`);
      expect(html).toContain(`hreflang="${output.startsWith("zh/") ? "en" : "zh-CN"}" href="${mirror}"`);
      for (const quote of [
        "Once the plan is approved, Jules will start coding",
        "You can click <strong>Create branch</strong> to push the changes",
        "You are the branch owner",
        "Jules appears as the commit author",
        "open a PR from this branch in GitHub",
      ]) expect(html, `${output}: missing sourced quote`).toContain(quote);
      expect(html).toContain("2026-09-17");
    }
    expect(shippedSitemap).toContain("https://orbi.build/compare/jules/");
    expect(shippedSitemap).toContain("https://orbi.build/zh/compare/jules/");
  });
});

// Issue #212: /blog/ on the root domain. Posts are Markdown files under
// content/blog/ (en) and content/blog/zh/ (zh); the build renders them through
// the shared chrome, derives both language indexes from the content directory
// (no hand-maintained list), and ships the English posts as an RSS 2.0 feed
// at /blog/feed.xml.
describe("blog (Issue #212)", () => {
  const enPost = () => posts.find((post) => post.lang === "en");
  const zhPost = () => posts.find((post) => post.lang === "zh");

  it("derives the posts from the content directory, sorted newest first with the slug as tiebreaker", async () => {
    expect(enPost(), "the first post must ship").toBeTruthy();
    expect(zhPost(), "the first post must have a zh mirror").toBeTruthy();
    const dates = posts.map((post) => post.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("renders both language indexes from the content directory with title, date, summary and link", () => {
    expect(enPost(), "the first post must ship").toBeTruthy();
    expect(zhPost(), "the first post must have a zh mirror").toBeTruthy();
    for (const [indexOutput, post] of [["blog/index.html", enPost()], ["zh/blog/index.html", zhPost()]]) {
      const html = shipped.get(indexOutput);
      expect(html, `${indexOutput}: missing output`).toBeTruthy();
      expect(html, `${indexOutput}: post link`).toContain(`<a href="${post.href}">${post.headline}</a>`);
      expect(html, `${indexOutput}: post summary`).toContain(post.summary);
      expect(html, `${indexOutput}: post date`).toContain(`<time datetime="${post.date}">${post.date}</time>`);
      expect(html, `${indexOutput}: index must be built, not carry the marker`).not.toContain("<!--@posts-->");
    }
  });

  it("renders each post with the shared chrome, a canonical link and article og meta from its front matter", () => {
    for (const post of [enPost(), zhPost()]) {
      const html = shipped.get(post.output);
      const url = `https://orbi.build${post.href}`;
      expect(html).toContain(`<link rel="canonical" href="${url}">`);
      expect(html).toContain('<meta property="og:type" content="article">');
      expect(html).toContain(`<meta property="og:title" content="${post.headline}">`);
      expect(html).toContain(`<meta property="og:description" content="${post.summary}">`);
      expect(html).toContain(`<meta property="og:url" content="${url}">`);
      expect(html).toContain(`<meta property="article:published_time" content="${post.date}">`);
      expect(html, `${post.output}: shared nav must render`).toContain('<nav id="');
      expect(html, `${post.output}: shared footer must render`).toContain('<footer class="site-footer shell">');
      expect(html, `${post.output}: meta must be generated, not carry the marker`).not.toContain("<!--@post-meta-->");
    }
  });

  it("renders each post's Markdown body as HTML under the front-matter title", () => {
    for (const post of [enPost(), zhPost()]) {
      const html = shipped.get(post.output);
      expect(html, `${post.output}: title from front matter`).toContain(`<h1 id="post-title">${post.title}</h1>`);
      // Every post ships fenced shell commands and Markdown links; the
      // rendered body must carry them as HTML, produced by marked. Assert the
      // shapes, not one post's URL, so a later post cannot fail on its own links.
      expect(html, `${post.output}: fenced code block`).toContain("<pre><code");
      expect(html, `${post.output}: no raw markdown fences survive`).not.toContain("```");
      expect(html, `${post.output}: rendered link`).toMatch(/<a href="https:\/\/[^"]+">/);
      expect(html, `${post.output}: no raw markdown link syntax survives`).not.toMatch(/\]\(https:\/\//);
    }
  });

  it("generates an RSS 2.0 feed of the English posts that parses as XML with one item per post", async () => {
    const builtFeed = await readFile(join(builtDir, "blog", "feed.xml"), "utf8");
    expect(builtFeed, "public/blog/feed.xml drifted from the build").toBe(shippedFeed);
    // A real XML parse, not a regex, over the shipped file's actual bytes:
    // python3 is already a standing requirement of this repository's CI
    // (tests.test_landing runs on it in every workflow).
    const parsed = JSON.parse(execFileSync("python3", ["-c", `
import json, sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
channel = root.find("channel")
print(json.dumps({
    "root": root.tag,
    "version": root.get("version"),
    "title": channel.findtext("title"),
    "link": channel.findtext("link"),
    "items": [{"title": i.findtext("title"), "link": i.findtext("link"),
               "guid": i.findtext("guid"), "guidAttr": i.find("guid").get("isPermaLink"),
               "pubDate": i.findtext("pubDate"), "description": i.findtext("description")}
              for i in channel.findall("item")],
}))
`, join(ROOT, "public", "blog", "feed.xml")], { timeout: 30_000, encoding: "utf8" }));
    const enItems = posts.filter((post) => post.lang === "en");
    expect(parsed.root).toBe("rss");
    expect(parsed.version).toBe("2.0");
    expect(parsed.title).toBe("Orbi Blog");
    expect(parsed.link).toBe("https://orbi.build/blog/");
    expect(parsed.items, "one item per English post, newest first").toHaveLength(enItems.length);
    for (const [i, item] of parsed.items.entries()) {
      expect(item.title).toBe(enItems[i].headline);
      expect(item.link).toBe(`https://orbi.build${enItems[i].href}`);
      expect(item.guid).toBe(`https://orbi.build${enItems[i].href}`);
      expect(item.guidAttr).toBe("true");
      expect(item.pubDate).toBe(new Date(`${enItems[i].date}T00:00:00Z`).toUTCString());
      expect(item.description).toBe(enItems[i].summary);
    }
  });

  it("lists /blog/, /zh/blog/ and every post URL in the sitemap", () => {
    for (const post of posts) {
      expect(shippedSitemap).toContain(`<loc>https://orbi.build${post.href}</loc>`);
    }
    expect(shippedSitemap).toContain("<loc>https://orbi.build/blog/</loc>");
    expect(shippedSitemap).toContain("<loc>https://orbi.build/zh/blog/</loc>");
  });

  it("keeps the same-date rule on the same-slug pairs that exist (Issue #214)", async () => {
    const enDir = join(ROOT, "content", "blog");
    const enFiles = (await readdir(enDir)).filter((f) => f.endsWith(".md"));
    expect(enFiles.length, "the blog must ship at least one post").toBeGreaterThan(0);
    const zhFiles = new Set((await readdir(join(enDir, "zh"))).filter((f) => f.endsWith(".md")));
    // Each same-slug zh mirror is compared against its own en counterpart's
    // front-matter date, not against the newest post's: with two posts of
    // different dates the newest-only check would fail the older pair falsely.
    // An en file with no same-slug zh file is a single-language post — valid
    // since Issue #214, nothing to compare.
    const frontDate = (source, name) => {
      const block = source.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
      expect(block, `${name}: missing the --- front-matter block`).toBeTruthy();
      const date = block.match(/^date:\s?(.+)$/m)?.[1]?.trim();
      expect(date, `${name}: missing the date field`).toBeTruthy();
      return date;
    };
    for (const file of enFiles) {
      const enDate = frontDate(await readFile(join(enDir, file), "utf8"), `content/blog/${file}`);
      if (!zhFiles.has(file)) continue;
      const zhSource = await readFile(join(enDir, "zh", file), "utf8");
      expect(frontDate(zhSource, `content/blog/zh/${file}`), `content/blog/zh/${file}: mirror must carry the same date as content/blog/${file}`).toBe(enDate);
    }
  });

  it("links the blog from the primary nav on both language homes", () => {
    expect(navRegion(shipped.get("index.html"))).toContain('<a href="/blog/">Blog</a>');
    expect(navRegion(shipped.get("zh/index.html"))).toContain('<a href="/zh/blog/">博客</a>');
  });
});

// Issue #215: the Blog section of llms.txt is generated from content/blog/**
// like the indexes, feed and sitemap — adding a post never needs a second
// manual edit in another file. The hand-written prose (every section above
// and below) lives in site/llms.txt; only the post list at the
// <!--@llms-blog--> marker is generated, newest first, in the format the
// hand-maintained file used.
describe("llms.txt Blog section is generated (Issue #215)", () => {
  const entryRe = /^- (.+) \((English|Chinese)\):\n  (https:\/\/orbi\.build\/(?:zh\/)?blog\/[^/\s]+\/)$/gm;

  it("builds llms.txt from site/llms.txt byte-for-byte", () => {
    expect(generatedLlms, "public/llms.txt drifted from the build").toBe(shippedLlms);
  });

  it("keeps the hand-written prose in the source, with the marker and no hand-listed posts", async () => {
    const source = await readFile(join(ROOT, "site", "llms.txt"), "utf8");
    const section = source.slice(source.indexOf("## Blog"), source.indexOf("## Links"));
    expect(section, "site/llms.txt: Blog prose missing").toContain("Shipping notes from the root domain");
    expect(section, "site/llms.txt: RSS feed link missing").toContain("https://orbi.build/blog/feed.xml");
    expect(section, "site/llms.txt: missing the <!--@llms-blog--> marker").toContain("<!--@llms-blog-->");
    expect([...section.matchAll(/^- /gm)], "site/llms.txt must not hand-list posts").toEqual([]);
  });

  it("ships no build marker in public/llms.txt", () => {
    expect(shippedLlms).not.toContain("<!--@llms-blog-->");
  });

  it("lists exactly the content/blog posts — newest first, one entry per language, nothing else", () => {
    const start = shippedLlms.indexOf("## Blog");
    const end = shippedLlms.indexOf("## Links");
    expect(start, "Blog section missing").toBeGreaterThan(-1);
    expect(end, "Links section missing").toBeGreaterThan(start);
    const section = shippedLlms.slice(start, end);
    const matched = [...section.matchAll(entryRe)];
    // Nothing else: every "- " line parses as an entry, so a removed post
    // cannot leave a stale line and no foreign line can hide here.
    expect([...section.matchAll(/^- /gm)], "unparseable list lines in the Blog section")
      .toHaveLength(matched.length);
    expect(matched.map((m) => m[3])).toEqual(posts.map((post) => `https://orbi.build${post.href}`));
    for (const [i, m] of matched.entries()) {
      expect(m[1], `entry ${i} title`).toBe(posts[i].title);
      expect(m[2], `entry ${i} language`).toBe(posts[i].lang === "zh" ? "Chinese" : "English");
    }
  });

  it("replaces only the marker: the prose around it survives byte-for-byte", () => {
    const source = "## Blog\n\nIntro prose.\n\n<!--@llms-blog-->\n\n## Links\n";
    const out = renderLlms(source, [{ lang: "en", title: "Fixture", href: "/blog/fixture/" }]);
    expect(out).toBe("## Blog\n\nIntro prose.\n\n- Fixture (English):\n  https://orbi.build/blog/fixture/\n\n## Links\n");
  });

  it("fails the build when the source lost the Blog marker", () => {
    expect(() => renderLlms("## Blog\n\nno marker here\n", []))
      .toThrow(/site\/llms\.txt[\s\S]*<!--@llms-blog-->/);
  });
});

// Issue #212 failure path: a post missing any front-matter field must fail
// the build with the file path in the error, never skip silently.
describe("blog failure path (Issue #212)", () => {
  const front = (fields) =>
    `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\nBody paragraph.\n`;
  const full = { title: "T", date: "2026-09-18", summary: "s", lang: "en" };

  it("fails with the file path when the front-matter block is missing", () => {
    expect(() => postFromSource("t.md", "no front matter here"))
      .toThrow(/content\/blog\/t\.md/);
  });

  it("fails with the file path when a post has no title", () => {
    const { title, ...fields } = full;
    expect(() => postFromSource("t.md", front(fields)))
      .toThrow(/content\/blog\/t\.md[\s\S]*"title"/);
  });

  it("fails with the file path when a post has no date", () => {
    const { date, ...fields } = full;
    expect(() => postFromSource("t.md", front(fields)))
      .toThrow(/content\/blog\/t\.md[\s\S]*"date"/);
  });

  it("fails with the file path when the date is not YYYY-MM-DD", () => {
    expect(() => postFromSource("t.md", front({ ...full, date: "September 18" })))
      .toThrow(/content\/blog\/t\.md[\s\S]*"date"/);
  });

  it("fails with the file path when a post has no summary", () => {
    const { summary, ...fields } = full;
    expect(() => postFromSource("t.md", front(fields)))
      .toThrow(/content\/blog\/t\.md[\s\S]*"summary"/);
  });

  it("fails with the file path when the summary is empty", () => {
    expect(() => postFromSource("t.md", front({ ...full, summary: "  " })))
      .toThrow(/content\/blog\/t\.md[\s\S]*"summary"/);
  });

  it("fails with the file path when a post has no lang", () => {
    const { lang, ...fields } = full;
    expect(() => postFromSource("t.md", front(fields)))
      .toThrow(/content\/blog\/t\.md[\s\S]*"lang"/);
  });

  it("fails with the file path when lang contradicts the file's directory", () => {
    expect(() => postFromSource("zh/t.md", front({ ...full, lang: "en" })))
      .toThrow(/content\/blog\/zh\/t\.md[\s\S]*lang/);
  });
});

// Issue #214: pairing is no longer "same slug or nothing". A post may declare
// `mirror: <slug>` naming its counterpart in the other language directory, a
// same-slug file pairs by default, and a post with neither publishes alone —
// its language switcher at the other language's blog index, never a 404. A
// dangling or non-mutual `mirror:` fails the build naming both files.
describe("blog mirror pairing (Issue #214)", () => {
  const front = (fields) =>
    `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\nBody paragraph.\n`;
  const full = { title: "T", date: "2026-09-18", summary: "s", lang: "en" };
  const writePost = async (contentDir, name, fields) => {
    await mkdir(dirname(join(contentDir, name)), { recursive: true });
    await writeFile(join(contentDir, name), front(fields));
  };
  const withContent = (fn) =>
    mkdtemp(join(tmpdir(), "orbi-content-")).then(async (contentDir) => {
      try {
        return await fn(contentDir);
      } finally {
        await rm(contentDir, { recursive: true, force: true });
      }
    });

  it("keeps the same-slug pair working with no front-matter change", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "same.md", { ...full, title: "Same" });
      await writePost(contentDir, "zh/same.md", { ...full, title: "Same 旧", lang: "zh" });
      const posts = await collectPosts(contentDir);
      expect(posts.map((post) => post.output).sort()).toEqual([
        "blog/same/index.html",
        "zh/blog/same/index.html",
      ]);
      for (const post of posts) {
        expect(post.paired, `${post.output}: paired`).toBe(true);
        expect(post.mirrorOutput, `${post.output}: switcher target`).toBe(
          post.lang === "en" ? "zh/blog/same/index.html" : "blog/same/index.html",
        );
      }
    }));

  it("pairs a mirror:-declared pair across different slugs, both directions", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "alpha.md", { ...full, title: "Alpha", mirror: "beta" });
      await writePost(contentDir, "zh/beta.md", { ...full, title: "Beta 旧", lang: "zh", mirror: "alpha" });
      const posts = await collectPosts(contentDir);
      expect(posts).toHaveLength(2);
      const alpha = posts.find((post) => post.slug === "alpha");
      const beta = posts.find((post) => post.slug === "beta");
      expect(alpha.mirrorOutput, "alpha switches to beta").toBe("zh/blog/beta/index.html");
      expect(beta.mirrorOutput, "beta switches to alpha").toBe("blog/alpha/index.html");
    }));

  it("publishes a single-language post with the switcher at the other language's blog index", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "solo.md", { ...full, title: "Solo" });
      let posts = await collectPosts(contentDir);
      expect(posts).toHaveLength(1);
      expect(posts[0].paired).toBe(false);
      expect(posts[0].mirrorOutput).toBe("zh/blog/index.html");

      await rm(join(contentDir, "solo.md"));
      await writePost(contentDir, "zh/solo.md", { ...full, title: "Solo 旧", lang: "zh" });
      posts = await collectPosts(contentDir);
      expect(posts).toHaveLength(1);
      expect(posts[0].paired).toBe(false);
      expect(posts[0].mirrorOutput).toBe("blog/index.html");
    }));

  it("fails naming both files when mirror: names a file that does not exist", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "a.md", { ...full, mirror: "b" });
      await expect(collectPosts(contentDir)).rejects
        .toThrow(/content\/blog\/a\.md[\s\S]*mirror: b[\s\S]*content\/blog\/zh\/b\.md/);
    }));

  it("fails naming both files when the named mirror names nothing back", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "a.md", { ...full, mirror: "b" });
      await writePost(contentDir, "zh/b.md", { ...full, lang: "zh" });
      await expect(collectPosts(contentDir)).rejects
        .toThrow(/content\/blog\/a\.md names content\/blog\/zh\/b\.md as its mirror, but content\/blog\/zh\/b\.md names no mirror/);
    }));

  it("fails naming both files when the named mirror names a different post", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "a.md", { ...full, mirror: "b" });
      await writePost(contentDir, "c.md", { ...full, title: "C", mirror: "b" });
      await writePost(contentDir, "zh/b.md", { ...full, lang: "zh", mirror: "c" });
      await expect(collectPosts(contentDir)).rejects
        .toThrow(/content\/blog\/a\.md names content\/blog\/zh\/b\.md as its mirror, but content\/blog\/zh\/b\.md names content\/blog\/c\.md/);
    }));

  it("fails naming the file when mirror: is empty", () =>
    withContent(async (contentDir) => {
      await writePost(contentDir, "a.md", { ...full, mirror: "" });
      await expect(collectPosts(contentDir)).rejects
        .toThrow(/content\/blog\/a\.md[\s\S]*"mirror"/);
    }));
});

// Issue #212 acceptance 7: a brand-new post fixture goes through the real
// build — post page with title and rendered body HTML, index entry newest
// first, feed item, sitemap URL — never a re-implementation of the pipeline.
describe("blog content pipeline end to end (Issue #212 acceptance 7)", () => {
  const md = (title, date, summary, lang) => `---
title: ${title}
date: ${date}
summary: ${summary}
lang: ${lang}
---

Intro for ${title} with \`inline code\`.

\`\`\`bash
echo hello from ${title}
\`\`\`

See [the docs](https://docs.orbi.build/docker).
`;

  it("drives fixture posts through the real build into page, index, feed and sitemap", async () => {
    const contentDir = await mkdtemp(join(tmpdir(), "orbi-content-"));
    const outDir = await mkdtemp(join(tmpdir(), "orbi-fixture-build-"));
    try {
      await mkdir(join(contentDir, "zh"), { recursive: true });
      await writeFile(join(contentDir, "fixture-old.md"), md("Fixture old", "2026-09-01", "The older fixture post.", "en"));
      await writeFile(join(contentDir, "zh", "fixture-old.md"), md("Fixture 旧", "2026-09-01", "The older fixture post, in Chinese.", "zh"));
      await writeFile(join(contentDir, "fixture-new.md"), md("Fixture new", "2026-09-10", "The newer fixture post.", "en"));
      await writeFile(join(contentDir, "zh", "fixture-new.md"), md("Fixture 新", "2026-09-10", "The newer fixture post, in Chinese.", "zh"));

      await buildPages(outDir, { contentDir });

      // The rendered post: title and body HTML plus the derived meta.
      const newHtml = await readFile(join(outDir, "blog", "fixture-new", "index.html"), "utf8");
      expect(newHtml).toContain("<title>Fixture new | Orbi</title>");
      expect(newHtml).toContain('<h1 id="post-title">Fixture new</h1>');
      expect(newHtml).toContain('<link rel="canonical" href="https://orbi.build/blog/fixture-new/">');
      expect(newHtml).toContain('<meta property="article:published_time" content="2026-09-10">');
      expect(newHtml).toContain("Intro for Fixture new with <code>inline code</code>");
      expect(newHtml).toContain("<pre><code");
      expect(newHtml).toContain("echo hello from Fixture new");
      expect(newHtml).toContain('<a href="https://docs.orbi.build/docker">the docs</a>');
      expect(newHtml, "shared nav must render").toContain('<nav id="');
      expect(newHtml, "shared footer must render").toContain('<footer class="site-footer shell">');

      // The index: both entries present, the newer one first.
      const index = await readFile(join(outDir, "blog", "index.html"), "utf8");
      const newAt = index.indexOf('<a href="/blog/fixture-new/">Fixture new</a>');
      const oldAt = index.indexOf('<a href="/blog/fixture-old/">Fixture old</a>');
      expect(newAt, "the newer fixture post must be listed").toBeGreaterThan(-1);
      expect(oldAt, "the older fixture post must be listed").toBeGreaterThan(-1);
      expect(newAt, "newest first").toBeLessThan(oldAt);
      const zhIndex = await readFile(join(outDir, "zh", "blog", "index.html"), "utf8");
      expect(zhIndex).toContain('<a href="/zh/blog/fixture-new/">Fixture 新</a>');

      // The feed: real XML parse, one item per English post, newest first.
      const parsed = JSON.parse(execFileSync("python3", ["-c", `
import json, sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
channel = root.find("channel")
print(json.dumps({
    "items": [{"title": i.findtext("title"), "link": i.findtext("link")}
              for i in channel.findall("item")],
}))
`, join(outDir, "blog", "feed.xml")], { timeout: 30_000, encoding: "utf8" }));
      expect(parsed.items.map((item) => item.link)).toEqual([
        "https://orbi.build/blog/fixture-new/",
        "https://orbi.build/blog/fixture-old/",
      ]);

      // The sitemap: every fixture post URL, both languages.
      const sitemap = await readFile(join(outDir, "sitemap.xml"), "utf8");
      for (const href of ["/blog/fixture-new/", "/blog/fixture-old/", "/zh/blog/fixture-new/", "/zh/blog/fixture-old/"]) {
        expect(sitemap).toContain(`<loc>https://orbi.build${href}</loc>`);
      }

      // Issue #215: the generated llms.txt Blog section picks the fixture
      // posts up with no manual edit anywhere — newest first, both languages,
      // and none of the real posts (the list is built from the content dir,
      // not from a hand-maintained file).
      const llms = await readFile(join(outDir, "llms.txt"), "utf8");
      const llmsSection = llms.slice(llms.indexOf("## Blog"), llms.indexOf("## Links"));
      expect(llmsSection).toContain("- Fixture new (English):\n  https://orbi.build/blog/fixture-new/");
      expect(llmsSection).toContain("- Fixture 新 (Chinese):\n  https://orbi.build/zh/blog/fixture-new/");
      expect(llmsSection).toContain("- Fixture old (English):\n  https://orbi.build/blog/fixture-old/");
      expect(llmsSection.indexOf("fixture-new"), "newest first").toBeLessThan(llmsSection.indexOf("fixture-old"));
      expect(llmsSection, "generated Blog section must not list real posts").not.toContain("docker-image-third-try");
    } finally {
      await rm(contentDir, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });
});

// Issue #214 evidence: all three shapes through the real build — the
// same-slug pair, a mirror:-declared pair across different slugs, and
// single-language posts in both languages — with the rendered language
// switchers, indexes, feed, sitemap and llms.txt each shape must produce.
describe("blog mirror pairing end to end (Issue #214 evidence)", () => {
  const md = (title, date, summary, lang, mirror) => `---
title: ${title}
date: ${date}
summary: ${summary}
lang: ${lang}${mirror === undefined ? "" : `\nmirror: ${mirror}`}
---

Body of ${title} with [a link](https://docs.orbi.build/docker).
`;

  const switchTargets = async (outDir, output) => {
    const html = await readFile(join(outDir, output), "utf8");
    return [...html.matchAll(/<a href="([^"]+)" lang="(?:zh-CN|en)">[^<]*<\/a>/g)].map((m) => m[1]);
  };

  it("publishes the same-slug pair, the declared pair and both single-language posts", async () => {
    const contentDir = await mkdtemp(join(tmpdir(), "orbi-content-"));
    const outDir = await mkdtemp(join(tmpdir(), "orbi-fixture-build-"));
    try {
      await mkdir(join(contentDir, "zh"), { recursive: true });
      await writeFile(join(contentDir, "pair.md"), md("Pair", "2026-09-01", "The same-slug pair.", "en"));
      await writeFile(join(contentDir, "zh", "pair.md"), md("Pair 旧", "2026-09-01", "The same-slug pair, in Chinese.", "zh"));
      await writeFile(join(contentDir, "alpha.md"), md("Alpha", "2026-09-02", "English comparison intent.", "en", "beta"));
      await writeFile(join(contentDir, "zh", "beta.md"), md("Beta", "2026-09-05", "Chinese method intent.", "zh", "alpha"));
      await writeFile(join(contentDir, "solo-en.md"), md("Solo EN", "2026-09-03", "English only.", "en"));
      await writeFile(join(contentDir, "zh", "solo-zh.md"), md("Solo ZH", "2026-09-04", "Chinese only.", "zh"));

      await buildPages(outDir, { contentDir });

      // The language switcher (nav and footer, two hits per page): the
      // counterpart page for a pair, the other language's blog index for a
      // single-language post — never a page that does not exist.
      expect(await switchTargets(outDir, "blog/pair/index.html")).toEqual(["/zh/blog/pair/", "/zh/blog/pair/"]);
      expect(await switchTargets(outDir, "blog/alpha/index.html")).toEqual(["/zh/blog/beta/", "/zh/blog/beta/"]);
      expect(await switchTargets(outDir, "zh/blog/beta/index.html")).toEqual(["/blog/alpha/", "/blog/alpha/"]);
      expect(await switchTargets(outDir, "blog/solo-en/index.html")).toEqual(["/zh/blog/", "/zh/blog/"]);
      expect(await switchTargets(outDir, "zh/blog/solo-zh/index.html")).toEqual(["/blog/", "/blog/"]);

      // Indexes: every post in its own language, never the other's.
      const enIndex = await readFile(join(outDir, "blog", "index.html"), "utf8");
      for (const href of ["/blog/pair/", "/blog/alpha/", "/blog/solo-en/"]) {
        expect(enIndex, `en index lists ${href}`).toContain(`<a href="${href}">`);
      }
      for (const href of ["/zh/blog/beta/", "/zh/blog/solo-zh/"]) {
        expect(enIndex, `en index must not list ${href}`).not.toContain(`href="${href}"`);
      }
      const zhIndex = await readFile(join(outDir, "zh", "blog", "index.html"), "utf8");
      for (const href of ["/zh/blog/pair/", "/zh/blog/beta/", "/zh/blog/solo-zh/"]) {
        expect(zhIndex, `zh index lists ${href}`).toContain(`<a href="${href}">`);
      }
      expect(zhIndex, "zh index must not list the en-only post").not.toContain('href="/blog/alpha/"');

      // The feed carries every English post regardless of pairing.
      const feed = await readFile(join(outDir, "blog", "feed.xml"), "utf8");
      for (const href of ["/blog/pair/", "/blog/alpha/", "/blog/solo-en/"]) {
        expect(feed, `feed lists ${href}`).toContain(`<link>https://orbi.build${href}</link>`);
      }
      expect(feed, "feed must not list the zh-only post").not.toContain("/blog/beta/");

      // The sitemap lists all six posts; pairs carry hreflang alternates to
      // each other, a single-language post lists itself with no alternate.
      const sitemap = await readFile(join(outDir, "sitemap.xml"), "utf8");
      for (const href of ["/blog/pair/", "/zh/blog/pair/", "/blog/alpha/", "/zh/blog/beta/", "/blog/solo-en/", "/zh/blog/solo-zh/"]) {
        expect(sitemap, `sitemap lists ${href}`).toContain(`<loc>https://orbi.build${href}</loc>`);
      }
      const soloUrl = sitemap.match(/<url>\n    <loc>https:\/\/orbi\.build\/blog\/solo-en\/<\/loc>[\s\S]*?<\/url>/)?.[0];
      expect(soloUrl, "solo post sitemap entry").toBeTruthy();
      expect(soloUrl, "a single-language post carries no hreflang alternate").not.toContain("xhtml:link");
      const alphaUrl = sitemap.match(/<url>\n    <loc>https:\/\/orbi\.build\/blog\/alpha\/<\/loc>[\s\S]*?<\/url>/)?.[0];
      expect(alphaUrl, "the declared pair's alternates cross-link").toContain(
        '<xhtml:link rel="alternate" hreflang="zh-CN" href="https://orbi.build/zh/blog/beta/"/>',
      );

      // llms.txt lists every published post regardless of pairing.
      const llms = await readFile(join(outDir, "llms.txt"), "utf8");
      const llmsSection = llms.slice(llms.indexOf("## Blog"), llms.indexOf("## Links"));
      for (const [title, lang, href] of [
        ["Alpha", "English", "https://orbi.build/blog/alpha/"],
        ["Beta", "Chinese", "https://orbi.build/zh/blog/beta/"],
        ["Solo EN", "English", "https://orbi.build/blog/solo-en/"],
        ["Solo ZH", "Chinese", "https://orbi.build/zh/blog/solo-zh/"],
      ]) {
        expect(llmsSection, `llms.txt lists ${title}`).toContain(`- ${title} (${lang}):\n  ${href}`);
      }
    } finally {
      await rm(contentDir, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
