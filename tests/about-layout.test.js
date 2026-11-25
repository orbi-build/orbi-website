// Issue #1479: the site-level About page, driven in a real Chromium against
// the committed build. The page is copy and layout, so the gate the ticket
// names is a browser one: no sideways scroll at desktop or phone width, a clean
// console and network, a portrait sharp enough for its box, and the footer
// "About" entry and the language switch landing on the right page.
//
// Everything here runs against public/ served over HTTP, the same bytes the
// Worker deploys. Headless is the gate, not the acceptance verdict: the
// maintainer checks the rendered page on beta after the merge.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const PAGES = [
  { name: "about-en", path: "/about/", footerHome: "/", title: "The lights-out software factory that builds itself." },
  { name: "about-zh", path: "/zh/about/", footerHome: "/zh/", title: "这座软件黑灯工厂，一直在造它自己。" },
];
const WIDTHS = [1440, 390];

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
    // Worker routes the shipped scripts call on every page: the stats snapshot
    // and the engagement beacon (src/worker.js). Serving them here keeps the
    // console/network assertion about this page instead of the static server.
    if (pathname === "/stats") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ repos: {} }));
      return;
    }
    if (pathname === "/cloud/e" && request.method === "POST") {
      request.resume();
      response.writeHead(204);
      response.end();
      return;
    }
    const file = await serve(pathname);
    if (!file) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": contentTypes[extname(file[0])] ?? "application/octet-stream" });
    response.end(file[1]);
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

// A page that records every console error and every failed same-origin
// response, so one assertion per page can fail with the actual message.
async function openPage() {
  const page = await guardedPage(browser, baseUrl);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === new URL(baseUrl).origin && response.status() >= 400) {
      errors.push(`${response.status()} ${url.pathname}`);
    }
  });
  return { page, errors };
}

describe("the About page in the browser (Issue #1479)", () => {
  for (const target of PAGES) {
    it(`${target.name}: fits the viewport, loads its portrait sharp, no console or network errors`, async () => {
      const { page, errors } = await openPage();
      try {
        await page.setViewportSize({ width: WIDTHS[0], height: 900 });
        await page.goto(`${baseUrl}${target.path}`, { waitUntil: "load", timeout: 25_000 });
        await page.evaluate(() => document.fonts.ready);
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          const measured = await page.evaluate(() => {
            const documentElement = document.documentElement;
            const portrait = document.querySelector(".about-portrait img");
            const rect = portrait.getBoundingClientRect();
            return {
              overflow: documentElement.scrollWidth - documentElement.clientWidth,
              naturalWidth: portrait.naturalWidth,
              displayWidth: rect.width,
              devicePixelRatio: window.devicePixelRatio,
              complete: portrait.complete,
            };
          });
          expect(measured.complete, `${target.path} at ${width}px: portrait loaded`).toBe(true);
          expect(measured.overflow, `${target.path} at ${width}px: document overflow`).toBeLessThanOrEqual(0);
          expect(measured.displayWidth, `${target.path} at ${width}px: portrait box`).toBe(width === 1440 ? 160 : 88);
          expect(
            measured.naturalWidth / (measured.displayWidth * measured.devicePixelRatio),
            `${target.path} at ${width}px: portrait sharpness`,
          ).toBeGreaterThanOrEqual(1);
          await page.screenshot({ path: `.orbi/${target.name}-${width}.png`, fullPage: true });
        }
        expect(errors, `${target.path}: browser errors\n${errors.join("\n")}`).toEqual([]);
      } finally {
        await page.close();
      }
    }, 40_000);

    it(`${target.name}: the footer About entry and the language switch land on the right pages`, async () => {
      const { page, errors } = await openPage();
      try {
        await page.setViewportSize({ width: WIDTHS[0], height: 900 });
        await page.goto(`${baseUrl}${target.footerHome}`, { waitUntil: "load", timeout: 25_000 });
        const companyGroup = page.locator("footer.site-footer .footer-group").last();
        const aboutEntry = companyGroup.locator("ul li").first().locator("a");
        expect((await aboutEntry.textContent()).trim(), `${target.footerHome}: footer About label`)
          .toBe(target.path.startsWith("/zh/") ? "关于" : "About");
        await aboutEntry.click();
        await page.waitForURL(`**${target.path}`, { timeout: 25_000 });
        await page.waitForLoadState("load");
        expect((await page.locator("h1").first().textContent()).trim()).toBe(target.title);

        const switchingToZh = target.path === "/about/";
        const switcher = page.locator(`footer.site-footer .footer-language a[lang="${switchingToZh ? "zh-CN" : "en"}"]`);
        await switcher.click();
        await page.waitForURL(`**${switchingToZh ? "/zh/about/" : "/about/"}`, { timeout: 25_000 });
        await page.waitForLoadState("load");
        expect((await page.locator("h1").first().textContent()).trim())
          .toBe(switchingToZh ? "这座软件黑灯工厂，一直在造它自己。" : "The lights-out software factory that builds itself.");
        expect(errors, `${target.path}: browser errors\n${errors.join("\n")}`).toEqual([]);
      } finally {
        await page.close();
      }
    }, 40_000);
  }
});

// Issue #1488: the Chinese hero headline's positioning phrase 「软件黑灯工厂」 is one
// word, so it must not be split between 「工」 and 「厂」 on a phone. CJK offers a
// break opportunity between any two characters, so the browser used one as soon as
// the first sentence no longer fitted; the assertion is per glyph, because a
// container-level width check stays green while the glyphs sit on two lines.
// 390 is the width the ticket names; 360 is the narrow Android width where the box
// is smaller than the nine characters before the comma, which is the state the
// reporter's browser rendered in. 「一直在」 is the word that break moves onto once
// 「工厂」 may no longer break, so it is held together for the same reason.
const WORDS = ["软件黑灯工厂", "一直在"];
const PHONE_AND_DESKTOP = [1440, 390, 360];

describe("the Chinese About hero keeps 「软件黑灯工厂」 whole (Issue #1488)", () => {
  it(`every glyph of ${WORDS.map((word) => `「${word}」`).join(" and ")} shares one line at ${PHONE_AND_DESKTOP.join(" / ")} px`, async () => {
    const { page, errors } = await openPage();
    try {
      await page.goto(`${baseUrl}/zh/about/`, { waitUntil: "load", timeout: 25_000 });
      await page.evaluate(() => document.fonts.ready);
      for (const width of PHONE_AND_DESKTOP) {
        await page.setViewportSize({ width, height: 900 });
        const measured = await page.evaluate((words) => {
          const h1 = document.querySelector("#about-title");
          const glyphs = [];
          const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            for (let i = 0; i < node.data.length; i += 1) glyphs.push([node, i]);
          }
          const text = glyphs.map(([node, i]) => node.data[i]).join("");
          const topsByWord = words.map((word) => {
            const at = text.indexOf(word);
            return glyphs.slice(at, at + word.length).map(([node, i]) => {
              const range = document.createRange();
              range.setStart(node, i);
              range.setEnd(node, i + 1);
              return Math.round(range.getBoundingClientRect().top * 10) / 10;
            });
          });
          return { text: h1.textContent, topsByWord };
        }, WORDS);
        expect(measured.text, `${width}px: headline copy unchanged`).toBe("这座软件黑灯工厂，一直在造它自己。");
        for (const [index, word] of WORDS.entries()) {
          const tops = measured.topsByWord[index];
          expect(new Set(tops).size, `${width}px: 「${word}」 glyph tops ${tops.join(", ")}`).toBe(1);
        }
        await page.locator("#about-title").screenshot({ path: `.orbi/about-zh-h1-${width}.png` });
      }
      expect(errors, `/zh/about/: browser errors\n${errors.join("\n")}`).toEqual([]);
    } finally {
      await page.close();
    }
  }, 40_000);
});
