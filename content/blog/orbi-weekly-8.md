---
title: Orbi weekly #8: attach screenshots to requests
date: 2026-11-26
summary: Requests can now include screenshots, and Orbi also follows a screenshot pasted into a GitHub Issue.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-8-card.png
mirror: orbi-weekly-8
series: newsletter
---

This is issue 8 of the Orbi weekly email as it went to subscribers on 26 November 2026. Prices, free allowances and screens are as of that day; see [Orbi Cloud](/cloud/?ref=blog-nl08) for how things stand now.

Hi, I'm Lawrence, and I'm building Orbi. You say in one sentence what you want changed; Orbi writes it up as a request, one AI writes the code, another reviews it, and Orbi merges and ships a release. Starting this week, a request can include screenshots.

[Write a request →](/cloud/?ref=blog-nl08)

Sign in with GitHub, write one sentence and add a picture. If no repository is connected yet, Orbi helps you connect one first.

## Attach screenshots to a request

Paste or drop a screenshot on the request page and add one sentence. Colors, positions and layout can go in the picture.

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl08/attach-en.gif" alt="Request page: the box says only &quot;Add due dates like in the screenshot&quot;, with a sketch attached. Opened, the sketch shows due dates on the right of each todo, with &quot;Today&quot; in red. After it is handed off, the request title reads &quot;Add an optional due date to each todo, shown on the right of the row and red when due today or overdue&quot;." width="730" height="420" loading="lazy">
<figcaption>From our test repository: the request was one sentence, the "red when due" rule was only in the sketch, and Orbi put it into the request</figcaption>
</figure>

About 20 minutes later, the change was merged:

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl08/result-en.png" alt="The todo app after the merge: &quot;Reply to the client&quot; shows Today in red on the right, &quot;Write the weekly report&quot; shows Nov 28, and the form has a Due date field." width="648" height="378" loading="lazy">
</figure>

## Self-hosting? Attach files from the command line

From engine v0.7.64, add `--attach` to `orbi draft` and the screenshot, HTML or text file goes to Orbi with your request. Press Enter and the Issue is created and queued.

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl08/cli2-en.gif" alt="First a sketch: four greet_all inputs and their outputs, with commas between names, &quot;and&quot; before the last, and a stranger for an empty list. Then the terminal runs orbi draft --attach want.png &quot;Add the function shown in the screenshot&quot;; the request Orbi writes lists the four inputs and outputs; after Enter, Issue #10 is created." width="518" height="580" loading="lazy">
<figcaption>Self-hosted on my machine: the command said only "Add the function shown in the screenshot"; the inputs and outputs were only in the picture</figcaption>
</figure>

## Teammates work within their GitHub permissions

A teammate who signs in with their own GitHub account lands in your project without an invite. What they can do follows their role on the repository: Read can follow progress, Triage can send requests, and Write can also create versions. Only the project owner (an admin, for an organization) can change settings and billing. Everyone uses the billing account's quota; click your avatar at the top right to see which account that is.

## Other updates

- After you send a request, the progress stays on screen, and a refresh doesn't restart the timer.
- Creating a version also opens its Release task, so Orbi ships it once its requests are done.
- If a repository is deleted or transferred on GitHub, Orbi disconnects it within an hour and tells you why.
- A stuck request now shows one sentence on the cause and one on what to do next.
- In the past week, Orbi merged 264 pull requests it had opened itself in our own repositories, and shipped 32 versions.

## This week's posts

- [Attach a screenshot to the issue your AI agent builds](https://orbi.build/blog/attach-screenshot-to-issue/?ref=blog-nl08)
- [CLAUDE.md vs AGENTS.md: which file each agent reads](https://orbi.build/blog/claude-md-vs-agents-md/?ref=blog-nl08)
- [Claude Ship: what it automates and where it stops](https://orbi.build/blog/claude-ship/?ref=blog-nl08)
- [Pi vs omp (Oh My Pi): same model, run unattended](https://orbi.build/blog/pi-vs-oh-my-pi/?ref=blog-nl08)

Past issues are on the website: [Orbi weekly archive](https://orbi.build/guides/newsletter/?ref=blog-nl08).

Ask questions in the [Orbi Telegram group](https://t.me/+kJRTTpFGBRU0M2Y9).

Lawrence  
Founder of Orbi

## Related

- [Orbi weekly, every issue](/guides/newsletter/)
- [How Orbi compares with other coding agents](/compare/)
- [Orbi Cloud](/cloud/?ref=blog-nl08)
