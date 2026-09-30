---
title: Searching for Orbi's harness, part 2: is the regression guard worth its tokens?
date: 2026-09-30
summary: On eight unseen bugs whose Issue shows only a narrow example, Orbi's original harness failed a third of its runs. We tested five harness designs to keep the fix without doubling the cost of every delivery. What worked, what didn't, and why the simplest design won.
lang: en
author: Orbi
image: /img/blog-harness-part2.png
mirror: is-the-regression-guard-worth-its-tokens
---

[Part 1](/blog/searching-for-orbis-harness/) ended with a harness that fixed every failure it was tuned on and cost a median of about twice as much on other bugs, for no gain we could measure there. A guard like that is insurance. The question is whether the risk it insures against shows up on bugs it has never seen, and whether it can be made cheaper.

This part answers both, with eight more bugs and three more harness designs. Everything runs the same way as in part 1: a private snapshot, the real Orbi runner doing the full loop, and a hidden grader calibrated to fail the code before the fix and pass a known-good fix. The implementation and review model is `deepseek-flash` throughout. All scripts, tasks and results are in [orbi-build/orbi-bench](https://github.com/orbi-build/orbi-bench).

## Six takeaways

1. **The failure is real on unseen bugs.** On eight bugs whose Issue shows one narrow example of a wider problem, the original harness failed 4 of 12 runs. `dateparser` and `picomatch` each failed twice in three tries, in exactly the cases the Issue didn't show.
2. **The always-on guard fixes it.** It passed 9 of 10 on the same eight bugs. Its one miss, on `dateparser`, failed 2 of the maintainer's tests where the original harness's misses there failed 4 or 5, though one of the two was new: that fix modified Python's global `calendar` module.
3. **Gating kept most of the gain, but not all of it.** Running the guard only when a change touches text handling passed all three original failures and 7 of 8 narrow-example bugs, against 9 of 10 for the always-on guard; both gated versions (v19 and v19b) failed `picomatch`, where always-on passed both times.
4. **And gating saved almost nothing.** On the nine ordinary bugs the gate opened on eight, so the gated guard used 5.2 million tokens a run against 5.8 million always-on, about 10% less, and 2.8 million for the original harness. A classifier that saves 10% and adds its own way to fail isn't worth its complexity.
5. **Two cheaper designs didn't work, and the reviewer never said no.** Strengthening only the reviewer passed 1 of 3 original failures: with the full regression hunt in its prompt, it passed both regressions. Across all 183 runs, every one of the 38 that failed the hidden grader had passed Orbi's review. Enriching the ticket first passed 2 of 3.
6. **So we're dropping the gate.** The simpler design wins: the always-on guard behind a per-repository switch, off by default, turned on by repositories whose bugs look like these (parsers, formatters, redactors, anything with escaping). No classifier to get wrong. Separately, Orbi merged our gated version 71 seconds after we paused it; we reverted it before any release.

## Eight unseen bugs shaped like Orbi's failures

Part 1 ended with the harnesses looking identical outside the three issues they were tuned on. But those three failures had something in common that the ordinary held-out bugs didn't: the Issue showed one example, and the correct fix had to handle a whole class of inputs around it. So we went looking for that shape specifically.

Eight real bug fixes, all merged after August 10, 2026, all in small pure-Python, Go or JavaScript libraries: `loguru` (negative timestamps), `dateparser` (week-number formats), `gocsv` (zero-padded integers), `goja` (a dash after a class escape in a regex), `doublestar` (character classes inside `{}`), `picomatch` (negated brackets), `markdown-it` (IPv6 hosts in links) and `marked` (entities in link targets). For each, the maintainer's tests cover more than the Issue's example, and we checked that a fix written only for the example passes the example and fails the maintainer's tests. The ticket Orbi saw kept only the Issue's own example.

<figure class="post-media">
<img src="/img/diagrams/harness-narrow.svg" alt="Eight bugs whose Issue shows a narrow example. The original harness passed 8 of 12 runs, failing dateparser and picomatch twice each; the always-on guard passed 9 of 10; the gated guard passed 7 of 8." width="720" height="410">
<figcaption>Where the harnesses differ. dateparser and picomatch were run three times on the original harness.</figcaption>
</figure>

This is where the original harness slips, on bugs it has never seen. On `dateparser`, the Issue showed two week-number formats; the maintainer's tests also cover week 00 rolling into the previous year and incomplete formats. Two of three original-harness runs fixed the two formats and missed both. On `picomatch`, the Issue showed `[!abc]`; the tests also cover an unclosed `[!]` and the `literalBrackets` option. Two of three runs missed them.

The always-on guard passed 9 of 10, and its one miss on `dateparser` failed 2 tests where the original harness's misses failed 4 to 5; one of those two was a regression of its own, a change to Python's global `calendar` module. The gated guard passed 7 of 8, missing `picomatch` once. These are small numbers, and a single run can flip a cell, but they point the same way as the three original failures: when the fix has to cover more than the example, generating inputs across the class is what finds the gap.


## Five harnesses on the failures Orbi shipped

The always-on guard fixes the failures and roughly doubles the median cost of the other fixes. So we tried three cheaper designs on the three issues Orbi originally got wrong, with `deepseek-flash` in both roles:

- **Reviewer only (v21)**: the original implementer prompt (plus the contribution skill and repository tools on `PATH`), with the guard only in the review. 1 of 3. With the full regression hunt in its prompt, the reviewer passed `chainloop` with no findings and `pyinfra` after fixing one finding itself, and both shipped the same regressions as before (the password leak and the 👍🏽 misalignment).
- **Enrich the ticket first (v20)**: before the runner starts, a cheap model reproduces the bug in a scratch copy and appends an analysis to the Issue: where the bug is, which input classes the fix must handle with concrete examples, what must not change, and a design outline. Then the original harness runs. 2 of 3; `pyinfra` still shipped the 👍🏽 and が regressions.
- **Gated guard (v19)**: the full guard, but only when a change alters how text or bytes are parsed, escaped, trimmed, split, measured, matched, replaced, encoded or redacted. Other changes get a targeted test and the existing suite. 3 of 3.

<figure class="post-media">
<img src="/img/diagrams/harness-variants.svg" alt="Five harnesses on the three issues Orbi got wrong: original 6 of 15, reviewer only 1 of 3, enrich ticket 2 of 3, gated guard 3 of 3, always-on guard 9 of 9, with median tokens per run under each bar." width="720" height="400">
<figcaption>Pale bars have fewer than five runs. Median million tokens per run under each bar.</figcaption>
</figure>

The gate saves less than we hoped. On all nine ordinary bugs, the gated guard passed 9 of 9 at a median 5.2 million tokens per run, against 2.8 million for the original harness and 5.8 million for the always-on guard. Most of those bugs touch text handling too (a regex, an argument parser, a line wrapper), and the gate opened on eight of the nine.


## What it costs, set by set

Pass rate is only half of the decision. Each run's tokens are dominated by cache reads (about 97%), which scale with the number of turns an agent takes, so a harness that asks for more checking usually costs more on the bugs it runs on.

| Set | Original | Always-on guard (v15) | Gated guard (v19) |
|---|---|---|---|
| 3 issues Orbi got wrong (tuning) | 6/15 · 5.7M | 9/9 · 13.4M | 3/3 · 10.8M |
| 8 narrow-example bugs (unseen) | 8/12 · 3.6M | 9/10 · 8.3M | 7/8 · 5.2M |
| 9 ordinary bugs (unseen) | 9/9 · 2.8M | 9/9 · 5.8M | 9/9 · 5.2M |
| 3 regression-prone bugs (unseen) | 4/4 · 7.1M | 3/3 · 13.9M (no numpy) | not run |

Passes / runs, and median million tokens per run. Median minutes per run follow the same pattern: 11, 16 and 15 on the ordinary bugs; 12.5, 19 and 17.5 on the narrow-example ones.

<figure class="post-media">
<img src="/img/diagrams/harness-tradeoff.svg" alt="Pass rate and median tokens per run for the original harness, the always-on guard and the gated guard, on the tuning issues, the narrow-example bugs and the ordinary bugs." width="720" height="450">
<figcaption>Bars show pass rate; labels show median million tokens per run.</figcaption>
</figure>

Read the table by row. On the bugs where the guard matters (the first two rows), both guarded harnesses move the pass rate from 6 in 15 and 8 in 12 to between 7 in 8 and 9 in 9. On the bugs where it doesn't (the last two rows), the original harness already passes everything, and any guard is pure cost. The gated version is cheaper than always-on where the gate stays shut, and close to it where it opens.

## What an independent review said, and what happened next

Before making the gated guard Orbi's default, we opened a ticket for it, [orbi#1501](https://github.com/orbi-build/orbi/issues/1501), and Orbi opened the PR. Then the maintainer asked how we knew it was right, and we stopped: we labelled the ticket `ai-blocked` and asked for an independent review of the decision, with the data above. Its conclusion was not to merge this as the default, for four reasons.

- **The shipped version wasn't the tested version.** The gate asked the implementer to write its decision into the PR body. Orbi's runner writes the PR body, not the agent, so the line never appeared and the reviewer had nothing to check. We moved the decision into `.orbi/plan.md`, which the reviewer already reads. That fix (v19b) was a change, and it hadn't been benchmarked.
- **The cost falls on everyone.** Most Orbi users' bugs look like the ordinary set, where the original harness already passes and the guard only adds cost.
- **A strict reviewer rule can backfire.** Treating a wrong "not needed" as a major finding can add review rounds, and every extra round is more tokens and more time.
- **The benchmark doesn't belong in the product.** Our first PR carried about 3,000 lines of benchmark scripts into Orbi's own repository. They're now in [orbi-build/orbi-bench](https://github.com/orbi-build/orbi-bench).

Then we found that Orbi had merged the PR anyway, 71 seconds after the `ai-blocked` label went on. The runner re-checks the base branch, mergeability, the reviewed head and CI before it merges, but not the issue's labels, so a pause added mid-review is ignored. We reverted the merge ([orbi#1503](https://github.com/orbi-build/orbi/pull/1503)) before any release included it and filed the runner bug ([orbi#1504](https://github.com/orbi-build/orbi/issues/1504)). It is the same lesson as the rest of this study, one level up: a check that only runs at the start doesn't hold at the end.

## Where the gated guard fell short

After the review we benchmarked v19b, the version that records the gate decision where the reviewer can read it. It passed all three original failures and `dateparser`, and failed `picomatch`.

Reading the runs shows where the guard fell short. The gate's decisions were sensible: "applies" for the `pyinfra` table widths, `chainloop` redaction, `dateparser` formats and `picomatch` glob parsing, "not needed" for the `fedify` mock setters, which only rewire calls. On `picomatch` both gated runs, v19 and v19b, ran the guard and still missed the same two cases: an unclosed `[!]` and the `literalBrackets` option. The v19 run used Python's `fnmatch` and bash as its independent references, which implement POSIX globbing and know nothing of picomatch's options. The two always-on runs that passed enumerated those options on their own; their reports name them 4 and 12 times, the gated runs' reports not once. The rule that pushes an agent toward an independent reference pushed it toward one that couldn't express the input that mattered.

## What we're doing

The change is reverted and the work kept on its branch and in the benchmark repository. The plan, in order:

1. Ship the always-on guard (v15) behind a per-repository switch, off by default, with no gate. Repositories where text handling is the risk (parsers, formatters, redactors, anything with escaping) turn it on.
2. Measure what the switch costs in real deliveries on the repositories that turn it on: tokens, minutes and review rounds.
3. Find out why the guard misses inputs like `picomatch`'s: options that change parsing, and syntax that is left unclosed. Both are input classes the current prompt doesn't name, and the reference an agent picks should be able to express them.
4. Run the held-out sets on other implementer and reviewer models. Every unseen-bug result here uses `deepseek-flash`, so we can't yet say which combination to recommend.

The models will change, and so will the right harness for them. Every study we run goes on the [benchmark page](/benchmark/), with its data in the benchmark repository, so the next one starts from this one's numbers.

## Limits

Eight narrow-example bugs is a small set, and most cells have one to three runs, so a single run can move a cell by a third or more. The held-out results use one implementation model. The narrow-example bugs were chosen because a narrow fix fails them, which is the class the guard targets, so their failure rate is not the failure rate of Orbi's bugs in general. And a hidden grader only catches the defects the maintainer wrote tests for.

## Related

Read the [Claude Code comparison](/compare/claude-code/) and [Cloud](/cloud/).
