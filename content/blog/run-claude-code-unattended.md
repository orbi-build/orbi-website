---
title: Run Claude Code unattended: headless is step one
date: 2026-10-01
summary: claude -p gets a coding agent running with nobody watching. Picking the work, reviewing it, merging it and shipping it are still yours to build. Here is that list, with the times it went wrong in Orbi's own repository.
lang: en
author: Orbi
image: /img/blog-headless-card.png
mirror: run-claude-code-unattended
---

Running Claude Code with nobody watching takes one flag. `claude -p` runs a prompt non-interactively and exits non-zero if the run fails. Give it a permission mode and it stops asking you things:

```bash
claude -p "Fix the failing test in tests/test_auth.py" \
  --permission-mode auto --permission-prompts none
```

Put that in a cron job and the agent works while you sleep. The [headless docs](https://code.claude.com/docs/en/headless) cover the rest of the flags: `--allowedTools` to pre-approve tools, `--output-format json` for scripts, and `--bare` so the run ignores whatever hooks and MCP servers happen to be on the machine.

What you have at that point is one session that runs to the end on its own. Deciding what it should work on, and what to do with the result, is still on you.

## What a cron job doesn't answer

Orbi has been delivering its own GitHub Issues unattended since late August. As of today, 599 Issues in [its repository](https://github.com/orbi-build/orbi) carry the `ai-merged` label, and v0.5.58 went out on September 30. Getting there meant answering the questions below, mostly by getting them wrong first. A loop around `claude -p` answers none of them.

### Which task, and only once

Something has to pick the next Issue and keep two runs from grabbing the same one. In Orbi a person adds the `ai-ready` label. The runner claims the Issue by swapping that label for `ai-in-progress` and creates a worktree from a pinned base commit. Urgent Issues go first, then bugs.

Every step is written back to the Issue, so the queue is the GitHub Issue list and the log is the Issue's own timeline. Nothing about a run lives only on the machine that ran it.

### Which account it runs as

A `-p` session shows no workspace trust dialog. Without `--bare` it runs the project's hooks and MCP servers, even in a folder you have never opened. Nobody approves anything, so the operating system user it runs as is the only boundary left. In Orbi Cloud every connected repository gets its own Unix user. I got this wrong once, shipped 1,164 lines of hardening, and reverted it the same afternoon. That story is in [GitSpawn and the agent that never asks](/blog/gitspawn-unattended-agent/).

### Who reviews it

If the session that wrote the change also gets to say it's done, nothing was reviewed. Orbi starts a separate session that reads the exact base and head commits against the Issue's acceptance criteria. It fixes what it finds and ends with a verdict, which is posted on the Issue next to the test count.

### When it may merge

CI that passed on an older commit tells you little about the one you're merging. So right before merging, Orbi checks that the verdict names the current PR head, that the head contains the latest base branch, that CI has finished, and that GitHub reports the PR as mergeable. If CI is still running, the merge waits for the next pass. The [auto-merge guide](/guides/auto-merge-ai-prs/) goes through each condition.

That list had a hole until two days ago. On September 29 I labelled an Issue `ai-blocked` and commented that its PR must not be merged. Seventy seconds later the runner merged it. The gate re-read the base, the head and CI, but never the Issue's labels, so a label added during review was ignored. We reverted the merge and filed [#1504](https://github.com/orbi-build/orbi/issues/1504):

![Issue #1504 on GitHub: the timeline of a merge that happened 70 seconds after a maintainer labelled the Issue ai-blocked, and the cause, merge_gate never re-reading the Issue's labels](/img/headless-1504-bug.webp)

Eight hours later Orbi claimed the Issue, opened [PR #1505](https://github.com/orbi-build/orbi/pull/1505), passed its own review with no findings and merged 45 minutes after the claim. Now the gate reads the labels one last time, and an `ai-blocked` Issue stops the merge.

![The end of the #1504 timeline: Orbi opened PR #1505, merged it after one review round, and swapped ai-pr-opened for ai-merged](/img/headless-1504-merged.webp)

A loop that ends in `gh pr merge` would have the same hole. You find out when someone tries to stop it.

### What happens when it fails

Runs fail a lot. What matters is where a failed run goes next. If Orbi can recover, the Issue moves to `ai-fix-needed` and the next pass picks up the same branch and the same PR instead of opening a new one. If a person has to decide, it stops at `ai-blocked` and says why on the Issue.

On September 28, the first run on [#1482](https://github.com/orbi-build/orbi/issues/1482) finished without a single commit. Orbi didn't open an empty PR. It labelled the Issue `ai-blocked` and wrote what had happened:

![Issue #1482: Orbi started Pi, then posted "Orbi blocked, waiting on a human decision": the agent delivered no commit and HEAD is still the frozen base](/img/headless-1482-blocked.webp)

I read it, decided the Issue itself was fine, and removed the label. The second run opened [PR #1491](https://github.com/orbi-build/orbi/pull/1491), and it was merged the same day. That is about as much as a person should have to do when a run fails: read one comment and make one decision.

### Who ships it

Nobody gets a merged PR until it's in a release. In Orbi a release is an Issue too, labelled `ai-release`. It names the version and the milestone. Orbi waits until everything else in that milestone is closed, then tags the release once CI passes on the release commit. Here is the one for v0.5.58, which shipped the #1504 fix:

![Issue #1508, Release v0.5.58: the scope is milestone v0.5.58, the Release block names version, base branch and version file, and Orbi claimed it with ai-in-progress](/img/headless-1508-release.webp)

## The step we still do by hand

On September 25, Orbi merged [a mobile table fix](https://github.com/orbi-build/orbi-website/pull/523) for this website. Its tests checked every table page for horizontal overflow, and all of them passed. Then we opened a screenshot at 390px.

![The Orbi vs Devin pricing table at 390px with PR #523's CSS put back, reproduced on today's page: "Free" breaks after "Fre", and "Individual" runs over four lines](/img/headless-table-before.webp)

That image is a reproduction: today's page with PR #523's rules put back, so the prices are current.

Across 25 pages, 193 words were cut in the middle. The tests measured overflow correctly. Nobody had asked them about words.

We filed the fix as a new Issue with those measurements attached, and Orbi delivered it [in 32 minutes](https://github.com/orbi-build/orbi-website/pull/530):

![The same table on orbi.build today at 390px: each plan is a stacked block and every word reads whole](/img/headless-table-after.webp)

The screenshot is what caught it, so that's the part we kept. Before anything is promoted from beta to production, one of us opens the changed pages on a phone and on a desktop and looks. The agent did what the Issue asked. The Issue just didn't mention words.

## If you want to stay on Claude Code

You can build all of this around `claude -p`: labels for the queue, a lock on claims, a second session for review, a merge check, a resume path, a release job. Expect most of the effort to go into failure handling. Orbi's [workflow doc](https://github.com/orbi-build/orbi/blob/main/docs/workflow.mdx) is about 800 lines, and much of it is about what happens when a step goes wrong. #1504 was one of those, found by hand two days ago.

Or use Orbi. It doesn't run Claude Code, though. Its agent is [Pi](https://github.com/earendil-works/pi), on a ChatGPT plan or a DeepSeek API key, and Orbi's own deliveries have run on DeepSeek since September 22. If you're attached to Claude, that's a real cost. If all you need is for an Issue to come out the other end as a reviewed release, most of the work sits outside the model.

[Connect a repository to Orbi Cloud](https://orbi.build/cloud/?ref=blog-headless), or self-host the [open-source runner](https://github.com/orbi-build/orbi).

## Related

Read [Orbi vs Claude Code](/compare/claude-code/), [Claude Code in Actions: who presses merge?](/blog/claude-code-github-actions-who-merges/) and [Cloud](/cloud/).
