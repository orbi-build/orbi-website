// Issue #1457: /cost/ and /zh/cost/ carry an own-volume estimator under the
// 1511-delivery statistics table. What this gate pins is the part a browser
// cannot: the shipped bytes (the artifact the Worker deploys) already show the
// default 30-delivery result before any script runs, and the unit prices live
// in the page's own table — one copy, the one the reader sees — rather than in
// demo.js, which only reads them back out of the marked cells.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(join(ROOT, path), "utf8");

const PAGES = [
  {
    output: "cost/index.html",
    medianLabel: "Median cost per merged delivery",
    p90Label: "P90 cost per merged delivery",
    invalid: "Enter a whole number from 1 to 10000.",
  },
  {
    output: "zh/cost/index.html",
    medianLabel: "每次合并交付成本中位数",
    p90Label: "每次合并交付 P90 成本",
    invalid: "请输入 1 到 10000 之间的整数。",
  },
];

describe("the /cost/ estimator ships its no-JS default (Issue #1457)", () => {
  for (const { output, medianLabel, p90Label, invalid } of PAGES) {
    it(`${output}: renders 30 deliveries off-peak before any script runs`, async () => {
      const html = await read(`public/${output}`);
      expect(html, `${output}: estimator root`).toMatch(/<div class="cost-estimator"[^>]*data-cost-estimator/);
      // The default count the static result belongs to.
      expect(html, `${output}: default count`).toContain('value="30"');
      // The static answer, in the shipped bytes: 30 x 0.081 and 30 x 0.234.
      expect(html, `${output}: median default`).toContain('<strong data-cost-median>$2.43</strong>');
      expect(html, `${output}: high default`).toContain('<strong data-cost-p90>$7.02</strong>');
      // Both price windows exist, off-peak selected by default.
      expect(html, `${output}: off-peak default`).toContain('class="is-selected" data-cost-window="offpeak" aria-pressed="true"');
      expect(html, `${output}: peak toggle`).toContain('data-cost-window="peak"');
      // The out-of-range message the script shows, written in the page.
      expect(html, `${output}: invalid message`).toContain(`data-invalid="${invalid}"`);
    });

    it(`${output}: keeps each unit price in the statistics table itself`, async () => {
      const html = await read(`public/${output}`);
      expect(html, `${output}: median cell`).toContain(
        `<th scope="row">${medianLabel}</th><td data-cost-unit="median">$0.081</td>`,
      );
      expect(html, `${output}: p90 cell`).toContain(
        `<th scope="row">${p90Label}</th><td data-cost-unit="p90">$0.234</td>`,
      );
    });
  }

  it("does not keep a second copy of the unit prices in the script", async () => {
    const script = await read("public/demo.js");
    // Off-peak ($0.081 / $0.234) and the doubled peak values the page's own
    // rule produces ($0.162 / $0.468): none of them may be typed into JS.
    for (const price of ["0.081", "0.234", "0.162", "0.468"]) {
      expect(script, `public/demo.js: hard-coded unit price ${price}`).not.toContain(price);
    }
    expect(script, "public/demo.js: reads the price cells").toContain('[data-cost-unit=');
  });
});
