import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "scripts", "check-promotion-source.mjs");

function runCheck({ base, head, headRepo, repository }) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      PROMOTION_BASE_REF: base,
      PROMOTION_HEAD_REF: head,
      PROMOTION_HEAD_REPO: headRepo,
      PROMOTION_REPOSITORY: repository,
    },
  });
  return `${result.stdout}${result.stderr}`;
}

describe("promotion-source check", () => {
  it.each([
    ["main beta same repository", { base: "main", head: "beta", headRepo: "orbi-build/orbi-website", repository: "orbi-build/orbi-website" }, 0],
    ["main non-beta same repository", { base: "main", head: "fix/foo", headRepo: "orbi-build/orbi-website", repository: "orbi-build/orbi-website" }, 1],
    ["main beta fork", { base: "main", head: "beta", headRepo: "someone/orbi-website", repository: "orbi-build/orbi-website" }, 1],
    ["non-main base", { base: "beta", head: "anything", headRepo: "someone/orbi-website", repository: "orbi-build/orbi-website" }, 0],
  ])("%s returns the expected status", (_, input, expectedStatus) => {
    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        PROMOTION_BASE_REF: input.base,
        PROMOTION_HEAD_REF: input.head,
        PROMOTION_HEAD_REPO: input.headRepo,
        PROMOTION_REPOSITORY: input.repository,
      },
    });
    expect(result.status).toBe(expectedStatus);
    const output = `${result.stdout}${result.stderr}`;
    if (expectedStatus) {
      expect(output).toContain("::error::");
      expect(output).toContain(input.head);
    } else {
      expect(output).toContain("promotion-source passed");
    }
  });

  it("reports the repair for a rejected main promotion", () => {
    const output = runCheck({ base: "main", head: "fix/foo", headRepo: "orbi-build/orbi-website", repository: "orbi-build/orbi-website" });
    expect(output).toContain("::error::main 只接受来自本仓库 beta 分支的 PR（当前 head：orbi-build/orbi-website:fix/foo）。先把改动合进 beta，再开 beta → main。");
  });
});

describe("CI promotion-source job", () => {
  it("runs the script without a job-level if", () => {
    const workflow = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    const job = workflow.match(/  promotion-source:\n([\s\S]*?)(?=\n  \w[^\n]*:\n|$)/)?.[1];
    expect(job).toBeTruthy();
    expect(job).not.toMatch(/^    if:/m);
    expect(job).toContain("scripts/check-promotion-source.mjs");
  });
});
