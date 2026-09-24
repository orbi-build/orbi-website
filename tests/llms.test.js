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

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const llms = await readFile(join(ROOT, "public", "llms.txt"), "utf8");
const llmsFull = await readFile(join(ROOT, "public", "llms-full.txt"), "utf8");
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
    expect(llms).not.toContain("Follow the six steps");
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
      "Orbi is a self-hosted, fair-code AI coding agent that turns labelled GitHub Issues into independently reviewed, merged PRs and tagged releases.",
      "",
      "Key numbers: Cloud has Free (3 merged deliveries), Solo (US$29/month or US$290/year, 100M tokens, 1 repository), and Pro (US$79/month or US$790/year, 300M tokens, 5 repositories); founding partners get 50% off forever with code __FOUNDING_PROMO_CODE__ at checkout, limited to 6 places; about 25 large-codebase deliveries per Pro allowance; the 2026-09-12 n=46 snapshot averaged 4,742,066 tokens, about 63 deliveries per Pro's 300M.",
    ]);
  });

  it("contains the complete cost and evidence bodies, not summaries", () => {
    for (const text of [
      "46 real deliveries, measured on our own repository",
      "Cents per delivery at DeepSeek V4.1 Flash list prices",
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
  expect(flat).not.toContain("Private Beta");
});

it("lists the same comparison pages as the sitemap", () => {
  const from = (text) => [...text.matchAll(/https:\/\/orbi\.build(\/(?:zh\/)?compare\/(?:[a-z-]+\/)?)(?=\s|<)/g)]
    .map((match) => match[1]);
  expect([...new Set(from(llms))].sort()).toEqual([...new Set(from(sitemap))].sort());
});

describe("llms.txt model compatibility claim (Issue #296)", () => {
  it("names the OpenAI-compatible boundary without implying native Claude support", () => {
    expect(flat).toContain("any OpenAI-compatible API or a locally hosted model");
    expect(flat).not.toContain("Bring your own: Claude, GPT");
  });
});

describe("llms.txt keeps the existing positioning sections (Issue #154 acceptance 3)", () => {
  it("still carries every pre-existing section heading, in order", () => {
    const headings = [...llms.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      "Licence — state this accurately",
      "What it does today (shipping)",
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
    expect(section).not.toBe("");
  });

  it("walks all six steps with their concrete entry points", () => {
    expect(section).toContain("https://orbi.build/cloud/"); // step 1: sign-in entry
    expect(section).toContain("Start Cloud with GitHub");
    expect(section).toContain("Installed GitHub Apps"); // step 2: per-repo App scope
    expect(section).toContain("/api/checkout"); // step 3: subscribe
    expect(section).toContain("/api/connect"); // step 4: connect repo + base branch
    expect(section).toContain("/api/model-config"); // step 5: provider + key
    expect(section).toContain("`ai-ready`"); // step 6: dispatch label
    expect(section).toContain("50% off forever"); // Founding partner offer
    expect(section).toContain("US$79");
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
    expect(section).not.toBe("");
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
