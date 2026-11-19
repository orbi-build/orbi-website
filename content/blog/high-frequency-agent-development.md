---
title: Agentic software development beyond one session
date: 2026-11-19
summary: How Orbi resumes interrupted tasks, waits for GitHub and applies maintainer decisions, with rules for keeping agent delivery running between sessions.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-high-frequency-agent-development-card.png
mirror: high-frequency-agent-development
---

Orbi is an open-source system for agentic software development: it takes a GitHub Issue through implementation, review, merge and release. This article is for maintainers who already use coding agents and want delivery to keep moving between sessions. It gives three rules to adopt: recover only work you own, distinguish stale external state from a real change, and apply a new human decision before merging.

I'm Larry 🍀 Orbi, the creator of Orbi, and I use it to develop Orbi itself. Once I authorize a prepared task, Orbi starts the implementation session and, when the code is ready, an independent review session. The runner, Orbi's scheduler, saves progress, waits for checks and merges when the conditions hold; a separate release task publishes the version. I do not have to carry the task from one conversation to the next. Product decisions and required production approval remain mine.

Rocky's [Magpie development article](https://83d.me/2026/11/19/magpie-agent-development) was the starting point for this one. Orbi's public development history shows what continuous delivery has to handle when a session ends, GitHub lags behind a push, or a maintainer changes an answer.

| What changed | What to check | Rule for continuing |
|---|---|---|
| An agent session stopped | This deployment’s worktree and saved run state | Resume its original branch; skip other deployments’ work and keep scanning |
| GitHub still reports an old PR head | The pushed branch ref and the PR head | Wait briefly for the known new head; refuse an unexpected third commit |
| A maintainer supplied a new answer | Whether the trusted, newer answer has been applied | Hold the merge until the new decision is handled |

## Resume only work this deployment owns

On 18 November, [Issue #2256](https://github.com/orbi-build/orbi/issues/2256) asked for a change to Orbi's own restart recovery. A runner looking for interrupted work could mistake another deployment's live delivery for its own abandoned one. Both deployments could then work on the same task branch.

The requested outcome was specific: resume an in-progress Issue only when this deployment has its own worktree and saved run state for it. A Git worktree is a separate checkout; Orbi keeps the task's files and execution state there. An in-progress label alone was insufficient evidence of ownership.

Orbi's [delivery code](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/implementation_delivery.py#L299) records the base, run and worktree at claim time. When it resumes an existing worktree, it keeps that worktree's original branch.

The recovery rule can be written as an acceptance case for another project:

> Given an in-progress task with no local execution state, leave it alone. Given the deployment's own saved work, continue that work. Skipping the first task must not hide another task that this deployment can resume.

The [merged PR](https://github.com/orbi-build/orbi/pull/2258) implements this ownership rule without introducing another ownership service. Writing "restart recovery is broken" would have left the agent to invent that rule. I need to put the policy in the Issue, with a trigger, an observable outcome and the boundary of the change.

## Let the runner handle waiting

Another source of unnecessary work appeared when a task branch needed the latest base code. The runner could merge that base without conflicts and push successfully, yet a subsequent GitHub PR query still reported the old head commit. The branch ref and the PR view briefly disagreed.

[Issue #2017](https://github.com/orbi-build/orbi/issues/2017) records the resulting mistake: Orbi interpreted the old PR view as a head change and sent work back through review. The push had succeeded; there was no new implementation problem for a model to solve.

[PR #2019](https://github.com/orbi-build/orbi/pull/2019), merged on 30 October, made the distinction explicit. After confirming the pushed branch ref, the runner briefly rereads a PR view that still shows the pre-push head. If the view catches up, it uses the new state. If it never catches up, it refuses the merge. If it sees a third commit, that is an unexpected change, not the known stale result, and it fails immediately.

The [current merge code](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/merge_exec.py#L214) keeps this wait bounded. After merging the base branch into the task branch and pushing, the runner waits until a later scheduler pass to check the new head's CI before merging the PR. A conflict-free merge of the base updates the recorded head without another model review; this is an explicit exception to re-reviewing a changed task branch.

The same separation applies to ordinary CI waiting. Orbi can save a clean review with the head commit and the Issue body the reviewer read. If those inputs still match, a later pass can check whether CI finished and attempt the merge without launching another review session.

A related change on 19 November, [PR #2265](https://github.com/orbi-build/orbi/pull/2265), tells reviewers to use successful CI checks for the current head as verification evidence. Local tests still belong in reproducing a failure or checking a repair. The [review instructions](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/prompts/prompt_review.md#L203) also tell the reviewer to return its verdict after pushing a fix, leaving subsequent CI waiting to the runner. This instruction change is outside the seven-day activity window below; I have no before-and-after runtime measurement for it.

## Apply a changed decision before merging

A maintainer can change an earlier answer after review, while CI is running. The code may satisfy the decision the reviewer saw, while the maintainer has supplied a newer one.

[Issue #2221](https://github.com/orbi-build/orbi/issues/2221) addressed that gap. The merge path did not consistently apply a new answer to a question Orbi had paused to ask, so it could continue with the older decision. [PR #2229](https://github.com/orbi-build/orbi/pull/2229), merged on 17 November, added a final check for a newer, trusted answer that has not yet been carried out.

The [merge gate](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/merge_exec.py#L323) reads that state immediately before its merge command. A pending answer stops the old result from merging and returns the delivery for repair. An answer already applied does not keep blocking it. If the answer history cannot be read, [the gate holds the merge](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/answer.py#L785).

When Orbi pauses for a decision, it posts a question on the Issue. A maintainer with repository write access submits a new comment using the [documented structured answer format](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/docs/operations.mdx#L1093). The runner checks that answer before merging; ordinary discussion comments do not enter this path. The resulting behavior is in [v0.7.46](https://github.com/orbi-build/orbi/releases/tag/v0.7.46).

## Follow one task through release

The public trail for #2256 follows the work from claim to a published, verified package:

| Stage | Public evidence |
|---|---|
| Task claimed | [Start comment](https://github.com/orbi-build/orbi/issues/2256#issuecomment-6975163075) records the run, task branch and base commit |
| Implementation delivered | [PR #2258](https://github.com/orbi-build/orbi/pull/2258) contains the recovery change |
| Review and merge | [Merge comment](https://github.com/orbi-build/orbi/issues/2256#issuecomment-6980679331) records one review round, pass recorded on head `3507be8`, and merge after CI |
| Version published | [v0.7.49](https://github.com/orbi-build/orbi/releases/tag/v0.7.49) includes the Issue and PR in its verified release scope |
| Package distributed | [PyPI publication](https://github.com/orbi-build/orbi/actions/runs/44362052953/job/135006009705) and the subsequent [package verification](https://github.com/orbi-build/orbi/actions/runs/44362052953/job/135006307821) completed successfully after the Release |

The implementation session runs [Pi, the coding agent](/blog/orbi-on-pi-coding-agent/). Orbi then starts a separate review process with fresh context. The reviewer reads the task and code, can fix findings on the same branch, and returns a verdict tied to a commit.

The release containing the restart fix, [v0.7.49](https://github.com/orbi-build/orbi/releases/tag/v0.7.49), was published on 18 November. Its record links release task #2263, identifies the release commit, lists the scope Issues as closed, and records the release commit's GitHub checks.

<figure class="post-media">
<img src="/img/blog-high-frequency-release-gates.webp" alt="GitHub Release v0.7.49 showing closed scope Issues and the release commit's CI and test receipts." width="1200" height="540">
<figcaption>The published v0.7.49 record identifies its scope and the checks on the version commit. Source: the public GitHub Release.</figcaption>
</figure>

The [release path](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/release_run.py#L99) does not start Pi. Program logic checks scope and release conditions, writes the version change, waits for the release commit's CI, then handles the tag and GitHub Release. A milestone with other open Issues does not enter release processing yet.

## A week of public activity

For the seven complete UTC dates 12 to 18 November 2026, the public repositories recorded:

| Record | Count | What it counts |
|---|---:|---|
| Core PRs merged into `main` | 33 | Merged pull requests, including fixes and documentation |
| Core GitHub Releases | 8 | Published, non-draft, non-prerelease records |
| Website PRs merged into `beta` | 26 | Changes entering the website's test branch |

The [Core PR query](https://github.com/orbi-build/orbi/pulls?q=is%3Apr+is%3Amerged+base%3Amain+merged%3A%3E%3D2026-11-12+merged%3A%3C2026-11-19) uses merge time; [Releases](https://github.com/orbi-build/orbi/releases) use publication time, in the same window. The website also had 17 `beta`-to-`main` promotion PRs. They carry work already merged into beta, so I count them separately.

The website promotes beta to main for production without cutting a version for each batch. The Core publishes versioned Releases; a published Release does not establish that every hosted deployment or self-hosted installation has upgraded.

[DORA's delivery metrics](https://dora.dev/guides/dora-metrics/) consider throughput alongside instability. These counts establish activity; they do not count useful features or measure productivity and deployment rework. I have separately [measured waiting after merge](/blog/ai-code-review-bottleneck/).

## What I still keep, and what I would copy first

I define the product outcome and authorize the work. I resolve decisions that require my authority, check behavior that needs a real user environment, and approve production where that approval is required. Orbi can automate the repeated implementation and delivery steps without making those product decisions disappear.

For another project, I would start with five questions:

1. Can the next session locate the existing task, branch and work instead of starting a second attempt?
2. Does an independent reviewer repair what it finds, or does somebody have to ferry its findings into another conversation?
3. Can the runner wait for CI without spending another model session, while still checking the right commit?
4. Can a new, authorized answer stop an obsolete decision immediately before merge?
5. Does release have an explicit scope and verifiable conditions, separate from a model's completion message?

## Related

Read [how Orbi uses Pi](/blog/orbi-on-pi-coding-agent/), [an independent reviewer refusing a delivery](/blog/what-autonomous-actually-means/), the [Claude Code comparison](/compare/claude-code/?ref=blog-hi-freq), and [Orbi Cloud](/cloud/?ref=blog-hi-freq).
