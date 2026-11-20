---
title: Orbi weekly #3: Telegram alerts and Follow mode
date: 2026-10-22
summary: This week: Telegram delivery notifications and Follow mode in your terminal. Keep up with Orbi wherever you work.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-3-card.png
mirror: orbi-weekly-3
series: newsletter
---

This is issue 3 of the Orbi weekly email as it went to subscribers on 22 October 2026. Prices, free allowances and screens are as of that day; see [Orbi Cloud](/cloud/?ref=blog-nl03) for how things stand now.

Hi, I'm Lawrence, Orbi's founder. This week, you can get Orbi's delivery updates on Telegram. If you self-host, Follow mode lets you watch progress live in your terminal.

[Set up Telegram on Cloud →](/cloud/?ref=blog-nl03)

## Telegram notifications

Orbi messages you on Telegram when it gets stuck, needs more information, waits for your merge approval, or merges code. On Cloud, turn it on in [Settings](/cloud/?ref=blog-nl03). For the open-source edition, use v0.7.1 or later and follow the [setup guide](https://docs.orbi.build/configuration#notifications).

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl03/telegram-en.gif" alt="Telegram messages from Orbi: Needs your attention, Code merged, Needs your attention, and then a new Code merged message arrives. Each has the repository, number and a link." width="950" height="487" loading="lazy">
</figure>

## Follow progress in your terminal (self-hosted)

If you run the open-source edition, `orbi status --follow` shows an Issue's progress live in your terminal ([v0.7.0 release notes](https://github.com/orbi-build/orbi/releases/tag/v0.7.0)).

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl03/follow-en.gif" alt="Terminal output of orbi status --follow: the Issue&#x27;s labels go from ai-needs-detail all the way to ai-merged." width="768" height="300" loading="lazy">
</figure>

## Progress updates on the same page

Each project's status page now updates on its own until Orbi is done. The page is also tidier: one main button per state, and setup progress shows checkmarks on a progress bar.

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl03/progress-en.gif" alt="The Current status panel updates by itself from &#x27;Orbi is coding&#x27; to &#x27;Orbi is done. Waiting for your next request&#x27;." width="534" height="160" loading="lazy">
</figure>

## Try Orbi on a sample repository first

Create a repository in your GitHub account from the official template and ask Orbi to make a small change. Here, Orbi added an item counter to the sample app: ticking off a task changes the count from 3 to 2. [Try an official sample](/cloud/?ref=blog-nl03) without using your 3 free merges.

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl03/demo-result-v3-en.gif" alt="Example request: add a remaining-item counter. In the app Orbi changed, a task is ticked off and the count changes from 3 items left to 2 items left." width="1200" height="1120" loading="lazy" style="max-width:400px">
</figure>

## Come chat with me on Telegram

Questions or ideas? Find me in our user group. [Join the Orbi Telegram group →](https://t.me/+kJRTTpFGBRU0M2Y9)

Lawrence  
Founder of Orbi

GIFs recorded in our test environment and my own test repository, sped up.

## Related

- [Orbi weekly, every issue](/guides/newsletter/)
- [How Orbi compares with other coding agents](/compare/)
- [Orbi Cloud](/cloud/?ref=blog-nl03)
