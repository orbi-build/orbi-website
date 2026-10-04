// Share-card bottom strip (Issue #803).
//
// X renders a summary_large_image card by drawing the page title as a
// semi-transparent label over the bottom-left of the image (roughly
// x < 780, y >= 504 of a 1200x630 card). Anything the card draws there -
// the caption line, the left accent bar - is covered by that label, so the
// bottom 20% of every og image has to stay plain background.
//
// The caption that used to live there now sits directly under the main
// title, above y = 504. This guard pins both halves of that contract: the
// strip stays background, and the caption still exists above it.
//
// The whole band is checked, not just the label's own width: the label's
// right edge is only approximate (the ticket measures ~60%, this file's
// region was 780 of 1200), so ink that survives just past 780 still shows
// on the card - as a chopped-off fragment of the line that moved away.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const BAND_TOP = 504;
const BAND_RIGHT = 780; // where the label's own coverage is assumed to end
const CAPTION_TOP = 410; // a moved caption reaches into this band on every card
const CAPTION_BOTTOM = 504;
const LABEL_TOLERANCE = 60; // per-pixel |dR| + |dG| + |dB| against the background
const INK = 90; // a pixel this far from the background is card content

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

/** Minimal PNG reader: 8-bit truecolour, no interlace - what the og images are. */
function decodePng(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i++) {
    expect(bytes[i], "not a PNG file").toBe(signature[i]);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let colourType = 0;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8], "only 8-bit PNGs").toBe(8);
      colourType = data[9];
      expect([2, 6], "only truecolour PNGs").toContain(colourType);
      expect(data[12], "no interlaced PNGs").toBe(0);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colourType === 6 ? 4 : 3;
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let at = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[at++];
    const line = raw.subarray(at, at + stride);
    at += stride;
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = previous ? previous[i] : 0;
      const c = previous && i >= channels ? previous[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        // A plain throw: a filter-0 row reaches the "no filter" case below
        // hundreds of times per image, and an expect() per row turns the
        // decode of a plainly encoded PNG into a several-second stall that
        // trips the test timeout.
        throw new Error("unknown PNG row filter " + filter);
      }
      row[i] = value & 0xff;
    }
  }
  return {
    width,
    height,
    at(x, y) {
      const p = y * stride + x * channels;
      return [pixels[p], pixels[p + 1], pixels[p + 2]];
    },
  };
}

async function cardImages() {
  const urls = new Set();
  for (const file of await htmlFiles(PUBLIC)) {
    for (const url of shareImageUrls(await readFile(file, "utf8"))) {
      const path = url.replace(/^https:\/\/orbi\.build/, "");
      if (/^\/img\/og[^/]*\.png$/.test(path)) urls.add(path);
    }
  }
  return [...urls].sort();
}

describe("share card bottom strip", () => {
  it("keeps the strip X's title label covers free of card content", async () => {
    const cards = await cardImages();
    expect(cards.length, "og cards went missing: the extractor is broken").toBeGreaterThanOrEqual(9);
    for (const path of cards) {
      const image = decodePng(await readFile(join(PUBLIC, path)));
      expect([image.width, image.height], path).toEqual([1200, 630]);

      // The card's background is whatever fills the bottom-right of the strip.
      const counts = new Map();
      for (let y = BAND_TOP; y < image.height; y++) {
        for (let x = BAND_RIGHT; x < image.width; x++) {
          const key = image.at(x, y).join(",");
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
      const background = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);

      let worst = 0;
      let worstAt = null;
      for (let y = BAND_TOP; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const [r, g, b] = image.at(x, y);
          const distance = Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]);
          if (distance > worst) {
            worst = distance;
            worstAt = [x, y];
          }
        }
      }
      expect(worst, path + ": the label strip must stay plain background, worst pixel " + worstAt).toBeLessThanOrEqual(LABEL_TOLERANCE);

      // ...and the caption that moved out of it has to be above it.
      let ink = 0;
      for (let y = CAPTION_TOP; y < CAPTION_BOTTOM; y++) {
        for (let x = 0; x < image.width; x++) {
          const [r, g, b] = image.at(x, y);
          if (Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]) > INK) ink++;
        }
      }
      expect(ink, path + ": the caption must sit above the label strip, not be deleted").toBeGreaterThan(500);
    }
  });
});
