#!/usr/bin/env node
// Issue #1090: after a successful production deploy, hand the pages this
// deploy added or changed to IndexNow (one POST; Bing, Yandex and the other
// participants share that one submission). Nothing here is user-visible: it
// only tells the search engines a URL exists, so a new post is discovered the
// day it ships instead of whenever a crawler next visits.
//
// Usage: node scripts/indexnow.mjs [--prev <sha>] [--dry-run]
//
//   --prev <sha>  the source commit of the previous *successful* production
//                 deploy; empty (or a commit that predates the key file, i.e.
//                 the first deploy after this shipped) submits the whole
//                 sitemap once.
//   --dry-run     print the URLs instead of posting them.
//
// The key file is public by design: the protocol has the crawler fetch
// https://orbi.build/<key>.txt to verify the host owns the key.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { pathToHref } from "./build-pages.mjs";

export const HOST = "orbi.build";
export const KEY = "83f38aa2a589432901477c2735eea995";
export const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
export const KEY_FILE = `public/${KEY}.txt`;
export const SITEMAP_FILE = join("public", "sitemap.xml");
export const ENDPOINT = "https://api.indexnow.org/indexnow";
// The workflow wraps this step in its own timeout too; this one keeps a hung
// connection from eating that budget.
const REQUEST_TIMEOUT_MS = 60_000;
const USAGE = "usage: node scripts/indexnow.mjs [--prev <sha>] [--dry-run]";

function git(cwd, args) {
  // stderr stays piped: the key-file probe below fails by design on a commit
  // from before the file existed, and git says so on stderr.
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// Every listed URL, in sitemap order. The build writes only <loc> plus the
// hreflang alternates (Issue #1065), so this is a plain tag scan.
export function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^\s<]+)\s*<\/loc>/g)].map((match) => match[1]);
}

// public/blog/x/index.html → https://orbi.build/blog/x/, reusing the build's
// own path convention instead of a second copy of it. Only pages the current
// sitemap lists survive: a deleted page or a page that must not be indexed
// (the Cloud login handoff) never reaches the submission.
export function selectUrls(changed, sitemapXml) {
  const listed = new Set(sitemapUrls(sitemapXml));
  const urls = changed
    .filter((path) => path.endsWith(".html"))
    .map((path) => `https://${HOST}${pathToHref(path.replace(/^public\//, ""))}`)
    .filter((url) => listed.has(url));
  return [...new Set(urls)];
}

export function payload(urls) {
  return { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls };
}

export async function submitUrls(urls, { dryRun = false } = {}) {
  if (dryRun) {
    console.log(`--dry-run: 将提交 ${urls.length} 个地址`);
    for (const url of urls) console.log(url);
    return null;
  }
  for (const url of urls) console.log(`提交 ${url}`);
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload(urls)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  console.log(`IndexNow 返回码 ${response.status}`);
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow 返回 HTTP ${response.status}`);
  }
  return response.status;
}

function hasKeyFile(rev, cwd) {
  try {
    git(cwd, ["cat-file", "-e", `${rev}:${KEY_FILE}`]);
    return true;
  } catch {
    return false;
  }
}

export async function deliver({ prev = "", head = "HEAD", dryRun = false, cwd = process.cwd() } = {}) {
  const sitemapXml = readFileSync(join(cwd, SITEMAP_FILE), "utf8");
  if (prev && hasKeyFile(prev, cwd)) {
    const urls = selectUrls(git(cwd, ["diff", "--name-only", prev, head, "--", "public"]).split("\n"), sitemapXml);
    console.log(`IndexNow：对比上次生产部署 ${prev.slice(0, 12)}，本次新增或改动的公开页面 ${urls.length} 个`);
    if (urls.length === 0) {
      console.log("无可提交页面");
      return null;
    }
    return submitUrls(urls, { dryRun });
  }
  // No baseline, or one from before the key file existed: this is the first
  // deploy after IndexNow shipped, so submit everything once and pick up the
  // pages the crawlers have never found.
  const urls = sitemapUrls(sitemapXml);
  console.log(
    prev
      ? `IndexNow：上次生产部署 ${prev.slice(0, 12)} 里还没有 ${KEY_FILE}（首次接入），提交 sitemap 全部 ${urls.length} 个地址`
      : `IndexNow：没有上一次生产部署（首次接入），提交 sitemap 全部 ${urls.length} 个地址`,
  );
  if (urls.length === 0) {
    console.log("无可提交页面");
    return null;
  }
  return submitUrls(urls, { dryRun });
}

async function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const at = argv.indexOf("--prev");
  let prev = "";
  if (at >= 0) {
    prev = argv[at + 1] ?? "";
    if (prev.startsWith("--")) {
      console.error(USAGE);
      process.exit(2);
    }
  }
  try {
    await deliver({ prev, dryRun });
  } catch (error) {
    // The pages are already live: a failed submission is a warning in the
    // deploy log, and the workflow step's continue-on-error keeps it off the
    // rollback path. The non-zero exit still surfaces it.
    console.log(`::warning::IndexNow 提交失败：${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2));
}
