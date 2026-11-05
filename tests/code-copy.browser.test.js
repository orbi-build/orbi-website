// Issue #1181: one-click copy on every code block of every page.
//
// The build writes the button (wrapCodeBlocks) and demo.js's [data-copy] wiring
// copies the block's [data-copy-source] text — one implementation for the
// homepage install commands, blog posts, Markdown guides and hand-written guide
// pages alike. What a unit test cannot prove is the user's path, so this suite
// drives the committed public/ bytes (the artifact the Worker deploys;
// tests/pages.test.js pins it to the build) in Chromium: it clicks and reads the
// real clipboard, tabs to the button, and measures that the button never sits
// on top of a line of code.

import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const HOME = "/";
const ZH_HOME = "/zh/";
const POST = "/blog/ai-code-review-bottleneck/";
const ZH_POST = "/zh/blog/ai-code-review-bottleneck/";
const MARKDOWN_GUIDE = "/guides/pi-coding-agent/";
const ZH_MARKDOWN_GUIDE = "/zh/guides/pi-coding-agent/";
const GUIDE = "/guides/ci-gates/";
const ZH_GUIDE = "/zh/guides/ci-gates/";
const INSTALL_COMMAND = "curl -fsSL https://aiready.sh | sh";

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
    response.writeHead(200, { "content-type": types[extname(file[0])] ?? "application/octet-stream" });
    response.end(file[1]);
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

// A page with the clipboard permissions a reader's browser prompts for, and
// any console error or uncaught exception kept for the assertion.
async function openPage(route, width = 1440) {
  const page = await guardedPage(browser, origin, { viewport: { width, height: 900 } });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
  });
  await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
  // The clipboard API answers only a focused document.
  await page.bringToFront();
  return { page, errors };
}

async function until(check, what, timeout = 5000) {
  const started = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());

// The block whose code starts with `first line`, and the button above it.
const blockByFirstLine = (page, line) =>
  page.locator(".code-copy").filter({ hasText: line }).locator(".code-copy-btn");

// The source text of a fenced block, straight from the Markdown the author
// wrote — the clipboard has to hold exactly this, not the rendered page's idea
// of it.
async function fencedBlock(path, firstLine) {
  const source = await readFile(path, "utf8");
  const block = source.match(new RegExp("```\\w*\\n" + firstLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?```"))?.[0];
  if (!block) throw new Error(`no fenced block starting with "${firstLine}" in ${path}`);
  return block.replace(/^```\w*\n/, "").replace(/```$/, "");
}

describe("every code block's copy button (Issue #1181)", () => {
  it("copies a multi-line bash block verbatim and reports it in place", async () => {
    const { page, errors } = await openPage(POST);
    try {
      const firstLine = "chmod +x ~/merge-wait.sh";
      const expected = await fencedBlock("content/blog/ai-code-review-bottleneck.md", firstLine);
      const button = blockByFirstLine(page, firstLine);
      const code = await page.locator(".code-copy").filter({ hasText: firstLine }).locator("code").textContent();

      // The page's own bytes are the author's bytes: line breaks kept, no
      // button label, nothing trimmed.
      expect(code).toBe(expected);
      expect(expected.split("\n").length).toBe(4);

      await button.click();
      await until(async () => (await clipboard(page)) === expected, "the clipboard to hold the block");
      expect(await clipboard(page)).toBe(expected);
      expect(await button.textContent()).toBe("Copied");

      // It says so for a moment, then goes back to being an action.
      await until(async () => (await button.textContent()) === "Copy", "the label to restore", 4000);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 30_000);

  it("copies the homepage install command through the same button", async () => {
    const { page, errors } = await openPage(HOME);
    try {
      // Two blocks on the homepage — the one-liner and the four manual steps —
      // and both carry the shared button; the old hand-written .install-copy is
      // gone, not merely hidden.
      expect(await page.locator(".install-block .code-copy-btn").count()).toBe(2);
      expect(await page.locator(".install-copy").count()).toBe(0);
      const button = page.locator(".install-block .code-copy-btn").first();
      expect(await button.textContent()).toBe("Copy");

      await button.click();
      await until(async () => (await clipboard(page)) === INSTALL_COMMAND, "the install command");
      expect(await clipboard(page)).toBe(INSTALL_COMMAND);
      expect(await button.textContent()).toBe("Copied");
      await until(async () => (await button.textContent()) === "Copy", "the label to restore", 4000);

      // The collapsed four-step block takes the same button, with all of its
      // lines: opening the summary is the only thing a reader has to do first.
      const manual = page.locator(".install-manual .code-copy-btn");
      expect(await manual.isVisible()).toBe(false);
      await page.locator(".install-manual summary").click();
      await until(() => manual.isVisible(), "the manual block's button");
      const manualText = await page.locator(".install-manual code").textContent();
      expect(manualText.split("\n").length).toBe(4);
      await manual.click();
      await until(async () => (await clipboard(page)) === manualText, "the manual steps");
      expect(await clipboard(page)).toBe(manualText);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 30_000);

  it("speaks the page's language", async () => {
    // One page per shape: homepage install panel, Markdown post, Markdown
    // guide (.guide-body) and hand-written guide page (.code-block panels).
    for (const [route, buttonSelector, copyLabel, copiedLabel] of [
      [ZH_HOME, ".install-block .code-copy-btn", "复制", "已复制"],
      [ZH_POST, ".post-body .code-copy-btn", "复制", "已复制"],
      [ZH_MARKDOWN_GUIDE, ".guide-body .code-copy-btn", "复制", "已复制"],
      [ZH_GUIDE, ".code-copy .code-copy-btn", "复制", "已复制"],
      [HOME, ".install-block .code-copy-btn", "Copy", "Copied"],
      [POST, ".post-body .code-copy-btn", "Copy", "Copied"],
      [MARKDOWN_GUIDE, ".guide-body .code-copy-btn", "Copy", "Copied"],
      [GUIDE, ".code-copy .code-copy-btn", "Copy", "Copied"],
    ]) {
      const { page, errors } = await openPage(route);
      try {
        const button = page.locator(buttonSelector).first();
        expect(await button.textContent(), route).toBe(copyLabel);
        expect(await button.getAttribute("data-copied-label"), route).toBe(copiedLabel);

        const code = await button.evaluate((element) => element.parentElement.querySelector("code").textContent);
        await button.click();
        await until(async () => (await clipboard(page)) === code, `${route}: the clipboard to hold the block`);
        expect(await clipboard(page), route).toBe(code);
        expect(await button.textContent(), route).toBe(copiedLabel);
        expect(errors, route).toEqual([]);
      } finally {
        await page.close();
      }
    }
  }, 120_000);

  it("copies a hand-written guide panel without its caption", async () => {
    const { page, errors } = await openPage(GUIDE);
    try {
      const panel = page.locator(".code-copy").first();
      const caption = await panel.locator("figcaption").textContent();
      const code = await panel.locator("code").textContent();
      const button = panel.locator(".code-copy-btn");

      await button.click();
      await until(async () => (await clipboard(page)) === code, "the clipboard to hold the panel");
      expect(await clipboard(page)).toBe(code);
      expect(await clipboard(page)).not.toContain(caption.trim());
      expect(code.startsWith("failed = [")).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 30_000);

  for (const width of [1440, 390]) {
    it(`keeps the button off the code and in place while it scrolls at ${width}px`, async () => {
      let sawScroller = false;
      for (const route of [HOME, ZH_HOME, POST, ZH_POST, GUIDE, ZH_GUIDE]) {
        const { page, errors } = await openPage(route, width);
        try {
          const measured = await page.evaluate(() => {
            const blocks = [...document.querySelectorAll(".code-copy")];
            return {
              blocks: blocks.length,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              geometry: blocks.map((block) => {
                const button = block.querySelector(".code-copy-btn");
                const panel = block.querySelector("pre, figure");
                const caption = block.querySelector("figcaption");
                const code = block.querySelector("code");
                const style = getComputedStyle(button);
                const rect = button.getBoundingClientRect();
                return {
                  button: rect.toJSON(),
                  panel: panel.getBoundingClientRect().toJSON(),
                  caption: caption?.getBoundingClientRect().toJSON() ?? null,
                  codeFirstLine: code.getClientRects()[0]?.toJSON() ?? null,
                  visible: rect.width > 0 && rect.height > 0
                    && style.visibility === "visible" && style.display !== "none" && Number(style.opacity) === 1,
                  label: button.textContent,
                };
              }),
            };
          });

          expect(measured.blocks, route).toBeGreaterThan(0);
          expect(measured.overflow, route).toBeLessThanOrEqual(0);
          // A collapsed <details> (the homepage's manual steps) hides its block;
          // every block a reader can see has to pass the geometry contract.
          const shown = measured.geometry.filter((block) => block.visible);
          expect(shown.length, route).toBeGreaterThan(0);
          for (const { button, panel, caption, codeFirstLine, label } of shown) {
            expect(label, route).toBe(route.startsWith("/zh/") ? "复制" : "Copy");
            // Never under the pointer's target area: entirely above the panel,
            // and the panel's own first text (caption, then code) starts below it.
            expect(button.bottom, route).toBeLessThanOrEqual(panel.top + 0.5);
            expect(button.bottom, route).toBeLessThanOrEqual(codeFirstLine.top + 0.5);
            if (caption) expect(button.bottom, route).toBeLessThanOrEqual(caption.top + 0.5);
          }

          // Scrolling the code inside its own box moves the code, not the button.
          const scrolled = await page.evaluate(() => {
            const block = [...document.querySelectorAll(".code-copy")]
              .find((candidate) => {
                const pre = candidate.querySelector("pre");
                return pre.getBoundingClientRect().height > 0 && pre.scrollWidth > pre.clientWidth;
              });
            if (!block) return null;
            const button = block.querySelector(".code-copy-btn");
            const pre = block.querySelector("pre");
            const before = button.getBoundingClientRect().toJSON();
            pre.scrollLeft = pre.scrollWidth;
            return { before, after: button.getBoundingClientRect().toJSON(), scrollLeft: pre.scrollLeft };
          });
          // A page whose visible blocks all fit has no button drift to prove;
          // every page that does have a scrolling block proves it here. At 390
          // the blog and guide blocks scroll, which the aggregate below pins.
          if (scrolled) {
            sawScroller = true;
            expect(scrolled.scrollLeft).toBeGreaterThan(0);
            expect(Math.abs(scrolled.after.x - scrolled.before.x)).toBeLessThan(0.5);
            expect(Math.abs(scrolled.after.y - scrolled.before.y)).toBeLessThan(0.5);
          }

          // And it is really on top of the page, not behind the panel: the
          // browser hit-tests the button's own centre to the button.
          const onTop = await page.evaluate(() => {
            const button = document.querySelector(".code-copy-btn");
            // The page scrolls smoothly; measure once the jump is done.
            button.scrollIntoView({ block: "center", behavior: "instant" });
            const rect = button.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return hit === button;
          });
          expect(onTop, route).toBe(true);
          expect(errors).toEqual([]);
        } finally {
          await page.close();
        }
      }
      // A green run that scrolled nothing would prove nothing: on a phone the
      // article and guide blocks overflow, so their buttons must have been
      // measured while the code moved under them.
      if (width === 390) expect(sawScroller).toBe(true);
    }, 180_000);
  }

  it("reaches the button with Tab, shows the focus ring and copies on Enter", async () => {
    for (const route of [HOME, POST]) {
      const { page, errors } = await openPage(route);
      try {
        let reached = false;
        for (let presses = 0; presses < 200 && !reached; presses += 1) {
          await page.keyboard.press("Tab");
          reached = await page.evaluate(() => document.activeElement?.classList.contains("code-copy-btn"));
        }
        expect(reached, route).toBe(true);

        const focus = await page.evaluate(() => {
          const style = getComputedStyle(document.activeElement);
          const code = document.activeElement.parentElement.querySelector("[data-copy-source]");
          return {
            outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
            outlineWidth: Number.parseFloat(style.outlineWidth),
            outlineOffset: Number.parseFloat(style.outlineOffset),
            expected: code.textContent,
          };
        });
        expect(focus.outline, route).not.toContain("none");
        expect(focus.outlineWidth, route).toBeGreaterThanOrEqual(2);
        expect(focus.outlineOffset, route).toBeGreaterThan(0);

        await page.keyboard.press("Enter");
        await until(async () => (await clipboard(page)) === focus.expected, "Enter to copy");
        expect(await clipboard(page), route).toBe(focus.expected);
        expect(await page.evaluate(() => document.activeElement.textContent), route)
          .toBe(route.startsWith("/zh/") ? "已复制" : "Copied");
        expect(errors, route).toEqual([]);
      } finally {
        await page.close();
      }
    }
  }, 120_000);
});
