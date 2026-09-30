---
title: Searching for Orbi's harness, part 2: is the regression guard worth its tokens?
date: 2026-09-30
summary: On eight unseen bugs whose Issue shows only a narrow example, Orbi's original harness failed a third of its runs. We tested five harness designs to keep the fix without doubling the cost of every delivery. Here's what worked, what didn't, and why we picked the simplest one.
lang: en
author: Orbi
image: /img/blog-harness-part2.png
mirror: is-the-regression-guard-worth-its-tokens
---

[Part 1](/blog/searching-for-orbis-harness/) ended with a harness that fixed every failure it was tuned on but cost a median of about twice as much on other bugs, with no gain we could measure there. A guard like that is insurance. Two questions follow: does the risk it covers show up on bugs it has never seen, and can the premium come down?

This part answers both with eight more bugs and three more harness designs. The setup is the same as in part 1: a private snapshot, the real Orbi runner doing the full loop, and a hidden grader calibrated to fail the code before the fix and pass a known-good fix. The implementation and review model is `deepseek-flash` throughout. All scripts, tasks and results are in [orbi-build/orbi-bench](https://github.com/orbi-build/orbi-bench).

## Six takeaways

1. **The failure shows up on unseen bugs too.** On eight bugs whose Issue shows one narrow example of a wider problem, the original harness failed 4 of 12 runs. `dateparser` and `picomatch` each failed twice in three tries, both times on cases the Issue didn't show.
2. **The always-on guard fixes it.** It passed 9 of 10 on the same eight bugs. Its one miss, on `dateparser`, failed 2 of the maintainer's tests; the original harness's misses there failed 4 or 5. One of those 2 failures was new, though: that fix modified Python's global `calendar` module.
3. **Gating kept most of the gain, but not all of it.** Running the guard only when a change touches text handling passed all three original failures and 7 of 8 narrow-example bugs (always-on: 9 of 10). The gap is `picomatch`: both gated versions (v19 and v19b) failed it, and always-on passed it both times.
4. **Gating also saved almost nothing.** The gate opened on eight of the nine ordinary bugs, so the gated guard used 5.2 million tokens a run against 5.8 million always-on, about 10% less; the original harness used 2.8 million. A classifier that saves 10% and brings its own way to fail isn't worth the complexity.
5. **Two cheaper designs didn't work, and the reviewer never said no.** Strengthening only the reviewer passed 1 of 3 original failures: even with the full regression hunt in its prompt, it approved both regressions. Enriching the ticket first passed 2 of 3. Across all 183 runs, every one of the 38 that failed the hidden grader had passed Orbi's review.
6. **So we're dropping the gate.** We're going with the simpler design: the always-on guard behind a per-repository switch, off by default. Repositories whose bugs look like these (parsers, formatters, redactors, anything with escaping) turn it on. With no classifier, there's nothing to misclassify. Separately, Orbi merged our gated version 71 seconds after we paused it; we reverted it before any release.

## Eight unseen bugs like the ones Orbi got wrong

At the end of part 1, the harnesses looked identical everywhere except the three issues they were tuned on. But those three failures shared something the ordinary held-out bugs lacked: the Issue showed one example, and the correct fix had to handle a whole class of inputs around it. So we went looking for bugs like that.

Eight real bug fixes, all merged after August 10, 2026, all in small pure-Python, Go or JavaScript libraries: `loguru` (negative timestamps), `dateparser` (week-number formats), `gocsv` (zero-padded integers), `goja` (a dash after a class escape in a regex), `doublestar` (character classes inside `{}`), `picomatch` (negated brackets), `markdown-it` (IPv6 hosts in links) and `marked` (entities in link targets). In each, the maintainer's tests cover more than the Issue's example. We checked that a fix written only for the example passes the example and fails those tests. The ticket Orbi saw kept only the Issue's own example.

<figure class="post-media">
<img src="/img/diagrams/harness-narrow.svg" alt="Eight bugs whose Issue shows a narrow example. The original harness passed 8 of 12 runs, failing dateparser and picomatch twice each; the always-on guard passed 9 of 10; the gated guard passed 7 of 8." width="720" height="410">
<figcaption>Where the harnesses differ. dateparser and picomatch were run three times on the original harness.</figcaption>
</figure>

This is where the original harness slips, and on bugs it has never seen. On `dateparser`, the Issue showed two week-number formats; the maintainer's tests also cover week 00 rolling into the previous year and incomplete formats. Two of three original-harness runs fixed the two formats and missed both of those. On `picomatch`, the Issue showed `[!abc]`; the tests also cover an unclosed `[!]` and the `literalBrackets` option. Two of three runs missed them.

The always-on guard passed 9 of 10. Its one miss, on `dateparser`, failed 2 tests (the original harness's misses failed 4 to 5), and one of those two was a regression of its own: a change to Python's global `calendar` module. The gated guard passed 7 of 8, missing `picomatch` once. The numbers are small and a single run can flip a cell, but they point the same way as the three original failures. When the fix has to cover more than the example, generating inputs across the whole class is what finds the gap.

## Five harnesses on the failures Orbi shipped

The always-on guard fixes the failures but roughly doubles the median cost of the other fixes. So we tried three cheaper designs on the three issues Orbi originally got wrong, with `deepseek-flash` in both roles:

- **Reviewer only (v21)**: the original implementer prompt (plus the contribution skill and repository tools on `PATH`), with the guard only in the review. 1 of 3. Even with the full regression hunt in its prompt, the reviewer passed `chainloop` with no findings and passed `pyinfra` after fixing one finding itself. Both shipped the same regressions as before (the password leak and the 👍🏽 misalignment).
- **Enrich the ticket first (v20)**: before the runner starts, a cheap model reproduces the bug in a scratch copy and appends an analysis to the Issue: where the bug is, which input classes the fix must handle with concrete examples, what must not change, and a design outline. Then the original harness runs. 2 of 3; `pyinfra` still shipped the 👍🏽 and が regressions.
- **Gated guard (v19)**: the full guard, but only when a change alters how text or bytes are parsed, escaped, trimmed, split, measured, matched, replaced, encoded or redacted. Other changes get a targeted test and the existing suite. 3 of 3.

<figure class="post-media">
<img src="/img/diagrams/harness-variants.svg" alt="Five harnesses on the three issues Orbi got wrong: original 6 of 15, reviewer only 1 of 3, enrich ticket 2 of 3, gated guard 3 of 3, always-on guard 9 of 9, with median tokens per run under each bar." width="720" height="400">
<figcaption>Pale bars have fewer than five runs. Median million tokens per run under each bar.</figcaption>
</figure>

The gate saved less than we hoped. On all nine ordinary bugs, the gated guard passed 9 of 9 at a median 5.2 million tokens per run, against 2.8 million for the original harness and 5.8 million for the always-on guard. Most of those bugs touch text handling too (a regex, an argument parser, a line wrapper), so the gate opened on eight of the nine.

## What it costs, set by set

Pass rate is only half the decision. Cache reads make up about 97% of each run's tokens, and they grow with the number of turns an agent takes. A harness that asks for more checking usually costs more.

| Set | Original | Always-on guard (v15) | Gated guard (v19) |
|---|---|---|---|
| 3 issues Orbi got wrong (tuning) | 6/15 · 5.7M | 9/9 · 13.4M | 3/3 · 10.8M |
| 8 narrow-example bugs (unseen) | 8/12 · 3.6M | 9/10 · 8.3M | 7/8 · 5.2M |
| 9 ordinary bugs (unseen) | 9/9 · 2.8M | 9/9 · 5.8M | 9/9 · 5.2M |
| 3 regression-prone bugs (unseen) | 4/4 · 7.1M | 3/3 · 13.9M (no numpy) | not run |

Each cell is passes / runs · median million tokens per run. Median minutes per run follow the same pattern: 11, 16 and 15 on the ordinary bugs; 12.5, 19 and 17.5 on the narrow-example ones.

<figure class="post-media">
<img src="/img/diagrams/harness-tradeoff.svg" alt="Pass rate and median tokens per run for the original harness, the always-on guard and the gated guard, on the tuning issues, the narrow-example bugs and the ordinary bugs." width="720" height="450">
<figcaption>Bars show pass rate; labels show median million tokens per run.</figcaption>
</figure>

Read the table by row. On the bugs where the guard matters (the first two rows), both guarded harnesses move the pass rate from 6 in 15 and 8 in 12 to between 7 in 8 and 9 in 9. On the bugs where it doesn't (the last two rows), the original harness already passes everything, and any guard is pure cost. The gated version beats always-on on cost only where the gate stays shut; where it opens, the two cost about the same.

## What an independent review said, and what happened next

We planned to make the gated guard Orbi's default, opened a ticket for it, [orbi#1501](https://github.com/orbi-build/orbi/issues/1501), and Orbi opened the PR. Then the maintainer asked how we knew it was right, and we stopped. We labelled the ticket `ai-blocked` and asked an independent reviewer to find what was wrong with the decision, using the data above. Its conclusion was not to merge this as the default, for four reasons.

- **The shipped version wasn't the tested version.** The gate asked the implementer to write its decision into the PR body. But Orbi's runner writes the PR body, not the agent, so the line never appeared and the reviewer had nothing to check. We moved the decision into `.orbi/plan.md`, which the reviewer already reads. That fix (v19b) was itself a change, and it hadn't been benchmarked yet.
- **The cost falls on everyone.** Most Orbi users' bugs look like the ordinary set, where the original harness already passes and the guard only adds cost.
- **A strict reviewer rule can backfire.** Treating a wrong "not needed" as a major finding can add review rounds, and every extra round costs tokens and time.
- **The benchmark doesn't belong in the product.** Our first PR carried about 3,000 lines of benchmark scripts into Orbi's own repository. They're now in [orbi-build/orbi-bench](https://github.com/orbi-build/orbi-bench).

Then we found that Orbi had merged the PR anyway, 71 seconds after the `ai-blocked` label went on. The runner re-checks the base branch, mergeability, the reviewed head and CI before it merges, but not the issue's labels, so a pause added mid-review is ignored. We reverted the merge ([orbi#1503](https://github.com/orbi-build/orbi/pull/1503)) before any release included it and filed the runner bug ([orbi#1504](https://github.com/orbi-build/orbi/issues/1504)). It's the same lesson as the rest of this study, one level up: a check that only runs at the start doesn't hold at the end.

## Where the gated guard fell short

After the review we benchmarked v19b, the version that records the gate decision where the reviewer can read it. It passed all three original failures and `dateparser`, and failed `picomatch`.

The transcripts show the problem was in the guard itself. The gate decided sensibly: "applies" for the `pyinfra` table widths, `chainloop` redaction, `dateparser` formats and `picomatch` glob parsing, "not needed" for the `fedify` mock setters, which only rewire calls. On `picomatch` both gated runs, v19 and v19b, ran the guard and still missed the same two cases: an unclosed `[!]` and the `literalBrackets` option. The v19 run used Python's `fnmatch` and bash as its independent references, which implement POSIX globbing and know nothing of picomatch's options. The two always-on runs that passed enumerated those options on their own; their reports name them 4 and 12 times, the gated runs' reports not once. The rule that sends an agent looking for an independent reference sent it to one that couldn't express the input that mattered.

## What we're doing

The change is reverted; the work lives on its branch and in the benchmark repository. Next, in order:

1. Ship the always-on guard (v15) behind a per-repository switch, off by default, with no gate. Repositories where text handling is the risk (parsers, formatters, redactors, anything with escaping) turn it on.
2. Measure what the switch costs in real deliveries on the repositories that turn it on: tokens, minutes and review rounds.
3. Find out why the guard misses inputs like `picomatch`'s: options that change parsing, and syntax that is left unclosed. The current prompt names neither class, and the reference an agent picks needs to be able to express them.
4. Run the held-out sets on other implementer and reviewer models. Every unseen-bug result here uses `deepseek-flash`, so we can't yet say which combination to recommend.

Models will change, and the right harness will change with them. Every study we run goes on the [benchmark page](/benchmark/), with its data in the benchmark repository, so the next one picks up from this one's numbers.

## Limits

Eight narrow-example bugs is a small set. Most cells have one to three runs, so a single run can move a cell by a third or more. The held-out results use one implementation model. We chose the narrow-example bugs because a narrow fix fails them. That's the class the guard targets, so their failure rate says little about Orbi's bugs in general. And a hidden grader only catches the defects the maintainer wrote tests for.

## Related

Read the [Claude Code comparison](/compare/claude-code/) and [Cloud](/cloud/).
