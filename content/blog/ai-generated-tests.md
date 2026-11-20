---
title: AI-generated tests: what auditing 5,087 of ours found
date: 2026-11-20
summary: I classified 5,087 Vitest cases in Orbi Cloud's repo, most last written by our bot. A third pinned implementation: why, the rule I added, how CI time fell.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-ai-generated-tests-card.png
---

Orbi is an open-source system that takes a GitHub Issue through implementation, review, merge and release; this post audits the Vitest suites in Orbi Cloud's own repository, where Orbi's delivery bot last wrote most of the test registrations. It is for engineering leads and solo maintainers who use coding agents to write code and AI-generated tests, then let the suite gate merges. You get the counts, where the implementation tests came from, a repository rule to copy, and how the measured CI test-step median fell from 271 s to 102 s after setup and parallelism changes.

I'm Larry 🍀 Orbi, the creator of Orbi.

## How the audit counted

On 18 November 2026, I had independent, read-only Codex sessions classify the tests in Orbi Cloud's repository at beta commit `4619a9fc`. The work covered the three TypeScript suites run by Vitest: the main test directory, browser tests and operational-script tests. The repository's 5 Python test files (32 test methods) were not part of the audit. The orbi-cloud repository is private, so I quote the audit's numbers and name its issues without links. An internal discussion records every classification and the counting scripts.

The audit counted expanded test cases: parameterized registrations and loops that registered tests were expanded; a loop checking several inputs inside a test body stayed a single case. A case containing both observable-behavior assertions and implementation assertions counted as implementation-coupled. Categories could overlap.

Reading business records from a database or checking content sent to an external service counted as behavior. Using a selector to extract visible text did, too. The question was whether an assertion depended on a particular implementation while the result visible to a user or caller could stay the same.

I spot-checked the source at 5 locations; only the example counting disabled controls by their form submission address was ambiguous. That address could reasonably identify the rendered controls. This limited check cannot establish a classification error rate for the whole audit. The audit was static; it did not measure defect detection or the cost of every failing test.

To check the labels, I gave a separate DeepSeek session the same definitions and 60 test registrations drawn at random from the main directory (seed 20261120), without the audit's labels. It agreed on 48 of 60 (80%, Cohen's kappa 0.60). It confirmed all 18 cases the audit had marked implementation-coupled; every one of the 12 disagreements went the other way, with the second rater marking as implementation-coupled a case the audit had called behavior, mostly exact comparisons of HTML fragments such as hidden inputs and direct calls to internal helpers. On this sample, the audit's count is not inflated. A first attempt was discarded because that session found and read the file holding the audit's labels.

## What the audit of AI-generated tests found

The strict count classified 1,739 of 5,087 cases as implementation-coupled, or 34%. The total also includes 16 uncertain cases, which are outside the implementation-coupled count.

| Test directory | Files | Cases | Implementation-coupled | Uncertain |
|---|---:|---:|---:|---:|
| Main, `test/` | 160 | 3,999 | 1,046 | 7 |
| `test/browser/` | 80 | 639 | 466 | 0 |
| `test/runbook/` | 47 | 449 | 227 | 9 |

The categories explain what the audit called testing implementation details. A case can appear in several categories, so adding category rows within a suite would double-count cases.

| Assertion category | Main | Browser | Operational scripts |
|---|---:|---:|---:|
| Reading source text | 15 | 360 | 112 |
| Internal call arguments or counts | 47 | 1 | 49 |
| SQL text | 31 | 0 | 4 |
| Internal shape: classes, IDs, array lengths, script text, HTML structure | 939 | 221 | 73 |
| Snapshots pinning internal structure | 18 | 0 | 0 |
| Calling internal helpers to inspect intermediate values | 74 | 0 | 57 |

In the browser suite, 244 cases qualified solely because a mounting helper looked for a source marker in the page's script before running it. They meet the strict definition. The helpers are file-local copies (72 browser test files define their own `mount`), so the repair was to let the page run its own scripts, applied file by file. Some internal-shape cases also used class names as locators or counted controls a user could click, which makes their classification debatable.

Excluding those helper-only source checks and ambiguous locator uses gives a narrower classification. On that basis, the audit estimated roughly 1,300–1,500 clearly implementation-coupled cases, or 25%–30%. This is an approximate reclassification, without a second exact case-by-case tally or a statistical confidence interval. The full report retains 34% as the strict result; a shared repair pattern does not invalidate that count.

## Who wrote them

Git blame attributed 3,576 of 4,687 test registration lines to `orbi-build[bot]`, or 76% rounded to a whole percent. These are the last authors of registration lines, not a reconstruction of who composed every assertion. A parameterized registration can represent several cases, so this denominator differs from the audit's 5,087 cases.

That establishes a predominantly bot-maintained suite. I have no human-written control group and no comparison of equivalent tasks assigned to people and agents. This audit does not show that agents write worse tests than people. If you have AI writing unit tests, include the browser and operational-script suites in this check too.

## Where the implementation tests came from

My ticket-writing rules told me to write acceptance criteria such as "only one rendering or decision function exists", and individual tickets asked that an old sentence "can no longer be found in the source". The delivery agent implemented those instructions literally. An architectural cleanup requirement became a permanent test of source organization.

Issue #3355 asked for shared billing logic for the initial page and the polling response, and its acceptance included that the source keep only one implementation of the free-runs count. Issue #3436 required retired copy to disappear from the source. Its `proof-receipt-source-3436.test.ts` recursively scanned every `.ts` file under `src` for the retired sentence. Passing it established that the phrase was absent from those files; it could not establish what a visitor saw on the page.

The Cloud status page's main card had readable text fixtures alongside a whole-page SHA-256 snapshot. The snapshot lived for about eight days, from 11 November 2026, 02:24 (UTC+8) to 19 November 2026, 12:50 (UTC+8). During that lifetime, 36 non-merge commits touched `page-sha256.json`, all attributed to the bot: 1 created it and 35 rewrote it. Of the 35 rewrites, 28 changed no main-card text fixture and 7 deliberately changed the main card. Comments in the test recorded rebuilds where the card text stayed identical while the whole-page hash changed.

The hash also covered the rest of the page. These counts do not establish whether each update was worthwhile or how many defects the snapshot caught. I changed the [ticket-writing approach](/blog/write-a-request/) because my own acceptance wording had asked the agent to preserve these implementation checks.

## The rule I added

I added this rule to `AGENTS.md` on 18 November 2026, in commit `62738cff`. This is a translation:

> Tests must assert only results that users or callers can observe: API responses, page text and links, outgoing emails and GitHub comments, database records representing business facts, and script exit codes and output.
>
> Do not write the following tests, even if a ticket requests them. If it does, explain in the pull request which observable result you tested instead:
>
> - Reading source text to check whether a string exists, count rules in the source, or assert that only a single implementation exists.
> - The way page scripts or SQL statements are written.
> - Internal function call arguments and counts, except for content sent externally.
> - Internal array lengths, constant values, or element IDs.
> - Whole-page hash snapshots.
>
> The repository-wide audit on 18 November 2026 found that these categories accounted for roughly 30 percent of all cases. Renaming something or adjusting styling makes them fail, and they also slow every test run.

The rule's 30 percent is the rounded narrower estimate; the strict count is 34%. The claim that these tests slow every run is the rule's rationale, not something the audit measured: it did not isolate the runtime cost of those assertion categories. The timing work below measured migration setup and parallelism.

The corresponding ticket-writing rule is to require that, given the same data, both places show the same result, checked on the rendered page or API response. Requiring that only a single implementation exists makes code organization part of the merge contract. A reviewer can inspect whether logic is shared without making that structure a permanent assertion.

## The cleanup

I opened six cleanup tickets, #3536 through #3541, on 19 November 2026, 09:54 (UTC+8). Orbi opened and merged all six corresponding PRs; the last merged on 20 November 2026, 08:15 (UTC+8).

The work covered browser script mounting, the whole-page snapshot, source-text scans, page render assertions and operational-script tests. The snapshot ticket replaced the page hash with assertions about titles, buttons and links in the relevant states. Browser tests let the page run its scripts instead of selecting scripts by source markers and injecting them.

Issue #3539 supplies a partial improvement. The suggestion-block test previously asserted that its returned HTML contained `location.reload()`. The rewritten test checks button labels in the empty and populated states, and the absence of buttons while suggestions are being read. That lets the refresh implementation change without changing the expected controls. Its scope is the rendered controls; clicking and the resulting request or page change need a browser assertion.

The rewrite still contains `expect(SUGGESTION_RERUN_QUERY).toBe(SUGGESTION_RERUN_PATH)`, a constant-equality assertion prohibited by the new rule. I cannot call the cleanup complete compliance with the rule. The rule needs a reviewer who checks the assertions, even when the delivery prompt already includes it.

## Making the test suite faster

This part applies to Cloudflare Workers + Vitest with `@cloudflare/vitest-plugin` 1.x and Vitest 4. The runtime changes were separate from the assertion cleanup. Issue #3493 measured initialization and parallelism. Its assertion changes were limited to removing a redundant timing check.

Each test file's setup imported `applyD1Migrations` from `cloudflare:test` to initialize its test database. A single-file measurement with just that import cost 1.78 s of setup. Without the import, executing the same logic for all 86 migrations directly against `env.DB` took about 0.06 s. Loading the library alone cost more than running the migrations directly.

The replacement in `test/apply-migrations.ts` keeps the same four steps: create the migration ledger, read applied names, skip applied migrations, and batch each remaining migration with its ledger entry. After preparing the ledger and statement, the loop is:

```typescript
for (const migration of env.TEST_MIGRATIONS) {
	if (applied.has(migration.name)) continue;
	const queries = migration.queries.map((query) => env.DB.prepare(query));
	queries.push(recordApplied.bind(migration.name));
	await env.DB.batch(queries);
}
```

The local measurements in #3493 used the same 32-core machine with coverage enabled:

| Configuration | Workers | Total elapsed | Cumulative setup |
|---|---:|---:|---:|
| Original | 2 | 199 s | 214 s |
| Inlined migration setup only | 2 | 156 s | 8 s |
| Increased parallelism only | 8 | 93 s | 402 s |
| Both changes | 8 | 69 s | 10 s |

Cumulative setup adds work across files and workers, so it can exceed elapsed time. The parallelism-only run finished sooner while accumulating more setup work. Measuring elapsed time alone would have hidden the repeated import cost.

CI now sets `VITEST_MAX_WORKERS=8`; the delivery sandbox keeps its default of 2. At 8 workers, a request-duration assertion failed with `expected 2216 to be less than 2000`. The test already held a database write behind a gate, received the response, then released the write. That ordering proved the response did not wait for the write. I removed the redundant elapsed-time assertion instead of giving it a larger threshold.

The GitHub Actions `Run npm test` step had a median of 271 s across 60 successful PR runs on 18 November 2026 (UTC); the query asked for 17–18 November and returned its 60-run cap, all from the 18th. Across 80 successful PR runs after the changes, its median was 102 s. These are step durations, including the test command's overhead, not full workflow times. The before sample is therefore not a census of that day.

The after sample spans 19 November 2026, 15:40 UTC through 20 November 2026, 00:46 UTC. Repository changes continued between the samples, including cleanup work. The CI comparison is an observed before-and-after result; the local table separates the effects of setup and parallelism. The speedup PRs, #3527 and #3533, merged on 19 November 2026 at 08:36 and 10:42 (UTC+8), before that sample.

## A checklist for your repo

- Classify assertions by what they observe; record mixed cases and uncertain classifications explicitly.
- Inspect shared test helpers before treating every flagged case as a separate repair.
- Trace source scans and implementation assertions back to the ticket that requested them.
- Write acceptance criteria around visible results for the same input, and review the assertions against that requirement.
- Replace broad snapshots with the outputs you need to preserve; keep interaction checks for what buttons actually do.
- Measure setup separately from execution, compare parallelism on the same machine, and prefer controlled ordering over wall-clock assertions.

## Related

The [analysis of PRs waiting after merge](/blog/ai-code-review-bottleneck/) measures another part of Orbi's delivery loop. The [Claude Code comparison](/compare/claude-code/?ref=blog-ai-tests) and [Orbi Cloud](/cloud/?ref=blog-ai-tests) describe the tools and hosted workflow.
