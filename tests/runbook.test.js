import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8");
const newestLine = workflow.match(/^\s*(newest=.*)$/m)?.[1];

function git(repo, args, date) {
  return execFileSync("git", args, {
    cwd: repo,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Runbook test",
      GIT_AUTHOR_EMAIL: "runbook@example.test",
      GIT_COMMITTER_NAME: "Runbook test",
      GIT_COMMITTER_EMAIL: "runbook@example.test",
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
    },
    encoding: "utf8",
    timeout: 10_000,
  }).trim();
}

function gateResult(repo, previous, sha, requiredHours = 4) {
  const script = `
    set -euo pipefail
    previous="$1"
    GITHUB_SHA="$2"
    required="$3"
    ${newestLine}
    if [[ -z "$newest" ]]; then exit 0; fi
    age="$(awk -v now="$(date +%s)" -v t="$newest" 'BEGIN {printf "%.1f", (now - t) / 3600}')"
    awk -v a="$age" -v r="$required" 'BEGIN {exit !(a + 0 >= r + 0)}'
  `;
  try {
    execFileSync("bash", ["-c", script, "gate", previous, sha, String(requiredHours)], {
      cwd: repo,
      encoding: "utf8",
      timeout: 10_000,
      stdio: "pipe",
    });
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

describe("production promotion runbook", () => {
  it("soaks the dispatched non-merge commits, not later beta-only commits", () => {
    expect(newestLine).toContain("git log --no-merges");
    expect(newestLine).toContain('"$GITHUB_SHA" --not "$previous"');

    const repo = mkdtempSync(join(tmpdir(), "orbi-soak-"));
    try {
      git(repo, ["init", "-q"]);
      const now = Math.floor(Date.now() / 1000);
      git(repo, ["commit", "--allow-empty", "-m", "previous"], new Date((now - 6 * 3600) * 1000).toISOString());
      const previous = git(repo, ["rev-parse", "HEAD"]);
      git(repo, ["commit", "--allow-empty", "-m", "promoted"], new Date((now - 5 * 3600) * 1000).toISOString());
      const promoted = git(repo, ["rev-parse", "HEAD"]);

      git(repo, ["checkout", "-q", "-b", "side", previous]);
      git(repo, ["commit", "--allow-empty", "-m", "side"], new Date((now - 5 * 3600) * 1000).toISOString());
      const side = git(repo, ["rev-parse", "HEAD"]);
      git(repo, ["checkout", "-q", "-B", "promotion", promoted]);
      git(repo, ["merge", "--no-ff", "--no-edit", side], new Date(now * 1000).toISOString());
      const merge = git(repo, ["rev-parse", "HEAD"]);
      git(repo, ["commit", "--allow-empty", "-m", "beta-only"], new Date((now - 1 * 3600) * 1000).toISOString());
      const betaOnly = git(repo, ["rev-parse", "HEAD"]);

      expect(gateResult(repo, previous, promoted)).toBe(true);
      expect(gateResult(repo, previous, merge)).toBe(true);
      expect(gateResult(repo, previous, betaOnly)).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
