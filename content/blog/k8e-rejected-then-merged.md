---
title: The k8e etcd ticket that closed too early
date: 2026-09-23
summary: Orbi wrote an etcd test suite for k8e, a 497-star Kubernetes distro. The review rejected it, Orbi fixed it, and the four-phase issue closed after phase one.
lang: en
author: Orbi
image: /img/blog-k8e.png
mirror: k8e-rejected-then-merged
---

[k8e](https://github.com/xiaods/k8e) is a Kubernetes distribution with an embedded etcd. It has 497 stars; Deshi (Tommy) Xiao maintains it. On September 20 he opened [issue #612](https://github.com/xiaods/k8e/issues/612), asking for an end-to-end robustness suite for the embedded etcd, delivered in four phases. Safe recovery after a crash comes first, then multi-node failure, backup restore and long-running stability.

At 10:28 (UTC+8) he added the `ai-ready` label. The times and numbers below come from the public PR, its reviews and the issue's label history, except the runner crash count, which comes from the runner's log.

### The first version was rejected

Orbi opened [PR #613](https://github.com/xiaods/k8e/pull/613) at 11:37 with phase one only: 10 new files, 2,483 lines. It had an operation history recorder, a recovery oracle, a SIGKILL test that kills a child process mid-write, a WAL corruption test and a quota test.

At 11:46 the maintainer posted what SonarCloud and DeepSource had flagged. Orbi started pushing fixes at 11:57.

At 13:21 the review on the maintainer's account came back **REQUEST_CHANGES**. By then the PR was 2,695 lines, and the review had three findings:

- **R1: the oracle accepted an impossible state.** Say two CAS writes both expect revision 3. A is acknowledged and B's outcome is unknown. If recovery shows B's value, something went wrong, because whichever write ran second must have failed its compare. The oracle accepted it anyway: it treated an unknown CAS as an unconditional put.

  The history in question:

  ```
  k is at rev 3
  A: CAS rev3 -> a  acked
  B: CAS rev3 -> b  unknown
  recovered: k = b
  oracle: OK   (should fail)
  ```

- **R2: the process being killed was also the one taking notes.** The recorder ran inside the process the test SIGKILLs. A write could be acknowledged, and the process killed before the acknowledgement reached the log. That write would be logged as "unknown", so losing it would pass the test. The issue had asked for the recorder to sit outside the node under test.
- **R3: an empty value looked like a missing key.** An empty payload was never hashed, so the oracle read "written as empty" as "does not exist". A lost empty key would pass.

The review also said the PR body's `Fixes #612` would close a four-phase issue after phase one.

Each finding meant the suite could report "recovered correctly" when the data had not recovered. A test suite that does that gives you confidence you haven't earned, which is worse than having no suite at all.

### Orbi's own mistakes on the same PR

Orbi's engine also reported three failures of its own, each in a PR comment:

1. At 12:28 it tried to add a label the repository didn't have (`ai-awaiting-merge`). At 12:37 the engine gave up and marked the issue `ai-blocked`, which hands the next step to a human. The maintainer removed that label at 14:16 and put `ai-ready` back at 14:41, and the work resumed.
2. At 14:54 Orbi's own independent review produced no verdict line, so its result couldn't be parsed.
3. At 15:19 its resume check demanded `Fixes #612` in the PR body, the same line the maintainer's review had rightly asked Orbi to remove.

Orbi never cleared the third one, and the failure spread beyond the ticket: it crashed the whole runner process serving his repository, 84 times between 15:19 and 22:10 by the runner's own log, and his entire queue stalled. The public write-up, [orbi#1219](https://github.com/orbi-build/orbi/issues/1219), was filed partway through and counts 77. At 19:59 the maintainer commented on the issue, 继续修复吧 ("go ahead and keep fixing"). Nothing happened after that. The rule that every PR body must say `Fixes` works for a single-shot issue and is wrong for a phased one; the engine enforced it anyway, and the human reviewer was right.

### The fix

At 15:05 one commit, `f8e9dd9c`, addressed all three findings. An unknown CAS whose expected revision is older than the key's last acknowledged revision is now dropped. The child process only hosts the etcd member, while the parent runs the client and the recorder, so the recorder survives the kill. Every put and CAS payload is hashed, including the empty string.

New tests cover R1 and R3 in both directions. The PR body now reads "Part of #612 — this PR lands the phase-1 layer only".

At 22:12 the second review came back **APPROVED**. It traced each fix and set two conditions. The first was to run the race tests independently. The second was to drop a stale `Fixes #612` from Orbi's first commit message; the review called that one optional, because it believed only the PR body closes issues. It also listed the remaining gaps, which the design doc already disclosed. The maintainer merged it himself at 22:13, 38 seconds later, and the record doesn't show either condition being carried out first. CI on the merged head: 801 tests, 49 new, 0 failing.

### The issue closed anyway

The review was wrong about that commit message. GitHub also closes an issue when a closing keyword in a merged commit message points at it. One second after the merge, #612 closed as *completed*, closed by Orbi's first commit, with one phase of four landed. The first review had warned about exactly this outcome, and it came through the one place nobody had fixed.

That was Orbi's fourth mistake on this ticket, and the one with the biggest consequence. Our engine's rules require `Fixes #N` in the PR body, and the delivery agent also put it in its first commit message. Both reviews flagged the keyword, the first in the PR body and the second in the commit. As of this writing, #612 is still closed.

### The second PR: 3 hours 12 minutes from open to merge

The next day brought [#614](https://github.com/xiaods/k8e/issues/614), rqlite compatibility for the M0 gate. The maintainer labelled it at 15:21. [PR #615](https://github.com/xiaods/k8e/pull/615) added 3,294 lines across 11 files. It opened at 16:49 and was waiting for approval from 17:33. A LoopX review was posted from the maintainer's account, he approved at 20:00:52, and Orbi merged 29 seconds later.

### Looking back

Orbi did not get this right the first time. The maintainer had to unblock the issue and put it back in the queue, ask Orbi to keep going when it stalled, and finally merge past one of Orbi's rules that was wrong for his ticket. The four-phase issue still closed after phase one.

When the review said no, it gave reasons, and the fix landed on the same PR. On a hard ticket in someone else's codebase, that took 10 and a half hours from PR open to merge. Every failure, Orbi's included, is in the public record, so you can check this post against it.

Two things changed in Orbi afterwards ([orbi#1219](https://github.com/orbi-build/orbi/issues/1219)). A bad PR body now fails only its own ticket and no longer kills the runner. And Orbi's workflow contract now says a phased initiative must not be carried by one issue: the maintainer splits each phase into a child issue, and each child's PR closes that child and nothing else.

If you maintain a repo with a queue of well-specified issues, [Orbi Cloud](https://orbi.build/cloud/?ref=blog-k8e) runs the same loop on yours.
