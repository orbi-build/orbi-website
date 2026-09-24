import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = new URL("../scripts/check-beta-soak.mjs", import.meta.url);

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

function fixture(repo, runs) {
  const file = join(repo, "runs.json");
  writeFileSync(file, JSON.stringify(runs));
  return file;
}

function check(repo, snapshot, runs, requiredHours, now, extra = []) {
  try {
    return {
      status: 0,
      stdout: execFileSync("node", [
        script.pathname,
        "--snapshot-sha", snapshot,
        "--required-hours", String(requiredHours),
        "--runs-file", fixture(repo, runs),
        "--now", String(now),
        ...extra,
      ], { cwd: repo, encoding: "utf8", timeout: 10_000, stdio: "pipe" }),
    };
  } catch (error) {
    return { status: error.status, stdout: error.stdout, stderr: error.stderr };
  }
}

function setup() {
  const repo = mkdtempSync(join(tmpdir(), "orbi-soak-"));
  git(repo, ["init", "-q"]);
  const now = Math.floor(Date.now() / 1000);
  git(repo, ["commit", "--allow-empty", "-m", "snapshot"], new Date((now - 10 * 3600) * 1000).toISOString());
  const snapshot = git(repo, ["rev-parse", "HEAD"]);
  git(repo, ["commit", "--allow-empty", "-m", "new beta head"], new Date((now - 10 * 60) * 1000).toISOString());
  const betaHead = git(repo, ["rev-parse", "HEAD"]);
  return { repo, now, snapshot, betaHead };
}

function betaDeployment(headSha, deployedAt, overrides = {}) {
  return {
    head_sha: headSha,
    head_branch: "beta",
    conclusion: "success",
    updated_at: deployedAt,
    ...overrides,
  };
}

describe("production promotion soak script", () => {
  it("passes a five-hour-old beta deployment despite a newer beta head", () => {
    const { repo, now, snapshot, betaHead } = setup();
    try {
      const deployedAt = new Date((now - 5 * 3600) * 1000).toISOString();
      const result = check(repo, snapshot, [betaDeployment(betaHead, deployedAt)], 4, now);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`First successful beta deployment containing snapshot: ${deployedAt}`);
      expect(result.stdout).toContain("Snapshot beta soak age: 5.0h");
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it("fails a one-hour-old deployment and reports the remaining time", () => {
    const { repo, now, snapshot, betaHead } = setup();
    try {
      const result = check(repo, snapshot, [betaDeployment(betaHead, new Date((now - 3600) * 1000).toISOString())], 4, now);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Retry in about 3.0h");
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it("uses beta deployment completion time rather than run creation or commit author time", () => {
    const { repo, now, snapshot, betaHead } = setup();
    try {
      const result = check(repo, snapshot, [betaDeployment(
        betaHead,
        new Date((now - 20 * 60) * 1000).toISOString(),
        { created_at: new Date((now - 10 * 3600) * 1000).toISOString() },
      )], 4, now);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("only 0.3h");
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it("fails with the concrete not-deployed message", () => {
    const { repo, now, snapshot } = setup();
    try {
      const result = check(repo, snapshot, [], 4, now);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("this snapshot has not been deployed to beta");
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it("preserves skip_soak and zero-hour bypasses", () => {
    const { repo, now, snapshot } = setup();
    try {
      const runs = [];
      expect(check(repo, snapshot, runs, "invalid but skipped", now, ["--skip-soak"]).status).toBe(0);
      expect(check(repo, snapshot, runs, 0, now).status).toBe(0);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
});
