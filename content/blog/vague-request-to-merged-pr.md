---
title: From a vague request to a merged PR with Orbi
date: 2026-11-20
summary: See how Orbi adds acceptance criteria to one-line GitHub Issues, splits larger requests into queued child tickets, and records decisions before delivery.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-vague-request-to-merged-pr-card.png
---

Orbi is an open-source system that takes a one-sentence request through code, independent review, merge and release. This post is for developers and maintainers who use coding agents with GitHub and want to queue a change in plain language. It explains how Orbi turns a vague request into acceptance criteria, or a larger request into child tickets, before delivery starts.

I'm Larry 🍀 Orbi, the creator of Orbi. The behavior here spans engine v0.7.44 through v0.7.52; the production demo requests below ran on v0.7.52.

## What Orbi checks before starting a GitHub Issue

Orbi's pre-claim check reads a queued ticket for three things:

- An observable result: what someone will see or be able to do when the change is delivered.
- An acceptance condition: a concrete way to distinguish a finished delivery from an unfinished one.
- A single outcome: one change that can be delivered on its own.

The check judges what the ticket says. Separate template headings are optional. Orbi Cloud turns it on for every connected repository. On a self-hosted engine it is off by default; set `clarify_thin_tickets = true` in `.github/orbi.toml` to use it. A model error, timeout or malformed answer is logged as a skipped check and lets delivery proceed.

Here, a claim means the runner picking up a queued ticket to work on it. When the only missing part is the acceptance condition and Orbi has a usable criteria proposal, the engine appends those criteria to the Issue body. The heading is `## Acceptance` in English or `## 验收` in Chinese.

The same claim continues to delivery. The implementation session receives the amended body from this step, without a second queue entry or approval exchange. Orbi leaves a comment beginning:

> Added the proposed acceptance criteria to this ticket.

After listing the criteria, it says:

> They are under `## Acceptance`, and this claim continues to delivery. Editing this ticket changes them.

The criteria remain editable in the Issue body. This automatic path continues immediately; it provides no approval window before implementation starts.

## A one-sentence todo request, merged in 8 minutes 33 seconds

On 19 November 2026 at 23:54:56 UTC, Issue #21 in Orbi's own production demo repository, `orbi-build/orbi-e2e-prod`, opened with the title "I lose count of my open todos". Its entire body was:

> Once the list gets long I can't tell how many are left.

At 23:58:28 UTC, Orbi added these two acceptance criteria:

> - The todo list shows how many open todos are left, and that number matches the actual count of open items
> - The count stays visible and correct once the list gets long

The first criterion defines what the count measures. The second preserves the situation that prompted the request: a long list. Both describe behavior the requester can check directly.

<figure class="post-media">
<img src="/img/blog-vague-criteria-en.webp" alt="GitHub Issue #21, I lose count of my open todos, showing the one-sentence body, two bullets under Acceptance, and the bot comment confirming the criteria were added." width="912" height="782">
<figcaption>Issue #21 after Orbi appended the criteria. This is Orbi's private demo repository, so the evidence here is a screenshot.</figcaption>
</figure>

Orbi started at 23:58:32 UTC, four seconds after adding the criteria. PR #22 opened at 00:00:17 UTC on 20 November and merged at 00:03:29 UTC after one review round. From the original sentence to merge: 8 minutes 33 seconds.

Two other production requests show the same preparation step:

| Request | Opened, UTC | Criteria added, UTC | Merged, UTC | Sentence to merge |
|---|---|---|---|---|
| #19, Chinese todo count | Nov 19, 23:46:05 | Nov 19, 23:48:42 | Nov 19, 23:52:58 | 6 min 53 s |
| #25, clear the list | Nov 20, 00:20:07 | Nov 20, 00:23:38 | Nov 20, 00:30:08 | 10 min 1 s |

Issue #19's title was "待办多了想知道还剩几个没做", with the body "待办一多就数不过来了。" The criteria came back in Chinese, matching the ticket's language.

<figure class="post-media">
<img src="/img/blog-vague-criteria-zh.webp" alt="GitHub Issue #19 with a Chinese title and one-sentence body, two Chinese criteria under 验收, and a Chinese bot comment confirming their addition." width="912" height="782">
<figcaption>The Chinese request receives Chinese acceptance criteria and a Chinese confirmation comment.</figcaption>
</figure>

Issue #25 was titled "Let me clear the whole list", with the body "The list is a mess and I want to start over." One review finding was resolved in the same session before merge. These are three recorded runs on a demo application; their elapsed times describe those requests.

## How Orbi splits a request with several outcomes

The pre-claim check can also produce a split proposal. When the ticket contains several outcomes and the proposal is usable, Orbi creates child Issues and queues them.

The public example is [Issue #2230](https://github.com/orbi-build/orbi/issues/2230). It concerned maintainers' answers to questions Orbi asks during delivery, and requested these changes:

- #2233: when an answer changes from A to B, carry out B consistently while checking stopped tickets, before merging, and during a running session.
- #2234: reuse the existing delivery PR lookup with same-repository filtering, so a close action selects the PR in the right repository.
- #2235: use one implementation to validate answer payloads.

At 13:15:11 UTC on 17 November 2026, Orbi posted:

> Split into 3 child tickets.

The comment listed #2233, #2234 and #2235, then ended:

> This ticket is now their parent (`ai-epic`) and every child is queued.

<figure class="post-media">
<img src="/img/blog-vague-split-comment.webp" alt="Orbi's GitHub comment saying Split into 3 child tickets, listing #2233, #2234 and #2235, and confirming their parent is ai-epic and every child is queued." width="912" height="443">
<figcaption>The split comment on public Issue #2230 names each queued child.</figcaption>
</figure>

Each child gets its own result and acceptance criteria. Orbi attaches the children using GitHub's native sub-issues, then applies the queue label after linking them. The parent receives `ai-epic` and loses `ai-ready`; delivery proceeds through the children, with no PR for the parent.

A split must have at least two children. There is no fixed maximum: the instruction is to use the fewest slices that cover every goal. If a child depends on another, the proposal can refer to an earlier item, and Orbi records that dependency through GitHub's native `blockedBy` relationship. Children also inherit the parent's milestone and its `p0` or `bug` labels when present.

At 16:56:06 UTC that day, the parent recorded:

> Epic reconciliation: complete; children: Issue #2233 closed, Issue #2234 closed, Issue #2235 closed

<figure class="post-media">
<img src="/img/blog-vague-subissues.webp" alt="GitHub's Sub-issues panel on Issue #2230 showing 3 of 3 completed, with closed children #2233, #2234 and #2235." width="912" height="250">
<figcaption>The native GitHub panel shows all three children completed.</figcaption>
</figure>

The [public proof page for #2233](https://orbi.build/proof/orbi-build/orbi/2233?ref=blog-vague) follows one child through delivery.

When required detail is missing and no usable proposal can supply it, Orbi explains the missing detail, removes the queue label and adds `ai-needs-detail`.

## What happens in "Write a request" on Orbi Cloud

Preparation can begin before a GitHub Issue exists. In Orbi Cloud's "Write a request", when Orbi's drafting session proposes a question with a recommended option, the engine chooses that option itself. This behavior shipped in engine v0.7.44.

The engine feeds the decision into the same drafting session. Its instructions require each decision to appear under `Assumptions` in the affected Issue, saying what was chosen and why; the reply also lists the decisions. Questions without a recommended option go to the person.

An explicit request such as "only explain" or "don't touch the code" takes the reply-only route. Orbi returns what it found without drafting or creating an Issue.

For what happens after an active delivery stops, see [how Orbi handles a stuck delivery](/blog/stuck-delivery-one-click/).

## How to get the most out of a one-line request

State the visible result you need. The todo examples give Orbi something concrete to turn into an acceptance condition: knowing how many items remain, or starting over with an empty list.

Keep one change in each request. If you already know the work has separate outcomes, write separate requests; Orbi's split path handles a combined ticket when its pre-claim check identifies those outcomes.

Keep the ticket's acceptance criteria aligned with the result you want. You can edit the appended criteria directly in the Issue body. The implementation session receives the amended body at delivery start.

## Related

- [Write a request in Orbi Cloud](/blog/write-a-request/)
- [Agentic software development beyond one session](/blog/high-frequency-agent-development/)
- [When a delivery gets stuck](/blog/stuck-delivery-one-click/)
- [Compare Orbi with coding agents](/compare/?ref=blog-vague)
- [Orbi Cloud](/cloud/?ref=blog-vague)
