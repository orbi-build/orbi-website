import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pricing from "../src/pricing.json";

const pricingReplacements = {
  [pricing.freeDeliveriesToken]: String(pricing.freeDeliveries),
  [pricing.monthlyUsdToken]: String(pricing.cloudMonthlyUsd),
  [pricing.soloMonthlyUsdToken]: String(pricing.soloMonthlyUsd),
  [pricing.soloAnnualUsdToken]: String(pricing.soloAnnualUsd),
  [pricing.proAnnualUsdToken]: String(pricing.proAnnualUsd),
  [pricing.soloAnnualMonthlyUsdToken]: String(pricing.soloAnnualMonthlyUsd),
  [pricing.proAnnualMonthlyUsdToken]: String(pricing.proAnnualMonthlyUsd),
  [pricing.soloAnnualSavingsPercentToken]: String(pricing.soloAnnualSavingsPercent),
  [pricing.proAnnualSavingsPercentToken]: String(pricing.proAnnualSavingsPercent),
  [pricing.annualSavingsPercentToken]: String(pricing.annualSavingsPercent),
  [pricing.soloIncludedTokensToken]: String(pricing.soloIncludedTokensLabel),
  [pricing.soloRepositoriesToken]: String(pricing.soloRepositories),
  [pricing.proRepositoriesToken]: String(pricing.proRepositories),
  [pricing.foundingPartnerLimitToken]: String(pricing.foundingPartnerLimit),
  [pricing.foundingPromoCodeToken]: pricing.foundingPromoCode,
  [pricing.includedTokensToken]: String(pricing.includedTokensLabel),
  [pricing.foundingTokensToken]: String(pricing.foundingTokensLabel),
  [pricing.measuredSmallRepositoryDeliveryRangeToken]: String(pricing.measuredSmallRepositoryDeliveryRange),
  [pricing.measuredSoloRepositoryDeliveryRangeToken]: String(pricing.measuredSoloRepositoryDeliveryRange),
  [pricing.measuredLargeCodebaseDeliveriesToken]: String(pricing.measuredLargeCodebaseDeliveries),
  [pricing.measuredSoloLargeCodebaseDeliveriesToken]: String(pricing.measuredSoloLargeCodebaseDeliveries),
};

const pages = [
  ["cloud-en", "/cloud/"],
  ["cloud-zh", "/zh/cloud/"],
];
const widths = [390, 761, 820, 900, 1440];
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
};

let server;
let browser;
let baseUrl;

async function serve(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\/|\\)+/, "");
  if (relative.split("/").includes("..")) return null;
  const directPath = join("public", relative);
  const direct = await readFile(directPath).catch(() => null);
  if (direct !== null) return [directPath, direct];
  const index = await readFile(join(directPath, "index.html")).catch(() => null);
  return index === null ? null : [join(directPath, "index.html"), index];
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const file = await serve(new URL(request.url, "http://localhost").pathname);
    if (!file) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": contentTypes[extname(file[0])] ?? "application/octet-stream" });
    let body = file[1];
    if (extname(file[0]) === ".html") {
      body = String(body);
      for (const [token, value] of Object.entries(pricingReplacements)) body = body.replaceAll(token, value);
    }
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

describe("Cloud pricing actions align (Issue #472)", () => {
  for (const [name, path] of pages) {
    it(`${name} aligns its single primary actions and switches the paid plans`, async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        await page.evaluate((replacements) => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            walker.currentNode.nodeValue = walker.currentNode.nodeValue.replace(
              /__[A-Z_]+__/g,
              (value) => replacements[value] ?? value,
            );
          }
        }, pricingReplacements);
        const cards = page.locator(".pricing-card");
        const primaryTops = await cards.evaluateAll((elements) => elements.map((element) =>
          element.querySelector(".pricing-card-actions .button").getBoundingClientRect().top,
        ));
        expect(Math.max(...primaryTops) - Math.min(...primaryTops), `${path} primary action top delta`).toBeLessThanOrEqual(1);

        expect(await page.locator(".pricing-card-actions .button").count()).toBe(3);
        expect(await page.locator('[data-pricing-interval="year"]').getAttribute("aria-pressed")).toBe("true");
        expect(await page.locator('[data-pricing-cta="solo"]').getAttribute("href"))
          .toBe("/api/checkout?plan=solo&interval=year");
        expect(await page.locator('[data-pricing-cta="pro"]').getAttribute("href"))
          .toBe("/api/checkout?plan=pro&interval=year");
        await page.locator('[data-pricing-interval="month"]').click();
        expect(await page.locator('[data-pricing-interval="month"]').getAttribute("aria-pressed")).toBe("true");
        expect(await page.locator('[data-pricing-price="solo"]').textContent()).toBe(`US$${pricing.soloMonthlyUsd}`);
        expect(await page.locator('[data-pricing-price="pro"]').textContent()).toBe(`US$${pricing.cloudMonthlyUsd}`);
        expect(await page.locator('[data-pricing-cta="solo"]').getAttribute("href")).toBe("/api/checkout?plan=solo");
        expect(await page.locator('[data-pricing-cta="pro"]').getAttribute("href")).toBe("/api/checkout?plan=pro");
        expect(await page.locator('[data-pricing-cta="solo"]').getAttribute("data-cta")).toBe("pricing-solo-month");
        expect(await page.locator('[data-pricing-cta="pro"]').getAttribute("data-cta")).toBe("pricing-pro-month");
        await page.locator(".pricing-cards").screenshot({ path: `.orbi/pricing-actions-${name}-1440.png` });

        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator(".pricing-cards").screenshot({ path: `.orbi/pricing-actions-${name}-390.png` });
      } finally {
        await page.close();
      }
    });
  }
});

describe("Cloud onboarding cards fit every supported width (Issue #354)", () => {
  for (const [name, path] of pages) {
    it(`${name} has no page or footer overflow and keeps readable card rows`, async () => {
      const page = await browser.newPage();
      try {
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        await page.evaluate((replacements) => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const nodes = [];
          while (walker.nextNode()) nodes.push(walker.currentNode);
          for (const node of nodes) {
            node.nodeValue = node.nodeValue.replace(/__[A-Z_]+__/g, (value) => replacements[value] ?? value);
          }
        }, pricingReplacements);
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          const result = await page.locator(".proof-ledger-four").evaluate((list) => {
            const boxes = [...list.children].map((element) => {
              const box = element.getBoundingClientRect();
              return { top: Math.round(box.top), width: Math.round(box.width), left: box.left, right: box.right };
            });
            const footer = document.querySelector("footer.site-footer");
            return {
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              footerOverflow: footer.scrollWidth - footer.clientWidth,
              rowCount: new Set(boxes.map(({ top }) => top)).size,
              minCardWidth: Math.min(...boxes.map(({ width }) => width)),
              cardsInViewport: boxes.every(({ left, right }) => left >= 0 && right <= window.innerWidth),
            };
          });
          expect(result.overflow, `${path} at ${width}px page overflow`).toBe(0);
          expect(result.footerOverflow, `${path} at ${width}px footer overflow`).toBe(0);
          expect(result.cardsInViewport, `${path} at ${width}px clipped card`).toBe(true);
          if (width >= 761 && width <= 900) {
            expect(result.rowCount, `${path} at ${width}px card rows`).toBe(2);
            expect(result.minCardWidth, `${path} at ${width}px card width`).toBeGreaterThanOrEqual(200);
          }
          if (width === 390) expect(result.rowCount, `${path} at ${width}px card rows`).toBe(4);
          if (width === 1440) expect(result.rowCount, `${path} at ${width}px card rows`).toBe(1);
        }
      } finally {
        await page.close();
      }
    }, 30_000);
  }
});

// Issue #534: the /cloud/ first screen was a five-line jargon paragraph that
// almost nobody scrolled past (16 of 208 visitors reached 25% in 7 days).
// The Issue prescribes the replacement verbatim: a one-sentence lede, then a
// .hero-proof line linking a real delivery and naming all three prices —
// prices carried as the build-time tokens the Worker replaces from
// src/pricing.json, never hard-coded.
const heroLedes = {
  "cloud/index.html":
    '<p class="hero-lede">Label an Issue <code>ai-ready</code>. Orbi writes the change, a separate agent reviews it, then it merges and cuts the release. You read the diff.</p>',
  "zh/cloud/index.html":
    '<p class="hero-lede">给 Issue 打上 <code>ai-ready</code> 标签，Orbi 写代码，另一个 agent 独立评审，通过后合并并发布版本。你只需要看 diff。</p>',
};
const heroProofs = {
  "cloud/index.html":
    '<p class="hero-proof"><a class="orbi-hero-alt-a" href="/proof/orbi-build/orbi/1306">See a real delivery: Issue → PR → release, with the token cost →</a><br>Free for the first 3 merged deliveries · Solo US$__SOLO_MONTHLY_USD__/mo · Pro US$__CLOUD_MONTHLY_USD__/mo</p>',
  "zh/cloud/index.html":
    '<p class="hero-proof"><a class="orbi-hero-alt-a" href="/proof/orbi-build/orbi/1306">看一次真实交付：Issue → PR → Release，附 token 花费 →</a><br>前 3 次合并交付免费 · Solo 每月 US$__SOLO_MONTHLY_USD__ · Pro 每月 US$__CLOUD_MONTHLY_USD__</p>',
};
const retiredJargon = {
  "cloud/index.html": "same GitHub ledger",
  "zh/cloud/index.html": "同一条 GitHub 账本",
};

const applyPricing = (text) => {
  for (const [token, value] of Object.entries(pricingReplacements)) text = text.replaceAll(token, value);
  return text;
};

describe("Cloud hero first screen copy and proof link (Issue #534)", () => {
  for (const output of ["cloud/index.html", "zh/cloud/index.html"]) {
    it(`${output} carries the prescribed lede and proof line in source and build`, async () => {
      for (const dir of ["site/pages", "public"]) {
        const html = await readFile(`${dir}/${output}`, "utf8");
        expect(html, `${dir}/${output}: hero lede`).toContain(heroLedes[output]);
        expect(html, `${dir}/${output}: hero proof line`).toContain(heroProofs[output]);
        expect(html, `${dir}/${output}: retired jargon`).not.toContain(retiredJargon[output]);
      }
    });

    it(`${output} prices the proof line from src/pricing.json with no leftover token`, async () => {
      const html = await readFile(`public/${output}`, "utf8");
      const proof = html.match(/<p class="hero-proof">[\s\S]*?<\/p>/)?.[0];
      expect(proof, `${output}: hero proof paragraph missing`).toBeTruthy();
      expect(proof, `${output}: proof link target`).toContain('href="/proof/orbi-build/orbi/1306"');
      const rendered = applyPricing(proof);
      expect(rendered, `${output}: Solo price`).toContain(`US$${pricing.soloMonthlyUsd}`);
      expect(rendered, `${output}: Pro price`).toContain(`US$${pricing.cloudMonthlyUsd}`);
      expect(rendered, `${output}: leftover placeholder token`).not.toMatch(/__[A-Z_]+__/);
    });
  }
});

describe("Cloud hero first screen geometry (Issue #534)", () => {
  for (const [name, path] of pages) {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      it(`${name} keeps the proof link and CTA above the fold at ${width}x${height}`, async () => {
        const page = await browser.newPage({ viewport: { width, height } });
        try {
          await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate((replacements) => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              walker.currentNode.nodeValue = walker.currentNode.nodeValue.replace(
                /__[A-Z_]+__/g,
                (value) => replacements[value] ?? value,
              );
            }
          }, pricingReplacements);
          const result = await page.evaluate(() => {
            const proof = document.querySelector(".hero-proof a");
            const cta = document.querySelector('a[data-cta="cloud-hero"]');
            return {
              proofHref: proof?.getAttribute("href") ?? "",
              proofText: proof?.parentElement?.textContent ?? "",
              proofBottom: proof?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
              ctaBottom: cta?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
              innerHeight: window.innerHeight,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
          });
          expect(result.proofHref, `${path} proof link target`).toBe("/proof/orbi-build/orbi/1306");
          expect(result.proofText, `${path} Solo price rendered`).toContain(`US$${pricing.soloMonthlyUsd}`);
          expect(result.proofText, `${path} Pro price rendered`).toContain(`US$${pricing.cloudMonthlyUsd}`);
          expect(result.proofBottom, `${path} at ${width}px proof link below the fold`).toBeLessThanOrEqual(result.innerHeight);
          expect(result.ctaBottom, `${path} at ${width}px CTA below the fold`).toBeLessThanOrEqual(result.innerHeight);
          expect(result.overflow, `${path} at ${width}px horizontal overflow`).toBe(0);
          await page.screenshot({ path: `.orbi/hero-proof-${name}-${width}.png` });
        } finally {
          await page.close();
        }
      });
    }
  }
});
