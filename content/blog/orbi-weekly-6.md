---
title: Orbi weekly #6: write one sentence, Orbi starts
date: 2026-11-12
summary: Write one sentence and Orbi starts. Empty repositories can start from an example.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-6-card.png
mirror: orbi-weekly-6
series: newsletter
---

This is issue 6 of the Orbi weekly email as it went to subscribers on 12 November 2026. Prices, free allowances and screens are as of that day; see [Orbi Cloud](/cloud/?ref=blog-nl06) for how things stand now.

Hi, I'm Lawrence, and I build Orbi. Tell Orbi what you want changed, and it takes the request all the way to a release: an AI agent writes the code, a separate AI reviews it, and Orbi merges and ships it.

[Write a request →](/cloud/?ref=blog-nl06)

Haven't connected a repository? Sign in with GitHub and pick one first. Drafting is free; a run counts only when its pull request merges.

Starting this week, one sentence on the request page is enough. Orbi writes the draft, opens the Issue and starts, and you don't confirm anything.

It asks only when it really can't decide. You get a few options with the recommended one already picked, so one click usually does it, and an email goes out at the same time.

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl06/draft-en-v2.gif" alt="Request page: typing &quot;Add a Clear all button under the list that removes every note&quot; and clicking &quot;Draft the request&quot;; once the draft is written, the page shows &quot;Handed off to Orbi, Queued, View on GitHub (Issue #1)&quot; with no extra confirmation click." width="600" height="632" loading="lazy" style="max-width:524px">
<figcaption>Recorded in our test environment. By the last frame, the request is already queued.</figcaption>
</figure>

Task ideas on the status page now start with one click too. For the fastest first look at Orbi, pick the one tagged "About 10 minutes to a PR".

Issues and pull requests stay in your own GitHub repository. Orbi merges once its review passes. If you'd rather approve merges yourself, add a branch protection rule.

## Empty repositories start right away

Connect a brand-new empty repository and the status page asks what you want to build, with two ready-made examples: a to-do list page and a calculator page. Click one and Orbi gets to work in that repository.

## Four hands-on posts this week

- [Best AI agent for coding: test them on your own repo](https://orbi.build/blog/best-ai-agent-for-coding/?ref=blog-nl06)
- [OpenCode vs Codex CLI: same model, headless](https://orbi.build/blog/opencode-vs-codex/?ref=blog-nl06)
- [systemd to launchd: what 1,548 macOS CI runs caught](https://orbi.build/blog/systemd-to-launchd/?ref=blog-nl06)
- [Cursor alternatives: editors, agents and who merges](https://orbi.build/blog/cursor-alternatives/?ref=blog-nl06)

## What Orbi did for itself this week

From November 5 to 11, Orbi merged 148 of its own pull requests across the engine, Cloud and the website, 95 of them in Cloud. The engine and Cloud shipped 13 releases between them.

## Running the engine yourself?

On v0.7.41, `orbi draft` behaves like the request page. Choices with a sensible default go straight into the request's Assumptions. It asks only what it must, with 2 to 4 options per question and the recommended one first.

## Other updates

- The first-merge email now arrives the moment your first pull request merges, with its title and link. All notification emails got a cleaner layout too, with long URLs tucked behind short labels.
- If a ticket stopped because the Orbi app was missing a permission, approving that permission on GitHub is enough. The ticket picks up again by itself.
- Tickets that have to happen in order can all get `ai-ready` at once. Mark the order with GitHub's "blocked by" and Orbi won't touch a ticket until its blocker is closed.
- You can click Subscribe before signing in or installing the app. Afterwards you land back on the payment page with your email filled in, and the status page shows your subscription as active as soon as you pay.

Questions are welcome in our user group. [Join the Orbi Telegram group →](https://t.me/+kJRTTpFGBRU0M2Y9)

Lawrence  
Founder of Orbi

## Related

- [Orbi weekly, every issue](/guides/newsletter/)
- [How Orbi compares with other coding agents](/compare/)
- [Orbi Cloud](/cloud/?ref=blog-nl06)
