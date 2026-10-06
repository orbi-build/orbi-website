// Issue #868: Semrush reported a heading jump on the k8e post — the page's H1
// went straight to H3 because every body section used `###`. A `###` is a
// subsection: it may exist only under a `##` section that opened before it.
// The rule reads the Markdown source so a failure names the file that broke
// it, and the built page is asserted too: the level a crawler sees lives in
// the HTML, not in the Markdown.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BLOG_DIR = join(ROOT, "content/blog");

async function markdownFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.name.endsWith(".md")) files.push(path);
  }
  return files;
}

// The front matter is not part of the body, and a fenced code block can hold a
// `### ` line that is content rather than a heading. Both are blanked out
// rather than deleted, so the line number a failure reports is the line in the
// file the maintainer will open.
function bodyLines(source) {
  const frontMatter = source.match(/^---\n[\s\S]*?\n---\n/);
  const offset = frontMatter ? frontMatter[0].split("\n").length - 1 : 0;
  const body = (frontMatter ? source.slice(frontMatter[0].length) : source)
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ""));
  return { lines: body.split("\n"), offset };
}

describe("blog heading hierarchy (Issue #868)", () => {
  it("opens a `###` subsection only after a `##` section", async () => {
    const files = await markdownFiles(BLOG_DIR);
    expect(files.length).toBeGreaterThan(0);
    const offenders = [];
    for (const file of files) {
      let seenH2 = false;
      const { lines, offset } = bodyLines(await readFile(file, "utf8"));
      lines.forEach((line, index) => {
        if (/^##\s/.test(line)) seenH2 = true;
        else if (/^###\s/.test(line) && !seenH2) offenders.push(`${relative(ROOT, file)}:${index + 1 + offset}: ${line}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it.each([["en", "blog"], ["zh", "zh/blog"]])(
    "renders the k8e post body (%s) with an <h2> first and no h3",
    async (_lang, dir) => {
      const html = await readFile(join(ROOT, "public", dir, "k8e-rejected-then-merged/index.html"), "utf8");
      const article = html.match(/<article class="post-body">([\s\S]*?)<\/article>/)?.[1];
      expect(article).toBeTruthy();
      const levels = [...article.matchAll(/<h([1-6])[ >]/g)].map((match) => Number(match[1]));
      expect(levels[0]).toBe(2);
      expect(levels).not.toContain(1);
      expect(levels).not.toContain(3);
    },
  );
});
