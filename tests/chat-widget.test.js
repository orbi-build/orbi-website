// Issue #1083: the chat.sh support widget loads on exactly four pages — the
// Cloud pricing pages and the support pages — and nowhere else. The tag is
// defined once in site/partials/chat.html and expanded by the build through
// the <!--@chat--> marker, so these assertions read the shipped bytes in
// public/ (what the Worker deploys), not the sources.
//
// Issue #1156: the widget tag carries data-launcher="none", so chat.sh draws
// no corner bubble over the page; the entry that opens it lives in the contact
// information each of the four pages already had, and stays hidden until
// window.chatSh exists.

import vm from "node:vm";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url).pathname;
const WIDGET_TAG =
  '<script id="chat-sh-widget" src="https://chat.sh/widget.js" data-site="3d9e07ad-8a5f-4356-99b2-a82e52f99ecc" data-launcher="none" async></script>';
const WIDGET_PAGES = [
  "public/cloud/index.html",
  "public/zh/cloud/index.html",
  "public/support/index.html",
  "public/zh/support/index.html",
];
const ENTRY_BUTTON = '<button type="button" class="chat-entry" data-chat-open>';
// The label each page shows, in the page's own language.
const ENTRY_LABELS = {
  "public/cloud/index.html": "Chat with us",
  "public/zh/cloud/index.html": "在线客服",
  "public/support/index.html": "Chat with us",
  "public/zh/support/index.html": "在线客服",
};

async function htmlFiles(dir = "public") {
  const result = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await htmlFiles(path));
    else if (entry.name.endsWith(".html")) result.push(path);
  }
  return result;
}

describe("Issue #1083 chat.sh widget", () => {
  it("loads the widget exactly once on the two Cloud pricing pages and the two support pages", async () => {
    for (const file of WIDGET_PAGES) {
      const html = await readFile(join(root, file), "utf8");
      expect((html.match(/https:\/\/chat\.sh\/widget\.js/g) ?? []).length, file).toBe(1);
      expect(html, file).toContain(WIDGET_TAG);
    }
  });

  it("never loads the widget on any other page (home, guides, blog, compare)", async () => {
    const files = await htmlFiles();
    expect(files).toEqual(expect.arrayContaining(WIDGET_PAGES));
    for (const file of files) {
      if (WIDGET_PAGES.includes(file)) continue;
      const html = await readFile(join(root, file), "utf8");
      expect(html, file).not.toContain("chat.sh");
      expect(html, file).not.toContain("data-chat-open");
    }
  });
});

describe("Issue #1156 chat entry in the existing contact information", () => {
  it("keeps chat.sh's corner bubble off the page", async () => {
    for (const file of WIDGET_PAGES) {
      const html = await readFile(join(root, file), "utf8");
      // The widget's own contract, read from https://chat.sh/widget.js on
      // 2026-11-03: `script.getAttribute("data-launcher") !== "none"` decides
      // whether the corner button is drawn.
      expect(html, file).toContain('data-launcher="none"');
    }
  });

  it("adds one hidden entry, in the page's language, to the contact information the page already had", async () => {
    for (const file of WIDGET_PAGES) {
      const html = await readFile(join(root, file), "utf8");
      expect((html.match(/<button type="button" class="chat-entry" data-chat-open>/g) ?? []).length, file).toBe(1);
      expect(html, file).toContain(ENTRY_BUTTON + ENTRY_LABELS[file] + "</button>");

      // The entry is part of the block a visitor already reads to reach us:
      // the support pages' CONTACT list, and the Cloud pricing page's
      // founder-talk note (its only contact line).
      const block = file.includes("/support/")
        ? html.match(/<section class="compare-section shell" aria-labelledby="contact-title">[\s\S]*?<\/section>/)?.[0]
        : html.match(/<p class="founder-talk-note">[\s\S]*?<\/p>/)?.[0];
      expect(block, `${file}: contact block missing`).toBeTruthy();
      expect(block, file).toContain(ENTRY_BUTTON + ENTRY_LABELS[file] + "</button>");
      // Hidden until the widget reports window.chatSh (public/demo.js reveals it).
      expect(block, file).toMatch(/<(li|span) data-chat-entry hidden>/);
    }
  });
});

// The entry's behaviour lives in public/demo.js, which every page loads with
// `defer`. A browser is not needed to prove it: the script is one IIFE whose
// only contacts with the page are the selectors below, so a stub document with
// a stub chat.sh messenger exercises exactly the shipped code.
async function demoHarness({ withWidget = true } = {}) {
  const source = await readFile(join(root, "public/demo.js"), "utf8");
  const entries = [{ hidden: true }];
  const documentListeners = new Map();
  const widgetListeners = new Map();
  const widget = { addEventListener: (type, handler) => widgetListeners.set(type, handler) };
  const document = {
    querySelectorAll: (selector) => (selector === "[data-chat-entry]" ? entries : []),
    getElementById: (id) => (id === "chat-sh-widget" && withWidget ? widget : null),
    addEventListener: (type, handler) => documentListeners.set(type, handler),
  };
  const window = {};
  vm.runInNewContext(source, { console, document, window });
  const click = (target) => documentListeners.get("click")({ target });
  const clickEntry = () => click({ closest: (selector) => (selector === "[data-chat-open]" ? entries[0] : null) });
  return { entries, window, widgetListeners, clickEntry };
}

describe("Issue #1156 chat entry behaviour (public/demo.js)", () => {
  it("stays hidden until the widget defines window.chatSh, then opens it on click", async () => {
    const harness = await demoHarness();
    expect(harness.entries[0].hidden).toBe(true);

    const opened = [];
    harness.window.chatSh = { open: () => opened.push("open") };
    harness.widgetListeners.get("load")();
    expect(harness.entries[0].hidden).toBe(false);

    harness.clickEntry();
    expect(opened).toEqual(["open"]);
  });

  it("keeps the entry hidden, and the page quiet, when the widget script never loads or never appears", async () => {
    const harness = await demoHarness();
    // Clicked while no window.chatSh exists: nothing to call, nothing thrown.
    harness.clickEntry();
    expect(harness.entries[0].hidden).toBe(true);

    // No widget tag on the page at all (the other 124 pages): also no throw.
    const bare = await demoHarness({ withWidget: false });
    bare.clickEntry();
    expect(bare.entries[0].hidden).toBe(true);
  });
});
