---
title: Claude Ship: what it automates and where it stops
date: 2026-11-26
summary: Claude Ship adds three GitHub PR agents for Team and Enterprise plans: agent scope, billing, merges with no human review, /ship, and how Orbi compares.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-claude-ship-card.png
---

Claude Ship is Anthropic's set of three agents for GitHub pull requests (Code Review, PR Steward, and Claude Approvals), [announced](https://claude.com/blog/introducing-claude-ship) on 23 November 2026 for Claude Team and Enterprise plans. Before turning it on, a team needs to know what each agent handles, how billing behaves, which settings let a PR merge with no human review, how the separate `/ship` command differs, and where Claude Ship stops compared with a pipeline that starts from the Issue.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi is an open-source lights-out software factory for the agent era: give it a labelled Issue and it claims the work, writes the code, sends it to an independent review, fixes what the review finds and merges once CI passes, with nobody watching. Open a release ticket with `ai-release` and it ships the release. It uses the open-source coding agent Pi and does not run Claude Code or Claude Ship. On 26 November 2026, I read the docs and tried `/ship` myself in Claude Code, though I could not test the org-level agents because they require a Team or Enterprise org.

## What Claude Ship is: Code Review, PR Steward and Claude Approvals

In the [Claude Ship docs](https://code.claude.com/docs/en/claude-ship), three agents divide the work on an open GitHub pull request:

| Agent | What it does | Status | Billed |
|---|---|---|---|
| Code Review | Reads the change with surrounding code; posts inline findings ranked by severity | Generally available | Org usage credits (tokens) |
| PR Steward | Fixes failing checks, merge conflicts and review comments; pushes commits | Public beta | Org usage credits (tokens); no default spend limit |
| Claude Approvals | Runs a PR check against `.claude/approvals.yml`; can approve where policy allows | Public beta | Classifier runs and policy-triggered Code Reviews (observe mode too) |

Code Review is generally available and checks for bugs, leaving formatting preferences alone. An Owner can choose Quick, Standard (default), or Deep review levels per repository. On its own, Code Review neither approves nor blocks a pull request.

According to the [PR Steward docs](https://code.claude.com/docs/en/pr-steward), PR Steward (in public beta) handles failing checks, merge conflicts, and review comments from people and review bots such as Code Review, then pushes commits. After each push, it comments with what it changed and how to undo it. Commenting `@claude stop` (or removing the `claude-pr-steward-watching` label) makes it step back. It is "designed not to approve or merge pull requests" and has no spend limit of its own until you set one.

Claude Approvals, also in public beta, adds a check that reports who still has to approve under a `.claude/approvals.yml` policy file committed on the default branch, and can post Claude's approving review where policy allows. The check blocks a merge only if you configure it as a required check in GitHub. A policy file enforces by default. Anthropic recommends starting with `mode: observe` in the file, though observe mode is still billed.

None of the three agents has a merge step, so your GitHub branch rules decide what merges.

## Who can use Claude Ship and what it costs

Claude Ship requires a Claude Team or Enterprise plan and works with GitHub repositories only. Organizations with Zero Data Retention, the HIPAA configuration, or customer-managed encryption keys cannot use it (Approvals also cannot start with FERPA or Access Transparency settings). Changing settings requires an Owner role in the Claude organization, except for Approvals: once its prerequisites are met (the Claude GitHub App is connected), anyone who can merge a policy file into a repository's default branch turns Approvals on and starts its billing, unless an Owner has turned Approvals off for the whole organization.

All three agents bill token usage against the org's usage credits, separate from the plan's included usage. Approvals has no base charge, though the [Approvals setup docs](https://code.claude.com/docs/en/approvals-setup) state that classifier runs are billed, and a policy that asks for Code Review triggers billed reviews even in observe mode.

Turning off usage credits in org settings does not stop an agent that is already on; it keeps running and billing. You have to turn the agents off directly, in order: Approvals first, then PR Steward, then Code Review. Approvals goes first because a policy that asks for Code Review keeps starting billed reviews even after automatic Code Review is switched off.

The [announcement](https://claude.com/blog/introducing-claude-ship) says eligible Enterprise organizations can claim at least $10,000 in Claude Ship credits by 15 January 2027, with 30 days to use them after claiming.

## When a PR can merge with no human review

Claude Ship has no merge step. PR Steward is designed not to merge, and the [PR Steward security docs](https://code.claude.com/docs/en/pr-steward-security) explain that its guard against merge and auto-merge commands relies on a text rule and model judgment, which a differently written command can get past. That leaves your GitHub branch rules to stop a merge. The main reason a PR merges unreviewed is that the Claude Approvals check is not required in GitHub, so it blocks nothing (observe mode also normally counts as passing).

Even when the check is required and enforced, the [Approvals and GitHub rules docs](https://code.claude.com/docs/en/approvals-github-rules) list ways it can pass with no person besides the author:

- `seats: 0`, which lets a bot-opened PR pass with no human looking at it.
- `seats: 1`, which the PR author can fill.
- A `from` list that admits bots.
- A machine user (an account a script or agent drives), which Approvals counts as a person.
- `reuse` keeping earlier seats after a new push.
- Files no rule covers, where GitHub counts the neutral result as passing.
- A condition reading a classifier answer (in `if`, an override's `if`, or `reuse`) that the PR's own text can steer.

Direct pushes to the default branch get no check, so GitHub branch rules still need to require pull requests. With GitHub auto-merge or a merge queue and a policy that does not require a person, a change can merge without anyone acting. Where policy lets Claude approve, Claude's approving review can also satisfy a GitHub rule that requires one approval.

"No review" and "no human review" are two different cases. A rule with `claude: approves` and no `claude/code_review = pass` condition lets Claude approve with no review at all. When Code Review passes under `seats: 1` (filled by the author) or `seats: 0`, the PR gets an AI review, while no human besides the author reviews it.

To require one approver who is not an author on every path, enforce the rule below in `.claude/approvals.yml` and require the Claude Approvals check in GitHub, with the Claude app as its source. I copied this YAML verbatim from the [Approvals GitHub rules docs](https://code.claude.com/docs/en/approvals-github-rules). I only checked that it parses as YAML and have not run it under Approvals. As written it enforces as soon as it lands on the default branch; to start in observe mode, add a top-level `mode: observe` line. When you delete it to enforce, open pull requests can keep a check GitHub counts as passing until you comment `@claude approvals rerun` on each of them, as the [enforcement steps](https://code.claude.com/docs/en/approvals-setup) describe.

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
- `"!pr/authors"` excludes PR authors from filling the seat. On a pull request from a fork, no approval counts toward this seat, so with the check required, this rule blocks every pull request from a fork.
- `humans` still includes machine users, so the seat can be filled by an account a script drives; that is why the rule asks for one non-author approver, not necessarily a human. Exclude each machine user by adding its login with `"!"`, as in `[humans, "!pr/authors", "!acme-ci"]`.
- `advisory: [claude/code_review]` keeps automatic Code Reviews running (a policy file otherwise turns them off on covered files unless a rule names `claude/code_review`).

If GitHub requires approvals, also enable dismissing stale approvals when new commits are pushed (or requiring approval of the most recent reviewable push), so an older approval cannot carry over to later commits.

## The /ship command is not Claude Ship

Four names look similar and do different things. Claude Ship is the set of org-level GitHub agents billed to org usage credits. Claude Code's `/ship` command runs locally in your terminal session and counts against your Claude Code usage. Orbi's `/orbi:ship` command (from Orbi's Claude Code plugin) writes the task as a GitHub Issue labelled `ai-ready` for Orbi; it does not merge anything. Claude Code also has `/steward`, which starts the same watch on your own open PR without a review first; the docs say it is separate from the org's PR Steward agent, and no watch starts where PR Steward is already working on the PR.

In the [`/ship` command docs](https://code.claude.com/docs/en/ship-command), `/ship` commits, pushes, and opens a GitHub pull request as you, runs `/code-review` (Claude Code's local review command, counted as your usage, not the org's Code Review agent), and starts a "watch" in your session to work on failing checks, merge conflicts, review comments, and review findings. Normally you merge the PR yourself, but the docs' section [When a watch can lead to a merge](https://code.claude.com/docs/en/ship-command#when-a-watch-can-lead-to-a-merge) lists exceptions: if auto-merge is on, a fix Claude pushes can trigger the merge; and in auto mode, while Claude answers a message you type, its watch limits are off and it may be allowed to merge.

It requires Claude Code v2.1.330+, a signed-in GitHub CLI 2.63+, and `git` 2.38+. Unattended watch work requires auto mode (`bypassPermissions` starts no watch, and on v2.1.331+ `/ship` does not start in plan mode), and no watch starts on native Windows or in a background session. In a public repo, `/ship` will not commit uncommitted changes. When it does commit and push, it runs without a confirmation prompt, printing an `Esc to cancel` line before the commit and again before the push.

On 26 November 2026, I tested the `/ship` command in Claude Code 2.1.331 inside a private throwaway repo. Typing `/ship` inside a session launched by another agent session returned:

```text
This session was started by another session, so /ship can't run here. Run it in a session you started yourself.
```

Running `claude -p "/ship"` returned:

```text
Nothing started. Claude Code's built-in /ship doesn't start in this kind of session. Run claude in a terminal, and type it there.
```

Neither run committed, pushed, or opened a PR. Both refusals appear in the [`/ship` troubleshooting table](https://code.claude.com/docs/en/ship-command-troubleshooting), which states that `/ship` only starts from a line typed interactively by a person at the keyboard, so a program, cron job, or another agent cannot invoke it. I did not run the full flow in a session I started by hand.

## Claude Ship vs Orbi: who owns each step

The biggest difference is who drives the line. Claude Ship sits next to a pull request that already exists: you or Claude Code write the code first, then it reviews, fixes comments and approves by policy, and your GitHub rules still decide the merge. Orbi is the whole line: from the Issue on, it claims, implements, opens the PR, reviews independently, fixes and merges by itself. A person supplies the Issue at the start and opens a release ticket with `ai-release` to ship; only when a repository rule requires a human approval does someone need to approve that step.

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

Claude Ship and Orbi have no integration, and I have not run both on one repository. The only handoff between Claude Code and Orbi is the plugin writing an Issue. Ordinary Orbi delivery stops at the merged PR. Releases are never automatic: a person opens the release Issue, and Orbi runs it.

## Timing one Orbi delivery

Here is one real delivery in `orbi-build/orbi`, all on 25 November 2026 (UTC+8):

| Time | Since the Issue | Who | What happened |
|---|---|---|---|
| 10:08 | 0 min | Me | Opened [Issue #2387](https://github.com/orbi-build/orbi/issues/2387) |
| 10:12 | 4 min | Orbi | Claimed it and started Pi on the implementation |
| 10:51 | 43 min | Orbi | The `orbi-build` app opened [PR #2388](https://github.com/orbi-build/orbi/pull/2388) |
| 11:04 | 56 min | Orbi | Merged after one independent review round |
| 11:14 | 66 min | Me | Opened release ticket #2389 |
| 11:31 | 83 min | Orbi | `orbi-build[bot]` published [v0.7.63](https://github.com/orbi-build/orbi/releases/tag/v0.7.63) |

From Issue to release took 83 minutes, and I acted twice: I opened the Issue and the release ticket. Orbi did the claiming, implementation, PR, review, merge and release.

Over the 30 days from 27 October to 25 November 2026 (UTC dates), the same repository merged 182 pull requests. The `orbi-build` app opened and merged 164 of them, a little over five a day, and the repository shipped 46 releases (`v0.7.19` to `v0.7.64`). This is Orbi's own repository, and Orbi's own code ships this way.

## Which one fits your team

- Pick Claude Ship if your team (people or Claude Code) already writes the code, you are on Team or Enterprise with GitHub, and your bottleneck is review, fixes, and approval policy. Start in observe mode and add the non-author rule before enforcing.
- Pick Orbi if you want a line that runs from Issue to merged PR with nobody watching: give it a labelled Issue and it builds, reviews and merges the change, and when you open a release ticket with `ai-release` it ships the release once the milestone's other Issues close, at a fixed monthly price. Orbi Cloud Solo lists at US$29/month (see [Orbi Cloud](/cloud/?ref=blog-claude-ship) for the current price and any founding-member discount).
- Without a Team or Enterprise plan, Claude Ship is unavailable, though `/ship` still works under regular Claude Code usage.

## Related

For how merge gates and CI checks protect automated pull requests, see [Auto-merge AI pull requests](/guides/auto-merge-ai-prs/?ref=blog-claude-ship) and [CI gates](/guides/ci-gates/?ref=blog-claude-ship). I covered where GitHub Actions stops in [Claude Code in Actions: who presses merge?](/blog/claude-code-github-actions-who-merges/) and measured post-merge wait times in [AI code review bottleneck? Our PRs wait after merge](/blog/ai-code-review-bottleneck/). The side-by-side workflow breakdown is on [Orbi vs Claude Code](/compare/claude-code/?ref=blog-claude-ship), and hosted pricing is on [Orbi Cloud](/cloud/?ref=blog-claude-ship).
