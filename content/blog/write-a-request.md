---
title: Write a request: Orbi Cloud drafts your GitHub Issue
date: 2026-10-09
summary: Write a request in Orbi Cloud: describe a change, review a GitHub Issue draft, answer open questions, and hand it off. See merge controls and trial costs.
lang: en
author: Lawrence Liu
image: /img/blog-write-request-card.png
mirror: write-a-request
video_name: Write a request in Orbi Cloud: one sentence to a merged PR in 15 minutes
video_description: A 72-second narrated replay, re-rendered from the record of a real run. One sentence about a to-do list that loses everything on refresh; Orbi reads the code, asks two questions and writes the Issue. About 15 minutes from the first sentence to the merge, drafting and answering included.
video_thumbnail: /img/blog-write-request-video-en.jpg
video_upload_date: 2026-10-09
video_duration: PT1M12S
video_embed_url: https://www.youtube.com/embed/767arclz7CM
---

Orbi is a lights-out software factory for the agent era: GitHub Issues go in; reviewed, merged changes come out. Open a release ticket and Orbi tags the merged work as a release, with nobody watching the line. A coding agent works one station, writing the code in an isolated workspace. A separate AI session that did not write the code reviews the pull request. Orbi runs the whole line, from picking up an Issue labeled `ai-ready` to merging and tagging a release. Orbi Cloud is that factory, run for you on machines we operate. Unless the branch the task merges into requires an approving review, Orbi merges on its own once your CI and its review pass; more on that below. The new **Write a request** feature, part of Orbi Cloud, changes how a task starts.

Instead of writing the Issue yourself, you describe the change in a sentence or two. Orbi reads your repository, drafts the Issue, and turns the open choices it spots into questions for you. Nothing is created on GitHub until you read the draft and hand it off.

I'm Lawrence Liu, the creator of Orbi. This post walks through the feature with screenshots from real runs on October 8 and 9, in our test repository `xqliu/orbi-e2e-2609260042` on beta.orbi.build, where each release is tested before it reaches orbi.build. The feature is live on both. It follows three requests, not in the order they ran: one that needed no change, one that went from a sentence to a merged pull request, and one we set up to get stuck. The [Write a request docs page](https://cloud-docs.orbi.build/write-a-requirement) is the short reference.

If you'd rather watch first, the 72-second video below follows a fourth request, separate from the three in the screenshots. On the evening of October 9, on orbi.build itself, I opened another test repository, `orbi-build/orbi-e2e-prod`, a small to-do list web app. I typed one sentence: refresh the page and all the to-dos are gone. I didn't say which file to change. Orbi read the code and saw that the list lived only in memory. Then it asked me two multiple-choice questions: should the filter and sort order be remembered too, and what should the page do if it can't read local storage or the saved data is corrupted? I kept both recommended answers (save only the to-dos; start with an empty list, no error) and handed it off. The pull request merged 15 minutes after my first sentence: about 4 minutes of drafting and answering, about 11 after the hand-off. The screens are re-rendered from that run's saved draft, questions and timestamps, with the waits sped up, and translated, since I wrote the request in Chinese. The repository is private, so there is no Issue to link.

<figure class="post-media"><iframe src="https://www.youtube.com/embed/767arclz7CM" title="Write a request in Orbi Cloud: one sentence to a merged PR in 15 minutes" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe><figcaption>72 seconds, English narration.</figcaption></figure>

## Why let Orbi write the Issue

Orbi does what the Issue says. A one-line Issue leaves Orbi to guess which file to change, what behavior you want, and what counts as done. A wrong guess costs you rework: an unmerged pull request has to be revised, and a merged change may need reverting.

Writing a better Issue usually means knowing the code. With Write a request, Orbi reads the code first, so the draft cites real file paths, line numbers and the tests that will run, and the open choices it spots come back to you as questions before any code is written. Choices it doesn't ask about are written into the reply as assumptions.

## Where to write a request

After you sign in with GitHub and connect a repository, you land on the status page, which lists your repositories and Orbi's tasks. It has a **Write a request** button. Each connected repository is a project; if you connected more than one, pick one with **Switch project**. The page works like a chat: you send a message, Orbi answers, and you can keep going.

<figure class="post-media">
<img src="/img/blog-write-request-entry.webp" alt="The Write a request page: a text box under What would you like to change?, a Draft the request button, example requests, and at the top a Last request line with a View result button." width="1200" height="989">
<figcaption>The entry page, captured after the second request below had merged; the line at the top shows it.</figcaption>
</figure>

Write what you want in plain words. One sentence is enough. Orbi writes the Issue in the language you write in, unless the repository's AGENTS.md or CONTRIBUTING.md asks for a different one. Two exceptions for now: the Issue's first line, which says who submitted it, is always in Chinese, and section headings sometimes come out in English.

## While Orbi reads your code

Click **Draft the request** and the page shows two stages with a timer. In **Understanding your project**, it lists the files Orbi has read and the one it is reading. In **Checking against what you said**, Orbi reads its own draft again against your sentence.

<figure class="post-media">
<img src="/img/blog-write-request-working.webp" alt="Writing the draft, 0:45 elapsed. Under Understanding your project: Read CONTRIBUTING.md, Read tests/test_repository_content.py, Reading tests/test_stripe_payments.py." width="1200" height="965">
<figcaption>45 seconds into request 1, the README one.</figcaption>
</figure>

A draft usually takes one to two minutes. You can close the page; the draft is kept for 7 days after your last change, and **Write a request** on the status page, then **Open draft**, brings you back to it. Each project holds one draft at a time, so a new request replaces it.

## Request 1: nothing needed to change

The first request asked for a README section on running the repository's checks locally. Orbi read the repository and answered that the README already covers it in three places, with line numbers, plus a line in CONTRIBUTING.md. It did not write an Issue.

<figure class="post-media">
<img src="/img/blog-write-request-no-change.webp" alt="Orbi's reply: Nothing needs to change in the README for this: it already explains how to run the content checks locally, in three places. A list under What is already there cites README.md:40, README.md:30, README.md:107 and CONTRIBUTING.md." width="1200" height="989">
<figcaption>Orbi's reply to request 1.</figcaption>
</figure>


## Request 2: what a draft looks like

The next message, typed in the box under that reply, asked for something else: a bug report Issue template that asks for steps to reproduce, the expected result and the actual result. The draft that came back covers only the template.

First comes a reply. Its opening sentence says in plain words what changes for people using the repository. Technical notes and the assumptions Orbi made follow it, which is where you check how it read your request.

<figure class="post-media">
<img src="/img/blog-write-request-reply.webp" alt="Orbi's reply to the bug report request. First sentence: GitHub's new-Issue page will offer a Bug report form beside the existing User outcome one. Below it, the first technical notes behind the draft." width="1200" height="468">
<figcaption>The reply's first sentence is for anyone; the technical notes start right below it. "User outcome" is the name of the template the repository already had. "Form" is loose wording here: the draft names a Markdown template, `.github/ISSUE_TEMPLATE/bug-report.md`, and that is what merged.</figcaption>
</figure>

Then comes the draft itself, the text that becomes the Issue. It starts with your request in your own words and the outcome users should see, then lists acceptance criteria as WHEN / THEN statements. One of them covers a failure GitHub won't report: if the template's front matter is missing or malformed, GitHub silently leaves the template out of the chooser, so the draft says to check for that and how to repair it. Further down, out of view here, are the evidence a reviewer should check and the related work Orbi left out on purpose, such as a `bug` label or a README mention. **Show the full draft** expands the rest.

<figure class="post-media">
<img src="/img/blog-write-request-draft.webp" alt="The request draft card: title Add a bug report Issue template, then Request, User outcome and Acceptance sections. The acceptance list has three WHEN / THEN items, the last a failure path: when the front matter is missing or malformed, GitHub does not list the template." width="1200" height="989">
<figcaption>The draft. Once handed off, this is the Issue Orbi works from.</figcaption>
</figure>

## When Orbi isn't sure, it asks

Below the draft, under **Orbi chose these for you**, are the open choices it found. Each question has two to four options plus a free-text **Other (write your own)**, and Orbi has already picked the one it recommends. The draft above is written with those picks, so if they are right you can hand off without changing anything. When a request is too vague to draft at all, Orbi asks first and writes the draft after you answer.

<figure class="post-media">
<img src="/img/blog-write-request-questions.webp" alt="Orbi chose these for you. Question: Which language should the new bug report template use for its headings and prompts? English, like the existing one, is selected; Chinese and Bilingual are the other options, plus Other (write your own). A second question asks whether to keep the existing template and add the new one alongside." width="1200" height="989">
<figcaption>The recommended answer is preselected.</figcaption>
</figure>

A third question, further down, asked whether the new template should keep the repository's priority line, and Orbi recommended Include it. This run switched only the language answer, to Bilingual. The page then asks you to **Rewrite the draft** and greys out **Hand off to Orbi** until the rewrite finishes. **Undo your changes** puts Orbi's recommended answers back and clears anything you typed but haven't sent.

<figure class="post-media">
<img src="/img/blog-write-request-changed.webp" alt="After switching an answer to Bilingual: a Rewrite the draft button with the note Takes about a minute. Changed your mind? Click undo your changes. Hand off to Orbi is greyed out with the message You changed an option." width="1200" height="989">
<figcaption>After switching to Bilingual: hand-off waits for the rewrite.</figcaption>
</figure>

For anything the options don't cover, use the box under the draft (**Anything to add or change?**). Orbi rewrites with the whole conversation in view.

Read the rewritten draft before you hand it off. In this run, the rewrite dropped the priority line even though that question was still on its recommended answer, Include it; the Issue Orbi worked from has no priority section. At the time, the page sent only the answers you changed, not the ones you left on Orbi's recommendation. Orbi Cloud v0.7.19, released October 9, fixes this: a rewrite now sends every answer and marks the ones you kept.

## Before you hand it off

Under **Hand off to Orbi**, the page says what happens next. The middle sentences depend on branch protection on the branch the task merges into. You pick that branch when you connect the repository; usually it is the default branch. This test repository has none, so it reads: "Once its checks pass, Orbi merges right away. To review changes first, set your repository to require 1 approval before merging." When that branch requires an approving review, it says Orbi will wait for you to approve the pull request on GitHub, and when the page can't read the setting, it doesn't claim either way. "Its checks" means your CI plus Orbi's review session.

<figure class="post-media">
<img src="/img/blog-write-request-handoff.webp" alt="The rewritten draft now asks for headings in English and Chinese. Under the Hand off to Orbi button: This creates an Issue in your GitHub repository, and Orbi works from it. Once its checks pass, Orbi merges right away. To review changes first, set your repository to require 1 approval before merging (how to set it up)." width="1200" height="989">
<figcaption>The rewritten bilingual draft, and the note that says whether Orbi will merge on its own.</figcaption>
</figure>

Orbi's review session reads the diff and asks for fixes; it is not a GitHub approval. Orbi never approves its own pull requests, so when one approving review is required, the task shows **Awaiting approval** and Orbi merges after you approve. The **how to set it up** link opens GitHub's guide to branch protection rules.

## After you hand it off

Handing off creates an ordinary Issue in your repository: a first line saying you submitted it through Orbi, then the draft exactly as you approved it. You stay on the same page, and the draft turns into a task card that updates on its own.

<figure class="post-media">
<img src="/img/blog-write-request-handed-off.webp" alt="Handed off to Orbi. Add a bilingual bug report Issue template. Status: Usually starts within a minute. Buttons: View on GitHub (Issue #75) and Write another request." width="1200" height="748">
<figcaption>Right after handing off: Issue #75 exists, and the card follows it.</figcaption>
</figure>

The status starts at **Usually starts within a minute**, then moves through **Queued**, **In progress** and **PR under review** to **Done**. For this request, hand-off to merge took about seven minutes on October 9: [Issue #75](https://github.com/xqliu/orbi-e2e-2609260042/issues/75) handed off at 00:20, [pull request #76](https://github.com/xqliu/orbi-e2e-2609260042/pull/76) opened at 00:24, merged at 00:27 (UTC+8). The pull request added one 19-line file, `.github/ISSUE_TEMPLATE/bug-report.md`.

<figure class="post-media">
<img src="/img/blog-write-request-done.webp" alt="Done. Add a bilingual bug report Issue template. Merged into your project. When it takes effect depends on how your project is released or deployed. Buttons: View the change (PR #76) and Write another request." width="1200" height="660">
<figcaption>Done, with a link to the merged pull request.</figcaption>
</figure>

If you leave and come back, the top of the Write a request page shows your last request and its status, as in the first screenshot; **View result** opens this card again. Every task is also listed on the status page.

## Request 3: when a task gets stuck

The third request, which actually ran first, on the evening of October 8, was written in Chinese and set up to fail. It asked for a CI step that runs a Stripe charge check on every push and pull request, reads the Stripe key from a repository secret and the payment method from repository variables, and fails when the key is missing. The test repository has none of them.

The new check did what the Issue asked: with no key configured it failed, so CI stayed red, and Orbi does not merge on red CI. The draft listed the secret and variables the check needs, but it didn't ask whether they were configured; Write a request doesn't check whether the secrets or variables a task needs actually exist. Orbi's review stopped the task for a human decision, labeled the Issue `ai-blocked`, and left the failing check in its pull request, unmerged.

<figure class="post-media">
<img src="/img/blog-write-request-blocked.webp" alt="Blocked. Orbi stopped: you need to make a call on something. The change was not merged into your project. This doesn't use a free run. Contact us: Telegram group, support@orbi.build. Buttons: See Orbi's note and Write another request." width="1200" height="751">
<figcaption>The stuck task. Its title is Chinese because the request was written in Chinese; the page is in English.</figcaption>
</figure>

The card only says Orbi needs a decision from you. **See Orbi's note** opens [the comment Orbi left on the Issue](https://github.com/xqliu/orbi-e2e-2609260042/issues/71#issuecomment-6063352853), which has the actual reason: the Stripe key is missing. It offered two ways forward: add the Stripe key the Issue requires as a repository secret, plus the payment method as repository variables; or change the Issue's rule that a missing secret must fail CI. Either way, a stuck task doesn't restart on its own: re-running CI, removing the `ai-blocked` label or commenting won't move it. Fix the cause, then swap the label on the Issue, which has to be open. If its pull request is still open, replace `ai-blocked` with `ai-fix-needed`, and Orbi continues on that pull request and its branch. If there is no pull request yet, replace it with `ai-ready`. We didn't recover this one: it was a staged failure, so after the test we closed [Issue #71](https://github.com/xqliu/orbi-e2e-2609260042/issues/71) and its pull request.

## What it costs

On the free trial you get \_\_FREE\_DELIVERIES\_\_ free deliveries (the page calls them free runs). A task that fails, gets stuck like request 3, or ends without a merge doesn't use one, so only merged deliveries count. Drafts never use a free delivery, and you can keep drafting after the free deliveries are gone.

If you hand one off after the free deliveries are gone, the Issue is still created right away, but Orbi removes its `ai-ready` label at once and leaves a comment saying why. After you subscribe, click **Try →** next to that Issue on the status page; it adds `ai-ready`, and that is when Orbi starts. The status page lists that button only when no other task is running; if one is, wait for it to finish, or add `ai-ready` to the Issue on GitHub yourself.

Paying monthly, Solo is US$\_\_SOLO\_MONTHLY\_USD\_\_ (\_\_SOLO\_INCLUDED\_TOKENS\_\_ tokens of model usage a month) and Pro is US$\_\_CLOUD\_MONTHLY\_USD\_\_ (\_\_INCLUDED\_TOKENS\_\_ tokens). Drafts count toward that monthly usage, the same as deliveries. Once the month's usage runs out, new drafts and new deliveries pause (running ones finish) until the 1st (months are counted in UTC); there is no overage charge, and accounts that bring their own model API key aren't paused this way. Details are on the [Orbi Cloud page](/cloud/?ref=blog-write-request).

## When to write the Issue yourself

If you already know exactly what should change and how to check it, creating the Issue on GitHub and adding the `ai-ready` label is quicker. Write a request helps most when you know the problem but not where it lives in the code, or when you want the open questions laid out before work starts.

Some things that make drafts better:

- Lead with the outcome. A line like "Bug reports should ask for steps to reproduce" lets Orbi pick the change that fits your repository. If you already know the file or a constraint, add it too.
- Keep one request to one change. Orbi checks an Issue before it starts, and when it judges that an Issue asks for several unrelated things, it comments asking you to split it, removes `ai-ready`, and pauses the task. The check is a model's judgment, so don't count on it to catch every mixed request. Once you've split or clarified it, add `ai-ready` again.
- Read the assumptions in the reply before you hand off. A misreading is cheapest to fix there.

## Related

- [Write a request](https://cloud-docs.orbi.build/write-a-requirement), the reference page in the Cloud docs
- [ai-ready: 12 factors for unattended software delivery](/aiready/), on what makes an Issue deliverable
- [From GitHub Issue to merged PR and release](/guides/issue-to-release/), the guide to the whole delivery line
- [How Orbi compares with coding agents](/compare/)
- [Orbi Cloud plans](/cloud/)
