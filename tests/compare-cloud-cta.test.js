// Issue #972: the Codex comparison page's choice card and closing now offer the
// Orbi Cloud free trial next to the self-host link. This suite drives the built
// page in Chromium at the two supported widths, asserts the buttons render
// visible, uncovered and inside the viewport, tabs to each Cloud CTA and presses
// Enter with the login handoff intercepted, and checks the engagement beacon
// recorded the CTA detail and the page path. Screenshots land in
// .orbi/screenshots/ for the report.

import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";

const artifacts = ".orbi/screenshots";

const PAGES = [
  {
    name: "en",
    path: "/compare/codex/",
    login: "/cloud/login",
    docs: "https://docs.orbi.build",
    label: "Try Orbi Cloud free →",
    selfHost: "Self-host Orbi ↗",
  },
  {
    name: "zh",
    path: "/zh/compare/codex/",
    login: "/zh/cloud/login",
    docs: "https://docs.orbi.build/zh",
    label: "免费试用 Orbi Cloud →",
    selfHost: "自托管 Orbi ↗",
  },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

// The two changed rows, each with its Cloud CTA and its self-host link.
const ROWS = [
  {
    row: "article.run-option-cloud .cta-row",
    cloud: '[data-cta="codex-choice-cloud"]',
    selfHost: "a.button-outline",
  },
  {
    row: ".closing .cta-row",
    cloud: '[data-cta="codex-closing-cloud"]',
    selfHost: "a.button-dark",
  },
];

// The intercepted login handoff: a stub page, so the click is provable without
// reaching the real OAuth flow.
const LOGIN_STUB =
  '<!doctype html><html lang="en"><head><title>login stub</title></head><body><h1 id="login-stub">login stub</h1></body></html>';

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
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
  await mkdir(artifacts, { recursive: true });
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
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
  assertNoExternalRequests();
});

// A page with both real endpoints stubbed: the engagement beacon is answered 204
// like the site Worker (or aborted, for the failure path), and the login handoff
// is served from a local stub.
async function openPage({ viewport, beacon = "204" }) {
  const page = await guardedPage(browser, baseUrl, {
    viewport: { width: viewport.width, height: viewport.height },
  });
  const beacons = [];
  const logins = [];
  await page.route("**/cloud/e", async (route) => {
    beacons.push(JSON.parse(route.request().postData() ?? "{}"));
    if (beacon === "fail") return route.abort();
    return route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/cloud/login*", async (route) => {
    logins.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: LOGIN_STUB });
  });
  return { page, beacons, logins };
}

// Tab from the top of the document to the CTA carrying `data-cta`, capped so a
// missing focusable target fails fast instead of spinning.
async function tabTo(page, cta) {
  for (let press = 0; press < 300; press += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.dataset?.cta ?? null);
    if (focused === cta) return true;
  }
  return false;
}

async function waitForBeacon(beacons, predicate, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (beacons.some(predicate)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

const overlaps = (a, b) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
  && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;

// The design-system tokens the Cloud buttons and the filled self-host button
// must be filled with (public/styles.css: --signal, --ink).
const SIGNAL_FILL = "255,176,0";
const INK_FILL = "16,41,44";

// Read the button's own pixels: the fill must be the token's colour, and the
// label must have painted dark glyph pixels. A button that is in the DOM but
// renders blank passes every textContent assertion and fails here.
async function buttonPixels(page, selector) {
  const shot = await page.locator(selector).screenshot();
  return page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const counts = new Map();
    for (let index = 0; index < data.length; index += 4) {
      const key = `${data[index]},${data[index + 1]},${data[index + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [fill, fillPixels] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const channels = fill.split(",").map(Number);
    let inkPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      const difference = Math.max(
        Math.abs(data[index] - channels[0]),
        Math.abs(data[index + 1] - channels[1]),
        Math.abs(data[index + 2] - channels[2]),
      );
      if (difference > 100) inkPixels += 1;
    }
    return { fill, fillRatio: fillPixels / (data.length / 4), inkPixels };
  }, `data:image/png;base64,${shot.toString("base64")}`);
}

describe("Codex page Cloud trial entry (Issue #972)", () => {
  for (const spec of PAGES) {
    for (const viewport of VIEWPORTS) {
      it(`${spec.name} at ${viewport.width}px renders both Cloud CTAs uncovered and unclipped`, async () => {
        const { page } = await openPage({ viewport });
        try {
          await page.goto(`${baseUrl}${spec.path}`, { waitUntil: "load", timeout: 25_000 });
          const report = await page.evaluate((rows) => {
            const readRow = ([rowSelector, selectors]) => {
              const row = document.querySelector(rowSelector);
              if (!row) return null;
              row.scrollIntoView({ block: "center", behavior: "instant" });
              return {
                rowSelector,
                buttons: selectors.map((selector) => {
                  const element = row.querySelector(selector);
                  if (!element) return null;
                  const box = element.getBoundingClientRect();
                  const style = getComputedStyle(element);
                  const hit = document.elementFromPoint(
                    Math.round(box.left + box.width / 2),
                    Math.round(box.top + box.height / 2),
                  );
                  return {
                    text: element.textContent.trim(),
                    href: element.getAttribute("href"),
                    search: new URL(element.href, location.origin).search,
                    box: {
                      left: box.left,
                      right: box.right,
                      top: box.top,
                      bottom: box.bottom,
                      width: box.width,
                      height: box.height,
                    },
                    visible: style.visibility !== "hidden"
                      && style.display !== "none"
                      && Number(style.opacity) === 1,
                    uncovered: hit !== null && (element === hit || element.contains(hit)),
                    insideViewport: box.left >= 0 && box.right <= window.innerWidth + 1,
                  };
                }),
              };
            };
            return {
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              rows: rows.map(readRow),
            };
          }, ROWS.map((row) => [row.row, [row.cloud, row.selfHost]]));

          expect(report.overflow, `${spec.path} at ${viewport.width}px page overflow`).toBe(0);
          for (const [index, row] of report.rows.entries()) {
            const expected = ROWS[index];
            const where = `${spec.path} at ${viewport.width}px ${row.rowSelector}`;
            const [cloud, selfHost] = row.buttons;
            expect(cloud, `${where}: missing the Cloud CTA`).not.toBeNull();
            expect(selfHost, `${where}: missing the self-host link`).not.toBeNull();
            expect(cloud.text, `${where}: Cloud label`).toBe(spec.label);
            expect(cloud.href, `${where}: Cloud path`).toBe(spec.login);
            expect(cloud.search, `${where}: Cloud CTA must carry no query string`).toBe("");
            expect(selfHost.text, `${where}: self-host label`).toBe(spec.selfHost);
            expect(selfHost.href, `${where}: self-host must keep the docs address`).toBe(spec.docs);
            for (const button of [cloud, selfHost]) {
              expect(button.visible, `${where}: ${button.text} hidden`).toBe(true);
              expect(button.uncovered, `${where}: ${button.text} covered by another element`).toBe(true);
              expect(button.insideViewport, `${where}: ${button.text} clipped`).toBe(true);
              expect(button.box.width, `${where}: ${button.text} width`).toBeGreaterThan(0);
              expect(button.box.height, `${where}: ${button.text} height`).toBeGreaterThanOrEqual(44);
            }
            expect(overlaps(cloud.box, selfHost.box), `${where}: the two buttons overlap`).toBe(false);

            const cloudPixels = await buttonPixels(page, expected.cloud);
            expect(cloudPixels.fill, `${where}: Cloud fill must be the signal token`).toBe(SIGNAL_FILL);
            expect(cloudPixels.fillRatio, `${where}: Cloud fill coverage`).toBeGreaterThan(0.5);
            expect(cloudPixels.inkPixels, `${where}: Cloud label must paint glyphs`).toBeGreaterThan(20);
          }

          const selfHostPixels = await buttonPixels(page, ".closing .cta-row a.button-dark");
          expect(selfHostPixels.fill, "closing self-host fill must be the ink token").toBe(INK_FILL);
          expect(selfHostPixels.inkPixels, "closing self-host label must paint glyphs").toBeGreaterThan(20);

          await page.screenshot({
            path: `${artifacts}/compare-codex-${spec.name}-${viewport.name}.png`,
            fullPage: true,
          });
          await page.locator(".compare-choice").screenshot({
            path: `${artifacts}/compare-codex-${spec.name}-${viewport.name}-choice.png`,
          });
          await page.locator(".closing").screenshot({
            path: `${artifacts}/compare-codex-${spec.name}-${viewport.name}-closing.png`,
          });
        } finally {
          await page.close();
        }
      }, 60_000);
    }
  }

  for (const spec of PAGES) {
    // Keyboard behaviour is not viewport-dependent: the layout above covers both
    // widths, this covers the Tab order and the login handoff once per language.
    it(`${spec.name} starts the Cloud trial from both CTAs by keyboard`, async () => {
      for (const cta of ["codex-choice-cloud", "codex-closing-cloud"]) {
        const { page, beacons, logins } = await openPage({ viewport: VIEWPORTS[0] });
        try {
          await page.goto(`${baseUrl}${spec.path}`, { waitUntil: "load", timeout: 25_000 });
          expect(await tabTo(page, cta), `${cta} is not keyboard reachable`).toBe(true);
          await Promise.all([
            page.waitForURL((url) => url.pathname === spec.login, { timeout: 10_000 }),
            page.keyboard.press("Enter"),
          ]);
          expect(logins).toHaveLength(1);
          const requested = new URL(logins[0]);
          expect(requested.pathname, `${cta}: login path`).toBe(spec.login);
          expect(requested.search, `${cta}: login handoff must stay query-free`).toBe("");
          expect(
            await waitForBeacon(beacons, (beacon) => beacon.kind === "cta_click" && beacon.detail === cta),
            `${cta}: the beacon must report this cta_click`,
          ).toBe(true);
          const click = beacons.find((beacon) => beacon.kind === "cta_click");
          expect(click.path, `${cta}: reported page path`).toBe(spec.path);
        } finally {
          await page.close();
        }
      }
    }, 90_000);
  }

  it("still navigates to the trial when the engagement beacon fails", async () => {
    for (const spec of PAGES) {
      const { page, logins } = await openPage({ viewport: VIEWPORTS[0], beacon: "fail" });
      try {
        await page.goto(`${baseUrl}${spec.path}`, { waitUntil: "load", timeout: 25_000 });
        expect(await tabTo(page, "codex-closing-cloud")).toBe(true);
        await Promise.all([
          page.waitForURL((url) => url.pathname === spec.login, { timeout: 10_000 }),
          page.keyboard.press("Enter"),
        ]);
        expect(logins).toHaveLength(1);
        expect(new URL(logins[0]).pathname).toBe(spec.login);
      } finally {
        await page.close();
      }
    }
  }, 60_000);
});
