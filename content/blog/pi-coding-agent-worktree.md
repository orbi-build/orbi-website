---
title: Pi coding agent worktree: a failed recovery
date: 2026-10-26
summary: A surviving branch stalled Orbi's queue after a failed run. How Pi sessions, worktrees and a stable branch help recover work before a pull request exists.
lang: en
author: Lawrence Liu
image: /img/og.png
mirror: pi-coding-agent-worktree
series: pi
---

A Pi coding agent worktree gives a delivery attempt its own checkout. To continue after a failure, Orbi also has to find the work that attempt already pushed. On 10 October 2026, that second part failed: a branch survived a GitHub connection error, but Orbi repeatedly refused to resume it. Three other ready issues waited behind it. The [fix](https://github.com/orbi-build/orbi/pull/1596) merged on 11 October, at 00:42 UTC+8.

I'm Lawrence Liu, the creator of [Orbi](https://github.com/orbi-build/orbi). Orbi takes a GitHub issue through implementation, independent review and merge, with release work handled through release issues. It uses Pi to run the coding and review sessions. This is part of the [Pi architecture series](/guides/pi-coding-agent/?ref=blog-pi-worktree); the incident below happened in Orbi's runner, before it could hand the interrupted work back to Pi.

## A branch without a pull request

The [incident record](https://github.com/orbi-build/orbi/issues/1594) describes a run that stopped after a temporary GitHub connection failure. It left one commit on the remote delivery branch and no open pull request. After a person put the issue back into the ready queue, the runner should have continued implementation on that branch.

Instead, each attempt logged `claim_yield` with the reason `stable_branch_appeared`. That message means the runner is yielding to work that may have appeared while it was preparing to claim the issue. The branch had been there before the scan.

The incident record gives these times (UTC+8):

| Time | Recorded event |
|---|---|
| 10 Oct, 19:40 | A GitHub connection failure blocks the original run, leaving a remote branch without a PR. |
| 10 Oct, 21:31:24 | The first `stable_branch_appeared` yield shown in the incident record. |
| 10 Oct, 23:47:11 | The last repeated yield shown in that record. |
| 10 Oct, 23:51:59 | After manual branch deletion, the runner picks the issue again and the queue moves. |
| 11 Oct, 00:42:30 | PR #1596 merges the fix. |

The runner processed one issue per tick. It kept selecting this issue and yielding, leaving three other ready issues waiting. Manual branch deletion got it moving, but it removed the branch the recovery path was supposed to reuse. It is the incident's workaround, not an instruction for recovering a failed delivery.

## Pi coding agent worktree, session and delivery branch

There are four identities to keep apart when following an Orbi delivery:

| Identity | What it identifies |
|---|---|
| Issue | The requested change. |
| Run ID | One attempt by the runner to deliver that issue. A resumable attempt can keep its run ID. |
| Pi session | An agent conversation and tool execution. Implementation and independent review use separate sessions. |
| Delivery branch | The Git branch used to carry the issue's changes to its PR. Its name stays stable across attempts. |

Orbi's [branch naming function](https://github.com/orbi-build/orbi/blob/b2462b5caf1316703beef51f3e1e78bac5a045cc/src/orbi/gitops.py#L68) uses the repository and issue number. The worktree path also contains the run ID. A new attempt can therefore have a new working directory while continuing the issue's existing delivery branch. Some recoverable failures keep the current run and worktree instead; a retry does not always mean a fresh checkout.

The separate checkout keeps an agent's file edits away from another checkout's working files. It does not by itself provide a security sandbox. [Git's worktree documentation](https://git-scm.com/docs/git-worktree.html) describes shared repository data, including most refs and the default configuration. Process permissions, credentials and network access need their own boundaries.

## A fact was collected, then dropped

Before claiming an issue, the runner queried whether its stable delivery branch already existed. It stored the answer in a local variable called `stable_branch_present`.

The code then built a `DeliveryFacts` object to pass the observations to the next step. It omitted that field. The object used its default value, `False`, even when the query had returned `True`.

The claim path checked the remote branch again. Its race guard was equivalent to this:

```python
if not stable_branch_present and stable_branch_exists(...):
    # Yield: another delivery may have appeared during the claim window.
```

This is an explanatory excerpt, not a runnable recovery command. An absent branch at the first observation followed by a present branch at the second can indicate concurrent work. The lost field made an old branch look like that transition on every attempt.

The [patch](https://github.com/orbi-build/orbi/pull/1596/files) passed the observation into the object:

```diff
 return DeliveryFacts(
     ...
     stable_branch=stable_branch,
+    stable_branch_present=stable_branch_present,
     ...
 )
```

The race guard remained. The fix gave it the first observation it had been missing.

## What the regression test checks

The [new test in PR #1596](https://github.com/orbi-build/orbi/pull/1596/files) drives the issue-processing path with a branch-existence stub that always returns `True`. Once that first observation reaches the guard correctly, the guard short-circuits and skips its second lookup. The test records the worktree-creation call and asserts that the runner requests `existing_branch=True`, returns a PR result and emits no `claim_yield` event.

That checks the handoff between collecting facts and choosing the action, where the value had been lost. A test of the branch-existence helper alone could return the correct answer while this bug remained.

For another Git worktree coding agent, I would test these states before relying on its retry path:

| First branch check | Second branch check | What the recovery test needs to establish |
|---|---|---|
| Present | Present | Recognize the existing work and take the intended continuation path. |
| Absent | Present | Detect possible concurrent work and avoid taking it over blindly. |
| Query fails | Unknown | Surface the lookup failure; do not treat it as a confirmed absence. |

The first row is the regression added by this patch; as noted above, the correct path can skip the second lookup. The other rows need separate verification. Orbi's [current remote-branch lookup](https://github.com/orbi-build/orbi/blob/b2462b5caf1316703beef51f3e1e78bac5a045cc/src/orbi/gitops.py#L138) treats an empty successful response as absence and lets a failed command propagate.

## Before restarting an interrupted task

Find the issue's delivery branch and check whether it already has a PR. Then establish what survived: a local worktree, pushed commits, or both. Keep the run ID with the logs so that an old attempt's evidence can be distinguished from a new attempt.

In this incident, the pushed commit had survived. What failed was the decision to reuse it. A useful recovery test must reach the action that consumes the saved observation, including the case where the work exists but its PR has not been created yet.

## Related

- [How Orbi is built on the Pi coding agent](/guides/pi-coding-agent/?ref=blog-pi-worktree)
- [An issue through several Pi sessions](/blog/orbi-on-pi-coding-agent/?ref=blog-pi-worktree)
- [How Orbi uses Pi as an agent harness](/blog/pi-agent-harness/?ref=blog-pi-worktree)
- [Compare Orbi with OpenHands](/compare/openhands/?ref=blog-pi-worktree)
- [Orbi Cloud](/cloud/?ref=blog-pi-worktree)
