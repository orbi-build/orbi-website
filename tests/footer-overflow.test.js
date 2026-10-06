import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";
import pricing from "../src/pricing.json";

const pricingReplacements = {
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

describe("footer and subscription layout stay within the viewport (Issues #337, #665)", () => {
  for (const [name, path, successText] of pages) {
    it(`${name} keeps the subscription aligned and has no horizontal overflow`, async () => {
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
            const links = [...element.querySelectorAll("a")];
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
              linkCount: links.length,
              groupCount: groups.length,
              groupLefts: [...new Set(groups.map((group) => group.left))],
              groupRows: new Set(groups.map((group) => group.top)).size,
              footerAlignItems: getComputedStyle(element).alignItems,
              columnsAlignItems: getComputedStyle(element.querySelector("nav:not(.footer-friends)")).alignItems,
              linksOutsideFooter: links.some((link) => {
                const linkRect = link.getBoundingClientRect();
                return linkRect.left < rect.left || linkRect.right > rect.right;
              }),
            };
          });
          const footerRect = await footer.boundingBox();
          expect(result.footerWidth, `${path} at ${width}px footer width`).toBeLessThanOrEqual(width);
          expect(result.subscriptionLeft, `${path} at ${width}px subscription left edge`).toBe(Math.round(footerRect.x));
          expect(result.subscriptionRight, `${path} at ${width}px subscription right edge`).toBe(Math.round(footerRect.x + footerRect.width));
          expect(result.inputVisible, `${path} at ${width}px subscription input visible`).toBe(true);
          expect(result.overflow, `${path} at ${width}px document overflow`).toBe(0);
          expect(result.linkCount, `${path} at ${width}px links`).toBeGreaterThan(0);
          expect(result.groupCount, `${path} at ${width}px groups`).toBe(5);
          expect(result.linksOutsideFooter, `${path} at ${width}px clipped links`).toBe(false);
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

describe("footer directory badges get their own bottom row (Issue #805)", () => {
  for (const [name, path] of [["home-en", "/"], ["home-zh", "/zh/"]]) {
    it(name + " keeps the badges in their own block below the text friends", async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl + path, { waitUntil: "load", timeout: 25_000 });
        const footer = page.locator("footer.site-footer");
        const result = await footer.evaluate((element) => {
          const nav = element.querySelector("nav.footer-friends");
          const textFriends = [...nav.querySelectorAll(":scope > span, :scope > a")];
          const wrapper = nav.querySelector(".footer-badges");
          if (!wrapper) return { wrapper: false };
          const round = (value) => Math.round(value);
          const badges = [...wrapper.querySelectorAll(":scope > a")];
          return {
            wrapper: true,
            isLastChild: nav.lastElementChild === wrapper,
            wrapperTop: round(wrapper.getBoundingClientRect().top),
            lastTextFriendsBottom: round(Math.max(...textFriends.map((node) => node.getBoundingClientRect().bottom))),
            badgeCount: badges.length,
          };
        });
        expect(result.wrapper, path + ": .footer-badges missing").toBe(true);
        expect(result.isLastChild, path + ": .footer-badges must be the last child of footer-friends").toBe(true);
        expect(result.wrapperTop, path + ": badges must sit below the text friends")
          .toBeGreaterThanOrEqual(result.lastTextFriendsBottom);
        // Whether the badges line up on one row depends on the four badge
        // boxes: LaunchNest's image declares only width="240", so its height
        // comes from the placeholder ratio the guard serves (Issue #871).
        // Only the structure is asserted here.
        expect(result.badgeCount, path + ": the footer badges").toBe(4);
        await footer.screenshot({ path: ".orbi/footer-badges-" + name + "-1440.png" });
        await page.setViewportSize({ width: 390, height: 900 });
        await page.waitForTimeout(150);
        await footer.screenshot({ path: ".orbi/footer-badges-" + name + "-390.png" });
      } finally {
        await page.close();
      }
    }, 30_000);
  }
});
