// Issue #585: Google Fonts is gone. Every shipped page loads fonts only from
// this origin (/fonts/fonts.css); no page keeps a stylesheet link to or a
// preconnect for the Google font domains.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function listHtml(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...(await listHtml(join(dir, entry.name), `${prefix}${entry.name}/`)));
    else if (entry.name.endsWith(".html")) out.push(`${prefix}${entry.name}`);
  }
  return out.sort();
}

describe("self-hosted fonts (Issue #585)", () => {
  it("no shipped page references the Google font domains", async () => {
    const offenders = [];
    for (const path of await listHtml(join(ROOT, "public"))) {
      const html = await readFile(join(ROOT, "public", path), "utf8");
      if (html.includes("fonts.googleapis.com") || html.includes("fonts.gstatic.com")) offenders.push(path);
    }
    expect(offenders, "pages still referencing Google Fonts").toEqual([]);
  });
});
