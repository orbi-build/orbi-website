---
title: Answer a stuck Orbi delivery from the status page
date: 2026-11-20
summary: When an Orbi delivery stops, see why, choose an answer in Cloud, and let it continue. Examples show what each button does and how to change your mind.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-stuck-delivery-one-click-card.png
mirror: stuck-delivery-one-click
---

Orbi is an open-source system that takes a one-sentence request through code, independent review, merge and release. If you run coding-agent deliveries with Orbi and one has stopped, here is which answer to choose in Orbi Cloud and what that choice changes on GitHub.

I'm Larry 🍀 Orbi, the creator of Orbi. Cloud v0.8.61 is live in production on 20 November 2026, with engine v0.7.52. The answer flow builds on engine v0.7.46+, with changed-answer handling from v0.7.47 described below. The examples here come from Orbi's beta site.

Questions before delivery starts belong to the sibling post, [From a vague request to a merged PR](/blog/vague-request-to-merged-pr/).

## Find a stuck delivery on the status page

Open [Orbi Cloud](/cloud/?ref=blog-stuck) and sign in with GitHub to reach your connected project's status page. The card titled "Orbi is stuck and needs you" lists each stuck ticket with its reason in plain words. When the engine has written a structured choice question, the card shows that question with two to four answer buttons. "Optional: add a reason" lets you add a line of context before choosing.

A decision stop carries at most one question. Technical stops can instead show their reason and the action needed to continue. A stopped ticket's `ai-blocked` label alone does not imply that it has a question.

<figure class="post-media">
<img src="/img/blog-stuck-flow-en.webp" alt="Animated English status page showing stuck-ticket answer buttons, then the Needs your attention task-history filter and an expanded stop reason." width="1280" height="913">
<figcaption>On beta: hovering over the choices, filtering task history to Needs your attention, and expanding a stopped ticket.</figcaption>
</figure>

## Decide whether to accept an outside contribution

In the test repository `xqliu/orbi-e2e-2609260042`, Issue #394 tracks PR #393, opened outside Orbi to simulate a contribution. Orbi reviewed it and the review passed. Accepting the contribution and choosing its release remain the maintainer's call; the engine leaves the merge to that person.

The English UI offers these actions:

- "Review and merge on GitHub" opens the PR for you to handle there. This is a `link` action; the engine leaves the GitHub operation to you.
- "Don't take it — let Orbi do it" closes the outside PR and requeues the Issue for Orbi to do the work. This is `close_external_pr`.
- "Drop this task" closes the Issue and its target PR. This is `close_all`.

These closing actions are available to the engine while the Issue is blocked. None of these three choices is recommended or carried out automatically.

<figure class="post-media">
<img src="/img/blog-stuck-cards-en.webp" alt="English status page reporting four stuck tickets, with Issue 394's Chinese question and three English action buttons above Issue 390's edit-and-continue controls." width="1280" height="913">
<figcaption>The beta page reports four stuck tickets. #394's question stays in the repository's language, Chinese in this test repo; its fixed action buttons follow the UI language, English here.</figcaption>
</figure>

## Resume a ticket after editing it

[Issue #390](https://github.com/xqliu/orbi-e2e-2609260042/issues/390) has a different reason: "Orbi delivered no change at all." Its card offers "Edit the ticket on GitHub" and "Fixed — let Orbi continue". Open the Issue and say what should change, then hand it back.

That second button directly requeues the ticket on GitHub. Cloud first adds `ai-fix-needed` if an open Orbi delivery PR exists, or `ai-ready` otherwise. It leaves a requeue comment, then removes `ai-blocked`. The page acknowledges: "Handed back to Orbi: #390 will continue; this page updates by itself."

## What one answer click sends to GitHub

Choosing a question's answer submits a form to Cloud's `POST /api/issues/answer` route, identifying the repository, Issue, question and selected answer, plus your optional reason. Cloud checks your session and the connected repository, then verifies your GitHub write permission. Admin, maintain and write permissions qualify.

Cloud uses its GitHub App installation token to post a structured answer comment on the Issue, recording your login in `by`. This route writes the comment; the engine handles the resulting work and label changes on its next tick, or scheduler pass.

For answers posted directly on GitHub, the engine trusts the actual comment author's repository write permission, or its own runner identity. Filling in someone else's login in `by` grants no authority.

Cloud replaces the choices with an acknowledgement. This beta screenshot from 18 November 2026 shows the Chinese receipt: "已收到。Orbi 正在交付，一分钟内按您的新选择重做。" Its English string is:

> Received. Orbi is delivering right now and redoes the work with your new choice within a minute.

Cloud acknowledges receipt before the engine carries out the answer. A stopped ticket is read on the next scheduler pass. You can also change an answer while a delivery session is running: by default, that session checks new trusted comments every 60 seconds and can restart with the amended ticket up to three times by default. Between rounds, the English message says: "Orbi is between rounds; the next round follows your new choice."

<figure class="post-media">
<img src="/img/blog-stuck-answered-zh.webp" alt="Chinese beta status page with a stopped-ticket question and a received-answer message in place of the option buttons." width="1568" height="775">
<figcaption>The answered state on beta, 18 November 2026. The Chinese message acknowledges receipt and describes continuing with the new choice.</figcaption>
</figure>

## When Orbi acts on a recommended answer

The engine can carry out a recommendation itself when a stopped run has a structured choice question classified as `pick_best` or `missing_info`. The option must be recommended, have a reason, and use `amend_requeue`, which adds its description to the Issue's acceptance criteria and resumes delivery. The run must have an ID, and readable, trusted comment history must show no earlier automatic requeue.

This automatic resume happens at most once over an Issue's lifetime. An automatic requeue after a temporary GitHub error uses the same allowance. Starting another run does not reset it.

Authority decisions stay with the maintainer: accepting outside code, decisions about money, prices or plans, and overriding an explicit maintainer instruction in the Issue or AGENTS.md. Links and closing actions never run automatically. Neither do confirmation or text questions, or choices without a recommendation.

Orbi writes the selected criterion into the Issue and leaves this comment:

> Orbi chose **{label}** on its own: {reason}
>
> Its acceptance criterion is now part of this Issue, so the next session reads the amended ticket. Not right? Reply with another option.

Cloud shows "Orbi decided for you: {label}, because: {reason}" with "Change it". Opening "Change it" reveals the answer controls again, so you can replace Orbi's choice.

## Change an answer before the delivery merges

For answers that amend and resume an open delivery, submit another valid answer to the same question from a trusted author. That new answer supersedes the earlier one. If the earlier choice already amended the ticket, Orbi replaces that question's acceptance criterion in place, keeping criteria from other questions.

For an unmerged delivery, a newer answer waiting to be applied holds the merge and sends the delivery back to redo it with the new choice. The [merge-gate detail](/blog/high-frequency-agent-development/) explains where that final check happens.

## Find stop reasons in task history

Task history has five filters: "All", "In progress", "Queued", "Needs your attention" and "Done". All is selected by default. For an open blocked ticket, "View failure reasons and repair steps" loads its reason inline. When a question exists, this expands the same answer controls under "Next step: answer it".

<figure class="post-media">
<img src="/img/blog-stuck-record-reason-en.webp" alt="Task history filtered to Needs your attention, with Issue 394 expanded to show Next step: answer it, its Chinese question and English answer buttons." width="1280" height="913">
<figcaption>#394's question is also answerable inside task history. After an answer, a blocked row waiting for Orbi belongs under In progress, even while GitHub still shows ai-blocked.</figcaption>
</figure>

A model-provider balance stop has its own reason and next steps: top up the provider account, or use "Switch to a key with balance" in model settings. After restoring the balance or changing the key, requeue the affected ticket.

## How to answer without Cloud

Self-hosted users can post the [documented structured answer](https://github.com/orbi-build/orbi/blob/v0.7.52/src/orbi/answer.py) as a new Issue comment:

```html
<!-- orbi:answer:v1 {"q":"q1","action":"accept","value":"<the option's full label>","by":"<your GitHub login>","reason":"optional reason"} -->
```

Read the raw body of Orbi's question comment: its hidden `orbi:question:v1` block contains `question.id`. Use that ID for `q`. Replace the `value` placeholder with the option's full label and `by` with your GitHub login; `reason` is optional: delete the field if you have none, because an empty string is rejected. Submit from an account with repository write access. To change an amendment answer, post a new structured comment for the same question.

## Related

- [Compare Orbi's delivery workflow](/compare/?ref=blog-stuck)
- [Orbi Cloud](/cloud/?ref=blog-stuck)
- [From a vague request to a merged PR](/blog/vague-request-to-merged-pr/)
- [Agentic software development beyond one session](/blog/high-frequency-agent-development/)
- [Write a request in Orbi Cloud](/blog/write-a-request/)
