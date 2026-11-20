---
title: Orbi weekly #1: k8e's etcd tests, sent back first
date: 2026-10-08
summary: Last week of September: the k8e etcd tests that were sent back and then merged, the Orbi plugin for Claude is out, and DeepSeek at 1M context.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-1-card.png
mirror: orbi-weekly-1
series: newsletter
---

This is issue 1 of the Orbi weekly email as it went to subscribers on 8 October 2026. Prices, free allowances and screens are as of that day; see [Orbi Cloud](/cloud/?ref=blog-nl01) for how things stand now.

This is Orbi's first weekly email. Each week: one real delivery, from ticket to merge, and what shipped in Orbi itself.

## This issue's delivery: etcd tests for k8e, sent back first

k8e is a Kubernetes distribution with an embedded etcd, 497 stars. On September 20 its maintainer, Deshi Xiao, opened #612 asking for an etcd robustness suite in four phases. At 10:28 (UTC+8) he added the `ai-ready` label, which hands a ticket to Orbi.

At 11:37 Orbi opened PR #613 with phase one only: 2,483 lines. At 13:21 the maintainer's review sent it back. All three findings said the same thing: the suite would report a correct recovery when the data had not recovered.

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl01/pr613-review-v2.png" alt="The maintainer&#x27;s review on PR #613, in Chinese: REQUEST_CHANGES." width="856" height="530" loading="lazy" style="max-width:544px">
<figcaption>The review on PR #613. He writes in Chinese; the first line says: "REQUEST_CHANGES. The tests are worth having, but the recovery oracle and the fault-observation boundary have data-correctness gaps that would let failures through."</figcaption>
</figure>

- The oracle treated a CAS with an unknown outcome as a plain write, so it accepted an impossible state.
- The recorder ran inside the etcd process the test SIGKILLs, so an acknowledged write could go unlogged.
- An empty value looked the same as a missing key, so losing an empty key still passed.

At 15:05 a single commit fixed all three. The first and third also got tests in both directions. Orbi got something wrong too: the engine insisted the PR body say `Fixes #612`, which would close a four-phase ticket after phase one. The review was right. The engine held to its rule anyway, and the runner crashed 84 times.

[Read the full write-up, with the timeline and the fixes →](https://orbi.build/blog/k8e-rejected-then-merged/?ref=blog-nl01)

## New in Orbi, last week of September

The Orbi plugin for Claude is out. Talk a task through in Claude Code or Cursor, run `/orbi:ship`, and it writes the conversation up as an ai-ready ticket with an acceptance checklist, then hands it to Orbi. `/orbi:status` shows where it is. [Install notes](https://github.com/orbi-build/orbi/tree/main/integrations/claude-plugin)

Orbi Cloud allowances went up at the same prices: Solo's monthly token allowance from 100M to 400M, Pro's from 300M to 1.2B.

The DeepSeek template capped deepseek-flash at 131,072 tokens of context, and 42% of Orbi's own deliveries hit compaction. It now uses the full 1M.

Repositories that disallow merge commits used to fail at the merge step. They merge now.

## Hand Orbi a ticket

Add the `ai-ready` label to an Issue and Orbi writes the code, gets CI green, reviews it, merges and cuts the release. Orbi Cloud comes with a 3-delivery trial, once per account, no card needed. Founding partners get 50% off for good, 6 places, with code `FOUNDING50` at checkout.

[Connect your first repository →](https://orbi.build/cloud/?ref=blog-nl01)

Prefer to run it yourself? Orbi is open source: [github.com/orbi-build/orbi](https://github.com/orbi-build/orbi).

Have a ticket you'd hand over, or stuck somewhere? Just reply to this email.

## Related

- [Orbi weekly, every issue](/guides/newsletter/)
- [How Orbi compares with other coding agents](/compare/)
- [Orbi Cloud](/cloud/?ref=blog-nl01)
