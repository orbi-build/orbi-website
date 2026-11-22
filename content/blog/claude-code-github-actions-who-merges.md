---
title: Claude Code in Actions: who presses merge?
date: 2026-09-19
updated: 2026-11-23
summary: Claude Code Action can implement and review pull requests in your runner. It stops before merge and release. Here is the evidence-backed layer for both.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-claude-actions-card.png
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

## Why GitHub won't let you approve your own pull request

GitHub enforces the same rule from the other side. Its documentation says plainly that "pull request authors cannot approve their own pull requests." On a repository that requires an approving review, that approval has to come from someone else; only an admin bypass, covered below, gets around it. [Approving a pull request with required reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews)

That rule lands differently once an agent writes the code. Who counts as the author depends on how the agent reaches GitHub:

- **The agent pushes and opens the pull request with your token.** GitHub sees you as the author, so you cannot approve it. Someone else on the repository has to.
- **You assign an Issue to Copilot.** GitHub's documentation adds that you cannot approve the pull request Copilot raises for an Issue you assigned to it.
- **Copilot opens a pull request under its own app identity**, not on behalf of a person (for example, prompted from a shared Slack or Teams thread). Rulesets now require one approval more than the number you configured for these, on by default and still in public preview. [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)

Two more settings decide who can merge. "Require approval of the most recent reviewable push" means the approval must come from someone other than whoever pushed last, so a reviewer that pushes a fix to the branch cannot approve its own fix. And classic branch protection does not apply to repository admins unless "Do not allow bypassing the above settings" is turned on, so an admin can merge without the approval. [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

Orbi follows the rule rather than working around it. Its reviewer is a separate session, but the pull request and the merge come from the same GitHub identity, so an approval from Orbi would be the author approving itself. When the target branch requires one or more approving reviews, GitHub refuses Orbi's merge. Orbi then reads the branch protection behind the refusal, moves the Issue to `ai-awaiting-merge`, and posts a comment naming the pull request head and the one action needed, such as adding a different approving reviewer. Once a person approves, Orbi merges on the next tick with nothing else queued. That wait state needs a token that can read the branch protection; if it cannot, the delivery stops as `ai-blocked`, on a `merge_gate: UNKNOWN` line asking for repository administration permission. Run `orbi doctor` to see the same `merge_gate:` check for each source repository before a delivery ever reaches the merge. On my own repository I removed the required-approval rule and let the three conditions above stand in for it; a team that wants a person on every merge keeps the rule, and Orbi waits for that person.

## What a person still does

I write the Issue. That is the whole job, and it is more work than it sounds: one runtime outcome, the acceptance conditions written so that "done" is checkable by something that cannot ask me what I meant. A vague ticket produces a confident wrong delivery, and no gate downstream catches that, because the gate checks whether the code does what the ticket said.

I also write the release ticket: a version number and a scope. The release itself is a deterministic state machine, not a model session. It freezes the base, waits for green CI, bumps the version, tags, publishes and closes the milestone. Any failure stops and waits for me.

Between those two tickets, nobody is in the room.

## If you are running the action today

You do not need to replace it. The action is the execution layer; what is missing is the part that decides. Three things to add, in order of how much they buy you:

1. **A reviewer that is a different session from the implementer**, reading the frozen diff, with the authority to fail the delivery.
2. **A merge gate that re-checks CI, head and base** at merge time rather than trusting a verdict from ten minutes ago.
3. **A release path that is deterministic**, so that shipping is not a model deciding it is probably fine.

[Orbi](https://github.com/orbi-build/orbi) is my implementation of exactly that, open source (AGPL-3.0) and self-hostable, and it drives its own repository: every one of those 431 pull requests is public, and so is every review verdict, in the Issue threads. It runs on the Pi agent harness with your own model: any OpenAI-compatible API, or a Codex subscription. Claude Code is not one of its engines.

Or take the three conditions and build them into whatever you already run. The conditions matter more than whose code enforces them.


## Related

Read the [Claude Code comparison](/compare/claude-code/), [CI gates guide](/guides/ci-gates/), and [Cloud](/cloud/).
