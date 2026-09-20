// Issue #262: the proof section's 14-second silent loop. The Issue pins the
// figure block byte-exactly (acceptance 1), the four autoplay-contract video
// attributes one by one with no controls (acceptance 2), the exact midway CTA
// refs (acceptance 3, pinned in cta-ref.test.js), the three video assets
// (acceptance 5), and the prefers-reduced-motion poster fallback. The rendered
// geometry lives in tests/homepage.smoke.mjs — this file pins the markup those
// renders are built from, in the source and the built page alike.

import { stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Acceptance 1, verbatim from the Issue, whitespace-collapsed: the EN and ZH
// figure blocks may differ only in the aria-label, and must sit exactly
// between the proof-ledger's </ul> and the midway div.
const enFigure = `<figure class="proof-loop">
<video class="proof-loop-video" src="/video/delivery-loop.mp4" poster="/video/delivery-loop-poster.jpg" width="1280" height="720" autoplay loop muted playsinline preload="metadata" aria-label="A 14-second silent loop of one real delivery: the review returns one Major finding, only the reviewed commit merges, and the result ships as tagged release v0.5.13.">
<source src="/video/delivery-loop.webm" type="video/webm">
<source src="/video/delivery-loop.mp4" type="video/mp4">
</video>
<figcaption>Issue <a href="https://github.com/orbi-build/orbi/issues/983">#983</a> · PR <a href="https://github.com/orbi-build/orbi/pull/991">#991</a> · Release <a href="https://github.com/orbi-build/orbi/releases/tag/v0.5.13">v0.5.13</a></figcaption>
</figure>`;

const zhFigure = `<figure class="proof-loop">
<video class="proof-loop-video" src="/video/delivery-loop.mp4" poster="/video/delivery-loop-poster.jpg" width="1280" height="720" autoplay loop muted playsinline preload="metadata" aria-label="14 秒无声循环：一次真实交付里，评审给出一条 Major，只有审过的那个 commit 被合并，最后发成打了 tag 的 v0.5.13。">
<source src="/video/delivery-loop.webm" type="video/webm">
<source src="/video/delivery-loop.mp4" type="video/mp4">
</video>
<figcaption>Issue <a href="https://github.com/orbi-build/orbi/issues/983">#983</a> · PR <a href="https://github.com/orbi-build/orbi/pull/991">#991</a> · Release <a href="https://github.com/orbi-build/orbi/releases/tag/v0.5.13">v0.5.13</a></figcaption>
</figure>`;

const pages = [
  ["site/pages/index.html", "public/index.html", enFigure],
  ["site/pages/zh/index.html", "public/zh/index.html", zhFigure],
];

const squash = (html) => html.replace(/\s+/g, " ").trim();

// Acceptance 5: the assets ship in public/, non-empty.
const videoAssets = [
  "public/video/delivery-loop.mp4",
  "public/video/delivery-loop.webm",
  "public/video/delivery-loop-poster.jpg",
];

describe("proof-loop markup (Issue #262)", () => {
  it("carries the Issue's verbatim figure between the proof ledger and the midway div, source and built", async () => {
    for (const [source, built, figure] of pages) {
      for (const file of [source, built]) {
        const html = squash(await readFile(join(ROOT, file), "utf8"));
        expect(html, `${file}: missing the Issue's proof-loop figure`).toContain(squash(figure));
        const ledgerEnd = html.indexOf("</ul>", html.indexOf('<ul class="proof-ledger">'));
        const figureStart = html.indexOf('<figure class="proof-loop">');
        const midway = html.indexOf('<div class="midway">');
        expect(ledgerEnd, `${file}: proof-ledger not found`).toBeGreaterThan(-1);
        expect(midway, `${file}: midway div not found`).toBeGreaterThan(-1);
        expect(figureStart, `${file}: proof-loop figure not found`).toBeGreaterThan(ledgerEnd);
        expect(figureStart, `${file}: figure must precede <div class="midway">`).toBeLessThan(midway);
      }
    }
  });

  it("gives the video each of the four autoplay-contract attributes and no controls (acceptance 2)", async () => {
    for (const [source, built] of pages) {
      for (const file of [source, built]) {
        const html = await readFile(join(ROOT, file), "utf8");
        const openTag = html.match(/<video\b[^>]*class="proof-loop-video"[^>]*>/)?.[0];
        expect(openTag, `${file}: proof-loop-video open tag not found`).toBeTruthy();
        for (const attribute of ["autoplay", "loop", "muted", "playsinline"]) {
          expect(openTag, `${file}: <video> is missing ${attribute}`).toMatch(new RegExp(`\\b${attribute}\\b`));
        }
        expect(openTag, `${file}: <video> must not carry controls`).not.toMatch(/\bcontrols\b/);
        expect(openTag, `${file}: <video> is missing preload="metadata"`).toContain('preload="metadata"');
        expect(html, `${file}: webm source missing`).toContain('<source src="/video/delivery-loop.webm" type="video/webm">');
        expect(html, `${file}: mp4 source missing`).toContain('<source src="/video/delivery-loop.mp4" type="video/mp4">');
      }
    }
  });

  it("ships the three video assets, non-empty (acceptance 5)", async () => {
    for (const asset of videoAssets) {
      const info = await stat(join(ROOT, asset));
      expect(info.size, `${asset}: must be non-empty`).toBeGreaterThan(0);
    }
  });

  it("styles the loop and degrades to the static poster under prefers-reduced-motion", async () => {
    const css = squash(await readFile(join(ROOT, "public/styles.css"), "utf8"));
    for (const rule of [
      ".proof-loop { margin: 28px 0 0; }",
      ".proof-loop-video { width: 100%; height: auto; display: block; border: 1px solid var(--line); border-radius: 8px; }",
      ".proof-loop figcaption { margin-top: 10px; font-family: var(--mono); font-size: 0.82rem; color: var(--ink-soft); }",
      '@media (prefers-reduced-motion: reduce) { .proof-loop-video { display: none; } .proof-loop { background: url("/video/delivery-loop-poster.jpg") center/contain no-repeat; aspect-ratio: 16/9; } }',
    ]) {
      expect(css, `styles.css: missing ${rule}`).toContain(squash(rule));
    }
  });
});
