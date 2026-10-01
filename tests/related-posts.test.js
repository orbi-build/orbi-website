import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
  it("builds one complete manifest entry per English post with its paired Chinese slug", async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const built = JSON.parse(await readFile(join(root, "public/blog/posts.json"), "utf8"));
    const source = await collectPosts(join(root, "content/blog"));
    const english = source.filter((post) => post.lang === "en");

    expect(built).toHaveLength(english.length);
    for (const post of english) {
      const entry = built.find((candidate) => candidate.slug === post.slug);
      const zh = source.find((candidate) => candidate.lang === "zh" && candidate.slug === post.counterpartSlug);
      expect(entry).toEqual({
        slug: post.slug,
        title: post.title,
        summary: post.summary,
        zhSlug: zh?.slug ?? null,
        zhTitle: zh?.title ?? null,
        related: post.related,
      });
    }
  });

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

  it("maps a Chinese page slug back to English and renders Chinese mirrors", async () => {
    const cache = cacheDouble();
    vi.stubGlobal("caches", cache);
    const env = {
      AI: { run: async () => aiVectors() },
      ASSETS: assetsFor(JSON.stringify(posts), '<html><body><!--orbi:related-posts--></body></html>'),
    };

    const response = await worker.fetch(new Request("https://beta.orbi.build/zh/blog/yi/"), env);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html.match(/href="\/zh\/blog\//g)).toHaveLength(3);
    expect(html).toContain('href="/zh/blog/san/">三</a>');
    expect(html).not.toContain('href="/zh/blog/yi/"');
  });

  it.each([
    ["an AI error", async () => { throw new Error("AI down"); }],
    ["malformed embeddings", async () => ({ data: [[1], [1, 2], [3], [4]] })],
  ])("fails open without caching %s and skips AI on non-blog pages", async (_case, run) => {
    const cache = cacheDouble();
    vi.stubGlobal("caches", cache);
    let calls = 0;
    const env = {
      AI: { run: async (...args) => { calls += 1; return run(...args); } },
      ASSETS: assetsFor(JSON.stringify(posts), '<html><body><!--orbi:related-posts--></body></html>'),
    };
    const blog = await worker.fetch(new Request("https://beta.orbi.build/blog/one/"), env);
    expect(blog.status).toBe(200);
    expect(await blog.text()).not.toContain("related-posts-title");
    expect(cache.entries.size).toBe(0);
    const home = await worker.fetch(new Request("https://beta.orbi.build/"), env);
    expect(home.status).toBe(200);
    expect(calls).toBe(1);
  });
});
