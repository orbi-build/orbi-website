// Issue #1156: the four chat.sh pages open the messenger from an entry in
// their own contact information instead of a corner bubble. This suite runs
// the shipped pages in Chromium with chat.sh/widget.js answered by a stub that
// reads the tag exactly the way the real script does
// (https://chat.sh/widget.js, read 2026-11-03:
// `var launcher = script.getAttribute("data-launcher") !== "none"`), so the
// missing bubble and the entry's click path are proven in a browser, not by a
// string match on the HTML.

import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allowedExternalRequests, guardedPage } from "./browser-network.mjs";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const WIDGET_URL = "https://chat.sh/widget.js";

// Behaves like the real widget for the one thing this Issue turns on: with
// data-launcher="none" no corner button is drawn, and window.chatSh.open() is
// the page's way in.
const STUB_WIDGET = `(function () {
  var script = document.getElementById("chat-sh-widget");
  window.__chatShCalls = [];
  window.chatSh = {
    open: function () { window.__chatShCalls.push("open"); },
    close: function () { window.__chatShCalls.push("close"); }
  };
  if (script.getAttribute("data-launcher") !== "none") {
    var bubble = document.createElement("div");
    bubble.id = "chat-sh-corner-bubble";
    bubble.style.cssText = "position:fixed;bottom:0;right:0;width:88px;height:88px;z-index:2147483000";
    document.body.appendChild(bubble);
  }
})();`;

const PAGES = [
  { path: "/cloud/", label: "Chat with us" },
  { path: "/zh/cloud/", label: "在线客服" },
  { path: "/support/", label: "Chat with us" },
  { path: "/zh/support/", label: "在线客服" },
];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];

let server;
let browser;
let baseUrl;

async function serve(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\/|\\)+/, "");
  if (relative.split("/").includes("..")) return null;
  const directPath = join("public", relative);
  const direct = await readFile(directPath).catch(() => null);
  if (direct !== null) return { path: directPath, body: direct };
  const indexPath = join(directPath, "index.html");
  const index = await readFile(indexPath).catch(() => null);
  return index === null ? null : { path: indexPath, body: index };
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    // The pages beacon view/engagement events to their own origin; the Worker
    // answers that route with 204 (src/worker.js engagementResponse), so the
    // static server here does too instead of logging a 404 the page never sees.
    if (request.method === "POST") {
      response.writeHead(204);
      response.end();
      return;
    }
    const file = await serve(new URL(request.url, "http://localhost").pathname);
    if (!file) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": contentTypes[extname(file.path)] ?? "application/octet-stream" });
    response.end(file.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
  // The shared guard counts chat.sh among the third-party responses it did not
  // answer — this suite answers that one request with its own stub — so it is
  // excluded here; every other third-party request must have stayed local.
  expect(allowedExternalRequests().filter((url) => !url.startsWith("https://chat.sh/"))).toEqual([]);
});

async function openPage(path, viewport, widget) {
  const page = await guardedPage(browser, baseUrl, { viewport });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // A deliberately failed chat.sh request logs its own load error; that is
    // the failure this suite stages, not a page defect.
    if ((message.location()?.url ?? "").startsWith("https://chat.sh/")) return;
    consoleErrors.push(message.text());
  });
  // Registered after the shared guard, so this answer wins.
  await page.route(WIDGET_URL, (route) => route.fulfill(widget));
  await page.goto(new URL(path, baseUrl).href, { waitUntil: "load" });
  return { page, pageErrors, consoleErrors };
}

describe("Issue #1156 chat entry opens the messenger without a corner bubble", () => {
  for (const { path, label } of PAGES) {
    for (const viewport of VIEWPORTS) {
      it(`${path} at ${viewport.width}px shows no corner bubble and opens the messenger on click`, async () => {
        const { page, pageErrors, consoleErrors } = await openPage(path, viewport, {
          status: 200,
          contentType: "text/javascript; charset=utf-8",
          body: STUB_WIDGET,
        });

        const entry = page.locator("[data-chat-open]");
        expect(await entry.isVisible(), `${path}: entry not shown`).toBe(true);
        expect((await entry.textContent()).trim()).toBe(label);
        expect(await page.locator("#chat-sh-corner-bubble").count()).toBe(0);

        await entry.click();
        expect(await page.evaluate(() => window.__chatShCalls)).toEqual(["open"]);
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
        await page.close();
      });
    }
  }

  for (const { path } of PAGES) {
    it(`${path} keeps the entry out of the page when the widget script fails`, async () => {
      const { page, pageErrors, consoleErrors } = await openPage(path, VIEWPORTS[0], {
        status: 500,
        contentType: "text/javascript; charset=utf-8",
        body: "",
      });

      const entry = page.locator("[data-chat-entry]");
      expect(await entry.count()).toBe(1);
      expect(await entry.isVisible(), `${path}: entry shown without the widget`).toBe(false);
      expect(await page.locator("#chat-sh-corner-bubble").count()).toBe(0);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
      await page.close();
    });
  }
});
