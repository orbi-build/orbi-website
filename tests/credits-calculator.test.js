// Issue #1459: the "how many credits will my task cost" estimator that sits
// under the rate table of the Codex credits article, in both languages.
//
// The build owns two things this suite pins: the widget is generated from the
// article's own rate table (so a rate cannot exist twice and drift), and the
// no-JavaScript result is computed from those same rows. The shipped bytes in
// public/ — the artifact the Worker deploys — are asserted directly, so a hand
// edit that skips `npm run build` fails here.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  collectPosts,
  formatCredits,
  formatTasks,
  postFromSource,
} from "../scripts/build-pages.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EN_PAGE = "public/blog/codex-usage-limits/index.html";
const ZH_PAGE = "public/zh/blog/codex-usage-limits/index.html";
const EN_SOURCE = "content/blog/codex-usage-limits.md";
const ZH_SOURCE = "content/blog/zh/codex-usage-limits.md";

const RATES = {
  "GPT-6.2 Astra": { input: 200, cached: 10, output: 1000 },
  "GPT-6.1 Sol": { input: 50, cached: 2.5, output: 250 },
  "GPT-6 Luna": { input: 2.5, cached: 0.25, output: 12.5 },
};

const page = (path) => readFile(join(ROOT, path), "utf8");
const cellText = (markup) => markup.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const front = (fields, body) =>
  `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n")}\n---\n\n${body}\n`;

const base = {
  title: "T", date: "2026-10-13", summary: "s", lang: "en", author: "Larry 🍀 Orbi", image: "/img/blog-t.png",
};

const RATE_TABLE = [
  "| Model | Input | Cached input | Output |",
  "|---|---|---|---|",
  "| GPT-6.2 Astra | 200 | 10 | 1,000 |",
  "| GPT-6.1 Sol | 50 | 2.5 | 250 |",
  "| GPT-6 Luna | 2.5 | 0.25 | 12.5 |",
].join("\n");

// The rates the shipped widget carries, per model: the data attributes the
// build writes onto each <option>.
function shippedRates(html) {
  const options = html.match(/<select data-credits-model>([\s\S]*?)<\/select>/)?.[1] ?? "";
  return [...options.matchAll(/<option value="([^"]+)" data-rate-input="([^"]+)" data-rate-cached="([^"]+)" data-rate-output="([^"]+)"([^>]*)>/g)]
    .map((match) => ({
      model: match[1],
      input: Number(match[2]),
      cached: Number(match[3]),
      output: Number(match[4]),
      selected: match[5].includes("selected"),
    }));
}

describe("credits estimator: the rates come from the article's own table", () => {
  it("carries exactly the three table rows, with the Sol row selected", async () => {
    for (const path of [EN_PAGE, ZH_PAGE]) {
      const html = await page(path);
      expect(shippedRates(html), path).toEqual([
        { model: "GPT-6.2 Astra", ...RATES["GPT-6.2 Astra"], selected: false },
        { model: "GPT-6.1 Sol", ...RATES["GPT-6.1 Sol"], selected: true },
        { model: "GPT-6 Luna", ...RATES["GPT-6 Luna"], selected: false },
      ]);
    }
  });

  it("matches the Markdown rate table line for line", async () => {
    for (const [source, page_path] of [[EN_SOURCE, EN_PAGE], [ZH_SOURCE, ZH_PAGE]]) {
      const markdown = await page(source);
      const rates = shippedRates(await page(page_path));
      for (const row of rates) {
        const line = markdown.split("\n").find((text) => text.startsWith(`| ${row.model} |`));
        expect(line, `${source}: no table row for ${row.model}`).toBeTruthy();
        expect(line.split("|").slice(2, 5).map((cell) => Number(cell.trim().replaceAll(",", "")))).toEqual([
          row.input,
          row.cached,
          row.output,
        ]);
      }
    }
  });

  it("shows the default example's result without JavaScript", async () => {
    const en = await page(EN_PAGE);
    expect(en).toContain('data-credits-cost>5.4</strong>');
    expect(en).toContain('data-credits-tasks>186</strong>');
    expect(en).toContain("About <strong data-credits-cost>5.4</strong> credits per task");
    const zh = await page(ZH_PAGE);
    expect(zh).toContain("这个任务约花 <strong data-credits-cost>5.4</strong> credits");
    expect(zh).toContain("大约够 <strong data-credits-tasks>186</strong> 个这样的任务");
  });

  it("sits under the rate table, before the hand-worked example", async () => {
    for (const path of [EN_PAGE, ZH_PAGE]) {
      const html = await page(path);
      const table = html.indexOf('<th scope="row">GPT-6 Luna</th>');
      const widget = html.indexOf('class="credits-calculator"');
      const prose = html.indexOf("To turn a balance into a number of tasks");
      const zhProse = html.indexOf("所以「几万 credits 能用多久」");
      const example = prose > -1 ? prose : zhProse;
      expect(table, path).toBeGreaterThan(-1);
      expect(widget, path).toBeGreaterThan(table);
      expect(example, path).toBeGreaterThan(widget);
    }
  });

  it("leaves the page URL, title, H1 and canonical exactly as the post declares them", async () => {
    const posts = await collectPosts();
    const post = posts.find((entry) => entry.slug === "codex-usage-limits" && entry.lang === "en");
    const zhPost = posts.find((entry) => entry.slug === "codex-usage-limits" && entry.lang === "zh");
    for (const [path, declared] of [[EN_PAGE, post], [ZH_PAGE, zhPost]]) {
      const html = await page(path);
      expect(html.match(/<title>([^<]*)<\/title>/)[1]).toBe(`${declared.title} | Orbi`);
      expect(html.match(/<h1 id="post-title">([^<]*)<\/h1>/)[1]).toBe(declared.title);
      expect(html).toContain(`<link rel="canonical" href="https://orbi.build${declared.href}">`);
    }
  });

  it("leaves no marker behind in either language", async () => {
    for (const path of [EN_PAGE, ZH_PAGE]) {
      expect(await page(path)).not.toContain("<!--@credits-calculator-->");
    }
  });
});

describe("credits estimator: the build refuses a table it cannot price", () => {
  it("renders both languages from the Markdown source", () => {
    for (const [lang, prose] of [["en", "About <strong data-credits-cost>5.4</strong>"], ["zh", "约花 <strong data-credits-cost>5.4</strong>"]]) {
      const post = postFromSource(`${lang === "zh" ? "zh/" : ""}t.md`, front({ ...base, lang }, `${RATE_TABLE}\n\n<!--@credits-calculator-->\n\nDone.`));
      expect(post.html).toContain(prose);
      expect(post.html).toContain('data-credits-model');
      expect(post.html).toContain('value="GPT-6.1 Sol" data-rate-input="50" data-rate-cached="2.5" data-rate-output="250" selected');
    }
  });

  it("fails the build when the marker has no table above it", () => {
    expect(() => postFromSource("t.md", front(base, "<!--@credits-calculator-->")))
      .toThrow(/needs the rate table directly above it/);
  });

  it("fails the build when the table is not a model-and-three-rates table", () => {
    const table = "| Plan | Window |\n|---|---|\n| Plus | Five hours |";
    expect(() => postFromSource("t.md", front(base, `${table}\n\n<!--@credits-calculator-->`)))
      .toThrow(/needs a rate table of "model \| input \| cached input \| output"/);
  });

  it("fails the build when the default model has no row", () => {
    const table = "| Model | Input | Cached input | Output |\n|---|---|---|---|\n| GPT-6 Luna | 2.5 | 0.25 | 12.5 |";
    expect(() => postFromSource("t.md", front(base, `${table}\n\n<!--@credits-calculator-->`)))
      .toThrow(/no "GPT-6.1 Sol" row/);
  });

  it("fails the build when the marker appears twice", () => {
    expect(() => postFromSource("t.md", front(base, `${RATE_TABLE}\n\n<!--@credits-calculator-->\n\n<!--@credits-calculator-->`)))
      .toThrow(/more than one <!--@credits-calculator--> marker/);
  });
});

describe("credits estimator: the numbers read the way the article reads", () => {
  it("keeps one decimal at or above 1 credit, two below it", () => {
    expect(formatCredits(5.375)).toBe("5.4");
    expect(formatCredits(10.75)).toBe("10.8");
    expect(formatCredits(0.2875)).toBe("0.29");
    expect(formatCredits(21.5)).toBe("21.5");
    expect(formatCredits(0)).toBe("0");
  });

  it("keeps three significant digits in a task count, with thousands separators", () => {
    expect(formatTasks(186.046_511_627_906_98)).toBe("186");
    expect(formatTasks(93.023_255_813_953_49)).toBe("93");
    expect(formatTasks(3478.260_869_565_217_4)).toBe("3,480");
    expect(formatTasks(1000)).toBe("1,000");
    expect(formatTasks(0)).toBe("0");
  });
});
