---
title: When an AI coding delivery needs your answer
date: 2026-11-20
summary: A stopped Orbi delivery may need an answer or an Issue edit. See which Cloud buttons change labels, which post answers, and how to change a choice safely.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-stuck-delivery-one-click-card.png
mirror: stuck-delivery-one-click
---

Orbi is an open-source engine that takes a GitHub Issue labeled `ai-ready` in a connected repository, uses one delivery session to write code and a separate delivery session to review it against the Issue and CI, then merges the PR; a separate Release task ships versions. When delivery stops, you need to know whether to answer a question or change something before trying again. This post shows both paths in Orbi Cloud, with a design idea you can reuse: acknowledge an answer separately from carrying it out.

I'm Larry 🍀 Orbi, the creator of Orbi.

Orbi Cloud is the hosted version that runs the same engine for you. An Issue is the task; a delivery session is an agent's work period on it. Orbi tracks state with GitHub labels: `ai-ready` means queued, `ai-in-progress` means work is underway, `ai-blocked` means stopped, `ai-fix-needed` queues another round on an existing delivery PR, and `ai-merged` records a merged delivery.

## Two buttons, two ways to continue

Open [Orbi Cloud](/cloud/?ref=blog-stuck), sign in with GitHub, and open your connected project's status page. The card "Orbi is stuck and needs you" gives the stop reason and the controls for that situation.

- A requeue button, "Fixed — let Orbi continue", changes GitHub labels immediately through Cloud. If an Orbi delivery PR is open, Cloud adds `ai-fix-needed`; otherwise it adds `ai-ready`. It leaves a requeue comment, then removes `ai-blocked`, putting the Issue back where the engine can pick it up.
- A question's answer button posts one structured answer comment on the Issue. The engine carries out that answer on its next scheduler pass, including any label changes the answer calls for. The acknowledgement tells you the answer arrived; execution follows separately.

<figure class="post-media">
<img src="/img/blog-stuck-flow-en.webp" alt="Animated English status page showing answer buttons on a stopped Issue, then the Needs your attention task-history filter and an expanded stop reason." width="1280" height="913">
<figcaption>On beta: the answer controls and the same question expanded in task history.</figcaption>
</figure>

## Read the stop reason before choosing

A decision stop presents a choice about how to proceed. In the test repository `xqliu/orbi-e2e-2609260042`, Issue #394 tracks PR #393, opened outside Orbi to simulate an outside contribution. Orbi's review passed. The engine never merges outside contributors' code by itself, so it asks the maintainer what to do. As general advice, a passing review can still leave a reason to decline: a contribution may add maintenance work you do not want to take on.

A stop can also call for an edit. [Issue #390](https://github.com/xqliu/orbi-e2e-2609260042/issues/390) says "Orbi delivered no change at all." Its card directs you to "Edit the ticket on GitHub", then choose "Fixed — let Orbi continue". Use the stop note's instructions to edit the Issue and say what should change, then requeue it. A model-provider balance stop calls for attention to the provider account, covered below.

A decision stop can carry one structured question, with two to four buttons for a choice question and an "Optional: add a reason" field. An Issue can accumulate questions if it stops more than once. The `ai-blocked` label alone says nothing about whether there is a question to answer. Questions asked before delivery starts are covered in [From a vague request to a merged PR](/blog/vague-request-to-merged-pr/).

<figure class="post-media">
<img src="/img/blog-stuck-cards-en.webp" alt="English status page listing four stopped Issues, with Issue 394's Chinese question and English action buttons above Issue 390's edit-and-continue controls." width="1280" height="913">
<figcaption>#394 needs a decision; #390 needs an edited Issue. The question stays in the repository's language, Chinese here, while Cloud's fixed controls use English.</figcaption>
</figure>

For #394, the controls are:

- "Review and merge on GitHub" opens the PR so you can handle the merge there.
- "Don't take it — let Orbi do it" asks the engine to close the outside PR and requeue the Issue for Orbi to do the work.
- "Drop this task" asks the engine to close the Issue and its target PR.

The engine carries out the closing actions on its next pass while the Issue is stopped. None of these choices is recommended or taken automatically. A closed PR can be reopened on GitHub.

## What an answer acknowledgement means

After you answer a stopped Issue, the card title reads "Your answer is in. Orbi will continue". The project row reads "Answer received: … Orbi will continue". The engine still has to read and apply the answer on its next scheduler pass.

For an answer that adds an acceptance criterion and resumes delivery, you can see execution on GitHub: the criterion appears in the Issue, and `ai-blocked` changes to `ai-fix-needed` if an Orbi delivery PR is open, or `ai-ready` otherwise.

Cloud first checks that your signed-in GitHub account has repository write access. It then posts the answer as the Orbi GitHub App, the account the runner itself uses and the engine trusts. On GitHub directly, the engine checks the comment author's own write permission. The answer's `by` field records who answered and grants no permission by itself.

## When Orbi can choose a recommendation

If your question is about choosing between ways to do the work, Orbi can pick a recommended answer itself when the answer only adds an acceptance criterion to the Issue and resumes delivery. The recommendation must include a reason. The next delivery session reads that criterion in the amended Issue.

This automatic resume is allowed at most once per Issue. An automatic requeue after a temporary GitHub error uses the same single allowance, so automatic retries cannot loop. A new delivery session does not reset it.

Orbi leaves decisions about outside code, money, prices or plans to you, as well as any choice that would override a maintainer instruction written in the Issue or AGENTS.md. It never automatically follows a link or closes anything, and never automatically answers confirmation or text questions. A choice without a recommendation also waits for you.

The engine's comment explains its choice and says:

> Not right? Reply with another option.

In Cloud, use "Change it" to reopen the answer controls. On GitHub, post a new structured answer comment using the format below. Ordinary text replies are not read as answers: the structured comment identifies the question and the exact choice to apply.

## Change an answer before merge

For an answer that amends the Issue and resumes delivery, a newer valid answer from a trusted author replaces the earlier answer to the same question. Orbi replaces that question's acceptance criterion in place and preserves criteria from other questions, avoiding conflicting instructions in the Issue.

If the delivery has not merged, a newer answer waiting to be applied holds the merge and sends the delivery back to apply the change. An answer after merge cannot undo the merged PR. The [merge check](/blog/high-frequency-agent-development/) explains where Orbi checks for a newer answer.

A changed structured answer can also steer a running delivery session: the engine updates the Issue with the new criterion so the restarted delivery session reads it. The default settings check for new trusted answer comments every 60 seconds and allow up to three restarts; both settings are configurable. A stopped Issue uses the scheduler path described above.

## Model-provider balance needs an account change

For a model-provider balance stop, the card states the reason and links "Switch to a key with balance" to model settings. Cloud uses your own model key or the default key, as configured.

You can top up a provider account you control, or switch to a key with balance in model settings. Then requeue the Issue on GitHub, as the engine's failure note instructs: replace `ai-blocked` with `ai-fix-needed` if an Orbi delivery PR is open, or `ai-ready` otherwise. Saving a key alone does not requeue a balance-stopped Issue.

## Find the same controls in task history

Task history filters are "All", "In progress", "Queued", "Needs your attention" and "Done", with All selected initially. For an open stopped Issue, "View failure reasons and repair steps" opens the reason inline and, when a question exists, the same answer controls under "Next step: answer it".

After you answer, the row counts under In progress even while GitHub still shows `ai-blocked`, because your answer is waiting for Orbi to take over.

<figure class="post-media">
<img src="/img/blog-stuck-record-reason-en.webp" alt="Task history filtered to Needs your attention, with Issue 394 expanded to show Next step: answer it, its Chinese question and English answer buttons." width="1280" height="913">
<figcaption>You can answer #394 from the expanded task-history row.</figcaption>
</figure>

## Answer and requeue without Cloud

Self-hosted users can post the [structured answer](https://github.com/orbi-build/orbi/blob/v0.7.52/src/orbi/answer.py) as a new Issue comment. To find the question comment's ID, list the Issue's comments:

```sh
gh api --paginate repos/OWNER/REPO/issues/ISSUE_NUMBER/comments --jq '.[] | {id, body}'
```

Use that comment's numeric `id` as `COMMENT_ID` to read its raw body. GitHub's web view hides HTML comments:

```sh
gh api repos/OWNER/REPO/issues/comments/COMMENT_ID --jq .body
```

Find `question.id` in the hidden `orbi:question:v1` block, then use it for `q`:

```html
<!-- orbi:answer:v1 {"q":"q1","action":"accept","value":"<the option's full label>","by":"<your GitHub login>","reason":"optional reason"} -->
```

When picking an option, `action` is always `"accept"`, including for an option that closes a PR. The choice goes in `value`: copy the option's label exactly as written in the question, in the question's language. This matters when Cloud's controls and the question use different languages, since the engine matches the label.

With the separate `"decline"` action, the engine takes your nonempty `reason`, or the text in `value` if `reason` is absent, and adds it as an acceptance criterion before resuming. The `"cancel"` action closes the Issue and its target PR only while the Issue is stopped.

Set `by` to your GitHub login and submit from an account with repository write access. Delete `reason` if you have none; an empty string is rejected. To change an answer, post a new structured comment for the same `q`.

For an Issue that needs editing, such as #390, edit it and replace `ai-blocked` with `ai-fix-needed` when an Orbi delivery PR is open, or `ai-ready` otherwise. Removing `ai-blocked` alone does nothing: the engine needs a queue label to pick the Issue up.

Version scope: examples are from beta with Cloud v0.8.61 and engine v0.7.52; answering requires engine v0.7.46+, and changed-answer handling requires v0.7.47+.

## Related

- [Compare Orbi's delivery workflow](/compare/?ref=blog-stuck)
- [Orbi Cloud](/cloud/?ref=blog-stuck)
- [From a vague request to a merged PR](/blog/vague-request-to-merged-pr/)
- [Agentic software development beyond one session](/blog/high-frequency-agent-development/)
- [Write a request in Orbi Cloud](/blog/write-a-request/)
