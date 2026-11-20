---
title: Orbi weekly #5: Orbi splits a big request for you
date: 2026-11-05
summary: Describe a big request in one sentence; Orbi splits it into several Issues and creates them when you confirm.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-5-card.png
mirror: orbi-weekly-5
series: newsletter
---

This is issue 5 of the Orbi weekly email as it went to subscribers on 5 November 2026. Prices, free allowances and screens are as of that day; see [Orbi Cloud](/cloud/?ref=blog-nl05) for how things stand now.

Hi, I'm Lawrence, and I build Orbi. Tell Orbi what you want changed, and it takes the request all the way to a release: an AI agent writes the code, a separate AI reviews it, and Orbi merges and ships it. Starting this week, you can describe a big request in one go: the request page first splits it into several Issues, then creates them all when you click "Hand off to Orbi".

[Write a request →](/cloud/?ref=blog-nl05)

Every account gets 3 free runs. Drafting is free; each Issue counts as one run once its PR is merged.

On my test repository I typed "Add --currency to refunds-summary to show a single currency, and make summary print the date range it covers as its first line." Orbi split it into two independent Issues, one per command:

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl05/split-en-3.gif" alt="The request page: a one-sentence request touching two commands; after drafting, Orbi says it split the request into 2 independent Issues; after Hand off to Orbi, the page says 2 Issues created, #320 and #321." width="932" height="925" loading="lazy" style="max-width:524px">
</figure>

## Write requests from the open-source engine too

Orbi is built on an open-source engine, and Orbi Cloud runs it for you. Request writing is part of the engine. If you run it yourself, upgrade to v0.7.32 or later and run:

`orbi draft --repo owner/repo "your request"`

It works like the request page, and creates Issues only after you confirm.

## What Orbi shipped for itself this week

From October 29 to November 4, Orbi merged 148 PRs across its own three repositories (the engine, Cloud and the website), none with a human commit before the merge, and cut 27 releases. While writing this email I found a wording bug on the request page; 51 minutes after I filed it, Orbi had merged the fix.

## Also this week

- After the first PR is merged in your repository, Orbi emails you the next tasks you could hand it.
- Once your free runs are used up, new Issues wait until you subscribe to a paid plan, and then Orbi starts on them automatically.
- For public repositories, the page listing the PRs Orbi delivered is open to search engines by default. You can turn this off on the project page.

Questions? Find me in the [Orbi Telegram group](https://t.me/+kJRTTpFGBRU0M2Y9).

Lawrence  
Founder, Orbi

## Related

- [Orbi weekly, every issue](/guides/newsletter/)
- [How Orbi compares with other coding agents](/compare/)
- [Orbi Cloud](/cloud/?ref=blog-nl05)
