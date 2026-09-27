import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const pages = [
  "site/pages/cloud/index.html",
  "site/pages/zh/cloud/index.html",
  "public/cloud/index.html",
  "public/zh/cloud/index.html",
];

const load = (file) => readFile(join(ROOT, file), "utf8");

describe("Cloud onboarding demo (Issue #292, #578)", () => {
  it("puts an accessible, user-initiated proof video directly after the hero CTA in both mirrors", async () => {
    for (const file of pages) {
      const html = await load(file);
      const cta = html.indexOf("hero-ctas");
      const demo = html.indexOf('<figure class="proof-loop cloud-demo">');
      expect(cta, `${file}: hero CTA missing`).toBeGreaterThan(-1);
      expect(demo, `${file}: Cloud demo missing`).toBeGreaterThan(cta);
      expect(html.match(/<figure class="proof-loop cloud-demo">/g)).toHaveLength(1);

      const video = html.match(/<video\b[^>]*class="proof-loop-video"[^>]*>/)?.[0];
      expect(video, `${file}: Cloud video missing`).toBeTruthy();
      for (const attribute of ["playsinline", "controls"]) {
        expect(video, `${file}: missing ${attribute}`).toMatch(new RegExp(`\\b${attribute}\\b`));
      }
      // Issue #578: the walkthrough carries narration — the visitor presses
      // play and hears it. The element must not move on its own, so neither
      // autoplay nor muted may ship, and nothing is preloaded.
      for (const attribute of ["autoplay", "muted", "loop"]) {
        expect(video, `${file}: Cloud video must not carry ${attribute}`).not.toMatch(new RegExp(`(?:^|\\s)${attribute}(?:\\s|=|$)`));
      }
      expect(video).toContain('preload="none"');
      expect(video).toContain('poster="/video/cloud-onboarding-poster.jpg"');
      expect(video).toContain('src="/video/cloud-onboarding.mp4"');
      expect(video).toContain("aria-label=");
      expect(html).toContain('<source src="/video/cloud-onboarding.webm" type="video/webm">');
      expect(html).toContain('<source src="/video/cloud-onboarding.mp4" type="video/mp4">');
      expect(html).not.toContain("delivery-loop");
      expect(html).not.toMatch(/coming soon|Temporary preview|临时复用|即将上线/);
    }
  });

  it("keeps the cloud video visible under reduced motion (Issue #578)", async () => {
    const css = await load("public/styles.css");
    // The reduced-motion hide rule must be scoped to the homepage proof-loop
    // (delivery-loop): the Cloud walkthrough never animates on its own —
    // playback starts only on the visitor's click — so there is no motion to
    // reduce and hiding the element would take the controls away with it.
    expect(css).toContain('@media (prefers-reduced-motion: reduce) { .proof-loop:not(.cloud-demo) .proof-loop-video { display: none; } .proof-loop:not(.cloud-demo) { background: url("/video/delivery-loop-poster.jpg") center/contain no-repeat; aspect-ratio: 16/9; } }');
    expect(css, "Cloud demo must not carry a poster background stand-in").not.toContain('.cloud-demo { background-image: url("/video/cloud-onboarding-poster.jpg")');
  });
});
