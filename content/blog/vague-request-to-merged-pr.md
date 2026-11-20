---
title: From a vague request to a merged PR with Orbi
date: 2026-11-20
summary: Requests show how Orbi adds acceptance criteria to GitHub Issues, splits multi-outcome requests into queued children, and reviews changes before merge.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-vague-request-to-merged-pr-card.png
mirror: vague-request-to-merged-pr
---

Orbi is an open-source system that takes a GitHub Issue labeled `ai-ready` in a connected repository through a delivery session that writes code and a separate delivery session that reviews it against the Issue's acceptance criteria and CI, then merges when review passes and CI is green; a separate Release task ships versions. A short request can leave the definition of done unwritten, or combine several outcomes in one Issue. This post shows how Orbi handles both, with a design idea you can reuse: record proposed decisions in the Issue so you can edit what later review checks.

I'm Larry 🍀 Orbi, the creator of Orbi.

Orbi Cloud is the hosted version that runs the same open-source engine for you. To queue work, open an Issue in a connected repository and add the `ai-ready` label. Orbi Cloud's "Write a request" can draft the Issue and queue it for you.

Orbi tracks delivery state with GitHub labels: `ai-ready` means queued, `ai-in-progress` means delivery is running, `ai-blocked` means stopped, `ai-fix-needed` means the existing change needs further work, and `ai-merged` means merged. During review, Orbi resolves findings on the same branch before merging.

## What Orbi checks before claiming an Issue

A claim is the runner picking up a queued Issue. Before that claim proceeds to delivery, a model reads the Issue for three things:

- An observable result: what someone will see or be able to do after delivery.
- An acceptance condition: a concrete way to tell whether delivery is finished.
- A single outcome: one change that can be delivered on its own.

If something is missing, Orbi handles it as follows:

- If only acceptance criteria are missing and there is a usable proposal, Orbi appends the criteria to the Issue body and continues the same claim.
- If the Issue contains several outcomes and there is a usable split, Orbi creates and queues child Issues. The parent gets `ai-epic` and loses `ai-ready`; Orbi delivers the children, with no delivery or PR for the parent itself.
- If detail is missing and there is no usable proposal, Orbi comments with what is missing, removes `ai-ready` and adds `ai-needs-detail`. Fill in the missing detail, then add `ai-ready` again to queue the Issue.

The model judges what the Issue says, so separate template headings are optional. If the check itself errors, times out or returns a malformed answer, Orbi skips it and delivery proceeds. A failure of the check itself never blocks work.

## A one-line todo request

Acceptance criteria and comments follow the repository's configured message language. Orbi's demo repository is set to Chinese, so #19 received Chinese criteria and a Chinese comment; I switched it to English messages for #21 and #25.

Orbi's demo repository contains a small todo app; it is private, and these deliveries ran on Orbi Cloud's production service. I opened all three requests myself. These are small changes on a small app, not a benchmark.

Issue #21 was titled "I lose count of my open todos". Its entire body was:

> Once the list gets long I can't tell how many are left.

Orbi added these acceptance criteria at 23:58:28 UTC:

> - The todo list shows how many open todos are left, and that number matches the actual count of open items
> - The count stays visible and correct once the list gets long

<figure class="post-media">
<img src="/img/blog-vague-criteria-en.webp" alt="GitHub Issue #21, I lose count of my open todos, showing the one-sentence body, two bullets under Acceptance, and Orbi's comment confirming the criteria were added." width="912" height="782">
<figcaption>Issue #21 after Orbi appended the acceptance criteria.</figcaption>
</figure>

At 23:58:32 UTC, four seconds later, a delivery session read the amended Issue and began implementation. PR #22 opened at 00:00:12 UTC on 20 November and changed `index.html` plus two test files (+28/−1). A separate delivery session checked the change against the Issue's acceptance criteria and CI. Orbi merged after one review round with CI green, 8 minutes 26 seconds after the request was opened.

Issue #19 asked for a todo count with the title "待办多了想知道还剩几个没做" and the body "待办一多就数不过来了。": once there are many todos, it is hard to count what remains.

<figure class="post-media">
<img src="/img/blog-vague-criteria-zh.webp" alt="GitHub Issue #19 with a Chinese title and one-sentence body, two Chinese criteria under 验收, and Orbi's Chinese comment confirming their addition." width="912" height="782">
<figcaption>Issue #19 received criteria in the repository's configured Chinese message language.</figcaption>
</figure>

Issue #25 was titled "Let me clear the whole list", with the body "The list is a mess and I want to start over."

Column note: dates are in 2026 and clock times are UTC. "Opened" is Issue creation; "Merged" is PR merge.

| Request | Opened | Criteria added | Merged | Sentence to merge |
|---|---|---|---|---|
| #19, todo count | Nov 19, 23:46:05 | Nov 19, 23:48:42 | Nov 19, 23:52:52 | 6 min 47 s |
| #21, todo count | Nov 19, 23:54:56 | Nov 19, 23:58:28 | Nov 20, 00:03:22 | 8 min 26 s |
| #25, clear the list | Nov 20, 00:20:07 | Nov 20, 00:23:38 | Nov 20, 00:30:02 | 9 min 55 s |

## When edits reach a delivery session

Implementation starts with a delivery session reading the Issue. In #21 that was four seconds after Orbi added the criteria, so there was little time to edit them before work began. Edits do not reach that delivery session once it is running.

For every review round, a separate delivery session reads the current Issue body fresh and treats it as the authoritative acceptance criteria. Edits made before that round are what the review checks.

If you want to set the criteria yourself, write them into the Issue before adding `ai-ready`.

## How Orbi splits a request with several outcomes

On 18 November at 17:26:06 UTC, Orbi automatically split a request to speed up the test suite in Orbi Cloud's own repository. One child addressed test setup time; the other addressed running tests in parallel on CI. Both were delivered and merged the next day, by 02:42:40 UTC. The split gave the setup and CI changes their own acceptance criteria and separate deliveries. That repository is private and uses Chinese messages.

<figure class="post-media">
<img src="/img/blog-vague-split-auto-zh.webp" alt="Orbi's Chinese comment saying the Issue was split into two child Issues, #3508 and #3509, with the parent now ai-epic and both children queued; no maintainer command precedes it." width="922" height="382">
<figcaption>The automatic split on 18 November.</figcaption>
</figure>

A split needs at least two children, each with its own result and acceptance criteria so it can be delivered on its own. Orbi links them using GitHub's native sub-issues, then adds `ai-ready` after the links are in place. Dependencies between children use GitHub's native `blockedBy` relationship, which records which child must come first. Children inherit the parent's milestone and its `p0` or `bug` labels when present. The parent gets `ai-epic` and loses `ai-ready` because delivery now belongs to the children.

## "Write a request" on Orbi Cloud

"Write a request" is Orbi Cloud's page where you describe a change and Orbi reads the repository and drafts the Issue.

When Orbi poses a question with a recommended option while drafting the Issue, it answers that question itself. The drafting instructions require that choice and its reason to be recorded under the affected Issue's `Assumptions` section, so you can see what was decided. Questions without a recommended option come back to you. A request that only asks for an explanation gets a reply and no Issue.

## Writing a request

State the visible result you need, such as seeing how many todos remain or clearing the list to start over. That gives Orbi something concrete to turn into acceptance criteria.

When you already know the pieces, write separate requests so you control their order and dependencies. If the exact definition of done matters to you, write your own criteria before queueing. Later edits still steer review through the current Issue body.

Orbi Cloud enables the pre-claim check for every connected repository. On a self-hosted engine it is off by default; set `clarify_thin_tickets = true` in `.github/orbi.toml` to enable it.

Version note: automatic criteria and drafting choices require engine v0.7.44+. Before v0.7.44, a split proposal waited for a maintainer to reply `/orbi split`; since v0.7.44, Orbi applies it itself. The demo requests used v0.7.52.

## Related

- [Write a request in Orbi Cloud](/blog/write-a-request/)
- [Agentic software development beyond one session](/blog/high-frequency-agent-development/)
- [When a delivery gets stuck](/blog/stuck-delivery-one-click/)
- [Compare Orbi with coding agents](/compare/?ref=blog-vague)
- [Orbi Cloud](/cloud/?ref=blog-vague)
