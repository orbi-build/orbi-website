#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

function usage(message) {
  if (message) console.error(`::error::${message}`);
  console.error("usage: check-beta-soak.mjs --snapshot-sha SHA --required-hours HOURS --runs-file FILE [--now UNIX_SECONDS] [--skip-soak]");
  process.exit(2);
}

function option(name, required = true) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    if (required) usage(`missing ${name}`);
    return undefined;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) usage(`missing value for ${name}`);
  return value;
}

const skipSoak = process.argv.includes("--skip-soak");
const requiredText = option("--required-hours");
if (!/^[0-9]+(?:\.[0-9]+)?$/.test(requiredText)) {
  usage(`PROD_MIN_SOAK_HOURS must be a non-negative number, got: ${requiredText}`);
}
const requiredHours = Number(requiredText);
if (skipSoak) {
  console.log("skip_soak requested (hotfix); the production environment approval still applies.");
  process.exit(0);
}
if (requiredHours === 0) {
  console.log("PROD_MIN_SOAK_HOURS=0: soak check disabled.");
  process.exit(0);
}

const snapshot = option("--snapshot-sha");
const runsFile = option("--runs-file");
const nowText = option("--now", false) ?? String(Date.now() / 1000);
if (!/^\d+(?:\.\d+)?$/.test(nowText)) usage(`--now must be a Unix timestamp, got: ${nowText}`);
const now = Number(nowText);

let runs;
try {
  const parsed = JSON.parse(readFileSync(runsFile, "utf8"));
  runs = parsed.flat(Infinity).flatMap((page) => page?.workflow_runs ?? page);
} catch (error) {
  console.error(`::error::could not read beta deployment runs from ${runsFile}: ${error.message}`);
  process.exit(1);
}
if (!Array.isArray(runs)) {
  console.error(`::error::beta deployment runs in ${runsFile} must be a JSON array`);
  process.exit(1);
}

const successfulRuns = runs
  .map((run) => ({
    ...run,
    headSha: run.headSha ?? run.head_sha,
    createdAt: run.createdAt ?? run.created_at,
    headBranch: run.headBranch ?? run.head_branch,
  }))
  .filter((run) => (!run.conclusion || run.conclusion === "success") && run.headSha && run.createdAt)
  .filter((run) => !run.headBranch || run.headBranch === "beta")
  .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

function containsSnapshot(headSha) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", snapshot, headSha], {
      stdio: "ignore",
      timeout: 10_000,
    });
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

const deployment = successfulRuns.find((run) => containsSnapshot(run.headSha));
if (!deployment) {
  console.error(`::error::Soak check failed: snapshot ${snapshot} has not been deployed to beta successfully; this snapshot has not been deployed to beta.`);
  process.exit(1);
}

const deployedAt = Date.parse(deployment.createdAt) / 1000;
const age = (now - deployedAt) / 3600;
console.log(`Beta snapshot: ${snapshot}`);
console.log(`First successful beta deployment containing snapshot: ${deployment.createdAt} (headSha ${deployment.headSha})`);
console.log(`Snapshot beta soak age: ${age.toFixed(1)}h (required: ${requiredHours}h)`);
if (age >= requiredHours) {
  console.log("Soak check passed.");
  process.exit(0);
}
const remaining = requiredHours - age;
console.error(`::error::Soak check failed: snapshot has been deployed to beta for only ${age.toFixed(1)}h; PROD_MIN_SOAK_HOURS requires ${requiredHours}h. Retry in about ${remaining.toFixed(1)}h, or dispatch this workflow with skip_soak for a hotfix.`);
process.exit(1);
