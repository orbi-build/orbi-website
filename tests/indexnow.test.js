import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliver, selectUrls, sitemapUrls } from "../scripts/indexnow.mjs";
import { handleFetch } from "../src/worker.js";

const ROOT = join(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "scripts", "indexnow.mjs");
const KEY = "83f38aa2a589432901477c2735eea995";
const KEY_FILE = `public/${KEY}.txt`;
const KEY_URL = `https://orbi.build/${KEY}.txt`;

// The sitemap shape the build writes (Issue #1065: loc + hreflang only).
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://orbi.build/</loc>
  </url>
  <url>
    <loc>https://orbi.build/blog/</loc>
  </url>
  <url>
    <loc>https://orbi.build/blog/new-post/</loc>
  </url>
  <url>
    <loc>https://orbi.build/zh/blog/new-post/</loc>
  </url>
  <url>
    <loc>https://orbi.build/compare/</loc>
  </url>
</urlset>
`;

const BASE_FILES = {
  [KEY_FILE]: KEY,
  "public/sitemap.xml": SITEMAP,
  "public/index.html": "<h1>orbi</h1>",
  "public/compare/index.html": "<h1>compare</h1>",
};

function git(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=Orbi", "-c", "user.email=orbi@example.com", ...args], {
    cwd,
    encoding: "utf8",
  });
}

function writeFiles(dir, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}

function makeRepo(files) {
  const dir = mkdtempSync(join(tmpdir(), "indexnow-"));
  git(dir, "init", "-b", "main", "--quiet");
  writeFiles(dir, files);
  git(dir, "add", "--all");
  git(dir, "commit", "--quiet", "-m", "base");
  return { dir, head: git(dir, "rev-parse", "HEAD").trim() };
}

function commit(dir, files, message) {
  writeFiles(dir, files);
  git(dir, "add", "--all");
  git(dir, "commit", "--quiet", "-m", message);
  return git(dir, "rev-parse", "HEAD").trim();
}

function runScript(cwd, args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const stdoutLines = (output) => output.split("\n").map((line) => line.trim()).filter(Boolean);

describe("IndexNow key file", () => {
  it("ships the public key as its own line at the site root", () => {
    // The protocol makes the key public: the crawler fetches it to verify the
    // host. Its content is exactly the key, no trailing newline or comment.
    expect(readFileSync(join(ROOT, KEY_FILE), "utf8")).toBe(KEY);
  });
});

describe("IndexNow key file served by the Worker", () => {
  it("answers the protocol URL with exactly the key", async () => {
    // The crawler fetches keyLocation to verify the host. The Worker rewrites
    // text/plain bodies for its pricing tokens, so this has to stay verbatim.
    const body = readFileSync(join(ROOT, KEY_FILE), "utf8");
    const assets = {
      fetch: async () => new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } }),
    };
    const response = await handleFetch(new Request(`https://orbi.build/${KEY}.txt`), {
      ASSETS: assets,
      CLOUD_LOGIN_URL: "https://orbi.build/api/login",
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(KEY);
  });
});

describe("selectUrls", () => {
  it("keeps sitemap pages only, converting page paths to live URLs", () => {
    const urls = selectUrls(
      [
        "public/blog/new-post/index.html",
        "public/zh/blog/new-post/index.html",
        "public/index.html",
        // not in the sitemap (a page that must never be pushed)
        "public/cloud/login/index.html",
        // a page whose file was deleted in this deploy is no longer listed
        "public/compare/index.html",
        "public/styles.css",
      ],
      SITEMAP.replace("https://orbi.build/compare/", "https://orbi.build/elsewhere/"),
    );
    expect(urls).toEqual([
      "https://orbi.build/blog/new-post/",
      "https://orbi.build/zh/blog/new-post/",
      "https://orbi.build/",
    ]);
  });

  it("reads every loc out of the sitemap in document order", () => {
    expect(sitemapUrls(SITEMAP)).toEqual([
      "https://orbi.build/",
      "https://orbi.build/blog/",
      "https://orbi.build/blog/new-post/",
      "https://orbi.build/zh/blog/new-post/",
      "https://orbi.build/compare/",
    ]);
  });
});

describe("indexnow script --dry-run", () => {
  let repo;

  beforeEach(() => {
    repo = makeRepo(BASE_FILES);
  });

  afterEach(() => {
    rmSync(repo.dir, { recursive: true, force: true });
  });

  it("submits only the changed pages that are in the sitemap", () => {
    const head = commit(
      repo.dir,
      {
        "public/blog/new-post/index.html": "<h1>new post</h1>",
        "public/zh/blog/new-post/index.html": "<h1>新文章</h1>",
        "public/cloud/login/index.html": "<h1>sign in</h1>",
        "public/styles.css": "body { color: black }",
      },
      "publish a post",
    );

    const { status, output } = runScript(repo.dir, ["--prev", repo.head, "--dry-run"]);

    expect(status, output).toBe(0);
    const lines = stdoutLines(output);
    expect(lines).toContain("https://orbi.build/blog/new-post/");
    expect(lines).toContain("https://orbi.build/zh/blog/new-post/");
    expect(output).not.toContain("cloud/login");
    expect(output).not.toContain("styles.css");
    // the base commit's pages did not change in this deploy
    expect(output).not.toContain("https://orbi.build/compare/");
    expect(head).toMatch(/^[0-9a-f]{40}$/);
  });

  it("submits the whole sitemap when there is no previous deploy", () => {
    const { status, output } = runScript(repo.dir, ["--prev", "", "--dry-run"]);

    expect(status, output).toBe(0);
    expect(stdoutLines(output)).toEqual(
      expect.arrayContaining([
        "https://orbi.build/",
        "https://orbi.build/blog/",
        "https://orbi.build/blog/new-post/",
        "https://orbi.build/zh/blog/new-post/",
        "https://orbi.build/compare/",
      ]),
    );
  });

  it("submits the whole sitemap when the previous deploy predates the key file", () => {
    const beforeKey = makeRepo({
      "public/sitemap.xml": SITEMAP,
      "public/index.html": "<h1>orbi</h1>",
    });
    try {
      const headWithKey = commit(beforeKey.dir, BASE_FILES, "add the IndexNow key");

      const { status, output } = runScript(beforeKey.dir, ["--prev", beforeKey.head, "--dry-run"]);

      expect(status, output).toBe(0);
      expect(stdoutLines(output)).toEqual(
        expect.arrayContaining([
          "https://orbi.build/",
          "https://orbi.build/blog/new-post/",
          "https://orbi.build/compare/",
        ]),
      );
      expect(headWithKey).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      rmSync(beforeKey.dir, { recursive: true, force: true });
    }
  });

  it("prints 无可提交页面 and exits 0 when nothing changed", () => {
    const { status, output } = runScript(repo.dir, ["--prev", "HEAD", "--dry-run"]);

    expect(status, output).toBe(0);
    expect(output).toContain("无可提交页面");
  });

  it("rejects a --prev without a value instead of guessing a baseline", () => {
    const { status, output } = runScript(repo.dir, ["--prev", "--dry-run"]);

    expect(status, output).not.toBe(0);
    expect(output).toContain("usage: node scripts/indexnow.mjs");
  });
});

describe("IndexNow request", () => {
  let repo;

  beforeEach(() => {
    repo = makeRepo(BASE_FILES);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(repo.dir, { recursive: true, force: true });
  });

  it("posts host, key, keyLocation and urlList once to api.indexnow.org", async () => {
    const fetchStub = vi.fn(async () => ({ status: 200 }));
    vi.stubGlobal("fetch", fetchStub);

    await deliver({ prev: "", cwd: repo.dir });

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0];
    expect(url).toBe("https://api.indexnow.org/indexnow");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toContain("application/json");
    expect(JSON.parse(init.body)).toEqual({
      host: "orbi.build",
      key: KEY,
      keyLocation: KEY_URL,
      urlList: [
        "https://orbi.build/",
        "https://orbi.build/blog/",
        "https://orbi.build/blog/new-post/",
        "https://orbi.build/zh/blog/new-post/",
        "https://orbi.build/compare/",
      ],
    });
    // the request itself must not be able to hang the deploy step
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("fails loudly on a rejected submission so the step logs a warning", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 400 })));

    await expect(deliver({ prev: "", cwd: repo.dir })).rejects.toThrow(/400/);
  });

  it("sends nothing at all when the page set is empty", async () => {
    const fetchStub = vi.fn(async () => ({ status: 200 }));
    vi.stubGlobal("fetch", fetchStub);

    await deliver({ prev: "HEAD", cwd: repo.dir });

    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe("deploy-production workflow", () => {
  const workflow = () => readFileSync(join(ROOT, ".github/workflows/deploy-production.yml"), "utf8");

  it("submits after the smoke test and before the rollback step", () => {
    const text = workflow();
    expect(text.indexOf("Smoke-test production deployment")).toBeLessThan(text.indexOf("scripts/indexnow.mjs"));
    expect(text.indexOf("scripts/indexnow.mjs")).toBeLessThan(text.indexOf("if: failure()"));
  });

  it("keeps a failed submission off the deploy's own status", () => {
    const text = workflow();
    const step = text.slice(text.lastIndexOf("- name:", text.indexOf("scripts/indexnow.mjs")), text.indexOf("if: failure()"));
    expect(step).toContain("continue-on-error: true");
    // Issue #1090: the previous *successful* run's head_sha is the diff base
    expect(step).toContain("deploy-production.yml");
    expect(step).toContain("--status success");
    expect(step).toContain("--limit 1 --json headSha");
    expect(step).toContain("GH_TOKEN: ${{ github.token }}");
    // AGENTS.md: every networked command carries a timeout
    expect(step).toMatch(/timeout 60s gh run list/);
    expect(step).toMatch(/timeout \d+s node scripts\/indexnow\.mjs/);
  });

  it("grants the job actions: read for gh run list", () => {
    const text = workflow();
    const job = text.slice(text.indexOf("  deploy:"));
    expect(job).toContain("actions: read");
  });

  it("leaves the beta deploy alone (beta is disallowed by robots.txt)", () => {
    expect(readFileSync(join(ROOT, ".github/workflows/deploy-beta.yml"), "utf8")).not.toMatch(/indexnow/i);
  });
});
