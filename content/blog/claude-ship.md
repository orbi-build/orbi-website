---
title: Claude Ship: what it automates and where it stops
date: 2026-11-26
summary: Claude Ship adds three GitHub PR agents for Team and Enterprise plans. Scope, billing, merges without human review, /ship, and how it compares with Orbi.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-claude-ship-card.png
---

Claude Ship is Anthropic's set of three agents for GitHub pull requests — Code Review, PR Steward and Claude Approvals — [announced](https://claude.com/blog/introducing-claude-ship) on 23 November 2026 for Claude Team and Enterprise plans. This post is for teams deciding whether to turn it on. It covers the agent-by-agent scope, billing, the settings that let a PR merge with no human review, what the separate `/ship` command does, and where Claude Ship stops compared with a pipeline that starts from the Issue.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi turns GitHub Issues into reviewed, merged pull requests and runs the releases you start; it runs the open-source coding agent Pi and does not run Claude Code or Claude Ship. I read the docs on 26 November 2026 and tried `/ship` myself in Claude Code; I could not test the org-level agents because they require a Team or Enterprise org.

## What Claude Ship is: three agents, one PR

In the [Claude Ship docs](https://code.claude.com/docs/en/claude-ship), three agents divide the work on an open GitHub pull request:

| Agent | What it does | Status | Billed |
|---|---|---|---|
| Code Review | Reads the change with surrounding code; posts inline findings ranked by severity | Generally available | Org usage credits (tokens) |
| PR Steward | Fixes failing checks, merge conflicts and review comments; pushes commits | Public beta | Org usage credits (tokens); no default spend limit |
| Claude Approvals | Runs a PR check against `.claude/approvals.yml`; can approve where policy allows | Public beta | Classifier runs and policy-triggered Code Reviews (observe mode too) |

Code Review is generally available and looks for bugs rather than formatting preferences. An Owner can choose Quick, Standard (default) or Deep review levels per repository. By itself, Code Review neither approves nor blocks a pull request.

PR Steward is in public beta. Per the [PR Steward docs](https://code.claude.com/docs/en/pr-steward), it works on failing checks, merge conflicts, and review comments from people and review bots such as Code Review, then pushes commits. After each push, it comments with what it changed and how to undo it. Commenting `@claude stop` (or removing the `claude-pr-steward-watching` label) makes it step back. It is "designed not to approve or merge pull requests" and has no spend limit of its own until you set one.

Claude Approvals is in public beta. It adds a check that reports who still has to approve under a `.claude/approvals.yml` policy file you commit on the default branch, and can post Claude's approving review where policy allows. The check blocks a merge only where you make it a required check in GitHub. A policy file enforces by default; Anthropic recommends starting with `mode: observe` in the file, and observe mode is still billed.

Claude Ship has no merge step of its own; what merges is decided by your GitHub branch rules.

## Who can use Claude Ship and what it costs

Claude Ship requires a Claude Team or Enterprise plan and works with GitHub repositories only. It is not available to organizations with Zero Data Retention, the HIPAA configuration, or customer-managed encryption keys (Approvals also cannot start with FERPA or Access Transparency settings). Changing settings requires an Owner role in the Claude organization. Approvals is the exception: once its prerequisites are met (the Claude GitHub App is connected), anyone who can merge a policy file into a repository's default branch turns it on, and starts its billing, unless an Owner has turned Approvals off for the whole organization.

Each agent is billed on token usage through the org's usage credits, separately from the plan's included usage. Approvals has no base charge: as the [Approvals setup docs](https://code.claude.com/docs/en/approvals-setup) state, classifier runs are billed, and a policy that asks for Code Review triggers billed reviews even in observe mode.

Turning off usage credits in org settings does not stop an agent that is already on — it keeps running and billing. Turn the agents off directly, in order: Approvals first, then PR Steward, then Code Review. Approvals comes first because a policy file can keep starting billed Code Reviews even while Code Review is off.

Per the [announcement](https://claude.com/blog/introducing-claude-ship), eligible Enterprise organizations can claim at least $10,000 in Claude Ship credits, to use within 30 days of claiming, if claimed by 15 January 2027.

## When a PR can merge with no human review

Claude Ship has no merge step: PR Steward is designed not to merge, and the [PR Steward security docs](https://code.claude.com/docs/en/pr-steward-security) say its guard against merge and auto-merge commands is a text rule plus a model's judgment that a command written another way can pass, so your GitHub branch rules are the real limit. The main reason a PR merges unreviewed is that the **Claude Approvals** check is not required in GitHub, so it blocks nothing (observe mode also normally counts as passing).

Even when the check is required and enforced, the [Approvals and GitHub rules docs](https://code.claude.com/docs/en/approvals-github-rules) list ways it can pass with no person besides the author:

- `seats: 0`, which lets a bot-opened PR pass with no human looking at it.
- `seats: 1`, which the PR author can fill.
- A `from` list that admits bots.
- A machine user (an account a script or agent drives), which Approvals counts as a person.
- `reuse` keeping earlier seats after a new push.
- Files no rule covers, where GitHub counts the neutral result as passing.
- A condition reading a classifier answer (in `if`, an override's `if`, or `reuse`) that the PR's own text can steer.

Direct pushes to the default branch get no check, so GitHub branch rules still need to require pull requests. With GitHub auto-merge or a merge queue and a policy that does not require a person, a change can merge without anyone acting. Where policy lets Claude approve, Claude's approving review can also satisfy a GitHub rule that requires one approval.

Distinguish "no review" from "no human review". A rule with `claude: approves` and no `claude/code_review = pass` condition lets Claude approve with no review at all. When Code Review passes and `seats: 1` (filled by the author) or `seats: 0` applies, the PR got an AI review but no human review besides the author's.

To require one person who is not an author on every path, enforce the rule below in `.claude/approvals.yml` and require the **Claude Approvals** check in GitHub, with the Claude app as its source. I copied this YAML verbatim from the [Approvals GitHub rules docs](https://code.claude.com/docs/en/approvals-github-rules); I only checked that it parses as YAML and have not run it under Approvals.

```yaml
# .claude/approvals.yml
version: 1
rules:
  - purpose: "A change takes one person who isn't an author."
    paths: ["**"]
    nested: inherit
    verdict:
      claude: comments
      seats: [{ count: 1, from: [humans, "!pr/authors"] }]
    advisory: [claude/code_review]
```

What each part does:

- No `if` or `override` means no classifier answer can loosen the rule, and `nested: inherit` keeps it active under subdirectory policy files.
- `claude: comments` prevents Claude from posting an approving review.
- `"!pr/authors"` excludes PR authors from filling the seat. On a pull request from a fork, no approval counts toward this seat, so repositories that take fork PRs need another path for them.
- `humans` still includes machine users; exclude one by adding its login with `"!"`, as in `[humans, "!pr/authors", "!acme-ci"]`.
- `advisory: [claude/code_review]` keeps automatic Code Reviews running (a policy file otherwise turns them off on covered files unless a rule names `claude/code_review`).

Where GitHub requires approvals, also turn on dismissing stale approvals when new commits are pushed (or requiring approval of the most recent reviewable push), so an older approval does not survive later commits.

## The /ship command is not Claude Ship

Three names look similar and do different things. Claude Ship is the set of org-level GitHub agents billed to org usage credits. Claude Code's `/ship` command runs locally in your terminal session and counts against your Claude Code usage. Orbi's `/orbi:ship` command (from Orbi's Claude Code plugin) writes the task as a GitHub Issue labelled `ai-ready` for Orbi; it does not merge anything.

Per the [`/ship` command docs](https://code.claude.com/docs/en/ship-command), `/ship` commits, pushes and opens a GitHub pull request as you, runs `/code-review`, and starts a "watch" in your session to work on failing checks, merge conflicts, review comments and review findings. You merge the PR yourself.

Prerequisites: Claude Code v2.1.330+, GitHub CLI 2.63+ signed in, and `git` 2.38+. Unattended watch work requires auto mode (`bypassPermissions` starts no watch, and on v2.1.331+ `/ship` does not start in plan mode). No watch starts on native Windows or in a background session. In a public repo, `/ship` will not commit uncommitted changes. Where it does commit and push, it runs without a confirmation prompt, printing an `Esc to cancel` line before the commit and again before the push.

On 26 November 2026, I tested the `/ship` command in Claude Code 2.1.331 inside a private throwaway repo. Typing `/ship` inside a session launched by another agent session returned:

```text
This session was started by another session, so /ship can't run here. Run it in a session you started yourself.
```

Running `claude -p "/ship"` returned:

```text
Nothing started. Claude Code's built-in /ship doesn't start in this kind of session. Run claude in a terminal, and type it there.
```

Neither run committed, pushed or opened a PR. Both refusals appear in the [`/ship` troubleshooting table](https://code.claude.com/docs/en/ship-command-troubleshooting), which states that `/ship` starts only from a line you type yourself, not from a program. `/ship` is built for a person at the keyboard, not a cron job or another agent. I did not run the full flow in a session I started by hand.

## Claude Ship vs Orbi: who owns each step

| Step | Claude Ship | Orbi |
|---|---|---|
| Write the task (Issue) | No (you or Claude Code write the code) | An Issue with `ai-ready` (written by you, `orbi draft` or `/orbi:ship`) |
| Claim and implement | No | Claims it and implements on its runner with Pi |
| Open the PR | `/ship` can open it as you; org agents start on existing PRs | Opens it, verified (fresh base, `Fixes #N`) |
| Review | Code Review | Independent review session on exact base and head SHAs |
| Fix review findings / failing CI | PR Steward | Fixes in the same review session; unfixable findings set `ai-fix-needed` for the next review round on the same PR |
| Approval decision | Claude Approvals check per your policy | No policy file; a repository rule Orbi cannot satisfy (such as a required human approval) parks the Issue at `ai-awaiting-merge` naming the one maintainer action, and Orbi merges after that action |
| Merge | GitHub branch rules, you or auto-merge | Merges once the merge gate passes: head contains latest base, CI finished with no failing check, PR mergeable, head unchanged |
| Release | Not covered | You open the release Issue and add `ai-release` (a label only people set); Orbi claims it after the milestone's other Issues close and runs a deterministic release state machine (no Pi, no PR) |
| Runs without anyone typing | Code Review starts on PRs in enabled repos; PR Steward starts by itself only if set to On (the docs suggest starting with Manual, `@claude steward`); Approvals starts from the policy file; `/ship` needs you to type it | Yes, from the labelled Issue to the merged PR; releases start when you open the release Issue |

Claude Ship and Orbi have no integration, and I have not run both on one repository. The only link between Claude Code and Orbi is the plugin handing an Issue over. Ordinary Orbi delivery ends at the merged PR. Releases are never automatic: a person opens the release Issue, and Orbi runs it.

## One Orbi delivery, timed

In `orbi-build/orbi`, I opened [Issue #2387](https://github.com/orbi-build/orbi/issues/2387) on 25 November 2026 at 10:08 UTC+8. Orbi started Pi at 10:12 UTC+8, and the `orbi-build` app opened [PR #2388](https://github.com/orbi-build/orbi/pull/2388) at 10:51 UTC+8. After one review round, the `orbi-build` app merged PR #2388 at 11:04 UTC+8. I opened release ticket #2389 at 11:14 UTC+8, and `orbi-build[bot]` published [v0.7.63](https://github.com/orbi-build/orbi/releases/tag/v0.7.63) at 11:31 UTC+8.

Over the 30-day window from 27 October to 25 November 2026 (UTC dates) in the same repository, 182 pull requests merged — 164 opened and merged by the `orbi-build` app — alongside 46 releases (`v0.7.19`–`v0.7.64`). Caveat: this is Orbi's own repository (dogfooding), and these are counts of throughput, not a quality measure.

## Which one fits your team

- Choose Claude Ship if your team (people or Claude Code) already writes the code, you are on Team or Enterprise with GitHub, and your bottleneck is review, fixes and approval policy; start in observe mode and add the non-author rule before enforcing.
- Choose Orbi if you want the Issue-to-merged-PR loop to run unattended, with releases run for you once you open the release Issue, at a fixed monthly price: Orbi Cloud Solo lists at US$29/month (see [Orbi Cloud](/cloud/?ref=blog-claude-ship) for the current price and any founding-member discount).
- If you are not on Team or Enterprise, Claude Ship is not available; `/ship` still is, billed as regular Claude Code usage.

## Related

For how merge gates and CI checks protect automated pull requests, see [Auto-merge AI pull requests](/guides/auto-merge-ai-prs/?ref=blog-claude-ship) and [CI gates](/guides/ci-gates/?ref=blog-claude-ship). I covered where GitHub Actions stops in [Claude Code in Actions: who presses merge?](/blog/claude-code-github-actions-who-merges/) and measured post-merge wait times in [AI code review bottleneck? Our PRs wait after merge](/blog/ai-code-review-bottleneck/). For the side-by-side workflow breakdown and hosted pricing, see [Orbi vs Claude Code](/compare/claude-code/?ref=blog-claude-ship) and [Orbi Cloud](/cloud/?ref=blog-claude-ship).
