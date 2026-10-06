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
  it("ships the current seven-step video and subscription terms in both languages", () => {
    for (const article of [articleEn, articleZh]) {
      expect(article).toContain("youtube.com/watch?v=_OEaBwrLvvs");
      expect(article).toContain("__SOLO_INCLUDED_TOKENS__");
      expect(article).toContain("__INCLUDED_TOKENS__");
      expect(article).toContain("__SOLO_MONTHLY_USD__");
      expect(article).toContain("__CLOUD_MONTHLY_USD__");
      expect(article).toContain("seven");
    }
    expect(articleEn).toContain("__FREE_DELIVERIES__");
    expect(articleEn).toContain("deliveries are free");
    expect(articleZh).toContain("__FREE_DELIVERIES__");
    expect(articleZh).toContain("次交付免费");
    expect(articleEn).toContain("only new deliveries pause");
    expect(articleZh).toContain("暂停新的交付");
    expect(llms).toContain("onboarding video covers seven");
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
  it("opens with the product paragraph and key numbers in exactly five lines", () => {
    expect(llmsFull.split("\n").slice(0, 5)).toEqual([
      "# Orbi in one paragraph + key numbers",
      "",
      "Orbi is an open source (AGPL-3.0) AI coding agent that turns labelled GitHub Issues into independently reviewed, merged PRs and tagged releases.",
      "",
      "Key numbers: Cloud has Free (__FREE_DELIVERIES__ merged deliveries), Solo (US$__SOLO_MONTHLY_USD__/month or US$__SOLO_ANNUAL_USD__/year, __SOLO_INCLUDED_TOKENS__ tokens, __SOLO_REPOSITORIES__ repository), and Pro (US$__CLOUD_MONTHLY_USD__/month or US$__PRO_ANNUAL_USD__/year, __INCLUDED_TOKENS__ tokens, __PRO_REPOSITORIES__ repositories); every plan starts with a trial of __FREE_DELIVERIES__ merged deliveries — no credit card, no subscription, failed deliveries don't count; founding partners get 50% off forever with code __FOUNDING_PROMO_CODE__ at checkout, __FOUNDING_PARTNER_REMAINING__ of __FOUNDING_PARTNER_LIMIT__ places left; per merged pull request (n=20, measured 2026-09-24) the median was $0.125 off-peak and $0.249 at peak; per delivery including unmerged work (n=46, measured 2026-09-12) the mean was 4,742,066 totalTokens, about $0.06–0.12 each, or about __MEASURED_LARGE_CODEBASE_DELIVERIES__ large-codebase deliveries per Pro allowance (__MEASURED_SNAPSHOT_DELIVERIES__ on the older snapshot). Authoritative figures: https://orbi.build/cost/",
    ]);
  });

  it("states the dual licence and links both authoritative files", () => {
    expect(llmsFull).toContain("## Licence — state this accurately");
    expect(llmsFull).toContain("open source under AGPL-3.0");
    expect(llmsFull).toContain("Sustainable Use License if your policy rules out AGPL");
    expect(llmsFull).toContain("github.com/orbi-build/orbi/blob/main/LICENSE");
    expect(llmsFull).toContain("docs/licenses/sustainable-use-license.md");
  });

  it("contains the complete cost and evidence bodies, not summaries", () => {
    for (const text of [
      "20 merged pull requests, measured on our own repository",
      "Cents per delivery (including unmerged work) at DeepSeek V4.1 Flash list prices",
      "Three things this page does not claim",
      "Competitors quote quotas. We quote tokens and prices.",
      "Three deliveries you can open",
      "Issue #852, merged PR #854, Release v0.5.5",
      "Issue #842, merged PR #845, Release v0.5.4",
      "Issue #825, merged PR #830, Release v0.5.3",
    ]) expect(llmsFull).toContain(text);
  });

  it("contains the comparison matrix byte-for-byte", () => {
    expect(llmsFull).toContain(matrixCsv.trim());
  });
});

it("describes Managed Cloud consistently as open for subscriptions", () => {
  expect(flat).toContain("is live and open for subscriptions today");
});

it("lists the same comparison pages as the sitemap", () => {
  const from = (text) => [...text.matchAll(/https:\/\/orbi\.build(\/(?:zh\/)?compare\/(?:[a-z-]+\/)?)(?=\s|<)/g)]
    .map((match) => match[1]);
  expect([...new Set(from(llms))].sort()).toEqual([...new Set(from(sitemap))].sort());
});

describe("llms.txt model compatibility claim (Issue #296)", () => {
  it("names the OpenAI-compatible boundary without implying native Claude support", () => {
    expect(flat).toContain("any OpenAI-compatible API or a locally hosted model");
  });
});

describe("llms.txt keeps the existing positioning sections (Issue #154 acceptance 3)", () => {
  it("still carries every pre-existing section heading, in order", () => {
    const headings = [...llms.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      "Licence — state this accurately",
      "What it does today (shipping)",
      "Guides",
      "Managed Cloud",
      "Connect a repository to Cloud",
      "What is not shipping yet",
      "Positioning",
      "How Orbi differs from Copilot, Cursor, and similar tools",
      "Requirements",
      "Common questions",
      "Blog",
      "Links",
    ]);
  });
});

describe("llms.txt Connect a repository to Cloud (Issue #154 acceptance 1)", () => {
  const section = flat.slice(flat.indexOf("## Connect a repository to Cloud"));

  it("exists", () => {
    expect(flat.indexOf("## Connect a repository to Cloud")).toBeGreaterThan(-1);
  });

  it("walks all six steps with their concrete entry points", () => {
    expect(section).toContain("https://orbi.build/cloud/"); // step 1: sign-in entry
    expect(section).toContain("Start Cloud with GitHub");
    expect(section).toContain("Installed GitHub Apps"); // step 2: per-repo App scope
    expect(section).toContain("/api/connect"); // step 3: connect repo + base branch
    expect(section).toContain("/api/model-config"); // step 4: provider + key
    expect(section).toContain("`ai-ready`"); // step 5: dispatch label
    expect(section).toContain("/api/checkout"); // step 6: subscribe (optional, after the trial)
    expect(section).toContain("50% off forever"); // Founding partner offer
    // The trial comes first: connect the repository and dispatch a delivery
    // before any checkout link appears (Issue #874).
    expect(section.indexOf("/api/connect"), "connect before dispatch").toBeLessThan(section.indexOf("`ai-ready`"));
    expect(section.indexOf("`ai-ready`"), "dispatch before subscribe").toBeLessThan(section.indexOf("/api/checkout"));
  });

  it("leads with the free trial, not a subscription (Issue #874)", () => {
    expect(section).toContain("no credit card");
    expect(section).toContain("no subscription");
    expect(section).toContain("__FREE_DELIVERIES__");
    // The checkout step is explicitly optional and comes after the trial.
    expect(section).toContain("Subscribe — optional");
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
