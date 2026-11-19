---
title: Agentic software development: a week inside Orbi
date: 2026-11-19
summary: How Orbi develops itself with agents: automated implementation, independent review, CI waits, merge and release, with work preserved across interruptions.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-high-frequency-agent-development-card.png
mirror: high-frequency-agent-development
---

Orbi takes a GitHub issue all the way to a release: an AI agent writes the code, a separate review session fixes and verifies it, and Orbi merges and ships. I'm Larry 🍀 Orbi, its creator, and I use it to develop Orbi itself. For maintainers who want agents to keep delivering after the first pull request, the useful questions are how work survives interruptions, who handles waiting, and how a changed decision reaches code that is nearly ready to merge.

Once a task is ready, Orbi can carry it through implementation, review and repair, waiting for CI, and merge without a person advancing each stage. A separate release task can then handle the version, tag and GitHub Release. Production approval, where required, remains mine. The model does the reasoning and coding; the runner, Orbi's scheduling program, owns the transitions between those jobs.

Rocky's [study of Magpie's high-frequency development](https://83d.me/2026/11/19/magpie-agent-development) looks at project knowledge, collaboration and automation from the public record. I'll walk through one recent delivery and the fixes behind it.

For the seven complete UTC dates 12 to 18 November 2026, the public repositories recorded:

| Record | Count | What it counts |
|---|---:|---|
| Core PRs merged into `main` | 33 | Merged pull requests, including fixes and documentation |
| Core GitHub Releases | 8 | Published, non-draft, non-prerelease records |
| Website PRs merged into `beta` | 26 | Changes entering the website's test branch |

The [Core PR query](https://github.com/orbi-build/orbi/pulls?q=is%3Apr+is%3Amerged+base%3Amain+merged%3A%3E%3D2026-11-12+merged%3A%3C2026-11-19) uses merge time; [Releases](https://github.com/orbi-build/orbi/releases) use publication time, in the same window. The website also had 17 `beta`-to-`main` promotion PRs. They carry work already merged into beta, so I keep them out of the implementation count. These are activity records, not a count of useful features or a measurement of how much faster I work.

## One Issue through the automated pipeline

On 18 November, [Issue #2256](https://github.com/orbi-build/orbi/issues/2256) asked for a change to Orbi's own restart recovery. A runner looking for interrupted work could mistake another deployment's live delivery for its own abandoned one. Both deployments could then work on the same task branch.

The requested outcome was specific: resume an in-progress Issue only when this deployment has its own worktree and saved run state for it. A Git worktree is a separate checkout; Orbi keeps the task's files and execution state there. An in-progress label alone was insufficient evidence of ownership.

The public trail follows the change through the system:

| Stage | Public evidence |
|---|---|
| Task claimed | [Start comment](https://github.com/orbi-build/orbi/issues/2256#issuecomment-6975163075) records the run, task branch and base commit |
| Implementation delivered | [PR #2258](https://github.com/orbi-build/orbi/pull/2258) contains the recovery change |
| Review and merge | [Merge comment](https://github.com/orbi-build/orbi/issues/2256#issuecomment-6980679331) records one review round, pass recorded on head `3507be8`, and merge after CI |
| Version published | [v0.7.49](https://github.com/orbi-build/orbi/releases/tag/v0.7.49) includes the Issue and PR in its verified release scope |
| Package distributed | [PyPI publication](https://github.com/orbi-build/orbi/actions/runs/44362052953/job/135006009705) and the subsequent [package verification](https://github.com/orbi-build/orbi/actions/runs/44362052953/job/135006307821) completed successfully after the Release |

The implementation session runs [Pi, the coding agent](/blog/orbi-on-pi-coding-agent/). Orbi then starts a separate review process with fresh context. The reviewer reads the task and code, can fix findings on the same branch, and returns a verdict tied to a commit.

For #2256, the implementation and review receipts belong to the same run, `d7ce6300`. GitHub records the Orbi App as both PR author and merger. The final head's tests and macOS checks passed before the PR merged at 13:56 UTC; the release containing it appeared at 17:44 UTC. Those are separate stages of the delivery, with separate evidence.

The runner owns the handoff between them. It starts the reviewer, saves the verdict, checks the current GitHub state and performs the merge when its conditions hold. Publishing the release is a further task with its own scope and checks.

## A task survives its agent session

An agent process can stop while the useful work remains: files, commits, a branch, an open PR and an unresolved question. Starting again from the original request would discard much of that context and risk a second delivery alongside the first.

Orbi's [delivery code](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/implementation_delivery.py#L299) records the base, run and worktree at claim time. When it resumes an existing worktree, it keeps that worktree's original branch.

Issue #2256 exposed an important condition on this recovery: the saved work must belong to the deployment doing the recovery. The small acceptance case is useful beyond Orbi:

> Given an in-progress task with no local execution state, leave it alone. Given the deployment's own saved work, continue that work. Skipping the first task must not hide another task that this deployment can resume.

The [merged PR](https://github.com/orbi-build/orbi/pull/2258) implements this ownership rule without introducing another ownership service. Writing "restart recovery is broken" would have left the agent to invent that rule. I need to put the policy in the Issue, with a trigger, an observable outcome and the boundary of the change.

## Let the runner handle waiting

Another source of unnecessary work appeared when a task branch needed the latest base code. The runner could merge that base without conflicts and push successfully, yet a subsequent GitHub PR query still reported the old head commit. The branch ref and the PR view briefly disagreed.

[Issue #2017](https://github.com/orbi-build/orbi/issues/2017) records the resulting mistake: Orbi interpreted the old PR view as a head change and sent work back through review. The push had succeeded; there was no new implementation problem for a model to solve.

[PR #2019](https://github.com/orbi-build/orbi/pull/2019), merged on 30 October, made the distinction explicit. After confirming the pushed branch ref, the runner briefly rereads a PR view that still shows the pre-push head. If the view catches up, it uses the new state. If it never catches up, it refuses the merge. If it sees a third commit, that is an unexpected change, not the known stale result, and it fails immediately.

The [current merge code](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/merge_exec.py#L214) keeps this wait bounded. It also defers the merge after pushing the absorbed base, so the new head gets its CI checked on a later scheduler pass. A conflict-free base absorption updates the recorded head without starting another model review; it is an explicit exception to re-reviewing a changed task branch.

The same separation applies to ordinary CI waiting. Orbi can save a clean review with the head commit and the Issue body the reviewer read. If those inputs still match, a later pass can check whether CI finished and attempt the merge without launching another review session.

## Apply a changed decision before merging

A maintainer can change an earlier answer after review, while CI is running. The code may satisfy the decision the reviewer saw, while the maintainer has supplied a newer one.

[Issue #2221](https://github.com/orbi-build/orbi/issues/2221) addressed that gap. The merge path did not consistently apply a new answer to a question Orbi had paused to ask, so it could continue with the older decision. [PR #2229](https://github.com/orbi-build/orbi/pull/2229), merged on 17 November, added a final check for a newer, trusted answer that has not yet been carried out.

The [merge gate](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/merge_exec.py#L323) reads that state immediately before its merge command. A pending answer stops the old result from merging and returns the delivery for repair. An answer already applied does not keep blocking it. If the answer history cannot be read, [the gate holds the merge](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/answer.py#L785).

When Orbi pauses for a decision, it posts a question on the Issue. A maintainer with repository write access submits a new comment using the [documented structured answer format](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/docs/operations.mdx#L1093). The runner checks that answer before merging; ordinary discussion comments do not enter this path. The resulting behavior is in [v0.7.46](https://github.com/orbi-build/orbi/releases/tag/v0.7.46).


## Give the reviewer current CI evidence

The reviewer needs enough evidence to judge the change. Repeating every command already run by CI can spend another session proving the same thing, especially when the checks for the current commit have finished successfully.

On 19 November, [PR #2265](https://github.com/orbi-build/orbi/pull/2265) changed the shared review instructions to use the PR's current-head checks as that evidence. A reviewer should run local tests when it needs to reproduce a failing check or verify a repair it made. It should not rerun a successful test or build merely to confirm the current-head CI result.

The [test ladder](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/prompts/prompt_review.md#L203) also tells the reviewer to finish its verdict after pushing a fix rather than stay in the session polling for CI. The runner reads the new checks before merging.

This change is newer than the seven-day activity window. The instruction and its contract tests have been merged; I do not yet have a before-and-after runtime result for it. Its intended saving is specific: avoid a duplicate verification run when the evidence already covers the same commit.

## Publish a version with an explicit scope

The release containing the restart fix, [v0.7.49](https://github.com/orbi-build/orbi/releases/tag/v0.7.49), was published on 18 November. Its record links release task #2263, identifies the release commit, lists the scope Issues as closed, and records the release commit's GitHub checks. That connects the original recovery request to a published version someone can inspect.

<figure class="post-media">
<img src="/img/blog-high-frequency-release-gates.webp" alt="GitHub Release v0.7.49 showing closed scope Issues and the release commit's CI and test receipts." width="1200" height="540">
<figcaption>The published v0.7.49 record identifies its scope and the checks on the version commit. Source: the public GitHub Release.</figcaption>
</figure>

The [release path](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/release_run.py#L99) does not start Pi. Program logic checks scope and release conditions, writes the version change, waits for the release commit's CI, then handles the tag and GitHub Release. A milestone with other open Issues does not enter release processing yet. Release processing continues when those conditions hold.

The website has a different delivery model. It merges changes into beta and promotes beta to main for production; it does not cut a version for each batch. That is why its 26 beta PRs and 17 promotions are separate from the Core's eight Releases. Nor does a GitHub Release establish that every hosted deployment or self-hosted installation is running it.

For the deployment side, I have previously [measured waiting after merge](/blog/ai-code-review-bottleneck/).

## What I still keep, and what I would copy first

I define the product outcome and authorize the work. I resolve decisions that require my authority, check behavior that needs a real user environment, and approve production where that approval is required. Orbi can automate the repeated implementation and delivery steps without making those product decisions disappear.

For another project, I would start with five questions:

1. Can the next session locate the existing task, branch and work instead of starting a second attempt?
2. Does an independent reviewer repair what it finds, or does somebody have to ferry its findings into another conversation?
3. Can the runner wait for CI without spending another model session, while still checking the right commit?
4. Can a new, authorized answer stop an obsolete decision immediately before merge?
5. Does release have an explicit scope and verifiable conditions, separate from a model's completion message?

[DORA's delivery metrics](https://dora.dev/guides/dora-metrics/) look at throughput alongside instability, including deployment rework. I need both kinds of evidence too. The week's PR and Release counts establish that this workflow is active; they do not tell me whether a change was worth shipping or how much repair followed it.


## Related

Read [how Orbi uses Pi](/blog/orbi-on-pi-coding-agent/), [an independent reviewer refusing a delivery](/blog/what-autonomous-actually-means/), the [Claude Code comparison](/compare/claude-code/?ref=blog-hi-freq), and [Orbi Cloud](/cloud/?ref=blog-hi-freq).
