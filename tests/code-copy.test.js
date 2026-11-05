// Issue #1181: every code block on every page — the homepage's install
// commands, blog posts, Markdown guides, hand-written guide pages, and any page
// added later — carries the same one-click copy button, labelled in the page's
// own language. The button is part of the built page: public/ is the bytes the
// Worker deploys, so a build that stops emitting it (or a hand edit that skips
// `npm run build`) fails here.
//
// The label follows the page language: 中文页 复制/已复制, English page
// Copy/Copied. The clipboard work itself is demo.js's [data-copy] wiring; it is
// asserted against a real click in tests/code-copy.browser.test.js.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { wrapCodeBlocks } from "../scripts/build-pages.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABELS = {
  en: { idle: "Copy", done: "Copied" },
  zh: { idle: "复制", done: "已复制" },
};

// The wrapper the build writes: the button, then the block it copies. The
// button is the block's sibling, never inside it, because demo.js copies the
// text of the [data-copy-source] element inside the button's parent.
const BUTTON = /<button class="code-copy-btn" type="button" data-copy data-copied-label="([^"]*)">([^<]*)<\/button>/g;

const count = (html, pattern) => [...html.matchAll(pattern)].length;

// Every page the build writes, read from the shipped bytes.
async function shippedPages() {
  const files = await readdir(join(ROOT, "public"), { recursive: true, withFileTypes: true });
  const html = files
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
  return Promise.all(html.map(async (path) => ({
    output: path.slice(path.indexOf("/public/") + "/public/".length),
    html: await readFile(path, "utf8"),
  })));
}

const pages = await shippedPages();
const pageOf = (output) => pages.find((page) => page.output === output);

// A Markdown blog post, a Markdown guide, a hand-written guide page and the two
// homepages: the four shapes a code block takes on this site today.
const SAMPLES = [
  { output: "index.html", lang: "en" },
  { output: "zh/index.html", lang: "zh" },
  { output: "blog/ai-code-review-bottleneck/index.html", lang: "en" },
  { output: "zh/blog/ai-code-review-bottleneck/index.html", lang: "zh" },
  { output: "guides/ci-gates/index.html", lang: "en" },
  { output: "zh/guides/ci-gates/index.html", lang: "zh" },
  { output: "guides/pi-coding-agent/index.html", lang: "en" },
];

describe("every code block on every page carries a copy button (Issue #1181)", () => {
  it("ships exactly one copy button per code block, on every page", () => {
    const blocks = pages.reduce((sum, page) => sum + count(page.html, /<pre><code/g), 0);
    const buttons = pages.reduce((sum, page) => sum + count(page.html, /\sdata-copy[\s>]/g), 0);

    expect(blocks).toBeGreaterThan(0);
    expect(buttons).toBe(blocks);

    const broken = pages
      .filter((page) => count(page.html, /<pre><code/g) !== count(page.html, /\sdata-copy[\s>]/g))
      .map((page) => `${page.output}: ${count(page.html, /<pre><code/g)} blocks, ${count(page.html, /\sdata-copy[\s>]/g)} buttons`);
    expect(broken).toEqual([]);
  });

  it("covers the homepage, a blog post and a hand-written guide page", () => {
    for (const { output } of SAMPLES) {
      const { html } = pageOf(output);
      expect(count(html, /<pre><code/g), output).toBeGreaterThan(0);
      expect(count(html, /\sdata-copy[\s>]/g), output).toBe(count(html, /<pre><code/g));
    }
  });

  it("marks every block's own code as the copy source", () => {
    for (const { output, html } of pages) {
      // One marker per block, so the button always copies the block it sits on
      // and never a neighbour's text.
      expect(count(html, /data-copy-source/g), output).toBe(count(html, /<pre><code/g));
      expect(count(html, BUTTON), output).toBe(count(html, /<pre><code/g));
    }
  });

  it("labels the button in the page language", () => {
    for (const { output, lang } of SAMPLES) {
      const buttons = [...pageOf(output).html.matchAll(BUTTON)];
      expect(buttons.length, output).toBeGreaterThan(0);
      const wrong = buttons.filter(([, done, idle]) => done !== LABELS[lang].done || idle !== LABELS[lang].idle);
      expect(wrong.map(([markup]) => markup), output).toEqual([]);
    }

    // And nowhere is the other language's label used: "Copied" never appears on
    // a Chinese page, nor 已复制 on an English one. The page's own language is
    // the one on its <html> element — the language switcher in the nav carries
    // the other language's code, so a bare substring search would misfire.
    for (const { output, html } of pages) {
      const root = html.match(/<html[^>]*>/)?.[0] ?? "";
      expect(root, output).toMatch(/lang="(en|zh-CN)"/);
      const other = root.includes('lang="zh-CN"') ? LABELS.en : LABELS.zh;
      expect(html.includes(`data-copied-label="${other.done}"`), output).toBe(false);
    }
  });

  it("gives the homepage install command the same button as every other block", () => {
    // Issue #1181 requirement 2: one implementation. The homepage used to ship
    // a hand-written .install-copy button for its one-liner; that markup is
    // gone and the build provides the shared one.
    const home = pageOf("index.html").html;
    expect(home).toContain(
      '<div class="install-block">\n'
      + '            <div class="code-copy"><button class="code-copy-btn" type="button" data-copy data-copied-label="Copied">Copy</button>'
      + "<pre><code data-copy-source>curl -fsSL https://aiready.sh | sh</code></pre></div>",
    );
    for (const { output, html } of pages) {
      expect(html.includes("install-copy"), output).toBe(false);
      expect(html.includes('class="post-code-copy"'), output).toBe(false);
    }
  });

  it("leaves no page source marking a block by hand", async () => {
    const sources = await readdir(join(ROOT, "site", "pages"), { recursive: true, withFileTypes: true });
    for (const entry of sources.filter((candidate) => candidate.isFile() && candidate.name.endsWith(".html"))) {
      const path = join(entry.parentPath ?? entry.path, entry.name);
      const html = await readFile(path, "utf8");
      expect(html.includes("data-copy"), path).toBe(false);
    }
  });
});

describe("wrapCodeBlocks (Issue #1181)", () => {
  it("wraps a fenced block as one copyable unit in both languages", () => {
    const md = '<pre><code class="language-bash">git status --short\ngit diff\n</code></pre>';
    expect(wrapCodeBlocks(md, "en")).toBe(
      '<div class="code-copy"><button class="code-copy-btn" type="button" data-copy '
      + 'data-copied-label="Copied">Copy</button>'
      + '<pre><code class="language-bash" data-copy-source>git status --short\ngit diff\n</code></pre></div>',
    );
    expect(wrapCodeBlocks(md, "zh")).toContain('data-copied-label="已复制">复制</button>');
    expect(wrapCodeBlocks(md, "zh")).toContain("data-copy-source>git status --short\ngit diff\n</code>");
  });

  it("wraps a hand-written guide code panel as one unit, caption included", () => {
    const panel = '<figure class="code-block"><figcaption>Run it</figcaption><pre><code>make test</code></pre></figure>';
    const html = wrapCodeBlocks(panel, "en");
    expect(html).toContain('<div class="code-copy"><button class="code-copy-btn"');
    expect(html).toContain('<figure class="code-block"><figcaption>Run it</figcaption><pre><code data-copy-source>make test</code></pre></figure>');
    // The caption is not part of the copied text: it stays outside the <code>.
    expect(html).not.toContain('<figure class="code-block"><button');
  });

  it("does not wrap inline code, and is idempotent", () => {
    const inline = '<p>Run <code class="post-code--spaced">npm test</code> first.</p>';
    expect(wrapCodeBlocks(inline, "en")).toBe(inline);

    const once = wrapCodeBlocks('<pre><code>x</code></pre>', "en");
    expect(wrapCodeBlocks(once, "en")).toBe(once);
  });

  it("refuses a language it has no labels for", () => {
    expect(() => wrapCodeBlocks("<pre><code>x</code></pre>", "fr")).toThrow(/no copy labels for language "fr"/);
  });
});
