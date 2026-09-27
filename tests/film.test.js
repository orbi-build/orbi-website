// Issue #571: the brand film enters the EN homepage's first screen behind a
// click. Issue #577 removed the /cloud/ merge-gate clip (it autoplayed in a
// loop with no pause — a WCAG 2.2.2 failure — and was purely decorative); the
// explainer keeps its title and three sentences as single-column text.
// Issue #575: the ZH homepage carries the same entry and dialog — same
// English-narrated assets, Chinese copy.
// Issue #576 removed the trace caption's two ledger sentences (the hero
// already says GitHub stays the source of truth) and renamed the figure with
// an aria-label.
// Assertions run on the built bytes in public/ (the same files the Worker
// ships); source drift is already covered by the build gate in pages.test.js.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFile(join(ROOT, file), "utf8");

describe("homepage brand-film entry and dialog (Issue #571, #575)", () => {
  // Issue #575: both mirrors ship the film; only the copy language differs.
  const homes = [
    ["public/index.html", "▶ Watch the film · 1:35", "Orbi brand film", "Close", "Real run:", "Sign in with GitHub", "Run it yourself", "/cloud/login"],
    ["public/zh/index.html", "▶ 观看短片 · 1:35", "Orbi 品牌短片", "关闭", "真实运行：", "用 GitHub 登录", "自己部署", "/zh/cloud/login"],
  ];

  it("puts the film entry on each homepage's hero trace figure, and only there", async () => {
    for (const [file, label] of homes) {
      const html = await read(file);
      const figure = html.match(/<figure class="factory-trace"[\s\S]*?<\/figure>/)?.[0] ?? "";
      expect(figure, `${file}: film entry button inside the trace figure`).toContain('data-cta="film-play"');
      const button = figure.match(/<button[^>]*data-cta="film-play"[^>]*>/)?.[0] ?? "";
      expect(button, "entry button shape").toContain('type="button"');
      expect(button).toContain('aria-haspopup="dialog"');
      expect(button).toContain('aria-controls="film-dialog"');
      expect(figure).toContain(label);
      expect([...html.matchAll(/data-cta="film-play"/g)], `${file}: the figure is the only entry`).toHaveLength(1);
    }
  });

  it("ships the dialog with the film sources, captions track and a close control on both homepages", async () => {
    for (const [file, , dialogLabel, closeLabel] of homes) {
      const html = await read(file);
      const dialog = html.match(/<dialog id="film-dialog"[\s\S]*?<\/dialog>/)?.[0] ?? "";
      expect(dialog, `${file}: film dialog present`).toBeTruthy();
      expect(dialog, `${file}: dialog label`).toContain(`aria-label="${dialogLabel}"`);

      const video = dialog.match(/<video id="film-video"[^>]*>/)?.[0] ?? "";
      expect(video, "film video element").toBeTruthy();
      expect(video).toContain('preload="none"');
      expect(video).toContain('playsinline');
      expect(video).toContain('poster="/video/orbi-film-poster.jpg"');
      expect(video, "no autoplay: playback starts on the open click, with sound")
        .not.toMatch(/(?:^|\s)autoplay(?:\s|=|$)/);
      expect(dialog).toContain('<source src="/video/orbi-film.webm" type="video/webm">');
      expect(dialog).toContain('<source src="/video/orbi-film.mp4" type="video/mp4">');
      expect(dialog, "the English-narrated asset is shared, no ZH captions track")
        .toContain('<track kind="captions" srclang="en" label="English" src="/video/orbi-film.en.vtt">');
      expect(dialog).toContain(`aria-label="${closeLabel}"`);
    }
  });

  it("keeps the evidence links playing and swaps in the end buttons on ended, on both homepages", async () => {
    for (const [file, , , , evidenceLabel, cloudLabel, selfhostLabel, loginHref] of homes) {
      const html = await read(file);
      const dialog = html.match(/<dialog id="film-dialog"[\s\S]*?<\/dialog>/)?.[0] ?? "";
      const evidence = dialog.match(/<p class="film-evidence"[\s\S]*?<\/p>/)?.[0] ?? "";
      expect(evidence, `${file}: evidence row`).toContain(evidenceLabel);
      expect(evidence).toContain('href="https://github.com/orbi-build/orbi/issues/1367"');
      expect(evidence).toContain('href="https://github.com/orbi-build/orbi/pull/1370"');
      expect(evidence).toContain('href="https://github.com/orbi-build/orbi/releases/tag/v0.5.47"');

      const endRow = dialog.match(/<div class="film-end" hidden>[\s\S]*?<\/div>/)?.[0] ?? "";
      expect(endRow, "end row starts hidden").toBeTruthy();
      expect(endRow).toMatch(new RegExp(`data-cta="film-end-cloud" href="${loginHref}"`));
      expect(endRow, "no ref= on the login handoff").not.toMatch(new RegExp(`href="${loginHref}\\?`));
      expect(endRow).toContain(cloudLabel);
      expect(endRow).toMatch(/data-cta="film-end-selfhost" href="https:\/\/github\.com\/orbi-build\/orbi"/);
      expect(endRow).toContain(selfhostLabel);
    }
  });

  it("reports 50% and completion once each from each homepage's own dialog script", async () => {
    for (const source of ["site/pages/index.html", "site/pages/zh/index.html"]) {
      const html = await read(source);
      expect(html, `${source}: beacon endpoint`).toContain('sendBeacon("/cloud/e"');
      expect(html).toContain('beacon("film-50")');
      expect(html).toContain('beacon("film-100")');
      expect(html).toContain('addEventListener("ended"');
      expect(html).toContain('addEventListener("timeupdate"');
    }
  });

  it("keeps the film data-cta sets identical across the EN and ZH homepages (Issue #575)", async () => {
    const ctas = async (file) =>
      [...(await read(file)).matchAll(/data-cta="(film-[^"]*)"/g)].map((match) => match[1]).sort();
    expect(await ctas("public/zh/index.html")).toEqual(await ctas("public/index.html"));
  });
});

describe("homepage film button states the film's argument (Issue #607)", () => {
  // The button is a two-line block: the note above says what the film argues
  // — the lights-out belief, releases already shipping, the human merge gate
  // — and the ▶ line below is the original entry. Both spans live inside the
  // <button>, so the whole card is the click target.
  const cases = [
    ["public/index.html", "We're building a lights-out factory for software. It already ships releases, and you keep the merge gate.", "▶ Watch the film · 1:35"],
    ["public/zh/index.html", "我们在造软件的黑灯工厂。它已经在发版本，合并这一步由你把关。", "▶ 观看短片 · 1:35"],
  ];

  for (const [file, note, cta] of cases) {
    it(`${file} carries the note and the ▶ line inside the film button, note first`, async () => {
      const html = await read(file);
      const figure = html.match(/<figure class="factory-trace"[\s\S]*?<\/figure>/)?.[0] ?? "";
      const button = figure.match(/<button[^>]*data-cta="film-play"[\s\S]*?<\/button>/)?.[0] ?? "";
      expect(button, `${file}: the film button holds a note span`).toContain('class="trace-film-note"');
      expect(button, `${file}: the film button holds a ▶ span`).toContain('class="trace-film-cta"');
      expect(button.match(/<span class="trace-film-note">([\s\S]*?)<\/span>/)?.[1], `${file}: note copy verbatim`).toBe(note);
      expect(button.match(/<span class="trace-film-cta">([\s\S]*?)<\/span>/)?.[1], `${file}: ▶ line verbatim`).toBe(cta);
      expect(
        button.indexOf("trace-film-note"),
        `${file}: note precedes the ▶ line`
      ).toBeLessThan(button.indexOf("trace-film-cta"));
    });
  }
});

describe("homepage trace caption removal (Issue #576)", () => {
  const cases = [
    ["public/index.html", "Orbi delivery line: from scope to tagged release"],
    ["public/zh/index.html", "Orbi 交付产线：从范围到打 Tag 发版"],
  ];

  for (const [file, ariaLabel] of cases) {
    it(`${file} names the figure with a non-empty aria-label`, async () => {
      const html = await read(file);

      const figure = html.match(/<figure class="factory-trace"[\s\S]*?<\/figure>/)?.[0] ?? "";
      expect(figure, "figure named by aria-label").toContain(`aria-label="${ariaLabel}"`);
    });
  }
});

describe("cloud merge-gate explainer (Issue #577)", () => {
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
    it(`${file} keeps its language's three sentences below the hero CTA row`, async () => {
      const html = await read(file);
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
