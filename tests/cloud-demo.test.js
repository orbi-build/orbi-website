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

describe("Cloud onboarding demo (Issue #292)", () => {
  it("puts an accessible proof video directly after the hero CTA in both mirrors", async () => {
    for (const file of pages) {
      const html = await load(file);
      const cta = html.indexOf("hero-ctas");
      const demo = html.indexOf('<figure class="proof-loop cloud-demo">');
      expect(cta, `${file}: hero CTA missing`).toBeGreaterThan(-1);
      expect(demo, `${file}: Cloud demo missing`).toBeGreaterThan(cta);
      expect(html.match(/<figure class="proof-loop cloud-demo">/g)).toHaveLength(1);

      const video = html.match(/<video\b[^>]*class="proof-loop-video"[^>]*>/)?.[0];
      expect(video, `${file}: Cloud video missing`).toBeTruthy();
      for (const attribute of ["autoplay", "loop", "muted", "playsinline", "controls"]) {
        expect(video, `${file}: missing ${attribute}`).toMatch(new RegExp(`\\b${attribute}\\b`));
      }
      expect(video).toContain('preload="metadata"');
      expect(video).toContain('poster="/video/delivery-loop-poster.jpg"');
      expect(video).toContain("aria-label=");
      expect(html).toContain('<source src="/video/delivery-loop.webm" type="video/webm">');
      expect(html).toContain('<source src="/video/delivery-loop.mp4" type="video/mp4">');
    }
  });

  it("keeps the reduced-motion poster fallback on the shared video component", async () => {
    const css = await load("public/styles.css");
    expect(css).toContain('@media (prefers-reduced-motion: reduce) { .proof-loop-video { display: none; } .proof-loop { background: url("/video/delivery-loop-poster.jpg") center/contain no-repeat; aspect-ratio: 16/9; } }');
  });
});
