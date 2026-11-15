// Issue #1342: a visitor who clicks a Cloud login link on a slow connection
// clicked it again because nothing seemed to happen, and every extra click
// restarted the GitHub jump. This suite drives the real built pages in
// Chromium: the clicked link switches to "Opening GitHub…" / "正在打开
// GitHub…", a second click sends no second /cloud/login request, the
// cta_click beacon still records each click exactly once, and a cache restore
// (pageshow with persisted) puts the link back so it can start a new jump.
//
// The login handoff is answered 204 on purpose: the browser discards that
// navigation and keeps the document, which is the state the visitor is in
// while GitHub is still loading. Screenshots of the pending button land in
// .orbi/screenshots/ for the report.

import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";

const artifacts = ".orbi/screenshots";

// The three page families the Issue names — home, the Cloud page and a post —
// in both languages. The selector is each page's own login CTA.
const CASES = [
  { name: "home-en", path: "/", detail: "cloud-start", login: "/cloud/login", pending: "Opening GitHub…" },
  { name: "home-zh", path: "/zh/", detail: "cloud-start", login: "/zh/cloud/login", pending: "正在打开 GitHub…" },
  { name: "cloud-en", path: "/cloud/", detail: "cloud-hero", login: "/cloud/login", pending: "Opening GitHub…" },
  { name: "cloud-zh", path: "/zh/cloud/", detail: "cloud-hero", login: "/zh/cloud/login", pending: "正在打开 GitHub…" },
  {
    name: "post-en",
    path: "/blog/ai-code-review-bottleneck/",
    detail: "post-start",
    login: "/cloud/login",
    pending: "Opening GitHub…",
  },
  {
    name: "post-zh",
    path: "/zh/blog/ai-code-review-bottleneck/",
    detail: "post-start",
    login: "/zh/cloud/login",
    pending: "正在打开 GitHub…",
  },
].map((spec) => ({ ...spec, cta: `[data-cta="${spec.detail}"]` }));

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

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

// The login handoff answers 204: Chromium discards a no-content navigation and
// keeps the current document, so the visitor's waiting state is observable and
// a second click is a real click on the same page.
async function openPage(viewport) {
  const page = await guardedPage(browser, baseUrl, {
    viewport: { width: viewport.width, height: viewport.height },
  });
  const beacons = [];
  const logins = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.route("**/cloud/e", async (route) => {
    beacons.push(JSON.parse(route.request().postData() ?? "{}"));
    return route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/cloud/login*", async (route) => {
    logins.push(route.request().url());
    return route.fulfill({ status: 204, body: "" });
  });
  return { page, beacons, logins, pageErrors };
}

async function waitFor(check, message, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

const ctaClicks = (beacons, value) => beacons.filter((beacon) => beacon.kind === "cta_click" && beacon.detail === value);

describe("Issue #1342 login handoff", () => {
  for (const spec of CASES) {
    it(`${spec.name}: clicking the login button shows the pending label and a second click jumps once`, async () => {
      const { page, beacons, logins, pageErrors } = await openPage(VIEWPORTS[0]);
      try {
        await page.goto(`${baseUrl}${spec.path}`, { waitUntil: "load", timeout: 25_000 });
        const button = page.locator(spec.cta);
        const original = (await button.textContent()).trim();

        await button.click();
        await waitFor(async () => (await button.textContent()).trim() === spec.pending,
          `${spec.cta} did not switch to ${spec.pending}`);
        expect((await button.getAttribute("aria-disabled")), `${spec.cta} must be marked disabled`).toBe("true");
        await waitFor(() => Promise.resolve(logins.length === 1), `${spec.cta} started no login jump`);
        expect(new URL(logins[0]).pathname).toBe(spec.login);

        await waitFor(() => Promise.resolve(ctaClicks(beacons, spec.detail).length === 1),
          `${spec.cta}: one click must record one cta_click`);

        // The link is aria-disabled, which Playwright honours as "not enabled";
        // a visitor's finger is not that polite, so click it like one.
        await button.click({ force: true });
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(logins, `${spec.cta}: the second click must not start a second jump`).toHaveLength(1);
        expect((await button.textContent()).trim()).toBe(spec.pending);
        expect((await button.getAttribute("aria-disabled"))).toBe("true");
        await waitFor(() => Promise.resolve(ctaClicks(beacons, spec.detail).length === 2),
          `${spec.cta}: each click must record exactly one cta_click`);

        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
        await waitFor(async () => (await button.textContent()).trim() === original,
          `${spec.cta} did not return to ${original} after a cache restore`);
        expect((await button.getAttribute("aria-disabled")), "a restored link must be clickable again").toBeNull();

        await button.click();
        await waitFor(() => Promise.resolve(logins.length === 2),
          `${spec.cta}: the restored link must start a new jump`);
        expect(new URL(logins[1]).pathname).toBe(spec.login);
        expect(pageErrors, `${spec.path}: no script may throw`).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);
  }

  // The Cloud page's pricing CTA ends in a ↗ span, so a visitor's click can
  // land on that child of the link rather than on the link itself. The handoff
  // script must not detach that child inside its capture listener: the
  // engagement script's own click listener then sees a target whose parent
  // chain is gone, and that click's cta_click beacon is lost.
  const CHILD_CLICK_CASES = [
    { name: "cloud-en", path: "/cloud/", detail: "pricing", pending: "Opening GitHub…" },
    { name: "cloud-zh", path: "/zh/cloud/", detail: "pricing", pending: "正在打开 GitHub…" },
  ];

  for (const spec of CHILD_CLICK_CASES) {
    for (const viewport of VIEWPORTS) {
      it(`${spec.name} at ${viewport.width}px: a click on the CTA's own arrow still records its cta_click`, async () => {
        const { page, beacons, logins, pageErrors } = await openPage(viewport);
        try {
          await page.goto(`${baseUrl}${spec.path}`, { waitUntil: "load", timeout: 25_000 });
          const button = page.locator(`[data-cta="${spec.detail}"]`);
          await button.scrollIntoViewIfNeeded();
          await button.locator("span").click();
          await waitFor(async () => (await button.textContent()).trim() === spec.pending,
            `${spec.detail} did not switch to ${spec.pending}`);
          expect((await button.getAttribute("aria-disabled")), "the link must be marked disabled").toBe("true");
          await waitFor(() => Promise.resolve(ctaClicks(beacons, spec.detail).length === 1),
            `${spec.detail}: a click on the link's own markup must still record its cta_click`);
          await waitFor(() => Promise.resolve(logins.length === 1), `${spec.detail} started no login jump`);
          expect(pageErrors, `${spec.path}: no script may throw`).toEqual([]);
        } finally {
          await page.close();
        }
      }, 60_000);
    }
  }

  for (const spec of CASES.filter((entry) => entry.name.startsWith("home"))) {
    for (const viewport of VIEWPORTS) {
      it(`${spec.name} at ${viewport.width}px shows the pending label in place`, async () => {
        const { page } = await openPage(viewport);
        try {
          await page.goto(`${baseUrl}${spec.path}`, { waitUntil: "load", timeout: 25_000 });
          const button = page.locator(spec.cta);
          await button.click();
          await waitFor(async () => (await button.textContent()).trim() === spec.pending,
            `${spec.cta} did not switch to ${spec.pending}`);
          await button.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${artifacts}/login-pending-${spec.name}-${viewport.width}.png` });
          const box = await button.boundingBox();
          const read = await button.evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            text: element.textContent.trim(),
          }));
          // Measured, not eyeballed: the pending label must fit the button's box
          // the layout already gives it, and the button must keep its height.
          expect(read.text).toBe(spec.pending);
          expect(read.scrollWidth, `${spec.name} at ${viewport.width}px: label clipped`)
            .toBeLessThanOrEqual(read.clientWidth + 1);
          expect(box.width, "the pending label must not collapse the button").toBeGreaterThan(0);
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        } finally {
          await page.close();
        }
      }, 60_000);
    }
  }
});
