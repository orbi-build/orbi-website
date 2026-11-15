// Issue #1330: every generated page carries PostHog product analytics and
// session recording, reported through Cloud's same-origin /api/ph forwarder so
// the browser never talks to posthog.com directly and beta reports to beta,
// production to production. The snippet is injected by the build
// (scripts/build-pages.mjs) next to the Cloudflare beacon, never hand-written in
// a page source, and it initialises only after the page has loaded.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url).pathname;
const read = (file) => readFile(join(root, file), "utf8");

async function htmlFiles(dir) {
  const result = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await htmlFiles(path));
    else if (entry.name.endsWith(".html")) result.push(path);
  }
  return result;
}

// The public frontend key from the Issue. It is public by design: the browser
// needs it to send events.
const TOKEN = "phc_nhxAwie7BY0blOSHfAbNzRGcb2rGDJInLUGPh93i8Mx";
// The snippet's first line, which no other inline script shares.
const SNIPPET_START = "<script>(function(){";

describe("Issue #1330 PostHog snippet", () => {
  it("initialises PostHog through /api/ph on every generated page", async () => {
    const files = await htmlFiles("public");
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const html = await read(file);
      expect(html, `${file}: project key`).toContain(TOKEN);
      // A relative api_host is the whole point: the forwarder lives on the
      // origin the visitor is already on.
      expect(html, `${file}: api_host`).toContain('api_host:"/api/ph"');
      expect(html, `${file}: ui_host`).toContain('ui_host:"https://us.posthog.com"');
      expect((html.match(/posthog\.init\(/g) ?? []).length, `${file}: one init`).toBe(1);
    }
  });

  // posthog-js is loaded by the official snippet from `api_host + "/static/array.js"`,
  // never as a static tag: a tag in the markup would block or race the page.
  it("never ships PostHog as a static script tag", async () => {
    for (const file of await htmlFiles("public")) {
      const html = await read(file);
      expect(html, file).not.toMatch(/<script[^>]+src="[^"]*(?:posthog|\/api\/ph)/);
    }
  });

  it("keeps the snippet out of page and partial sources", async () => {
    for (const dir of ["site/pages", "site/partials"]) {
      for (const file of await htmlFiles(dir)) {
        const source = await read(file);
        expect(source, file).not.toContain("posthog.init");
        expect(source, file).not.toContain("/api/ph");
      }
    }
  });

  // Acceptance: the snippet must not touch the first paint. Running it in a VM
  // proves the ordering rather than reading the source: before the load event
  // nothing is appended and nothing is initialised; after it, the SDK script
  // points at the forwarder and the init config is the one the Issue asks for.
  it("waits for the page load event before loading and initialising PostHog", async () => {
    const html = await read("public/index.html");
    const open = html.indexOf(SNIPPET_START);
    const close = html.indexOf("</script>", open);
    expect(open, "the PostHog snippet is on the homepage").toBeGreaterThan(-1);
    const script = html.slice(open + "<script>".length, close);
    expect(script, "the snippet initialises PostHog").toContain("posthog.init");

    const listeners = new Map();
    const appended = [];
    const context = {
      document: {
        readyState: "loading",
        createElement: () => ({}),
        getElementsByTagName: () => [{ parentNode: { insertBefore: (node) => appended.push(node) } }],
      },
      addEventListener: (type, handler) => listeners.set(type, handler),
      console,
    };
    context.window = context;
    vm.runInNewContext(script, context);

    expect(appended, "no SDK script before load").toHaveLength(0);
    expect(context.posthog, "no PostHog stub before load").toBeUndefined();

    expect(listeners.has("load"), "the snippet waits for load").toBe(true);
    listeners.get("load")();

    expect(appended, "the SDK script after load").toHaveLength(1);
    expect(appended[0].src).toBe("/api/ph/static/array.js");
    expect(appended[0].async).toBe(true);
    const [key, config] = context.posthog._i[0];
    expect(key).toBe(TOKEN);
    expect(config.api_host).toBe("/api/ph");
    expect(config.ui_host).toBe("https://us.posthog.com");
    expect(config.autocapture).toBe(true);
    expect(config.disable_session_recording).toBe(false);
  });
});

describe("Issue #1330 privacy policy", () => {
  it("says both privacy pages record visits with PostHog", async () => {
    const expectations = {
      "public/privacy/index.html": [
        "PostHog",
        "session recording",
        "European Union",
        "European Economic Area",
        "United Kingdom",
        "Switzerland",
      ],
      "public/zh/privacy/index.html": [
        "PostHog",
        "会话录像",
        "欧盟",
        "欧洲经济区",
        "英国",
        "瑞士",
      ],
    };
    for (const [file, phrases] of Object.entries(expectations)) {
      const html = await read(file);
      for (const phrase of phrases) expect(html, `${file}: ${phrase}`).toContain(phrase);
    }
  });
});
