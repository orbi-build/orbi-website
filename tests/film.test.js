// Issue #571: the brand film enters the EN homepage's first screen behind a
// click. Issue #577 removed the /cloud/ merge-gate clip (it autoplayed in a
// loop with no pause — a WCAG 2.2.2 failure — and was purely decorative); the
// explainer keeps its title and three sentences as single-column text.
// Assertions run on the built bytes in public/ (the same files the Worker
// ships); source drift is already covered by the build gate in pages.test.js.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFile(join(ROOT, file), "utf8");

describe("homepage brand-film entry and dialog (Issue #571)", () => {
  it("puts the film entry on the EN hero trace figure, and only there", async () => {
    const en = await read("public/index.html");
    const figure = en.match(/<figure class="factory-trace"[\s\S]*?<\/figure>/)?.[0] ?? "";
    expect(figure, "film entry button inside the trace figure").toContain('data-cta="film-play"');
    const button = figure.match(/<button[^>]*data-cta="film-play"[^>]*>/)?.[0] ?? "";
    expect(button, "entry button shape").toContain('type="button"');
    expect(button).toContain('aria-haspopup="dialog"');
    expect(button).toContain('aria-controls="film-dialog"');
    expect(figure).toContain("▶ Watch the film · 1:35");

    const zh = await read("public/zh/index.html");
    expect(zh, "the Issue leaves the ZH homepage untouched this ticket").not.toContain("film-play");
    expect(zh).not.toContain("film-dialog");
  });

  it("ships the dialog with the film sources, captions track and a close control", async () => {
    const en = await read("public/index.html");
    const dialog = en.match(/<dialog id="film-dialog"[\s\S]*?<\/dialog>/)?.[0] ?? "";
    expect(dialog, "film dialog present").toBeTruthy();

    const video = dialog.match(/<video id="film-video"[^>]*>/)?.[0] ?? "";
    expect(video, "film video element").toBeTruthy();
    expect(video).toContain('preload="none"');
    expect(video).toContain('playsinline');
    expect(video).toContain('poster="/video/orbi-film-poster.jpg"');
    expect(video, "no autoplay: playback starts on the open click, with sound")
      .not.toMatch(/(?:^|\s)autoplay(?:\s|=|$)/);
    expect(dialog).toContain('<source src="/video/orbi-film.webm" type="video/webm">');
    expect(dialog).toContain('<source src="/video/orbi-film.mp4" type="video/mp4">');
    expect(dialog).toContain('<track kind="captions" srclang="en" label="English" src="/video/orbi-film.en.vtt">');
    expect(dialog).toContain('aria-label="Close"');
  });

  it("keeps the evidence links playing and swaps in the end buttons on ended", async () => {
    const en = await read("public/index.html");
    const dialog = en.match(/<dialog id="film-dialog"[\s\S]*?<\/dialog>/)?.[0] ?? "";
    const evidence = dialog.match(/<p class="film-evidence"[\s\S]*?<\/p>/)?.[0] ?? "";
    expect(evidence, "Real run evidence row").toContain("Real run:");
    expect(evidence).toContain('href="https://github.com/orbi-build/orbi/issues/1367"');
    expect(evidence).toContain('href="https://github.com/orbi-build/orbi/pull/1370"');
    expect(evidence).toContain('href="https://github.com/orbi-build/orbi/releases/tag/v0.5.47"');

    const endRow = dialog.match(/<div class="film-end" hidden>[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(endRow, "end row starts hidden").toBeTruthy();
    expect(endRow).toMatch(/data-cta="film-end-cloud" href="\/cloud\/login"/);
    expect(endRow, "no ref= on the login handoff").not.toMatch(/href="\/cloud\/login\?/);
    expect(endRow).toMatch(/data-cta="film-end-selfhost" href="https:\/\/github\.com\/orbi-build\/orbi"/);
  });

  it("reports 50% and completion once each from the dialog's own script", async () => {
    const source = await read("site/pages/index.html");
    expect(source).toContain('sendBeacon("/cloud/e"');
    expect(source).toContain('beacon("film-50")');
    expect(source).toContain('beacon("film-100")');
    expect(source).toContain('addEventListener("ended"');
    expect(source).toContain('addEventListener("timeupdate"');
  });
});

describe("cloud merge-gate explainer (Issue #577: clip removed)", () => {
  const cases = [
    ["public/cloud/index.html", "Before you connect GitHub", [
      "Orbi only merges the commit its review passed.",
      "Want to approve merges yourself? Require an approving review in branch protection. Orbi stops and waits for it.",
      "Releases ship only when you open a release Issue.",
    ]],
    ["public/zh/cloud/index.html", "连接 GitHub 之前", [
      "Orbi 只合并通过评审的那个提交。",
      "想自己批准合并？在分支保护里要求审批，Orbi 会停下来等你。",
      "只有你开了发版 Issue，才会发版。",
    ]],
  ];

  // The explainer sits directly below the first hero CTA row's closing tag,
  // before the onboarding demo figure.
  const closeOfDiv = (html, marker) => {
    const start = html.indexOf(marker);
    if (start < 0) return -1;
    let depth = 1;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = html.indexOf(">", start) + 1;
    for (let match; (match = re.exec(html)); ) {
      depth += match[0] === "</div>" ? -1 : 1;
      if (depth === 0) return match.index + match[0].length;
    }
    return -1;
  };

  for (const [file, title, sentences] of cases) {
    it(`${file} no longer ships the gate clip and keeps its language's three sentences below the hero CTA row`, async () => {
      const html = await read(file);
      expect(html, "the decorative autoplaying gate clip is gone (Issue #577)").not.toMatch(/gate[-]clip/);

      expect(html).toContain(title);
      for (const sentence of sentences) expect(html, sentence).toContain(sentence);

      const ctaEnd = closeOfDiv(html, 'class="cta-row hero-ctas"');
      const gate = html.indexOf('<aside class="cloud-gate"');
      const demo = html.indexOf('<figure class="proof-loop cloud-demo">');
      expect(gate, "gate explainer present").toBeGreaterThan(-1);
      expect(html.slice(ctaEnd, gate).trim(), "gate explainer sits directly below the hero CTA row").toBe("");
      expect(gate, "gate explainer precedes the onboarding demo").toBeLessThan(demo);
    });
  }
});
