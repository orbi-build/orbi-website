// Footer layout, driven in a real Chromium against the committed build.
//
// Issue #1207 deleted this file's badge suites: they tabbed through the badge
// row in a hard-coded order, pinned each vendor's href and checked badge
// alignment and size one by one, so every badge ticket had to patch them. The
// badge row keeps exactly one check in this suite — the page must not scroll
// sideways at 390 or 1440 — plus the footer contracts it shares with the
// subscription box and the wordmark tagline.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";
import pricing from "../src/pricing.json";
import { paidPriceReplacements } from "../src/pricing-tokens.js";

const pricingReplacements = {
  // Issue #1237: the founding price and the struck-through list price state.
  ...paidPriceReplacements(pricing),
  [pricing.freeDeliveriesToken]: pricing.freeDeliveries,
  [pricing.monthlyUsdToken]: pricing.cloudMonthlyUsd,
  [pricing.soloMonthlyUsdToken]: pricing.soloMonthlyUsd,
  [pricing.soloAnnualUsdToken]: pricing.soloAnnualUsd,
  [pricing.proAnnualUsdToken]: pricing.proAnnualUsd,
  [pricing.soloAnnualMonthlyUsdToken]: pricing.soloAnnualMonthlyUsd,
  [pricing.proAnnualMonthlyUsdToken]: pricing.proAnnualMonthlyUsd,
  [pricing.soloAnnualSavingsPercentToken]: pricing.soloAnnualSavingsPercent,
  [pricing.proAnnualSavingsPercentToken]: pricing.proAnnualSavingsPercent,
  [pricing.annualSavingsPercentToken]: pricing.annualSavingsPercent,
  [pricing.soloIncludedTokensToken]: pricing.soloIncludedTokensLabel,
  [pricing.soloRepositoriesToken]: pricing.soloRepositories,
  [pricing.proRepositoriesToken]: pricing.proRepositories,
  [pricing.foundingPartnerLimitToken]: pricing.foundingPartnerLimit,
  [pricing.foundingPromoCodeToken]: pricing.foundingPromoCode,
  [pricing.includedTokensToken]: pricing.includedTokensLabel,
  [pricing.foundingTokensToken]: pricing.foundingTokensLabel,
  [pricing.measuredSmallRepositoryDeliveryRangeToken]: pricing.measuredSmallRepositoryDeliveryRange,
  [pricing.measuredSoloRepositoryDeliveryRangeToken]: pricing.measuredSoloRepositoryDeliveryRange,
  [pricing.measuredLargeCodebaseDeliveriesToken]: pricing.measuredLargeCodebaseDeliveries,
  [pricing.measuredSoloLargeCodebaseDeliveriesToken]: pricing.measuredSoloLargeCodebaseDeliveries,
};

const pages = [
  ["home-en", "/", "Subscribed"],
  ["cloud-en", "/cloud/", "Subscribed"],
  ["blog-en", "/blog/claude-code-github-actions-who-merges/", "Subscribed"],
  ["home-zh", "/zh/", "已订阅"],
  ["cloud-zh", "/zh/cloud/", "已订阅"],
  ["blog-zh", "/zh/blog/claude-code-github-actions-who-merges/", "已订阅"],
];
const widths = [1440, 1100, 1026, 900, 390];
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
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
  if (!extname(directPath)) {
    const indexPath = join(directPath, "index.html");
    const index = await readFile(indexPath).catch(() => null);
    if (index !== null) return [indexPath, index];
  }
  return null;
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url, "http://localhost");
    if (pathname === "/subscribe" && request.method === "POST") {
      request.resume();
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    const file = await serve(pathname);
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

// Issue #1207: the footer's badge row gets no test of its own. Badges are
// third-party promo images — adding, removing, reordering or swapping one says
// nothing about whether a visitor can use the site, and order-pinned assertions
// reddened CI three times in ten minutes on 2026-11-07. What a visitor does
// feel is the page being dragged sideways by that row, so the row is held to
// one outcome: at phone and desktop widths the document never scrolls
// horizontally.
describe("the footer keeps the page inside the viewport (Issues #337, #665, #1207)", () => {
  for (const [name, path, successText] of pages) {
    it(`${name} keeps the subscription aligned and never scrolls sideways`, async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: widths[0], height: 900 });
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          const footer = page.locator("footer.site-footer");
          const subscription = page.locator(".subscribe-box");
          const result = await footer.evaluate((element) => {
            const documentElement = document.documentElement;
            const rect = element.getBoundingClientRect();
            const subscriptionRect = document.querySelector(".subscribe-box").getBoundingClientRect();
            const inputRect = document.querySelector("[data-subscribe-form] input[type=email]").getBoundingClientRect();
            const groups = [...element.querySelectorAll(".footer-group")].map((group) => {
              const groupRect = group.getBoundingClientRect();
              return { left: Math.round(groupRect.left), top: Math.round(groupRect.top) };
            });
            return {
              footerWidth: Math.round(rect.width),
              subscriptionLeft: Math.round(subscriptionRect.left),
              subscriptionRight: Math.round(subscriptionRect.right),
              inputVisible: inputRect.width > 0 && inputRect.height > 0,
              overflow: documentElement.scrollWidth - documentElement.clientWidth,
              groupCount: groups.length,
              groupLefts: [...new Set(groups.map((group) => group.left))],
              groupRows: new Set(groups.map((group) => group.top)).size,
              footerAlignItems: getComputedStyle(element).alignItems,
              columnsAlignItems: getComputedStyle(element.querySelector("nav:not(.footer-friends)")).alignItems,
            };
          });
          const footerRect = await footer.boundingBox();
          expect(result.footerWidth, `${path} at ${width}px footer width`).toBeLessThanOrEqual(width);
          expect(result.subscriptionLeft, `${path} at ${width}px subscription left edge`).toBe(Math.round(footerRect.x));
          expect(result.subscriptionRight, `${path} at ${width}px subscription right edge`).toBe(Math.round(footerRect.x + footerRect.width));
          expect(result.inputVisible, `${path} at ${width}px subscription input visible`).toBe(true);
          expect(result.overflow, `${path} at ${width}px document overflow`).toBe(0);
          expect(result.groupCount, `${path} at ${width}px groups`).toBe(5);
          if (width >= 981) {
            expect(result.footerAlignItems, `${path} at ${width}px footer alignment`).toBe("start");
            expect(result.columnsAlignItems, `${path} at ${width}px columns alignment`).toBe("start");
          }
          if (width === 390) {
            expect(result.groupLefts, `${path} at ${width}px group alignment`).toHaveLength(1);
            expect(result.groupRows, `${path} at ${width}px group rows`).toBe(5);
          }
          if (width === 1440 || width === 390) {
            await subscription.screenshot({
              path: `.orbi/subscription-${name}-${width}.png`,
            });
          }
        }
        await page.locator("[data-subscribe-form] input[type=email]").fill(`${name}@example.com`);
        await page.locator("[data-subscribe-form] button[type=submit]").click();
        await expect.poll(async () => (await page.locator("[data-subscribe-status]").textContent())?.trim()).toBe(successText);
      } finally {
        await page.close();
      }
    }, 30_000);
  }
});

describe("the footer tagline sits under the wordmark at every width (Issue #1021)", () => {
  const measureFooter = (page) => page.locator("footer.site-footer").evaluate((footer) => {
    const wordmark = footer.querySelector("a.wordmark-footer");
    const mark = wordmark.querySelector(".wordmark-mark");
    const tagline = footer.querySelector(".orbi-site-footer-p");
    const nav = footer.querySelector("nav:not(.footer-friends)");
    const rect = (node) => node.getBoundingClientRect();
    return {
      wordmarkTop: rect(wordmark).top,
      wordmarkLeft: rect(wordmark).left,
      wordmarkBottom: rect(wordmark).bottom,
      wordmarkRight: rect(wordmark).right,
      markBottom: rect(mark).bottom,
      taglineTop: rect(tagline).top,
      taglineLeft: rect(tagline).left,
      taglineBottom: rect(tagline).bottom,
      navTop: rect(nav).top,
      navLeft: rect(nav).left,
      taglineHeight: rect(tagline).height,
      taglineLineHeight: parseFloat(getComputedStyle(tagline).lineHeight),
      firstGroupBottom: rect(footer.querySelector(".footer-group")).bottom,
      footerGap: getComputedStyle(footer).gap,
    };
  });

  for (const [name, path] of [["home-en", "/"], ["home-zh", "/zh/"]]) {
    it(name + " keeps the tagline 8px under the wordmark on desktop and on a phone", async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl + path, { waitUntil: "load", timeout: 25_000 });
        const desktop = await measureFooter(page);
        // Desktop: the brand column holds the wordmark with the tagline right
        // under it, and the nav starts to the right of that column.
        expect(desktop.taglineLeft, path + " at 1440px: the tagline starts under the wordmark")
          .toBe(desktop.wordmarkLeft);
        expect(Math.round(desktop.taglineTop - desktop.wordmarkBottom),
          path + " at 1440px: wordmark box bottom to tagline top").toBe(8);
        // The brand pair has its own row: the tagline stays on one line and the
        // nav starts a full 34px group gap below it, aligned to the same left edge.
        expect(desktop.taglineHeight, path + " at 1440px: the tagline is one line")
          .toBeLessThan(desktop.taglineLineHeight * 1.5);
        expect(Math.round(desktop.navTop - desktop.taglineBottom),
          path + " at 1440px: tagline to the nav row").toBe(34);
        expect(desktop.navLeft, path + " at 1440px: the nav starts at the brand's left edge")
          .toBe(desktop.wordmarkLeft);

        // Artifacts read back by eye: at 1440 and 390 the brand pair is its own
        // row with the nav a full 34px below.
        const capture = async (width) => {
          await page.locator("footer.site-footer a.wordmark-footer").scrollIntoViewIfNeeded();
          const footerBox = await page.locator("footer.site-footer").boundingBox();
          const shot = await measureFooter(page);
          await page.screenshot({
            path: ".orbi/footer-wordmark-tagline-" + name + "-" + width + ".png",
            clip: { x: 0, y: footerBox.y - 8, width, height: shot.firstGroupBottom - footerBox.y + 16 },
          });
        };
        await capture(1440);

        await page.setViewportSize({ width: 390, height: 900 });
        await page.waitForTimeout(150);
        const phone = await measureFooter(page);
        // One column, so the groups still get the 34px gap...
        expect(phone.footerGap, path + " at 390px: the footer keeps its 34px group gap").toBe("34px");
        // ...but the tagline is the wordmark's second line, not another group.
        expect(phone.taglineLeft, path + " at 390px: the tagline starts under the wordmark")
          .toBe(phone.wordmarkLeft);
        expect(phone.taglineTop, path + " at 390px: the tagline sits below the wordmark")
          .toBeGreaterThan(phone.wordmarkBottom);
        expect(Math.round(phone.taglineTop - phone.wordmarkBottom),
          path + " at 390px: wordmark box bottom to tagline top").toBe(8);
        // The wordmark's 44px tap target centres the 28px mark, so the gap the
        // eye sees from the icon to the tagline text is 16px — half a group.
        expect(Math.round(phone.taglineTop - phone.markBottom),
          path + " at 390px: mark bottom to tagline top").toBe(16);
        expect(Math.round(phone.navTop - phone.taglineBottom),
          path + " at 390px: tagline to the first nav group").toBe(34);
        // The gap below the tagline is what tells the two distances apart by eye.
        await capture(390);
      } finally {
        await page.close();
      }
    }, 30_000);
  }
});
