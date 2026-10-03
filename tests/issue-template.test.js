import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const TEMPLATE = join(ROOT, ".github", "ISSUE_TEMPLATE", "user-outcome.md");

// Keys GitHub reads from an issue-template front matter block. An unknown key
// is ignored silently, so a typo would ship an unconfigured template.
// https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository
const FRONT_MATTER_KEYS = ["name", "about", "title", "labels", "assignees"];

function readTemplate() {
  return readFileSync(TEMPLATE, "utf8");
}

function frontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match, "template must start with a --- front matter block").not.toBeNull();
  return match[1];
}

describe("user-outcome Issue template", () => {
  it("offers the User outcome template with GitHub-recognised front matter", () => {
    const fields = frontMatter(readTemplate())
      .split("\n")
      .filter((line) => line.includes(":"))
      .map((line) => line.slice(0, line.indexOf(":")));

    expect(fields).toEqual(["name", "about", "title", "labels"]);
    for (const field of fields) {
      expect(FRONT_MATTER_KEYS, `unknown front matter key: ${field}`).toContain(field);
    }
    expect(readTemplate()).toContain("name: User outcome");
    expect(readTemplate()).toMatch(/about: \S/);
  });

  it("asks for the user outcome, preconditions, acceptance and evidence in that order", () => {
    const headings = ["## User outcome", "## Preconditions", "## Acceptance", "## Evidence"];
    const source = readTemplate();
    const positions = headings.map((heading) => source.indexOf(heading));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.every((position) => position >= 0)).toBe(true);
  });

  it("covers the success path, the failure path and its repair action", () => {
    const source = readTemplate();
    expect(source).toContain("### Success path");
    expect(source).toContain("### Failure path");
    expect(source).toMatch(/System action:/);
    expect(source).toMatch(/User sees:/);
    expect(source).toMatch(/Trigger:/);
    expect(source).toMatch(/Repair action:/);
  });

  it("requires evidence from the real entry point, not unit tests alone", () => {
    const source = readTemplate();
    expect(source).toContain("Real entry point:");
    expect(source).toContain("unit tests alone do not replace the user path");
  });
});
