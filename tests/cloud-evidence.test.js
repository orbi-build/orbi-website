// Issue #1238: beside the Cloud pricing cards, the visitor sees one verifiable
// evidence line (Orbi's own release count and the merged-PR count of the last
// 30 days, linking to /evidence/) and one signed quote. The numbers are written
// at build time and refreshed weekly (site/data/cloud-evidence.json); when a
// number is unavailable the line is not rendered at all — never a 0, never an
// empty shell.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPages } from "../scripts/build-pages.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_PATH = join(ROOT, "site", "data", "cloud-evidence.json");
const SOCIAL_PROOF_PATH = join(ROOT, "site", "data", "social-proof.json");

const PAGES = [
  { output: "cloud/index.html", source: "site/pages/cloud/index.html", evidenceHref: "/evidence/", lang: "en" },
  { output: "zh/cloud/index.html", source: "site/pages/zh/cloud/index.html", evidenceHref: "/zh/evidence/", lang: "zh" },
];

const region = (html, startMarker, endMarker) => {
  const start = html.indexOf(startMarker);
  if (start < 0) return "";
  const end = html.indexOf(endMarker, start);
  return end < 0 ? "" : html.slice(start, end + endMarker.length);
};

const evidenceBlock = (html) => region(html, '<div class="pricing-evidence">', "</div>");

let data;
let quote;
let built;

beforeAll(async () => {
  data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const records = JSON.parse(await readFile(SOCIAL_PROOF_PATH, "utf8"));
  quote = records.find((record) => record.person === "Tommy Xiao");
  built = new Map();
  for (const page of PAGES) {
    built.set(page.output, await readFile(join(ROOT, "public", page.output), "utf8"));
  }
});

describe("Cloud pricing evidence line (Issue #1238)", () => {
  it("ships both numbers from site/data/cloud-evidence.json in each language", () => {
    expect(Number.isInteger(data.releasesShippedByOrbi)).toBe(true);
    expect(Number.isInteger(data.mergedPullRequestsLast30Days)).toBe(true);
    for (const page of PAGES) {
      const block = evidenceBlock(built.get(page.output));
      expect(block, `${page.output}: no .pricing-evidence block`).not.toBe("");
      const line = region(block, '<p class="pricing-evidence-line">', "</p>");
      expect(line, `${page.output}: no evidence line`).not.toBe("");
      expect(line).toContain(String(data.releasesShippedByOrbi));
      expect(line).toContain(String(data.mergedPullRequestsLast30Days));
      expect(line).not.toContain("null");
      expect(line).not.toContain("undefined");
    }
  });

  it("links the line to the evidence page of its own language", () => {
    for (const page of PAGES) {
      const block = evidenceBlock(built.get(page.output));
      const line = region(block, '<p class="pricing-evidence-line">', "</p>");
      expect(line, `${page.output}: the evidence line is not clickable`).toContain(`href="${page.evidenceHref}"`);
    }
  });

  it("carries the signed quote with the person, the role and the public handle", () => {
    expect(quote?.quote, "site/data/social-proof.json lost Tommy Xiao's quote").toBeTruthy();
    expect(quote.person_url).toBe("https://x.com/xds2000");
    for (const page of PAGES) {
      const block = evidenceBlock(built.get(page.output));
      const figure = region(block, '<figure class="pricing-quote">', "</figure>");
      expect(figure, `${page.output}: no quote block`).not.toBe("");
      expect(figure).toContain(quote.quote);
      expect(figure).toContain(quote.person);
      expect(figure).toContain(`href="${quote.person_url}"`);
      expect(figure).toContain(page.lang === "zh" ? "k8e 作者" : "creator of k8e");
    }
  });

  it("sits between the pricing cards and the payment notes of #pricing", () => {
    for (const page of PAGES) {
      const html = built.get(page.output);
      const pricing = region(html, 'id="pricing"', "</section>");
      const at = pricing.indexOf('<div class="pricing-evidence">');
      const cards = pricing.indexOf('<div class="pricing-cards">');
      const notes = pricing.indexOf('class="once-pay-note"');
      expect(at, `${page.output}: no evidence block inside #pricing`).toBeGreaterThan(-1);
      expect(at, `${page.output}: the evidence block precedes the pricing cards`).toBeGreaterThan(cards);
      expect(at, `${page.output}: the evidence block follows the payment notes`).toBeLessThan(notes);
    }
  });

  it("keeps the quote text in one place: the page sources carry the marker, not the quote", async () => {
    for (const page of PAGES) {
      const source = await readFile(join(ROOT, page.source), "utf8");
      expect(source, `${page.source}: missing the <!--@cloud-evidence--> marker`).toContain("<!--@cloud-evidence-->");
      expect(source, `${page.source}: hard-codes the quote instead of reading site/data/social-proof.json`).not.toContain(quote.quote);
      expect(source, `${page.source}: hard-codes the measured numbers`).not.toContain(String(data.mergedPullRequestsLast30Days));
    }
  });
});

describe("the evidence line disappears when a number is unavailable (Issue #1238)", () => {
  let dir;
  let out;
  const buildWith = async (fixture) => {
    dir = await mkdtemp(join(tmpdir(), "orbi-cloud-evidence-"));
    const path = join(dir, "cloud-evidence.json");
    await writeFile(path, JSON.stringify({ quotePerson: "Tommy Xiao", measuredAt: "2026-11-08", ...fixture }));
    out = join(dir, "public");
    await buildPages(out, { cloudEvidencePath: path });
    return readFile(join(out, "cloud/index.html"), "utf8");
  };

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("renders the quote but no line when the release count is not measured", async () => {
    const html = await buildWith({ releasesShippedByOrbi: null, mergedPullRequestsLast30Days: 452 });
    expect(html).not.toContain("pricing-evidence-line");
    expect(html).toContain('class="pricing-quote"');
    // Nothing of the unmeasured number leaks into the block: no "null", no
    // empty shell where the count used to be.
    expect(evidenceBlock(html)).not.toContain("null");
    expect(evidenceBlock(html)).not.toContain("undefined");
  }, 120_000);

  it("renders no line and no stray copy when neither number is measured", async () => {
    const html = await buildWith({ releasesShippedByOrbi: null, mergedPullRequestsLast30Days: null });
    expect(html).not.toContain("pricing-evidence-line");
    expect(html).not.toContain("The record");
    expect(html).toContain('class="pricing-quote"');
  }, 120_000);

  it("fails the build naming the file and the field when a number is not a count", async () => {
    await expect(buildWith({ releasesShippedByOrbi: "140", mergedPullRequestsLast30Days: 452 }))
      .rejects.toThrow(/cloud-evidence\.json[\s\S]*releasesShippedByOrbi/);
  }, 120_000);
});

describe("the shipped pages match a real build (Issue #1238)", () => {
  it("reproduces public/cloud/ from site/ with the evidence block", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbi-cloud-evidence-shipped-"));
    try {
      execFileSync("node", [join(ROOT, "scripts", "build-pages.mjs"), "--out", dir], { timeout: 120_000 });
      for (const page of PAGES) {
        expect(await readFile(join(dir, page.output), "utf8")).toBe(built.get(page.output));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    // A real build through the real entry point takes longer than the default.
  }, 120_000);
});
