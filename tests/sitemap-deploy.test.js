// Issue #1062: the sitemap's lastmod is the UTC day of the Git commit that
// last touched each source, so it cannot be committed ahead of time. A squash
// merge rewrites that commit onto a new date and the pre-signed XML turns
// stale — CI run 39877232868 went red exactly that way (0cc9e235 committed
// 2026-10-22T23:44:55Z, squashed as 0e782ecd at 2026-10-23T08:17:27+08:00).
//
// The sitemap is therefore a deploy-time asset: "npm run build:sitemap"
// (pretest, plus an explicit beta-deploy step) writes it into public/ from the
// checkout that is about to ship. This suite proves the real Git scenario in
// throwaway repositories — fixed commit times, a squash rewrite, and a fresh
// clone that has no sitemap.xml at all — plus the wiring that makes the entry
// run in CI, production and beta.

import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSitemap } from "../scripts/build-pages.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// The incident's own timestamps.
const DAY_A = "2026-10-22T23:44:55Z"; // feature branch commit, UTC day 2026-10-22
const DAY_B = "2026-10-23T08:17:27+08:00"; // squash onto beta, UTC day 2026-10-23

const git = (cwd, args, extra = {}) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Orbi Fixture",
      GIT_AUTHOR_EMAIL: "fixture@orbi.build",
      GIT_COMMITTER_NAME: "Orbi Fixture",
      GIT_COMMITTER_EMAIL: "fixture@orbi.build",
      ...extra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

// The sitemap-only entry, run the way "npm run build:sitemap" runs it. The
// fixture's scripts/ is a copy of the real builder, never a re-implementation.
const runSitemapEntry = (repo, outDir = join(repo, "public")) =>
  execFileSync("node", [join(repo, "scripts", "build-pages.mjs"), "--sitemap-only", "--out", outDir], {
    cwd: repo,
    encoding: "utf8",
    timeout: 120_000,
    stdio: ["ignore", "pipe", "pipe"],
  });

const lastmodsOf = (xml) => [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1]);
const sitemapEntryOf = (xml, href) =>
  xml.match(new RegExp("<loc>https://orbi\\.build" + href + "</loc>([\\s\\S]*?)<\\/url>"))?.[0] ?? "";

let fixture; // throwaway repo: feature commit (day A) squashed onto beta (day B)
let dayASitemap; // what the feature branch would have committed: UTC day A
let clone; // fresh checkout of that squashed history: no public/sitemap.xml
let cloneSitemap;

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), "orbi-sitemap-git-"));
  await mkdir(join(fixture, "site"), { recursive: true });
  await cp(join(ROOT, "site", "pages"), join(fixture, "site", "pages"), { recursive: true });
  await cp(join(ROOT, "content", "blog"), join(fixture, "content", "blog"), { recursive: true });
  await cp(join(ROOT, "content", "guides"), join(fixture, "content", "guides"), { recursive: true });
  await mkdir(join(fixture, "scripts"), { recursive: true });
  for (const script of ["build-pages.mjs", "social-proof.mjs"]) {
    await cp(join(ROOT, "scripts", script), join(fixture, "scripts", script));
  }
  await cp(join(ROOT, "package.json"), join(fixture, "package.json"));
  // "node_modules" without a trailing slash: the path is a symlink here, and
  // only the directory form would leave it untracked.
  await writeFile(join(fixture, ".gitignore"), "node_modules\n");
  // What "npm ci" provides in the real checkout: the builder's dependency.
  await symlink(join(ROOT, "node_modules"), join(fixture, "node_modules"), "dir");
  git(fixture, ["init", "-q", "-b", "beta"]);
  git(fixture, ["add", "-A"]);
  // The feature branch commits on day A.
  git(fixture, ["commit", "-q", "-m", "compare page update"], {
    GIT_COMMITTER_DATE: DAY_A,
    GIT_AUTHOR_DATE: DAY_A,
  });
  // The sitemap the branch would have committed on day A.
  const dayAOut = join(fixture, "day-a-sitemap");
  runSitemapEntry(fixture, dayAOut);
  dayASitemap = await readFile(join(dayAOut, "sitemap.xml"), "utf8");
  // The squash merge keeps the tree and writes a new commit on day B: this is
  // what moves the source's last commit from the 22nd onto the 23rd.
  git(fixture, ["commit", "-q", "--amend", "--no-edit"], {
    GIT_COMMITTER_DATE: DAY_B,
    GIT_AUTHOR_DATE: DAY_B,
  });

  // A fresh checkout of the squashed history — nothing tracked carries a sitemap.
  clone = await mkdtemp(join(tmpdir(), "orbi-sitemap-clone-"));
  git(tmpdir(), ["clone", "-q", fixture, clone]);
  // What "npm ci" provides in the real checkout: the builder's dependency.
  await symlink(join(ROOT, "node_modules"), join(clone, "node_modules"), "dir");
  runSitemapEntry(clone);
  cloneSitemap = await readFile(join(clone, "public", "sitemap.xml"), "utf8");
}, 120_000);

afterAll(async () => {
  for (const dir of [fixture, clone]) if (dir) await rm(dir, { recursive: true, force: true });
});

describe("sitemap is generated from the deploying checkout (Issue #1062)", () => {
  it("dates the same tree differently after the squash rewrite, which is why it is not committed", () => {
    // The failure this Issue closes: the branch's own build signs day A, the
    // squash moves the commit onto day B, and a committed XML is then wrong by
    // construction. Nothing else about the tree changed.
    expect([...new Set(lastmodsOf(dayASitemap))]).toEqual(["2026-10-22"]);
    expect([...new Set(lastmodsOf(cloneSitemap))]).toEqual(["2026-10-23"]);
    expect(dayASitemap).not.toBe(cloneSitemap);
    expect(dayASitemap.replaceAll("<lastmod>2026-10-22</lastmod>", "<lastmod>2026-10-23</lastmod>"))
      .toBe(cloneSitemap);
  });

  it("dates every entry by the squashed commit's UTC day, not the feature branch's", () => {
    const lastmods = lastmodsOf(cloneSitemap);
    expect(lastmods.length).toBeGreaterThan(0);
    expect([...new Set(lastmods)]).toEqual(["2026-10-23"]);
    // The compare page from the incident carries the squash day.
    expect(sitemapEntryOf(cloneSitemap, "/compare/claude-code/")).toContain("<lastmod>2026-10-23</lastmod>");
  });

  it("needs no committed sitemap: the fresh checkout has none and still generates one", async () => {
    // The clone exists because the entry wrote it; Git tracks nothing there.
    expect(git(clone, ["ls-files", "public/sitemap.xml"]).trim()).toBe("");
    expect(cloneSitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    // In the delivered repository the same file is untracked, and only that
    // file is ignored — a broad ignore would hide the generated pages too.
    expect(git(ROOT, ["ls-files", "public/sitemap.xml"]).trim()).toBe("");
    const ignore = await readFile(join(ROOT, ".gitignore"), "utf8");
    expect(ignore.split("\n").map((line) => line.trim())).toContain("/public/sitemap.xml");
  });

  it("writes the same bytes whatever the build timezone is", async () => {
    // Same clean commit, three build environments: the date source is the
    // commit epoch, so no timezone can move an entry across UTC midnight.
    const outputs = ["UTC", "Pacific/Kiritimati", "America/Los_Angeles"].map((zone) => {
      const outDir = join(clone, "public-out", zone.replaceAll("/", "-"));
      execFileSync("node", [join(clone, "scripts", "build-pages.mjs"), "--sitemap-only", "--out", outDir], {
        cwd: clone,
        encoding: "utf8",
        timeout: 120_000,
        env: { ...process.env, TZ: zone, LANG: "C", LC_ALL: "C" },
      });
      return outDir;
    });
    const xmls = await Promise.all(outputs.map((outDir) => readFile(join(outDir, "sitemap.xml"), "utf8")));
    expect(new Set(xmls).size).toBe(1);
    expect(xmls[0]).toBe(cloneSitemap);
  }, 120_000);

  it("renders a commit time with a non-UTC offset as its UTC day, on both sides of midnight", async () => {
    // 2026-10-23T00:30:00+05:00 is still 2026-10-22 in UTC, while
    // 2026-10-22T23:30:00-05:00 is already 2026-10-23. A local-day format
    // would report the opposite of both, so the two pages must disagree.
    const east = "site/pages/zh/cloud/index.html";
    const west = "site/pages/zh/cost/index.html";
    const appendNote = async (file, note) => {
      const source = await readFile(join(clone, file), "utf8");
      await writeFile(join(clone, file), source + "<!-- " + note + " -->\n");
    };
    await appendNote(east, "offset east");
    git(clone, ["commit", "-q", "-am", "east"], {
      GIT_COMMITTER_DATE: "2026-10-23T00:30:00+05:00",
      GIT_AUTHOR_DATE: "2026-10-23T00:30:00+05:00",
    });
    await appendNote(west, "offset west");
    git(clone, ["commit", "-q", "-am", "west"], {
      GIT_COMMITTER_DATE: "2026-10-22T23:30:00-05:00",
      GIT_AUTHOR_DATE: "2026-10-22T23:30:00-05:00",
    });
    runSitemapEntry(clone);
    const xml = await readFile(join(clone, "public", "sitemap.xml"), "utf8");
    expect(sitemapEntryOf(xml, "/zh/cloud/")).toContain("<lastmod>2026-10-22</lastmod>");
    expect(sitemapEntryOf(xml, "/zh/cost/")).toContain("<lastmod>2026-10-23</lastmod>");
  }, 120_000);

  it("writes only sitemap.xml and never repairs a committed page", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "orbi-sitemap-only-"));
    try {
      // A committed generated page with a hand edit: the sitemap-only entry
      // must leave it exactly as it is, so the byte-for-byte gate still fails.
      await mkdir(join(outDir, "compare"), { recursive: true });
      await writeFile(join(outDir, "index.html"), "<!DOCTYPE html>corrupt\n");
      await writeFile(join(outDir, "compare", "index.html"), "<!DOCTYPE html>corrupt\n");
      const before = await readdir(outDir, { recursive: true });
      await buildSitemap(outDir);
      const after = await readdir(outDir, { recursive: true });
      // Exactly one new path: the deploy-time sitemap. Nothing else is written,
      // so no committed page can be silently regenerated into compliance.
      expect(after.filter((entry) => !before.includes(entry))).toEqual(["sitemap.xml"]);
      expect(await readFile(join(outDir, "index.html"), "utf8")).toBe("<!DOCTYPE html>corrupt\n");
      expect(await readFile(join(outDir, "compare", "index.html"), "utf8")).toBe("<!DOCTYPE html>corrupt\n");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 120_000);

  it("is the same XML the full build writes", async () => {
    // One renderer, two entry points: the deploy-time sitemap and the one
    // "npm run build" produces cannot drift.
    const fullBuild = await mkdtemp(join(tmpdir(), "orbi-full-build-"));
    const sitemapOnly = await mkdtemp(join(tmpdir(), "orbi-sitemap-build-"));
    try {
      execFileSync("node", [join(ROOT, "scripts", "build-pages.mjs"), "--out", fullBuild], {
        encoding: "utf8",
        timeout: 120_000,
      });
      await buildSitemap(sitemapOnly);
      expect(await readFile(join(sitemapOnly, "sitemap.xml"), "utf8"))
        .toBe(await readFile(join(fullBuild, "sitemap.xml"), "utf8"));
    } finally {
      await rm(fullBuild, { recursive: true, force: true });
      await rm(sitemapOnly, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("the generation step is wired into every deploy path (Issue #1062)", () => {
  const SITEMAP_COMMAND = "node scripts/build-pages.mjs --sitemap-only";

  it("runs from npm test through pretest, and as its own script", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["build:sitemap"]).toBe(SITEMAP_COMMAND);
    // npm runs pretest before "npm test" and never before "npm ci", which is
    // why beta's independent checkout needs its own explicit step.
    expect(pkg.scripts.pretest).toBe("npm run build:sitemap");
  });

  it("accepts --sitemap-only on the builder's own entry point", () => {
    const outDir = join(tmpdir(), "orbi-sitemap-cli-" + process.pid);
    const out = execFileSync("node", [join(ROOT, "scripts", "build-pages.mjs"), "--sitemap-only", "--out", outDir], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(out).toContain("sitemap.xml");
    expect(execFileSync("ls", [outDir], { encoding: "utf8" }).trim()).toBe("sitemap.xml");
  }, 120_000);

  it("generates in beta before the Python contract tests read the sitemap", async () => {
    const workflow = await readFile(join(ROOT, ".github", "workflows", "deploy-beta.yml"), "utf8");
    expect(workflow).not.toContain("npm test");
    expect(workflow).toContain("timeout 300s npm run build:sitemap");
    expect(workflow.indexOf("npm ci")).toBeLessThan(workflow.indexOf("npm run build:sitemap"));
    expect(workflow.indexOf("npm run build:sitemap")).toBeLessThan(workflow.indexOf("tests.test_landing"));
    expect(workflow.indexOf("npm run build:sitemap")).toBeLessThan(workflow.indexOf("command: deploy --env beta"));
  });

  it("generates in CI and production through npm test before the deploy", async () => {
    for (const name of ["ci.yml", "deploy-production.yml"]) {
      const workflow = await readFile(join(ROOT, ".github", "workflows", name), "utf8");
      expect(workflow).toContain("timeout 300s npm test");
      expect(workflow.indexOf("npm ci")).toBeLessThan(workflow.indexOf("npm test"));
      if (name === "deploy-production.yml") {
        // The same checkout that passes the gate is the one wrangler ships.
        expect(workflow.indexOf("npm test")).toBeLessThan(workflow.indexOf("command: deploy\n"));
      }
    }
  });
});
