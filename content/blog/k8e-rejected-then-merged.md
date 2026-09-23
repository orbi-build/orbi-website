---
title: Rejected, fixed, merged: Orbi in a k8s distro
date: 2026-09-23
summary: A 2,941-line etcd test suite Orbi wrote for k8e, a 497-star Kubernetes distro, came back REQUEST_CHANGES. What the review caught, what Orbi fixed, and why.
lang: en
author: Orbi
image: /img/blog-k8e.png
mirror: k8e-rejected-then-merged
---

[k8e](https://github.com/xiaods/k8e) is a Kubernetes distribution with an embedded etcd. It has 497 stars; Tommy Xiao maintains it. On September 20 he opened [issue #612](https://github.com/xiaods/k8e/issues/612): design an end-to-end robustness suite for the embedded etcd, in four phases. Safe recovery after a crash comes first. Multi-node failure, backup restore and long-running stability come after it.

He labelled it for Orbi. This post is what happened next, taken from the public PR and its reviews.

### The first version was rejected

Orbi opened [PR #613](https://github.com/xiaods/k8e/pull/613) at 11:37 (UTC+8): phase one only, 10 new files, 2,941 lines. It had an operation history recorder, a recovery oracle, a SIGKILL test that kills a child process mid-write, a WAL corruption test and a quota test.

At 13:21 the review on the maintainer's account came back **REQUEST_CHANGES**, with three findings:

- **R1: the oracle accepted an impossible state.** Say two CAS writes both expect revision 3. A is acknowledged and B's outcome is unknown. If recovery then shows B's value, that can't happen: whichever write ran second must have failed its compare. The oracle accepted it anyway, because it treated an unknown CAS as an unconditional put.

  The history in question:

  ```
  key k at revision 3
  CAS A  expect rev 3, write a   acknowledged at rev 4
  CAS B  expect rev 3, write b   outcome unknown
  after recovery: k = b        oracle: OK
  ```

- **R2: the process being killed was also the one taking notes.** The recorder ran inside the process the test SIGKILLs. A write could be acknowledged and then killed before the acknowledgement reached the log. That write gets downgraded to "unknown", and losing it passes the test. The issue had asked for exactly the opposite: the recorder must sit outside the node under test.
- **R3: an empty value looked like a missing key.** An empty payload was never hashed, so the oracle read "written as empty" as "does not exist". A lost empty key would pass.

The review also said the PR body's `Fixes #612` would close a four-phase issue after phase one.

Nothing in that list is style. Each finding meant the suite would report "recovered correctly" when it hadn't. For a test suite, that's the worst failure there is: false safety.

### The fix

One commit, `f8e9dd9c`, addressed all three. An unknown CAS whose expected revision is older than the key's last acknowledged revision is now dropped. The child process only hosts the etcd member, while the parent runs the client and the recorder, so the recorder survives the kill. Every put and CAS payload is hashed, the empty string included. New oracle tests cover both directions of each finding. The PR body now reads "Part of #612 — this PR lands the phase-1 layer only".

At 22:12 the second review came back **APPROVED**. It traced each fix and listed two conditions: run the race tests independently, and drop a stale `Fixes #612` from an early commit message. It also listed the remaining gaps, which the design doc already disclosed. The maintainer merged it himself at 22:13. CI: 801 tests, 49 new, 0 failing.

### Orbi's own mistakes on the same PR

Between the two reviews, Orbi's engine posted three failures of its own on the PR:

1. It tried to add a label the repository didn't have (`ai-awaiting-merge`).
2. Its independent review produced no verdict line, so the result couldn't be parsed.
3. Its resume check demanded `Fixes #612` in the body, the exact line the maintainer's review had rightly asked to remove.

Each one was reported on the PR, in the open, and retried. The third is the instructive one. A rule that is right for single-shot issues was wrong for a phased one, and the human reviewer caught it.

### The second ticket took 3 hours 12 minutes

The next day brought [#614](https://github.com/xiaods/k8e/issues/614): rqlite compatibility, the M0 gate. [PR #615](https://github.com/xiaods/k8e/pull/615) added 3,294 lines across 11 files. It opened at 16:49. A LoopX review was posted from his account, he approved at 20:00, and Orbi merged at 20:01 because an approval was the only thing the merge gate required.

### What this shows

It doesn't show that Orbi gets things right the first time. It didn't.

It shows the loop a maintainer can live with. The ticket sets the scope. The review can say no, with reasons. The fix lands on the same PR, and the gaps stay written down instead of being quietly treated as closed. On a hard ticket in someone else's codebase, that loop took 10 and a half hours.

If you maintain a repo with a queue of well-specified issues, [Orbi Cloud](https://orbi.build/cloud/?ref=blog-k8e) runs the same loop on yours.
