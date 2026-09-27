// Share cards (og:image, twitter:image) and structured-data images
// (JSON-LD "image" / "thumbnailUrl") must stay PNG or JPEG files that ship
// in public/: X, LinkedIn, WeChat and the Google rich-result crawlers do not
// reliably render WebP or AVIF there, and a missing file shows an empty card.
// Issue #574 converts page images to WebP; this guard keeps that change (and
// any later one) away from the share images.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const SITE_ORIGIN = "https://orbi.build";

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await htmlFiles(path));
    else if (entry.name.endsWith(".html")) out.push(path);
  }
  return out;
}

function shareImageUrls(html) {
  const urls = [];
  for (const tag of html.match(/<meta\b[^>]*>/g) || []) {
    if (/(property|name)="(og:image|twitter:image)"/.test(tag)) {
      const content = tag.match(/content="([^"]+)"/);
      if (content) urls.push(content[1]);
    }
  }
  for (const match of html.matchAll(/"(?:image|thumbnailUrl)":\s*"([^"]+)"/g)) urls.push(match[1]);
  return urls;
}

function isPngOrJpeg(bytes) {
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return png || jpeg;
}

describe("share images", () => {
  it("every og:image, twitter:image and JSON-LD image is a shipped PNG or JPEG", async () => {
    const seen = new Map(); // url -> first page that uses it
    for (const file of await htmlFiles(PUBLIC)) {
      for (const url of shareImageUrls(await readFile(file, "utf8"))) {
        if (!seen.has(url)) seen.set(url, file.slice(PUBLIC.length));
      }
    }
    expect(seen.size, "no share images found: the extractor is broken").toBeGreaterThan(0);
    for (const [url, page] of seen) {
      expect(url, `${page}: share image must be .png/.jpg`).toMatch(/\.(png|jpe?g)$/i);
      const path = url.startsWith(SITE_ORIGIN) ? url.slice(SITE_ORIGIN.length) : url;
      expect(path, `${page}: share image must be served from this site`).toMatch(/^\/[^/]/);
      const bytes = await readFile(join(PUBLIC, path)).catch(() => null);
      expect(bytes, `${page}: ${path} is missing from public/`).not.toBeNull();
      expect(isPngOrJpeg(bytes), `${page}: ${path} is not really PNG/JPEG`).toBe(true);
    }
  });
});
