import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";

// Issue #1081: the narrow-window menu hung 7.5px past each page edge on a
// window with a classic vertical scrollbar — `width: 100vw` counts the
// scrollbar, the page does not — so opening it widened the document and added
// a horizontal scrollbar. Playwright's headless Chromium defaults to
// `--hide-scrollbars`, where 100vw and the page width are equal and the bug is
// invisible. The scrollbar cases therefore run a browser launched without that
// flag; the default launch stays as the overlay-scrollbar regression.

const pages = [
  ["home-en", "/"],
  ["home-zh", "/zh/"],
];
// window.innerWidth, which is what the CSS media queries measure: 760/761 and
// 900/901 are the breakpoints around the two header gutters and the menu.
const queryWidths = [760, 761, 900, 901];
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
};

let server;
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
    const file = await serve(new URL(request.url, "http://localhost").pathname);
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
}, 60_000);

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  assertNoExternalRequests();
});

const measure = (page) => page.evaluate(() => {
  const nav = document.querySelector("[data-primary-nav]");
  const toggle = document.querySelector("[data-menu-toggle]");
  const rect = nav.getBoundingClientRect();
  const documentElement = document.documentElement;
  return {
    innerWidth: window.innerWidth,
    clientWidth: documentElement.clientWidth,
    scrollWidth: documentElement.scrollWidth,
    navLeft: Math.round(rect.left * 10) / 10,
    navRight: Math.round(rect.right * 10) / 10,
    navWidth: Math.round(rect.width * 10) / 10,
    navVisible: getComputedStyle(nav).display !== "none",
    toggleVisible: getComputedStyle(toggle).display !== "none",
    ariaExpanded: toggle.getAttribute("aria-expanded"),
  };
});

const openMenu = (page) => page.locator("[data-menu-toggle]").click();

const shot = (page, name, metrics) => page.screenshot({
  path: `.orbi/nav-menu-width-${name}-${metrics.innerWidth}-${metrics.navVisible ? "open" : "closed"}.png`,
  clip: { x: 0, y: 0, width: Math.max(1, metrics.clientWidth), height: 420 },
});

// Everything below needs a window whose scrollbar occupies width, so the whole
// group shares one browser launched without Chromium's --hide-scrollbars.
describe("the menu never widens the document (Issue #1081)", () => {
  let browser;
  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      ignoreDefaultArgs: ["--hide-scrollbars"],
      args: ["--disable-features=OverlayScrollbar,OverlayScrollbars"],
    });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  // The core reproduction: a 405px window whose 15px classic scrollbar leaves a
  // 390px page. Before the fix the open menu measured x=-7.5 / right=397.5 and
  // the document grew to 398px, eight pixels past the page.
  for (const [name, path] of pages) {
    it(`${name} keeps a 390px page at 390px when the menu opens`, async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: 405, height: 900 });
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });

        const closed = await measure(page);
        expect(closed.innerWidth, `${path}: the classic scrollbar must occupy width`)
          .toBeGreaterThan(closed.clientWidth);
        expect(closed.clientWidth, `${path}: available page width`).toBe(390);
        expect(closed.scrollWidth, `${path}: closed menu must not scroll horizontally`)
          .toBe(closed.clientWidth);
        expect(closed.navVisible, `${path}: the menu starts closed`).toBe(false);
        expect(closed.ariaExpanded, `${path}: the closed toggle`).toBe("false");

        await openMenu(page);
        const open = await measure(page);
        expect(open.ariaExpanded, `${path}: the open toggle`).toBe("true");
        expect(open.navVisible, `${path}: the open menu is displayed`).toBe(true);
        expect(open.scrollWidth, `${path}: the open menu must not widen the document`)
          .toBeLessThanOrEqual(open.clientWidth);
        expect(Math.abs(open.navLeft - 0), `${path}: menu left edge at ${open.navLeft}px`)
          .toBeLessThanOrEqual(1);
        expect(Math.abs(open.navRight - open.clientWidth), `${path}: menu right edge at ${open.navRight}px`)
          .toBeLessThanOrEqual(1);
        await shot(page, name, open);
      } finally {
        await page.close();
      }
    }, 30_000);
  }

  // The two header gutters (24px above 760, 16px at 760 and below) and the
  // menu/desktop-nav switch at 901 mean four width tiers decide the geometry.
  for (const [name, path] of pages) {
    it(`${name} keeps the page within its own width at 760, 761, 900 and 901`, async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: queryWidths[0], height: 900 });
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        for (const width of queryWidths) {
          // `width` is the media-query width (window.innerWidth); the page is
          // narrower by the scrollbar, and every tier records both.
          await page.setViewportSize({ width, height: 900 });
          const menuMode = width <= 900;
          const metrics = await measure(page);
          const label = `${path} at innerWidth ${width} (clientWidth ${metrics.clientWidth})`;
          expect(metrics.innerWidth, label).toBe(width);
          expect(metrics.toggleVisible, `${label}: the hamburger shows only up to 900px`).toBe(menuMode);
          if (menuMode) {
            await openMenu(page);
          }
          const state = await measure(page);
          expect(state.scrollWidth, `${label}: no horizontal scroll`).toBeLessThanOrEqual(state.clientWidth);
          expect(state.navVisible, `${label}: the nav is visible`).toBe(true);
          if (menuMode) {
            expect(state.ariaExpanded, label).toBe("true");
            expect(Math.abs(state.navLeft - 0), `${label}: menu left edge at ${state.navLeft}px`)
              .toBeLessThanOrEqual(1);
            expect(Math.abs(state.navRight - state.clientWidth), `${label}: menu right edge at ${state.navRight}px`)
              .toBeLessThanOrEqual(1);
            await shot(page, name, state);
            await page.locator("[data-menu-toggle]").click();
          } else {
            // 901px and up: the desktop nav keeps its inline row inside the
            // header instead of becoming the full-width sheet.
            expect(state.ariaExpanded, label).toBe("false");
            expect(state.navWidth, `${label}: the desktop nav keeps its own width`)
              .toBeLessThan(state.clientWidth);
            expect(state.navLeft, `${label}: the desktop nav stays on the page`).toBeGreaterThanOrEqual(0);
            expect(state.navRight, `${label}: the desktop nav stays on the page`)
              .toBeLessThanOrEqual(state.clientWidth);
            await shot(page, name, state);
          }
        }
      } finally {
        await page.close();
      }
    }, 60_000);
  }

  // The width change must not touch what the menu does: mouse toggling, the tab
  // sequence through its links, the focus ring, Escape and aria-expanded.
  for (const [name, path] of pages) {
    it(`${name} toggles, tabs through and escapes from the menu`, async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: 405, height: 900 });
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        const toggle = page.locator("[data-menu-toggle]");

        await toggle.click();
        expect((await measure(page)).ariaExpanded, `${path}: opened with the mouse`).toBe("true");
        await toggle.click();
        const closed = await measure(page);
        expect(closed.ariaExpanded, `${path}: closed with the mouse`).toBe("false");
        expect(closed.navVisible, `${path}: the closed menu is hidden`).toBe(false);

        // Keyboard: the toggle opens the menu, and Tab walks the links in order
        // with a visible focus ring, then leaves the menu.
        await toggle.focus();
        await page.keyboard.press("Enter");
        const opened = await measure(page);
        expect(opened.ariaExpanded, `${path}: Enter on the toggle opens the menu`).toBe("true");
        expect(opened.scrollWidth, `${path}: keyboard-opened menu must not scroll horizontally`)
          .toBeLessThanOrEqual(opened.clientWidth);

        const linkCount = await page.locator("[data-primary-nav] > a").count();
        expect(linkCount, `${path}: the menu keeps its links`).toBe(5);
        const visited = [];
        for (let step = 0; step < linkCount; step += 1) {
          await page.keyboard.press("Tab");
          visited.push(await page.evaluate(() => {
            const active = document.activeElement;
            const style = getComputedStyle(active);
            return {
              inMenu: Boolean(active?.closest("[data-primary-nav]")),
              href: active?.getAttribute("href"),
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
            };
          }));
        }
        expect(visited.every((step) => step.inMenu), `${path}: Tab walks the menu links`).toBe(true);
        expect(new Set(visited.map((step) => step.href)).size, `${path}: each Tab reaches a new link`)
          .toBe(linkCount);
        for (const [index, step] of visited.entries()) {
          expect(step.outlineStyle, `${path}: menu link ${index + 1} focus ring`).not.toBe("none");
          expect(step.outlineWidth, `${path}: menu link ${index + 1} focus ring`).not.toBe("0px");
        }
        await page.keyboard.press("Tab");
        expect(
          await page.evaluate(() => Boolean(document.activeElement?.closest("[data-primary-nav]"))),
          `${path}: Tab after the last link leaves the menu`,
        ).toBe(false);

        // Escape closes the menu and returns focus to the button.
        await page.locator("[data-primary-nav] > a").first().focus();
        await page.keyboard.press("Escape");
        const escaped = await page.evaluate(() => ({
          ariaExpanded: document.querySelector("[data-menu-toggle]").getAttribute("aria-expanded"),
          navVisible: getComputedStyle(document.querySelector("[data-primary-nav]")).display !== "none",
          focusOnToggle: document.activeElement === document.querySelector("[data-menu-toggle]"),
        }));
        expect(escaped.ariaExpanded, `${path}: Escape closes the menu`).toBe("false");
        expect(escaped.navVisible, `${path}: Escape hides the menu`).toBe(false);
        expect(escaped.focusOnToggle, `${path}: Escape returns focus to the button`).toBe(true);
      } finally {
        await page.close();
      }
    }, 30_000);
  }
});

// Overlay scrollbars (and Chromium's --hide-scrollbars default) put the page
// width and 100vw back together; the menu must still fill the page exactly.
describe("the menu still fills the page with overlay scrollbars (Issue #1081)", () => {
  let browser;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const [name, path] of pages) {
    it(`${name} fills the page width when the scrollbar takes none`, async () => {
      const page = await guardedPage(browser, baseUrl);
      try {
        await page.setViewportSize({ width: 390, height: 900 });
        await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 25_000 });
        const closed = await measure(page);
        expect(closed.clientWidth, `${path}: an overlay scrollbar takes no width`).toBe(closed.innerWidth);
        await openMenu(page);
        const open = await measure(page);
        expect(open.ariaExpanded, `${path}: the menu opens`).toBe("true");
        expect(open.scrollWidth, `${path}: no horizontal scroll`).toBeLessThanOrEqual(open.clientWidth);
        expect(Math.abs(open.navLeft - 0), `${path}: menu left edge at ${open.navLeft}px`)
          .toBeLessThanOrEqual(1);
        expect(Math.abs(open.navRight - open.clientWidth), `${path}: menu right edge at ${open.navRight}px`)
          .toBeLessThanOrEqual(1);
      } finally {
        await page.close();
      }
    }, 30_000);
  }
});
