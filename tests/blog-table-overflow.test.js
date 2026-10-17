import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoExternalRequests, guardedPage } from "./browser-network.mjs";
import { buildPages } from "../scripts/build-pages.mjs";

const existingRoutes = [
  "/blog/",
  "/blog/claude-code-github-actions-who-merges/",
  "/blog/docker-image-third-try/",
  "/blog/watch-the-six-steps/",
  "/blog/what-autonomous-actually-means/",
  "/blog/run-claude-code-unattended/",
  "/zh/blog/run-claude-code-unattended/",
  "/zh/blog/claude-code-github-actions-who-merges/",
  "/zh/blog/docker-image-third-try/",
  "/zh/blog/watch-the-six-steps/",
  "/zh/blog/what-autonomous-actually-means/",
];
const widths = [390, 1440];
const inlineCodeWidths = [360, 375, 390];
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8" };
let browser;
let fixtureRoot;
let server;
let origin;

async function serve(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\/|\\)+/, "");
  if (relative.split("/").includes("..")) return null;
  const direct = join(fixtureRoot, relative || "index.html");
  const directFile = await readFile(direct).catch(() => null);
  if (directFile !== null) return [direct, directFile];
  const index = join(direct, "index.html");
  const indexFile = await readFile(index).catch(() => null);
  return indexFile === null ? null : [index, indexFile];
}

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), "orbi-blog-table-"));
  const contentDir = join(root, "content");
  fixtureRoot = join(root, "public");
  await cp(join("content", "blog"), contentDir, { recursive: true });
  const row = `| ${"unbreakable".repeat(12)} | ${"wide".repeat(30)} |`;
  const table = `| Column A | Column B |\n| --- | --- |\n${row}`;
  await writeFile(join(contentDir, "table-fixture.md"), `---\ntitle: Table fixture\ndate: 2026-09-22\nsummary: Five deliberately wide tables\nlang: en\nauthor: Lawrence Liu\nimage: /img/og.png\n---\n\n${Array(5).fill(table).join("\n\n")}\n`);
  await buildPages(fixtureRoot, { contentDir });
  await cp(join("public", "styles.css"), join(fixtureRoot, "styles.css"));
  // Issue #975: the comparison matrix's arrow-key scrolling is demo.js behavior
  // (the build never writes that hand-written file), so the fixture has to ship
  // the real script the deployed page loads — the same contract as styles.css.
  await cp(join("public", "demo.js"), join(fixtureRoot, "demo.js"));
  // Issue #585: pages load their webfont from the self-hosted /fonts/fonts.css
  // instead of the live fonts.googleapis.com stylesheet the fixture used to
  // reach over the network. Ship the fonts with the fixture so the headings
  // here measure against the real brand font, the same bytes production uses.
  await cp(join("public", "fonts"), join(fixtureRoot, "fonts"), { recursive: true });

  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/pricing/") {
      response.writeHead(302, { location: "/cloud/#pricing" });
      response.end();
      return;
    }
    const file = await serve(pathname);
    if (!file) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "content-type": types[extname(file[0])] ?? "application/octet-stream" });
    response.end(file[1]);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
  if (fixtureRoot) await rm(join(fixtureRoot, ".."), { recursive: true, force: true });
  assertNoExternalRequests();
});

async function overflowAt(route, width) {
  const page = await guardedPage(browser, origin, { viewport: { width, height: 900 } });
  try {
    await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
    return await page.evaluate(() => {
      const de = document.documentElement;
      const tables = [...document.querySelectorAll(".post-body table")];
      return {
        overflow: de.scrollWidth - de.clientWidth,
        tableCount: tables.length,
        wrappersAreExactParents: tables.every((table) => table.parentElement?.classList.contains("post-table-scroll")),
        scrollableWrappers: [...document.querySelectorAll(".post-table-scroll")]
          .filter((wrapper) => wrapper.scrollWidth > wrapper.clientWidth).length,
      };
    });
  } finally {
    await page.close();
  }
}

async function inlineCodeLayoutAt(route, width) {
  const page = await guardedPage(browser, origin, { viewport: { width, height: 900 } });
  try {
    await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
    return await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      singleTokenRects: [...document.querySelectorAll(".post-body p code, .post-body li code")]
        .filter((code) => !/\s/.test(code.textContent))
        .map((code) => ({ text: code.textContent, rects: code.getClientRects().length })),
      preWhiteSpaces: [...document.querySelectorAll(".post-body pre code")]
        .map((code) => getComputedStyle(code).whiteSpace),
    }));
  } finally {
    await page.close();
  }
}

async function blogLayoutAt(route, width) {
  const page = await guardedPage(browser, origin, { viewport: { width, height: 900 } });
  try {
    await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
    return await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      entries: [...document.querySelectorAll(".post-entry")].map((entry) => {
        const title = entry.querySelector(".post-entry-title");
        const summary = entry.querySelector(".post-entry-summary");
        const titleStyle = getComputedStyle(title);
        return {
          titleWidth: title.getBoundingClientRect().width,
          summaryWidth: summary.getBoundingClientRect().width,
          titleHeight: title.getBoundingClientRect().height,
          titleLineHeight: Number.parseFloat(titleStyle.lineHeight),
          titleText: title.textContent.trim(),
        };
      }),
    }));
  } finally {
    await page.close();
  }
}

async function constrainedHeadingAt(route, selector, ch) {
  const page = await guardedPage(browser, origin, { viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
    return await page.locator(selector).first().evaluate((heading, expectedCh) => {
      const expected = document.createElement("span");
      const style = getComputedStyle(heading);
      expected.style.cssText = `position:absolute; width:${expectedCh}ch; font:${style.font};`;
      document.body.append(expected);
      const expectedWidth = expected.getBoundingClientRect().width;
      expected.remove();
      return {
        maxWidth: Number.parseFloat(getComputedStyle(heading).maxWidth),
        width: heading.getBoundingClientRect().width,
        expectedWidth,
      };
    }, ch);
  } finally {
    await page.close();
  }
}

async function postCtaAt(route, width) {
  const page = await guardedPage(browser, origin, { viewport: { width, height: 900 } });
  try {
    await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
    return await page.locator(".post-cta").evaluate((cta) => {
      const button = cta.querySelector('[data-cta="post-start"]');
      const selfHost = cta.querySelector('[data-cta="post-selfhost"]');
      const buttonStyle = getComputedStyle(button);
      return {
        buttonColor: buttonStyle.color,
        buttonDecoration: buttonStyle.textDecorationLine,
        buttonWidth: button.getBoundingClientRect().width,
        contentWidth: cta.clientWidth
          - Number.parseFloat(getComputedStyle(cta).paddingLeft)
          - Number.parseFloat(getComputedStyle(cta).paddingRight),
        selfHostColor: getComputedStyle(selfHost).color,
      };
    });
  } finally {
    await page.close();
  }
}

describe("post registration CTA (Issue #732)", () => {
  // Same 30s budget as the other browser tests (e8f46993, #838): this `it`
  // walks four routes, so vitest's 5s default timed it out on CI three times
  // on 2026-10-05. The third-party badges that used to decide that budget are
  // answered locally by the guard in browser-network.mjs (Issue #871).
  it("preserves the homepage button treatment and readable night-surface link in both languages", async () => {
    for (const route of ["/blog/run-claude-code-unattended/", "/zh/blog/run-claude-code-unattended/"]) {
      const desktop = await postCtaAt(route, 1440);
      expect(desktop.buttonColor, `${route}: button label`).toBe("rgb(6, 21, 27)");
      expect(desktop.buttonDecoration, `${route}: button decoration`).toBe("none");
      expect(desktop.selfHostColor, `${route}: self-host link`).toBe("rgb(237, 245, 240)");

      const mobile = await postCtaAt(route, 390);
      expect(mobile.buttonWidth, `${route}: full-width mobile button`).toBeCloseTo(mobile.contentWidth, 0);
    }
  }, 30_000);
});

describe("blog titles use the post entry width (Issue #401)", () => {
  it("matches title and summary widths in both languages and keeps long English titles on one line", async () => {
    for (const route of ["/blog/", "/zh/blog/"]) {
      const result = await blogLayoutAt(route, 1440);
      expect(result.overflow, `${route} at desktop document overflow`).toBe(0);
      for (const entry of result.entries) {
        expect(entry.titleWidth, `${route} title width for ${entry.titleText}`).toBeCloseTo(entry.summaryWidth, 1);
      }
      if (route === "/blog/") {
        for (const title of [
          "The engine waited for an answer users could not give",
          "What an autonomous coding agent does when it says no",
        ]) {
          const entry = result.entries.find((candidate) => candidate.titleText === title);
          expect(entry, `missing title ${title}`).toBeDefined();
          expect(entry.titleHeight, `${title} should fit on one line`).toBeLessThanOrEqual(entry.titleLineHeight + 1);
        }
      }
    }
  }, 30_000);

  it("wraps narrow titles without document overflow", async () => {
    for (const route of ["/blog/", "/zh/blog/"]) {
      const result = await blogLayoutAt(route, 390);
      expect(result.overflow, `${route} at mobile document overflow`).toBe(0);
      expect(result.entries.some((entry) => entry.titleHeight > entry.titleLineHeight + 1)).toBe(true);
    }
  }, 30_000);

  it("keeps the recorded desktop heading widths on compare, cloud, pricing, FAQ, and closing", async () => {
    const cases = [
      ["/compare/", ".compare-section h2", 26, 702],
      ["/cloud/", ".compare-section h2", 26, 702],
      ["/pricing/", ".compare-section h2", 26, 702],
      ["/", ".faq h2", 24, 648],
      ["/", ".closing h2", 22, 594],
    ];
    for (const [route, selector, ch, productionWidth] of cases) {
      const result = await constrainedHeadingAt(route, selector, ch);
      expect(result.maxWidth, `${route} ${selector}: explicit ${ch}ch rule`).toBeCloseTo(result.expectedWidth, 1);
      expect(result.width, `${route} ${selector}: rendered width`).toBeCloseTo(result.expectedWidth, 1);
      // CI's fallback font is up to 6px narrower than the production webfont.
      expect(Math.abs(result.width - productionWidth), `${route} ${selector}: production baseline`).toBeLessThanOrEqual(6);
    }
  }, 30_000);
});

describe("inline blog code stays readable on mobile (Issue #689)", () => {
  it("keeps single-token code together and the document within the viewport", async () => {
    for (const route of ["/blog/run-claude-code-unattended/", "/zh/blog/run-claude-code-unattended/"]) {
      for (const width of inlineCodeWidths) {
        const result = await inlineCodeLayoutAt(route, width);
        expect(result.overflow, `${route} at ${width}px document overflow`).toBe(0);
        for (const entry of result.singleTokenRects) {
          expect(entry.rects, `${route} at ${width}px: ${entry.text}`).toBe(1);
        }
        expect(result.preWhiteSpaces, `${route} at ${width}px pre whitespace`).toEqual(
          result.preWhiteSpaces.map(() => "pre"),
        );
      }
    }
  }, 30_000);
});

describe("blog tables stay within the viewport (Issue #393, #522)", () => {
  it("contains the fixture tables in their wrappers on mobile, scrolls them on desktop (Issue #526)", async () => {
    const mobile = await overflowAt("/blog/table-fixture/", 390);
    expect(mobile.overflow, "table fixture at 390px document overflow").toBe(0);
    expect(mobile.tableCount).toBe(5);
    expect(mobile.wrappersAreExactParents).toBe(true);
    // Issue #526: table-form cells use break-word, which never splits an
    // ordinary word mid-word. Issue #975 caps every article column at 12.5rem
    // on phones, so the fixture's 132-character unbreakable tokens — far wider
    // than any real word — wrap inside their capped columns instead of
    // pushing one column to thousands of pixels; two capped columns fit the
    // phone, so nothing is left to scroll. The document never overflows.
    expect(mobile.scrollableWrappers, "table fixture at 390px scrollable wrappers").toBe(0);
    const desktop = await overflowAt("/blog/table-fixture/", 1440);
    expect(desktop.overflow, "table fixture at 1440px document overflow").toBe(0);
    expect(desktop.scrollableWrappers, "table fixture at 1440px scrollable wrappers").toBe(5);
  }, 30_000);

  // One test per route: 11 routes x 2 widths in a single 30s budget timed out on CI.
  it.each(existingRoutes)("keeps %s free of document overflow", async (route) => {
    for (const width of widths) {
      const result = await overflowAt(route, width);
      expect(result.overflow, `${route} at ${width}px document overflow`).toBe(0);
    }
  }, 30_000);
});


// Issue #975: on a phone an article table keeps its column headers, pins its
// first column on opaque paper and scrolls the remaining columns inside the
// article width — instead of the 30 stacked cells the #522/#526 stacking
// produced for the YOLO matrix. This is every article table's default; no post
// declares it. The hint and the scroll region's label are localized, the
// region is reachable and left with the keyboard, and the arrow keys scroll
// it. Baseline of the pre-#975 layout in this environment, measured with
// the same headless Chromium: table 2922px tall at 390, one action row 487px,
// class `table-stack`, `thead` display none.
const yoloMatrixRoutes = [
  ["/blog/claude-code-yolo-mode/", "Swipe horizontally to see all columns."],
  ["/zh/blog/claude-code-yolo-mode/", "左右滑动查看所有列。"],
];

async function matrixAt(route, width) {
  const page = await guardedPage(browser, origin, { viewport: { width, height: 844 } });
  try {
    await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
    return await page.evaluate(() => {
      const wrapper = document.querySelector(".post-body .post-table-scroll");
      const table = wrapper?.querySelector("table.table-comparison");
      const hint = document.querySelector(".post-body p.post-table-hint");
      const head = table?.querySelector("thead");
      const rect = (element) => {
        const box = element.getBoundingClientRect();
        return {
          top: Math.round(box.top),
          left: Math.round(box.left),
          right: Math.round(box.right),
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      };
      // The cell's own box and the box its text actually painted into: a cell
      // whose words overflow or clip would show a text rect outside its box.
      const textBox = (element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const box = range.getBoundingClientRect();
        return { textLeft: Math.round(box.left), textRight: Math.round(box.right), textWidth: Math.round(box.width), textHeight: Math.round(box.height) };
      };
      const cell = (element) => {
        const style = getComputedStyle(element);
        return {
          text: element.textContent.trim(),
          scope: element.getAttribute("scope"),
          position: style.position,
          weight: style.fontWeight,
          background: style.backgroundColor,
          ...rect(element),
          ...textBox(element),
        };
      };
      // "The matrix adds no page-wide overflow" measured, never assumed: the
      // document width with the matrix and with it hidden must be the same, so
      // the reading does not depend on this machine's fonts.
      const withMatrix = document.documentElement.scrollWidth;
      table.style.display = "none";
      const withoutMatrix = document.documentElement.scrollWidth;
      table.style.display = "";
      return {
        hintText: hint?.textContent.trim() ?? null,
        hintVisible: hint ? getComputedStyle(hint).display !== "none" : false,
        tabIndex: wrapper?.getAttribute("tabindex") ?? null,
        role: wrapper?.getAttribute("role") ?? null,
        ariaLabel: wrapper?.getAttribute("aria-label") ?? null,
        tableClass: table?.className ?? null,
        theadVisible: head ? head.getBoundingClientRect().height > 0 : false,
        headers: [...(head?.querySelectorAll("th") ?? [])].map((heading) => ({
          text: heading.textContent.trim(),
          scope: heading.getAttribute("scope"),
          ...rect(heading),
          ...textBox(heading),
        })),
        headlineBackground: head?.querySelector("th") ? getComputedStyle(head.querySelector("th")).backgroundColor : null,
        paperBackground: getComputedStyle(document.body).backgroundColor,
        tableHeight: table ? Math.round(table.getBoundingClientRect().height) : null,
        fontSize: table ? getComputedStyle(table).fontSize : null,
        bodyFontSize: getComputedStyle(document.body).fontSize,
        wrapper: wrapper ? {
          ...rect(wrapper),
          clientWidth: wrapper.clientWidth,
          scrollWidth: wrapper.scrollWidth,
        } : null,
        rows: [...(table?.querySelectorAll("tbody tr") ?? [])].map((row) => [...row.children].map(cell)),
        documentOverflowAdded: withMatrix - withoutMatrix,
      };
    });
  } finally {
    await page.close();
  }
}

describe("article comparison matrix on phones (Issue #975)", () => {
  it.each(yoloMatrixRoutes)("keeps %s a six-row matrix with visible headers and a pinned action column", async (route, hint) => {
    const matrix = await matrixAt(route, 390);
    expect(matrix.tableClass, `${route} table class`).toBe("table-comparison");
    expect(matrix.theadVisible, `${route} column headers visible`).toBe(true);
    expect(matrix.headers.map((heading) => heading.scope)).toEqual(Array(6).fill("col"));
    // Each column header paints its words inside its own cell — "the headers
    // stay visible" read from the rendering, not from a class alone.
    for (const heading of matrix.headers) {
      expect(heading.textWidth, `${route} header "${heading.text}" painted width`).toBeGreaterThan(0);
      expect(heading.textLeft, `${route} header "${heading.text}" inside its cell`).toBeGreaterThanOrEqual(heading.left - 1);
      expect(heading.textRight, `${route} header "${heading.text}" inside its cell`).toBeLessThanOrEqual(heading.right + 1);
    }
    expect(matrix.headers.at(-1).text, `${route} last mode`).toBe("bypassPermissions");
    expect(matrix.rows).toHaveLength(6);
    expect(matrix.rows.map((row) => row[0].scope)).toEqual(Array(6).fill("row"));
    // Six actions, each on its own line, all five results of one action aligned.
    expect(new Set(matrix.rows.map((row) => row[0].top)).size, `${route} one row per action`).toBe(6);
    matrix.rows.forEach((row, index) => {
      const action = row[0];
      const results = row.slice(1);
      // The pre-#975 layout stacked each action into ~487px; a row here is one
      // line of results plus the wrapped action label, never a card.
      expect(action.height, `${route} action ${index} row height`).toBeLessThan(200);
      expect(new Set(results.map((result) => result.top)).size, `${route} action ${index} results on one line`).toBe(1);
      expect(results.map((result) => result.left)).toEqual(results.map((result) => result.left).toSorted((a, b) => a - b));
      // Every result is painted, inside its own cell: the words are neither
      // clipped away nor overflowing into the next column.
      for (const result of [action, ...results]) {
        expect(result.textWidth, `${route} "${result.text}" painted width`).toBeGreaterThan(0);
        expect(result.textHeight, `${route} "${result.text}" painted height`).toBeGreaterThan(0);
        expect(result.textLeft, `${route} "${result.text}" inside its cell`).toBeGreaterThanOrEqual(result.left - 1);
        expect(result.textRight, `${route} "${result.text}" inside its cell`).toBeLessThanOrEqual(result.right + 1);
      }
    });
    // The action column is pinned and never eats the whole visible area, so at
    // least one complete result column is visible without scrolling.
    expect(matrix.rows[0][0].position, `${route} pinned action column`).toBe("sticky");
    expect(matrix.rows[0][0].background, `${route} opaque paper ground`).toBe(matrix.paperBackground);
    expect(matrix.rows[0][0].width, `${route} pinned column width`).toBeLessThan(matrix.wrapper.clientWidth * 0.6);
    const visible = matrix.rows[0].slice(1).filter((result) => result.left >= matrix.wrapper.left + matrix.rows[0][0].width - 1 && result.right <= matrix.wrapper.right + 1);
    expect(visible.length, `${route} complete result column visible`).toBeGreaterThanOrEqual(1);
    expect(matrix.wrapper.scrollWidth, `${route} more columns to the right`).toBeGreaterThan(matrix.wrapper.clientWidth);
    // 2922px was the stacked table's measured height at 390 before this Issue.
    expect(matrix.tableHeight, `${route} matrix height`).toBeLessThan(1000);
    // Readability is not bought with a smaller type: the matrix keeps the page's
    // own body size, and no result was hidden to make it fit.
    expect(matrix.fontSize, `${route} matrix type size`).toBe(matrix.bodyFontSize);
    expect(matrix.documentOverflowAdded, `${route} page overflow added by the matrix`).toBe(0);
    expect(matrix.hintVisible, `${route} swipe hint`).toBe(true);
    expect(matrix.hintText, `${route} swipe hint copy`).toBe(hint);
    expect(matrix.ariaLabel, `${route} scroll region label`).toBe(hint);
    expect(matrix.role, `${route} scroll region role`).toBe("region");
    expect(matrix.tabIndex, `${route} scroll region tabindex`).toBe("0");
  }, 30_000);

  it.each(yoloMatrixRoutes)("scrolls %s to the last mode with the pinned action column still readable", async (route) => {
    const page = await guardedPage(browser, origin, { viewport: { width: 390, height: 844 } });
    try {
      await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
      const scrolled = await page.evaluate(() => {
        const wrapper = document.querySelector(".post-body .post-table-scroll");
        wrapper.scrollLeft = wrapper.scrollWidth;
        const box = (element) => {
          const rect = element.getBoundingClientRect();
          return { left: Math.round(rect.left), right: Math.round(rect.right), text: element.textContent.trim() };
        };
        return {
          scrollLeft: wrapper.scrollLeft,
          wrapper: box(wrapper),
          pinned: box(wrapper.querySelector("tbody th")),
          lastHeader: box(wrapper.querySelectorAll("thead th")[5]),
          lastColumn: [...wrapper.querySelectorAll("tbody tr")].map((row) => box(row.children[5])),
        };
      });
      expect(scrolled.scrollLeft, `${route} scrolled to the end`).toBeGreaterThan(0);
      expect(scrolled.pinned.text, `${route} pinned column text`).not.toBe("");
      expect(scrolled.lastHeader.text, `${route} last header`).toBe("bypassPermissions");
      expect(scrolled.lastHeader.left, `${route} last header not under the pinned column`).toBeGreaterThanOrEqual(scrolled.pinned.right - 1);
      expect(scrolled.lastHeader.right, `${route} last header inside the article`).toBeLessThanOrEqual(scrolled.wrapper.right + 1);
      for (const result of scrolled.lastColumn) {
        expect(result.left, `${route} "${result.text}" not under the pinned column`).toBeGreaterThanOrEqual(scrolled.pinned.right - 1);
        expect(result.right, `${route} "${result.text}" inside the article`).toBeLessThanOrEqual(scrolled.wrapper.right + 1);
      }
    } finally {
      await page.close();
    }
  }, 30_000);

  it.each(yoloMatrixRoutes)("keeps the pinned action column on an opaque paper ground on %s", async (route) => {
    const page = await guardedPage(browser, origin, { viewport: { width: 390, height: 844 } });
    try {
      await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
      const scrolled = await page.evaluate(() => {
        const wrapper = document.querySelector(".post-body .post-table-scroll");
        wrapper.scrollLeft = wrapper.scrollWidth;
        return wrapper.scrollLeft;
      });
      expect(scrolled, `${route} matrix scrolled under the pinned column`).toBeGreaterThan(0);
      await page.locator(".post-body .post-table-scroll").scrollIntoViewIfNeeded();
      const shot = await page.evaluate(() => {
        const wrapper = document.querySelector(".post-body .post-table-scroll");
        const head = wrapper.querySelector("thead");
        const box = wrapper.getBoundingClientRect();
        const cell = wrapper.querySelector("tbody th").getBoundingClientRect();
        const x = Math.max(0, Math.round(box.left));
        const y = Math.max(0, Math.round(box.top));
        return {
          clip: { x, y, width: Math.min(Math.round(cell.width), window.innerWidth - x), height: Math.min(Math.round(box.height), 300, window.innerHeight - y) },
          sampleX: 3,
          sampleY: Math.round(head.getBoundingClientRect().height) + 10,
          paper: getComputedStyle(document.body).backgroundColor,
        };
      });
      // Pixel readings, not class assertions: a 12px-inset point inside the
      // pinned action cell must be the opaque page paper, and making that
      // ground transparent must expose the columns scrolled underneath it — if
      // it were see-through already, nothing would change.
      const opaque = (await page.screenshot({ clip: shot.clip })).toString("base64");
      await page.addStyleTag({ content: ".post-body .table-comparison tbody th { background: transparent !important; }" });
      const transparent = (await page.screenshot({ clip: shot.clip })).toString("base64");
      const pixels = await page.evaluate(async ([before, after, sampleX, sampleY]) => {
        const load = async (base64) => {
          const response = await fetch("data:image/png;base64," + base64);
          const bitmap = await createImageBitmap(await response.blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext("2d");
          context.drawImage(bitmap, 0, 0);
          return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
        };
        const [one, two] = await Promise.all([load(before), load(after)]);
        let revealed = 0;
        for (let i = 0; i < one.data.length; i += 4) {
          const delta = Math.abs(one.data[i] - two.data[i]) + Math.abs(one.data[i + 1] - two.data[i + 1]) + Math.abs(one.data[i + 2] - two.data[i + 2]);
          if (delta > 120) revealed += 1;
        }
        const at = (x, y) => { const i = (y * one.width + x) * 4; return [one.data[i], one.data[i + 1], one.data[i + 2]]; };
        return { revealed, sample: at(sampleX, sampleY) };
      }, [opaque, transparent, shot.sampleX, shot.sampleY]);
      expect(pixels.sample, `${route} pinned cell ground`).toEqual(shot.paper.match(/\d+/g).map(Number));
      expect(pixels.revealed, `${route} pixels the opaque ground hides`).toBeGreaterThan(250);
    } finally {
      await page.close();
    }
  }, 30_000);

  it.each(yoloMatrixRoutes)("reaches %s from the keyboard, scrolls it with the arrow keys and lets Tab leave", async (route) => {
    const page = await guardedPage(browser, origin, { viewport: { width: 390, height: 844 } });
    try {
      await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
      await page.evaluate(() => {
        const wrapper = document.querySelector(".post-body .post-table-scroll");
        const focusables = [...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")]
          .filter((element) => element !== wrapper && element.tabIndex >= 0);
        const previous = focusables.filter((element) => wrapper.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING).at(-1);
        previous.focus();
      });
      let focused = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await page.keyboard.press("Tab");
        focused = await page.evaluate(() => {
          const active = document.activeElement;
          const style = getComputedStyle(active);
          return {
            isRegion: active.classList.contains("post-table-scroll"),
            focusVisible: active.matches(":focus-visible"),
            outlineStyle: style.outlineStyle,
            outlineWidth: Number.parseFloat(style.outlineWidth),
          };
        });
        if (focused.isRegion) break;
      }
      expect(focused.isRegion, `${route} Tab reaches the scroll region`).toBe(true);
      expect(focused.focusVisible, `${route} focus indicator`).toBe(true);
      expect(focused.outlineStyle, `${route} visible outline`).not.toBe("none");
      expect(focused.outlineWidth, `${route} outline width`).toBeGreaterThan(0);

      const before = await page.evaluate(() => document.querySelector(".post-body .post-table-scroll").scrollLeft);
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      const after = await page.evaluate(() => document.querySelector(".post-body .post-table-scroll").scrollLeft);
      expect(after, `${route} ArrowRight scrolls the matrix`).toBeGreaterThan(before);

      await page.keyboard.press("Tab");
      const stillInRegion = await page.evaluate(() => document.activeElement?.classList.contains("post-table-scroll") ?? false);
      expect(stillInRegion, `${route} Tab leaves the scroll region`).toBe(false);
    } finally {
      await page.close();
    }
  }, 30_000);

  it.each(yoloMatrixRoutes)("hides the swipe hint and keeps the desktop table form on %s at 1440", async (route) => {
    const matrix = await matrixAt(route, 1440);
    expect(matrix.tableClass).toBe("table-comparison");
    expect(matrix.hintVisible, `${route} hint hidden on desktop`).toBe(false);
    expect(matrix.wrapper.scrollWidth, `${route} no sideways scroll on desktop`).toBeLessThanOrEqual(matrix.wrapper.clientWidth + 1);
    expect(matrix.rows).toHaveLength(6);
    for (const row of matrix.rows) {
      // <th scope="row"> must read like the plain first column it replaces:
      // normal weight on the page's own paper, never the header fill.
      expect(row[0].weight, `${route} row header weight`).toBe("400");
      expect(row[0].background, `${route} row header background`).toBe(matrix.paperBackground);
    }
    expect(matrix.headlineBackground, `${route} column header fill unchanged`).not.toBe(matrix.paperBackground);
    expect(matrix.documentOverflowAdded, `${route} page overflow added by the matrix`).toBe(0);
  }, 30_000);

  it.each(yoloMatrixRoutes)("keeps the matrix inside the article width at 320 on %s", async (route) => {
    const matrix = await matrixAt(route, 320);
    expect(matrix.documentOverflowAdded, `${route} page overflow added by the matrix`).toBe(0);
    expect(matrix.wrapper.right, `${route} scroll region inside the viewport`).toBeLessThanOrEqual(320);
    expect(matrix.wrapper.scrollWidth, `${route} columns still scroll locally`).toBeGreaterThan(matrix.wrapper.clientWidth);
    expect(matrix.rows, `${route} six actions`).toHaveLength(6);
    expect(matrix.rows[0][0].width, `${route} pinned column width`).toBeLessThan(matrix.wrapper.clientWidth * 0.6);
  }, 30_000);

  // Two paint defects of the pinned first column, read from pixels because no
  // computed style shows them: the table's collapsed row lines vanished under
  // the pinned cells' opaque ground at fractional row edges, and when the
  // columns were swiped to the end a 1px sliver of their text showed at the
  // region's left edge, where the pinned cell's border had stayed behind.
  it.each(["/zh/blog/codex-usage-limits/", "/blog/codex-yolo-mode/"])(
    "keeps the pinned column's row lines and a clean left edge on %s when swiped",
    async (route) => {
      // A phone: 2x pixels and mobile emulation, where both defects showed.
      const page = await guardedPage(browser, origin, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      try {
        await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
        const geometry = await page.evaluate(() => {
          const wrapper = document.querySelector(".post-body .post-table-scroll");
          window.scrollTo({ top: wrapper.getBoundingClientRect().top + window.scrollY - 20, behavior: "instant" });
          const box = wrapper.getBoundingClientRect();
          const pinned = [...wrapper.querySelectorAll("tbody tr")].map((row) => row.children[0].getBoundingClientRect());
          return {
            clip: { x: Math.round(box.left), y: Math.round(box.top), width: Math.round(box.width), height: Math.min(Math.round(box.height), 800) },
            pinnedX: Math.round(pinned[0].left + pinned[0].width / 2 - box.left),
            boundaries: pinned.slice(1).map((cell) => cell.top - box.top).filter((y) => y < 800),
            paper: getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number),
          };
        });
        expect(geometry.boundaries.length, `${route} row boundaries in view`).toBeGreaterThan(0);
        const atStart = (await page.screenshot({ clip: geometry.clip })).toString("base64");
        await page.evaluate(() => {
          const wrapper = document.querySelector(".post-body .post-table-scroll");
          wrapper.scrollLeft = wrapper.scrollWidth;
        });
        const swiped = (await page.screenshot({ clip: geometry.clip })).toString("base64");
        const found = await page.evaluate(async ([start, end, { pinnedX, boundaries, paper }]) => {
          const decode = async (base64) => {
            const response = await fetch("data:image/png;base64," + base64);
            const bitmap = await createImageBitmap(await response.blob());
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext("2d");
            context.drawImage(bitmap, 0, 0);
            const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
            return { height, at: (x, y) => { const i = (y * width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; } };
          };
          const dpr = 2; // the page's deviceScaleFactor
          const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
          const [first, last] = await Promise.all([decode(start), decode(end)]);
          // A row line under the pinned column at every row boundary: some
          // pixel within 2 CSS px of the boundary differs from the paper.
          const missing = boundaries.filter((top) => {
            const centre = Math.round(top * dpr);
            for (let y = Math.max(0, centre - 4); y <= Math.min(first.height - 1, centre + 4); y += 1) {
              const [r, g, b] = first.at(pinnedX * dpr, y);
              if (Math.abs(r - paper[0]) + Math.abs(g - paper[1]) + Math.abs(b - paper[2]) > 20) return false;
            }
            return true;
          });
          // Text ink in the region's first 2 CSS px once swiped to the end:
          // only the pinned column's edge line may sit there, never text.
          let inkAtEdge = 0;
          for (let y = 0; y < last.height; y += 1) for (let x = 0; x < 2 * dpr; x += 1) if (luma(last.at(x, y)) < 120) inkAtEdge += 1;
          return { inkAtEdge, missing: missing.length };
        }, [atStart, swiped, geometry]);
        expect(found.inkAtEdge, `${route} scrolled text showing at the left edge`).toBe(0);
        expect(found.missing, `${route} row lines missing under the pinned column`).toBe(0);
      } finally {
        await page.close();
      }
    },
    30_000,
  );

  // The regression this default exists for: codex-usage-limits (2026-10-17)
  // was written without the old opt-in line and shipped on phones as one
  // bordered box per cell, boxes inside the article — the layout the
  // maintainer rules out on phones (no border inside a border). Every one of
  // these tables must read as a table: header row visible, each row's cells
  // side by side, no cell turned into its own block.
  it.each([
    "/blog/codex-usage-limits/",
    "/zh/blog/codex-usage-limits/",
    "/blog/claude-code-sandbox/",
    "/zh/blog/long-polling-new-user-wait/",
    "/guides/pi-coding-agent/",
    "/zh/guides/pi-coding-agent/",
  ])("shows %s tables as tables on phones, never as stacked cell boxes", async (route) => {
    const page = await guardedPage(browser, origin, { viewport: { width: 390, height: 844 } });
    try {
      await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: 25_000 });
      const tables = await page.evaluate(() => {
        const withTable = document.documentElement.scrollWidth;
        const wrappers = [...document.querySelectorAll(":is(.post-body, .guide-body) .post-table-scroll")];
        const result = wrappers.map((wrapper) => {
          const table = wrapper.querySelector("table");
          const head = table.querySelector("thead");
          const hint = wrapper.previousElementSibling;
          const rows = [...table.querySelectorAll("tbody tr")];
          return {
            className: table.className,
            headVisible: head.getBoundingClientRect().height > 0 && getComputedStyle(head).display !== "none",
            blockCells: [...table.querySelectorAll("th, td")].filter((cell) => getComputedStyle(cell).display !== "table-cell").length,
            rowsSideBySide: rows.every((row) => new Set([...row.children].map((cell) => Math.round(cell.getBoundingClientRect().top))).size === 1),
            columns: rows[0].children.length,
            overflows: wrapper.scrollWidth > wrapper.clientWidth,
            hintShown: hint.classList.contains("post-table-hint") && !hint.hidden && getComputedStyle(hint).display !== "none",
            tabStop: wrapper.getAttribute("tabindex") === "0",
            region: wrapper.getAttribute("role") === "region",
            pinnedPaper: getComputedStyle(table.querySelector("tbody th")).backgroundColor === getComputedStyle(document.body).backgroundColor,
            pinned: getComputedStyle(table.querySelector("tbody th")).position === "sticky",
          };
        });
        wrappers.forEach((wrapper) => { wrapper.querySelector("table").style.display = "none"; });
        return { result, overflowAdded: withTable - document.documentElement.scrollWidth };
      });
      expect(tables.result.length, `${route} body tables`).toBeGreaterThan(0);
      for (const [index, table] of tables.result.entries()) {
        const label = `${route} table ${index + 1}`;
        expect(table.className, label).toBe("table-comparison");
        expect(table.headVisible, `${label} header row visible`).toBe(true);
        expect(table.blockCells, `${label} cells turned into blocks`).toBe(0);
        expect(table.rowsSideBySide, `${label} each row's cells side by side`).toBe(true);
        expect(table.columns, `${label} columns`).toBeGreaterThanOrEqual(2);
        expect(table.pinned, `${label} first column pinned`).toBe(true);
        expect(table.pinnedPaper, `${label} pinned column on the page paper`).toBe(true);
        // The swipe hint, the Tab stop and the region role appear exactly when
        // there is something to swipe to.
        expect(table.hintShown, `${label} swipe hint`).toBe(table.overflows);
        expect(table.tabStop, `${label} Tab stop`).toBe(table.overflows);
        expect(table.region, `${label} scroll region role`).toBe(table.overflows);
      }
      expect(tables.overflowAdded, `${route} page overflow added by the tables`).toBe(0);
    } finally {
      await page.close();
    }
  }, 30_000);
});

