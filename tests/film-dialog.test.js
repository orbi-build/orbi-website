// Issue #571: the homepage film dialog flow — open from the trace figure,
// playback starts against a real film source, ended swaps the evidence row for
// the two end buttons, and Esc closes and pauses. Runs against the built
// bytes in public/ through a local static server (the headless gate; the
// voiced-playback acceptance on the deployed beta is the maintainer's).

import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".vtt": "text/vtt",
  ".webm": "video/webm",
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
});

describe("homepage film dialog (Issue #571)", () => {
  it("opens from the trace figure, plays the film, and swaps the footer on ended", async () => {
    const page = await browser.newPage();
    const beacons = [];
    await page.route("**/cloud/e", async (route) => {
      beacons.push(route.request().postData() ?? "");
      await route.fulfill({ status: 204 });
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: "load", timeout: 25_000 });

      // The dialog starts closed on page load.
      expect(await page.locator("#film-dialog").evaluate((el) => el.open)).toBe(false);

      await page.click('[data-cta="film-play"]');
      const dialog = page.locator("#film-dialog");
      await dialog.waitFor({ state: "visible", timeout: 5_000 });
      expect(await dialog.evaluate((el) => el.open)).toBe(true);
      // While the film plays the evidence row shows and the end row stays hidden.
      expect(await page.locator(".film-evidence").isVisible()).toBe(true);
      expect(await page.locator(".film-end").isVisible()).toBe(false);
      await page.waitForFunction(() => document.getElementById("film-video").currentSrc !== "", undefined, { timeout: 10_000 });
      expect(await page.evaluate(() => document.getElementById("film-video").currentSrc)).toContain("orbi-film");
      // The open click starts playback: the video is not paused.
      await page.waitForFunction(() => !document.getElementById("film-video").paused, undefined, { timeout: 10_000 });

      // Half-way beacon fires once past 50% — simulate by seeking past the mark.
      await page.evaluate(() => {
        const video = document.getElementById("film-video");
        Object.defineProperty(video, "duration", { value: 95, configurable: true });
        Object.defineProperty(video, "currentTime", { value: 48, configurable: true });
        video.dispatchEvent(new Event("timeupdate"));
        video.dispatchEvent(new Event("timeupdate"));
      });
      // Full playback: the evidence row hides, both end buttons appear.
      await page.evaluate(() => {
        const video = document.getElementById("film-video");
        Object.defineProperty(video, "currentTime", { value: 95, configurable: true });
        video.dispatchEvent(new Event("ended"));
      });
      await page.waitForTimeout(100);
      expect(await page.locator(".film-evidence").isVisible()).toBe(false);
      expect(await page.locator('.film-end [data-cta="film-end-cloud"]').isVisible()).toBe(true);
      expect(await page.locator('.film-end [data-cta="film-end-selfhost"]').isVisible()).toBe(true);

      // Replaying restores the evidence row (the play listener's contract).
      await page.evaluate(() => document.getElementById("film-video").dispatchEvent(new Event("play")));
      expect(await page.locator(".film-evidence").isVisible()).toBe(true);
      expect(await page.locator(".film-end").isVisible()).toBe(false);

      // Esc closes the modal and pauses the video.
      await page.evaluate(() => {
        const video = document.getElementById("film-video");
        Object.defineProperty(video, "currentTime", { value: 95, configurable: true });
        video.dispatchEvent(new Event("ended"));
      });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      expect(await dialog.evaluate((el) => el.open)).toBe(false);
      expect(await page.evaluate(() => document.getElementById("film-video").paused)).toBe(true);

      // Exactly one film-100 beacon, and a film-50 from the seek: each fires
      // once per page load no matter how often the marks are crossed.
      const details = beacons.map((body) => JSON.parse(body));
      expect(details.filter((body) => body.detail === "film-50")).toHaveLength(1);
      expect(details.filter((body) => body.detail === "film-100")).toHaveLength(1);
      expect(details.every((body) => body.kind === "cta_click" && body.path === "/")).toBe(true);
      expect(errors, "no page errors during the flow").toEqual([]);
    } finally {
      await page.close();
    }
  }, 45_000);

  it("closes on the close button and on a backdrop click", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: "load", timeout: 25_000 });
      const dialog = page.locator("#film-dialog");
      for (const close of ["close-button", "backdrop"]) {
        await page.click('[data-cta="film-play"]');
        await dialog.waitFor({ state: "visible", timeout: 5_000 });
        if (close === "close-button") await page.click(".film-close");
        else await page.mouse.click(5, Math.round((await dialog.boundingBox()).y) + 5);
        await page.waitForTimeout(100);
        expect(await dialog.evaluate((el) => el.open), `${close} closes the dialog`).toBe(false);
      }
    } finally {
      await page.close();
    }
  }, 30_000);
});
