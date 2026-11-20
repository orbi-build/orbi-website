---
title: Make AI agents test behavior, not implementation
date: 2026-11-20
summary: Rules, ticket wording and review checks that make AI coding agents test what users see, from an audit of 5,087 tests where 34% checked how code is written.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-ai-generated-tests-card.png
mirror: ai-generated-tests
---

If an AI agent writes most of your tests, many of them may check how the code is written instead of what users see (in our repository, 34% asserted at least one such detail, often alongside a real behavior check), and those tests then decide what gets merged. This post is for teams in that position: it gives the three rules we use to make agents write behavior tests, what they look like for browser tests, and a method to audit your own suite in about half an hour. It also covers how we cut the test step in CI from 4:26 to 1:39 on Cloudflare Workers, mostly by raising the worker count, with a smaller win from the setup change below.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi is a delivery engine: it takes a GitHub issue, has one agent write the code and tests, has a second agent review the change, then merges and ships it, with no human in the loop by default. Orbi Cloud, our hosted product, is a codebase that Orbi mostly builds itself. On 18 November we classified all 5,087 tests in that codebase: 1,739 of them, 34%, asserted at least one implementation detail. Many of those also check a real behavior and are counted only because they assert an implementation detail too, so read 34% as "has at least one implementation assertion", not "is a bad test" (the stricter cut is 29%, below). The rules below are what we changed afterwards; the audit is further down as evidence.

## What counts as behavior

A behavior test asserts something a user or caller can observe: an HTTP status and the text on the page, what a rendered page lets you see and click, the content of an email or GitHub comment the code sends, a database row that records a business fact, a script's exit code and output.

An implementation test asserts how the code happens to be written. In the audit we sorted these into six kinds, and the list works as a rubric for review:

- A: reads source text (searches a file for a string, counts rules, asserts "there is only one implementation").
- B: asserts arguments, call counts or call order of internal functions. Calls that cross a real boundary (sending an email, calling GitHub or Stripe) and assert what was sent count as behavior.
- C: asserts SQL text, table names or index names.
- D: asserts internal shape: array lengths, object keys, constant values, CSS class names or element IDs the user never sees, page script text, CSS text, whole HTML strings.
- E: snapshots that pin internal structure rather than visible output.
- F: calls an internal helper and asserts its intermediate return value. If the helper is itself a business rule (say, "when does the trial end"), that's behavior.

The test of a test: would it go red when nothing a user sees has changed? If yes, it's pinned to implementation. The second question is narrower: for the behavior this test claims to cover, would it stay green when that behavior is broken? If yes, the test is asserting the wrong thing: either the assertion or the coverage needs fixing. (A title-only test staying green when a button breaks isn't testing implementation; it just never covered the button.)

## Rule 1: write down what a test may assert

Agents follow the instructions file in the repository. Ours had one line on testing: don't write unit tests for UI structure or styling. That said nothing about reading source, asserting SQL or counting internal calls, so none of it was off limits. This is the rule now, in the testing section of `AGENTS.md`:

> Tests only assert results a user or caller can see: API responses, text and links on a page, emails and GitHub comments sent, database rows that record business facts, a script's exit code and output. Do not write the following, even if the ticket asks for them (if it does, say in the pull request which visible result you asserted instead): reading source text (searching for a string, counting rules, asserting a single implementation); how a page script or SQL statement is written; arguments and call counts of internal functions (content sent outward excepted); internal array lengths, constant values, element IDs; whole-page hash snapshots.

Two parts of it do most of the work. The list names concrete forms instead of saying "avoid implementation details", because an agent applies a list literally and a principle loosely. And "even if the ticket asks for them" is there because some of our tickets did ask for them (next rule).

## Rule 2: acceptance criteria describe results, not code

For a while my own ticket-writing rules said that when two parts of the code must share one decision, the acceptance criterion should read "there is only one render function". The delivery agent did exactly what that said: it wrote a permanent test that scans the source and fails if a second implementation appears. Several of the source-reading tests in the audit trace back to tickets written that way.

So the criterion now describes what a user would notice if the rule broke. "There is only one function that decides the heading" became "for the same input, the first render and the live update show the same heading". The agent can satisfy that only by rendering both and comparing what a person would read, and the test survives any refactor that keeps the heading right.

Our reviewer agent checks the diff against the acceptance criteria. A criterion that describes source structure steers both the agent writing the test and the one reviewing it toward checking that structure instead of the result, so the wording of the criterion shapes what the test ends up asserting.

## Rule 3: one-time equivalence checks go in the pull request

"This refactor changed nothing" is true once, on the day of the refactor. Prove it by pasting the before and after output into the pull request, not by adding a permanent test.

We learned this twice. On the open-source engine, a golden snapshot of the CLI output recorded the full line `orbi 0.7.15`, so the v0.7.16 release commit failed the tests job on main. Every version bump rewrote that line. The fix ([orbi `c5e0f0db`](https://github.com/orbi-build/orbi/commit/c5e0f0db)) asserts `--version` against the package version in its own test and keeps the version line out of the golden capture, so a release bump stays green while changed help text still fails. On Orbi Cloud, when the status page was split into one file per card type, the agent added a test that rendered 18 screens and compared each page's SHA-256 with a stored value. Every later change to anything on those pages had to update the stored hashes: in the nine days before the test was removed, 35 non-merge commits touched that fixture file at all. Not all of them were for the snapshot's sake, but about five say in the commit message that re-generating the snapshot was the only change. The test has since been replaced by assertions on what each card shows.

## Rules for browser and end-to-end tests

For browser tests the rules become concrete:

- Let the page run its own scripts the way a browser would. If the test needs a fake network or fake timers, install them before the page loads. About 50 of our browser test files instead did this:

  ```ts
  const source = [...rendered.querySelectorAll("script")]
    .map((script) => script.textContent ?? "")
    .find((text) => text.includes("delivery-progress-data"));
  expect(source).toBeTruthy();
  ```

  They stripped the page's scripts, installed stubs, then evaluated the one script found by searching for a string inside it. Renaming a data block inside that script would break dozens of tests that otherwise asserted visible text correctly.
- Assert what a person would see or do: the heading text, which button is enabled, what the page shows after the fake server answers, the request the page sent. Class names, node identity and `outerHTML` are off limits.
- Compare two renders by what they show. "The live update shows the same heading as the first render" survives a restyle; "the row's `outerHTML` equals the server's" does not.
- Check layout with geometry. A count of lines or a "contains this string" check passes however badly the layout breaks. A browser test can assert computed sizes and positions: one of ours checks that a button sits below its heading, fills the row and is at least 44px tall. For everything nobody thought to encode, we screenshot the staging site at desktop and phone widths in both languages and look at the pictures.

A pull request once passed review with zero severe findings while 10 of the 14 design differences listed in its ticket were still there, including a heading that rendered one character per line. Every test asserted strings, and they all passed.

## Why agents drift toward implementation tests

It's tempting to say AI agents like testing implementation. Our evidence points at the setup around the agent instead:

- **The tickets.** Some acceptance criteria described code ("only one render function"), and the agent read them literally (Rule 2).
- **Gaps in the repository rules.** Anything the instructions didn't rule out was fair game (Rule 1).
- **The cheapest red-to-green test pins the diff.** An agent closing a ticket needs a test that fails before its change and passes after. The cheapest one asserts that the new string, class name or function call now exists. A behavior test needs a fixture, a rendered page or a running script. This is our reading of the pattern, not something we measured.

None of this is specific to AI. Kent C. Dodds described the same failure for human-written React tests in [Testing Implementation Details](https://kentcdodds.com/blog/testing-implementation-details): tests that break when you refactor and stay green when the app breaks. Google's testing blog said it in 2013: [test behavior, not implementation](https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html). What agents change is volume and literalness: an agent writes every test a ticket implies, on every ticket written the same way.

It matters more when tests gate merges. Orbi merges a change once review and CI pass, with no human in the loop by default. An implementation test that goes red on a harmless rename blocks a merge and burns a review round. One that stays green while the page breaks lets the break through.

## What the audit found

The repository has three test suites. Counts are per test case, with parameterized cases expanded, at commit `4619a9fc`.

| Suite | Test cases | At least one implementation assertion | Share |
|---|---:|---:|---:|
| Main (Workers unit and integration tests) | 3,999 | 1,046 | 26% |
| Browser (rendered pages in a real browser) | 639 | 466 | 73% |
| Host scripts (provisioning, deploy, timers) | 449 | 227 | 51% |
| **Total** | **5,087** | **1,739** | **34%** |

A test that asserted a visible result and also an implementation detail counted as implementation, so these numbers include mixed tests. 244 of the 466 browser tests do check visible behavior and are counted only because they find the page's script by searching its text (the pattern above). Leaving those out, 1,495 tests (29%) still have at least one implementation assertion.

By kind, across the three suites: about 490 tests read source text, about 100 asserted internal call arguments or counts, 35 asserted SQL text, and the biggest group was internal shape, with 939 tests in the main suite alone. Two more examples, in the tests' own words:

- **A page "reloads" because its source contains `location.reload()`.** A test for a "refresh suggestions" button checked that the rendered HTML contained `fetch("/api/suggestions/rerun"`, `{ repo: repository }`, `const repository = "acme/demo";` and `location.reload()`. Renaming one local variable turns it red. Breaking the button in a way that leaves those strings in place keeps it green.
- **A price template may appear in only two files.** A test globbed every source file and asserted that the pattern for a hand-built price sentence matched only in the price builder. What users care about is that every page shows the same price, and a test can render those pages and compare them.

By git blame, about 87% of the test definition lines (the `it(...)` lines) were last touched by Orbi's delivery agent. In the main suite, lines it last touched were classified as implementation 27.5% of the time; lines last touched under my own account, which includes local agent sessions, 12.7%. That gap is not a clean human-versus-AI comparison: "my own account" is also mostly agent sessions, and the two sets of tickets differ. But it is consistent with the problem living mostly in code written while following tickets.

The rule landed on 18 November. Seven cleanup tickets for the existing tests, starting with the browser-script pattern and the hash snapshot, merged between 19 and 20 November. We'll rerun the same audit on new tests and report whether the rule holds.

## How to audit your own repository

The method is the part worth copying. Ours took about half an hour of wall time.

1. **Write down the six kinds above,** with your own exceptions: which boundaries count as outward-facing, which helpers are business rules.
2. **Split the test directories across independent, read-only agent sessions.** We ran three Codex sessions in parallel, one per suite. Read-only matters: the reviewer can't "fix" a test to make it fit a category.
3. **Have a script produce the counts.** Each reviewer keeps a ledger of `file:line → category` and produces totals by running a command that enumerates test registrations, expands `it.each`, checks each ledger entry points at a real test line, and sums. The command and its raw output go in the report. In an earlier task an agent asked to count a 20-row table answered 21; a count an agent reads off by eye isn't worth printing.
4. **Check the classification yourself.** I read five flagged tests. Four were clearly implementation. One was arguable: it checks there is one disconnect form per connected repository by counting the forms' `action` attributes, which is arguably counting the controls the user clicks. We also had a separate agent, given only the rubric, classify a random sample of 60 main-suite tests blind. It marked 3 as unsure and agreed with the audit on 46 of the other 57 (81%). Ten of the 11 disagreements went the same way: the blind reviewer called a test implementation where the audit had called it behavior. So the main-suite number is more likely low than high. The blind reviewer's own summary also miscounted its table, which is why step 3 exists.
5. **Read the breakdown by kind.** One repeated helper or one snapshot file can account for hundreds of tests, and that's one fix the total alone would hide.
6. **Change what produces new tests before cleaning up the old ones:** the instructions file and the ticket wording. Otherwise the agent writes them again next week.

This is a static classification. We didn't run mutation testing, the standard research tool for whether tests catch faults. Mutation testing asks "would this suite notice a bug"; we were asking "would this test go red when nothing a user sees has changed", and reading the assertion answers that directly.

## Making the suite faster (Cloudflare Workers and Vitest)

This part applies to one stack: Cloudflare Workers tested with Vitest and `@cloudflare/vitest-plugin`. The general lesson closes each item.

**Find the per-file cost.** CI on 18 November spent 4 minutes 26 seconds on `npm test`. Vitest's cumulative columns showed `setup 304.60s` against `tests 105.35s`: per-file setup outweighed the tests themselves. The pool gives each test file its own Workers runtime, so the setup file runs once per file, about 160 times. Ours applied database migrations with `applyD1Migrations` from `cloudflare:test`. Importing that module alone cost 1.78 seconds per file; running the 86 migrations without it took about 0.06 seconds. The function does four things (create the migrations table, read the applied names, skip those, run each migration and its ledger row in one batch), so we inlined them against `env.DB`:

```ts
import { env } from "cloudflare:workers";

const T = `"d1_migrations"`;
await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ${T} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);`).run();
const applied = new Set(
  (await env.DB.prepare(`SELECT name FROM ${T};`).all<{ name: string }>())
    .results.map((row) => row.name));
const record = env.DB.prepare(`INSERT INTO ${T} (name) VALUES (?);`);
for (const m of env.TEST_MIGRATIONS) {
  if (applied.has(m.name)) continue;
  await env.DB.batch([...m.queries.map((q) => env.DB.prepare(q)), record.bind(m.name)]);
}
```

General lesson: anything in a setup file is multiplied by the number of test files.

**Measure wall time; Vitest's cumulative columns mislead.** Locally (32 cores, coverage on, two workers) the change took the full run from 199 to 156 seconds, and cumulative setup from 214 to 8 seconds. In CI the result was smaller: the `npm test` step went from 4:26 to 3:41, and Vitest's own duration from 260 to 216 seconds, about 17%. Cumulative setup fell from 305 to 22 seconds, but the `import` column grew from 11 to 115 seconds and `tests` from 105 to 205. Those columns add up time across parallel workers, and part of the cost moved from one column to another. "Setup down 93%" would have been true and misleading. This setup change on its own is the 17% (4:26 to 3:41); the bigger drop, to 1:39, comes from the worker-count change below, so don't read the inlined migration code as the main lever.

**Delete tests that assert elapsed time.** The bigger win is parallelism: CI ran two workers on a 32-core machine because the setting was tuned for our 3-core delivery sandboxes. Locally, eight workers plus the setup fix took the suite to 69 seconds. But at eight workers one test failed twice in a row: `expected 2216 to be less than 2000`. It asserted that a checkout redirect returned in under two seconds, to prove the redirect didn't wait for an analytics write. The test already held that write behind a gate it opens only after the response arrives, so if the response waited for the write, the test would never get a response at all. The two-second assertion added nothing but flakiness under load. Anything that compares wall-clock time to a threshold will fail on a busy machine.

**Set parallelism per machine.** The config keeps two workers by default for the sandboxes, where a full run takes 33 to 54 minutes on three cores. CI sets `VITEST_MAX_WORKERS=8`. On the pull request that did this (with the elapsed-time assertion removed), the `npm test` step took 1:39, against 4:26 the day before.

## Related

[Searching for Orbi's harness, part 2](/blog/is-the-regression-guard-worth-its-tokens/) measures what review catches and misses on bugs it has never seen, and [AI code review bottleneck?](/blog/ai-code-review-bottleneck/) looks at where merged pull requests wait. [Orbi Cloud](/cloud/?ref=blog-ai-tests) runs the loop described here on your GitHub repositories (Issue → agent PR → separate agent review → merge on green CI), and the [comparisons](/compare/) set it next to other coding agents.
