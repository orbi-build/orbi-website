// Site-wide horizontal scroll check (Issue #1211).
//
// Issue #1211 deleted fourteen suites that restated style numbers, pixel
// geometry, fixed sentences or the repository's own issue template. The one
// outcome a visitor feels among them was "the page must not scroll sideways",
// and it was only measured on a handful of hand-picked pages. This suite is
// that outcome for the whole site: every URL in public/sitemap.xml, in a real
// Chromium, at phone (390) and desktop (1440) widths. The document's
// scrollWidth must not exceed its clientWidth — a page that grows wider than
// the viewport drags sideways under the visitor's thumb.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";
import pricing from "../src/pricing.json";
import { paidPriceReplacements } from "../src/pricing-tokens.js";

const WIDTHS = [1440, 390];
const SITE_ORIGIN = "https://orbi.build";

// The build leaves pricing placeholders in public/ and the Worker fills them
// per request, so the test server does the same substitution the deployed site
// gets. Otherwise the tokens would decide the measured widths.
const pricingReplacements = {
  // Issue #1237: the founding price and the struck-through list price state.
  ...paidPriceReplacements(pricing),
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

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
};

let server;
let browser;
let baseUrl;

// The pages this check covers are the site's own indexable URL set: whatever
// the build put in sitemap.xml, nothing hand-listed.
const sitemap = await readFile(join("public", "sitemap.xml"), "utf8");
const pagePaths = [...sitemap.matchAll(/<loc>[^<]*<\/loc>/g)]
  .map(([loc]) => loc.replace(/<[^>]+>/g, ""))
  .filter((url) => url.startsWith(SITE_ORIGIN))
  .map((url) => new URL(url).pathname);

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
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
  assertNoExternalRequests();
});

// Reads the document width plus, for a failure message worth acting on, the
// elements that reach outside the viewport without being clipped by an inner
// scroll container (an article table on a phone is allowed to scroll inside
// its own region; it must not widen the document).
const measureOverflow = () => {
  const documentElement = document.documentElement;
  const viewport = documentElement.clientWidth;
  const name = (element) => {
    const classes = typeof element.className === "string" && element.className.trim()
      ? "." + element.className.trim().split(/\s+/).slice(0, 3).join(".")
      : "";
    return element.tagName.toLowerCase() + (element.id ? `#${element.id}` : "") + classes;
  };
  const clippedByAncestor = (element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden" || overflowX === "clip") return true;
    }
    return false;
  };
  const offenders = [...document.querySelectorAll("body *")]
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && (rect.right > viewport + 1 || rect.left < -1))
    .filter(({ element }) => !clippedByAncestor(element))
    .slice(0, 5)
    .map(({ element, rect }) => `${name(element)} [${Math.round(rect.left)}..${Math.round(rect.right)}]`);
  return {
    innerWidth: window.innerWidth,
    viewport,
    overflow: documentElement.scrollWidth - documentElement.clientWidth,
    offenders,
  };
};

describe("every sitemap page stays inside the viewport (Issue #1211)", () => {
  it("covers the sitemap's pages", () => {
    expect(pagePaths.length, "sitemap pages to check").toBeGreaterThan(0);
    expect(pagePaths, "the homepage is in the sitemap").toContain("/");
  });

  for (const path of pagePaths) {
    it(`${path} never scrolls sideways at 1440 or 390`, async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: WIDTHS[0], height: 900 });
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        await page.evaluate(() => document.fonts.ready);
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          const result = await page.evaluate(measureOverflow);
          const detail = result.offenders.length > 0 ? ` — widest without clipping: ${result.offenders.join(", ")}` : "";
          expect(result.innerWidth, `${path} at ${width}px: viewport measured`).toBe(width);
          expect(
            result.overflow,
            `${path} at ${width}px: document is ${result.overflow}px wider than its ${result.viewport}px viewport${detail}`,
          ).toBeLessThanOrEqual(0);
        }
      } finally {
        await page.close();
      }
    }, 30_000);
  }
});
