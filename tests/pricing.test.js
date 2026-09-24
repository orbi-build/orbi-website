import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pricing from "../src/pricing.json";
import { handleFetch } from "../src/worker.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const SITE_PAGES_DIR = fileURLToPath(new URL("../site/pages/", import.meta.url));
const TOKEN = pricing.monthlyUsdToken;
const USD = String(pricing.cloudMonthlyUsd);
const SOLO_USD = String(pricing.soloMonthlyUsd);
const SOLO_ANNUAL_USD = String(pricing.soloAnnualUsd);
const PRO_ANNUAL_USD = String(pricing.proAnnualUsd);
const FREE_DELIVERIES = String(pricing.freeDeliveries);
const FREE_DELIVERIES_TOKEN = pricing.freeDeliveriesToken;
const MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE = pricing.measuredSmallRepositoryDeliveryRange;
const MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE_TOKEN = pricing.measuredSmallRepositoryDeliveryRangeToken;
const MEASURED_LARGE_CODEBASE_DELIVERIES = String(pricing.measuredLargeCodebaseDeliveries);
const MEASURED_LARGE_CODEBASE_DELIVERIES_TOKEN = pricing.measuredLargeCodebaseDeliveriesToken;
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
const TOKEN_PAGES = PRICE_PAGES;
const CLOUD_PAGES = ["cloud/index.html", "zh/cloud/index.html"];

// An included-quota literal: a round token count sitting next to the word
// "token" ("2B tokens", "2 billion tokens", "300M tokens", "20 亿 token" —
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
  return new RegExp(`\\$${value}(?![\\d,])|"price":\\s*"${value}"`, "g");
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

  it("keeps the JSON-LD Offer valid and priced at the constant", async () => {
    for (const relativePath of ["cloud/index.html", "zh/cloud/index.html"]) {
      const response = await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`);
      const body = await response.text();
      const scripts = [...body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => m[1]);
      expect(scripts.length, relativePath).toBeGreaterThan(0);
      const offers = scripts.flatMap((script) => {
        const data = JSON.parse(script); // throws if the substitution broke the structure
        return (data["@graph"] ?? [data]).filter((node) => node["@type"] === "Offer");
      });
      expect(offers, relativePath).toHaveLength(1);
      expect(offers[0].price, relativePath).toBe(USD);
      expect(offers[0].description, relativePath).toContain(relativePath.startsWith("zh/") ? "永久 5 折" : "50% off forever");
      // website#145: the Offer description is what search engines and LLMs
      // scrape — it must carry the rendered quota label, never the token or
      // a stale literal.
      expect(offers[0].description, relativePath).toContain(TOKENS_LABEL);
      expect(offers[0].description, relativePath).not.toContain(TOKENS);
    }
  });

  it("syncs every occurrence after a constant change", async () => {
    // A hypothetical new price applied through the same seam the Worker uses
    // (token -> value over the shipped bytes): every position that shows the
    // old value must move to the new one, with none left behind.
    const next = "123";
    for (const relativePath of PRICE_PAGES) {
      const raw = await rawPage(relativePath);
      const tokenCount = raw.split(TOKEN).length - 1;
      expect(tokenCount, relativePath).toBeGreaterThan(0);
      const repriced = raw.replaceAll(TOKEN, next);
      expect(repriced, relativePath).not.toContain(TOKEN);
      expect(repriced.match(literalPrice(USD)), relativePath).toBeNull();
      expect(repriced.match(literalPrice(next)), relativePath).toHaveLength(tokenCount);
    }
  });
});

describe("Free delivery allowance constant (Issue #274)", () => {
  const FREE_PAGES = ["index.html", "zh/index.html", "cloud/index.html", "zh/cloud/index.html"];

  it("keeps the allowance sourced from pricing.json and tokenized in every source", async () => {
    expect(pricing.freeDeliveries).toBe(3);
    for (const dir of [SITE_PAGES_DIR, PUBLIC_DIR]) {
      for (const relativePath of FREE_PAGES) {
        const html = await readFile(`${dir}${relativePath}`, "utf8");
        expect(html, `${dir}${relativePath}`).toContain(FREE_DELIVERIES_TOKEN);
      }
    }
  });

  it("serves the allowance through the real Worker path", async () => {
    for (const relativePath of FREE_PAGES) {
      const response = await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`);
      const body = await response.text();
      expect(body, relativePath).not.toContain(FREE_DELIVERIES_TOKEN);
      expect(body, relativePath).toContain(FREE_DELIVERIES);
    }
  });
});

describe("Included tokens constant (Issue #138)", () => {
  // Cloud enforces this quota outside this repository, so the expected value
  // is manually pinned here. The website and Cloud must change it together;
  // if the enforced default changes, this assertion goes red and pricing.json
  // must move in the same change. The drift that shipped "2 billion" here
  // against the enforced 3 亿 value (website#137) is what this pin exists to
  // stop. The pin has moved twice: the enforced default briefly rose from
  // 300000000 to 2000000000 for the US$79 / 2B pilot promise, and the
  // maintainer's quota ruling in website#145 (2026-09-13) set both tiers
  // back to 300000000 — the tiers differ in price, not quota. The pin may
  // lead the live enforced value until the corresponding external change
  // lands.
  it("matches the enforced monthly token quota", () => {
    expect(pricing.includedTokens).toBe(300000000);
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
    for (const sample of ["2B tokens", "2 billion tokens", "300M tokens", "20 亿 token", "3 亿 tokens"]) {
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
    expect(MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE_TOKEN)
      .not.toBe(MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE);
    expect(MEASURED_LARGE_CODEBASE_DELIVERIES_TOKEN).not.toBe(MEASURED_LARGE_CODEBASE_DELIVERIES);
    for (const dir of [PUBLIC_DIR, SITE_PAGES_DIR]) {
      for (const cloudPage of ["cloud/index.html", "zh/cloud/index.html"]) {
        const html = await readFile(`${dir}${cloudPage}`, "utf8");
        expect(html).not.toMatch(/85[–-]400/);
        expect(html.split(MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE_TOKEN).length - 1).toBe(2);
        expect(html.split(MEASURED_LARGE_CODEBASE_DELIVERIES_TOKEN).length - 1).toBe(2);
        expect(html).not.toMatch(/2,220,637|4,742,066|about 100 deliveries|100 次交付\/月/);
      }
    }
  });

  it("serves the cost-page reconciliation from pricing.json", async () => {
    expect(MEASURED_SNAPSHOT_DELIVERIES_TOKEN).not.toBe(MEASURED_SNAPSHOT_DELIVERIES);
    for (const [costPage, wording] of [
      ["cost/index.html", `works out to about ${MEASURED_SNAPSHOT_DELIVERIES} deliveries per ${TOKENS_LABEL} tokens. The Cloud pricing page uses about ${MEASURED_LARGE_CODEBASE_DELIVERIES} deliveries`],
      ["zh/cost/index.html", `折算约为 ${MEASURED_SNAPSHOT_DELIVERIES} 次 ${TOKENS_LABEL} token 交付。Cloud 定价页采用约 ${MEASURED_LARGE_CODEBASE_DELIVERIES} 次`],
    ]) {
      const raw = await readFile(`${PUBLIC_DIR}${costPage}`, "utf8");
      expect(raw).toContain(MEASURED_SNAPSHOT_DELIVERIES_TOKEN);
      expect(raw).toContain(MEASURED_LARGE_CODEBASE_DELIVERIES_TOKEN);
      const served = await (await serve(raw, `/${costPage.replace("index.html", "")}`)).text();
      expect(served).toContain(wording);
      expect(served).toContain(`href="/${costPage.startsWith("zh/") ? "zh/" : ""}cloud/#pricing"`);
      expect(served).not.toContain(MEASURED_SNAPSHOT_DELIVERIES_TOKEN);
      expect(served).not.toContain(MEASURED_LARGE_CODEBASE_DELIVERIES_TOKEN);
    }
  });

  it("keeps each Cloud measured-cost sentence to one colon", async () => {
    for (const cloudPage of ["cloud/index.html", "zh/cloud/index.html"]) {
      const html = await readFile(`${PUBLIC_DIR}${cloudPage}`, "utf8");
      const costSection = html.match(/<section[^>]+aria-labelledby="cost-title"[\s\S]*?<\/section>/)?.[0];
      expect(costSection, cloudPage).toBeTruthy();
      const lede = costSection.match(/<p class="section-lede">([\s\S]*?)<\/p>/)?.[1]
        .replace(/<[^>]+>/g, "");
      expect(lede, cloudPage).toBeTruthy();
      for (const sentence of lede.split(/[.!?。！？]/)) {
        expect((sentence.match(/[：:]/g) ?? []).length, `${cloudPage}: ${sentence}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("serves both Cloud pages with both source-backed measurements", async () => {
    for (const [cloudPage, wordings] of [
      ["cloud/index.html", [
        `Depending on ticket size: about ${MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE} merged deliveries for typical tickets in a small repository, about ${MEASURED_LARGE_CODEBASE_DELIVERIES} in a large codebase like Orbi's own engine (measured September 2026)`,
        `${MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE} merged deliveries for typical tickets in a small repository, or about ${MEASURED_LARGE_CODEBASE_DELIVERIES} in a large codebase like Orbi's own engine (measured September 2026)`,
      ]],
      ["zh/cloud/index.html", [
        `取决于票的大小：小仓库的常见票大约 ${MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE} 次合并交付，像 Orbi 引擎这样的大代码库大约 ${MEASURED_LARGE_CODEBASE_DELIVERIES} 次（2026 年 9 月实测）`,
        `小仓库的常见票合并 ${MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE} 次，像 Orbi 引擎这样的大代码库约 ${MEASURED_LARGE_CODEBASE_DELIVERIES} 次（2026 年 9 月实测）`,
      ]],
    ]) {
      const raw = await readFile(`${PUBLIC_DIR}${cloudPage}`, "utf8");
      const served = await (await serve(raw, `/${cloudPage.replace("index.html", "")}`)).text();
      expect(served).not.toMatch(/85[–-]400/);
      for (const wording of wordings) expect(served.split(wording).length - 1).toBe(1);
      expect(served).not.toContain(MEASURED_SMALL_REPOSITORY_DELIVERY_RANGE_TOKEN);
      expect(served).not.toContain(MEASURED_LARGE_CODEBASE_DELIVERIES_TOKEN);
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
        // The cost page publishes the deepseek-flash list prices as
        // hit/miss/output per 1M and states peak hours are exactly double.
        const [hit, miss, out] = [...costHtml.matchAll(/<strong>\$([\d.]+)\/1M<\/strong>/g)]
          .slice(0, 3).map((m) => Number(m[1]));
        const { mean, mix } = measuredStats(costHtml);
        const [reads, input, output] = mix.map(Number);
        const per1M = (reads / 100) * hit + (input / 100) * miss + (output / 100) * out;
        const offPeak = (Number(mean.replaceAll(",", "")) / 1e6) * per1M;
        const cents = (usd) => Math.round(usd * 100) / 100;
        const stated = costHtml.match(/\$([\d.]+)[–-]([\d.]+)/)?.slice(1, 3).map(Number);
        expect(stated, `${costPage} in ${dir}`).toEqual([cents(offPeak), cents(offPeak * 2)]);
      }
    }
  });
});

// Issue #146: llms.txt is the one claim file written for AI crawlers that has
// no site/pages/ source and no placeholder substitution (text/plain passes
// through the Worker untouched), and it told every LLM that Managed Cloud was
// "not available", "not yet purchasable", that no pricing structure should be
// attributed to Orbi — while /cloud/ sold a US$79 Offer. These gates read the
// shipped bytes so the file can never contradict the cloud pages again.
describe("llms.txt states Cloud accurately (Issue #146)", () => {
  const LLMS = `${PUBLIC_DIR}llms.txt`;

  it("never denies that Cloud is available or purchasable", async () => {
    const raw = await readFile(LLMS, "utf8");
    // Emphasis markers are flattened first: the historical sentence was
    // "explicitly *not* available", which a plain scan would miss.
    const plain = raw.replaceAll("*", "");
    const denials = [...plain.matchAll(
      /not\s+(?:yet\s+)?(?:publicly\s+)?(?:available|purchasable)|no\s+pricing\s+structure|billing\s+model\s+is\s+not\s+settled/gi,
    )].map((match) => match[0]);
    expect(denials, "llms.txt must not deny that Cloud ships or sells").toEqual([]);
  });

  it("prices Cloud exactly as pricing.json, never as a drifted literal", async () => {
    const raw = await readFile(LLMS, "utf8");
    // Every US$-prefixed figure in the file is the monthly price (measured
    // per-delivery costs keep the bare-$ form, so a drifted price cannot
    // hide among them), always with the site-wide US prefix.
    const usdLiterals = [...raw.matchAll(/US\$\d+(?:\.\d+)?/g)].map((match) => match[0]);
    expect(usdLiterals.length, "llms.txt should state the Cloud price").toBeGreaterThan(0);
    for (const literal of usdLiterals) {
      expect(literal, "llms.txt US$ literal").toBe(`US$${USD}`);
    }
    expect(raw.match(barePrice(USD)), "bare $79 without the US prefix").toBeNull();
  });

  it("states the included quota exactly as pricing.json, never as a drifted literal", async () => {
    const raw = await readFile(LLMS, "utf8");
    // The same quotaLiterals shape the pages gate uses; the measured
    // per-delivery figures stay exempt by that regex, so only the round
    // quota label is allowed to match.
    const quotas = quotaLiterals(raw);
    expect(quotas.length, "llms.txt should state the included quota").toBeGreaterThan(0);
    for (const quota of quotas) {
      expect(quota.literal, `llms.txt quota literal at ${quota.index}`).toBe(`${TOKENS_LABEL} tokens`);
    }
  });
});

describe("Three-tier Cloud pricing (Issue #441)", () => {
  it("renders pricing.json values and checkout links on both Cloud pages", async () => {
    for (const relativePath of CLOUD_PAGES) {
      const response = await serve(await rawPage(relativePath), `/${relativePath.replace(/index\.html$/, "")}`);
      const body = await response.text();
      expect(body, relativePath).toContain(`US$${SOLO_USD}`);
      expect(body, relativePath).toContain(`US$${SOLO_ANNUAL_USD}`);
      expect(body, relativePath).toContain(`US$${USD}`);
      expect(body, relativePath).toContain(`US$${PRO_ANNUAL_USD}`);
      expect(body, relativePath).toContain("/api/checkout?plan=solo");
      expect(body, relativePath).toContain("/api/checkout?plan=pro");
      expect(body, relativePath).toContain(relativePath.startsWith("zh/") ? "永久 5 折" : "50% off forever");
      expect(body, relativePath).not.toContain("Founding Partner");
      expect(body, relativePath).not.toContain("永久免费");
    }
  });

  it("keeps every tier value tokenized in the source pages", async () => {
    for (const relativePath of CLOUD_PAGES) {
      const html = await readFile(`${SITE_PAGES_DIR}${relativePath}`, "utf8");
      for (const token of [
        pricing.soloMonthlyUsdToken,
        pricing.soloAnnualUsdToken,
        pricing.proAnnualUsdToken,
        pricing.soloIncludedTokensToken,
        pricing.soloRepositoriesToken,
        pricing.proRepositoriesToken,
      ]) expect(html, relativePath).toContain(token);
    }
  });
});
