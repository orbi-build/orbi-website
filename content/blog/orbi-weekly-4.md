---
title: Orbi weekly #4: vague tickets come back with a plan
date: 2026-10-29
summary: A rough request now comes back with a plan, a red base branch pauses with a fix path, and Orbi merged 60 PRs in 2.5 days for its first heavy user.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-4-card.png
mirror: orbi-weekly-4
series: newsletter
---

This is issue 4 of the Orbi weekly email as it went to subscribers on 29 October 2026. Prices, free allowances and screens are as of that day; see [Orbi Cloud](/cloud/?ref=blog-nl04) for how things stand now.

Hi, I'm Lawrence. This week Orbi started answering a vague request with a plan, and Orbi Cloud got its first heavy outside user: in two and a half days, Orbi merged 60 pull requests into their repository, 29 on the busiest day.

[Write a request →](/cloud/?ref=blog-nl04)

Describe the change in a sentence. Orbi drafts it, and work starts only when you hand it off. If no repository is connected yet, it walks you through that first.

## A rough request now comes back with a plan

When a ticket mixes several things, or never says how to tell it's done, Orbi used to stop and ask you to fill it in. Now it answers with a plan in the comment: either how to split the ticket, with acceptance criteria for each part, or the acceptance criteria the ticket was missing.

If something's off, edit that comment on GitHub. When it looks right, reply `/orbi split` to a split plan or `/orbi amend` to acceptance criteria. Orbi then follows the comment's current text. The same plan also appears as a card on your project page. "Edit" there only changes the plan; work starts when you press "Split it like this" or "Start with these".

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl04/split-card-en.gif" alt="Animation on the Orbi project page: a card says Orbi suggests splitting the ticket into 3 tickets, each with acceptance criteria; Edit opens the plan as text; after Split it like this the card says Submitted, Orbi is working on it; then the task history shows the three new tickets, the first in progress and the other two queued." width="932" height="953" loading="lazy" style="max-width:524px">
</figure>

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl04/amend-card-en.gif" alt="Animation: a card says Orbi drafted the acceptance criteria and lists them; after Start with these it says Submitted; then Orbi&#x27;s GitHub comment says it added the criteria under ## Acceptance and queued the ticket." width="932" height="842" loading="lazy" style="max-width:524px">
</figure>

## When the base branch is already red

If a check was already failing on your base branch, even a correct pull request can't merge. Orbi now pauses the ready pull request and lists the failing checks. You can fix the base branch yourself, or reply `/orbi fix-base` (needs write access to the repository) and Orbi opens a repair Issue for each failing check. Once the base branch is green, Orbi merges the original pull request and updates the same comment.

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl04/fixbase-en.png" alt="Orbi&#x27;s comment on GitHub: PR #216 is ready, review passed and tests pass; paused because the base branch main is already failing test (20) and test (22), not caused by this PR; links to the two failing runs; next steps: fix main yourself, or comment /orbi fix-base and Orbi opens a fix Issue." width="499" height="530" loading="lazy" style="max-width:499px">
</figure>

## Queued requests, handled in order

The same heavy user often queues a long list of Issues at once. Requests with the same priority now run in queue order; top-priority requests and Issues labeled as bugs go first.

## A project status link in every comment

Orbi's comments on Issues and pull requests now include a "Project status" link that opens the repository's page in Orbi.

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl04/status-link-en.gif" alt="First, Orbi&#x27;s comment on GitHub with the line Project status: Open project status. Clicking it opens the Orbi project page, which says Orbi is checking change #216 and merges it into your project when it passes, with the current progress." width="500" height="292" loading="lazy" style="max-width:500px">
</figure>

## Orbi refactored itself

The open-source engine merged 21 refactoring pull requests this week, 20 of them delivered by Orbi. The main scheduler file went from 4,059 to 3,060 lines, and the codebase now has 84 modules, up from 63.

## Talk to me

The project, connect and write-a-request pages now have a chat window in the bottom-right corner. If something is unclear, ask right there.

You can also find me in the user group, or message me there privately. [Join the Orbi Telegram group →](https://t.me/+kJRTTpFGBRU0M2Y9)

Lawrence  
Founder, Orbi

Screenshots and animations are from the test environment and my test repository.

## Related

- [Orbi weekly, every issue](/guides/newsletter/)
- [How Orbi compares with other coding agents](/compare/)
- [Orbi Cloud](/cloud/?ref=blog-nl04)
