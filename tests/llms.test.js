// Issue #154: llms.txt must carry an agent-executable "Connect a repository
// to Cloud" section — an agent that reads only this file can connect a repo
// to Cloud without human help. These assertions pin the executable anchors
// (the six steps with per-step done-checks), the measured failure diagnoses
// (quoted as the literal on-screen strings the agent must pattern-match),
// and the existing positioning sections the issue forbids breaking. They
// read the shipped bytes in public/ — the same file the Worker deploys.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderLlms } from "../scripts/build-pages.mjs";
import { handleFetch } from "../src/worker.js";
import pricing from "../src/pricing.json";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const llms = await readFile(join(ROOT, "public", "llms.txt"), "utf8");
const llmsFull = await readFile(join(ROOT, "public", "llms-full.txt"), "utf8");
const guidesData = JSON.parse(await readFile(join(ROOT, "site", "data", "guides.json"), "utf8"));

// The real serving path for the llms text assets (Issue #874 acceptance 3):
// the Worker replaces the pricing tokens for text/plain exactly as it does
// for text/html.
function serveText(raw, path) {
  return handleFetch(new Request("https://orbi.build" + path), {
    CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login",
    ASSETS: {
      fetch: () => Promise.resolve(new Response(raw, { headers: { "Content-Type": "text/plain; charset=utf-8" } })),
    },
  });
}
const matrixCsv = await readFile(join(ROOT, "public", "compare", "matrix.csv"), "utf8");
const sitemap = await readFile(join(ROOT, "public", "sitemap.xml"), "utf8");
const articleEn = await readFile(join(ROOT, "public", "blog", "watch-the-six-steps", "index.html"), "utf8");
const articleZh = await readFile(join(ROOT, "public", "zh", "blog", "watch-the-six-steps", "index.html"), "utf8");
// The file is hard-wrapped at ~78 columns; prose assertions below match
// against a whitespace-collapsed copy so a line break never hides a phrase.
const flat = llms.replace(/\s+/g, " ");

describe("watch-the-six-steps article (Issue #329)", () => {
  it("ships the current video and the pricing placeholders in both languages", () => {
    // Issue #1212: the video id and the pricing placeholders are the contract
    // (a stale video or a drifted price is the failure both lines catch); the
    // article's own sentences are the editors' to rewrite.
    for (const article of [articleEn, articleZh]) {
      expect(article).toContain("youtube.com/watch?v=_OEaBwrLvvs");
      expect(article).toContain("__SOLO_INCLUDED_TOKENS__");
      expect(article).toContain("__INCLUDED_TOKENS__");
      expect(article).toContain("__SOLO_MONTHLY_USD__");
      expect(article).toContain("__CLOUD_MONTHLY_USD__");
      expect(article).toContain("__FREE_DELIVERIES__");
    }
  });
});

describe("seven-step article media parity (Issue #335)", () => {
  it("renders one step image for each numbered step in both languages", () => {
    for (const [language, article] of [["English", articleEn], ["Chinese", articleZh]]) {
      const imageCount = (article.match(/<img[^>]+src=\"\/img\/step-[1-7]-/g) ?? []).length;
      const stepCount = (article.match(/(?:Step [1-7]:|第 [1-7] 步：)/g) ?? []).length;
      expect(imageCount, `${language} step image count`).toBe(7);
      expect(stepCount, `${language} numbered step count`).toBe(7);
      expect(imageCount).toBe(stepCount);
    }
  });
});

describe("llms-full.txt content asset (Issue #438)", () => {
  it("opens with a heading, one product paragraph and the key-numbers line", () => {
    // Issue #1212: the shape is the contract — a heading, one paragraph, then
    // one line carrying every pricing placeholder. The words themselves are
    // the editors' to rewrite.
    const lines = llmsFull.split("\n");
    expect(lines[0].startsWith("# "), "first line is a heading").toBe(true);
    expect(lines[1]).toBe("");
    expect(lines[2].trim().length, "one product paragraph").toBeGreaterThan(0);
    expect(lines[3]).toBe("");
    expect(lines[4].startsWith("Key numbers: "), "key-numbers line").toBe(true);
    for (const token of [
      pricing.freeDeliveriesToken, pricing.soloMonthlyUsdToken, pricing.soloAnnualUsdToken,
      pricing.monthlyUsdToken, pricing.proAnnualUsdToken, pricing.soloIncludedTokensToken,
      pricing.includedTokensToken, pricing.soloRepositoriesToken, pricing.proRepositoriesToken,
      pricing.foundingPartnerLimitToken, pricing.foundingPartnerRemainingToken,
      pricing.foundingPromoCodeToken,
    ]) expect(lines[4], token).toContain(token);
  });

  it("states the dual licence and links both authoritative files", () => {
    const licence = llmsFull.slice(llmsFull.indexOf("## Licence"));
    expect(licence).toContain("AGPL-3.0");
    expect(licence).toContain("Sustainable Use License");
    expect(licence).toContain("github.com/orbi-build/orbi/blob/main/LICENSE");
    expect(licence).toContain("docs/licenses/sustainable-use-license.md");
  });

  // Issue #1212: the "not summaries" contract is structural — every section
  // carries a body, and the asset is longer than the summary file. What those
  // bodies say is copy.
  it("carries complete section bodies, not summaries", () => {
    const sections = llmsFull.split(/^## /m).slice(1);
    expect(sections.length, "the full asset keeps its sections").toBeGreaterThanOrEqual(4);
    for (const section of sections) {
      expect(section.length, section.split("\n")[0]).toBeGreaterThan(200);
    }
    expect(llmsFull.length).toBeGreaterThan(llms.length);
  });

  it("contains the comparison matrix byte-for-byte", () => {
    expect(llmsFull).toContain(matrixCsv.trim());
  });
});

it("lists the same comparison pages as the sitemap", () => {
  const from = (text) => [...text.matchAll(/https:\/\/orbi\.build(\/(?:zh\/)?compare\/(?:[a-z-]+\/)?)(?=\s|<)/g)]
    .map((match) => match[1]);
  expect([...new Set(from(llms))].sort()).toEqual([...new Set(from(sitemap))].sort());
});

describe("llms.txt keeps the existing positioning sections (Issue #154 acceptance 3)", () => {
  it("ships exactly the section headings its source declares, in source order", async () => {
    // Issue #1212: the pinned heading titles went away — editing a heading is
    // not a contract break. What the build must not do is drop, reorder or
    // invent a section: the shipped H2 list equals site/llms.txt's own, which
    // the generated lists (Blog, Guides) are inserted into.
    const source = await readFile(join(ROOT, "site", "llms.txt"), "utf8");
    const headingsOf = (text) => [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    const sourceHeadings = headingsOf(source);
    expect(headingsOf(llms)).toEqual(sourceHeadings);
    expect(new Set(sourceHeadings).size, "section headings are unique").toBe(sourceHeadings.length);
    expect(sourceHeadings.length, "the positioning sections are still there").toBeGreaterThanOrEqual(12);
  });
});

describe("llms.txt Connect a repository to Cloud (Issue #154 acceptance 1)", () => {
  const section = flat.slice(flat.indexOf("## Connect a repository to Cloud"));

  it("exists", () => {
    expect(flat.indexOf("## Connect a repository to Cloud")).toBeGreaterThan(-1);
  });

  it("walks all six steps with their concrete entry points", () => {
    expect(section).toContain("https://orbi.build/cloud/"); // step 1: sign-in entry
    expect(section).toContain("Installed GitHub Apps"); // step 2: per-repo App scope
    expect(section).toContain("/api/connect"); // step 3: connect repo + base branch
    expect(section).toContain("/api/model-config"); // step 4: provider + key
    expect(section).toContain("`ai-ready`"); // step 5: dispatch label
    expect(section).toContain("/api/checkout"); // step 6: subscribe (optional, after the trial)
    // The trial comes first: connect the repository and dispatch a delivery
    // before any checkout link appears (Issue #874).
    expect(section.indexOf("/api/connect"), "connect before dispatch").toBeLessThan(section.indexOf("`ai-ready`"));
    expect(section.indexOf("`ai-ready`"), "dispatch before subscribe").toBeLessThan(section.indexOf("/api/checkout"));
  });

  it("leads with the free trial, not a subscription (Issue #874)", () => {
    // Issue #1212: the trial-before-checkout order is the contract; the
    // sentence that states it is copy.
    expect(section).toContain("__FREE_DELIVERIES__");
    expect(section.indexOf("__FREE_DELIVERIES__"), "trial before checkout").toBeLessThan(section.indexOf("/api/checkout"));
  });

  it("gives every step an explicit done-check (the issue's per-step completion bar)", () => {
    const doneMarkers = [...section.matchAll(/Done: /g)].length;
    expect(doneMarkers).toBeGreaterThanOrEqual(6);
  });

  it("gives every step an explicit if-not recovery pointer", () => {
    const ifNotMarkers = [...section.matchAll(/If not: /g)].length;
    expect(ifNotMarkers).toBeGreaterThanOrEqual(6);
  });
});

describe("llms.txt failure diagnosis (Issue #154 acceptance 2)", () => {
  const section = flat.slice(flat.indexOf("### Failure diagnosis"));

  it("exists", () => {
    expect(flat.indexOf("### Failure diagnosis")).toBeGreaterThan(-1);
  });

  it("diagnoses the empty repository dropdown as a GitHub App authorization gap", () => {
    expect(section).toContain("dropdown is empty or lacks the target repository");
    expect(section).toContain("Repository access");
    // The literal on-screen sentinel the agent must pattern-match.
    expect(section).toContain("「— 手动填写 —」");
  });

  it("diagnoses the missing-model-source state with its literal status text", () => {
    expect(section).toContain("「仓库已连接，还差模型来源」");
    expect(section).toContain("/api/model-config");
  });

  it("diagnoses a stuck provisioning state with its literal status text", () => {
    expect(section).toContain("「正在开通」");
    expect(section).toContain("「开通失败」");
  });
});

// Issue #874: the Guides list is generated from site/data/guides.json by
// renderLlms, exactly like the Blog list is generated from content/blog —
// adding a guide never needs a second hand edit, and a source that loses the
// marker fails the build instead of shipping a stale list.
describe("llms.txt Guides section is generated (Issue #874)", () => {
  it("lists every guide from guides.json, English and Chinese, with title and summary", async () => {
    const source = await readFile(join(ROOT, "site", "llms.txt"), "utf8");
    const out = renderLlms(source, [], guidesData.guides);
    for (const guide of guidesData.guides) {
      for (const lang of ["en", "zh"]) {
        const copy = guide[lang];
        const language = lang === "zh" ? "Chinese" : "English";
        const href = "https://orbi.build" + (lang === "zh" ? "/zh" : "") + "/guides/" + guide.slug + "/";
        expect(out, guide.slug + " " + lang + " title").toContain("- " + copy.title + " (" + language + "):");
        expect(out, guide.slug + " " + lang + " url").toContain(href);
        expect(out, guide.slug + " " + lang + " summary").toContain(copy.summary);
      }
    }
  });

  it("ships the generated list in public/llms.txt and no marker", () => {
    const start = llms.indexOf("## Guides");
    const end = llms.indexOf("## Managed Cloud");
    expect(start, "Guides section missing").toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = llms.slice(start, end);
    for (const guide of guidesData.guides) {
      expect(section, guide.slug + " en").toContain("https://orbi.build/guides/" + guide.slug + "/");
      expect(section, guide.slug + " zh").toContain("https://orbi.build/zh/guides/" + guide.slug + "/");
      expect(section, guide.slug + " summary").toContain(guide.en.summary);
    }
    expect(llms).not.toContain("<!--@llms-guides-->");
  });

  it("keeps the hand-written prose in the source, with the marker and no hand-listed guides", async () => {
    const source = await readFile(join(ROOT, "site", "llms.txt"), "utf8");
    const section = source.slice(source.indexOf("## Guides"), source.indexOf("## Managed Cloud"));
    expect(section, "site/llms.txt: guides index link missing").toContain("https://orbi.build/guides/");
    expect(section, "site/llms.txt: zh guides index link missing").toContain("https://orbi.build/zh/guides/");
    expect(section, "site/llms.txt: missing the <!--@llms-guides--> marker").toContain("<!--@llms-guides-->");
    expect([...section.matchAll(/^- /gm)], "site/llms.txt must not hand-list guides").toEqual([]);
  });

  it("fails the build when the source lost the Guides marker", async () => {
    const source = (await readFile(join(ROOT, "site", "llms.txt"), "utf8")).replace("<!--@llms-guides-->", "");
    expect(() => renderLlms(source, [], guidesData.guides))
      .toThrow(/site\/llms\.txt[\s\S]*<!--@llms-guides-->/);
  });

  it("does not repeat the guide links in the Links section", () => {
    const links = llms.slice(llms.indexOf("## Links"));
    expect(links).not.toContain("/guides/ci-gates/");
    expect(links).not.toContain("/guides/auto-merge-ai-prs/");
    expect(links).not.toContain("/guides/issue-to-release/");
  });
});

// Issue #874: the pricing values an agent reads must be tokens in the source
// (filled by the Worker) and concrete values in the served bytes.
describe("llms pricing tokens (Issue #874)", () => {
  it("carries the pricing tokens in the Managed Cloud section of public/llms.txt", () => {
    const section = llms.slice(llms.indexOf("## Managed Cloud"), llms.indexOf("## Connect a repository to Cloud"));
    for (const token of [
      pricing.soloMonthlyUsdToken, pricing.soloAnnualUsdToken, pricing.monthlyUsdToken, pricing.proAnnualUsdToken,
      pricing.soloIncludedTokensToken, pricing.includedTokensToken, pricing.soloRepositoriesToken, pricing.proRepositoriesToken,
      pricing.freeDeliveriesToken, pricing.foundingPartnerRemainingToken, pricing.foundingPartnerLimitToken,
    ]) expect(section, token).toContain(token);
  });

  it("carries the pricing tokens on llms-full.txt's key-numbers line", () => {
    const line = llmsFull.split("\n")[4];
    for (const token of [
      pricing.soloMonthlyUsdToken, pricing.soloAnnualUsdToken, pricing.monthlyUsdToken, pricing.proAnnualUsdToken,
      pricing.soloIncludedTokensToken, pricing.includedTokensToken, pricing.freeDeliveriesToken,
      pricing.foundingPartnerRemainingToken, pricing.foundingPartnerLimitToken,
    ]) expect(line, token).toContain(token);
  });

  it("serves /llms.txt with the concrete pricing.json values, not the tokens", async () => {
    const body = await (await serveText(llms, "/llms.txt")).text();
    expect(body).toContain("US$" + pricing.soloMonthlyUsd + "/month");
    expect(body).toContain("US$" + pricing.cloudMonthlyUsd + "/month");
    expect(body).toContain("US$" + pricing.soloAnnualUsd + "/year");
    expect(body).toContain("US$" + pricing.proAnnualUsd + "/year");
    expect(body).toContain(pricing.soloIncludedTokensLabel + " tokens");
    expect(body).toContain(pricing.includedTokensLabel + " tokens");
    expect(body).toContain(pricing.foundingPartnerRemaining + " of " + pricing.foundingPartnerLimit);
    expect(body).not.toMatch(/__[A-Z_]+__/);
  });

  it("serves /llms-full.txt with the concrete pricing.json values too", async () => {
    const body = await (await serveText(llmsFull, "/llms-full.txt")).text();
    const line = body.split("\n")[4];
    expect(line).toContain("US$" + pricing.soloMonthlyUsd + "/month");
    expect(line).toContain("US$" + pricing.cloudMonthlyUsd + "/month");
    expect(line).toContain(pricing.soloIncludedTokensLabel + " tokens");
    expect(line).toContain(pricing.includedTokensLabel + " tokens");
    expect(line).not.toMatch(/__[A-Z_]+__/);
  });
});

// Issue #886: llms.txt is the claim file AI crawlers read, so its cost numbers
// have to be the /cost/ headline — 169 merged deliveries at a median of $0.082 —
// and the retired 20-PR / $0.125 median must not return as the current figure.
describe("llms cost numbers match the /cost/ headline (Issue #886)", () => {
  it("states the 169-delivery median, p90 and peak caveat in both llms files", () => {
    for (const [name, raw] of [["llms.txt", llms], ["llms-full.txt", llmsFull]]) {
      const text = raw.replace(/\s+/g, " ");
      expect(text, name).toContain("169 merged deliveries");
      expect(text, `${name}: median`).toContain("$0.082");
      expect(text, `${name}: p90`).toContain("$0.22");
    }
  });

  it("keeps the retired $0.125 median out of the cost claim itself", () => {
    const keyNumbers = llmsFull.split("\n").slice(0, 6).join(" ");
    expect(keyNumbers, "llms-full key numbers").not.toContain("$0.125");
    const costSection = llms.slice(llms.indexOf("**What does it cost?**"), llms.indexOf("## Blog"));
    expect(costSection, "llms.txt cost answer").not.toContain("$0.125");
    expect(costSection, "llms.txt cost answer").toContain("$0.082");
  });
});
