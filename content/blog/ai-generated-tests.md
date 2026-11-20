---
title: AI-generated tests: what I found in 5,087 cases
date: 2026-11-20
summary: A strict count found that a third of 5,087 Orbi Cloud Vitest cases pinned implementation details. I trace why, add a repo rule and speed up the test step.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-ai-generated-tests-card.png
mirror: ai-generated-tests
---

Orbi is an open-source system that takes a GitHub Issue through implementation, review, merge and release. I audited the Vitest suites in the private repository of Orbi Cloud, its hosted service, where Orbi's delivery bot last changed most test registration lines. Engineering leads and solo maintainers who use coding agents to write code and AI-generated tests can use these counts and the repository rule to check the suite they rely on for merge decisions. I also trace where the implementation-coupled tests came from, and show the setup and parallelism changes behind a CI test-step median that fell from 271 s to 102 s.

I'm Larry 🍀 Orbi, the creator of Orbi.

## How the audit counted

On 18 November 2026, I had independent, read-only Codex sessions classify the tests in Orbi Cloud's repository at beta commit `4619a9fc`. They covered the three TypeScript suites run by Vitest: the main test directory, browser tests and operational-script tests. The audit excluded the repository's 5 Python test files (32 test methods). The orbi-cloud repository is private, so I quote the audit's numbers and name its issues without links.

The audit counted each case registered through parameters or loops separately. A loop checking several inputs inside a test body still counted as a single case. A case with both observable-behavior assertions and implementation assertions counted as implementation-coupled. Implementation-assertion categories could overlap.

Reading business records from a database or checking content sent to an external service counted as behavior. So did using a selector to extract visible text. In the usual phrase, I asked whether a test was testing implementation details: could an assertion fail when the implementation changed but the result visible to a user or caller stayed the same?

I spot-checked the source at 5 locations. Only one was ambiguous: a test that counted the deactivate buttons by their form's submit address, which can reasonably identify the controls a user sees. The spot-check was too small to estimate a classification error rate for the whole audit. I reviewed the tests statically, without measuring how well they detected defects or the cost of each failure.

To check the labels, I gave a separate DeepSeek session the same definitions and 60 test registrations drawn at random from the main directory (seed 20261120), without the audit's labels. It agreed on 48 of 60 (80%; Cohen's kappa 0.60, usually read as moderate agreement), including all 18 cases the audit had marked implementation-coupled. In all 12 disagreements, it marked a case as implementation-coupled where the audit had called it behavior. Most involved exact comparisons of HTML fragments such as hidden inputs, or direct calls to internal helpers. On this main-directory sample the second rater was stricter, never calling a case behavior that the audit had marked implementation-coupled, so it shows no overstatement there. A first attempt was discarded because that session found and read the file holding the audit's labels.

## A third of the cases pinned implementation

The strict count classified 1,739 of 5,087 cases as implementation-coupled, or 34%. The total also includes 16 uncertain cases, which are outside the implementation-coupled count.

| Test directory | Files | Cases | Implementation-coupled | Uncertain |
|---|---:|---:|---:|---:|
| Main, `test/` | 160 | 3,999 | 1,046 | 7 |
| `test/browser/` | 80 | 639 | 466 | 0 |
| `test/runbook/` | 47 | 449 | 227 | 9 |

The audit grouped implementation assertions into the categories below. A case can appear in several categories, so adding category rows within a suite would count some cases more than once.

| Assertion category | Main | Browser | Operational scripts (`test/runbook/`) |
|---|---:|---:|---:|
| Reading source text | 15 | 360 | 112 |
| Internal call arguments or counts | 47 | 1 | 49 |
| SQL text | 31 | 0 | 4 |
| Internal shape: classes, IDs, array lengths, script text, HTML structure | 939 | 221 | 73 |
| Snapshots pinning internal structure | 18 | 0 | 0 |
| Calling internal helpers to inspect intermediate values | 74 | 0 | 57 |

In the browser suite, 244 cases met the strict definition solely because a mounting helper looked for a source marker in the page's script before running it. The helpers are copied into individual files: 72 browser test files define their own `mount`. There was no single helper to fix; the cleanup PR, #3638, rewrote the mounting across the browser test files so pages run their own scripts. Some internal-shape cases used class names to find elements or counted controls a user could click; those classifications are also debatable.

After excluding source checks introduced only by the helpers and ambiguous uses of locators, the audit estimated roughly 1,300–1,500 clearly implementation-coupled cases, or 25%–30%. That estimate did not include a second exact case-by-case count or a statistical confidence interval. The full report keeps 34% as the strict result, even when several cases can be fixed the same way.

## Who wrote them

Git blame attributed 3,576 of 4,687 test registration lines to `orbi-build[bot]`, or 76%. It identifies who last changed each registration line; it cannot tell me who wrote every assertion. A parameterized registration can register several cases, so this denominator differs from the audit's 5,087 cases.

The bot maintained most of this suite, but I have no human-written control group and did not compare equivalent tasks assigned to people and agents. I cannot conclude from this audit that agents write worse tests than people. If you have AI writing unit tests, audit the browser and operational-script suites too: by share of cases, that is where the coupling was densest.

## Where the implementation tests came from

My ticket-writing rules called for acceptance criteria such as "only one rendering or decision function exists". Individual tickets asked that an old sentence "can no longer be found in the source". The delivery agent followed those instructions literally, turning architectural cleanup requirements into permanent tests of source organization.

Issue #3355 asked the initial page and polling response to share billing logic, with acceptance criteria requiring a single implementation of the free-runs count in the source. Issue #3436 required removing retired copy from the source. Its `proof-receipt-source-3436.test.ts` recursively scanned every `.ts` file under `src` for the retired sentence. A passing test meant those files did not contain the phrase. It said nothing about what a visitor saw on the page.

The Cloud status page's main card had readable text fixtures alongside a whole-page SHA-256 snapshot. The snapshot lived for about eight days, from 11 November 2026, 02:24 (UTC+8) to 19 November 2026, 12:50 (UTC+8). During that lifetime, 36 non-merge commits touched `page-sha256.json`, all attributed to the bot: 1 created it and 35 rewrote it. Of the 35 rewrites, 28 changed no main-card text fixture and 7 deliberately changed the main card. Comments in the test recorded rebuilds where the card text stayed identical while the whole-page hash changed.

Because the hash also covered the rest of the page, the counts cannot tell me whether each update was worthwhile or how many defects the snapshot caught. I changed the [ticket-writing approach](/blog/write-a-request/) because my own acceptance wording had led the agent to write these implementation checks.

## The rule I added

I added this rule to `AGENTS.md` on 18 November 2026, in commit `62738cff`, translated here from Chinese:

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

The rule's 30 percent matches the top of the narrower 25%–30% estimate; the strict count is 34%. I cited slower test runs as a reason for the rule, but the audit did not measure the runtime cost of those assertion categories separately. The timing measurements below covered migration setup and parallelism.

I also changed the ticket-writing rule: given the same data, the two places being compared must show the same result, checked on the rendered page or API response. Requiring a single implementation makes code organization a condition for merging. A reviewer can check whether the logic is shared without adding a permanent assertion about that structure.

## The cleanup

I opened six cleanup tickets, #3536 through #3541, on 19 November 2026, 09:54 (UTC+8). Orbi opened and merged all six corresponding PRs; the last merged on 20 November 2026, 08:15 (UTC+8).

The work covered browser script mounting, the whole-page snapshot, source-text scans, page render assertions and operational-script tests. The snapshot ticket replaced the page hash with assertions about titles, buttons and links in the relevant states. Browser tests let the page run its scripts instead of selecting scripts by source markers and injecting them.

In Issue #3539, the suggestion-block test previously asserted that its returned HTML contained `location.reload()`. The rewritten test checks button labels in the empty and populated states, and that there are no buttons while the suggestion read is in progress. The refresh implementation can change while the expected controls stay the same. The test only covers rendered controls; a browser assertion still needs to check what happens on click, including the resulting request or page change.

The cleanup still violates the new rule: the rewrite contains `expect(SUGGESTION_RERUN_QUERY).toBe(SUGGESTION_RERUN_PATH)`, which checks that two constants are equal. A reviewer needs to check the assertions even when the delivery prompt includes the rule.

## Making the test suite faster

The timing work applies to Cloudflare Workers + Vitest with `@cloudflare/vitest-plugin` 1.x and Vitest 4. The changes to how the tests ran were separate from the assertion cleanup. Issue #3493 measured initialization and parallelism; its only assertion change removed a redundant timing check.

Each test file's setup imported `applyD1Migrations` from `cloudflare:test` to initialize its test database. I reran a single small test file at the commits before and after the change, with coverage off and one worker: setup was 2.33 s with the import and 62 ms with the same logic run directly against `env.DB` for all 88 migration files.

The replacement in `test/apply-migrations.ts` keeps the same four steps: create the migration ledger, read applied names, skip applied migrations, and batch each remaining migration with its ledger entry. `recordApplied` is a D1 prepared statement, so its `.bind()` fills the `?` placeholder with the migration name; it is not `Function.prototype.bind`. The line before the loop, then the loop:

```typescript
const recordApplied = env.DB.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?);`);

for (const migration of env.TEST_MIGRATIONS) {
	if (applied.has(migration.name)) continue;
	const queries = migration.queries.map((query) => env.DB.prepare(query));
	queries.push(recordApplied.bind(migration.name));
	await env.DB.batch(queries);
}
```

I reran the four configurations from #3493 on the main suite on 20 November, on a 32-core machine, with coverage on as in CI. The machine was busy (load average about 23 to 26), and the "after" commit also carries other beta changes (4,052 tests against 4,025 in the main `test/` suite, which is what this command runs), so read the table for direction, not exact savings:

| Configuration | Workers | Total elapsed | Cumulative setup |
|---|---:|---:|---:|
| Original | 2 | 262 s | 318 s |
| Inlined migration setup only | 2 | 192 s | 8 s |
| Increased parallelism only | 8 | 155 s | 816 s |
| Both changes | 8 | 109 s | 12 s |

Cumulative setup sums the time spent across files and workers, so it can exceed elapsed time. Increasing parallelism alone finished the run sooner but spent more time on setup in total. The measurements recorded in the issue went the same way, from 199 s to 69 s.

CI now sets `VITEST_MAX_WORKERS=8`; the delivery sandbox keeps its default of 2. At 8 workers, an assertion on request duration failed: `expected 2216 to be less than 2000` in the issue's runs, and `expected 4887 to be less than 2000` in my rerun (milliseconds, against a 2-second limit). The test already blocked a database write until it received the response, then released the write, proving that the response did not wait for the write. I removed the redundant elapsed-time assertion rather than raising its threshold.

The GitHub Actions `Run npm test` step had a median of 271 s across the 60 most recent successful PR runs in the query window, all on 18 November 2026 (UTC). The query covered 17–18 November but hit its 60-run cap, with all results from the 18th, so the sample did not cover every run that day. Across the 80 most recent successful PR runs after the changes, the median was 102 s. The suite did not shrink in between: test registration lines went from 4,687 at the audit commit to 4,952 on beta at 00:53 UTC on 20 November, just after that sample. Both medians measure the test step, including the test command's overhead; they do not measure full workflow times.

The post-change sample spans 19 November 2026, 15:40 UTC through 20 November 2026, 00:46 UTC. The repository kept changing between the samples, and cleanup work overlapped the post-change sample: the last cleanup PR merged at 00:15 UTC on 20 November. Only the local table separates the effects of setup and parallelism. The speedup PRs, #3527 and #3533, merged on 19 November 2026 at 08:36 and 10:42 (UTC+8), before that sample.

## A checklist for your repo

- Classify assertions by what they check; record mixed cases and uncertain classifications explicitly.
- Inspect shared test helpers before treating every flagged case as a separate repair.
- Trace source scans and implementation assertions back to the ticket that requested them.
- Write acceptance criteria for visible results given the same input, then check that the assertions follow that requirement.
- Replace broad snapshots with the outputs you need to preserve; keep interaction checks for what buttons actually do.
- Measure setup separately from execution and compare parallelism on the same machine. Where possible, control the order of events and assert that order instead of wall-clock time.

## Related

The [analysis of PRs waiting after merge](/blog/ai-code-review-bottleneck/) measures another part of Orbi's delivery loop. The [Claude Code comparison](/compare/claude-code/?ref=blog-ai-tests) and [Orbi Cloud](/cloud/?ref=blog-ai-tests) describe the tools and hosted workflow.
