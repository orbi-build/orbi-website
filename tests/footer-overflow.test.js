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
              // Issue #1173: the badge strip is a marquee — the links on it run
              // past the row by design and are clipped by the strip — so only
              // the links outside it are held to the footer's edges, and the
              // strip itself must stay inside them.
              linksOutsideFooter: links
                .filter((link) => !link.closest(".footer-badges"))
                .some((link) => {
                  const linkRect = link.getBoundingClientRect();
                  return linkRect.left < rect.left || linkRect.right > rect.right;
                }),
              stripInsideFooter: (() => {
                const strip = element.querySelector(".footer-badges");
                if (!strip) return false;
                const stripRect = strip.getBoundingClientRect();
                return stripRect.left >= rect.left - 1 && stripRect.right <= rect.right + 1;
              })(),
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
          expect(result.stripInsideFooter, `${path} at ${width}px badge strip inside the footer`).toBe(true);
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

describe("footer directory badges are one strip inside the friends row (Issues #805, #1173)", () => {
  for (const [name, path] of [["home-en", "/"], ["home-zh", "/zh/"]]) {
    it(name + " keeps every badge on one strip, beside the label and the pause button", async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl + path, { waitUntil: "load", timeout: 25_000 });
        const footer = page.locator("footer.site-footer");
        // Issue #1187: every strip badge loads with the page — no badge defers
        // its image — so the whole strip is decoded by the load event and these
        // source-ratio assertions measure real images, not lazy placeholders.
        await page.locator("footer .footer-badges").scrollIntoViewIfNeeded();
        await page.waitForFunction(
          () => [...document.querySelectorAll("footer .footer-badges [data-footer-badges-track] img")]
            .every((image) => image.complete && image.naturalWidth > 0),
          null,
          { timeout: 10_000 },
        );
        const result = await footer.evaluate((element) => {
          const nav = element.querySelector("nav.footer-friends");
          const wrapper = nav.querySelector(".footer-badges");
          // Issue #1173: the strip in the page source is the single copy of the
          // badges; demo.js appends the marquee's duplicate track at runtime, so
          // every lookup below stays inside [data-footer-badges-track].
          const track = wrapper?.querySelector("[data-footer-badges-track]");
          if (!track) return { wrapper: false };
          const round = (value) => Math.round(value);
          const label = nav.querySelector(".footer-friends-label");
          const toggle = nav.querySelector("[data-footer-badges-toggle]");
          const badges = [...track.querySelectorAll(":scope > a")];
          const altern = track.querySelector('a[href="https://altern.ai/ai/orbi"]');
          const alternImage = altern?.querySelector("img");
          const imageRect = alternImage?.getBoundingClientRect();
          const saaspa = track.querySelector('a[href="https://saaspa.ge/product/cmvdfiyyk000mjq06rc8auynb"]');
          const saaspaImage = saaspa?.querySelector("img");
          const saaspaRect = saaspaImage?.getBoundingClientRect();
          const tooluck = track.querySelector('a[href="https://www.tooluck.org/item/orbi"]');
          const tooluckImage = tooluck?.querySelector("img");
          const tooluckRect = tooluckImage?.getBoundingClientRect();
          const neeed = track.querySelector('a[href="https://neeed.directory/products/orbi?utm_source=orbi"]');
          const neeedImage = neeed?.querySelector("img");
          const neeedRect = neeedImage?.getBoundingClientRect();
          const zplatform = track.querySelector('a[href="https://zplatform.ai/"]');
          const zplatformImage = zplatform?.querySelector("img");
          const zplatformRect = zplatformImage?.getBoundingClientRect();
          const startup = track.querySelector('a[href="https://startupproject.org/startups/"]');
          const nicklaunches = track.querySelector('a[href="https://nicklaunches.com/products/orbi/"]');
          const nicklaunchesImage = nicklaunches?.querySelector("img");
          const nicklaunchesRect = nicklaunchesImage?.getBoundingClientRect();
          const devhub = track.querySelector('a[href="https://devhub.best/projects/orbi?utm_source=badge"]');
          const devhubImage = devhub?.querySelector("img");
          const devhubRect = devhubImage?.getBoundingClientRect();
          const devhubImageSrc = devhubImage?.getAttribute("src");
          const devhubImageAlt = devhubImage?.getAttribute("alt");
          const startupfast = track.querySelector('a[href="https://startupfa.st"]');
          const startupfastImage = startupfast?.querySelector("img");
          const startupfastRect = startupfastImage?.getBoundingClientRect();
          const artificin = track.querySelector('a[href="https://artificin.com"]');
          const artificinImage = artificin?.querySelector("img");
          const artificinRect = artificinImage?.getBoundingClientRect();
          const aitooltrek = track.querySelector('a[href="https://aitooltrek.com"]');
          const whatisaitools = track.querySelector('a[href="https://whatisaitools.com/"]');
          const fazier = track.querySelector('a[href="https://fazier.com"]');
          const fazierImage = fazier?.querySelector("img");
          const fazierRect = fazierImage?.getBoundingClientRect();
          // Issue #1116: four directory badges close the row after the Fazier
          // badge; dang.ai's verified badge replaced the Issue #1110 text link.
          const turbo0 = track.querySelector('a[href="https://turbo0.com/item/orbi"]');
          const turbo0Image = turbo0?.querySelector("img");
          const turbo0Rect = turbo0Image?.getBoundingClientRect();
          const toolfame = track.querySelector('a[href="https://toolfame.com/item/orbi"]');
          const toolfameImage = toolfame?.querySelector("img");
          const toolfameRect = toolfameImage?.getBoundingClientRect();
          const dang = track.querySelector('a[href="https://dang.ai"]');
          const dangImage = dang?.querySelector("img");
          const dangRect = dangImage?.getBoundingClientRect();
          // Issue #1119: Scout Forge closes the row so the directory counts the
          // badge's impressions.
          const scoutforge = track.querySelector('a[href="https://scoutforge.net/apps/orbi?ref=badge"]');
          const scoutforgeImage = scoutforge?.querySelector("img");
          const scoutforgeRect = scoutforgeImage?.getBoundingClientRect();
          // Issue #1129: Findly.tools; its badge is the source SVG's own
          // 139x44 box in the shared 28px row.
          const findly = track.querySelector('a[href="https://findly.tools/orbi?utm_source=orbi"]');
          const findlyImage = findly?.querySelector("img");
          const findlyRect = findlyImage?.getBoundingClientRect();
          // Issue #1132: founder.best and makeitla.st close the row after the
          // Findly.tools badge, each in its own source box (1195x390 and
          // 252x76, both measured on the live SVG).
          const founderBest = track.querySelector('a[href="https://www.founder.best?ref=founderbest&utm_source=founder.best&utm_medium=referral"]');
          const founderBestImage = founderBest?.querySelector("img");
          const founderBestRect = founderBestImage?.getBoundingClientRect();
          const makeitlast = track.querySelector('a[href="https://www.makeitla.st/"]');
          const makeitlastImage = makeitlast?.querySelector("img");
          const makeitlastRect = makeitlastImage?.getBoundingClientRect();
          // Issue #1134: the four directory badges that close the row after
          // makeitla.st. Uno Directory and SaaSCity declare a box that is not
          // their live SVG's own size (120x30 vs 146x44, 150x54 vs 210x80) and
          // LaunchVault declares only a height, so the rendered box is where
          // the intrinsic ratio shows up.
          const aiForDevelopers = track.querySelector('a[href="https://aifordevelopers.org"]');
          const aiForDevelopersImage = aiForDevelopers?.querySelector("img");
          const aiForDevelopersRect = aiForDevelopersImage?.getBoundingClientRect();
          const unoDirectory = track.querySelector('a[href="https://uno.directory"]');
          const unoDirectoryImage = unoDirectory?.querySelector("img");
          const unoDirectoryRect = unoDirectoryImage?.getBoundingClientRect();
          const saascity = track.querySelector('a[href="https://saascity.io"]');
          const saascityImage = saascity?.querySelector("img");
          const saascityRect = saascityImage?.getBoundingClientRect();
          const launchvault = track.querySelector('a[href="https://launchvault.dev"]');
          const launchvaultImage = launchvault?.querySelector("img");
          const launchvaultRect = launchvaultImage?.getBoundingClientRect();
          // Issue #1096: image badges and text links share the row, so the flex
          // line must centre each of them. Group the strip's entries by their
          // vertical centre and report the worst spread inside every row that
          // carries one of the new entries. Issue #1173 put every entry on that
          // one line, so there is exactly one row now.
          const newItems = [startupfast, artificin, aitooltrek, whatisaitools, turbo0, toolfame, dang, scoutforge, findly, founderBest, makeitlast, aiForDevelopers, unoDirectory, saascity, launchvault].filter(Boolean);
          const rows = [];
          for (const node of [...track.children]) {
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
          const centre = (node) => {
            const box = node.getBoundingClientRect();
            return round((box.top + box.bottom) / 2);
          };
          return {
            mixedRowSpread,
            rowCount: rows.length,
            documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            wrapper: true,
            labelFirst: nav.firstElementChild === label,
            toggleLast: nav.lastElementChild === toggle,
            labelCentre: centre(label),
            stripCentre: centre(wrapper),
            toggleCentre: centre(toggle),
            stripAnchorCount: badges.length,
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
            fazierTarget: fazier?.getAttribute("target"),
            fazierRel: fazier?.getAttribute("rel"),
            fazierImageSrc: fazierImage?.getAttribute("src"),
            fazierImageAlt: fazierImage?.getAttribute("alt"),
            fazierDeclaredWidth: fazierImage?.getAttribute("width"),
            fazierImageWidth: fazierRect?.width,
            fazierImageHeight: fazierRect?.height,
            fazierNaturalWidth: fazierImage?.naturalWidth,
            fazierNaturalHeight: fazierImage?.naturalHeight,
            turbo0Target: turbo0?.getAttribute("target"),
            turbo0Rel: turbo0?.getAttribute("rel"),
            turbo0ImageSrc: turbo0Image?.getAttribute("src"),
            turbo0ImageAlt: turbo0Image?.getAttribute("alt"),
            turbo0DeclaredWidth: turbo0Image?.getAttribute("width"),
            turbo0DeclaredHeight: turbo0Image?.getAttribute("height"),
            turbo0ImageWidth: turbo0Rect?.width,
            turbo0ImageHeight: turbo0Rect?.height,
            turbo0NaturalWidth: turbo0Image?.naturalWidth,
            turbo0NaturalHeight: turbo0Image?.naturalHeight,
            toolfameTarget: toolfame?.getAttribute("target"),
            toolfameRel: toolfame?.getAttribute("rel"),
            toolfameImageSrc: toolfameImage?.getAttribute("src"),
            toolfameImageAlt: toolfameImage?.getAttribute("alt"),
            toolfameDeclaredWidth: toolfameImage?.getAttribute("width"),
            toolfameDeclaredHeight: toolfameImage?.getAttribute("height"),
            toolfameImageWidth: toolfameRect?.width,
            toolfameImageHeight: toolfameRect?.height,
            toolfameNaturalWidth: toolfameImage?.naturalWidth,
            toolfameNaturalHeight: toolfameImage?.naturalHeight,
            dangTarget: dang?.getAttribute("target"),
            dangRel: dang?.getAttribute("rel"),
            dangImageSrc: dangImage?.getAttribute("src"),
            dangImageAlt: dangImage?.getAttribute("alt"),
            dangDeclaredWidth: dangImage?.getAttribute("width"),
            dangDeclaredHeight: dangImage?.getAttribute("height"),
            dangText: dang?.textContent,
            dangHasImage: Boolean(dangImage),
            dangImageWidth: dangRect?.width,
            dangImageHeight: dangRect?.height,
            dangNaturalWidth: dangImage?.naturalWidth,
            dangNaturalHeight: dangImage?.naturalHeight,
            scoutforgeTarget: scoutforge?.getAttribute("target"),
            scoutforgeRel: scoutforge?.getAttribute("rel"),
            scoutforgeHref: scoutforge?.getAttribute("href"),
            scoutforgeImageSrc: scoutforgeImage?.getAttribute("src"),
            scoutforgeImageAlt: scoutforgeImage?.getAttribute("alt"),
            scoutforgeDeclaredWidth: scoutforgeImage?.getAttribute("width"),
            scoutforgeDeclaredHeight: scoutforgeImage?.getAttribute("height"),
            scoutforgeImageStyle: scoutforgeImage?.getAttribute("style"),
            scoutforgeImageWidth: scoutforgeRect?.width,
            scoutforgeImageHeight: scoutforgeRect?.height,
            scoutforgeNaturalWidth: scoutforgeImage?.naturalWidth,
            scoutforgeNaturalHeight: scoutforgeImage?.naturalHeight,
            findlyHref: findly?.getAttribute("href"),
            findlyTarget: findly?.getAttribute("target"),
            findlyRel: findly?.getAttribute("rel"),
            findlyImageSrc: findlyImage?.getAttribute("src"),
            findlyImageAlt: findlyImage?.getAttribute("alt"),
            findlyDeclaredWidth: findlyImage?.getAttribute("width"),
            findlyDeclaredHeight: findlyImage?.getAttribute("height"),
            findlyImageWidth: findlyRect?.width,
            findlyImageHeight: findlyRect?.height,
            findlyNaturalWidth: findlyImage?.naturalWidth,
            findlyNaturalHeight: findlyImage?.naturalHeight,
            founderBestHref: founderBest?.getAttribute("href"),
            founderBestTarget: founderBest?.getAttribute("target"),
            founderBestRel: founderBest?.getAttribute("rel"),
            founderBestImageSrc: founderBestImage?.getAttribute("src"),
            founderBestImageAlt: founderBestImage?.getAttribute("alt"),
            founderBestDeclaredWidth: founderBestImage?.getAttribute("width"),
            founderBestDeclaredHeight: founderBestImage?.getAttribute("height"),
            founderBestImageWidth: founderBestRect?.width,
            founderBestImageHeight: founderBestRect?.height,
            founderBestNaturalWidth: founderBestImage?.naturalWidth,
            founderBestNaturalHeight: founderBestImage?.naturalHeight,
            makeitlastHref: makeitlast?.getAttribute("href"),
            makeitlastTitle: makeitlast?.getAttribute("title"),
            makeitlastRel: makeitlast?.getAttribute("rel"),
            makeitlastImageSrc: makeitlastImage?.getAttribute("src"),
            makeitlastImageAlt: makeitlastImage?.getAttribute("alt"),
            makeitlastDeclaredWidth: makeitlastImage?.getAttribute("width"),
            makeitlastDeclaredHeight: makeitlastImage?.getAttribute("height"),
            makeitlastImageWidth: makeitlastRect?.width,
            makeitlastImageHeight: makeitlastRect?.height,
            makeitlastNaturalWidth: makeitlastImage?.naturalWidth,
            makeitlastNaturalHeight: makeitlastImage?.naturalHeight,
            aiForDevelopersHref: aiForDevelopers?.getAttribute("href"),
            aiForDevelopersTarget: aiForDevelopers?.getAttribute("target"),
            aiForDevelopersRel: aiForDevelopers?.getAttribute("rel"),
            aiForDevelopersImageSrc: aiForDevelopersImage?.getAttribute("src"),
            aiForDevelopersImageAlt: aiForDevelopersImage?.getAttribute("alt"),
            aiForDevelopersDeclaredWidth: aiForDevelopersImage?.getAttribute("width"),
            aiForDevelopersDeclaredHeight: aiForDevelopersImage?.getAttribute("height"),
            aiForDevelopersImageWidth: aiForDevelopersRect?.width,
            aiForDevelopersImageHeight: aiForDevelopersRect?.height,
            aiForDevelopersNaturalWidth: aiForDevelopersImage?.naturalWidth,
            aiForDevelopersNaturalHeight: aiForDevelopersImage?.naturalHeight,
            unoDirectoryHref: unoDirectory?.getAttribute("href"),
            unoDirectoryTarget: unoDirectory?.getAttribute("target"),
            unoDirectoryRel: unoDirectory?.getAttribute("rel"),
            unoDirectoryImageSrc: unoDirectoryImage?.getAttribute("src"),
            unoDirectoryImageAlt: unoDirectoryImage?.getAttribute("alt"),
            unoDirectoryDeclaredWidth: unoDirectoryImage?.getAttribute("width"),
            unoDirectoryDeclaredHeight: unoDirectoryImage?.getAttribute("height"),
            unoDirectoryImageWidth: unoDirectoryRect?.width,
            unoDirectoryImageHeight: unoDirectoryRect?.height,
            unoDirectoryNaturalWidth: unoDirectoryImage?.naturalWidth,
            unoDirectoryNaturalHeight: unoDirectoryImage?.naturalHeight,
            saascityHref: saascity?.getAttribute("href"),
            saascityTarget: saascity?.getAttribute("target"),
            saascityRel: saascity?.getAttribute("rel"),
            saascityImageSrc: saascityImage?.getAttribute("src"),
            saascityImageAlt: saascityImage?.getAttribute("alt"),
            saascityDeclaredWidth: saascityImage?.getAttribute("width"),
            saascityDeclaredHeight: saascityImage?.getAttribute("height"),
            saascityImageWidth: saascityRect?.width,
            saascityImageHeight: saascityRect?.height,
            saascityNaturalWidth: saascityImage?.naturalWidth,
            saascityNaturalHeight: saascityImage?.naturalHeight,
            launchvaultHref: launchvault?.getAttribute("href"),
            launchvaultTarget: launchvault?.getAttribute("target"),
            launchvaultRel: launchvault?.getAttribute("rel"),
            launchvaultImageSrc: launchvaultImage?.getAttribute("src"),
            launchvaultImageAlt: launchvaultImage?.getAttribute("alt"),
            launchvaultDeclaredWidth: launchvaultImage?.getAttribute("width"),
            launchvaultDeclaredHeight: launchvaultImage?.getAttribute("height"),
            launchvaultImageWidth: launchvaultRect?.width,
            launchvaultImageHeight: launchvaultRect?.height,
            launchvaultNaturalWidth: launchvaultImage?.naturalWidth,
            launchvaultNaturalHeight: launchvaultImage?.naturalHeight,
          };
        });
        expect(result.wrapper, path + ": .footer-badges missing").toBe(true);
        // Issue #1173: the friends row is one line — the label, then the strip,
        // then the pause control, all on the same centre line.
        expect(result.labelFirst, path + ": the friends row must open with its label").toBe(true);
        expect(result.toggleLast, path + ": the pause control must close the friends row").toBe(true);
        expect(Math.abs(result.labelCentre - result.stripCentre), path + ": the label and the strip share one row")
          .toBeLessThanOrEqual(1);
        expect(Math.abs(result.toggleCentre - result.stripCentre), path + ": the pause control and the strip share one row")
          .toBeLessThanOrEqual(1);
        expect(result.rowCount, path + ": the strip is one line").toBe(1);
        // Issue #1038: every badge is 28px high by one shared rule, so the
        // boxes no longer depend on the vendor embeds' width/height
        // attributes. Only the structure and the rendered Altern / SaaSpa.ge /
        // Tooluck / neeed.directory / zPlatform boxes are asserted here; the
        // 28px contract for every badge image is the Issue #1038 suite below.
        // Issue #1092 appended the neeed.directory and zPlatform badges plus
        // The Startup Project text link (17 anchors), Issue #1094 the DevHub
        // badge, Issue #1096 the Startup Fast / Artificin badges plus the
        // AI Tool Trek / What Is Ai Tools text links, Issue #1099 the
        // ToolPotion badge, Issue #1102 the Fazier badge, Issue #1116 the
        // turbo0 / toolfame / dang.ai badges, Issue #1119 the
        // Scout Forge badge, Issue #1129 the Findly.tools badge, Issue #1132
        // the founder.best / makeitla.st badges, Issue #1134 the
        // AI for Developers / Uno Directory / SaaSCity / LaunchVault badges,
        // Issue #1160 twelve directory badges and links, Issue #1165 the
        // doforai.tools badge, Issue #1168 the Startup Fame badge and
        // Issue #1169 the ScrollLaunch badge and Issue #1176 the Twelve Tools
        // text link: 56 badges. Issue #1185 removed the LaunchIgniter badge,
        // whose directory entry does not exist, leaving 55.
        // Issue #1173 moved the two friend links onto the
        // strip ahead of them (each in its own text group), and the marquee's
        // runtime copy is not counted here.
        expect(result.stripAnchorCount, path + ": badges on the strip").toBe(59);
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
        // appended the ToolPotion badge, Issue #1102 the Fazier badge and
        // Issue #1116 the turbo0 / toolfame / dang.ai badges (Issue #1185
        // dropped the LaunchIgniter badge that closed that batch),
        // Issue #1119 the Scout Forge badge, Issue #1129 the Findly.tools badge
        // and Issue #1132 the founder.best / makeitla.st badges, Issue #1134
        // the AI for Developers / Uno Directory / SaaSCity / LaunchVault
        // badges, so LaunchVault was the last entry, Issue #1160 appended
        // twelve more, Issue #1165 the doforai.tools badge, Issue #1168 the
        // Startup Fame badge and Issue #1169 the ScrollLaunch badge, so it
        // then OpenHunts, SaaSGrow, NavFolders and Huzzler were appended, so Huzzler
        // closes the row now.
        expect(result.lastBadgeHref, path + ": the footer badges end with the Huzzler link")
          .toBe("https://huzzler.so");
        // Issue #1116: turbo0's SVG is a 481.56x160.97 viewBox, declared as the
        // rounded 482x161 so the shared 28px row renders it 83.8px wide; the
        // 482x161 placeholder makes that ratio assertable. The anchor keeps the
        // vendor's target/rel and the link stays crawlable.
        expect(result.turbo0Target, path + ": the turbo0 badge opens in a new tab").toBe("_blank");
        expect(result.turbo0Rel, path + ": the turbo0 anchor keeps noopener noreferrer").toBe("noopener noreferrer");
        expect(result.turbo0Rel, path + ": the turbo0 backlink must stay crawlable").not.toContain("nofollow");
        expect(result.turbo0ImageSrc, path + ": turbo0 badge image src")
          .toBe("https://img.turbo0.com/badge-listed-light.svg");
        expect(result.turbo0ImageAlt, path + ": turbo0 badge image alt").toBe("Listed on Turbo0");
        expect(result.turbo0DeclaredWidth, path + ": the turbo0 badge declares the 482px source width").toBe("482");
        expect(result.turbo0DeclaredHeight, path + ": the turbo0 badge declares the 161px source height").toBe("161");
        expect(result.turbo0NaturalWidth, path + ": the turbo0 placeholder is 482px wide").toBe(482);
        expect(result.turbo0NaturalHeight, path + ": the turbo0 placeholder is 161px high").toBe(161);
        expect(Math.abs(result.turbo0ImageHeight - 28), path + ": the turbo0 badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.turbo0ImageWidth / result.turbo0ImageHeight
            - result.turbo0NaturalWidth / result.turbo0NaturalHeight),
          path + ": the turbo0 badge must keep the 482x161 source ratio",
        ).toBeLessThan(0.02);
        // toolfame's SVG is 160x54 and the embed declares that source box.
        expect(result.toolfameTarget, path + ": the toolfame badge opens in a new tab").toBe("_blank");
        expect(result.toolfameRel, path + ": the toolfame anchor keeps noopener noreferrer").toBe("noopener noreferrer");
        expect(result.toolfameRel, path + ": the toolfame backlink must stay crawlable").not.toContain("nofollow");
        expect(result.toolfameImageSrc, path + ": toolfame badge image src").toBe("https://toolfame.com/badge-light.svg");
        expect(result.toolfameImageAlt, path + ": toolfame badge image alt").toBe("Featured on toolfame.com");
        expect(result.toolfameDeclaredWidth, path + ": the toolfame badge declares the 160px source width").toBe("160");
        expect(result.toolfameDeclaredHeight, path + ": the toolfame badge declares the 54px source height").toBe("54");
        expect(result.toolfameNaturalWidth, path + ": the toolfame placeholder is 160px wide").toBe(160);
        expect(result.toolfameNaturalHeight, path + ": the toolfame placeholder is 54px high").toBe(54);
        expect(Math.abs(result.toolfameImageHeight - 28), path + ": the toolfame badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.toolfameImageWidth / result.toolfameImageHeight
            - result.toolfameNaturalWidth / result.toolfameNaturalHeight),
          path + ": the toolfame badge must keep the 160x54 source ratio",
        ).toBeLessThan(0.02);
        // Issue #1116: dang.ai's verified badge replaced the Issue #1110 text
        // link, so the same crawler-reachable anchor (new tab, no nofollow) now
        // carries the 550x198 PNG in the shared 28px row.
        expect(result.dangTarget, path + ": the Dang.ai badge opens in a new tab").toBe("_blank");
        expect(result.dangRel, path + ": the Dang.ai anchor keeps rel=noopener").toBe("noopener");
        expect(result.dangHasImage, path + ": the Dang.ai link is the verified badge").toBe(true);
        expect(result.dangImageSrc, path + ": Dang.ai badge image src")
          .toBe("https://assets.dang.ai/badges/dang-verified-dark.png");
        expect(result.dangImageAlt, path + ": Dang.ai badge image alt").toBe("Verified on DANG!");
        expect(result.dangDeclaredWidth, path + ": the Dang.ai badge declares the 550px source width").toBe("550");
        expect(result.dangDeclaredHeight, path + ": the Dang.ai badge declares the 198px source height").toBe("198");
        expect(result.dangNaturalWidth, path + ": the Dang.ai placeholder is 550px wide").toBe(550);
        expect(result.dangNaturalHeight, path + ": the Dang.ai placeholder is 198px high").toBe(198);
        expect(Math.abs(result.dangImageHeight - 28), path + ": the Dang.ai badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.dangImageWidth / result.dangImageHeight
            - result.dangNaturalWidth / result.dangNaturalHeight),
          path + ": the Dang.ai badge must keep the 550x198 source ratio",
        ).toBeLessThan(0.02);
        expect(result.dangRel, path + ": the Dang.ai backlink must stay crawlable").not.toContain("nofollow");
        // Issue #1119: Scout Forge counts the badge's impressions from the
        // image request itself, so the image must stay on scoutforge.net (never
        // self-hosted) and the anchor must stay crawlable — no nofollow, plain
        // server-rendered HTML. Its SVG is its own 300x72 box, which the embed
        // declares; the branch snippet's inline style is dropped like DevHub's,
        // because the shared 28px rule already decides the rendered box
        // (300/72 * 28 = 116.7px wide).
        expect(result.scoutforgeHref, path + ": the Scout Forge badge href")
          .toBe("https://scoutforge.net/apps/orbi?ref=badge");
        expect(result.scoutforgeTarget, path + ": the Scout Forge badge opens in a new tab").toBe("_blank");
        expect(result.scoutforgeRel, path + ": the Scout Forge anchor keeps rel=noopener").toBe("noopener");
        expect(result.scoutforgeRel, path + ": the Scout Forge backlink must stay crawlable").not.toContain("nofollow");
        expect(result.scoutforgeImageSrc, path + ": the Scout Forge badge must load from scoutforge.net")
          .toBe("https://scoutforge.net/badge/orbi/image?theme=light");
        expect(result.scoutforgeImageAlt, path + ": Scout Forge badge image alt").toBe("Orbi on Scout Forge");
        expect(result.scoutforgeDeclaredWidth, path + ": the Scout Forge badge declares the 300px source width").toBe("300");
        expect(result.scoutforgeDeclaredHeight, path + ": the Scout Forge badge declares the 72px source height").toBe("72");
        expect(result.scoutforgeImageStyle, path + ": the Scout Forge badge carries no inline style").toBeNull();
        expect(result.scoutforgeNaturalWidth, path + ": the Scout Forge placeholder is 300px wide").toBe(300);
        expect(result.scoutforgeNaturalHeight, path + ": the Scout Forge placeholder is 72px high").toBe(72);
        expect(Math.abs(result.scoutforgeImageHeight - 28), path + ": the Scout Forge badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.scoutforgeImageWidth / result.scoutforgeImageHeight
            - result.scoutforgeNaturalWidth / result.scoutforgeNaturalHeight),
          path + ": the Scout Forge badge must keep the 300x72 source ratio",
        ).toBeLessThan(0.02);
        // Issue #1129: Findly.tools gets the same treatment — plain
        // server-rendered markup, a new tab, a crawlable link to Orbi's
        // listing, and the source SVG's own 139x44 box (the vendor snippet's
        // 175x55 is not the file's size), so the shared 28px rule renders
        // 139/44 * 28 = 88.5px wide, unsquashed.
        expect(result.findlyHref, path + ": the Findly.tools badge href")
          .toBe("https://findly.tools/orbi?utm_source=orbi");
        expect(result.findlyTarget, path + ": the Findly.tools badge opens in a new tab").toBe("_blank");
        expect(result.findlyRel, path + ": the Findly.tools anchor keeps noopener noreferrer").toBe("noopener noreferrer");
        expect(result.findlyRel, path + ": the Findly.tools backlink must stay crawlable").not.toContain("nofollow");
        expect(result.findlyImageSrc, path + ": the Findly.tools badge must load from findly.tools")
          .toBe("https://findly.tools/badges/findly-tools-badge-light.svg");
        expect(result.findlyImageAlt, path + ": Findly.tools badge image alt").toBe("Featured on Findly.tools");
        expect(result.findlyDeclaredWidth, path + ": the Findly.tools badge declares the 139px source width").toBe("139");
        expect(result.findlyDeclaredHeight, path + ": the Findly.tools badge declares the 44px source height").toBe("44");
        expect(result.findlyNaturalWidth, path + ": the Findly.tools placeholder is 139px wide").toBe(139);
        expect(result.findlyNaturalHeight, path + ": the Findly.tools placeholder is 44px high").toBe(44);
        expect(Math.abs(result.findlyImageHeight - 28), path + ": the Findly.tools badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.findlyImageWidth / result.findlyImageHeight
            - result.findlyNaturalWidth / result.findlyNaturalHeight),
          path + ": the Findly.tools badge must keep the 139x44 source ratio",
        ).toBeLessThan(0.02);
        // Issue #1132: founder.best and makeitla.st close the row, copied
        // verbatim from the vendors' snippets. founder.best keeps target/rel
        // and declares the live SVG's own 1195x390; makeitla.st links exactly
        // https://www.makeitla.st/ with the vendor's title and no rel at all
        // (no nofollow, sponsored or ugc) and declares the live SVG's 252x76.
        // Both render 28px high in their source ratio: 85.8px and 92.8px wide.
        expect(result.founderBestHref, path + ": the founder.best badge href")
          .toBe("https://www.founder.best?ref=founderbest&utm_source=founder.best&utm_medium=referral");
        expect(result.founderBestTarget, path + ": the founder.best badge opens in a new tab").toBe("_blank");
        expect(result.founderBestRel, path + ": the founder.best anchor keeps noopener noreferrer").toBe("noopener noreferrer");
        expect(result.founderBestRel, path + ": the founder.best backlink must stay crawlable").not.toContain("nofollow");
        expect(result.founderBestImageSrc, path + ": the founder.best badge must load from founder.best")
          .toBe("https://www.founder.best/api/badge/featured/orbi");
        expect(result.founderBestImageAlt, path + ": founder.best badge image alt").toBe("Orbi - Featured on Founder.best");
        expect(result.founderBestDeclaredWidth, path + ": the founder.best badge declares the 1195px source width").toBe("1195");
        expect(result.founderBestDeclaredHeight, path + ": the founder.best badge declares the 390px source height").toBe("390");
        expect(result.founderBestNaturalWidth, path + ": the founder.best placeholder is 1195px wide").toBe(1195);
        expect(result.founderBestNaturalHeight, path + ": the founder.best placeholder is 390px high").toBe(390);
        expect(Math.abs(result.founderBestImageHeight - 28), path + ": the founder.best badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.founderBestImageWidth / result.founderBestImageHeight
            - result.founderBestNaturalWidth / result.founderBestNaturalHeight),
          path + ": the founder.best badge must keep the 1195x390 source ratio",
        ).toBeLessThan(0.02);
        expect(result.makeitlastHref, path + ": the makeitla.st badge href must be exactly the site root")
          .toBe("https://www.makeitla.st/");
        expect(result.makeitlastRel, path + ": the makeitla.st anchor carries no rel at all")
          .toBeNull();
        expect(result.makeitlastTitle, path + ": the makeitla.st badge keeps its tooltip").toBe("Featured on MakeItLast");
        expect(result.makeitlastImageSrc, path + ": the makeitla.st badge must load from makeitla.st")
          .toBe("https://www.makeitla.st/badge/makeitlast-badge-dark.svg?v=3");
        expect(result.makeitlastImageAlt, path + ": makeitla.st badge image alt").toBe("Featured on MakeItLast");
        expect(result.makeitlastDeclaredWidth, path + ": the makeitla.st badge declares the 252px source width").toBe("252");
        expect(result.makeitlastDeclaredHeight, path + ": the makeitla.st badge declares the 76px source height").toBe("76");
        expect(result.makeitlastNaturalWidth, path + ": the makeitla.st placeholder is 252px wide").toBe(252);
        expect(result.makeitlastNaturalHeight, path + ": the makeitla.st placeholder is 76px high").toBe(76);
        expect(Math.abs(result.makeitlastImageHeight - 28), path + ": the makeitla.st badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.makeitlastImageWidth / result.makeitlastImageHeight
            - result.makeitlastNaturalWidth / result.makeitlastNaturalHeight),
          path + ": the makeitla.st badge must keep the 252x76 source ratio",
        ).toBeLessThan(0.02);
        // Issue #1134: AI for Developers, Uno Directory, SaaSCity and
        // LaunchVault close the row after makeitla.st, copied verbatim from the
        // Issue. Its snippet gives AI for Developers no rel at all, the other
        // three rel=noopener; none of the four may carry nofollow, sponsored or
        // ugc, or the directory refuses the listing. The declared boxes are the
        // snippet's (Uno Directory 120x30 and SaaSCity 150x54 differ from the
        // live SVGs' 146x44 and 210x80, LaunchVault declares only a 54px
        // height), which is why the rendered box matters: every one keeps its
        // source ratio at the shared 28px height.
        expect(result.aiForDevelopersHref, path + ": the AI for Developers badge href")
          .toBe("https://aifordevelopers.org");
        expect(result.aiForDevelopersTarget, path + ": the AI for Developers badge opens in a new tab").toBe("_blank");
        expect(result.aiForDevelopersRel, path + ": the AI for Developers anchor carries no rel at all")
          .toBeNull();
        expect(result.aiForDevelopersImageSrc, path + ": the AI for Developers badge must load from aifordevelopers.org")
          .toBe("https://aifordevelopers.org/assets/badge.svg");
        expect(result.aiForDevelopersImageAlt, path + ": AI for Developers badge image alt").toBe("Featured on AI for Developers");
        expect(result.aiForDevelopersDeclaredWidth, path + ": the AI for Developers badge declares 220px").toBe("220");
        expect(result.aiForDevelopersDeclaredHeight, path + ": the AI for Developers badge declares 48px").toBe("48");
        expect(result.aiForDevelopersNaturalWidth, path + ": the AI for Developers placeholder is 220px wide").toBe(220);
        expect(result.aiForDevelopersNaturalHeight, path + ": the AI for Developers placeholder is 48px high").toBe(48);
        expect(Math.abs(result.aiForDevelopersImageHeight - 28), path + ": the AI for Developers badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.aiForDevelopersImageWidth / result.aiForDevelopersImageHeight
            - result.aiForDevelopersNaturalWidth / result.aiForDevelopersNaturalHeight),
          path + ": the AI for Developers badge must keep the 220x48 source ratio",
        ).toBeLessThan(0.02);
        expect(result.unoDirectoryHref, path + ": the Uno Directory badge href").toBe("https://uno.directory");
        expect(result.unoDirectoryTarget, path + ": the Uno Directory badge opens in a new tab").toBe("_blank");
        expect(result.unoDirectoryRel, path + ": the Uno Directory anchor keeps rel=noopener").toBe("noopener");
        expect(result.unoDirectoryRel, path + ": the Uno Directory backlink must stay crawlable").not.toContain("nofollow");
        expect(result.unoDirectoryImageSrc, path + ": the Uno Directory badge must load from uno.directory")
          .toBe("https://uno.directory/uno-directory.svg");
        expect(result.unoDirectoryImageAlt, path + ": Uno Directory badge image alt").toBe("Listed on Uno Directory");
        expect(result.unoDirectoryDeclaredWidth, path + ": the Uno Directory badge keeps the snippet's 120px width").toBe("120");
        expect(result.unoDirectoryDeclaredHeight, path + ": the Uno Directory badge keeps the snippet's 30px height").toBe("30");
        expect(result.unoDirectoryNaturalWidth, path + ": the Uno Directory placeholder is its live 146px width").toBe(146);
        expect(result.unoDirectoryNaturalHeight, path + ": the Uno Directory placeholder is its live 44px height").toBe(44);
        expect(Math.abs(result.unoDirectoryImageHeight - 28), path + ": the Uno Directory badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.unoDirectoryImageWidth / result.unoDirectoryImageHeight
            - result.unoDirectoryNaturalWidth / result.unoDirectoryNaturalHeight),
          path + ": the Uno Directory badge must keep the live 146x44 source ratio",
        ).toBeLessThan(0.02);
        expect(result.saascityHref, path + ": the SaaSCity badge href").toBe("https://saascity.io");
        expect(result.saascityTarget, path + ": the SaaSCity badge opens in a new tab").toBe("_blank");
        expect(result.saascityRel, path + ": the SaaSCity anchor keeps rel=noopener").toBe("noopener");
        expect(result.saascityRel, path + ": the SaaSCity backlink must stay crawlable").not.toContain("nofollow");
        expect(result.saascityImageSrc, path + ": the SaaSCity badge must load from saascity.io")
          .toBe("https://saascity.io/badges/featured-dark.svg");
        expect(result.saascityImageAlt, path + ": SaaSCity badge image alt").toBe("Featured on SaaSCity");
        expect(result.saascityDeclaredWidth, path + ": the SaaSCity badge keeps the snippet's 150px width").toBe("150");
        expect(result.saascityDeclaredHeight, path + ": the SaaSCity badge keeps the snippet's 54px height").toBe("54");
        expect(result.saascityNaturalWidth, path + ": the SaaSCity placeholder is its live 210px width").toBe(210);
        expect(result.saascityNaturalHeight, path + ": the SaaSCity placeholder is its live 80px height").toBe(80);
        expect(Math.abs(result.saascityImageHeight - 28), path + ": the SaaSCity badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.saascityImageWidth / result.saascityImageHeight
            - result.saascityNaturalWidth / result.saascityNaturalHeight),
          path + ": the SaaSCity badge must keep the live 210x80 source ratio",
        ).toBeLessThan(0.02);
        expect(result.launchvaultHref, path + ": the LaunchVault badge href").toBe("https://launchvault.dev");
        expect(result.launchvaultTarget, path + ": the LaunchVault badge opens in a new tab").toBe("_blank");
        expect(result.launchvaultRel, path + ": the LaunchVault anchor keeps rel=noopener").toBe("noopener");
        expect(result.launchvaultRel, path + ": the LaunchVault backlink must stay crawlable").not.toContain("nofollow");
        expect(result.launchvaultImageSrc, path + ": the LaunchVault badge must load from launchvault.dev")
          .toBe("https://launchvault.dev/images/badges/launch-valut-badge.svg");
        expect(result.launchvaultImageAlt, path + ": LaunchVault badge image alt").toBe("Featured on LaunchVault");
        expect(result.launchvaultDeclaredWidth, path + ": the LaunchVault snippet declares no width").toBeNull();
        expect(result.launchvaultDeclaredHeight, path + ": the LaunchVault badge declares the snippet's 54px height").toBe("54");
        expect(result.launchvaultNaturalWidth, path + ": the LaunchVault placeholder is 139px wide").toBe(139);
        expect(result.launchvaultNaturalHeight, path + ": the LaunchVault placeholder is 44px high").toBe(44);
        expect(Math.abs(result.launchvaultImageHeight - 28), path + ": the LaunchVault badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.launchvaultImageWidth / result.launchvaultImageHeight
            - result.launchvaultNaturalWidth / result.launchvaultNaturalHeight),
          path + ": the LaunchVault badge must keep the 139x44 source ratio",
        ).toBeLessThan(0.02);
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
        // The zPlatform badge keeps the supplied 250x60 box; Issue #1187 dropped
        // its loading="lazy" so the marquee never scrolls it in blank. The
        // placeholder is 250x60, so the 28px row must keep that ratio too.
        expect(result.zplatformTarget, path + ": the zPlatform badge opens in a new tab").toBe("_blank");
        expect(result.zplatformRel, path + ": the zPlatform anchor keeps rel=noopener").toBe("noopener");
        expect(result.zplatformTitle, path + ": the zPlatform badge keeps its tooltip").toBe("Featured on zPlatform.ai");
        expect(result.zplatformLoading, path + ": the zPlatform badge must not defer its image (Issue #1187)").toBeNull();
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
        // moves its href to the Orbi entry page — 244x56 declared, a new tab and
        // a crawlable (no nofollow) backlink the directory can verify.
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
        expect(result.nicklaunchesLoading, path + ": NickLaunches must not defer its image (Issue #1187)").toBeNull();
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
        // Issue #1125: Startup Fast requires the badge rendered at least
        // 150x44 px, so this one badge leaves the shared 28px row: it declares
        // the source SVG's proportional 150x63 and its own rule sets width
        // 150px / height auto, which renders 150 * 50 / 119 = 63px high in the
        // 119x50 source ratio — exactly 150px wide and taller than the 44px
        // floor, unsquashed.
        expect(result.startupfastHref, path + ": the Startup Fast badge href").toBe("https://startupfa.st");
        expect(result.startupfastTarget, path + ": the Startup Fast badge opens in a new tab").toBe("_blank");
        expect(result.startupfastRel, path + ": the Startup Fast anchor keeps rel=noopener").toBe("noopener");
        expect(result.startupfastRel, path + ": the Startup Fast backlink must stay crawlable").not.toContain("nofollow");
        expect(result.startupfastTitle, path + ": the Startup Fast badge title").toBe("Powered by Startup Fast");
        expect(result.startupfastImageSrc, path + ": the Startup Fast badge image src")
          .toBe("https://startupfa.st/images/badges/powered-by-dark.svg");
        expect(result.startupfastImageAlt, path + ": the Startup Fast badge image alt").toBe("Powered by Startup Fast");
        expect(result.startupfastDeclaredWidth, path + ": the Startup Fast badge declares the 150px width").toBe("150");
        expect(result.startupfastDeclaredHeight, path + ": the Startup Fast badge declares the 63px height").toBe("63");
        expect(result.startupfastLoading, path + ": the Startup Fast badge must not defer its image (Issue #1187)").toBeNull();
        expect(result.startupfastNaturalWidth, path + ": the Startup Fast placeholder is 119px wide").toBe(119);
        expect(result.startupfastNaturalHeight, path + ": the Startup Fast placeholder is 50px high").toBe(50);
        expect(result.startupfastImageWidth, path + ": the Startup Fast badge renders at least 150px wide")
          .toBeGreaterThanOrEqual(150);
        expect(result.startupfastImageHeight, path + ": the Startup Fast badge renders at least 44px high")
          .toBeGreaterThanOrEqual(44);
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
        expect(result.artificinLoading, path + ": the Artificin badge must not defer its image (Issue #1187)").toBeNull();
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
        // Issue #1102: Fazier ships a 103x44 SVG whose only declared dimension
        // is the vendor snippet's 120px width, so the shared 28px rule decides
        // the box: 103/44 * 28 = 65.5px wide. The anchor opens fazier.com in a
        // new tab and the image keeps the vendor's src and alt.
        expect(result.fazierTarget, path + ": the Fazier badge opens in a new tab").toBe("_blank");
        expect(result.fazierRel, path + ": the Fazier anchor keeps rel=noopener").toBe("noopener");
        expect(result.fazierImageSrc, path + ": Fazier badge image src")
          .toBe("https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=launched&theme=light");
        expect(result.fazierImageAlt, path + ": Fazier badge image alt").toBe("Fazier badge");
        expect(result.fazierDeclaredWidth, path + ": the Fazier badge keeps the vendor's 120px width").toBe("120");
        expect(result.fazierNaturalWidth, path + ": the Fazier placeholder is 103px wide").toBe(103);
        expect(result.fazierNaturalHeight, path + ": the Fazier placeholder is 44px high").toBe(44);
        expect(Math.abs(result.fazierImageHeight - 28), path + ": the Fazier badge renders 28px high").toBeLessThanOrEqual(1);
        expect(
          Math.abs(result.fazierImageWidth / result.fazierImageHeight
            - result.fazierNaturalWidth / result.fazierNaturalHeight),
          path + ": the Fazier badge must keep the 103x44 source ratio",
        ).toBeLessThan(0.02);
        // Issue #1096: the badges and the text links share the row, so every
        // flex line carrying a new entry is centred (align-items:center).
        // Issue #1173: they are all on the one scrolling line now, which the
        // strip clips instead of widening the document.
        expect(result.mixedRowSpread, path + ": the new badges and text links must share one centred line")
          .toBeLessThanOrEqual(1.5);
        expect(result.documentOverflow, path + ": the badge strip never widens the document").toBe(0);
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
        await page.locator('footer .footer-badges [data-footer-badges-track] a[href="https://dofollow.tools"]').focus();
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
        // through the ToolPotion badge, Issue #1102 through the Fazier badge,
        // Issue #1116 through the turbo0 / toolfame / dang.ai badges
        // (Issue #1185 removed the LaunchIgniter one), Issue #1119 through the
        // Scout Forge badge, Issue #1129
        // through the Findly.tools badge, Issue #1132 through the
        // founder.best / makeitla.st badges, Issue #1134 through the
        // AI for Developers / Uno Directory / SaaSCity / LaunchVault badges,
        // Issue #1160 through twelve more directory badges and links,
        // Issue #1165 through the doforai.tools badge, Issue #1168 through the
        // Startup Fame badge and Issue #1169 through the ScrollLaunch badge,
        // then leaves.
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
          "https://fazier.com",
          "https://turbo0.com/item/orbi",
          "https://toolfame.com/item/orbi",
          "https://dang.ai",
          "https://scoutforge.net/apps/orbi?ref=badge",
          "https://findly.tools/orbi?utm_source=orbi",
          "https://www.founder.best?ref=founderbest&utm_source=founder.best&utm_medium=referral",
          "https://www.makeitla.st/",
          "https://postmake.io",
          "https://auraplusplus.com",
          "https://earlyhunt.com",
          "https://twelve.tools",
          "https://aifordevelopers.org",
          "https://uno.directory",
          "https://saascity.io",
          "https://launchvault.dev",
          "https://findstack.com/products/orbi/reviews",
          "https://goodsaas.xyz/saas/orbi",
          "https://101aitools.com",
          "https://webtech.tools",
          "https://t0ai.com",
          "https://aixlist.com/",
          "https://hiaitools.com",
          "https://aitooli.com/",
          "https://okeiai.com/",
          "https://vibedonalds.com",
          "https://minylist.com",
          "https://toolsify.ai/",
          "https://bestaitool.app/",
          "https://doforai.tools",
          "https://startupfa.me/s/orbi?utm_source=orbi.build",
          "https://www.scrolllaunch.com/products/orbi?ref=badge",
          "https://openhunts.com",
          "https://saasgrow.app?ref=orbi.build",
          "https://navfolders.com",
          "https://huzzler.so",
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
        expect(afterStartup.inBadges, path + ": Tab after the ScrollLaunch badge must leave the badge row").toBe(false);
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
    "https://aiagentslisting.com/agent/orbi?utm_source=aiagentslisting&utm_medium=badge&utm_campaign=embed",
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
    "https://fazier.com",
    "https://turbo0.com/item/orbi",
    "https://toolfame.com/item/orbi",
    "https://dang.ai",
    "https://scoutforge.net/apps/orbi?ref=badge",
    "https://findly.tools/orbi?utm_source=orbi",
    "https://www.founder.best?ref=founderbest&utm_source=founder.best&utm_medium=referral",
    "https://www.makeitla.st/",
    "https://postmake.io",
    "https://auraplusplus.com",
    "https://earlyhunt.com",
    "https://twelve.tools",
    "https://aifordevelopers.org",
    "https://uno.directory",
    "https://saascity.io",
    "https://launchvault.dev",
    "https://findstack.com/products/orbi/reviews",
    // Issue #1160: twelve directory badges and links after Findstack, four of
    // them vendor-hosted images (goodsaas.xyz, 101aitools.com,
    // vibedonalds.com, minylist.com).
    "https://goodsaas.xyz/saas/orbi",
    "https://101aitools.com",
    "https://webtech.tools",
    "https://t0ai.com",
    "https://aixlist.com/",
    "https://hiaitools.com",
    "https://aitooli.com/",
    "https://okeiai.com/",
    "https://vibedonalds.com",
    "https://minylist.com",
    "https://toolsify.ai/",
    "https://bestaitool.app/",
    // Issue #1165: the doforai.tools badge, appended after bestaitool.app. Its
    // 538x169 source is one of the row's two webp files.
    "https://doforai.tools",
    // Issue #1168: the Startup Fame badge, appended after doforai.tools; its
    // source is a 468x148 webp, declared as the vendor's 171x54 box.
    "https://startupfa.me/s/orbi?utm_source=orbi.build",
    // Issue #1169: the ScrollLaunch badge closes the row; its source is the
    // vendor's 220x48 SVG, declared in that same box.
    "https://www.scrolllaunch.com/products/orbi?ref=badge",
    "https://openhunts.com",
    "https://saasgrow.app?ref=orbi.build",
    "https://navfolders.com",
    "https://huzzler.so",
  ];

  // Issue #1173: demo.js appends a marquee copy of the strip at runtime, so
  // every measurement here stays inside the source track — the one copy the
  // page ships, whose images the badges are judged by.
  const badgeImages = "footer .footer-badges [data-footer-badges-track] img";

  // Issue #1187: the strip badges no longer defer their images, so the load
  // event already leaves every one decoded; the wait stays as the guard that
  // these measurements see real images instead of blank slots.
  const loadBadges = async (page) => {
    await page.locator("footer .footer-badges").scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () => [...document.querySelectorAll("footer .footer-badges [data-footer-badges-track] img")]
        .every((image) => image.complete && image.naturalWidth > 0),
      null,
      { timeout: 10_000 },
    );
  };

  const measureBadges = (page) => page.locator(badgeImages).evaluateAll((images) =>
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
          // Artificin images, Issue #1099 the ToolPotion image, Issue #1102
          // the Fazier image, Issue #1116 the turbo0 / toolfame / dang.ai
          // images (Issue #1185 dropped the LaunchIgniter one), Issue #1119
          // the Scout Forge image,
          // Issue #1129 the Findly.tools image, Issue #1132 the
          // founder.best / makeitla.st images, Issue #1134 the
          // AI for Developers / Uno Directory / SaaSCity / LaunchVault images,
          // the Findstack image, Issue #1160 the goodsaas.xyz /
          // 101aitools.com / vibedonalds.com / minylist.com images,
          // Issue #1165 the doforai.tools image, Issue #1168 the Startup Fame
          // image and Issue #1169 the ScrollLaunch image: 41 badge images in
          // the row. Issue #1185 removed the LaunchIgniter image, leaving 40.
          expect(badges, label + ": badge count").toHaveLength(43);
          for (const badge of badges) {
            expect(badge.naturalWidth, label + ": " + badge.alt + " placeholder loaded").toBeGreaterThan(0);
            expect(badge.width, label + ": " + badge.alt + " rendered width").toBeGreaterThan(0);
            expect(
              Math.abs(badge.width / badge.height - badge.naturalWidth / badge.naturalHeight),
              label + ": " + badge.alt + " must keep its source ratio",
            ).toBeLessThan(0.02);
          }
          // Issue #1125: Startup Fast requires its badge at least 150x44 px, so
          // that one image leaves the 28px row (public/styles.css scopes the
          // exception to its class); every other badge stays on the mark size.
          const vendor = badges.filter((badge) => badge.alt === "Powered by Startup Fast");
          expect(vendor, label + ": the Startup Fast badge").toHaveLength(1);
          expect(vendor[0].width, label + ": the Startup Fast badge is at least 150px wide")
            .toBeGreaterThanOrEqual(150);
          expect(vendor[0].height, label + ": the Startup Fast badge is at least 44px high")
            .toBeGreaterThanOrEqual(44);
          for (const badge of badges.filter((candidate) => candidate !== vendor[0])) {
            expect(
              Math.abs(badge.height - 28),
              label + ": " + badge.alt + " rendered height (28px, 1px rounding)",
            ).toBeLessThanOrEqual(1);
          }
        };

        await loadBadges(page);
        const desktop = await measureBadges(page);
        expectBadges(desktop, path + " at 1440px");
        // Issue #1173: every badge sits on the strip's single line now — the
        // row no longer wraps into five of them. The taller Startup Fast badge
        // (Issue #1125) is centred on that line too, so it is measured apart.
        expect(
          new Set(desktop.filter((badge) => badge.alt !== "Powered by Startup Fast").map((badge) => badge.top)).size,
          path + " at 1440px: the badges stay on one line",
        ).toBe(1);

        await page.locator("footer.site-footer").screenshot({ path: ".orbi/footer-badges-28px-" + name + "-1440.png" });

        // The badge strip stays a normal tab sequence: every link in the source
        // order, each with a visible ring, and the next Tab leaves the row. The
        // marquee copy is inert, so it never enters the sequence (Issue #1173).
        await page.locator('footer .footer-badges [data-footer-badges-track] a[href="https://agentic.ai/best/free-coding-agents"]').focus();
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

        // 390px: the same 28px height on the same single line — the strip
        // scrolls what it cannot show instead of wrapping into more rows, and
        // the page itself never widens (Issue #1173).
        await page.setViewportSize({ width: 390, height: 900 });
        await page.waitForTimeout(150);
        await loadBadges(page);
        const phone = await measureBadges(page);
        expectBadges(phone, path + " at 390px");
        expect(
          new Set(phone.filter((badge) => badge.alt !== "Powered by Startup Fast").map((badge) => badge.top)).size,
          path + " at 390px: the badges stay on one line",
        ).toBe(1);
        const phoneLayout = await page.evaluate(() => {
          const documentElement = document.documentElement;
          const nav = document.querySelector("footer nav.footer-friends");
          const strip = nav.querySelector(".footer-badges");
          const footerRect = document.querySelector("footer.site-footer").getBoundingClientRect();
          const stripRect = strip.getBoundingClientRect();
          return {
            overflow: documentElement.scrollWidth - documentElement.clientWidth,
            stripInsideFooter: stripRect.left >= footerRect.left - 1 && stripRect.right <= footerRect.right + 1,
            stripScrolls: strip.scrollWidth > strip.clientWidth,
            rowHeight: Math.round(nav.getBoundingClientRect().height),
            // Issue #1173: a badge the old wrapping row pushed to a fifth line
            // (Dang.ai, Scout Forge, Findly.tools, founder.best, the twelve
            // Issue #1160 entries, doforai.tools, Startup Fame, ScrollLaunch)
            // is now simply further along the strip, so it still renders at its
            // own size instead of being dropped from the footer.
            renderedBadges: [...strip.querySelectorAll("[data-footer-badges-track] img")]
              .filter((image) => {
                const rect = image.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              }).length,
          };
        });
        expect(phoneLayout.overflow, path + " at 390px: document overflow").toBe(0);
        expect(phoneLayout.stripInsideFooter, path + " at 390px: the badge strip stays inside the footer").toBe(true);
        expect(phoneLayout.stripScrolls, path + " at 390px: the strip scrolls the badges it cannot show").toBe(true);
        // Issue #1188: on a phone the title and the pause control take a line
        // of their own above the strip, so the friends row is the title line
        // plus the 63px badge line — never a third line.
        expect(phoneLayout.rowHeight, path + " at 390px: the title line plus the badge line").toBeLessThanOrEqual(130);
        // Issue #1185 removed the LaunchIgniter badge, leaving 40.
        expect(phoneLayout.renderedBadges, path + " at 390px: every badge on the strip renders").toBe(43);
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

// Issue #1173: the footer badge wall used to fill five or six wrapped rows. It
// is now one line: the "Featured on" label, a strip that scrolls itself, and
// the pause control (WCAG 2.2.2). The strip holds one copy of every badge in
// the page source; demo.js appends the second copy that makes the loop seamless
// and marks it aria-hidden + inert, so nothing is crawled or tabbed twice.
describe("the footer badge strip is one self-scrolling row (Issue #1173)", () => {
  const stripSelector = "footer nav.footer-friends .footer-badges";

  const rowShape = (page) => page.evaluate(() => {
    const nav = document.querySelector("footer nav.footer-friends");
    const label = nav.querySelector(".footer-friends-label");
    const strip = nav.querySelector(".footer-badges");
    const toggle = nav.querySelector("[data-footer-badges-toggle]");
    const track = strip.querySelector("[data-footer-badges-track]");
    const copy = [...strip.children].find((child) => child !== track);
    const centre = (node) => {
      const rect = node.getBoundingClientRect();
      return Math.round((rect.top + rect.bottom) / 2);
    };
    const rect = (node) => node.getBoundingClientRect();
    return {
      navHeight: Math.round(rect(nav).height),
      labelFirst: nav.firstElementChild === label,
      toggleLast: nav.lastElementChild === toggle,
      labelCentre: centre(label),
      // Issue #1188: on a phone the title and the pause control move onto a
      // line of their own, above the strip.
      labelBottom: Math.round(rect(label).bottom),
      stripTop: Math.round(rect(strip).top),
      stripWidth: Math.round(rect(strip).width),
      stripCentre: centre(strip),
      toggleCentre: centre(toggle),
      label: label.textContent.trim(),
      ariaLabel: nav.getAttribute("aria-label"),
      trackChildren: [...strip.children].length,
      trackAnchors: track.querySelectorAll("a").length,
      copyAnchors: copy ? copy.querySelectorAll("a").length : 0,
      // Issue #1173 item 1: the fifteen text-only directory links are 28px
      // tiles, so they sit on the image badges' line instead of taking rows.
      textTiles: [...track.children]
        .filter((node) => node.tagName === "A" && !node.querySelector("img"))
        .map((node) => ({ height: Math.round(rect(node).height), centre: centre(node) })),
      badgeCentres: [...track.querySelectorAll("img")].map((image) => centre(image)),
      // The copy has to repeat the strip entry for entry — same links, same
      // images — or the loop shows a seam.
      copyIsDuplicate: Boolean(copy)
        && copy.children.length === track.children.length
        && [...copy.querySelectorAll("a")].map((link) => link.getAttribute("href")).join("|")
          === [...track.querySelectorAll("a")].map((link) => link.getAttribute("href")).join("|")
        && [...copy.querySelectorAll("img")].map((image) => image.getAttribute("src")).join("|")
          === [...track.querySelectorAll("img")].map((image) => image.getAttribute("src")).join("|"),
      copyAriaHidden: copy?.getAttribute("aria-hidden"),
      copyInert: copy?.hasAttribute("inert"),
      copyFocusable: copy ? [...copy.querySelectorAll("a")].filter((link) => link.tabIndex >= 0).length : 0,
      // The seamless loop needs the copy one full strip plus one gap away.
      period: copy ? Math.round(rect(copy).left - rect(track).left) : 0,
      trackWidth: Math.round(rect(track).width),
      stripScrolls: strip.scrollWidth > strip.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      toggleText: toggle.textContent.trim(),
      // The loop is a CSS animation on the track's transform (Issue #1173), so
      // how far it has travelled is read off the computed matrix.
      travelled: (() => {
        const value = getComputedStyle(track).transform;
        return value === "none" ? 0 : -new DOMMatrixReadOnly(value).m41;
      })(),
    };
  });

  // How far the strip has travelled since its loop started, and how long one
  // loop is — the transform resets to zero at the end of every loop, so a
  // negative delta is a wrap, not a step backwards.
  const marqueeState = (page) => page.evaluate(() => {
    const track = document.querySelector("footer nav.footer-friends [data-footer-badges-track]");
    const copy = [...track.parentElement.children].find((child) => child !== track);
    const value = getComputedStyle(track).transform;
    return {
      travelled: value === "none" ? 0 : -new DOMMatrixReadOnly(value).m41,
      period: copy.getBoundingClientRect().left - track.getBoundingClientRect().left,
    };
  });

  const advance = async (page, milliseconds = 400) => {
    const before = await marqueeState(page);
    await page.waitForTimeout(milliseconds);
    const after = await marqueeState(page);
    const delta = after.travelled - before.travelled;
    return delta < 0 ? delta + after.period : delta;
  };

  for (const [name, path, label, pause, play] of [
    ["home-en", "/", "Featured on", "Pause", "Play"],
    ["home-zh", "/zh/", "收录于", "暂停", "播放"],
  ]) {
    it(name + " puts the badges on one line that scrolls itself at 1440 and 390", async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl + path, { waitUntil: "load", timeout: 25_000 });
        await page.locator(stripSelector).scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        const desktop = await rowShape(page);
        expect(desktop.label, path + ": the row title").toBe(label);
        expect(desktop.ariaLabel, path + ": the row's accessible name").toBe(label);
        expect(desktop.labelFirst, path + ": the row opens with its title").toBe(true);
        expect(desktop.toggleLast, path + ": the pause control closes the row").toBe(true);
        expect(Math.abs(desktop.labelCentre - desktop.stripCentre), path + ": the title sits on the strip's line").toBeLessThanOrEqual(1);
        expect(Math.abs(desktop.toggleCentre - desktop.stripCentre), path + ": the pause control sits on the strip's line").toBeLessThanOrEqual(1);
        // One row: the label, the line of badges and the control, never the five
        // wrapped rows this replaced.
        expect(desktop.navHeight, path + " at 1440px: the badge row is one line high").toBeLessThanOrEqual(90);
        expect(desktop.documentOverflow, path + " at 1440px: the strip never widens the page").toBe(0);
        // 61 anchors: the two friend links + the 59 badges (Issue #1185
        // removed the LaunchIgniter one), all in the source.
        expect(desktop.trackAnchors, path + ": anchors on the source strip").toBe(61);
        expect(desktop.copyAnchors, path + ": anchors in the marquee copy").toBe(61);
        expect(desktop.trackChildren, path + ": the strip carries exactly two copies").toBe(2);
        // Issue #1173 item 1: the fifteen text-only directory links are 28px
        // tiles on the image badges' line, so they add no row height.
        expect(desktop.textTiles.length, path + ": text-only directory links on the strip").toBe(16);
        expect(
          desktop.textTiles.filter((tile) => tile.height === 28).length,
          path + ": every text-only link renders a 28px tile",
        ).toBe(16);
        const lineCentres = [...desktop.textTiles.map((tile) => tile.centre), ...desktop.badgeCentres];
        expect(Math.max(...lineCentres) - Math.min(...lineCentres), path + ": text tiles and badges share one line")
          .toBeLessThanOrEqual(1);
        expect(desktop.stripScrolls, path + ": the strip scrolls what it cannot show").toBe(true);
        expect(desktop.toggleText, path + ": the pause control's label").toBe(pause);
        expect(await advance(page), path + " at 1440px: the strip scrolls itself").toBeGreaterThan(5);
        // The copy is the loop, not a second set of links: hidden from screen
        // readers, inert, and not focusable.
        expect(desktop.copyIsDuplicate, path + ": the copy must repeat the strip exactly").toBe(true);
        expect(desktop.copyAriaHidden, path + ": the copy is hidden from screen readers").toBe("true");
        expect(desktop.copyInert, path + ": the copy is inert").toBe(true);
        expect(desktop.copyFocusable, path + ": no link in the copy is focusable").toBe(0);
        expect(Math.abs(desktop.period - (desktop.trackWidth + 18)), path + ": the copy starts one gap after the strip")
          .toBeLessThanOrEqual(2);
        await page.locator("footer.site-footer").screenshot({ path: ".orbi/footer-marquee-" + name + "-1440.png" });

        await page.setViewportSize({ width: 390, height: 900 });
        await page.waitForTimeout(300);
        await page.locator(stripSelector).scrollIntoViewIfNeeded();
        const phone = await rowShape(page);
        // Issue #1188: the phone row is two lines — the title and the pause
        // control above, the strip spanning the footer below — because the
        // single line left the strip 211px wide, one badge at a time.
        expect(phone.labelBottom, path + " at 390px: the title sits above the strip").toBeLessThanOrEqual(phone.stripTop);
        expect(phone.stripWidth, path + " at 390px: the strip spans the footer").toBeGreaterThanOrEqual(300);
        expect(phone.navHeight, path + " at 390px: the title line plus the badge line").toBeLessThanOrEqual(130);
        expect(phone.documentOverflow, path + " at 390px: the strip never widens the page").toBe(0);
        expect(phone.stripScrolls, path + " at 390px: the strip scrolls on a phone too").toBe(true);
        expect(await advance(page), path + " at 390px: the strip scrolls itself").toBeGreaterThan(5);
        await page.locator("footer.site-footer").screenshot({ path: ".orbi/footer-marquee-" + name + "-390.png" });
      } finally {
        await page.close();
      }
    }, 40_000);

    it(name + " stops on hover, on the pause control and under reduced motion", async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl + path, { waitUntil: "load", timeout: 25_000 });
        await page.locator(stripSelector).scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        expect(await advance(page), path + ": the strip runs before anyone touches it").toBeGreaterThan(5);

        // Hovering the strip stops it; leaving starts it again.
        await page.locator(stripSelector).hover();
        await page.waitForTimeout(150);
        expect(Math.abs(await advance(page, 500)), path + ": hovering the strip stops it").toBeLessThan(1);
        await page.mouse.move(2, 2);
        await page.waitForTimeout(150);
        expect(await advance(page), path + ": leaving the strip starts it again").toBeGreaterThan(5);

        // The pause control: one click stops it and flips the label, the next
        // click starts it again (WCAG 2.2.2).
        const toggle = page.locator("footer [data-footer-badges-toggle]");
        await toggle.click();
        await page.waitForTimeout(150);
        expect((await toggle.textContent()).trim(), path + ": the stopped control offers Play").toBe(play);
        expect(Math.abs(await advance(page, 500)), path + ": the pause control stops the strip").toBeLessThan(1);
        await toggle.click();
        await page.waitForTimeout(150);
        expect((await toggle.textContent()).trim(), path + ": the running control offers Pause").toBe(pause);
        expect(await advance(page), path + ": the pause control starts the strip again").toBeGreaterThan(5);

        // Keyboard focus inside the strip stops it too, so a link cannot move
        // away from the visitor while they tab through it.
        await page.locator('footer .footer-badges [data-footer-badges-track] a[href="https://launchtory.com/projects/orbi-build"]').focus();
        await page.waitForTimeout(150);
        expect(Math.abs(await advance(page, 500)), path + ": a focused badge stops the strip").toBeLessThan(1);
      } finally {
        await page.close();
      }
    }, 40_000);
  }

  it("does not scroll at all under prefers-reduced-motion: reduce", async () => {
    const page = await guardedPage(browser, baseUrl);
    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(baseUrl + "/", { waitUntil: "load", timeout: 25_000 });
      await page.locator(stripSelector).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const state = await page.evaluate((selector) => {
        const strip = document.querySelector(selector);
        const nav = strip.closest("nav.footer-friends");
        const toggle = nav.querySelector("[data-footer-badges-toggle]");
        strip.scrollLeft = 120;
        return {
          scrollLeft: strip.scrollLeft,
          overflowX: getComputedStyle(strip).overflowX,
          stripScrolls: strip.scrollWidth > strip.clientWidth,
          toggleDisplay: getComputedStyle(toggle).display,
        };
      }, stripSelector);
      // A native horizontal scroller the visitor can drag or scroll, not a
      // running marquee: the same box, scrollable by hand.
      expect(state.overflowX, "reduced motion: the strip becomes a scroller").toBe("auto");
      expect(state.stripScrolls, "reduced motion: the strip still holds every badge").toBe(true);
      expect(state.scrollLeft, "reduced motion: the strip scrolls by hand").toBeGreaterThan(100);
      expect(state.toggleDisplay, "reduced motion: no pause control for a strip that does not move").toBe("none");
      expect(Math.abs(await advance(page, 600)), "reduced motion: the strip never moves by itself").toBeLessThan(1);
    } finally {
      await page.close();
    }
  }, 40_000);
});

// Issue #1188: on a phone the "Featured on" title and the pause control took
// most of the badge strip's line — 71px of title, 52px of control and two 12px
// gaps out of a 358px row left the strip 211px, one badge at a time. The title
// and the control now share a line of their own above the strip, so the strip
// spans the footer's full width; the desktop three-in-a-row layout (Issue
// #1173) stays exactly as it was.
describe("the footer badge strip spans the phone's width (Issue #1188)", () => {
  const friendsShape = (page) => page.evaluate(() => {
    const nav = document.querySelector("footer nav.footer-friends");
    const label = nav.querySelector(".footer-friends-label");
    const strip = nav.querySelector(".footer-badges");
    const toggle = nav.querySelector("[data-footer-badges-toggle]");
    const rect = (node) => node.getBoundingClientRect();
    const centre = (node) => {
      const box = rect(node);
      return Math.round((box.top + box.bottom) / 2);
    };
    return {
      footerLeft: Math.round(rect(nav).left),
      footerRight: Math.round(rect(nav).right),
      footerWidth: Math.round(rect(nav).width),
      navHeight: Math.round(rect(nav).height),
      labelLeft: Math.round(rect(label).left),
      labelRight: Math.round(rect(label).right),
      labelBottom: Math.round(rect(label).bottom),
      labelCentre: centre(label),
      stripTop: Math.round(rect(strip).top),
      stripWidth: Math.round(rect(strip).width),
      stripCentre: centre(strip),
      toggleLeft: Math.round(rect(toggle).left),
      toggleRight: Math.round(rect(toggle).right),
      toggleBottom: Math.round(rect(toggle).bottom),
      toggleCentre: centre(toggle),
      stripScrolls: strip.scrollWidth > strip.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  // How many badges the visitor sees side by side, from the first image badge
  // onwards: a badge counts when at least half of it sits inside the strip's
  // visible box. Measured under reduced motion, where the track holds still
  // (no marquee transform) and the strip is a scroller that can be positioned.
  const badgesInView = (page) => page.evaluate(() => {
    const strip = document.querySelector("footer nav.footer-friends .footer-badges");
    const track = strip.querySelector("[data-footer-badges-track]");
    const stripRect = strip.getBoundingClientRect();
    const widths = [...track.querySelectorAll("img")].map((image) => image.getBoundingClientRect().width);
    const firstImage = [...track.children].find((entry) => entry.querySelector("img"));
    // Skip the two friend links that open the strip in their own text group.
    strip.scrollLeft += firstImage.getBoundingClientRect().left - stripRect.left;
    const start = strip.getBoundingClientRect();
    return {
      stripWidth: Math.round(start.width),
      averageBadge: Math.round(widths.reduce((total, width) => total + width, 0) / widths.length),
      visible: [...track.children]
        .filter((entry) => entry.querySelector("img"))
        .filter((entry) => {
          const box = entry.getBoundingClientRect();
          const inside = Math.min(box.right, start.right) - Math.max(box.left, start.left);
          return inside >= box.width / 2;
        })
        .map((entry) => entry.querySelector("img").alt),
    };
  });

  for (const [name, path, pause, play] of [
    ["home-en", "/", "Pause", "Play"],
    ["home-zh", "/zh/", "暂停", "播放"],
  ]) {
    it(name + " gives the badge strip the full width at 390 and keeps one line at 1440", async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl + path, { waitUntil: "load", timeout: 25_000 });
        const strip = page.locator("footer nav.footer-friends .footer-badges");
        await strip.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        // Desktop is Issue #1173's row, untouched: title, strip and control on
        // one centre line, in that order, with the strip between the two.
        const desktop = await friendsShape(page);
        expect(Math.abs(desktop.labelCentre - desktop.stripCentre), path + " at 1440px: the title stays on the strip's line")
          .toBeLessThanOrEqual(1);
        expect(Math.abs(desktop.toggleCentre - desktop.stripCentre), path + " at 1440px: the control stays on the strip's line")
          .toBeLessThanOrEqual(1);
        expect(desktop.labelRight, path + " at 1440px: the title precedes the strip").toBeLessThanOrEqual(desktop.toggleLeft);
        expect(desktop.documentOverflow, path + " at 1440px: no horizontal overflow").toBe(0);
        expect(desktop.navHeight, path + " at 1440px: the row is one line high").toBeLessThanOrEqual(90);
        await page.locator("footer.site-footer").screenshot({ path: ".orbi/issue1188-" + name + "-1440.png" });

        await page.setViewportSize({ width: 390, height: 900 });
        await strip.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        const phone = await friendsShape(page);
        // The acceptance criterion: at least 300px of strip at 390px, the full
        // footer width, with nothing overflowing the page.
        expect(phone.stripWidth, path + " at 390px: the strip's visible width").toBeGreaterThanOrEqual(300);
        expect(Math.abs(phone.stripWidth - phone.footerWidth), path + " at 390px: the strip spans the footer")
          .toBeLessThanOrEqual(1);
        expect(phone.documentOverflow, path + " at 390px: no horizontal overflow").toBe(0);
        expect(phone.stripScrolls, path + " at 390px: the strip still scrolls what it cannot show").toBe(true);
        // The title and the pause control own the line above the strip, so
        // neither of them takes width away from it.
        expect(phone.labelBottom, path + " at 390px: the title sits above the strip")
          .toBeLessThanOrEqual(phone.stripTop);
        expect(phone.toggleBottom, path + " at 390px: the control sits above the strip too")
          .toBeLessThanOrEqual(phone.stripTop);
        expect(Math.abs(phone.labelCentre - phone.toggleCentre), path + " at 390px: the title and the control share their line")
          .toBeLessThanOrEqual(1);
        expect(phone.labelLeft, path + " at 390px: the title opens the row").toBe(phone.footerLeft);
        expect(phone.toggleRight, path + " at 390px: the control closes the row").toBe(phone.footerRight);
        // Two lines now: the title/control line and the badge line.
        expect(phone.navHeight, path + " at 390px: two lines, never three").toBeLessThanOrEqual(130);
        await page.locator("footer.site-footer").screenshot({ path: ".orbi/issue1188-" + name + "-390.png" });

        // The pause control still works from the keyboard: it is focusable,
        // shows a ring, and Enter / Space flip it.
        const toggle = page.locator("footer [data-footer-badges-toggle]");
        await toggle.focus();
        const focused = await page.evaluate(() => {
          const active = document.activeElement;
          const style = getComputedStyle(active);
          return {
            isToggle: active?.hasAttribute("data-footer-badges-toggle") ?? false,
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
          };
        });
        expect(focused.isToggle, path + " at 390px: the control takes keyboard focus").toBe(true);
        expect(focused.outlineStyle, path + " at 390px: the focused control shows a ring").not.toBe("none");
        expect(focused.outlineWidth, path + " at 390px: the focused control shows a ring").not.toBe("0px");
        await page.keyboard.press("Enter");
        expect((await toggle.textContent()).trim(), path + " at 390px: Enter pauses the strip").toBe(play);
        expect(
          await page.evaluate(() => document.querySelector("footer .footer-badges").classList.contains("is-paused")),
          path + " at 390px: the paused strip carries is-paused",
        ).toBe(true);
        await page.keyboard.press(" ");
        expect((await toggle.textContent()).trim(), path + " at 390px: Space starts the strip again").toBe(pause);

        // ...and a click still works, the way it did before the layout moved.
        await toggle.click();
        expect((await toggle.textContent()).trim(), path + " at 390px: a click pauses the strip").toBe(play);
        await toggle.click();
        expect((await toggle.textContent()).trim(), path + " at 390px: a click resumes the strip").toBe(pause);

        // The point of the wider strip: two or three badges in view at once
        // (before this change the 211px strip showed one).
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.waitForTimeout(200);
        const inView = await badgesInView(page);
        expect(inView.stripWidth, path + " under reduced motion: the strip keeps the full width")
          .toBeGreaterThanOrEqual(300);
        expect(inView.stripWidth, path + " at 390px: room for two typical badges plus the gaps between them")
          .toBeGreaterThanOrEqual(2 * (inView.averageBadge + 18));
        expect(inView.visible.length, path + " at 390px: at least two badges are visible side by side")
          .toBeGreaterThanOrEqual(2);
        await page.emulateMedia({ reducedMotion: "no-preference" });
      } finally {
        await page.close();
      }
    }, 40_000);
  }
});


// Issue #1187: the marquee used to leave a blank slot wherever a badge still
// carried loading="lazy" — its image only started downloading once that badge
// scrolled into view, so the strip moved through an empty box until it arrived.
// Every strip badge now loads with the page, so after the load event the whole
// strip is decoded while the footer is still below the fold.
describe("the footer badge strip loads its images before it scrolls (Issue #1187)", () => {
  for (const [name, path] of [["home-en", "/"], ["home-zh", "/zh/"]]) {
    it(name + " has every strip badge decoded after load, with the footer still out of view", async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl + path, { waitUntil: "load", timeout: 25_000 });
        const result = await page.evaluate(() => {
          const footer = document.querySelector("footer.site-footer");
          const images = [...document.querySelectorAll("footer .footer-badges [data-footer-badges-track] img")];
          return {
            footerTop: Math.round(footer.getBoundingClientRect().top),
            viewportHeight: window.innerHeight,
            total: images.length,
            lazy: images.filter((image) => image.loading === "lazy").map((image) => image.getAttribute("src")),
            pending: images
              .filter((image) => !image.complete || image.naturalWidth === 0)
              .map((image) => image.getAttribute("src")),
          };
        });
        // The reading only says something while the footer has not been
        // scrolled into view: that is the moment a lazy badge used to wait for.
        expect(result.footerTop, path + ": the footer is still below the fold").toBeGreaterThan(result.viewportHeight);
        expect(result.total, path + ": badge images in the strip").toBeGreaterThan(0);
        expect(result.lazy, path + ": no strip badge waits for the viewport").toEqual([]);
        expect(result.pending, path + ": every strip badge is decoded after the load event").toEqual([]);
        const footer = page.locator("footer.site-footer");
        await footer.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await footer.screenshot({ path: ".orbi/footer-badges-loaded-" + name + ".png" });
      } finally {
        await page.close();
      }
    }, 30_000);
  }
});
