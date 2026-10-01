import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker.js";
import { collectPosts } from "../scripts/build-pages.mjs";

function cacheDouble() {
  const entries = new Map();
  return {
    default: {
      async match(request) { return entries.get(request.url) || undefined; },
      async put(request, response) { entries.set(request.url, response.clone()); },
    },
    entries,
  };
}

function assetsFor(postsText, html) {
  return { fetch: async (request) => new Response(
    new URL(request.url).pathname === "/blog/posts.json" ? postsText : html,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  ) };
}

const posts = [
  { slug: "one", title: "One", summary: "one", zhSlug: "yi", zhTitle: "一", related: ["three"] },
  { slug: "two", title: "Two", summary: "two", zhSlug: "er", zhTitle: "二", related: [] },
  { slug: "three", title: "Three", summary: "three", zhSlug: "san", zhTitle: "三", related: [] },
  { slug: "four", title: "Four", summary: "four", zhSlug: "si", zhTitle: "四", related: [] },
];

function aiVectors() {
  return { data: [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0]] };
}

describe("blog related posts", () => {
  it.each([["missing", "[does-not-exist]", "does not exist"], ["self", "[self]", "cannot name itself"]])("rejects %s related slugs", async (slug, related, message) => {
    const directory = await mkdtemp(join(tmpdir(), "orbi-related-"));
    try {
      await writeFile(join(directory, `${slug}.md`), `---\ntitle: Test\ndate: 2026-01-01\nsummary: Summary\nlang: en\nauthor: Orbi\nimage: /img/test.png\nrelated: ${related}\n---\nBody\n`);
      await expect(collectPosts(directory)).rejects.toThrow(message);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders manual-first same-language links and caches embeddings by posts.json", async () => {
    const cache = cacheDouble();
    vi.stubGlobal("caches", cache);
    let calls = 0;
    const postsText = JSON.stringify(posts);
    const env = {
      CLOUD_LOGIN_URL: "https://example.com/login",
      AI: { run: async () => { calls += 1; return aiVectors(); } },
      ASSETS: assetsFor(postsText, '<html><body><!--orbi:related-posts--></body></html>'),
    };
    const request = new Request("https://beta.orbi.build/blog/one/");
    const first = await worker.fetch(request, env);
    const second = await worker.fetch(request, env);
    const html = await first.text();
    expect(html.match(/href="\/blog\//g)).toHaveLength(3);
    expect(html.indexOf('href="/blog/three/"')).toBeLessThan(html.indexOf('href="/blog/two/"'));
    expect(html).not.toContain('href="/blog/one/"');
    expect(calls).toBe(1);
    expect(await second.text()).toContain("Related posts");

    const changed = JSON.stringify(posts.map((post) => post.slug === "one" ? { ...post, summary: "changed" } : post));
    env.ASSETS = assetsFor(changed, '<html><body><!--orbi:related-posts--></body></html>');
    await worker.fetch(request, env);
    expect(calls).toBe(2);
  });

  it("renders Chinese mirrors, fails open on AI errors, and skips non-blog pages", async () => {
    const cache = cacheDouble();
    vi.stubGlobal("caches", cache);
    let calls = 0;
    const postsText = JSON.stringify(posts);
    const env = {
      AI: { run: async () => { calls += 1; throw new Error("AI down"); } },
      ASSETS: assetsFor(postsText, '<html><body><!--orbi:related-posts--></body></html>'),
    };
    const zh = await worker.fetch(new Request("https://beta.orbi.build/zh/blog/one/"), env);
    expect(zh.status).toBe(200);
    expect(await zh.text()).not.toContain("related-posts-title");
    expect(cache.entries.size).toBe(0);
    const home = await worker.fetch(new Request("https://beta.orbi.build/"), env);
    expect(home.status).toBe(200);
    expect(calls).toBe(1);
  });
});
