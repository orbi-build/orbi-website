---
title: From a vague request to a merged PR with Orbi
date: 2026-11-20
summary: Three real requests show how Orbi writes acceptance criteria into a one-line GitHub Issue, splits multi-outcome requests, and still merges in minutes.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-vague-request-to-merged-pr-card.png
mirror: vague-request-to-merged-pr
---

Most requests people hand to a coding agent are one sentence long, and one sentence rarely says when the work counts as done. Orbi is an open-source system that turns a GitHub Issue into a merged pull request: you add the `ai-ready` label, an AI coding session writes the change, a second session reviews it against the Issue and CI, and Orbi merges. This post shows what Orbi does before any code is written when the Issue is too thin or asks for several things at once, using three real requests, and it ends with what that means for how you write one.

I'm Larry 🍀 Orbi, the creator of Orbi.

Orbi Cloud is the hosted version that runs the open-source engine for you, and its "Write a request" page can draft the Issue and queue it for you. Orbi tracks each Issue with GitHub labels: `ai-ready` queued, `ai-in-progress` being worked on, `ai-blocked` stopped, `ai-fix-needed` another round on an existing pull request, `ai-merged` done.

## The check before work starts

When Orbi's scheduler picks up a queued Issue, which Orbi calls claiming it, a model first reads the Issue for three things:

- an observable result: what someone will see or be able to do afterwards;
- an acceptance condition: a concrete way to tell finished from unfinished;
- a single outcome: one change that can be delivered on its own.

There are three ways this can go when something is missing:

- **Only the acceptance condition is missing.** Orbi writes proposed criteria into the Issue under `## Acceptance` and the same claim goes straight on to delivery.
- **The Issue asks for several things.** Orbi creates one child Issue per outcome and queues them. The parent gets the `ai-epic` label and is not delivered itself.
- **Something is missing that Orbi cannot fill in.** Orbi comments with what it needs, swaps `ai-ready` for `ai-needs-detail`, and waits. Add the detail, then swap `ai-needs-detail` back to `ai-ready` to queue it again.

The check reads what the Issue says, so you do not need a template. If the check itself errors or times out, Orbi skips it and delivers anyway, so a broken check never blocks work. Orbi Cloud turns the check on for every connected repository; on a self-hosted engine it is off until you set `clarify_thin_tickets = true` in `.github/orbi.toml` (engine v0.7.44 or later).

## A one-line todo request, merged in 8 minutes 26 seconds

Orbi's demo repository holds a small todo app. It is private, it runs on Orbi Cloud's production service, and I opened the three requests below myself. They are small changes on a small app, not a benchmark.

Issue #21 was titled "I lose count of my open todos". Its whole body was one sentence:

> Once the list gets long I can't tell how many are left.

Three and a half minutes after it was opened, at 23:58:28 UTC, Orbi had claimed it and written two acceptance criteria into the Issue:

> - The todo list shows how many open todos are left, and that number matches the actual count of open items
> - The count stays visible and correct once the list gets long

The second criterion keeps the situation the person described, a long list, which a quick fix could easily ignore.

<figure class="post-media">
<img src="/img/blog-vague-criteria-en.webp" alt="GitHub Issue #21, I lose count of my open todos, showing the one-sentence body, two bullets under Acceptance, and Orbi's comment confirming the criteria were added." width="912" height="782">
<figcaption>Issue #21 after Orbi added the criteria. The repository is private, so this is a screenshot.</figcaption>
</figure>

Four seconds later a coding session started from the amended Issue. PR #22 opened at 00:00:12 UTC on 20 November, changing `index.html` and two test files (+28/−1). The review session checked it against the two criteria and CI, and Orbi merged it after one review round at 00:03:22 UTC, 8 minutes 26 seconds after the sentence was written.

Two more requests went the same way. #19 asked for the same count in Chinese ("待办一多就数不过来了。", roughly "once there are many todos I can't keep count"). #25, "Let me clear the whole list", said only "The list is a mess and I want to start over."; its review session fixed one finding on the same branch and then passed it, all within one review round.

| Request | Opened | Criteria added | Merged | Opened to merged |
|---|---|---|---|---|
| #19, todo count (Chinese) | Nov 19, 23:46:05 | Nov 19, 23:48:42 | Nov 19, 23:52:52 | 6 min 47 s |
| #21, todo count | Nov 19, 23:54:56 | Nov 19, 23:58:28 | Nov 20, 00:03:22 | 8 min 26 s |
| #25, clear the list | Nov 20, 00:20:07 | Nov 20, 00:23:38 | Nov 20, 00:30:02 | 9 min 55 s |

Times are UTC in 2026; "Opened" is when the Issue was created and "Merged" is when its pull request merged. The gap before "Criteria added" includes waiting to be picked up.

The criteria come back in the repository's configured message language, not the language of the request. The demo repository is set to Chinese, which is why #19 got Chinese criteria; I switched it to English messages for #21 and #25.

<figure class="post-media">
<img src="/img/blog-vague-criteria-zh.webp" alt="GitHub Issue #19 with a Chinese title and one-sentence body, two Chinese criteria under 验收, and Orbi's Chinese comment confirming their addition." width="912" height="782">
<figcaption>Issue #19, with the repository set to Chinese messages.</figcaption>
</figure>

## Who sees an edit, and when

The criteria Orbi writes are a proposal you can edit, and edits keep working after the coding session has started. While it runs, Orbi checks the Issue body every 60 seconds by default. When someone with write access changes it, Orbi restarts the coding session with the new text, up to three times by default. After that Orbi says on the Issue that the correction was not applied, and the running session carries on with what it has; review still reads the latest body. The review session reads the current Issue body fresh on every review round and treats it as the authoritative acceptance criteria, so the review checks whatever the Issue says at that point.

Editing mid-run costs a restart, though, and in #21 the coding session started four seconds after the criteria appeared. If the exact definition of done matters to you, the cheaper path is to write your own acceptance criteria into the Issue before you add `ai-ready`; if they give a concrete way to tell done from not done, Orbi uses them instead of proposing its own.

## When one request is really two

A request in Orbi Cloud's own repository on 18 November asked to make the test suite faster in two ways: stop loading the test database in every test file, and run more tests in parallel on CI. At 17:26:06 UTC Orbi split it into two child Issues, one for each change, without anyone asking it to. Each child got its own acceptance criteria and its own delivery, and both were merged the next day. That repository is private and writes Chinese messages:

<figure class="post-media">
<img src="/img/blog-vague-split-auto-zh.webp" alt="Orbi's Chinese comment saying the Issue was split into two child Issues, #3508 and #3509, with the parent now ai-epic and both children queued; no maintainer command precedes it." width="922" height="382">
<figcaption>The automatic split on 18 November.</figcaption>
</figure>

The children are GitHub's native sub-issues, and Orbi links them before queuing them. A split always has at least two. If one child depends on another, Orbi records it with GitHub's native `blockedBy` relationship, so the order is visible on GitHub. Children inherit the parent's milestone and its `p0` or `bug` labels. Splitting this way used to wait for a maintainer to reply `/orbi split`; since engine v0.7.44 Orbi does it itself whenever the check is on (always, on Orbi Cloud).

## Questions while drafting

"Write a request" is the page in Orbi Cloud where you describe a change in a sentence and Orbi reads your repository and drafts the Issue. While drafting, Orbi sometimes reaches a decision with a recommended option. In that case it takes the recommendation and records what it chose and why under the Issue's `Assumptions` section; only decisions without a recommendation come back to you as questions. If your message only asks for an explanation, you get an answer and no Issue is created.

## Writing a request Orbi can deliver

- Say what you want to see, such as the number of todos left or an empty list after clearing. A visible result is what Orbi turns into acceptance criteria.
- If you already know a request has separate parts, open separate Issues. You decide the order: mark the later one as `blockedBy` the earlier one on GitHub, or add `ai-ready` to the second only after the first merges.
- If the definition of done matters, write the criteria yourself before adding `ai-ready`. You can still edit them later, at the cost of a restart.

What happens after delivery starts and then stops is covered in [When an AI coding run stops and needs your answer](/blog/stuck-delivery-one-click/).

## Related

- [Write a request in Orbi Cloud](/blog/write-a-request/)
- [Agentic software development beyond one session](/blog/high-frequency-agent-development/)
- [When an AI coding run stops and needs your answer](/blog/stuck-delivery-one-click/)
- [Compare Orbi with coding agents](/compare/?ref=blog-vague)
- [Orbi Cloud](/cloud/?ref=blog-vague)
