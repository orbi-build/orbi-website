// Issue #972: /compare/codex/ targets readers who are deciding between Orbi and
// Codex. Once decided, the choice card and the closing were self-host only. Both
// regions now offer the Orbi Cloud free trial next to the self-host link, the
// choice card says what Cloud runs for you, and the closing says which button
// self-hosts. The page keeps its #870 title, H1, description and alternatives.
//
// The contract below is pinned on the source and on the built page, because
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
    login: "/cloud/login",
    pagePath: "/compare/codex/",
    cloudLabel: "Try Orbi Cloud free →",
    note: "Orbi Cloud runs this GitHub delivery workflow for you; self-hosting keeps the runner on your own infrastructure.",
    choiceSelfHost: '<a class="button button-outline" href="https://docs.orbi.build">Self-host Orbi ↗</a>',
    closingSelfHost: '<a class="button button-dark" href="https://docs.orbi.build">Self-host Orbi <span aria-hidden="true">↗</span></a>',
    title: "OpenAI Codex alternatives: Orbi vs Codex cloud compared",
    h1: "Orbi vs OpenAI Codex (and other Codex alternatives)",
    description: "OpenAI Codex alternatives compared: how Orbi's self-hosted, GitHub-native delivery differs from Codex cloud, plus six other Codex alternatives.",
    alternatives: true,
  },
  {
    lang: "ZH",
    login: "/zh/cloud/login",
    pagePath: "/zh/compare/codex/",
    cloudLabel: "免费试用 Orbi Cloud →",
    note: "Orbi Cloud 托管运行这套 GitHub 交付流程；自托管则把 Runner 留在你自己的基础设施上。",
    choiceSelfHost: '<a class="button button-outline" href="https://docs.orbi.build/zh">自托管 Orbi ↗</a>',
    closingSelfHost: '<a class="button button-dark" href="https://docs.orbi.build/zh">自托管 Orbi <span aria-hidden="true">↗</span></a>',
    title: "Orbi vs OpenAI Codex：云端编程 agent 对比",
    h1: "Orbi vs OpenAI Codex",
    description: "Orbi 与 OpenAI Codex 云端软件工程 agent 的事实对比：任务入口、沙箱、模型、成本、数据边界，以及什么时候该选哪一个。",
    // Issue #870 scoped the alternatives section to the EN page; the ZH mirror
    // keeps its own section order and only lists the three 2026-09-07 sources.
    alternatives: false,
  },
];

const ALTERNATIVES = [
  "/compare/claude-code/",
  "/compare/jules/",
  "/compare/github-copilot-coding-agent/",
  "/compare/openhands/",
  "/compare/devin/",
  "/compare/cursor/",
];

// The source page body has no nav (site/partials/nav.html is rendered in); the
// built page adds the primary-nav Cloud handoff.
const FILES = (spec) => [
  { file: `site/pages/${spec.lang === "ZH" ? "zh/" : ""}compare/codex/index.html`, logins: 2 },
  { file: `public/${spec.lang === "ZH" ? "zh/" : ""}compare/codex/index.html`, logins: 3 },
];

const section = (html, startMarker) => {
  const start = html.indexOf(startMarker);
  expect(start, `missing ${startMarker}`).toBeGreaterThan(-1);
  const end = html.indexOf("</section>", start);
  expect(end, `unclosed section after ${startMarker}`).toBeGreaterThan(start);
  return html.slice(start, end);
};

const choiceCard = (html) => {
  const match = html.match(/<article class="run-option run-option-cloud">([\s\S]*?)<\/article>/);
  expect(match, "missing the Orbi choice card").not.toBeNull();
  return match[1];
};

describe("Codex page Cloud trial entry (Issue #972)", () => {
  for (const spec of CASES) {
    for (const { file, logins } of FILES(spec)) {
      describe(`${spec.lang} ${file}`, () => {
        it("offers the Cloud trial and the self-host link in the choice card", async () => {
          const html = await read(file);
          const card = choiceCard(html);
          expect(card).toContain(spec.note);
          expect(card).toContain(
            `<a class="button button-signal" data-cta="codex-choice-cloud" href="${spec.login}">${spec.cloudLabel}</a>`,
          );
          expect(card).toContain(spec.choiceSelfHost);
          expect(card.indexOf(spec.note), "the note must come before the buttons").toBeLessThan(
            card.indexOf('data-cta="codex-choice-cloud"'),
          );
        });

        it("offers the Cloud trial and a labelled self-host button in the closing", async () => {
          const html = await read(file);
          const closing = section(html, '<section class="closing shell"');
          expect(closing).toContain(
            `<a class="button button-signal" data-cta="codex-closing-cloud" href="${spec.login}">${spec.cloudLabel}</a>`,
          );
          expect(closing).toContain(spec.closingSelfHost);
          expect(closing).toContain('<a class="button button-outline"');
        });

        it("keeps every login handoff bare and language-prefixed", async () => {
          const html = await read(file);
          const hrefs = [...html.matchAll(/href="(\/(?:zh\/)?cloud\/login[^"]*)"/g)].map((match) => match[1]);
          expect(hrefs).toHaveLength(logins);
          for (const href of hrefs) expect(href).toBe(spec.login);
        });

        it("keeps the #870 title, H1 and description unchanged", async () => {
          const html = await read(file);
          expect(html).toContain(`<title>${spec.title}</title>`);
          expect(html).toContain(`<meta name="description" content="${spec.description}">`);
          expect(html).toContain(`>${spec.h1}</h1>`);
        });

        if (spec.alternatives) {
          it("keeps the six Codex alternatives listed", async () => {
            const html = await read(file);
            const alternatives = section(html, 'id="codex-alternatives"');
            for (const href of ALTERNATIVES) {
              expect(alternatives, `${href} must stay listed`).toContain(`href="${href}"`);
            }
          });
        }
      });
    }
  }

  it("records the page path the engagement beacon reports for a click", async () => {
    for (const spec of CASES) {
      const html = await read(`public/${spec.lang === "ZH" ? "zh/" : ""}compare/codex/index.html`);
      expect(html).toContain(`canonical" href="https://orbi.build${spec.pagePath}"`);
      expect(html).toContain('send("cta_click",link.dataset.cta)');
      expect(html).toContain("path:location.pathname");
    }
  });
});
