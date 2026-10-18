// Issue #1003: /compare/codex/ answers "codex cloud vs local" head-on. The page
// compared Codex cloud with Orbi's local runner, but a reader deciding whether
// Codex should run in OpenAI's cloud sandbox or as the local CLI had no section
// that named that choice. This suite pins the new section in both languages: its
// H2 carries the query, its first sentence repeats it, both routes are named,
// Orbi's third option (local execution, unattended Issue-to-merge delivery) is
// stated, every pre-existing section survives, and the outbound /cloud/ link is
// the bare page handoff (no ref — AGENTS.md, Issue #273).
//
// The contract is pinned on the page source and on the built page, because
// public/ is generated (AGENTS.md) and a source-only edit ships nothing.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFile(join(ROOT, file), "utf8");

const CASES = [
  {
    lang: "EN",
    prefix: "",
    // Every H2 the page had before this Issue, in document order, plus the new one.
    headings: [
      "what-title",
      "codex-cloud-vs-local",
      "risk-title",
      "differences-title",
      "codex-cost",
      "codex-api-cost",
      "choice-title",
      "codex-alternatives",
      "sources-title",
      "closing-title",
    ],
    headingTerms: ["cloud", "local"],
    opening: "Codex cloud vs local",
    localAgent: "Codex CLI",
    thirdWay: "unattended",
    cloudHref: "/cloud/",
    guideHref: "/guides/codex-github-issues/",
  },
  {
    lang: "ZH",
    prefix: "zh/",
    headings: [
      "what-title",
      "codex-cloud-vs-local",
      "risk-title",
      "differences-title",
      "codex-cost",
      "codex-api-cost",
      "choice-title",
      "sources-title",
      "closing-title",
    ],
    headingTerms: ["云端还是本地"],
    opening: "Codex 跑云端还是本地",
    localAgent: "Codex CLI",
    thirdWay: "无人值守",
    cloudHref: "/zh/cloud/",
    guideHref: "/zh/guides/codex-github-issues/",
  },
];

const filesOf = (spec) => [
  `site/pages/${spec.prefix}compare/codex/index.html`,
  `public/${spec.prefix}compare/codex/index.html`,
];

// The page's own section headings only: the shared chrome adds its own H2s
// (#related-links-title, the footer subscribe heading), which this Issue does not
// touch.
const SECTIONS = (html) => [...html
  .matchAll(/<h2[^>]*class="[^"]*orbi-(?:compare-section|closing)-h2[^"]*"[^>]*\sid="([^"]+)"/g)]
  .map((match) => match[1]);

function newSection(html) {
  const match = html.match(
    /<section class="[^"]*" aria-labelledby="codex-cloud-vs-local">[\s\S]*?<\/section>/,
  );
  expect(match, "missing the aria-labelledby=\"codex-cloud-vs-local\" section").not.toBeNull();
  return match[0];
}

const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Codex cloud vs local section (Issue #1003)", () => {
  for (const spec of CASES) {
    for (const file of filesOf(spec)) {
      describe(`${spec.lang} ${file}`, () => {
        it("carries the cloud-vs-local query in its H2", async () => {
          const section = newSection(await read(file));
          const heading = section.match(/<h2[^>]*id="codex-cloud-vs-local"[^>]*>([\s\S]*?)<\/h2>/);
          expect(heading, "the new section needs an H2 carrying codex-cloud-vs-local").not.toBeNull();
          const title = textOf(heading[1]).trim();
          for (const term of spec.headingTerms) {
            expect(title.toLowerCase(), `H2 must carry "${term}"`).toContain(term.toLowerCase());
          }
        });

        it("repeats the query in its first sentence and names both routes", async () => {
          const section = newSection(await read(file));
          const opening = section.match(/<p class="section-lede">([\s\S]*?)<\/p>/);
          expect(opening, "the section must open with a section-lede paragraph").not.toBeNull();
          expect(textOf(opening[1]).trim().startsWith(spec.opening), `first sentence: ${spec.opening}`).toBe(true);
          const body = textOf(section);
          expect(body, "the local route is the Codex CLI").toContain(spec.localAgent);
          expect(body, "Codex cloud must be named").toMatch(/Codex cloud|云端沙箱|云沙箱/);
        });

        it("names Orbi's third option: local execution with unattended delivery", async () => {
          const body = textOf(newSection(await read(file)));
          expect(body, "Orbi's option must be stated").toContain("Orbi");
          expect(body, `the third option is "${spec.thirdWay}"`).toContain(spec.thirdWay);
          expect(body, "the delivery line starts from a GitHub Issue").toMatch(/GitHub Issue/);
        });

        it("links the Codex guide and the bare /cloud/ page, without a ref", async () => {
          const section = newSection(await read(file));
          const hrefs = [...section.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
          for (const href of [spec.guideHref, spec.cloudHref]) {
            expect(hrefs, `${href} must be linked from the section`).toContain(href);
          }
          for (const href of hrefs) {
            expect(href, `${href}: no query string on an internal handoff`).not.toContain("?");
            expect(href, `${href}: no ref token`).not.toContain("ref=");
          }
        });

        it("keeps every earlier section and adds exactly this one", async () => {
          expect(SECTIONS(await read(file))).toEqual(spec.headings);
        });
      });
    }
  }

  it("dates the newly cited Codex CLI documentation in the provenance list", async () => {
    for (const spec of CASES) {
      for (const file of filesOf(spec)) {
        const html = await read(file);
        expect(html, `${file}: the CLI docs must be cited`).toContain('href="https://developers.openai.com/codex/cli/"');
        expect(html, `${file}: cited with a verification date`).toMatch(/2026-10-18/);
      }
    }
  });
});
