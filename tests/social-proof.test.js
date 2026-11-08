// Issue #226: the third-party social-proof section is data-driven. One record
// in site/data/social-proof.json per delivery or quote; the build renders the
// homepage's capped grid and the /evidence/ page's full grouped list from it.
// These tests drive the real buildPages entry point — with the seeded data and
// with scratch fixtures — never a re-implementation of the renderer.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPages } from "../scripts/build-pages.mjs";
import { selectHomeCards, validateSocialProof } from "../scripts/social-proof.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOCIAL_PROOF_JSON = join(ROOT, "site", "data", "social-proof.json");

let outDir;
const built = new Map(); // output path -> rendered HTML

// A record in the Issue's 10-key contract, with delivery fields filled.
const delivery = (repo, pr, merged_at, title, human_reviews = 0) => ({
  repo,
  pr,
  merged_at,
  human_reviews,
  title,
  quote: null,
  person: null,
  handle: null,
  person_url: null,
  consent: null,
});

const quote = (text, person, consent) => ({
  repo: null,
  pr: null,
  merged_at: null,
  human_reviews: null,
  title: null,
  quote: text,
  person,
  handle: `@${person.toLowerCase().replace(/\s+/g, "")}`,
  person_url: `https://x.com/${person.toLowerCase().replace(/\s+/g, "")}`,
  consent,
});

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), "orbi-social-proof-"));
  await buildPages(outDir);
  for (const output of ["index.html", "zh/index.html", "evidence/index.html", "zh/evidence/index.html"]) {
    built.set(output, await readFile(join(outDir, output), "utf8"));
  }
});

afterAll(async () => {
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

const cardsOf = (html) => [...html.matchAll(/<article class="proof-card[^"]*">/g)].map((m) => m[0]);
const sectionOf = (html, id) => {
  const start = html.indexOf(`<section class="social-proof shell" id="${id}"`);
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
};

describe("social-proof consent gate (Issue #226)", () => {
  const withFixture = async (records, run) => {
    const dir = await mkdtemp(join(tmpdir(), "orbi-social-fix-"));
    const path = join(dir, "social-proof.json");
    const out = join(dir, "out");
    await writeFile(path, JSON.stringify(records, null, 2));
    try {
      return await run(path, out);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };

  it("fails the build with the person's name on a quote without consent", async () => {
    await withFixture([quote("great tool", "Jane Roe", null)], async (path, out) =>
      expect(buildPages(out, { socialProofPath: path })).rejects.toThrow(/Jane Roe/),
    );
  });

  it("treats an empty-string consent as missing", async () => {
    await withFixture([quote("great tool", "Jane Roe", "")], async (path, out) =>
      expect(buildPages(out, { socialProofPath: path })).rejects.toThrow(/Jane Roe/),
    );
  });

  it("passes on the seeded data", () => {
    expect(built.get("index.html")).toContain("Tommy Xiao");
  });

  it("contains both xiaods/k8e deliveries in the source data", async () => {
    const records = JSON.parse(await readFile(SOCIAL_PROOF_JSON, "utf8"));
    expect(records.filter(({ repo, pr }) => repo === "xiaods/k8e" && [613, 615].includes(pr))).toEqual([
      expect.objectContaining({ repo: "xiaods/k8e", pr: 615, merged_at: "2026-09-21T12:01:21Z", human_reviews: 2 }),
      expect.objectContaining({ repo: "xiaods/k8e", pr: 613, merged_at: "2026-09-20T14:13:00Z", human_reviews: 2 }),
    ]);
  });

  it("fails on a record that is neither a delivery nor a quote, so no record silently vanishes", async () => {
    const orphan = { repo: null, pr: null, merged_at: "2026-09-18T00:00:00Z", human_reviews: 0, title: "orphan", quote: null, person: null, handle: null, person_url: null, consent: null };
    await withFixture([orphan], async (path, out) =>
      expect(buildPages(out, { socialProofPath: path })).rejects.toThrow(/neither a delivery.+nor a quote/),
    );
  });
});

describe("homepage social-proof section (Issue #226)", () => {
  it("sits directly after #orbi-stats, still inside the dark .night band", () => {
    for (const output of ["index.html", "zh/index.html"]) {
      const html = built.get(output);
      const stats = html.indexOf('id="orbi-stats"');
      const social = html.indexOf('<section class="social-proof shell" id="social-proof"');
      expect(social, `${output}: social-proof section missing`).toBeGreaterThan(-1);
      const between = html.slice(html.indexOf("</section>", stats), social);
      expect(between, `${output}: a section or the .night close sits between the stats section and the social-proof section`)
        .not.toMatch(/<\/div>|<section/);
    }
  });

  // Issue #1243: the five deliveries the homepage shows are the newest
  // external merges, each one in a different public repository, all merged
  // between 2026-10-02 and 2026-10-12 (the newest records in
  // site/data/social-proof.json as of 2026-11-08).
  it("renders one quote card and the five seeded deliveries, quotes first, newest first", () => {
    const html = built.get("index.html");
    const section = sectionOf(html, "social-proof");
    expect(cardsOf(section)).toHaveLength(6);
    expect(section.match(/class="proof-card proof-card-quote"/g)).toHaveLength(1);
    const order = [
      section.indexOf("Tommy Xiao"),
      section.indexOf("k8e/pull/630"),
      section.indexOf("Soncle-music/pull/22"),
      section.indexOf("safehearts/pull/2"),
      section.indexOf("Tianshu-harness/pull/6"),
      section.indexOf("my-ai-team-docs/pull/464"),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((at) => at > -1)).toBe(true);
  });

  it("links every homepage delivery card to its public PR record", () => {
    for (const output of ["index.html", "zh/index.html"]) {
      const section = sectionOf(built.get(output), "social-proof");
      // Issue #1243: a quoted third-party PR title is a reference, not a
      // heading of this page — it must stay out of the h1–h6 outline the
      // homepage SEO heading gate counts.
      expect(section, `${output}: a quoted PR title is a heading`).not.toMatch(/<h[1-6][^>]*class="proof-card-title"/);
      const hrefs = [...section.matchAll(/<p class="proof-card-title"><a class="orbi-proof-card-title-a" href="([^"]+)"/g)].map((m) => m[1]);
      expect(hrefs).toEqual([
        "https://github.com/xiaods/k8e/pull/630",
        "https://github.com/minuda2009/Soncle-music/pull/22",
        "https://github.com/toondji-ix/safehearts/pull/2",
        "https://github.com/zzuu080603/Tianshu-harness/pull/6",
        "https://github.com/SHUKE-LABS/my-ai-team-docs/pull/464",
      ]);
    }
  });

  it("keeps the Tommy Xiao quote and its link to his X account", () => {
    const section = sectionOf(built.get("index.html"), "social-proof");
    expect(section).toContain("orbi 全自动控制流程还是很棒的，继续保持");
    expect(section).toContain('class="proof-card-handle" href="https://x.com/xds2000"');
  });

  it("shows the merge date and preserves the no-human-review lines", () => {
    const section = sectionOf(built.get("index.html"), "social-proof");
    // None of the five seeded merges carries a human review: five markers.
    expect(section.match(/class="proof-card-review">no human review<\/p>/g)).toHaveLength(5);
    expect(section).toContain('<time datetime="2026-10-12T08:39:25Z">2026-10-12</time>');
    expect(section).toContain('<time datetime="2026-10-02T04:21:18Z">2026-10-02</time>');
  });

  it("carries the computed count line linking /evidence/#third-party", () => {
    const section = sectionOf(built.get("index.html"), "social-proof");
    expect(section).toContain('href="/evidence/#third-party"');
    expect(section).toContain("10 deliveries in other people's repositories");
  });

  it("mirrors the same structure on the zh homepage with zh copy", () => {
    const section = sectionOf(built.get("zh/index.html"), "social-proof");
    expect(cardsOf(section)).toHaveLength(6);
    expect(section.match(/class="proof-card proof-card-quote"/g)).toHaveLength(1);
    expect(section).toContain('href="/zh/evidence/#third-party"');
    expect(section).toContain("他人仓库中已有 10 次交付");
    expect(section).toContain("无人类 review");
    // Same data, same markup: the EN and ZH sections carry the same links.
    const count = (html) => sectionOf(html, "social-proof").match(/<a /g).length;
    expect(count(built.get("zh/index.html"))).toBe(count(built.get("index.html")));
  });

  it("keeps the quote card free of a PR line (the quote has no repository)", () => {
    const section = sectionOf(built.get("index.html"), "social-proof");
    const card = section.slice(section.indexOf('class="proof-card proof-card-quote"'), section.indexOf("</article>", section.indexOf("Tommy Xiao")));
    expect(card).not.toContain("github.com");
  });

  it("keeps the older records off the homepage but on /evidence/", () => {
    for (const output of ["index.html", "zh/index.html"]) {
      const section = sectionOf(built.get(output), "social-proof");
      expect(section).not.toContain("k8e/pull/613");
      expect(section).not.toContain("k8e/pull/615");
      expect(section).not.toContain("mat-site/pull/16");
    }
    for (const output of ["evidence/index.html", "zh/evidence/index.html"]) {
      expect(built.get(output)).toContain("https://github.com/xiaods/k8e/pull/613");
      expect(built.get(output)).toContain("https://github.com/xiaods/k8e/pull/615");
      expect(built.get(output)).toContain("https://github.com/SHUKE-LABS/mat-site/pull/16");
    }
  });
});

describe("/evidence/ #third-party section (Issue #226)", () => {
  it("follows the #records section and lists every record grouped by repository", () => {
    for (const output of ["evidence/index.html", "zh/evidence/index.html"]) {
      const html = built.get(output);
      const records = html.indexOf('id="records"');
      const third = html.indexOf('<section class="social-proof shell" id="third-party"');
      expect(third, `${output}: #third-party missing`).toBeGreaterThan(records);
      const section = sectionOf(html, "third-party");
      expect(cardsOf(section)).toHaveLength(11);
      expect(section).toContain("https://github.com/xiaods/k8e/pull/613");
      expect(section).toContain("https://github.com/xiaods/k8e/pull/615");
      expect(section).toContain("https://github.com/minuda2009/Soncle-music/pull/22");
    }
  });

  it("groups the deliveries by repository, newest repository first", () => {
    const section = sectionOf(built.get("evidence/index.html"), "third-party");
    const groups = [...section.matchAll(/<h3 class="social-proof-group-title">([\s\S]*?)<\/h3>/g)].map((m) => m[1]);
    // Six repositories, ordered by each repository's newest merge, then quotes.
    expect(groups).toEqual([
      "xiaods/k8e",
      "minuda2009/Soncle-music",
      "toondji-ix/safehearts",
      "zzuu080603/Tianshu-harness",
      "SHUKE-LABS/my-ai-team-docs",
      "SHUKE-LABS/mat-site",
      "Quotes",
    ]);
    const matGroup = section.slice(section.indexOf(groups[5]), section.indexOf("Quotes</h3>", section.indexOf(groups[5])));
    expect(cardsOf(matGroup)).toHaveLength(2);
    const k8eGroup = section.slice(section.indexOf(groups[0]), section.indexOf(groups[1]));
    expect(cardsOf(k8eGroup)).toHaveLength(3); // 630 (new), 615, 613
  });

  it("keeps the quotes group last with the quote card", () => {
    const section = sectionOf(built.get("evidence/index.html"), "third-party");
    const quotesAt = section.indexOf("Quotes</h3>");
    expect(quotesAt).toBeGreaterThan(-1);
    expect(section.indexOf("Tommy Xiao")).toBeGreaterThan(quotesAt);
  });

  it("mirrors the same structure on the zh evidence page", () => {
    const count = (output) => sectionOf(built.get(output), "third-party").match(/<a /g).length;
    expect(count("zh/evidence/index.html")).toBe(count("evidence/index.html"));
    expect(built.get("zh/evidence/index.html")).toContain("用户引述");
  });
});

// Issue #232: the repository name is evidence of whose repository delivered,
// but the repository homepage is the other project's storefront — the section
// links only the public PR records, never a repo root. Our own repositories
// live outside these sections, so the root-href scan is scoped to them.
describe("third-party repository name is plain text (Issue #232)", () => {
  it("renders no href to a github.com/<owner>/<repo> root and keeps the repo name visible", () => {
    for (const [output, id] of [
      ["index.html", "social-proof"],
      ["zh/index.html", "social-proof"],
      ["evidence/index.html", "third-party"],
      ["zh/evidence/index.html", "third-party"],
    ]) {
      const section = sectionOf(built.get(output), id);
      // A root has exactly <owner>/<repo> after the host; a PR link carries
      // /pull/N and must not match.
      expect(section, `${output}: a repository homepage is still linked`).not.toMatch(
        /href="https:\/\/github\.com\/[^/"]+\/[^/"]+"/,
      );
      expect(section, `${output}: the k8e repository name vanished from the cards`).toContain(
        '<p class="proof-card-repo">xiaods/k8e</p>',
      );
      // The homepage shows the newest records only; the full list, mat-site
      // included, lives on /evidence/.
      const otherRepo = id === "third-party" ? "SHUKE-LABS/mat-site" : "minuda2009/Soncle-music";
      expect(section, `${output}: the ${otherRepo} repository name vanished from the cards`).toContain(
        `<p class="proof-card-repo">${otherRepo}</p>`,
      );
      if (id === "third-party") {
        expect(section, `${output}: the repository name vanished from the group title`).toContain(
          '<h3 class="social-proof-group-title">SHUKE-LABS/mat-site</h3>',
        );
      }
    }
  });
});

describe("caps: 6 cards, 2 quotes, 2 per repository (Issue #226 acceptance 3)", () => {
  // 9 records across 2 repositories: 4 + 3 deliveries plus 2 quotes. The
  // homepage must render 6 cards (2 quotes + 4 deliveries, at most 2 per
  // repository); the evidence page must list all 9.
  const fixture = [
    delivery("fixture-one/repo", 1, "2026-09-01T00:00:00Z", "one 1"),
    delivery("fixture-one/repo", 2, "2026-09-02T00:00:00Z", "one 2"),
    delivery("fixture-one/repo", 3, "2026-09-03T00:00:00Z", "one 3"),
    delivery("fixture-one/repo", 4, "2026-09-04T00:00:00Z", "one 4"),
    delivery("fixture-two/repo", 1, "2026-09-05T00:00:00Z", "two 1"),
    delivery("fixture-two/repo", 2, "2026-09-06T00:00:00Z", "two 2"),
    delivery("fixture-two/repo", 3, "2026-09-07T00:00:00Z", "two 3"),
    quote("quote one", "Quote One", "Telegram, 2026-09-09"),
    quote("quote two", "Quote Two", "Telegram, 2026-09-10"),
  ];

  let home;
  let evidence;

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbi-social-caps-"));
    const path = join(dir, "social-proof.json");
    const capsOut = join(dir, "out");
    await writeFile(path, JSON.stringify(fixture, null, 2));
    try {
      await buildPages(capsOut, { socialProofPath: path });
      home = await readFile(join(capsOut, "index.html"), "utf8");
      evidence = await readFile(join(capsOut, "evidence/index.html"), "utf8");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("renders exactly 6 homepage cards: 2 quotes + 4 deliveries, at most 2 per repository", () => {
    const section = sectionOf(home, "social-proof");
    expect(cardsOf(section)).toHaveLength(6);
    expect(section.match(/class="proof-card proof-card-quote"/g)).toHaveLength(2);
    expect(section.match(/fixture-one\/repo\/pull\//g)).toHaveLength(2);
    expect(section.match(/fixture-two\/repo\/pull\//g)).toHaveLength(2);
    // The per-repo cap skipped older records but the newest ones all show.
    expect(section).toContain("two 3");
    expect(section).not.toContain("one 1");
  });

  it("renders the count line from the full data, not the rendered cards", () => {
    expect(sectionOf(home, "social-proof")).toContain("7 deliveries in other people's repositories");
  });

  it("lists all 9 records on the evidence page", () => {
    const section = sectionOf(evidence, "third-party");
    expect(cardsOf(section)).toHaveLength(9);
    expect(section.match(/fixture-one\/repo\/pull\//g)).toHaveLength(4);
    expect(section.match(/fixture-two\/repo\/pull\//g)).toHaveLength(3);
    expect(section.match(/class="proof-card proof-card-quote"/g)).toHaveLength(2);
  });

  it("changes only the rendered output: no site/pages source mentions the fixture", async () => {
    // Walked via the same pages the build produced: no page source was edited
    // to render fixture data (Issue #226 acceptance 2).
    const { loadPages } = await import("../scripts/build-pages.mjs");
    for (const page of await loadPages()) {
      const source = await readFile(join(ROOT, "site", "pages", page.source), "utf8");
      expect(source, `${page.source}: page sources are data-free`).not.toContain("fixture-one");
    }
  });
});

describe("social-proof selection helper", () => {
  it("keeps at most 2 quotes and fills the remaining slots with capped deliveries", () => {
    const records = [
      delivery("a/repo", 1, "2026-09-01T00:00:00Z", "a1"),
      delivery("a/repo", 2, "2026-09-02T00:00:00Z", "a2"),
      delivery("a/repo", 3, "2026-09-03T00:00:00Z", "a3"),
      quote("q1", "Q One", "Telegram, 2026-09-04"),
      quote("q2", "Q Two", "Telegram, 2026-09-05"),
      quote("q3", "Q Three", "Telegram, 2026-09-06"),
    ];
    const { quotes, deliveries } = selectHomeCards(records);
    expect(quotes.map((r) => r.person)).toEqual(["Q Three", "Q Two"]);
    expect(deliveries.map((r) => r.title)).toEqual(["a3", "a2"]);
  });
});

describe("validator rejects malformed records", () => {
  it("names the source file in every error", () => {
    expect(() => validateSocialProof([quote("q", "P", null)], "scratch.json")).toThrow(/scratch\.json/);
  });
});
