---
title: Claude Code in Actions: who presses merge?
date: 2026-09-19
summary: Claude Code Action can implement and review pull requests in your runner. It stops before merge and release. Here is the evidence-backed layer for both.
lang: en
author: Orbi
image: /img/og-claude-code-github-actions-who-merges.png
---

Once [Claude Code](https://github.com/anthropics/claude-code-action) is wired into GitHub Actions, the implementation side is covered. The action answers questions, makes fixes, reviews a pull request, and posts progress to the thread. Its feature list stops there. The merge and the release still need an owner.

That boundary makes sense for a general-purpose action. It still leaves the question teams meet almost immediately: a pull request is sitting there, tests are green, Claude wrote it and Claude reviewed it. Who presses merge?

For the last month the answer on my own repository has been: nobody. 431 pull requests merged, 416 Issues walked the full delivery path, 40 releases tagged and published. I have not read the diffs. This post is what had to exist for that to be a reasonable thing to do rather than a reckless one.

## The model is not the bottleneck

The failure people expect is that the model writes something wrong. That happens, and tests catch most of it. The failure that actually costs you is different: the thing that decides "this is good enough to merge" is the same session that wrote the code, or it is a person who stopped reading carefully three weeks ago.

So the first rule is that the reviewer is not the author. Not a second pass in the same session with a different prompt: a separate process, a fresh context, started after the pull request exists, reading the frozen diff. It does not know what the implementer was thinking, which is the point. If the code needs the author's intentions to make sense, the code is not finished.

That reviewer can also fix what it finds and push to the same branch, then re-emit its verdict against the new head. A round that ends with findings is not a merge; it is another round. The loop is bounded at five rounds, and exhausting them is a stop, not a merge.

## Three conditions, checked at the moment of merge

A verdict is not enough by itself, because time passes between the review and the merge. Three things are re-checked against the live remote:

- **Continuous integration is green** on the exact head that was reviewed.
- **The head has not moved** since the verdict. A push after the review invalidates it.
- **The base is current.** The pull request must contain the latest `main`, absorbed by a plain merge, not a rebase that rewrites what was reviewed.

In the merge step that is one command, and the pin is the whole point:

```bash
gh pr merge "$PR" --squash --match-head-commit "$REVIEWED_HEAD"
```

If the remote head moved after the review, that call fails instead of merging something nobody reviewed. Only then does the merge land, pinned to that exact commit. If any condition fails the Issue moves to a state that waits for the next tick, or stops for a human. There is no path where a delivery merges because it looked fine.

These are ordinary conditions. Any team would say them out loud in a code review conversation. The difference is that they are three lines in a state machine rather than three habits in a person's head, so they hold at 3 a.m. on the ninetieth pull request.

## What a person still does

I write the Issue. That is the whole job, and it is more work than it sounds: one runtime outcome, the acceptance conditions written so that "done" is checkable by something that cannot ask me what I meant. A vague ticket produces a confident wrong delivery, and no gate downstream catches that, because the gate checks whether the code does what the ticket said.

I also write the release ticket: a version number and a scope. The release itself is a deterministic state machine, not a model session. It freezes the base, waits for green CI, bumps the version, tags, publishes and closes the milestone. Any failure stops and waits for me.

Between those two tickets, nobody is in the room.

## If you are running the action today

You do not need to replace it. The action is the execution layer; what is missing is the part that decides. Three things to add, in order of how much they buy you:

1. **A reviewer that is a different session from the implementer**, reading the frozen diff, with the authority to fail the delivery.
2. **A merge gate that re-checks CI, head and base** at merge time rather than trusting a verdict from ten minutes ago.
3. **A release path that is deterministic**, so that shipping is not a model deciding it is probably fine.

[Orbi](https://github.com/orbi-build/orbi) is my implementation of exactly that, open source (AGPL-3.0) and self-hostable, and it drives its own repository: every one of those 431 pull requests is public, and so is every review verdict, in the Issue threads. Its engine can run Claude Code, Codex or any OpenAI-compatible model underneath, so if you already have the action working, the model side of your setup does not change.

Or take the three conditions and build them into whatever you already run. The conditions matter more than whose code enforces them.


## Related

Read the [Claude Code comparison](/compare/claude-code/), [CI gates guide](/guides/ci-gates/), and [Cloud](/cloud/).
