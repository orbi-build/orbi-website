// Issue #577: the Cloud merge-gate explainer is unrelated to the homepage
// film removed by Issue #704 and keeps its existing coverage.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFile(join(ROOT, file), "utf8");

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
