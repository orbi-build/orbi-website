// Issue #106 gates: the shipped pages stay in lockstep with their sources,
// and the two language trees cannot silently drift apart again.
//
// These tests read the shipped bytes in public/ — the same files the Worker
// deploys — not a fixture, so any hand edit to public/ that skips
// `npm run build` fails here (the old failure mode this issue closes).

import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPages, pathToHref } from "../scripts/build-pages.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let builtDir;
let pages;
let shipped; // output path -> bytes of public/<path>

beforeAll(async () => {
  // A real build through the real entry point, never a re-implementation.
  builtDir = await mkdtemp(join(tmpdir(), "orbi-pages-"));
  execFileSync("node", [join(ROOT, "scripts", "build-pages.mjs"), "--out", builtDir], {
    timeout: 60_000,
  });
  pages = await loadPages();
  shipped = new Map();
  for (const page of pages) {
    shipped.set(page.output, await readFile(join(ROOT, "public", page.output), "utf8"));
  }
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
    const built = await listFiles(builtDir);
    // The build owns the HTML; public/ also carries assets (styles.css, img/,
    // sitemap.xml, …) that no page source generates.
    const committed = (await listFiles(join(ROOT, "public"))).filter((f) => f.endsWith(".html"));
    expect(built).toEqual(committed);
  });

  it("reproduces every committed page byte-for-byte", async () => {
    const drifted = [];
    for (const page of pages) {
      const built = await readFile(join(builtDir, page.output), "utf8");
      if (built !== shipped.get(page.output)) drifted.push(page.output);
    }
    expect(
      drifted,
      `public/ disagrees with site/ — run npm run build after editing site/** (drifted: ${drifted.join(", ")})`,
    ).toEqual([]);
  });

  it("leaves no build markers or unfilled slots in shipped pages", () => {
    for (const [, html] of shipped) {
      expect(html).not.toContain("<!--@nav-->");
      expect(html).not.toContain("<!--@footer-->");
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

  it("carries the 10-item footer nav on all 26 content pages", () => {
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
        `${anchor}#faq`,
        "https://github.com/orbi-build/orbi/releases",
        `${anchor}#direction`,
        "https://github.com/orbi-build/orbi/milestones",
        pathToHref(page.mirror),
      ]);
    }
  });

  it("carries the 8 compare deep dives, in the right language tree", () => {
    for (const page of content()) {
      const footer = footerRegion(shipped.get(page.output));
      const deep = region(footer, '<nav class="footer-compare"', "</nav>");
      const hrefs = [...deep.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
      expect(hrefs, `${page.output}: deep-dive links drifted`).toHaveLength(8);
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
    for (const page of pages.filter((p) => p.mirror)) {
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
      if (page.standalone) {
        // apply.html is a noindex conversion endpoint, not an indexable page.
        expect(canonical).toBe("https://orbi.build/apply");
        continue;
      }
      expect(canonical, `${page.output}: canonical drifted`).toBe(
        `https://orbi.build${pathToHref(page.output)}`,
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

  const heroCtaBlock = (output) => {
    const hero = region(shipped.get(output), '<section class="compare-hero', "</section>");
    return hero.match(/<div class="hero-primary">([\s\S]*?)<\/div>/)?.[1] ?? "";
  };

  it("carries the handoff warning directly under the hero CTA on both languages", () => {
    for (const [output, expected] of Object.entries(microcopyExpectations)) {
      const block = heroCtaBlock(output);
      const button = block.indexOf('href="/cloud/login"');
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
      expect(items.length, `${output}: need 5–6 buyer questions`).toBeGreaterThanOrEqual(5);
      expect(items.length, `${output}: need 5–6 buyer questions`).toBeLessThanOrEqual(6);
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

// Issue #170: the primary-nav CTA is Start Cloud by default in the shared
// partial. Walking every built index.html (not a hardcoded page list) is the
// recurrence gate: a new page that forgets the Cloud login destination fails
// here instead of silently shipping Apply.
describe("nav CTA is Cloud login on every content page (Issue #170)", () => {
  it("defaults the shared partial to Cloud login, not Apply", async () => {
    const partial = await readFile(join(ROOT, "site", "partials", "nav.html"), "utf8");
    expect(partial).toContain('href="/cloud/login"');
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
    const outputs = await listIndex(builtDir);
    expect(outputs.length, "need at least the five funnel pages").toBeGreaterThanOrEqual(5);
    for (const output of outputs) {
      const html = await readFile(join(builtDir, output), "utf8");
      const nav = navRegion(html);
      const cta = nav.match(/<a class="nav-apply" href="([^"]+)">([^<]*)<\/a>/);
      expect(cta, `${output}: missing the primary-nav CTA`).toBeTruthy();
      expect(cta[1], `${output}: nav CTA must be the Cloud login handoff`).toBe("/cloud/login");
      expect(cta[1], `${output}: nav CTA must not be the Apply form`).not.toBe("/apply");
      const label = output.startsWith("zh/") ? "开始 Cloud" : "Start Cloud";
      expect(cta[2], `${output}: nav CTA label`).toBe(label);
    }
  });

  it("keeps /apply as a 200 conversion page, not a nav destination", async () => {
    const apply = shipped.get("apply.html");
    expect(apply, "public/apply.html must still ship").toBeTruthy();
    expect(apply).toContain('<link rel="canonical" href="https://orbi.build/apply">');
    expect(apply).not.toContain('data-primary-nav');
  });
});
