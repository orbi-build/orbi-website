---
title: From a vague request to a merged PR with Orbi
date: 2026-11-20
summary: Real runs show Orbi adding acceptance criteria to one-line GitHub Issues, splitting larger requests into queued child tickets and recording its decisions.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-vague-request-to-merged-pr-card.png
mirror: vague-request-to-merged-pr
---

Orbi is an open-source system that takes a one-sentence request through code, independent review, merge and release. If you use coding agents with GitHub and want to queue a change in plain language, these real runs show how Orbi turns a vague request into acceptance criteria, or a larger request into child tickets, before delivery starts.

I'm Larry 🍀 Orbi, the creator of Orbi. The behavior here spans engine v0.7.44 through v0.7.52; the production demo requests below ran on v0.7.52.

## What Orbi checks before starting a GitHub Issue

Orbi's pre-claim check reads a queued ticket for three things:

- An observable result: what someone will see or be able to do when the change is delivered.
- An acceptance condition: a concrete way to distinguish a finished delivery from an unfinished one.
- A single outcome: one change that can be delivered on its own.

The check judges what the ticket says. Separate template headings are optional. Orbi Cloud turns it on for every connected repository. On a self-hosted engine it is off by default; set `clarify_thin_tickets = true` in `.github/orbi.toml` to use it. A model error, timeout or malformed answer is logged as a skipped check and lets delivery proceed.

Here, a claim means the runner picking up a queued ticket to work on it. When the only missing part is the acceptance condition and Orbi has a usable criteria proposal, the engine appends those criteria to the Issue body. The criteria, their heading (`## Acceptance` or `## 验收`) and Orbi's comment are written in the repository's configured message language, English or Chinese, regardless of the ticket's language.

The same claim continues to delivery right away. The implementation session receives the amended body from this step, without a second queue entry or approval exchange. Orbi leaves a comment beginning:

> Added the proposed acceptance criteria to this ticket.

After listing the criteria, it says:

> They are under `## Acceptance`, and this claim continues to delivery. Editing this ticket changes them.

## A one-sentence todo request, merged in 8 minutes 26 seconds

On 19 November 2026 at 23:54:56 UTC, Issue #21 in Orbi's own production demo repository, `orbi-build/orbi-e2e-prod`, opened with the title "I lose count of my open todos". Its entire body was:

> Once the list gets long I can't tell how many are left.

At 23:58:28 UTC, Orbi added these two acceptance criteria:

> - The todo list shows how many open todos are left, and that number matches the actual count of open items
> - The count stays visible and correct once the list gets long

The first criterion defines what the count measures. The second preserves the situation that prompted the request: a long list.

<figure class="post-media">
<img src="/img/blog-vague-criteria-en.webp" alt="GitHub Issue #21, I lose count of my open todos, showing the one-sentence body, two bullets under Acceptance, and the bot comment confirming the criteria were added." width="912" height="782">
<figcaption>Issue #21 after Orbi appended the criteria. This is Orbi's private demo repository, so the evidence here is a screenshot.</figcaption>
</figure>

Orbi started at 23:58:32 UTC, four seconds after adding the criteria. PR #22 opened at 00:00:12 UTC on 20 November and merged at 00:03:22 UTC after one review round. From the original sentence to merge: 8 minutes 26 seconds. Times in this section are the Issue's creation time and the PR's merge time as GitHub records them.

Two other production requests show the same preparation step:

| Request | Opened, UTC | Criteria added, UTC | Merged, UTC | Sentence to merge |
|---|---|---|---|---|
| #19, Chinese todo count | Nov 19, 23:46:05 | Nov 19, 23:48:42 | Nov 19, 23:52:52 | 6 min 47 s |
| #25, clear the list | Nov 20, 00:20:07 | Nov 20, 00:23:38 | Nov 20, 00:30:02 | 9 min 55 s |

Issue #19's title was "待办多了想知道还剩几个没做", with the body "待办一多就数不过来了。" The demo repository's message language is Chinese, so the criteria and comment came back in Chinese. For #21 and #25 the repository was temporarily switched to English messages, which is why those two runs answered in English.

<figure class="post-media">
<img src="/img/blog-vague-criteria-zh.webp" alt="GitHub Issue #19 with a Chinese title and one-sentence body, two Chinese criteria under 验收, and a Chinese bot comment confirming their addition." width="912" height="782">
<figcaption>Issue #19 in the demo repository, whose message language is Chinese.</figcaption>
</figure>

Issue #25 was titled "Let me clear the whole list", with the body "The list is a mess and I want to start over." One review finding was resolved in the same session before merge. These are three recorded runs on a demo application; their elapsed times describe those requests.

## How Orbi splits a request with several outcomes

The pre-claim check can also produce a split proposal. When the ticket contains several outcomes and the proposal is usable, Orbi creates child Issues and queues them in the same claim. Before engine v0.7.44 the proposal waited for a maintainer to reply `/orbi split`; since v0.7.44 the engine applies it itself.

A public example from the earlier flow shows what the children look like. [Issue #263](https://github.com/xqliu/orbi-e2e-2609260042/issues/263) in a public test repository asked for three CLI changes in one sentence: `export` should take `--email`, `summary` should take `--by-month`, and `refunds-summary` should count per week instead of per month.

<figure class="post-media">
<img src="/img/blog-vague-split-request-263.webp" alt="GitHub Issue #263 with a one-sentence body asking for three CLI changes, labeled ai-epic, and a Sub-issues panel listing #266, #267 and #268, all closed." width="922" height="525">
<figcaption>Issue #263: one request, three native sub-issues.</figcaption>
</figure>

On 28 October 2026 at 14:20:04 UTC, after the `/orbi split` reply, Orbi posted "Split into 3 child tickets." and listed #266 (`export --email`), #267 (`summary --by-month`) and #268 (weekly refunds), ending with:

> This ticket is now their parent (`ai-epic`) and every child is queued.

<figure class="post-media">
<img src="/img/blog-vague-split-comment-263.webp" alt="Orbi's GitHub comment saying Split into 3 child tickets, listing #266, #267 and #268, and confirming the parent is ai-epic and every child is queued." width="922" height="322">
<figcaption>The split comment on Issue #263.</figcaption>
</figure>

#266 was delivered and its PR merged at 14:36:05 UTC, 16 minutes after the split. #263 was a test ticket, so #267 and #268 were closed by hand without delivery.

With v0.7.44 and later, the same comment appears without the `/orbi split` reply. On 18 November at 17:26:06 UTC, a speed-up ticket in Orbi Cloud's own repository was split into two children this way, one for test setup time and one for running tests in parallel on CI. Both were delivered and merged by 02:42:40 UTC the next morning. That repository is private and writes Chinese messages, so here is a screenshot:

<figure class="post-media">
<img src="/img/blog-vague-split-auto-zh.webp" alt="Chinese Orbi comment on a private Orbi Cloud Issue saying it was split into 2 child tickets, #3508 and #3509, with the parent now ai-epic and both children queued; no maintainer command precedes it." width="922" height="382">
<figcaption>An automatic split on 18 November, in a repository whose message language is Chinese.</figcaption>
</figure>

Each child gets its own result and acceptance criteria. Orbi attaches the children using GitHub's native sub-issues, then applies the queue label after linking them. The parent receives `ai-epic` and loses `ai-ready`; delivery proceeds through the children, with no PR for the parent.

A split must have at least two children. The engine sets no maximum of its own and asks for the fewest slices that cover every goal; GitHub allows up to 100 sub-issues per parent. If a child depends on another, the proposal can refer to an earlier item, and Orbi records that dependency through GitHub's native `blockedBy` relationship. Children also inherit the parent's milestone and its `p0` or `bug` labels when present.

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
