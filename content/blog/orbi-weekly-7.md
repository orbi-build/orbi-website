---
title: Orbi weekly #7: 14-day trial, hand-back, Prioritize
date: 2026-11-20
summary: The trial is now 14 days with unlimited merges, a stuck request goes back to Orbi in one click once fixed, and Prioritize moves urgent ones first.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-7-card.png
mirror: orbi-weekly-7
series: newsletter
---

This is issue 7 of the Orbi weekly email as it went to subscribers on 20 November 2026. Prices, free allowances and screens are as of that day; see [Orbi Cloud](/cloud/?ref=blog-nl07) for how things stand now.

Hi, I'm Lawrence. Orbi takes your request all the way to a release: one AI writes the code, another reviews it, and Orbi merges and ships it. This week the trial rules changed and three features shipped.

[Write a request →](/cloud/?ref=blog-nl07)

One sentence is enough. Orbi reads your code, writes the Issue and starts. If no repository is connected yet, Orbi helps you connect one first.

## The free trial is now 14 days, with unlimited merges

For 14 days after signup, merge as many pull requests as you like, with no card. Signed up before this change? If you still had free merges left, your trial runs until December 4; if you had used all 3, starting a sample task gives you 14 more days. After the trial, new deliveries pause until you subscribe, and your data stays. Model usage is capped; the details are in [Limits and quotas](https://cloud-docs.orbi.build/limits-and-quotas?ref=blog-nl07).

## Orbi now adds acceptance criteria to one-line Issues

Write one sentence on the request page, or open a one-line Issue on GitHub and add the `ai-ready` label. Either way, you no longer need to spell out acceptance criteria: Orbi adds them to the Issue, then writes the code, reviews it and merges.

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl07/criteria-en.gif" alt="GitHub Issue &quot;Let me clear the whole list&quot; with the one-line body &quot;The list is a mess and I want to start over.&quot;; then an Acceptance section with one condition appears in the body; finally the Issue shows Closed next to PR #26, which merged it." width="804" height="537" loading="lazy">
<figcaption>All GIFs here come from our test repositories. This run: criteria in under four minutes, PR merged ten minutes after the Issue was opened</figcaption>
</figure>

## Edit a stuck request, then hand it back in one click

When Orbi cannot deliver a change, it stops and your status page says why. Edit the Issue on GitHub, then choose "Fixed — let Orbi continue" on your status page; you don't need to change labels. When a question needs your call, Orbi stops and asks; pick an option on the card on your status page. Questions with a recommended answer don't stop it: Orbi goes with the recommendation, and the card shows its pick, which you can change.

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl07/stuck-en.gif" alt="A stuck Issue on the status page: the reason says Orbi delivered no change at all, with the buttons Edit the ticket on GitHub and Fixed — let Orbi continue; after the second is chosen, the card reads Handed back to Orbi: #398 will continue; this page updates by itself." width="480" height="748" loading="lazy" style="max-width:390px">
</figure>

## Prioritize moves an urgent request to the front

In your task history on the status page, choose Prioritize on a queued request. Orbi starts it as soon as the current request finishes.

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl07/prio-en.gif" alt="Task history on a phone: queued Issues #420 and #419 both show Prioritize; after Prioritize is chosen on #419, it moves to the top and reads Prioritized." width="750" height="640" loading="lazy" style="max-width:390px">
</figure>

## Other updates

- Task history filters by status, and a stopped request shows its reason when you open it.
- Proof pages, which show what Orbi did on a request, now open with working time and AI cost.
- If the same failure happens 3 times in a row, Orbi stops and hands it to you instead of retrying forever.
- Temporary GitHub errors are retried automatically; if main fails CI, Orbi opens an Issue to fix it.
- Last week Orbi merged 86 of its own PRs in our three repositories and shipped 19 releases.
- Every past newsletter is on our site: [Orbi weekly, every issue](https://orbi.build/guides/newsletter/?ref=blog-nl07).
- Self-hosting? Engine v0.7.53 has all of this; turn on the criteria step with `clarify_thin_tickets = true` in `.github/orbi.toml`.

## This week's posts

- [From a vague request to a merged PR with Orbi](https://orbi.build/blog/vague-request-to-merged-pr/?ref=blog-nl07)
- [When an AI coding run stops and needs your answer](https://orbi.build/blog/stuck-delivery-one-click/?ref=blog-nl07)
- I wrote three more hands-on posts this week: [Devin vs Cursor](https://orbi.build/blog/devin-vs-cursor/?ref=blog-nl07), [OpenCode vs Cursor](https://orbi.build/blog/opencode-vs-cursor/?ref=blog-nl07), [Cline vs Claude Code](https://orbi.build/blog/cline-vs-claude-code/?ref=blog-nl07).

Ask questions in the [Orbi Telegram group](https://t.me/+kJRTTpFGBRU0M2Y9).

Lawrence  
Founder of Orbi

## Related

- [Orbi weekly, every issue](/guides/newsletter/)
- [How Orbi compares with other coding agents](/compare/)
- [Orbi Cloud](/cloud/?ref=blog-nl07)
