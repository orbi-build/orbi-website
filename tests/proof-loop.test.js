// Issue #264: the proof-loop test locks behavior, not copy. The asset has
// been swapped three times (beta 2a88ef3 alone replaced three segments and
// added a narration track), and every swap reded the old verbatim figure
// pins — the tests chased the asset, not a code defect. What must hold is
// the figure's structure, the autoplay/controls contract, an aria-label
// that describes the loop without pinning its duration or silence, and the
// reduced-motion poster fallback. Duration, byte size, audio track and
// scene count are the asset's business and are not asserted here.

import { stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const pages = [
  ["site/pages/index.html", "public/index.html"],
  ["site/pages/zh/index.html", "public/zh/index.html"],
];

const secondsPattern = /\d+(\.\d+)?[\s-]*(second|秒)/;

// Acceptance 5: the assets ship in public/, non-empty.
const videoAssets = [
  "public/video/delivery-loop.mp4",
  "public/video/delivery-loop.webm",
  "public/video/delivery-loop-poster.jpg",
];

async function pageFiles() {
  const loaded = [];
  for (const [source, built] of pages) {
    for (const file of [source, built]) {
      loaded.push([file, await readFile(join(ROOT, file), "utf8")]);
    }
  }
  return loaded;
}

function videoOpenTag(file, html) {
  const openTag = html.match(/<video\b[^>]*class="proof-loop-video"[^>]*>/)?.[0];
  expect(openTag, `${file}: proof-loop-video open tag not found`).toBeTruthy();
  return openTag;
}

describe("proof-loop markup (Issue #264)", () => {
  it("places exactly one proof-loop figure between the proof ledger and the midway div, source and built", async () => {
    for (const [file, html] of await pageFiles()) {
      const figureCount = (html.match(/<figure class="proof-loop">/g) ?? []).length;
      expect(figureCount, `${file}: expected exactly one proof-loop figure, found ${figureCount}`).toBe(1);
      const ledgerEnd = html.indexOf("</ul>", html.indexOf('<ul class="proof-ledger">'));
      const figureStart = html.indexOf('<figure class="proof-loop">');
      const midway = html.indexOf('<div class="midway">');
      expect(ledgerEnd, `${file}: proof-ledger not found`).toBeGreaterThan(-1);
      expect(midway, `${file}: midway div not found`).toBeGreaterThan(-1);
      expect(figureStart, `${file}: figure must follow the proof-ledger's </ul>`).toBeGreaterThan(ledgerEnd);
      expect(figureStart, `${file}: figure must precede <div class="midway">`).toBeLessThan(midway);
    }
  });

  it("gives the video the full autoplay contract plus controls, pointed at the shipped assets", async () => {
    for (const [file, html] of await pageFiles()) {
      const openTag = videoOpenTag(file, html);
      for (const attribute of ["autoplay", "loop", "muted", "playsinline", "controls"]) {
        expect(openTag, `${file}: <video> is missing ${attribute}`).toMatch(new RegExp(`\\b${attribute}\\b`));
      }
      expect(openTag, `${file}: <video> is missing preload="metadata"`).toContain('preload="metadata"');
      expect(openTag, `${file}: <video> src must point at the mp4 asset`).toContain('src="/video/delivery-loop.mp4"');
      expect(openTag, `${file}: <video> poster must point at the poster asset`).toContain('poster="/video/delivery-loop-poster.jpg"');
      expect(html, `${file}: webm source missing`).toContain('<source src="/video/delivery-loop.webm" type="video/webm">');
      expect(html, `${file}: mp4 source missing`).toContain('<source src="/video/delivery-loop.mp4" type="video/mp4">');
    }
  });

  it("describes the loop in an aria-label without pinning a duration or silence", async () => {
    for (const [file, html] of await pageFiles()) {
      const openTag = videoOpenTag(file, html);
      const label = openTag.match(/aria-label="([^"]*)"/)?.[1];
      expect(label, `${file}: <video> needs an aria-label`).toBeTruthy();
      expect(
        label.length,
        `${file}: aria-label is ${label.length} chars, too short to describe the loop`
      ).toBeGreaterThan(40);
      expect(label, `${file}: aria-label must not pin a duration (seconds)`).not.toMatch(secondsPattern);
      expect(label, `${file}: aria-label must not claim the loop is silent`).not.toMatch(/silent|无声/);
    }
  });

  it("links the figcaption to exactly one Issue, one PR and one Release, whatever their numbers", async () => {
    for (const [file, html] of await pageFiles()) {
      const figure = html.match(/<figure class="proof-loop">[\s\S]*?<\/figure>/)?.[0];
      expect(figure, `${file}: proof-loop figure not found`).toBeTruthy();
      const hrefs = [...figure.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1]);
      for (const [name, pattern] of [
        ["Issue", /github\.com\/orbi-build\/orbi\/issues\/\d+$/],
        ["PR", /github\.com\/orbi-build\/orbi\/pull\/\d+$/],
        ["Release", /github\.com\/orbi-build\/orbi\/releases\/tag\/[^/]+$/],
      ]) {
        const matched = hrefs.filter((href) => pattern.test(href));
        expect(matched, `${file}: figcaption must link exactly one ${name}, found ${JSON.stringify(hrefs)}`).toHaveLength(1);
      }
      expect(hrefs, `${file}: figcaption must carry exactly the three links`).toHaveLength(3);
    }
  });

  it("ships the three video assets, non-empty", async () => {
    for (const asset of videoAssets) {
      const info = await stat(join(ROOT, asset));
      expect(info.size, `${asset}: must be non-empty`).toBeGreaterThan(0);
    }
  });

  it("degrades to the static poster under prefers-reduced-motion", async () => {
    const css = (await readFile(join(ROOT, "public/styles.css"), "utf8")).replace(/\s+/g, " ").trim();
    expect(css, "styles.css: missing the proof-loop reduced-motion poster fallback").toContain(
      '@media (prefers-reduced-motion: reduce) { .proof-loop .proof-loop-video { display: none; } .proof-loop { background: url("/video/delivery-loop-poster.jpg") center/contain no-repeat; aspect-ratio: 16/9; } .cloud-demo { background-image: url("/video/cloud-onboarding-poster.jpg"); } }'
    );
  });
});
