// Issue #1301: deploy beta only for a push to beta whose CI passed.
//
// deploy-beta.yml listens to the CI workflow finishing on branch `beta`, but
// `workflow_run.branches` filters on the upstream run's head branch — and a
// beta → main promotion PR runs CI with head branch `beta` too. So the trigger
// alone cannot tell "a commit was pushed to beta" (already deployed by its own
// push run) from "the promotion PR's CI finished", and the same commit was
// deployed twice (14:27 and 14:34 on 2026-11-11).
//
// The upstream run's own trigger event is in the payload
// (github.event.workflow_run.event: push, pull_request, ...), so the decision
// is made here, where the workflow and the sandbox tests can both execute it:
// the workflow passes the payload in, this writes `deploy=true|false` to
// GITHUB_OUTPUT, and the deploy job's `if` reads it.
//
// A skip exits 0 — it is a skip, not a failed run: a red deploy-beta run on
// every failed CI push and on every promotion PR would be noise on top of the
// red CI itself. A missing payload fails closed (no deploy); the operator can
// always dispatch manually.

import { appendFileSync } from "node:fs";

const eventName = process.env.BETA_DEPLOY_EVENT ?? "";
const upstreamEvent = process.env.BETA_DEPLOY_UPSTREAM_EVENT ?? "";
const upstreamConclusion = process.env.BETA_DEPLOY_UPSTREAM_CONCLUSION ?? "";
const upstreamBranch = process.env.BETA_DEPLOY_UPSTREAM_BRANCH ?? "";
const branch = upstreamBranch || "beta";

let deploy;
let reason;

if (eventName === "workflow_dispatch") {
  deploy = true;
  reason = "manual dispatch: the dispatched commit's CI is checked next";
} else if (eventName !== "workflow_run") {
  deploy = false;
  reason = `unsupported event ${eventName || "(none)"}`;
} else if (upstreamEvent !== "push") {
  deploy = false;
  reason = `the CI run was triggered by ${upstreamEvent || "(none)"}, not a push to ${branch} (a beta → main promotion PR); its commit is already deployed by the push`;
} else if (upstreamConclusion !== "success") {
  deploy = false;
  reason = `CI on ${branch} concluded ${upstreamConclusion || "(none)"}`;
} else {
  deploy = true;
  reason = `CI on ${branch} passed for a push`;
}

console.log(`${deploy ? "deploy" : "skip"}: ${reason}`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
}
