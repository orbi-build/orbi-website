// Issue #610: /aiready/ joins the site layout. The page keeps its aiready.sh
// canonical head and its twelve factor headings untouched, and gains the site
// nav/footer, content-page article typography, and chrome links that all land
// on orbi.build when the page is served from aiready.sh.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { handleFetch } from "../src/worker.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUTPUTS = ["aiready/index.html", "aiready/zh/index.html"];

const read = (output) => readFile(join(ROOT, "public", output), "utf8");
const rendered = (html) => html.replace(/<!--[\s\S]*?-->/g, "");
const region = (html, startMarker, endMarker) => {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  if (start < 0 || end < 0) return "";
  return html.slice(start, end + endMarker.length);
};
const navRegion = (html) => region(html, "<nav id=", "</nav>");
const footerRegion = (html) => region(html, '<footer class="site-footer shell">', "</footer>");
const chromeLinks = (html) =>
  [...(navRegion(html) + footerRegion(html)).matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
const factorTitles = (html) =>
  [...rendered(html).matchAll(/<article><h3>([^<]+)<\/h3>/g)].map((match) => match[1]);

// The twelve factor headings exactly as they shipped before the layout change;
// the Issue forbids touching them.
const FACTORS_EN = [
  "1. One Issue, one runtime outcome.",
  "2. Acceptance is written before the work, in the Issue.",
  "3. Dependencies are native relations, not prose.",
  "4. One label is the execution switch; state lives only in labels.",
  "5. Issue text is data, never instructions.",
  "6. The contract lives in the repository; identity lives on the host.",
  "7. CI is the only test authority.",
  "8. Coverage is a gate, line and branch measured separately.",
  "9. The default branch is protected and only the runner merges.",
  "10. Review is a second session, and its verdict is bound to one SHA.",
  "11. Every loop has a limit, and beyond the limit is a human decision.",
  "12. A release is a state machine, not a script.",
];
const FACTORS_ZH = [
  "1. 一个 Issue，一个运行时结果。",
  "2. 工作开始前，Acceptance 就写在 Issue 里。",
  "3. 依赖关系必须是平台原生关系，而不是文字。",
  "4. 一个 label 是执行开关，状态只存在于 labels。",
  "5. Issue 文本是数据，不是指令。",
  "6. 契约在仓库里，身份在主机上。",
  "7. CI 是唯一的测试权威。",
  "8. Coverage 是门禁，行和分支分别测量。",
  "9. 默认分支受保护，只有 Runner 能合并。",
  "10. 评审是第二个 session，结论绑定一个 SHA。",
  "11. 每个循环都有上限，超过上限由人决定。",
  "12. 发版是状态机，不是脚本。",
];

// Chrome links must lead back to the site (orbi.build) or to real external
// pages — never to a path on aiready.sh, where only /, /zh, /install.sh and
// /badge.svg exist (src/worker.js aireadyResponse). The footer guides row
// (Issue #611) lists the ai-ready page itself, so the one allowed aiready.sh
// chrome link is the page's own address.
function expectChromeLinksOnOrbi(html, output) {
  for (const href of chromeLinks(html)) {
    if (href.startsWith("/")) {
      expect(href, `${output}: relative chrome link must be the login handoff`).toBe("/api/login");
      continue;
    }
    expect(href, `${output}: chrome link must be absolute`).toMatch(/^https?:\/\//);
    if (/^https?:\/\/aiready\.sh/.test(href)) {
      expect(href, `${output}: the only aiready.sh chrome link is the page itself`).toMatch(
        /^https?:\/\/aiready\.sh(\/zh)?\/$/,
      );
      continue;
    }
    expect(href, `${output}: chrome link must not point at aiready.sh`).not.toMatch(/^https?:\/\/aiready\.sh/);
  }
}

describe("aiready pages use the site layout (Issue #610)", () => {
  it("drops the standalone flag and renders nav params on both sources", async () => {
    for (const source of ["site/pages/aiready/index.html", "site/pages/aiready/zh/index.html"]) {
      const src = await readFile(join(ROOT, source), "utf8");
      expect(src, `${source}: standalone must go`).not.toContain("standalone");
      expect(src, `${source}: site nav params`).toContain('"nav"');
    }
  });

  it("renders the site navigation and footer with article typography", async () => {
    for (const output of OUTPUTS) {
      const html = await read(output);
      expect(navRegion(html), `${output}: site nav`).toContain('id="primary-navigation"');
      expect(footerRegion(html), `${output}: site footer`).not.toBe("");
      expect(chromeLinks(html).length, `${output}: chrome link count`).toBeGreaterThan(20);
      expect(html, `${output}: hero-lede must not come back`).not.toContain("hero-lede");
      expect(html, `${output}: eyebrow chrome must not come back`).not.toContain('class="eyebrow"');
      expect(html, `${output}: external arrow on an internal link`).not.toContain("↗");
      expect(html, `${output}: reading width on the post body contract`).toMatch(
        /\.post-body\s*\{[^}]*max-width:\s*52rem/,
      );
      expect(html, `${output}: mobile menu script`).toContain('src="/demo.js"');
    }
  });

  it("keeps exactly one H1 and the aiready.sh canonical head", async () => {
    for (const [output, canonical] of [
      ["aiready/index.html", "https://aiready.sh/"],
      ["aiready/zh/index.html", "https://aiready.sh/zh/"],
    ]) {
      const html = rendered(await read(output));
      expect(html.match(/<h1\b/gi), `${output}: H1 count`).toHaveLength(1);
      expect(html, `${output}: canonical`).toContain(`<link rel="canonical" href="${canonical}">`);
      expect(html, `${output}: hreflang en`).toContain('<link rel="alternate" hreflang="en" href="https://aiready.sh/">');
      expect(html, `${output}: hreflang zh-CN`).toContain('<link rel="alternate" hreflang="zh-CN" href="https://aiready.sh/zh/">');
      expect(html, `${output}: hreflang x-default`).toContain('<link rel="alternate" hreflang="x-default" href="https://aiready.sh/">');
    }
  });

  it("keeps the twelve factor headings byte-identical", async () => {
    expect(factorTitles(await read("aiready/index.html"))).toEqual(FACTORS_EN);
    expect(factorTitles(await read("aiready/zh/index.html"))).toEqual(FACTORS_ZH);
  });

  it("points every nav and footer link at orbi.build or a real external page", async () => {
    for (const output of OUTPUTS) {
      expectChromeLinksOnOrbi(await read(output), output);
    }
  });

  it("serves the same chrome from aiready.sh and forwards the login handoff", async () => {
    for (const [path, output] of [["/", "aiready/index.html"], ["/zh/", "aiready/zh/index.html"]]) {
      const page = await read(output);
      const assets = {
        fetch: async (request) =>
          new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
      };
      const response = await handleFetch(
        new Request(`https://aiready.sh${path}`, { headers: { Accept: "text/html" } }),
        { ASSETS: assets },
      );
      expect(response.status, path).toBe(200);
      expectChromeLinksOnOrbi(await response.text(), `aiready.sh${path}`);
    }
    const assets = { fetch: async () => new Response("missing", { status: 404 }) };
    const login = await handleFetch(new Request("https://aiready.sh/api/login"), { ASSETS: assets });
    expect(login.status).toBe(302);
    expect(login.headers.get("location")).toBe("https://orbi.build/api/login");
  });
});
