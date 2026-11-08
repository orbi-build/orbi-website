import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pricing from "../src/pricing.json";
import { handleFetch } from "../src/worker.js";
import { paidPriceReplacements } from "../src/pricing-tokens.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const SITE_PAGES_DIR = fileURLToPath(new URL("../site/pages/", import.meta.url));
const TOKEN = pricing.monthlyUsdToken;
const USD = String(pricing.cloudMonthlyUsd);
const SOLO_USD = String(pricing.soloMonthlyUsd);
const SOLO_ANNUAL_USD = String(pricing.soloAnnualUsd);
const PRO_ANNUAL_USD = String(pricing.proAnnualUsd);
const SOLO_ANNUAL_MONTHLY_USD = String(pricing.soloAnnualMonthlyUsd);
const PRO_ANNUAL_MONTHLY_USD = String(pricing.proAnnualMonthlyUsd);
const SOLO_ANNUAL_SAVINGS_PERCENT = String(pricing.soloAnnualSavingsPercent);
const PRO_ANNUAL_SAVINGS_PERCENT = String(pricing.proAnnualSavingsPercent);
const ANNUAL_SAVINGS_PERCENT = String(pricing.annualSavingsPercent);
const FOUNDING_PARTNER_LIMIT = String(pricing.foundingPartnerLimit);
const FOUNDING_PARTNER_REMAINING = String(pricing.foundingPartnerRemaining);
const FOUNDING_PROMO_CODE = pricing.foundingPromoCode;
const FREE_DELIVERIES = String(pricing.freeDeliveries);
const FREE_DELIVERIES_TOKEN = pricing.freeDeliveriesToken;
const FREE_TRIAL_TOKEN = pricing.freeTrialCopyToken;
const MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE = pricing.measuredSmallRepositoryDeliveryRange;
const MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE_TOKEN = pricing.measuredSmallRepositoryDeliveryRangeToken;
const MEASURED_SOLO_REPOSITORY_DELIVERY_RANGE = pricing.measuredSoloRepositoryDeliveryRange;
const MEASURED_SOLO_REPOSITORY_DELIVERY_RANGE_TOKEN = pricing.measuredSoloRepositoryDeliveryRangeToken;
const MEASURED_LARGE_CODEBASE_DELIVERIES = String(pricing.measuredLargeCodebaseDeliveries);
const MEASURED_LARGE_CODEBASE_DELIVERIES_TOKEN = pricing.measuredLargeCodebaseDeliveriesToken;
const MEASURED_SOLO_LARGE_CODEBASE_DELIVERIES = String(pricing.measuredSoloLargeCodebaseDeliveries);
const MEASURED_SOLO_LARGE_CODEBASE_DELIVERIES_TOKEN = pricing.measuredSoloLargeCodebaseDeliveriesToken;
const MEASURED_SNAPSHOT_DELIVERIES = String(pricing.measuredSnapshotDeliveries);
const MEASURED_SNAPSHOT_DELIVERIES_TOKEN = pricing.measuredSnapshotDeliveriesToken;

// The pages whose price mentions the Issue pins (originally 12 across the two
// cloud pages; #99 added the homepage card and the cost tables since). Every
// carrier that shows the monthly price must ship the token, not a literal.
const PRICE_PAGES = [
  "index.html",
  "zh/index.html",
  "cloud/index.html",
  "zh/cloud/index.html",
  "cost/index.html",
  "zh/cost/index.html",
];

// Issue #138: the included token quota rides the same seam. The same six
// pages carry every quota mention, so the token-page set is identical.
const TOKENS = pricing.includedTokensToken;
const TOKENS_LABEL = String(pricing.includedTokensLabel);
const SOLO_TOKENS_LABEL = String(pricing.soloIncludedTokensLabel);
const TOKEN_PAGES = PRICE_PAGES;
const CLOUD_PAGES = ["cloud/index.html", "zh/cloud/index.html"];

// An included-quota literal: a round token count sitting next to the word
// "token" ("2B tokens", "2 billion tokens", "1.2B tokens", "20 亿 token" —
// the exact forms the 2B-vs-3 亿 drift of website#137 shipped). Two kinds of
// number+token text stay allowed:
//   - measured usage figures, written as decimal M ("mean 4.74M tokens per
//     delivery", "max observed, 37.6M tokens"): a drift quota is round, so
//     the M-unit branch only matches integers (the lookbehind keeps a
//     decimal fraction's tail like ".74M" from matching);
//   - measured figures without a unit word ("2,220,637 tokens").
// The overage unit price ("$0.10 per 1M tokens") is deliberately NOT exempted:
// since website#137 the plan promises no per-token overage billing, so that
// form must trip the gate if it ever ships again.
function quotaLiterals(html) {
  return [...html.matchAll(
    /(?<![\d.])(\d+(?:\.\d+)?)\s*(?:billion|b|亿)\s*tokens?|(?<![\d.])(\d+)\s*m\s*tokens?/gi,
  )].map((match) => ({ literal: match[0], index: match.index }));
}

// "$79" as OUR monthly price, not as a substring of another figure ($790,
// $7,900) or of unrelated content (hex tokens, Anthropic's $15 on the
// managed-agents page). A digit or comma right after the value disqualifies.
// The JSON-LD carrier states the price without a currency sign, so its
// `"price": "…"` form counts too.
function literalPrice(value) {
  return new RegExp(`\\$${value}(?![\\d,])|"(?:price|highPrice)":\\s*"${value}"`, "g");
}

// A "$79" without the US prefix: the cost tables used to write the monthly
// price that way while every other carrier wrote "US$79" (Issue #102), and
// the fork made any text-based price check misfire. One prefix site-wide,
// and it is the one the meta/JSON-LD carriers already use.
function barePrice(value) {
  return new RegExp(`(?<!US)\\$${value}(?![\\d,])`, "g");
}

async function listHtmlFiles(dir = PUBLIC_DIR) {
  const files = await Promise.all(
    (await readdir(dir, { withFileTypes: true })).map(async (entry) => {
      const path = `${dir}${entry.name}`;
      if (entry.isDirectory()) return listHtmlFiles(`${path}/`);
      return entry.name.endsWith(".html") ? [path] : [];
    }),
  );
  return files.flat();
}

async function rawPage(relativePath) {
  return readFile(`${PUBLIC_DIR}${relativePath}`, "utf8");
}

// The real serving path: the shipped bytes go through handleFetch exactly as
// production serves them, with Cloud login configured (production and beta
// both do — the CTA rewrite stays off there).
function serve(raw, path) {
  return handleFetch(new Request(`https://orbi.build${path}`), {
    CLOUD_LOGIN_URL: "https://beta.orbi.build/api/login",
    ASSETS: {
      fetch: () =>
        Promise.resolve(
          new Response(raw, { headers: { "Content-Type": "text/html; charset=utf-8", Etag: '"asset-1"' } }),
        ),
    },
  });
}

describe("Cloud monthly price constant (Issue #102)", () => {
  it("ships every price occurrence as the token, never as a literal", async () => {
    // Issue #138 widened the scan to the sources: public/ is a build of
    // site/pages/, but the gate reads both trees so a literal is caught no
    // matter which one it was typed into.
    for (const dir of [SITE_PAGES_DIR, PUBLIC_DIR]) {
      for (const path of await listHtmlFiles(dir)) {
        // Comparison pages may contain verified competitor prices as
        // literals (Issue #540 retired the per-column guard tests).
        if (path.includes("/compare/")) continue;
        const raw = await readFile(path, "utf8");
        expect(raw.match(literalPrice(USD)), path).toBeNull();
        expect(raw.match(new RegExp(`"price":\\s*"${USD}"`)), path).toBeNull();
      }
    }
    for (const relativePath of PRICE_PAGES) {
      expect(await rawPage(relativePath), relativePath).toContain(TOKEN);
    }
  });

  it("serves the constant into every carrier through the real Worker path", async () => {
    for (const relativePath of PRICE_PAGES) {
      const response = await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`);
      const body = await response.text();
      expect(body, relativePath).not.toContain(TOKEN);
      expect(body.match(literalPrice(USD)), relativePath).not.toBeNull();
      // A rewritten body is a new representation: the asset file's validators
      // must not answer conditional requests for it.
      expect(response.headers.get("etag"), relativePath).toBeNull();
    }
  });

  it("shows one currency prefix for the monthly price on every served page", async () => {
    for (const path of await listHtmlFiles()) {
      const relativePath = path.slice(PUBLIC_DIR.length);
      const response = await serve(await readFile(path, "utf8"), `/${relativePath}`);
      const body = await response.text();
      expect(body.match(barePrice(USD)), relativePath).toBeNull();
    }
  });

  it("keeps the JSON-LD offers valid and priced at both plan constants", async () => {
    for (const relativePath of ["cloud/index.html", "zh/cloud/index.html"]) {
      const response = await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`);
      const body = await response.text();
      const scripts = [...body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => m[1]);
      expect(scripts.length, relativePath).toBeGreaterThan(0);
      const offers = scripts.flatMap((script) => {
        const data = JSON.parse(script); // throws if the substitution broke the structure
        return (data["@graph"] ?? [data]).filter((node) => node["@type"] === "AggregateOffer");
      });
      // Issue #1237: the offers publish the price the visitor pays (founding
      // 50% while places remain), never a list price the card contradicts.
      const paid = paidPriceReplacements(pricing);
      const paidSolo = paid[pricing.soloPaidMonthlyUsdToken];
      const paidPro = paid[pricing.proPaidMonthlyUsdToken];
      expect(offers, relativePath).toHaveLength(1);
      expect(offers[0].lowPrice, relativePath).toBe(paidSolo);
      expect(offers[0].highPrice, relativePath).toBe(paidPro);
      expect(offers[0].offers.map(({ price }) => price), relativePath).toEqual([paidSolo, paidPro]);
      expect(offers[0].description, relativePath).toContain(relativePath.startsWith("zh/") ? "永久 5 折" : "50% off forever");
      // website#145: the aggregate description is what search engines and LLMs
      // scrape — it must carry the rendered quota label, never the token or
      // a stale literal.
      expect(offers[0].description, relativePath).toContain(TOKENS_LABEL);
      expect(offers[0].description, relativePath).not.toContain(TOKENS);
    }
  });

});

// Issue #1216: the free allowance stopped being a per-page promise. One
// sentence, defined once in pricing.json, appears only in the two pricing notes
// and on the terms pages; no other product page states a delivery count.
// Blog articles under content/blog/ are dated writing, not product pages: the
// ticket's audit covered the 44 non-blog pages, and two articles explain the
// trial on purpose, so the scans below read the built non-blog pages.
describe("free trial copy (Issue #1216)", () => {
  const EN = `First ${FREE_DELIVERIES} merged pull requests free`;
  const ZH = `前 ${FREE_DELIVERIES} 个合并的 PR 免费`;
  const ALLOWED = {
    "index.html": { note: "pricing-summary-trial", copy: EN },
    "zh/index.html": { note: "pricing-summary-trial", copy: ZH },
    "cloud/index.html": { note: "pricing-trial-note", copy: EN },
    "zh/cloud/index.html": { note: "pricing-trial-note", copy: ZH },
    "terms/index.html": { copy: EN },
    "zh/terms/index.html": { copy: ZH },
  };
  const RETIRED = ["deliveries free", "3-delivery", "FREE_DELIVERY_ALLOWANCE", "免费试 3 次"];
  const isBlog = (path) => path.includes("/blog/");

  it("defines the sentence once, with the count filled from pricing.json", () => {
    expect(pricing.freeDeliveries).toBe(3);
    expect(pricing.freeTrialCopy.replace(FREE_DELIVERIES_TOKEN, FREE_DELIVERIES)).toBe(EN);
    expect(pricing.freeTrialCopyZh.replace(FREE_DELIVERIES_TOKEN, FREE_DELIVERIES)).toBe(ZH);
  });

  it("carries the sentence token exactly once on the pricing notes and terms pages, nowhere else", async () => {
    for (const dir of [SITE_PAGES_DIR, PUBLIC_DIR]) {
      for (const [relativePath, expected] of Object.entries(ALLOWED)) {
        const html = await readFile(`${dir}${relativePath}`, "utf8");
        expect(html.split(pricing.freeTrialCopyToken).length - 1, `${dir}${relativePath}: sentence token`).toBe(1);
        expect(html, `${dir}${relativePath}: no literal copy`).not.toContain(expected.copy);
      }
      const allowed = new Set(Object.keys(ALLOWED).map((relativePath) => `${dir}${relativePath}`));
      for (const path of await listHtmlFiles(dir)) {
        if (allowed.has(path) || isBlog(path)) continue;
        const html = await readFile(path, "utf8");
        expect(html, `${path}: sentence token`).not.toContain(pricing.freeTrialCopyToken);
        for (const copy of [EN, ZH]) expect(html, `${path}: ${copy}`).not.toContain(copy);
      }
    }
  });

  it("renders the one wording through the real Worker path, next to the pricing notes", async () => {
    for (const [relativePath, expected] of Object.entries(ALLOWED)) {
      const response = await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`);
      const body = await response.text();
      expect(body, relativePath).not.toContain(pricing.freeTrialCopyToken);
      expect(body, relativePath).not.toContain(FREE_DELIVERIES_TOKEN);
      expect(body.split(expected.copy).length - 1, `${relativePath}: sentence count`).toBe(1);
      if (expected.note) {
        const note = body.match(new RegExp(`<p class="${expected.note}">[\\s\\S]*?</p>`))?.[0] ?? "";
        expect(note, `${relativePath}: the sentence lives in the pricing note`).toContain(expected.copy);
      }
    }
  });

  // Acceptance 1: no delivery count next to the homepage and Cloud buttons.
  it("states no delivery count beside the homepage and Cloud CTAs", async () => {
    for (const relativePath of ["index.html", "zh/index.html", "cloud/index.html", "zh/cloud/index.html"]) {
      const body = await (await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`)).text();
      const note = body.match(/<p class="hero-cta-note">[\s\S]*?<\/p>/)?.[0] ?? "";
      expect(note, `${relativePath}: hero CTA note`).toBeTruthy();
      expect(note, `${relativePath}: hero CTA note`).not.toContain(FREE_DELIVERIES_TOKEN);
      expect(note, `${relativePath}: hero CTA note`).not.toMatch(/[0-9]/);
      const blocks = [
        note,
        ...(body.match(/<div class="pricing-card-actions">[\s\S]*?<\/div>/g) ?? []),
        ...(body.match(/<div class="cta-row">[\s\S]*?<\/div>/g) ?? []),
      ];
      for (const block of blocks) {
        expect(block, `${relativePath}: no count beside a CTA`).not.toContain(FREE_DELIVERIES_TOKEN);
        expect(block, `${relativePath}: no count beside a CTA`).not.toMatch(/[0-9]/);
      }
    }
  });

  it("ships none of the retired phrases on any built non-blog page or llms file", async () => {
    for (const path of await listHtmlFiles(PUBLIC_DIR)) {
      if (isBlog(path)) continue;
      const html = await readFile(path, "utf8");
      for (const phrase of RETIRED) expect(html, `${path}: ${phrase}`).not.toContain(phrase);
    }
    for (const name of ["llms.txt", "llms-full.txt"]) {
      const text = await readFile(`${PUBLIC_DIR}${name}`, "utf8");
      for (const phrase of RETIRED) expect(text, `${name}: ${phrase}`).not.toContain(phrase);
    }
  });
});

describe("Cloud pricing trial integration (Issue #742)", () => {
  const pricingPages = [
    ["cloud/index.html", { login: "/cloud/login" }],
    ["zh/cloud/index.html", { login: "/zh/cloud/login" }],
  ];

  // Issue #1212: the labels, the trial sentence and the "subscribe" wording
  // are copy. What the cards must carry is the structure the funnel depends
  // on: two cards, a trial action per paid tier pointing at the login
  // handoff, and interval-aware checkout links.
  it("renders two paid cards with integrated trial actions and interval-aware subscriptions", async () => {
    for (const [relativePath, expected] of pricingPages) {
      const html = await readFile(`${SITE_PAGES_DIR}${relativePath}`, "utf8");
      const pricing = html.match(/<section id="pricing"[\s\S]*?<\/section>\n\s*<section class="compare-section shell" aria-labelledby="cost-title">/)?.[0];
      expect(pricing, relativePath).toBeDefined();
      expect(pricing, relativePath).toContain(FREE_TRIAL_TOKEN);
      expect(pricing.match(/<article class="pricing-card/g), relativePath).toHaveLength(2);

      const cards = [...pricing.matchAll(/<article class="pricing-card[\s\S]*?<\/article>/g)].map(([card]) => card);
      expect(cards[0], relativePath).toContain("<h3>Solo</h3>");
      expect(cards[1], relativePath).toContain("<h3>Pro</h3>");
      expect(cards[0], relativePath).toContain(`data-cta="pricing-solo-trial" href="${expected.login}"`);
      expect(cards[1], relativePath).toContain(`data-cta="pricing-pro-trial" href="${expected.login}"`);
      // Issue #1237: the default interval is the one whose price the card
      // leads with — monthly, the founding price the visitor actually pays.
      expect(pricing, relativePath).toContain('data-pricing-subscribe="solo" data-cta="pricing-solo-month" href="/api/checkout?plan=solo"');
      expect(pricing, relativePath).toContain('data-pricing-subscribe="pro" data-cta="pricing-pro-month" href="/api/checkout?plan=pro"');
    }
  });
});

describe("Included tokens constant (Issue #138)", () => {
  // Cloud enforces this quota outside this repository, so the expected value
  // is manually pinned here. The website and Cloud must change it together;
  // if the enforced default changes, this assertion goes red and pricing.json
  // must move in the same change. The drift that shipped "2 billion" here
  // against the enforced 3 亿 value (website#137) is what this pin exists to
  // stop. The enforced default briefly rose from 300000000 to 2000000000 for
  // the US$79 / 2B pilot promise, then website#145 (2026-09-13) set Pro back
  // to 300000000. Issue #663 raises Pro to 1200000000 and Solo to 400000000;
  // the pin may lead the live enforced value until the corresponding external
  // change lands.
  it("matches the enforced monthly token quota", () => {
    expect(pricing.includedTokens).toBe(1200000000);
  });

  it("ships every quota occurrence as the token, never as a literal", async () => {
    for (const dir of [SITE_PAGES_DIR, PUBLIC_DIR]) {
      for (const path of await listHtmlFiles(dir)) {
        const raw = await readFile(path, "utf8");
        expect(quotaLiterals(raw), path).toEqual([]);
      }
    }
    for (const relativePath of TOKEN_PAGES) {
      expect(await rawPage(relativePath), relativePath).toContain(TOKENS);
    }
  });

  it("serves the label into every carrier through the real Worker path", async () => {
    for (const relativePath of TOKEN_PAGES) {
      const response = await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`);
      const body = await response.text();
      expect(body, relativePath).not.toContain(TOKENS);
      expect(body, relativePath).toContain(TOKENS_LABEL);
    }
  });

  it("catches the exact literals this gate exists for", () => {
    for (const sample of ["2B tokens", "2 billion tokens", "1.2B tokens", "20 亿 token", "12 亿 tokens"]) {
      expect(quotaLiterals(sample).length, sample).toBeGreaterThan(0);
    }
    // The measured stats are legitimate numbers, not quota carriers: the gate
    // must stay green on them.
    expect(quotaLiterals("超出部分按公开的 $0.10/100 万 token 计费")).toEqual([]);
    expect(quotaLiterals("the median delivery runs 2,220,637 tokens")).toEqual([]);
    expect(quotaLiterals("mean 4.74M tokens per delivery")).toEqual([]);
    expect(quotaLiterals("One delivery (max observed, 37.6M tokens)")).toEqual([]);
    // Since website#137 the plan promises no per-token overage billing, so the
    // old overage unit-price form must trip the gate too, not stay exempted.
    expect(quotaLiterals("$0.10 per 1M tokens").length, "per 1M").toBeGreaterThan(0);
    expect(quotaLiterals("$0.10 per additional 1M tokens").length, "per additional 1M").toBeGreaterThan(0);
    // The same scan keeps the monthly price literal banned.
    expect("US$79".match(literalPrice(USD)), "US$79").not.toBeNull();
    expect("$79".match(literalPrice(USD)), "$79").not.toBeNull();
  });
});

// Issue #147: the measured delivery stats are bare literals — the quota gate
// above deliberately exempts them — so the /cost/ extraction and mix checks
// below keep that detailed snapshot internally consistent. Issue #277 replaced
// /cloud/'s self-repository median and mean with the owner-approved customer
// range; the Cloud check pins that range and rejects the retired figures.
function measuredStats(html) {
  const row = (label) =>
    html.match(new RegExp(`<tr><th scope="row">(?:${label})</th><td>([\\d,]+)</td></tr>`))?.[1];
  return {
    measuredOn: html.match(/<strong>(\d{4}-\d{2}-\d{2})<\/strong>/)?.[1],
    n: html.match(/<strong>n=(\d+)/)?.[1],
    median: row("p50 \\(median\\)|p50[（(]中位[)）]"),
    mean: row("Mean|均值"),
    max: row("Max(?: observed)?|最大(?:观测)?"),
    mix: html.match(/(\d+(?:\.\d+)?)% (?:cache reads|cacheRead|缓存读取)[,、] ?(\d+(?:\.\d+)?)% (?:input|输入)[,、] ?(\d+(?:\.\d+)?)% (?:output|输出)/)?.slice(1),
  };
}

describe("Cloud delivery range stays consistent (Issue #277)", () => {
  const COST_PAGES = ["cost/index.html", "zh/cost/index.html"];

  it("extracts every metric from both cost pages, so the gate cannot pass vacuously", async () => {
    for (const dir of [PUBLIC_DIR, SITE_PAGES_DIR]) {
      for (const relativePath of COST_PAGES) {
        const stats = measuredStats(await readFile(`${dir}${relativePath}`, "utf8"));
        for (const [metric, value] of Object.entries(stats)) {
          expect(value, `${dir}${relativePath}: ${metric} not found`).toBeTruthy();
        }
      }
    }
  });

  it("uses only the measured source tokens on both Cloud pages", async () => {
    for (const dir of [PUBLIC_DIR, SITE_PAGES_DIR]) {
      for (const cloudPage of ["cloud/index.html", "zh/cloud/index.html"]) {
        const html = await readFile(`${dir}${cloudPage}`, "utf8");
        expect(html.split(MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE_TOKEN).length - 1).toBe(2);
        expect(html.split(MEASURED_LARGE_CODEBASE_DELIVERIES_TOKEN).length - 1).toBe(1);
      }
    }
  });

  it("serves the cost-page reconciliation from pricing.json", async () => {
    // Issue #1212: the reconciliation sentence is copy; the two derived
    // delivery counts and the pricing link are the contract.
    for (const costPage of ["cost/index.html", "zh/cost/index.html"]) {
      const raw = await readFile(`${PUBLIC_DIR}${costPage}`, "utf8");
      expect(raw).toContain(MEASURED_SNAPSHOT_DELIVERIES_TOKEN);
      expect(raw).toContain(MEASURED_LARGE_CODEBASE_DELIVERIES_TOKEN);
      const served = await (await serve(raw, `/${costPage.replace("index.html", "")}`)).text();
      expect(served).toContain(MEASURED_SNAPSHOT_DELIVERIES);
      expect(served).toContain(MEASURED_LARGE_CODEBASE_DELIVERIES);
      expect(served).toContain(`href="/${costPage.startsWith("zh/") ? "zh/" : ""}cloud/#pricing"`);
      expect(served).not.toContain(MEASURED_SNAPSHOT_DELIVERIES_TOKEN);
      expect(served).not.toContain(MEASURED_LARGE_CODEBASE_DELIVERIES_TOKEN);
    }
  });

  it("puts measured delivery ranges inside the paid pricing cards", async () => {
    // Issue #1212: the ranges, their cost-page door and the absence of a stale
    // allowance line are the contract; the words around them are copy.
    for (const cloudPage of ["cloud/index.html", "zh/cloud/index.html"]) {
      const raw = await readFile(`${PUBLIC_DIR}${cloudPage}`, "utf8");
      const served = await (await serve(raw, `/${cloudPage.replace("index.html", "")}`)).text();
      expect(served).toContain(MEASURED_SOLO_REPOSITORY_DELIVERY_RANGE);
      expect(served).toContain(MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE);
      expect(served).toContain(`href="/${cloudPage.startsWith("zh/") ? "zh/" : ""}cost/"`);
      expect(served, cloudPage + ": every pricing token resolved").not.toMatch(/__[A-Z_]+__/);
      expect(served).not.toContain(MEASURED_SOLO_LARGE_CODEBASE_DELIVERIES_TOKEN);
      expect(served).not.toContain(MEASURED_LARGE_CODEBASE_DELIVERIES_TOKEN);
      expect(served).toContain(FOUNDING_PROMO_CODE);
    }
  });

  it("sums the token mix to 100% on every cost page that states it", async () => {
    for (const dir of [PUBLIC_DIR, SITE_PAGES_DIR]) {
      for (const relativePath of COST_PAGES) {
        const { mix } = measuredStats(await readFile(`${dir}${relativePath}`, "utf8"));
        const [reads, input, output] = mix.map(Number);
        expect(reads + input + output, `${dir}${relativePath}: ${mix.join(" + ")}`).toBeCloseTo(100, 10);
      }
    }
  });

  it("re-derives the cost page's per-delivery dollar range from its own mean, mix, and list prices", async () => {
    for (const dir of [PUBLIC_DIR, SITE_PAGES_DIR]) {
      for (const costPage of COST_PAGES) {
        const costHtml = await readFile(`${dir}${costPage}`, "utf8");
        const perDeliverySection = costHtml.match(
          /<section class="compare-section compare-section-tint" aria-labelledby="money-title">([\s\S]*?)<\/section>/,
        )?.[1] ?? "";
        // Scope the old per-delivery calculation to its section: Issue #512
        // adds a newer merged-PR cost range before it on the same page.
        const [hit, miss, out] = [...perDeliverySection.matchAll(/<strong>\$([\d.]+)\/1M<\/strong>/g)]
          .slice(0, 3).map((m) => Number(m[1]));
        const { mean, mix } = measuredStats(costHtml);
        const [reads, input, output] = mix.map(Number);
        const per1M = (reads / 100) * hit + (input / 100) * miss + (output / 100) * out;
        const offPeak = (Number(mean.replaceAll(",", "")) / 1e6) * per1M;
        const cents = (usd) => Math.round(usd * 100) / 100;
        const stated = perDeliverySection.match(/\$([\d.]+)[–-]([\d.]+)/)?.slice(1, 3).map(Number);
        expect(stated, `${costPage} in ${dir}`).toEqual([cents(offPeak), cents(offPeak * 2)]);
      }
    }
  });
});

// Issue #146 / #874: llms.txt is the one claim file written for AI crawlers
// that has no site/pages/ source. It now ships the pricing tokens
// (text/plain is substituted by the Worker like text/html), so a drifted
// literal can never ship again — and these gates read both the tokens in the
// shipped bytes and the concrete values the Worker serves.
describe("llms.txt ships pricing tokens, never drifted literals (Issues #146, #874)", () => {
  const LLMS = PUBLIC_DIR + "llms.txt";
  const LLMS_FULL = PUBLIC_DIR + "llms-full.txt";

  it("prices every Cloud plan with pricing.json's token, never a literal", async () => {
    const raw = await readFile(LLMS, "utf8");
    for (const token of [pricing.soloMonthlyUsdToken, pricing.soloAnnualUsdToken, pricing.monthlyUsdToken, pricing.proAnnualUsdToken]) {
      expect(raw, "llms.txt should carry " + token).toContain(token);
    }
    expect([...raw.matchAll(/US\$\d+(?:\.\d+)?/g)], "llms.txt must carry no literal US$ price").toEqual([]);
    for (const value of [SOLO_USD, SOLO_ANNUAL_USD, USD, PRO_ANNUAL_USD]) {
      expect(raw.match(barePrice(value)), "bare $" + value + " without the US prefix").toBeNull();
    }
  });

  it("states both included quotas as tokens, never as a drifted literal", async () => {
    const raw = await readFile(LLMS, "utf8");
    for (const token of [pricing.soloIncludedTokensToken, pricing.includedTokensToken]) {
      expect(raw, "llms.txt should carry " + token).toContain(token);
    }
    expect(quotaLiterals(raw), "llms.txt must carry no quota literal").toEqual([]);
  });

  it("states the trial, founding places and repository counts as tokens in both llms files", async () => {
    for (const path of [LLMS, LLMS_FULL]) {
      const raw = await readFile(path, "utf8");
      for (const token of [
        pricing.freeTrialCopyToken, pricing.foundingPartnerLimitToken, pricing.foundingPartnerRemainingToken,
        pricing.soloRepositoriesToken, pricing.proRepositoriesToken,
      ]) expect(raw, path + ": " + token).toContain(token);
    }
  });
});

describe("Cloud paid-tier pricing (Issue #441)", () => {
  it("states both monthly quotas in Cloud metadata and the homepage pricing summary", async () => {
    // Issue #1212: the sentence around them is copy; the quota labels are the
    // claim. Metadata carries both plans' allowances, the homepage summary the
    // Solo one.
    const descriptionsOf = (body) => [...body.matchAll(/<meta (?:name|property)="(?:description|og:description|twitter:description)" content="([^"]*)"/g)]
      .map((match) => match[1]);
    for (const relativePath of CLOUD_PAGES) {
      const body = await (await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`)).text();
      const descriptions = descriptionsOf(body).join(" \n ");
      expect(descriptions, relativePath + ": Solo quota").toContain(SOLO_TOKENS_LABEL);
      expect(descriptions, relativePath + ": Pro quota").toContain(TOKENS_LABEL);
      const homePath = relativePath.startsWith("zh/") ? "zh/index.html" : "index.html";
      const home = await (await serve(await rawPage(homePath), `/${homePath.replace(/index\.html$/, "")}`)).text();
      expect(home, homePath).toContain(`${SOLO_TOKENS_LABEL} token`);
    }
  });

  it("publishes Solo and Pro as two structured offers", async () => {
    // Issue #1237: the offers publish what the visitor pays while founding
    // places remain, so the structured data cannot state a price the card
    // beside it contradicts.
    const paid = paidPriceReplacements(pricing);
    for (const relativePath of CLOUD_PAGES) {
      const body = await (await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`)).text();
      const data = JSON.parse(body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]);
      const offer = data["@graph"].find((entry) => entry["@id"]?.endsWith("#offer"));
      expect(offer["@type"], relativePath).toBe("AggregateOffer");
      expect(offer.offers.map(({ price }) => price), relativePath)
        .toEqual([paid[pricing.soloPaidMonthlyUsdToken], paid[pricing.proPaidMonthlyUsdToken]]);
      expect([offer.lowPrice, offer.highPrice], relativePath)
        .toEqual([paid[pricing.soloPaidMonthlyUsdToken], paid[pricing.proPaidMonthlyUsdToken]]);
    }
  });

  it("calculates annual monthly prices and savings from the plan prices", () => {
    expect(pricing.soloAnnualMonthlyUsd).toBe(Math.round(pricing.soloAnnualUsd / 12));
    expect(pricing.proAnnualMonthlyUsd).toBe(Math.round(pricing.proAnnualUsd / 12));
    expect(pricing.soloAnnualSavingsPercent).toBe(Math.round((1 - pricing.soloAnnualUsd / (pricing.soloMonthlyUsd * 12)) * 100));
    expect(pricing.proAnnualSavingsPercent).toBe(Math.round((1 - pricing.proAnnualUsd / (pricing.cloudMonthlyUsd * 12)) * 100));
    expect(pricing.annualSavingsPercent).toBe(Math.max(
      pricing.soloAnnualSavingsPercent,
      pricing.proAnnualSavingsPercent,
    ));
  });

  it("uses the annual monthly equivalent in both homepage summaries", async () => {
    for (const relativePath of ["index.html", "zh/index.html"]) {
      const body = await (await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`)).text();
      expect(body, relativePath).toContain(`US$${SOLO_ANNUAL_MONTHLY_USD}`);
      expect(body, relativePath).toContain(`US$${PRO_ANNUAL_MONTHLY_USD}`);
      expect(body, relativePath).toContain(`US$${SOLO_ANNUAL_USD}`);
      expect(body, relativePath).toContain(`US$${PRO_ANNUAL_USD}`);
    }
  });

  it("renders the founding banner before pricing cards with live slot counts", async () => {
    // Issue #1212: the banner's sentence is copy, its live values are not.
    for (const relativePath of CLOUD_PAGES) {
      const response = await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`);
      const body = await response.text();
      const banner = body.match(/<p class="founding-offer">([\s\S]*?)<\/p>/)?.[1] ?? "";
      expect(banner, relativePath + ": founding banner").toBeTruthy();
      for (const value of [FOUNDING_PARTNER_LIMIT, FOUNDING_PARTNER_REMAINING, FOUNDING_PROMO_CODE]) {
        expect(banner, relativePath + ": live founding value " + value).toContain(value);
      }
      expect(body.indexOf("founding-offer"), relativePath).toBeLessThan(body.indexOf("pricing-cards"));
    }
  });

  it("renders pricing.json values and checkout links on both Cloud pages", async () => {
    for (const relativePath of CLOUD_PAGES) {
      const response = await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`);
      const body = await response.text();
      expect(body, relativePath).toContain(`US$${SOLO_USD}`);
      expect(body, relativePath).toContain(`US$${SOLO_ANNUAL_USD}`);
      expect(body, relativePath).toContain(`US$${SOLO_ANNUAL_MONTHLY_USD}`);
      expect(body, relativePath).toContain(`US$${USD}`);
      expect(body, relativePath).toContain(`US$${PRO_ANNUAL_USD}`);
      expect(body, relativePath).toContain(`US$${PRO_ANNUAL_MONTHLY_USD}`);
      // Issue #1212: only the values are pinned; the sentence around them
      // ("Save 17%", "Billed yearly: …") is copy.
      for (const percent of [SOLO_ANNUAL_SAVINGS_PERCENT, PRO_ANNUAL_SAVINGS_PERCENT, ANNUAL_SAVINGS_PERCENT]) {
        expect(body, relativePath + ": savings " + percent + "%").toContain(`${percent}%`);
      }
      expect(body, relativePath).toContain(relativePath.startsWith("zh/") ? 'href="/zh/cloud/login"' : 'href="/cloud/login"');
      // Issue #1237: the subscription link starts on the interval the card
      // leads with, so the price the visitor read is the price they land on.
      expect(body, relativePath).toContain('href="/api/checkout?plan=solo"');
      expect(body, relativePath).toContain('href="/api/checkout?plan=pro"');
      expect(body.match(/href="\/api\/checkout[^"]*"/g), relativePath).toEqual([
        'href="/api/checkout?plan=solo"',
        'href="/api/checkout?plan=pro"',
        // Chinese buyers pay once with Alipay / WeChat Pay (Stripe offers no
        // subscriptions for either); orbi-cloud#1611 serves payment=once.
        'href="/api/checkout?plan=solo&amp;interval=month&amp;payment=once"',
        'href="/api/checkout?plan=solo&amp;interval=year&amp;payment=once"',
        'href="/api/checkout?plan=pro&amp;interval=month&amp;payment=once"',
        'href="/api/checkout?plan=pro&amp;interval=year&amp;payment=once"',
      ]);
      expect(body.match(/data-pricing-subscribe="solo"/g), relativePath).toHaveLength(1);
      expect(body.match(/data-pricing-subscribe="pro"/g), relativePath).toHaveLength(1);
      expect(body, relativePath).toContain('data-cta="pricing-solo-month"');
      expect(body, relativePath).toContain('data-cta="pricing-pro-month"');
    }
  });

  it("renders tier-specific repository limits in the visible FAQ and JSON-LD", async () => {
    // Issue #1212: the answer is copy, so the check follows the structure —
    // one FAQ answer states both repository limits, and those limits come
    // from pricing.json. The JSON-LD/visible-FAQ lockstep itself is asserted
    // once, for both Cloud pages, in tests/pages.test.js ("parses JSON-LD and
    // keeps FAQPage mainEntity in lockstep with the visible items").
    for (const relativePath of CLOUD_PAGES) {
      const body = await (await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`)).text();
      const answers = [...body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
        .flatMap((match) => {
          const data = JSON.parse(match[1]);
          return (data["@graph"] ?? [data])
            .filter((node) => node["@type"] === "FAQPage")
            .flatMap((node) => node.mainEntity ?? [])
            .map((question) => question.acceptedAnswer?.text ?? "");
        });
      expect(answers.length, relativePath).toBeGreaterThan(3);
      const limits = answers.filter((answer) => answer.includes(String(pricing.soloRepositories)) && answer.includes(String(pricing.proRepositories)));
      expect(limits.length, relativePath + ": one repository-limit answer").toBe(1);
    }
  });

  it("keeps every tier value tokenized in the source pages", async () => {
    for (const relativePath of CLOUD_PAGES) {
      const html = await readFile(`${SITE_PAGES_DIR}${relativePath}`, "utf8");
      for (const token of [
        pricing.soloMonthlyUsdToken,
        pricing.soloAnnualUsdToken,
        pricing.proAnnualUsdToken,
        pricing.soloAnnualMonthlyUsdToken,
        pricing.proAnnualMonthlyUsdToken,
        pricing.soloAnnualSavingsPercentToken,
        pricing.proAnnualSavingsPercentToken,
        pricing.annualSavingsPercentToken,
        pricing.soloIncludedTokensToken,
        pricing.soloRepositoriesToken,
        pricing.proRepositoriesToken,
        pricing.foundingPartnerLimitToken,
        pricing.foundingPartnerRemainingToken,
        pricing.foundingPromoCodeToken,
        pricing.measuredSoloRepositoryDeliveryRangeToken,
      ]) expect(html, relativePath).toContain(token);
    }
  });
});

// Issue #1237: while founding places remain the Cloud pages write the price
// the visitor actually pays first (the founding 50%) and strike the list
// price through beside it; once the places are gone the same tokens fall back
// to the list price and the struck element stays hidden.
describe("Cloud founding price (Issue #1237)", () => {
  const paid = paidPriceReplacements(pricing);
  const gone = paidPriceReplacements(pricing, 0);
  const PLANS = [
    {
      plan: "solo",
      paidMonthly: "soloPaidMonthlyUsdToken",
      paidYearly: "soloPaidAnnualMonthlyUsdToken",
      paidAnnual: "soloPaidAnnualUsdToken",
      listMonthly: SOLO_USD,
      listYearly: SOLO_ANNUAL_MONTHLY_USD,
      listAnnual: SOLO_ANNUAL_USD,
    },
    {
      plan: "pro",
      paidMonthly: "proPaidMonthlyUsdToken",
      paidYearly: "proPaidAnnualMonthlyUsdToken",
      paidAnnual: "proPaidAnnualUsdToken",
      listMonthly: USD,
      listYearly: PRO_ANNUAL_MONTHLY_USD,
      listAnnual: PRO_ANNUAL_USD,
    },
  ];

  it("derives the founding half price and its annual monthly equivalent", () => {
    expect(paid[pricing.soloPaidMonthlyUsdToken]).toBe("14.5");
    expect(paid[pricing.proPaidMonthlyUsdToken]).toBe("39.5");
    expect(paid[pricing.soloPaidAnnualUsdToken]).toBe("145");
    expect(paid[pricing.proPaidAnnualUsdToken]).toBe("395");
    expect(paid[pricing.soloPaidAnnualMonthlyUsdToken]).toBe("12");
    expect(paid[pricing.proPaidAnnualMonthlyUsdToken]).toBe("33");
    expect(paid[pricing.foundingPriceStateToken]).toBe('data-founding-price="on"');
  });

  it("falls back to the list price once the places are gone", () => {
    expect(gone[pricing.soloPaidMonthlyUsdToken]).toBe(SOLO_USD);
    expect(gone[pricing.proPaidMonthlyUsdToken]).toBe(USD);
    expect(gone[pricing.soloPaidAnnualUsdToken]).toBe(SOLO_ANNUAL_USD);
    expect(gone[pricing.proPaidAnnualUsdToken]).toBe(PRO_ANNUAL_USD);
    // The fallback must reproduce the pinned list prices, not a drifting copy.
    expect(gone[pricing.soloPaidAnnualMonthlyUsdToken]).toBe(SOLO_ANNUAL_MONTHLY_USD);
    expect(gone[pricing.proPaidAnnualMonthlyUsdToken]).toBe(PRO_ANNUAL_MONTHLY_USD);
    expect(gone[pricing.foundingPriceStateToken]).toBe('data-founding-price="off"');
  });

  it("writes the founding price first and the list price struck through on both Cloud pages", async () => {
    for (const relativePath of CLOUD_PAGES) {
      const body = await (await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`)).text();
      expect(body, relativePath + ": founding price state").toContain('data-founding-price="on"');
      for (const plan of PLANS) {
        // The first number the card carries is the founding price of the
        // default (monthly) interval, with the list price struck beside it.
        const price = body.match(new RegExp(`<span data-pricing-price="${plan.plan}"[^>]*>([^<]+)</span>`));
        expect(price?.[1], `${relativePath}: ${plan.plan} founding price`).toBe(`US$${paid[pricing[plan.paidMonthly]]}`);
        expect(price?.[0], `${relativePath}: ${plan.plan} monthly founding price`)
          .toContain(`data-month-price="US$${paid[pricing[plan.paidMonthly]]}"`);
        expect(price?.[0], `${relativePath}: ${plan.plan} yearly founding price`)
          .toContain(`data-year-price="US$${paid[pricing[plan.paidYearly]]}"`);
        const list = body.match(new RegExp(`<s data-pricing-list-price="${plan.plan}"[^>]*>([^<]+)</s>`));
        expect(list?.[1], `${relativePath}: ${plan.plan} struck list price`).toBe(`US$${plan.listMonthly}`);
        expect(list?.[0], `${relativePath}: ${plan.plan} monthly list price`)
          .toContain(`data-month-price="US$${plan.listMonthly}"`);
        expect(list?.[0], `${relativePath}: ${plan.plan} yearly list price`)
          .toContain(`data-year-price="US$${plan.listYearly}"`);
        const detail = body.match(new RegExp(`data-pricing-detail="${plan.plan}"[^>]*data-year-detail="([^"]*)"`));
        expect(detail?.[1], `${relativePath}: ${plan.plan} yearly detail`).toContain(`US$${paid[pricing[plan.paidAnnual]]}`);
        // The space belongs to the struck element: once the places are gone
        // the line must not keep a gap in front of the separator.
        expect(detail?.[1], `${relativePath}: ${plan.plan} yearly list price struck`)
          .toContain(`<s> US$${plan.listAnnual}</s>`);
      }
      const share = [...body.matchAll(/<meta (?:name|property)="(?:description|og:description|twitter:description)" content="([^"]*)"/g)]
        .map((match) => match[1])
        .filter((description) => description.includes("US$"));
      expect(share.length, relativePath + ": share descriptions carrying a price").toBe(2);
      for (const description of share) {
        expect(description, relativePath + ": share description founding Solo price")
          .toContain(`US$${paid[pricing.soloPaidMonthlyUsdToken]}`);
        expect(description, relativePath + ": share description founding Pro price")
          .toContain(`US$${paid[pricing.proPaidMonthlyUsdToken]}`);
      }
    }
  });

  it("writes only the list price once the founding places are gone", async () => {
    for (const relativePath of CLOUD_PAGES) {
      let html = await readFile(`${SITE_PAGES_DIR}${relativePath}`, "utf8");
      for (const [token, value] of Object.entries(gone)) html = html.replaceAll(token, value);
      expect(html, relativePath + ": founding price state").toContain('data-founding-price="off"');
      // No founding price survives on the card: the first number is the list
      // price alone, and the struck element carries the same amount.
      for (const plan of PLANS) {
        const price = html.match(new RegExp(`<span data-pricing-price="${plan.plan}"[^>]*>([^<]*)</span>`));
        expect(price?.[1], `${relativePath}: ${plan.plan} list price alone`).toBe(`US$${plan.listMonthly}`);
      }
    }
  });

  it("keeps the founding prices tokenized in the source pages", async () => {
    for (const relativePath of CLOUD_PAGES) {
      const html = await readFile(`${SITE_PAGES_DIR}${relativePath}`, "utf8");
      for (const name of ["soloPaidMonthlyUsdToken", "soloPaidAnnualUsdToken", "soloPaidAnnualMonthlyUsdToken", "proPaidMonthlyUsdToken", "proPaidAnnualUsdToken", "proPaidAnnualMonthlyUsdToken", "foundingPriceStateToken"]) {
        expect(html, relativePath + ": " + name).toContain(pricing[name]);
      }
      expect(html, relativePath + ": literal founding price").not.toMatch(/US\$(?:14\.5|39\.5|145|395)(?![\d.])/);
    }
  });
});

