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
          const altern = wrapper.querySelector('a[href="https://altern.ai/ai/orbi"]');
          const alternImage = altern?.querySelector("img");
          const imageRect = alternImage?.getBoundingClientRect();
          const saaspa = wrapper.querySelector('a[href="https://saaspa.ge/product/cmvdfiyyk000mjq06rc8auynb"]');
          const saaspaImage = saaspa?.querySelector("img");
          const saaspaRect = saaspaImage?.getBoundingClientRect();
          const tooluck = wrapper.querySelector('a[href="https://www.tooluck.org/item/orbi"]');
          const tooluckImage = tooluck?.querySelector("img");
          const tooluckRect = tooluckImage?.getBoundingClientRect();
          return {
            wrapper: true,
            isLastChild: nav.lastElementChild === wrapper,
            wrapperTop: round(wrapper.getBoundingClientRect().top),
            lastTextFriendsBottom: round(Math.max(...textFriends.map((node) => node.getBoundingClientRect().bottom))),
            badgeCount: badges.length,
            lastBadgeHref: badges.at(-1)?.getAttribute("href"),
            alternTarget: altern?.getAttribute("target"),
            alternRel: altern?.getAttribute("rel"),
            alternImageSrc: alternImage?.getAttribute("src"),
            alternImageWidth: imageRect?.width,
            alternImageHeight: imageRect?.height,
            alternNaturalWidth: alternImage?.naturalWidth,
            alternNaturalHeight: alternImage?.naturalHeight,
            saaspaTarget: saaspa?.getAttribute("target"),
            saaspaRel: saaspa?.getAttribute("rel"),
            saaspaImageSrc: saaspaImage?.getAttribute("src"),
            saaspaImageAlt: saaspaImage?.getAttribute("alt"),
            saaspaImageWidth: saaspaRect?.width,
            saaspaImageHeight: saaspaRect?.height,
            saaspaNaturalWidth: saaspaImage?.naturalWidth,
            saaspaNaturalHeight: saaspaImage?.naturalHeight,
            tooluckTarget: tooluck?.getAttribute("target"),
            tooluckRel: tooluck?.getAttribute("rel"),
            tooluckImageSrc: tooluckImage?.getAttribute("src"),
            tooluckImageAlt: tooluckImage?.getAttribute("alt"),
            tooluckImageWidth: tooluckRect?.width,
            tooluckImageHeight: tooluckRect?.height,
            tooluckNaturalWidth: tooluckImage?.naturalWidth,
            tooluckNaturalHeight: tooluckImage?.naturalHeight,
          };
        });
        expect(result.wrapper, path + ": .footer-badges missing").toBe(true);
        expect(result.isLastChild, path + ": .footer-badges must be the last child of footer-friends").toBe(true);
        expect(result.wrapperTop, path + ": badges must sit below the text friends")
          .toBeGreaterThanOrEqual(result.lastTextFriendsBottom);
        // Whether the badges line up on one row depends on the seven badge
        // boxes: LaunchNest's image declares only width="240" and the Altern
        // badge (Issue #1012) only width="150", so their heights come from the
        // placeholder ratio the guard serves (Issue #871). Only the structure
        // and the rendered Altern / SaaSpa.ge / Tooluck boxes are asserted here.
        expect(result.badgeCount, path + ": the footer badges").toBe(7);
        // Issue #1015: the SaaSpa.ge badge sits before the Tooluck badge added
        // by Issue #1027, at the declared 200x60 with the supplied target/rel
        // and alt.
        expect(result.saaspaTarget, path + ": the SaaSpa.ge badge opens in a new tab").toBe("_blank");
        expect(result.saaspaRel, path + ": the SaaSpa.ge anchor keeps rel=nofollow").toBe("nofollow");
        expect(result.saaspaImageSrc, path + ": SaaSpa.ge badge image src")
          .toBe("https://saaspa.ge/api/embed/product/cmvdfiyyk000mjq06rc8auynb/badge.png?theme=black");
        expect(result.saaspaImageAlt, path + ": SaaSpa.ge badge image alt").toBe("Featured on Saaspa.ge");
        expect(result.saaspaImageWidth, path + ": SaaSpa.ge badge rendered width").toBeCloseTo(200, 1);
        expect(result.saaspaImageHeight, path + ": SaaSpa.ge badge rendered height").toBeCloseTo(60, 1);
        expect(
          Math.abs(result.saaspaImageWidth / result.saaspaImageHeight
            - result.saaspaNaturalWidth / result.saaspaNaturalHeight),
          path + ": the SaaSpa.ge badge must keep the source ratio",
        ).toBeLessThan(0.02);
        // Issue #1027: the Tooluck badge is appended last, at the declared
        // 210x55 with the supplied target/rel/src/alt. The placeholder the
        // guard serves is 336x88, the real source ratio, so the rendered box
        // must match it instead of stretching.
        expect(result.lastBadgeHref, path + ": the footer badges end with Tooluck")
          .toBe("https://www.tooluck.org/item/orbi");
        expect(result.tooluckTarget, path + ": the Tooluck badge opens in a new tab").toBe("_blank");
        expect(result.tooluckRel, path + ": the Tooluck anchor keeps noopener noreferrer").toBe("noopener noreferrer");
        expect(result.tooluckImageSrc, path + ": Tooluck badge image src")
          .toBe("https://www.tooluck.org/badges/tooluck-badge-dark.svg");
        expect(result.tooluckImageAlt, path + ": Tooluck badge image alt").toBe("Featured on Tooluck.org");
        expect(result.tooluckImageWidth, path + ": Tooluck badge rendered width").toBeCloseTo(210, 1);
        expect(result.tooluckImageHeight, path + ": Tooluck badge rendered height").toBeCloseTo(55, 1);
        expect(
          Math.abs(result.tooluckImageWidth / result.tooluckImageHeight
            - result.tooluckNaturalWidth / result.tooluckNaturalHeight),
          path + ": the Tooluck badge must keep the 336x88 source ratio",
        ).toBeLessThan(0.02);
        // Issue #1012: the Altern badge keeps the maintainer's anchor, but
        // renders at the 430x151 source ratio instead of the supplied 150x32.
        expect(result.alternTarget, path + ": the Altern badge opens in a new tab").toBe("_blank");
        expect(result.alternRel, path + ": the Altern backlink must be noopener").toBe("noopener");
        expect(result.alternImageSrc, path + ": Altern badge image src").toBe("https://data.altern.ai/alternbadge.png");
        expect(result.alternImageWidth, path + ": Altern badge rendered width").toBeCloseTo(150, 1);
        expect(result.alternImageHeight, path + ": Altern badge rendered height").toBeCloseTo(52.67, 1);
        expect(
          Math.abs(result.alternImageWidth / result.alternImageHeight
            - result.alternNaturalWidth / result.alternNaturalHeight),
          path + ": the Altern badge must keep the source ratio",
        ).toBeLessThan(0.02);
        // Issue #1012: the badge is reachable from the keyboard and shows the
        // focus ring. Tab from the badge before it, as a keyboard visitor does.
        await page.locator('footer .footer-badges a[href="https://toolradar.com/tools/orbi"]').focus();
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const active = document.activeElement;
          const style = getComputedStyle(active);
          return {
            href: active?.getAttribute("href"),
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
          };
        });
        expect(focused.href, path + ": Tab from Toolradar must focus the Altern badge").toBe("https://altern.ai/ai/orbi");
        expect(focused.outlineStyle, path + ": the focused Altern badge needs a visible focus ring").not.toBe("none");
        expect(focused.outlineWidth, path + ": the focused Altern badge needs a visible focus ring").not.toBe("0px");
        // Issue #1015: the new last badge is reachable too, with the same ring.
        await page.keyboard.press("Tab");
        const next = await page.evaluate(() => {
          const active = document.activeElement;
          const style = getComputedStyle(active);
          return {
            href: active?.getAttribute("href"),
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
          };
        });
        expect(next.href, path + ": Tab from Altern must focus the SaaSpa.ge badge")
          .toBe("https://saaspa.ge/product/cmvdfiyyk000mjq06rc8auynb");
        expect(next.outlineStyle, path + ": the focused SaaSpa.ge badge needs a visible focus ring").not.toBe("none");
        expect(next.outlineWidth, path + ": the focused SaaSpa.ge badge needs a visible focus ring").not.toBe("0px");
        // Issue #1027: Tab from SaaSpa.ge enters the Tooluck badge with the
        // same ring, and one more Tab leaves the badge row — the row stays a
        // normal tab sequence, never a keyboard trap.
        await page.keyboard.press("Tab");
        const tooluck = await page.evaluate(() => {
          const active = document.activeElement;
          const style = getComputedStyle(active);
          return {
            href: active?.getAttribute("href"),
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
          };
        });
        expect(tooluck.href, path + ": Tab from SaaSpa.ge must focus the Tooluck badge")
          .toBe("https://www.tooluck.org/item/orbi");
        expect(tooluck.outlineStyle, path + ": the focused Tooluck badge needs a visible focus ring").not.toBe("none");
        expect(tooluck.outlineWidth, path + ": the focused Tooluck badge needs a visible focus ring").not.toBe("0px");
        await page.keyboard.press("Tab");
        const afterTooluck = await page.evaluate(() => {
          const active = document.activeElement;
          return {
            href: active?.getAttribute("href"),
            inBadges: Boolean(active?.closest(".footer-badges")),
          };
        });
        expect(afterTooluck.inBadges, path + ": Tab from Tooluck must leave the badge row").toBe(false);
        expect(afterTooluck.href, path + ": Tab from Tooluck must not stay on the badge")
          .not.toBe("https://www.tooluck.org/item/orbi");
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

// Issue #1021: the tagline is the wordmark's second line at every width. On
// desktop it used to sit in its own column to the right of the wordmark, and on
// a phone the grid's 34px gap landed between the two. The brand pair now sits
// 8px apart (design system space-2), the tagline left-aligned under the
// wordmark, while every other footer group keeps its 34px.
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

        // Artifacts read back by eye: at 1440 the brand pair stacks in the first
        // column beside the nav, at 390 it stacks with the first group a full
        // 34px below.
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
