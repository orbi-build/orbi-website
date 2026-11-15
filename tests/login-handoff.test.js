// Issue #1342: one shared script turns a clicked Cloud login link into an
// in-progress state ("Opening GitHub…" / "正在打开 GitHub…"), refuses a second
// click until GitHub answers, and restores the link when the browser brings the
// page back from its cache (the visitor pressed Back).
//
// This suite proves the build side — the same script on every generated page,
// never a per-page copy — and runs that shipped script against a small DOM so
// the click and pageshow contracts are checked without a browser.
// tests/login-handoff.browser.test.js drives the real pages.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url).pathname;
const SCRIPT = /<script data-login-handoff>([\s\S]*?)<\/script>/;

async function htmlFiles(dir) {
  const result = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await htmlFiles(path));
    else if (entry.name.endsWith(".html")) result.push(path);
  }
  return result;
}

const read = (file) => readFile(join(root, file), "utf8");

function scriptOf(html) {
  const match = html.match(SCRIPT);
  expect(match, "the page must ship the shared login handoff script").not.toBeNull();
  return match[1];
}

// A DOM small enough to read: anchors know their pathname, innerHTML and
// attributes; the click handler reaches the listeners the script registered.
function loginHarness(source, lang = "en") {
  const listeners = [];
  // The label swap is a task after the click, so the click's target stays in
  // the document for the rest of the dispatch (tests/login-handoff.browser.test.js
  // proves the cta_click beacon survives a click on the link's own markup).
  const tasks = [];
  const context = {
    document: { documentElement: { lang } },
    addEventListener(type, handler) {
      listeners.push({ type, handler });
    },
    setTimeout(handler) {
      tasks.push(handler);
      return tasks.length;
    },
    console,
  };
  vm.runInNewContext(source, context);

  const anchor = (pathname, html) => ({
    pathname,
    _html: html,
    _text: "",
    attributes: new Map(),
    get innerHTML() {
      return this._html;
    },
    set innerHTML(value) {
      this._html = value;
      this._text = "";
    },
    get textContent() {
      return this._text || this._html.replace(/<[^>]*>/g, "");
    },
    set textContent(value) {
      this._text = value;
      this._html = "";
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    },
    closest(selector) {
      return selector === "a[href]" ? this : null;
    },
  });

  const dispatch = (type, event) => {
    for (const listener of listeners.filter((entry) => entry.type === type)) {
      listener.handler(event);
    }
  };

  return {
    anchor,
    click(target, modifiers = {}) {
      let prevented = false;
      let stopped = false;
      dispatch("click", {
        target,
        ...modifiers,
        preventDefault() {
          prevented = true;
        },
        stopPropagation() {
          stopped = true;
        },
      });
      return { prevented, stopped };
    },
    pageshow(persisted) {
      dispatch("pageshow", { persisted });
    },
    flush() {
      while (tasks.length > 0) tasks.shift()();
    },
  };
}

describe("Issue #1342 login handoff script", () => {
  it("is one byte-identical script on every generated page, not a per-page copy", async () => {
    const files = await htmlFiles("public");
    expect(files.length).toBeGreaterThan(100);
    const sources = new Set();
    for (const file of files) {
      const html = await read(file);
      expect((html.match(/<script data-login-handoff>/g) ?? []).length, file).toBe(1);
      sources.add(scriptOf(html));
    }
    expect([...sources]).toHaveLength(1);
    const [source] = [...sources];
    expect(source).toContain("正在打开 GitHub…");
    expect(source).toContain("Opening GitHub…");
    // One script for every login link means no page or CTA list lives in it.
    expect(source).not.toContain("data-cta");
  });

  it("switches the clicked login link to the English pending label and blocks a second click", async () => {
    const harness = loginHarness(scriptOf(await read("public/index.html")));
    const link = harness.anchor("/cloud/login", "Try Orbi Cloud free →");

    expect(harness.click(link).prevented, "the first click must start the jump").toBe(false);
    expect(link.getAttribute("aria-disabled"), "the link stops taking jumps at once").toBe("true");
    expect(link.textContent, "the swap waits for the rest of the click's dispatch").toBe("Try Orbi Cloud free →");

    harness.flush();
    expect(link.textContent).toBe("Opening GitHub…");

    // The second click is refused before any task runs, and adds no second swap.
    expect(harness.click(link).prevented, "the second click must not jump again").toBe(true);
    harness.flush();
    expect(link.textContent).toBe("Opening GitHub…");
  });

  it("uses the Chinese label on a Chinese page and covers /zh/cloud/login", async () => {
    const harness = loginHarness(scriptOf(await read("public/zh/index.html")), "zh-CN");
    const link = harness.anchor("/zh/cloud/login", "免费试用 Orbi Cloud →");

    harness.click(link);
    harness.flush();
    expect(link.textContent).toBe("正在打开 GitHub…");
    expect(link.getAttribute("aria-disabled")).toBe("true");
  });

  it("restores the original label when the browser brings the page back from its cache", async () => {
    const harness = loginHarness(scriptOf(await read("public/cloud/index.html")));
    const link = harness.anchor("/cloud/login", 'Try Orbi Cloud free <span aria-hidden="true">→</span>');

    harness.click(link);
    harness.flush();
    expect(link.getAttribute("aria-disabled")).toBe("true");

    harness.pageshow(false);
    expect(link.getAttribute("aria-disabled"), "a plain pageshow is not a cache restore").toBe("true");

    harness.pageshow(true);
    expect(link.getAttribute("aria-disabled")).toBeNull();
    expect(link.innerHTML).toBe('Try Orbi Cloud free <span aria-hidden="true">→</span>');
    expect(link.textContent).toBe("Try Orbi Cloud free →");

    expect(harness.click(link).prevented, "the restored link must start a new jump").toBe(false);
    harness.flush();
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.textContent).toBe("Opening GitHub…");
  });

  // ⌘/Ctrl/Shift/Alt opens the jump in another tab or window and keeps this
  // page. Nothing here is waiting for a jump this page never makes, so the link
  // must stay as it is — otherwise it sits dead until the visitor reloads,
  // because no Back-from-GitHub pageshow ever restores it.
  it("leaves a modified click alone, because it opens the jump in another tab", async () => {
    const harness = loginHarness(scriptOf(await read("public/index.html")));
    const link = harness.anchor("/cloud/login", "Try Orbi Cloud free →");

    for (const modifier of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) {
      expect(harness.click(link, { [modifier]: true }).prevented, modifier).toBe(false);
      harness.flush();
      expect(link.textContent, modifier).toBe("Try Orbi Cloud free →");
      expect(link.getAttribute("aria-disabled"), modifier).toBeNull();
    }

    // The plain click the same visitor makes next still starts the jump.
    expect(harness.click(link).prevented).toBe(false);
    harness.flush();
    expect(link.textContent).toBe("Opening GitHub…");
    expect(link.getAttribute("aria-disabled")).toBe("true");
  });

  it("leaves every other link alone", async () => {
    const harness = loginHarness(scriptOf(await read("public/index.html")));
    for (const pathname of ["/cloud/", "/blog/", "/api/login"]) {
      const link = harness.anchor(pathname, "Read more");
      expect(harness.click(link).prevented, pathname).toBe(false);
      expect(link.textContent, pathname).toBe("Read more");
      expect(link.getAttribute("aria-disabled"), pathname).toBeNull();
    }
  });
});
