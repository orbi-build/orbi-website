// Issue #1457: the /cost/ estimator's real user path. Node can read the
// shipped bytes; only a browser proves the reader's own numbers appear on the
// page — typing a count and switching the price window rewrites the two
// estimates in place, an invalid count explains itself instead of printing
// NaN, and neither language grows a sideways scroll at 1440 or 390.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";
import pricing from "../src/pricing.json";
import { paidPriceReplacements } from "../src/pricing-tokens.js";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

// The Worker fills these per request; serving the committed bytes as-is would
// leave the pricing tokens in the page, which is not what the reader gets.
const pricingReplacements = {
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
  [pricing.usdtTrc20AddressToken]: pricing.usdtTrc20Address,
  [pricing.includedTokensToken]: pricing.includedTokensLabel,
  [pricing.foundingTokensToken]: pricing.foundingTokensLabel,
  [pricing.measuredSmallRepositoryDeliveryRangeToken]: pricing.measuredSmallRepositoryDeliveryRange,
  [pricing.measuredSoloRepositoryDeliveryRangeToken]: pricing.measuredSoloRepositoryDeliveryRange,
  [pricing.measuredLargeCodebaseDeliveriesToken]: pricing.measuredLargeCodebaseDeliveries,
  [pricing.measuredSoloLargeCodebaseDeliveriesToken]: pricing.measuredSoloLargeCodebaseDeliveries,
};

function rendered(html) {
  let out = html;
  for (const [token, value] of Object.entries(pricingReplacements)) out = out.split(token).join(String(value));
  return out;
}

let browser;
let server;
let origin;

async function serve(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\/|\\)+/, "");
  if (relative.split("/").includes("..")) return null;
  const direct = join("public", relative || "index.html");
  const directFile = await readFile(direct).catch(() => null);
  if (directFile !== null) return [direct, directFile];
  const index = join(direct, "index.html");
  const indexFile = await readFile(index).catch(() => null);
  return indexFile === null ? null : [index, indexFile];
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = await serve(pathname);
    if (!file) { response.writeHead(404); response.end("not found"); return; }
    const type = types[extname(file[0])] ?? "application/octet-stream";
    const body = type.startsWith("text/html") ? rendered(file[1].toString("utf8")) : file[1];
    response.writeHead(200, { "content-type": type });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
  assertNoExternalRequests();
});

async function openPage(route, width = 1440) {
  const page = await guardedPage(browser, origin, { viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
  });
  const response = await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
  expect(response?.status(), `${route}: HTTP status`).toBe(200);
  return { page, errors };
}

const estimator = (page) => page.locator("[data-cost-estimator]");
const median = (page) => page.locator("[data-cost-median]");
const high = (page) => page.locator("[data-cost-p90]");
const status = (page) => page.locator("[data-cost-status]");
const countInput = (page) => page.locator("[data-cost-count]");

// Neither the results nor the hidden-until-invalid message may ever read NaN.
async function expectNoNumbersPrinted(page) {
  const text = await estimator(page).innerText();
  expect(text).not.toContain("NaN");
  expect(text).not.toContain("undefined");
}

async function expectNoSidewaysScroll(page, label) {
  const shape = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(shape.scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(shape.clientWidth);
}

describe("the /cost/ estimator (Issue #1457)", () => {
  it("shows the 30-delivery default, then the reader's own count in either price window", async () => {
    const { page, errors } = await openPage("/cost/");
    try {
      expect(await countInput(page).inputValue()).toBe("30");
      expect(await median(page).innerText()).toBe("$2.43");
      expect(await high(page).innerText()).toBe("$7.02");
      expect(await status(page).innerText()).toBe("");

      await countInput(page).fill("100");
      expect(await median(page).innerText()).toBe("$8.10");
      expect(await high(page).innerText()).toBe("$23.40");

      await page.locator('[data-cost-window="peak"]').click();
      expect(await median(page).innerText()).toBe("$16.20");
      expect(await high(page).innerText()).toBe("$46.80");
      expect(await page.locator('[data-cost-window="peak"]').getAttribute("aria-pressed")).toBe("true");

      await page.locator('[data-cost-window="offpeak"]').click();
      expect(await median(page).innerText()).toBe("$8.10");
      expect(await high(page).innerText()).toBe("$23.40");

      // The URL never changes: the estimate happens in place.
      expect(new URL(page.url()).pathname).toBe("/cost/");
      await expectNoNumbersPrinted(page);
      await expectNoSidewaysScroll(page, "en 1440");
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("explains an unusable count instead of printing NaN", async () => {
    const { page, errors } = await openPage("/cost/");
    try {
      for (const bad of ["0", "abc", "10001", "2.5", ""]) {
        await countInput(page).fill(bad);
        expect(await status(page).innerText(), `input "${bad}": message`).toBe("Enter a whole number from 1 to 10000.");
        expect(await page.locator("[data-cost-results]").isHidden(), `input "${bad}": stale result hidden`).toBe(true);
        await expectNoNumbersPrinted(page);
      }

      // Repairing the number brings the estimate back.
      await countInput(page).fill("1");
      expect(await status(page).innerText()).toBe("");
      expect(await median(page).innerText()).toBe("$0.08");
      expect(await high(page).innerText()).toBe("$0.23");
      expect(await page.locator("[data-cost-results]").isVisible()).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("still answers the 30-delivery default with JavaScript off", async () => {
    const page = await guardedPage(browser, origin, { viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
    try {
      const response = await page.goto(`${origin}/cost/`, { waitUntil: "load", timeout: 25_000 });
      expect(response?.status()).toBe(200);
      expect(await countInput(page).inputValue()).toBe("30");
      expect(await median(page).innerText()).toBe("$2.43");
      expect(await high(page).innerText()).toBe("$7.02");
      expect(await page.locator("[data-cost-results]").isVisible()).toBe(true);
      // The rest of the page is untouched by the widget.
      expect(await page.locator("#cost-title").innerText()).toBe("What an AI coding agent costs per merged delivery");
    } finally {
      await page.close();
    }
  });

  it("does the same in Chinese, and stays inside 390px", async () => {
    const { page, errors } = await openPage("/zh/cost/", 390);
    try {
      expect(await countInput(page).inputValue()).toBe("30");
      expect(await median(page).innerText()).toBe("$2.43");
      expect(await high(page).innerText()).toBe("$7.02");

      await countInput(page).fill("100");
      expect(await median(page).innerText()).toBe("$8.10");
      await page.locator('[data-cost-window="peak"]').click();
      expect(await high(page).innerText()).toBe("$46.80");

      await countInput(page).fill("10000");
      expect(await median(page).innerText()).toBe("$1620.00");
      expect(await high(page).innerText()).toBe("$4680.00");
      await expectNoSidewaysScroll(page, "zh 390");

      await countInput(page).fill("0");
      expect(await status(page).innerText()).toBe("请输入 1 到 10000 之间的整数。");
      await expectNoNumbersPrinted(page);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
