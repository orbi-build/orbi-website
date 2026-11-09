import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";
import pricing from "../src/pricing.json";
import { paidPriceReplacements } from "../src/pricing-tokens.js";

const paidPrices = paidPriceReplacements(pricing);
const pricingReplacements = {
  // Issue #1237: the founding price and the struck-through list price state
  // resolve the same way the Worker resolves them.
  ...paidPrices,
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
  assertNoExternalRequests();
});

describe("Cloud onboarding cards fit every supported width (Issue #354)", () => {
  for (const [name, path] of pages) {
    it(`${name} has no page or footer overflow and keeps readable card rows`, async () => {
      const page = await guardedPage(browser, baseUrl);
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

// Issue #667: the savings label belongs to Yearly, and paid prices must not
// inherit the weak unit styling intended only for "/ month".
describe("Cloud pricing hierarchy (Issue #667)", () => {
  for (const [name, path] of pages) {
    it(`${name} attaches savings to Yearly and keeps paid prices prominent`, async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        await page.evaluate((replacements) => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) walker.currentNode.nodeValue = walker.currentNode.nodeValue.replace(/__[A-Z_]+__/g, (value) => replacements[value] ?? value);
        }, pricingReplacements);
        const toggle = page.locator("[data-pricing-toggle]");
        expect(await toggle.locator('[data-pricing-interval="month"] + [data-pricing-interval="year"]').count()).toBe(1);
        expect(await toggle.locator('[data-pricing-interval="year"] .pricing-savings').count()).toBe(1);
        expect(await toggle.locator('[data-pricing-interval="month"] + .pricing-savings').count()).toBe(0);
        const selectedYearColors = await toggle.locator('[data-pricing-interval="year"]').evaluate((button) => ({
          background: getComputedStyle(button).backgroundColor,
          savings: getComputedStyle(button.querySelector(".pricing-savings")).color,
        }));
        expect(selectedYearColors.savings).not.toBe(selectedYearColors.background);

        const pricingOrder = await page.locator("#pricing .shell").evaluate((shell) => {
          const marker = (element) => {
            if (element.matches("[data-pricing-toggle]")) return "toggle";
            if (element.matches(".pricing-trial-note")) return "trial";
            if (element.matches(".pricing-cards")) return "cards";
            return null;
          };
          return [...shell.children].map(marker).filter(Boolean);
        });
        expect(pricingOrder).toEqual(["toggle", "trial", "cards"]);
        expect(await page.locator("#pricing .pricing-card h3").allTextContents()).toEqual(["Solo", "Pro"]);

        const styles = await page.locator('[data-pricing-price="solo"], [data-pricing-price="pro"]').evaluateAll((prices) => prices.map((price) => {
          const style = getComputedStyle(price);
          return { fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color };
        }));
        const paid = await page.locator(".pricing-card-price").first().evaluate((node) => {
          const style = getComputedStyle(node);
          return { fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color };
        });
        expect(styles).toEqual([paid, paid]);

        // Issue #1237 moved the default interval to monthly: the founding
        // price the visitor pays is the monthly one, so the card and the
        // subscription link start there.
        // Issue #1263: every checkout link carries the entry name, and the
        // interval toggle rewrites the href from demo.js — so this is where a
        // rewrite that drops `cta` goes red.
        for (const plan of ["solo", "pro"]) {
          const subscribe = page.locator(`[data-pricing-subscribe="${plan}"]`);
          expect(await subscribe.getAttribute("href")).toBe(`/api/checkout?plan=${plan}&cta=site-pricing`);
          expect(await subscribe.getAttribute("data-cta")).toBe(`pricing-${plan}-month`);
        }
        // Issue #1263: the four pay-once links are static; the browser resolves
        // their escaped ampersands, so read the href the Cloud endpoint gets.
        const onceHrefs = await page.locator('.once-pay-note a[href*="payment=once"]').evaluateAll(
          (links) => links.map((link) => link.getAttribute("href")),
        );
        expect(onceHrefs).toEqual([
          "/api/checkout?plan=solo&interval=month&payment=once&cta=site-once",
          "/api/checkout?plan=solo&interval=year&payment=once&cta=site-once",
          "/api/checkout?plan=pro&interval=month&payment=once&cta=site-once",
          "/api/checkout?plan=pro&interval=year&payment=once&cta=site-once",
        ]);
        await page.locator('[data-pricing-interval="year"]').click();
        expect(await page.locator('[data-pricing-price="solo"]').textContent())
          .toBe(`US$${paidPrices[pricing.soloPaidAnnualMonthlyUsdToken]}`);
        expect(await page.locator('[data-pricing-price="solo"]').evaluate((price) => getComputedStyle(price).fontSize)).toBe(paid.fontSize);
        for (const plan of ["solo", "pro"]) {
          const subscribe = page.locator(`[data-pricing-subscribe="${plan}"]`);
          expect(await subscribe.getAttribute("href")).toBe(`/api/checkout?plan=${plan}&interval=year&cta=site-pricing`);
          expect(await subscribe.getAttribute("data-cta")).toBe(`pricing-${plan}-year`);
        }
      } finally {
        await page.close();
      }
    });
  }
});


// Issue #1238: beside the pricing cards, the visitor sees the two measured
// numbers and one signed quote. Desktop keeps the two facts on one line; a
// phone stacks one clause per line, and no clause ends on a lone word (a widow)
// in either language.
describe("Cloud pricing evidence beside the cards (Issue #1238)", () => {
  // The rendered rows of the evidence line and of each of its clauses: one row
  // per visual line, spanning the leftmost to the rightmost rect on it.
  // Baseline-aligned flex items sit 1-3px apart on the same line, so rects
  // closer than 10px belong to one row.
  const readLayout = (element) => {
    const measure = (node) => {
      const box = node.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      const lines = new Map();
      for (const rect of rects) {
        const key = Math.round(rect.top);
        const line = lines.get(key) ?? { left: Infinity, right: -Infinity };
        line.left = Math.min(line.left, rect.left);
        line.right = Math.max(line.right, rect.right);
        lines.set(key, line);
      }
      const rows = [];
      for (const top of [...lines.keys()].sort((a, b) => a - b)) {
        const row = rows.find((candidate) => Math.abs(candidate.top - top) <= 10);
        if (row) {
          row.left = Math.min(row.left, lines.get(top).left);
          row.right = Math.max(row.right, lines.get(top).right);
        } else {
          rows.push({ top, ...lines.get(top) });
        }
      }
      const widths = rows.map((row) => row.right - row.left);
      return {
        rows: widths.length,
        width: box.width,
        // How much of the measured element's own width the last line covers.
        endRatio: widths.length ? widths[widths.length - 1] / box.width : 0,
      };
    };
    return {
      line: measure(element),
      clauses: [...element.querySelectorAll(".pricing-evidence-item")].map(measure),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  };

  for (const [name, path] of pages) {
    it(`${name} keeps the numbers and the quote readable at 1440 and 390`, async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        await page.evaluate((replacements) => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) walker.currentNode.nodeValue = walker.currentNode.nodeValue.replace(/__[A-Z_]+__/g, (value) => replacements[value] ?? value);
        }, pricingReplacements);
        const evidence = page.locator("#pricing .pricing-evidence");
        expect(await evidence.count(), `${path}: no evidence block beside the price`).toBe(1);
        const record = page.locator("#pricing .pricing-evidence-line .pricing-evidence-record");
        expect(await record.getAttribute("href")).toBe(name === "cloud-zh" ? "/zh/evidence/" : "/evidence/");
        const handle = page.locator("#pricing .pricing-quote .pricing-quote-handle");
        expect(await handle.getAttribute("href")).toBe("https://x.com/xds2000");
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 900 });
          const layout = await page.locator("#pricing .pricing-evidence-line").evaluate(readLayout);
          expect(layout.overflow, `${path} at ${width}px page overflow`).toBe(0);
          expect(layout.clauses.length, `${path}: the line is missing one of the two facts`).toBe(2);
          // No clause may end on a lone word: a single word covers about 0.1 of
          // the width ("days" was 35px of 358; a two-character Chinese word 32px),
          // while a wrapped phrase or a whole clause covers 0.15 or more. The
          // record link is its own row on a phone by design and belongs to no
          // clause, so its length is not measured here.
          for (const [index, clause] of layout.clauses.entries()) {
            expect(clause.endRatio, `${path} at ${width}px: clause ${index + 1} ends on a lone word`).toBeGreaterThan(0.15);
          }
          if (width === 1440) expect(layout.line.rows, `${path} at 1440px: the evidence line wrapped`).toBe(1);
          if (width === 390) expect(layout.line.rows, `${path} at 390px: the evidence line did not stack`).toBeGreaterThanOrEqual(3);
          const quote = await page.locator("#pricing .pricing-quote").evaluate((node) => node.getBoundingClientRect().width);
          expect(Math.round(quote), `${path} at ${width}px: the quote and the line disagree on width`).toBe(Math.round(layout.line.width));
        }
      } finally {
        await page.close();
      }
    });
  }
});
// Issue #534 first-screen copy/geometry tests were removed (Issue #540):
// they pinned the lede and proof-line wording and the above-the-fold
// coordinates verbatim.

// Issue #1237: the Cloud pricing card writes the price the visitor actually
// pays first (the founding 50% while places remain) and strikes the list price
// through beside it, on one line, at phone and desktop widths. Once the places
// are gone the struck price is not shown at all.
describe("Cloud founding price (Issue #1237)", () => {
  for (const [name, path] of pages) {
    it(`${name} writes the founding price first with the list price struck through`, async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        await page.evaluate((replacements) => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) walker.currentNode.nodeValue = walker.currentNode.nodeValue.replace(/__[A-Z_]+__/g, (value) => replacements[value] ?? value);
        }, pricingReplacements);
        const readCards = () => page.locator(".pricing-card-price").evaluateAll((rows) => rows.map((row) => {
          const paidPrice = row.querySelector("[data-pricing-price]");
          const listPrice = row.querySelector("s[data-pricing-list-price]");
          const unit = row.querySelector(".pricing-card-price-unit");
          const paidBox = paidPrice.getBoundingClientRect();
          // An inline box set in a smaller font shares the paid price's
          // baseline, so containment inside its box is the one-line test.
          const sharesPaidLine = (node) => {
            const box = node.getBoundingClientRect();
            return box.top >= paidBox.top - 2 && box.bottom <= paidBox.bottom + 2;
          };
          return {
            paid: paidPrice.textContent.trim(),
            list: listPrice.textContent.trim(),
            lineThrough: getComputedStyle(listPrice).textDecorationLine,
            sameLine: sharesPaidLine(listPrice) && sharesPaidLine(unit),
            height: row.getBoundingClientRect().height,
            lineHeight: parseFloat(getComputedStyle(row).lineHeight),
            overflowing: row.scrollWidth - row.clientWidth,
          };
        }));
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          const cards = await readCards();
          // Issue #1237 acceptance: the first number on the card is the
          // founding price the visitor pays, on the default (monthly) interval.
          expect(cards.map(({ paid: amount }) => amount), `${path} at ${width}px`).toEqual([
            `US$${paidPrices[pricing.soloPaidMonthlyUsdToken]}`,
            `US$${paidPrices[pricing.proPaidMonthlyUsdToken]}`,
          ]);
          expect(cards.map(({ list }) => list), `${path} at ${width}px`).toEqual([
            `US$${pricing.soloMonthlyUsd}`,
            `US$${pricing.cloudMonthlyUsd}`,
          ]);
          for (const [index, card] of cards.entries()) {
            const label = `${path} at ${width}px card ${index + 1}`;
            expect(card.lineThrough, `${label}: struck list price`).toBe("line-through");
            expect(card.sameLine, `${label}: price, list price and unit on one line`).toBe(true);
            expect(card.height, `${label}: price row wraps`).toBeLessThanOrEqual(card.lineHeight * 1.5);
            expect(card.overflowing, `${label}: price row overflow`).toBeLessThanOrEqual(0);
          }
        }
        // The annual amounts the visitor pays stay on the same card while the
        // monthly interval leads, so the ticket's "monthly price (yearly
        // price)" pair is readable without touching the toggle.
        const monthDetail = await page.locator('[data-pricing-detail="solo"]').innerText();
        expect(monthDetail, `${path}: monthly detail keeps the yearly amounts`)
          .toContain(`US$${paidPrices[pricing.soloPaidAnnualUsdToken]} US$${pricing.soloAnnualUsd}`);
        // The yearly interval keeps the same shape: the founding half of the
        // yearly equivalent first, the list equivalent struck beside it, and
        // the yearly line carries the annual amounts the same way.
        await page.locator('[data-pricing-interval="year"]').click();
        const yearly = await readCards();
        expect(yearly.map(({ paid: amount }) => amount)).toEqual([
          `US$${paidPrices[pricing.soloPaidAnnualMonthlyUsdToken]}`,
          `US$${paidPrices[pricing.proPaidAnnualMonthlyUsdToken]}`,
        ]);
        expect(yearly.map(({ list }) => list)).toEqual([
          `US$${pricing.soloAnnualMonthlyUsd}`,
          `US$${pricing.proAnnualMonthlyUsd}`,
        ]);
        const detail = await page.locator('[data-pricing-detail="solo"]').innerText();
        expect(detail, `${path}: yearly detail writes the paid annual first`)
          .toContain(`US$${paidPrices[pricing.soloPaidAnnualUsdToken]} US$${pricing.soloAnnualUsd}`);
        // Once the founding places are gone the page carries the list price
        // alone: the struck element disappears, the paid price stays, and no
        // stray space is left behind where it was.
        await page.locator(".pricing-cards").evaluate((node) => node.setAttribute("data-founding-price", "off"));
        expect(await page.locator(".pricing-card-price s").first().isVisible()).toBe(false);
        expect(await page.locator("[data-pricing-detail] s").first().isVisible()).toBe(false);
        expect(await page.locator('[data-pricing-price="solo"]').isVisible()).toBe(true);
        expect(await page.locator('[data-pricing-detail="solo"]').innerText(), `${path}: no gap left by the hidden list price`)
          .not.toMatch(/US$\d+(?:\.\d+)?\s+[;，,]/);
      } finally {
        await page.close();
      }
    }, 30_000);
  }
});
