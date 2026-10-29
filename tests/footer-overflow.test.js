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
        // The AI Agents Listing and zPlatform badges are loading="lazy", so they
        // only start loading once the footer is near the viewport: scroll it in
        // and let every placeholder decode before measuring their source ratio.
        await page.locator("footer .footer-badges").scrollIntoViewIfNeeded();
        await page.waitForFunction(
          () => [...document.querySelectorAll("footer .footer-badges img")]
            .every((image) => image.complete && image.naturalWidth > 0),
          null,
          { timeout: 10_000 },
        );
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
          const neeed = wrapper.querySelector('a[href="https://neeed.directory/products/orbi?utm_source=orbi"]');
          const neeedImage = neeed?.querySelector("img");
          const neeedRect = neeedImage?.getBoundingClientRect();
          const zplatform = wrapper.querySelector('a[href="https://zplatform.ai/"]');
          const zplatformImage = zplatform?.querySelector("img");
          const zplatformRect = zplatformImage?.getBoundingClientRect();
          const startup = wrapper.querySelector('a[href="https://startupproject.org/startups/"]');
          const nicklaunches = wrapper.querySelector('a[href="https://nicklaunches.com/products/orbi/"]');
          const nicklaunchesImage = nicklaunches?.querySelector("img");
          const nicklaunchesRect = nicklaunchesImage?.getBoundingClientRect();
          const devhub = wrapper.querySelector('a[href="https://devhub.best/projects/orbi?utm_source=badge"]');
          const devhubImage = devhub?.querySelector("img");
          const devhubRect = devhubImage?.getBoundingClientRect();
          const devhubImageSrc = devhubImage?.getAttribute("src");
          const devhubImageAlt = devhubImage?.getAttribute("alt");
          const startupfast = wrapper.querySelector('a[href="https://startupfa.st"]');
          const startupfastImage = startupfast?.querySelector("img");
          const startupfastRect = startupfastImage?.getBoundingClientRect();
          const artificin = wrapper.querySelector('a[href="https://artificin.com"]');
          const artificinImage = artificin?.querySelector("img");
          const artificinRect = artificinImage?.getBoundingClientRect();
          const aitooltrek = wrapper.querySelector('a[href="https://aitooltrek.com"]');
          const whatisaitools = wrapper.querySelector('a[href="https://whatisaitools.com/"]');
          // Issue #1096: two image badges and two text links share the row, so
          // the flex line must centre each of them. Group the wrapper's direct
          // children into rows by their vertical centre and report the worst
          // spread inside every row that carries one of the new entries.
          const newItems = [startupfast, artificin, aitooltrek, whatisaitools].filter(Boolean);
          const rows = [];
          for (const node of [...wrapper.children]) {
            const box = node.getBoundingClientRect();
            if (box.width === 0 && box.height === 0) continue;
            const centre = (box.top + box.bottom) / 2;
            const row = rows.find((candidate) => Math.abs(candidate.centre - centre) <= 2);
            if (row) row.items.push({ node, centre });
            else rows.push({ centre, items: [{ node, centre }] });
          }
          const mixedRowSpread = Math.max(0, ...rows
            .filter((row) => row.items.some((item) => newItems.includes(item.node)))
            .map((row) => Math.max(...row.items.map((item) => item.centre))
              - Math.min(...row.items.map((item) => item.centre))));
          const newItemOverflow = newItems
            .filter((node) => {
              const box = node.getBoundingClientRect();
              return box.left < 0 || box.right > document.documentElement.clientWidth;
            })
            .map((node) => node.getAttribute("href"));
          return {
            mixedRowSpread,
            newItemOverflow,
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
            neeedTarget: neeed?.getAttribute("target"),
            neeedRel: neeed?.getAttribute("rel"),
            neeedImageSrc: neeedImage?.getAttribute("src"),
            neeedImageAlt: neeedImage?.getAttribute("alt"),
            neeedImageWidth: neeedRect?.width,
            neeedImageHeight: neeedRect?.height,
            neeedNaturalWidth: neeedImage?.naturalWidth,
            neeedNaturalHeight: neeedImage?.naturalHeight,
            zplatformTarget: zplatform?.getAttribute("target"),
            zplatformRel: zplatform?.getAttribute("rel"),
            zplatformTitle: zplatform?.getAttribute("title"),
            zplatformLoading: zplatformImage?.getAttribute("loading"),
            zplatformImageSrc: zplatformImage?.getAttribute("src"),
            zplatformImageAlt: zplatformImage?.getAttribute("alt"),
            zplatformImageWidth: zplatformRect?.width,
            zplatformImageHeight: zplatformRect?.height,
            zplatformNaturalWidth: zplatformImage?.naturalWidth,
            zplatformNaturalHeight: zplatformImage?.naturalHeight,
            startupTarget: startup?.getAttribute("target"),
            startupRel: startup?.getAttribute("rel"),
            startupText: startup?.textContent?.trim(),
            startupHasImage: Boolean(startup?.querySelector("img")),
            nicklaunchesTarget: nicklaunches?.getAttribute("target"),
            nicklaunchesRel: nicklaunches?.getAttribute("rel"),
            nicklaunchesImageSrc: nicklaunchesImage?.getAttribute("src"),
            nicklaunchesImageAlt: nicklaunchesImage?.getAttribute("alt"),
            nicklaunchesImageWidth: nicklaunchesRect?.width,
            nicklaunchesImageHeight: nicklaunchesRect?.height,
            nicklaunchesNaturalWidth: nicklaunchesImage?.naturalWidth,
            nicklaunchesNaturalHeight: nicklaunchesImage?.naturalHeight,
            nicklaunchesDeclaredWidth: nicklaunchesImage?.getAttribute("width"),
            nicklaunchesDeclaredHeight: nicklaunchesImage?.getAttribute("height"),
            nicklaunchesLoading: nicklaunchesImage?.getAttribute("loading"),
            homepageAnchorCount: wrapper.querySelectorAll('a[href="https://nicklaunches.com/"]').length,
            devhubHref: devhub?.getAttribute("href"),
            devhubTarget: devhub?.getAttribute("target"),
            devhubRel: devhub?.getAttribute("rel"),
            devhubImageSrc,
            devhubImageAlt,
            devhubImageWidth: devhubRect?.width,
            devhubImageHeight: devhubRect?.height,
            devhubNaturalWidth: devhubImage?.naturalWidth,
            devhubNaturalHeight: devhubImage?.naturalHeight,
            devhubDeclaredWidth: devhubImage?.getAttribute("width"),
            devhubDeclaredHeight: devhubImage?.getAttribute("height"),
            devhubImageStyle: devhubImage?.getAttribute("style"),
            devhubLinkText: devhub?.textContent?.trim(),
            startupfastHref: startupfast?.getAttribute("href"),
            startupfastTarget: startupfast?.getAttribute("target"),
            startupfastRel: startupfast?.getAttribute("rel"),
            startupfastTitle: startupfast?.getAttribute("title"),
            startupfastImageSrc: startupfastImage?.getAttribute("src"),
            startupfastImageAlt: startupfastImage?.getAttribute("alt"),
            startupfastDeclaredWidth: startupfastImage?.getAttribute("width"),
            startupfastDeclaredHeight: startupfastImage?.getAttribute("height"),
            startupfastLoading: startupfastImage?.getAttribute("loading"),
            startupfastImageWidth: startupfastRect?.width,
            startupfastImageHeight: startupfastRect?.height,
            startupfastNaturalWidth: startupfastImage?.naturalWidth,
            startupfastNaturalHeight: startupfastImage?.naturalHeight,
            artificinHref: artificin?.getAttribute("href"),
            artificinTarget: artificin?.getAttribute("target"),
            artificinRel: artificin?.getAttribute("rel"),
            artificinImageSrc: artificinImage?.getAttribute("src"),
            artificinImageAlt: artificinImage?.getAttribute("alt"),
            artificinDeclaredWidth: artificinImage?.getAttribute("width"),
            artificinDeclaredHeight: artificinImage?.getAttribute("height"),
            artificinLoading: artificinImage?.getAttribute("loading"),
            artificinImageWidth: artificinRect?.width,
            artificinImageHeight: artificinRect?.height,
            artificinNaturalWidth: artificinImage?.naturalWidth,
            artificinNaturalHeight: artificinImage?.naturalHeight,
            aitooltrekTarget: aitooltrek?.getAttribute("target"),
            aitooltrekRel: aitooltrek?.getAttribute("rel"),
            aitooltrekText: aitooltrek?.textContent?.trim(),
            aitooltrekHasImage: Boolean(aitooltrek?.querySelector("img")),
            whatisaitoolsTarget: whatisaitools?.getAttribute("target"),
            whatisaitoolsRel: whatisaitools?.getAttribute("rel"),
            whatisaitoolsTitle: whatisaitools?.getAttribute("title"),
            whatisaitoolsText: whatisaitools?.textContent?.trim(),
            whatisaitoolsHasImage: Boolean(whatisaitools?.querySelector("img")),
          };
        });
        expect(result.wrapper, path + ": .footer-badges missing").toBe(true);
        expect(result.isLastChild, path + ": .footer-badges must be the last child of footer-friends").toBe(true);
        expect(result.wrapperTop, path + ": badges must sit below the text friends")
          .toBeGreaterThanOrEqual(result.lastTextFriendsBottom);
        // Issue #1038: every badge is 28px high by one shared rule, so the
        // boxes no longer depend on the vendor embeds' width/height
        // attributes. Only the structure and the rendered Altern / SaaSpa.ge /
        // Tooluck / neeed.directory / zPlatform boxes are asserted here; the
        // 28px contract for every badge image is the Issue #1038 suite below.
        // Issue #1092 appended the neeed.directory and zPlatform badges plus
        // The Startup Project text link (17 anchors), Issue #1094 the DevHub
        // badge, Issue #1096 the Startup Fast / Artificin badges plus the
        // AI Tool Trek / What Is Ai Tools text links and Issue #1099 the
        // ToolPotion badge: 23 now.
        expect(result.badgeCount, path + ": the footer badges").toBe(23);
        // Issue #1015: the SaaSpa.ge badge sits before the Tooluck badge added
        // by Issue #1027, carries the supplied target/rel and alt, and — since
        // Issue #1038 — renders 28px high in its 200x60 source ratio.
        expect(result.saaspaTarget, path + ": the SaaSpa.ge badge opens in a new tab").toBe("_blank");
        expect(result.saaspaRel, path + ": the SaaSpa.ge anchor keeps rel=nofollow").toBe("nofollow");
        expect(result.saaspaImageSrc, path + ": SaaSpa.ge badge image src")
          .toBe("https://saaspa.ge/api/embed/product/cmvdfiyyk000mjq06rc8auynb/badge.png?theme=black");
        expect(result.saaspaImageAlt, path + ": SaaSpa.ge badge image alt").toBe("Featured on Saaspa.ge");
        expect(result.saaspaImageWidth, path + ": SaaSpa.ge badge rendered width").toBeGreaterThan(0);
        expect(Math.abs(result.saaspaImageHeight - 28), path + ": SaaSpa.ge badge rendered height").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.saaspaImageWidth / result.saaspaImageHeight
            - result.saaspaNaturalWidth / result.saaspaNaturalHeight),
          path + ": the SaaSpa.ge badge must keep the source ratio",
        ).toBeLessThan(0.02);
        // Issue #1096 closed the row after the DevHub badge; Issue #1099
        // appends the ToolPotion badge, so that is the last entry now.
        expect(result.lastBadgeHref, path + ": the footer badges end with the ToolPotion badge")
          .toBe("https://toolpotion.ai/en/ai-agent/orbi");
        expect(result.tooluckTarget, path + ": the Tooluck badge opens in a new tab").toBe("_blank");
        expect(result.tooluckRel, path + ": the Tooluck anchor keeps noopener noreferrer").toBe("noopener noreferrer");
        expect(result.tooluckImageSrc, path + ": Tooluck badge image src")
          .toBe("https://www.tooluck.org/badges/tooluck-badge-dark.svg");
        expect(result.tooluckImageAlt, path + ": Tooluck badge image alt").toBe("Featured on Tooluck.org");
        expect(result.tooluckImageWidth, path + ": Tooluck badge rendered width").toBeGreaterThan(0);
        expect(Math.abs(result.tooluckImageHeight - 28), path + ": Tooluck badge rendered height").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.tooluckImageWidth / result.tooluckImageHeight
            - result.tooluckNaturalWidth / result.tooluckNaturalHeight),
          path + ": the Tooluck badge must keep the 336x88 source ratio",
        ).toBeLessThan(0.02);
        // Issue #1092: the neeed.directory badge is the 139x44 SVG with only a
        // width declared, so at the Issue #1038 height of 28px the rendered box
        // must follow the 139x44 placeholder ratio (139/44 * 28 = 88.45px
        // wide) instead of stretching to the declared width.
        expect(result.neeedTarget, path + ": the neeed.directory badge opens in a new tab").toBe("_blank");
        expect(result.neeedRel, path + ": the neeed.directory anchor keeps rel=noopener").toBe("noopener");
        expect(result.neeedImageSrc, path + ": neeed.directory badge image src")
          .toBe("https://neeed.directory/badges/neeed-badge-light.svg");
        expect(result.neeedImageAlt, path + ": neeed.directory badge image alt")
          .toBe("Featured on neeed.directory");
        expect(result.neeedImageWidth, path + ": neeed.directory badge rendered width").toBeGreaterThan(0);
        expect(Math.abs(result.neeedImageHeight - 28), path + ": neeed.directory badge rendered height").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.neeedImageWidth / result.neeedImageHeight
            - result.neeedNaturalWidth / result.neeedNaturalHeight),
          path + ": the neeed.directory badge must keep the 139x44 source ratio",
        ).toBeLessThan(0.02);
        // The zPlatform badge keeps the supplied 250x60 box and lazy-loads; the
        // placeholder is 250x60, so the 28px row must keep that ratio too.
        expect(result.zplatformTarget, path + ": the zPlatform badge opens in a new tab").toBe("_blank");
        expect(result.zplatformRel, path + ": the zPlatform anchor keeps rel=noopener").toBe("noopener");
        expect(result.zplatformTitle, path + ": the zPlatform badge keeps its tooltip").toBe("Featured on zPlatform.ai");
        expect(result.zplatformLoading, path + ": the zPlatform badge loads lazily").toBe("lazy");
        expect(result.zplatformImageSrc, path + ": zPlatform badge image src")
          .toBe("https://zplatform.ai/badges/zplatform-featured.png");
        expect(result.zplatformImageAlt, path + ": zPlatform badge image alt").toBe("Featured on zPlatform");
        expect(result.zplatformImageWidth, path + ": zPlatform badge rendered width").toBeGreaterThan(0);
        expect(Math.abs(result.zplatformImageHeight - 28), path + ": zPlatform badge rendered height").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.zplatformImageWidth / result.zplatformImageHeight
            - result.zplatformNaturalWidth / result.zplatformNaturalHeight),
          path + ": the zPlatform badge must keep the 250x60 source ratio",
        ).toBeLessThan(0.02);
        // The Startup Project is a text link in the same row, next tab and new tab.
        expect(result.startupTarget, path + ": The Startup Project opens in a new tab").toBe("_blank");
        expect(result.startupRel, path + ": The Startup Project keeps rel=noopener").toBe("noopener");
        expect(result.startupHasImage, path + ": The Startup Project stays a text link").toBe(false);
        expect(result.startupText, path + ": The Startup Project link text")
          .toBe("Featured on The Startup Project");
        // Issue #1094: the NickLaunches badge keeps every attribute and only
        // moves its href to the Orbi entry page — 244x56 declared, lazy, a new
        // tab and a crawlable (no nofollow) backlink the directory can verify.
        expect(result.homepageAnchorCount, path + ": no badge may still link the NickLaunches homepage").toBe(0);
        expect(result.nicklaunchesTarget, path + ": the NickLaunches badge opens in a new tab").toBe("_blank");
        expect(result.nicklaunchesRel, path + ": the NickLaunches anchor keeps rel=noopener").toBe("noopener");
        expect(result.nicklaunchesRel, path + ": the NickLaunches backlink must stay crawlable").not.toContain("nofollow");
        expect(result.nicklaunchesImageSrc, path + ": NickLaunches badge image src")
          .toBe("https://nicklaunches.com/badges/featured.png");
        expect(result.nicklaunchesImageAlt, path + ": NickLaunches badge image alt")
          .toBe("Featured on Nick Launches");
        expect(result.nicklaunchesDeclaredWidth, path + ": NickLaunches keeps its declared width").toBe("244");
        expect(result.nicklaunchesDeclaredHeight, path + ": NickLaunches keeps its declared height").toBe("56");
        expect(result.nicklaunchesLoading, path + ": NickLaunches keeps loading=lazy").toBe("lazy");
        expect(result.nicklaunchesImageHeight, path + ": NickLaunches badge rendered height").toBeGreaterThan(0);
        expect(
          Math.abs(result.nicklaunchesImageWidth / result.nicklaunchesImageHeight
            - result.nicklaunchesNaturalWidth / result.nicklaunchesNaturalHeight),
          path + ": the NickLaunches badge must keep its source ratio",
        ).toBeLessThan(0.02);
        // Issue #1094: the DevHub badge is the last anchor. The vendor's
        // href/target/rel/src/alt ship unchanged (Verify Backlink rejects
        // nofollow, so the anchor stays crawlable), and the inline
        // style="height:44px;width:auto" became the 150x44 attributes of the
        // source SVG. The placeholder the guard serves is 150x44 as well, so
        // the 28px row must render 150/44 * 28 = 95.45px wide, not stretch.
        expect(result.devhubHref, path + ": the DevHub badge href")
          .toBe("https://devhub.best/projects/orbi?utm_source=badge");
        expect(result.devhubTarget, path + ": the DevHub badge opens in a new tab").toBe("_blank");
        expect(result.devhubRel, path + ": the DevHub anchor keeps noopener noreferrer").toBe("noopener noreferrer");
        expect(result.devhubRel, path + ": the DevHub backlink must stay crawlable").not.toContain("nofollow");
        expect(result.devhubImageSrc, path + ": DevHub badge image src")
          .toBe("https://r2.direasy-multi-tenant.focusapps.app/uploads/616d0b1a-3979-4b8c-94d1-b4f1fedd3ead/1783239702078/53yqmim54zv/featured-on-light.svg");
        expect(result.devhubImageAlt, path + ": DevHub badge image alt").toBe("Featured on DevHub");
        expect(result.devhubDeclaredWidth, path + ": the DevHub badge declares the 150px source width").toBe("150");
        expect(result.devhubDeclaredHeight, path + ": the DevHub badge declares the 44px source height").toBe("44");
        expect(result.devhubImageStyle, path + ": the DevHub badge carries no inline style").toBeNull();
        expect(result.devhubLinkText, path + ": the DevHub badge is an image link").toBe("");
        expect(result.devhubNaturalWidth, path + ": the DevHub placeholder is 150px wide").toBe(150);
        expect(result.devhubNaturalHeight, path + ": the DevHub placeholder is 44px high").toBe(44);
        expect(Math.abs(result.devhubImageHeight - 28), path + ": the DevHub badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.devhubImageWidth / result.devhubImageHeight
            - result.devhubNaturalWidth / result.devhubNaturalHeight),
          path + ": the DevHub badge must keep the 150x44 source ratio",
        ).toBeLessThan(0.02);
        // Issue #1096: the Startup Fast embed declares the source SVG's
        // 119x50 instead of the vendor snippet's 150x44, so the badge cannot
        // squash; the guard's placeholder is the same 119x50, and the 28px row
        // therefore renders it 119/50 * 28 = 66.6px wide.
        expect(result.startupfastHref, path + ": the Startup Fast badge href").toBe("https://startupfa.st");
        expect(result.startupfastTarget, path + ": the Startup Fast badge opens in a new tab").toBe("_blank");
        expect(result.startupfastRel, path + ": the Startup Fast anchor keeps rel=noopener").toBe("noopener");
        expect(result.startupfastRel, path + ": the Startup Fast backlink must stay crawlable").not.toContain("nofollow");
        expect(result.startupfastTitle, path + ": the Startup Fast badge title").toBe("Powered by Startup Fast");
        expect(result.startupfastImageSrc, path + ": the Startup Fast badge image src")
          .toBe("https://startupfa.st/images/badges/powered-by-dark.svg");
        expect(result.startupfastImageAlt, path + ": the Startup Fast badge image alt").toBe("Powered by Startup Fast");
        expect(result.startupfastDeclaredWidth, path + ": the Startup Fast badge declares the 119px source width").toBe("119");
        expect(result.startupfastDeclaredHeight, path + ": the Startup Fast badge declares the 50px source height").toBe("50");
        expect(result.startupfastLoading, path + ": the Startup Fast badge loads lazily").toBe("lazy");
        expect(result.startupfastNaturalWidth, path + ": the Startup Fast placeholder is 119px wide").toBe(119);
        expect(result.startupfastNaturalHeight, path + ": the Startup Fast placeholder is 50px high").toBe(50);
        expect(Math.abs(result.startupfastImageHeight - 28), path + ": the Startup Fast badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.startupfastImageWidth / result.startupfastImageHeight
            - result.startupfastNaturalWidth / result.startupfastNaturalHeight),
          path + ": the Startup Fast badge must keep the 119x50 source ratio",
        ).toBeLessThan(0.02);
        // The Artificin PNG is 551x175; the declared 139x44 is that ratio
        // rounded to whole pixels, and the 28px row keeps it.
        expect(result.artificinHref, path + ": the Artificin badge href").toBe("https://artificin.com");
        expect(result.artificinTarget, path + ": the Artificin badge opens in a new tab").toBe("_blank");
        expect(result.artificinRel, path + ": the Artificin anchor keeps rel=noopener").toBe("noopener");
        expect(result.artificinRel, path + ": the Artificin backlink must stay crawlable").not.toContain("nofollow");
        expect(result.artificinImageSrc, path + ": the Artificin badge image src")
          .toBe("https://artificin.com/badges/Artificin-badge.png");
        expect(result.artificinImageAlt, path + ": the Artificin badge image alt").toBe("Featured on Artificin");
        expect(result.artificinDeclaredWidth, path + ": the Artificin badge declares the 139px width").toBe("139");
        expect(result.artificinDeclaredHeight, path + ": the Artificin badge declares the 44px height").toBe("44");
        expect(result.artificinLoading, path + ": the Artificin badge loads lazily").toBe("lazy");
        expect(result.artificinNaturalWidth, path + ": the Artificin placeholder is 551px wide").toBe(551);
        expect(result.artificinNaturalHeight, path + ": the Artificin placeholder is 175px high").toBe(175);
        expect(Math.abs(result.artificinImageHeight - 28), path + ": the Artificin badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.artificinImageWidth / result.artificinImageHeight
            - result.artificinNaturalWidth / result.artificinNaturalHeight),
          path + ": the Artificin badge must keep the 551x175 source ratio",
        ).toBeLessThan(0.02);
        // The two text links reuse the text-friend treatment: no image, new
        // tab, noopener, no nofollow.
        expect(result.aitooltrekTarget, path + ": AI Tool Trek opens in a new tab").toBe("_blank");
        expect(result.aitooltrekRel, path + ": the AI Tool Trek anchor keeps rel=noopener").toBe("noopener");
        expect(result.aitooltrekText, path + ": the AI Tool Trek link text").toBe("AI Tool Trek");
        expect(result.aitooltrekHasImage, path + ": AI Tool Trek is a text link").toBe(false);
        expect(result.whatisaitoolsTarget, path + ": What Is Ai Tools opens in a new tab").toBe("_blank");
        expect(result.whatisaitoolsRel, path + ": the What Is Ai Tools anchor keeps rel=noopener").toBe("noopener");
        expect(result.whatisaitoolsTitle, path + ": the What Is Ai Tools link title").toBe("What Is Ai Tools");
        expect(result.whatisaitoolsText, path + ": the What Is Ai Tools link text").toBe("What Is Ai Tools");
        expect(result.whatisaitoolsHasImage, path + ": What Is Ai Tools is a text link").toBe(false);
        // Issue #1096: the badges and the text links share the row, so every
        // flex line carrying a new entry is centred (align-items:center) and
        // none of the four sticks out of the viewport.
        expect(result.mixedRowSpread, path + ": the new badges and text links must share one centred line")
          .toBeLessThanOrEqual(1.5);
        expect(result.newItemOverflow, path + ": the new links stay inside the viewport").toEqual([]);
        // Issue #1012: the Altern badge keeps the maintainer's anchor and
        // renders at the 430x151 source ratio instead of the supplied 150x32;
        // Issue #1038 then caps the height at 28px.
        expect(result.alternTarget, path + ": the Altern badge opens in a new tab").toBe("_blank");
        expect(result.alternRel, path + ": the Altern backlink must be noopener").toBe("noopener");
        expect(result.alternImageSrc, path + ": Altern badge image src").toBe("https://data.altern.ai/alternbadge.png");
        expect(result.alternImageWidth, path + ": Altern badge rendered width").toBeGreaterThan(0);
        expect(Math.abs(result.alternImageHeight - 28), path + ": Altern badge rendered height").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.alternImageWidth / result.alternImageHeight
            - result.alternNaturalWidth / result.alternNaturalHeight),
          path + ": the Altern badge must keep the source ratio",
        ).toBeLessThan(0.02);
        // Issue #1012: the badge is reachable from the keyboard and shows the
        // focus ring. Tab from the badge before it, as a keyboard visitor does.
        await page.locator('footer .footer-badges a[href="https://dofollow.tools"]').focus();
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
        // Issue #1092: the two new badges and The Startup Project text link sit
        // in the same tab sequence after Tooluck, each with the visible ring;
        // one more Tab leaves the row, so the row is never a keyboard trap.
        // Issue #1094 tabs through the DevHub badge, Issue #1096 through the
        // Startup Fast / Artificin badges and the two text links, Issue #1099
        // through the ToolPotion badge, then leaves.
        const newBadgeHrefs = [
          "https://neeed.directory/products/orbi?utm_source=orbi",
          "https://zplatform.ai/",
          "https://startupproject.org/startups/",
          "https://devhub.best/projects/orbi?utm_source=badge",
          "https://startupfa.st",
          "https://artificin.com",
          "https://aitooltrek.com",
          "https://whatisaitools.com/",
          "https://toolpotion.ai/en/ai-agent/orbi",
        ];
        for (const [index, href] of newBadgeHrefs.entries()) {
          await page.keyboard.press("Tab");
          const step = await page.evaluate(() => {
            const active = document.activeElement;
            const style = getComputedStyle(active);
            return {
              href: active?.getAttribute("href"),
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
            };
          });
          expect(step.href, path + ": Tab step " + (index + 1) + " after Tooluck").toBe(href);
          expect(step.outlineStyle, path + ": the focused " + href + " needs a visible focus ring").not.toBe("none");
          expect(step.outlineWidth, path + ": the focused " + href + " needs a visible focus ring").not.toBe("0px");
        }
        await page.keyboard.press("Tab");
        const afterStartup = await page.evaluate(() => {
          const active = document.activeElement;
          return {
            href: active?.getAttribute("href"),
            inBadges: Boolean(active?.closest(".footer-badges")),
          };
        });
        expect(afterStartup.inBadges, path + ": Tab from the ToolPotion badge must leave the badge row").toBe(false);
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

// Issue #1038: the maintainer asked for the directory badges to shrink — the
// 42 / 52.67 / 55 / 60px boxes read as noise under the footer links. One shared
// CSS rule now sets every badge to 28px high (the design system's size-mark)
// and lets each image keep its own source ratio, so the row is compact without
// squashing or cropping any embed.
describe("the footer directory badges render 28px high (Issue #1038)", () => {
  const badgeHrefs = [
    "https://launchnest.io/p/orbi",
    "https://aiagentsdirectory.com/agent/orbi",
    "https://aiagentslisting.com/orbi?utm_source=aiagentslisting&utm_medium=badge&utm_campaign=embed",
    "https://toolradar.com/tools/orbi",
    "https://nicklaunches.com/products/orbi/",
    "https://yourhack.ai",
    "https://showmebest.ai",
    "https://goodaitools.com/ai/orbi",
    "https://aixcollection.com/ai/orbi",
    "https://launchtory.com/projects/orbi-build",
    "https://dofollow.tools",
    "https://altern.ai/ai/orbi",
    "https://saaspa.ge/product/cmvdfiyyk000mjq06rc8auynb",
    "https://www.tooluck.org/item/orbi",
    "https://neeed.directory/products/orbi?utm_source=orbi",
    "https://zplatform.ai/",
    "https://startupproject.org/startups/",
    "https://devhub.best/projects/orbi?utm_source=badge",
    "https://startupfa.st",
    "https://artificin.com",
    "https://aitooltrek.com",
    "https://whatisaitools.com/",
    "https://toolpotion.ai/en/ai-agent/orbi",
  ];

  // The AI Agents Listing and zPlatform badges are loading="lazy", so they only
  // start loading once the footer is near the viewport: scroll it in and let
  // every placeholder decode before measuring.
  const loadBadges = async (page) => {
    await page.locator("footer .footer-badges").scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () => [...document.querySelectorAll("footer .footer-badges img")]
        .every((image) => image.complete && image.naturalWidth > 0),
      null,
      { timeout: 10_000 },
    );
  };

  const measureBadges = (page) => page.locator("footer .footer-badges img").evaluateAll((images) =>
    images.map((image) => {
      const rect = image.getBoundingClientRect();
      return {
        alt: image.alt,
        width: rect.width,
        height: rect.height,
        top: Math.round(rect.top),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      };
    }));

  for (const [name, path] of [["home-en", "/"], ["home-zh", "/zh/"]]) {
    it(name + " renders every badge 28px high in their source ratio", async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl + path, { waitUntil: "load", timeout: 25_000 });

        const expectBadges = (badges, label) => {
          // Issue #1092 added the neeed.directory and zPlatform images (14),
          // Issue #1094 the DevHub image, Issue #1096 the Startup Fast and
          // Artificin images and Issue #1099 the ToolPotion image: 18 badge
          // images in the row.
          expect(badges, label + ": badge count").toHaveLength(18);
          for (const badge of badges) {
            expect(badge.naturalWidth, label + ": " + badge.alt + " placeholder loaded").toBeGreaterThan(0);
            expect(badge.width, label + ": " + badge.alt + " rendered width").toBeGreaterThan(0);
            expect(
              Math.abs(badge.height - 28),
              label + ": " + badge.alt + " rendered height (28px, 1px rounding)",
            ).toBeLessThanOrEqual(1);
            expect(
              Math.abs(badge.width / badge.height - badge.naturalWidth / badge.naturalHeight),
              label + ": " + badge.alt + " must keep its source ratio",
            ).toBeLessThan(0.02);
          }
        };

        await loadBadges(page);
        const desktop = await measureBadges(page);
        expectBadges(desktop, path + " at 1440px");
        // At 28px high almost the whole row fits one line, so the boxes stay
        // compact instead of each taking a line of its own.
        expect(new Set(desktop.map((badge) => badge.top)).size, path + " at 1440px: the badges stay compact").toBeLessThanOrEqual(3);

        await page.locator("footer.site-footer").screenshot({ path: ".orbi/footer-badges-28px-" + name + "-1440.png" });

        // The badge row stays a normal tab sequence: every link in the source
        // order, each with a visible ring, and the next Tab leaves the row.
        await page.locator('footer nav.footer-friends > a[href="https://agentic.ai/best/free-coding-agents"]').focus();
        const visited = [];
        for (let step = 0; step < badgeHrefs.length; step += 1) {
          await page.keyboard.press("Tab");
          visited.push(await page.evaluate(() => {
            const active = document.activeElement;
            const style = getComputedStyle(active);
            return {
              href: active?.getAttribute("href"),
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
            };
          }));
        }
        expect(visited.map((step) => step.href), path + ": Tab order through the badges").toEqual(badgeHrefs);
        for (const [index, step] of visited.entries()) {
          expect(step.outlineStyle, path + ": badge " + (index + 1) + " needs a visible focus ring").not.toBe("none");
          expect(step.outlineWidth, path + ": badge " + (index + 1) + " needs a visible focus ring").not.toBe("0px");
        }
        await page.keyboard.press("Tab");
        expect(
          await page.evaluate(() => Boolean(document.activeElement?.closest(".footer-badges"))),
          path + ": Tab after the last badge link must leave the badge row",
        ).toBe(false);

        // 390px: the same 28px height, natural wrapping, nothing clipped.
        await page.setViewportSize({ width: 390, height: 900 });
        await page.waitForTimeout(150);
        await loadBadges(page);
        const phone = await measureBadges(page);
        expectBadges(phone, path + " at 390px");
        expect(new Set(phone.map((badge) => badge.top)).size, path + " at 390px: the badges wrap").toBeGreaterThan(1);
        const phoneLayout = await page.evaluate(() => {
          const documentElement = document.documentElement;
          const badges = [...document.querySelectorAll("footer .footer-badges img")];
          return {
            overflow: documentElement.scrollWidth - documentElement.clientWidth,
            clipped: badges
              .filter((badge) => {
                const rect = badge.getBoundingClientRect();
                return rect.left < 0 || rect.right > documentElement.clientWidth;
              })
              .map((badge) => badge.alt),
          };
        });
        expect(phoneLayout.overflow, path + " at 390px: document overflow").toBe(0);
        expect(phoneLayout.clipped, path + " at 390px: badges stay inside the viewport").toEqual([]);
        await page.locator("footer.site-footer").screenshot({ path: ".orbi/footer-badges-28px-" + name + "-390.png" });
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
