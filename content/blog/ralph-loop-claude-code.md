---
title: Ralph loop's code passed 28 tests, then failed review
date: 2026-10-10
summary: A Ralph loop reruns one prompt. Mine wrote code that passed all 28 tests, including 13 it never saw, yet a separate review session found a spec violation.
lang: en
author: Lawrence Liu
image: /img/blog-ralph-loop-card.png
mirror: ralph-loop-claude-code
---

A Ralph loop, also called the Ralph Wiggum technique, runs a coding agent on the same prompt over and over. In its barest form it never stops on its own; most setups add a way for the agent to declare the work finished. Geoffrey Huntley [named it in July 2025](https://ghuntley.com/ralph/), and his smallest version is one line of bash (with today's Claude Code CLI you'd write `claude -p` where he wrote `claude-code`):

```bash
while :; do cat PROMPT.md | claude-code ; done
```

Each round starts a fresh session, so the only record of how far the last round got is the files it left in the repository. The agent does one more piece of work and exits, and the loop starts it again. Thoughtworks added the [Ralph loop to its Technology Radar](https://www.thoughtworks.com/en-us/radar/techniques/ralph-loop) in April 2026, in the Assess ring: worth exploring to understand its impact, one step short of Trial.

Huntley pitches it for bootstrapping greenfield projects "with the expectation you'll get 90% done". He says he would never use it on an existing codebase, warns that you'll "wake up to a broken codebase that doesn't compile from time to time", and advises asking for one thing per loop.

I'm Lawrence Liu, and I built Orbi. Orbi takes a GitHub Issue, has a coding agent write the change, puts it through a separate review session and merges it, usually with nobody at the keyboard. Orbi's runner, the program that moves each Issue through those steps, is a loop too, so I wanted to see where a plain Ralph loop stops. On 10 October I ran one with Claude Code on a small Python library. After four rounds every test passed and the agent wrote DONE. A separate review session, costing 11 cents, then found a spec violation and said not to merge.

## Anthropic's ralph-loop plugin has no round limit by default

Anthropic publishes the idea as a Claude Code plugin, [ralph-loop](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop) (it was called ralph-wiggum earlier). There is no outer bash loop. A Stop hook catches Claude's attempt to end the session and feeds the same prompt back in, so the whole loop runs inside one session and context carries over between rounds:

```text
/ralph-loop "<prompt>" --max-iterations 20 --completion-promise "DONE"
```

If you run it unattended:

- Without flags it never stops. The script that starts the loop, `setup-ralph-loop.sh`, defaults `--max-iterations` to 0, meaning unlimited, and warns that without a cap or a completion promise the loop runs forever. To end one early, the plugin ships a `/cancel-ralph` command. The README says to always set `--max-iterations`.
- Completion is self-reported. Apart from the iteration cap and `/cancel-ralph`, the loop ends only when Claude writes the promise you set, here `<promise>DONE</promise>`, and the reminder injected every round literally says "do not lie to exit!".

Claude Code also has a built-in [`/goal`](https://code.claude.com/docs/en/goal) command, where a separate model checks the condition after every turn, so that "completion is decided by a fresh model rather than the one doing the work".

## Running a Ralph loop with Claude Code on a small library

I didn't use the plugin. I used Huntley's outer-loop shape so each round would be a fresh process I could measure.

The task was a tiny library called textkit: `slugify`, `truncate`, `wrap` and a small CLI. The spec is four numbered points; the one that matters later reads "ASCII-fold accented letters (é → e); runs of anything that is not a-z or 0-9 become a single `-`". I wrote 15 tests against the spec and left the package empty, so every test failed. This is the whole `PROMPT.md`:

```text
Study spec.md and fix_plan.md. Pick the single most important unfinished item,
implement it, and run `python -m pytest -q`.
Update fix_plan.md (create it if missing) with what is done and what is left,
then commit with git.
Only when every test passes and fix_plan.md lists nothing left, write the word
DONE into a file named STATUS.
```

I capped the loop at 10 rounds and ran Claude Code 2.1.281 headless with Claude Opus 5.5, logged in with a subscription. `--setting-sources ""` keeps my own CLAUDE.md, hooks and plugins out of the run and `--strict-mcp-config` keeps out MCP servers, so it behaves more like a clean machine. `dontAsk` refuses any tool call not on the allowlist instead of waiting for a person. The loop below clears any old DONE first, stops on a failed round and prints every denied call. It uses the same `claude` flags as my run and, like my run, keeps each round's JSON outside the repository. Save it as a script; it needs `jq`.

I tested it with a fake `claude` on the `PATH`: a non-zero exit, `is_error` true, empty output and ten rounds without DONE each end the script with status 1.

```bash
#!/usr/bin/env bash
# Run inside the task repository. Round logs go one level up, outside the repo.
rm -f STATUS
for i in $(seq 1 10); do
  log="../round-$i.json"
  claude -p "$(cat PROMPT.md)" --setting-sources "" --strict-mcp-config --no-session-persistence \
    --permission-mode dontAsk \
    --allowedTools "Read,Edit,Write,Glob,Grep,Bash(python -m pytest *),Bash(python3 -m pytest *),Bash(git *)" \
    --output-format json > "$log"
  status=$?
  if [ "$status" -ne 0 ] || [ "$(jq -r '.is_error' "$log")" != false ]; then
    echo "round $i failed (exit $status)" >&2; exit 1
  fi
  jq -r '.permission_denials[]? | "\(.tool_name) \(.tool_input.command // .tool_input.file_path // "")"' "$log" | sed "s/^/round $i denied: /" >&2
  [ "$(cat STATUS 2>/dev/null)" = DONE ] && break
done
[ "$(cat STATUS 2>/dev/null)" = DONE ] || { echo "no DONE after 10 rounds" >&2; exit 1; }
```

After each round I counted passing tests and read the JSON. On a subscription nothing is billed per run; the cost column is Claude Code's own estimate at API prices, and so is every dollar figure below.

| Round | Seconds | Agent turns (`num_turns`) | Estimated cost | Denied calls | Tests passing |
|---|---|---|---|---|---|
| 1 | 28 | 8 | $0.18 | 0 | 4 / 15 |
| 2 | 40 | 9 | $0.19 | 1 | 8 / 15 |
| 3 | 28 | 9 | $0.18 | 1 | 12 / 15 |
| 4 | 27 | 9 | $0.17 | 1 | 15 / 15, wrote DONE |

The four rounds took about two minutes and 72 cents, each doing exactly one spec item and making one commit, which is what "one thing per loop" asks for. Two of the three denied calls were Claude trying to edit `fix_plan.md` with a `python - <<EOF` heredoc, which wasn't on the allowlist; it switched to the Edit tool. The third, in round 4, was a test run chained to a manual check of the CLI, `python -m textkit wrap 0 x`. Claude wrote in its summary that it had tried to check the bad-width case by hand and the command was blocked, then wrote DONE anyway. That round exited 0 with `is_error` false, which is why an unattended loop has to read `permission_denials` from the JSON too. I covered that in [the post on Claude Code headless mode](/blog/run-claude-code-unattended/).

I then wrote 13 more tests from the spec that the loop never saw, such as `slugify("Ça va, l'été 2026")`, custom ellipses, result lengths for every width from 1 to 19, tabs and an empty CLI call. All 13 passed, so by every test I had, the loop was finished.

## A separate review found a spec violation

Next I gave the diff and the spec to a fresh `claude -p` session. It ran the same model under `dontAsk` with no allowlist, told in the prompt not to use tools, and with none of the writing session's history; independent here means a clean context, not a different model. This was the review prompt, followed by the spec and the diff:

```text
You are reviewing a change you did not write. Do not use any tools; answer
from the text below. List every place where the code does not meet the spec,
or is wrong for an input the spec covers. For each: the input, expected,
actual. Last line: MERGE or DO NOT MERGE.
```

It cost $0.11 and came back with DO NOT MERGE, and the finding was real: the loop's `slugify` folds accents with `encode("ascii", "ignore")`, and that call silently deletes every character it can't fold, before the regex that should turn it into `-` ever sees it:

```text
slugify("foo—bar")  -> 'foobar'   (spec: 'foo-bar')
slugify("a€b")      -> 'ab'       (spec: 'a-b')
```

None of the 28 tests used an em dash or a currency sign.

I sent the findings back as one more round's prompt. That round cost $0.26, fixed `slugify` and added six tests for the inputs the review listed, taking the repository from 15 tests to 21, and wrote DONE again; my 13 held-out tests still passed. A second review ($0.15) said MERGE and listed eight places where the spec can be read two ways, for example whether a superscript like the `²` in `x²` counts as a digit, which only the spec's owner can settle.

The whole run, loop plus two reviews plus the fix, came to about $1.24.

## What the top Ralph loop guides leave out

Huntley scopes the technique to greenfield work. Leaving merging and tagging to the loop is fine for a throwaway repository nobody uses yet; it stops being fine once someone depends on the result, and the guides that rank for it don't say what changes then. On 10 October I opened the top pages a web search returned for "ralph loop" and "ralph wiggum loop"; 13 of the 14 loaded. Three suggest looking over the result when you come back, and three mention having the loop open a pull request instead of committing to `main`, but only as an option. Apart from Huntley, who hands merging and tagging to the loop itself, none says who merges, and none puts a human gate before a release. Huntley's own prompt tells the loop to commit, push, and create a git tag "as soon as there are no build or test errors", and his later post, [everything is a ralph loop](https://ghuntley.com/loop/), describes a loop that fixed a bug, "deployed it automatically" and verified it worked.

On a repository other people depend on, three questions are left open:

1. Who reviews? In my run, the session that wrote the code wrote DONE. A session reading only the spec and the diff said DO NOT MERGE. `/goal` at least hands the done-or-not call to another model, though it doesn't review the diff against a spec.
2. Who merges and releases? With Huntley's prompt the loop pushes and tags on its own; with the plugin, nothing in the loop decides it, so it falls to whoever is around. Neither `/goal` nor the plugin touches merging.
3. When should the loop stop and ask? Some failures aren't in the change at all, say `main` is already red. A loop that retries until tests pass can't tell those from failures it caused.

## What a bounded loop looks like in production

Orbi's runner drives Pi, an open-source coding agent, rather than Claude Code; what matters here is the runner around it. The runner is a loop with fixed exits. A coding session writes the change and commits; it doesn't push or merge. A review session then checks the change at a pinned commit (the "frozen head"), fixes what it can in place, and gives a verdict on the commit it ends on. Nothing re-reviews the reviewer's own fixes; they are covered only by CI and the merge gate. A merge gate then checks that the verdict still matches the PR's head, that the head contains the latest `main`, that CI is green and that GitHub says the PR is mergeable. Review gets at most five rounds.

When the same failure comes back three times in a row, or the merge gate finds that a failing check is already red on `main`, the runner labels the Issue `ai-blocked` with the reason and stops. CI triage, a workflow in the repository, fires the moment CI fails on the PR and sends the Issue back based only on the failure's fingerprint (which workflow and job failed on which branch), without comparing anything to `main`. The merge gate, which compares failures with `main`, runs only at the end of a review round.

[orbi#1554](https://github.com/orbi-build/orbi/issues/1554) went through that path, and not perfectly. Orbi claimed it at 03:31 on 5 October (UTC+8). CI failed twice in a row with the same fingerprint, below the repeat-failure guard, and each time the repository's CI triage workflow sent the Issue back with `ai-fix-needed`, Orbi's label for "run another round on the same PR". So for two rounds the loop treated the failure as its own. At 04:22 the merge gate compared the failing checks against `main` and found a failing macOS compatibility check already red on `main` itself. With that check failing on the base branch, no change within this Issue's scope would turn CI green, so Orbi stopped:

<figure>
<img src="/img/ralph-1554-blocked.webp" alt="Orbi's comment on Issue #1554: blocked, waiting on a human decision, because the delivery gate (the merge gate's name in the comment) found main already red on the macos-compatibility check">
<figcaption>After two rounds, the merge gate found a failing check that was already red on main and stopped.</figcaption>
</figure>

Later that day, after main was fixed ([orbi#1552](https://github.com/orbi-build/orbi/issues/1552) was one of the fixes), I moved the Issue back to `ai-fix-needed` at 13:39. It merged at 13:58 after one review round with no findings. A plain Ralph loop like mine runs only local tests, so it would never have seen that CI failure: it would have written DONE once pytest passed. Even wired to CI, nothing in it compares a failure against `main`, so nothing would tell it the failure wasn't its own.

For scale: leaving out release tickets, I took the 40 most recent Issues Orbi merged in its own repository before 06:00 on 10 October (UTC+8), closed from 28 September on. 36 went through without being sent back or blocked (problems the review fixed in place don't count as sent back). The other four all stopped at `ai-blocked` at some point; two of them, #1554 among them, had also been sent back for fixes. None was sent back without also being blocked. Issues that were blocked and never merged aren't in that count.

## When to use a Ralph loop

Use it when the task is new code, the spec is short and testable, and you'll read the result before anyone depends on it. textkit met all three conditions, with a four-point spec and 15 tests from the start, and tests alone still let a bug through, so add an independent review on top of the tests, by a person or a separate session.

If you run one unattended:

- Cap the rounds, with `--max-iterations` on the plugin or a counter in your own loop.
- Read the exit code, `is_error` and `permission_denials` after every round.
- Give the review to a session with a clean context, and send its findings back as the next round's prompt.
- Don't give the loop push rights to `main`. Protect the branch, require checks and a review before merge, and make the loop stop and ask when a failure also shows up on `main`.

Orbi's runner keeps writing, review and merging apart: the review runs in its own session against the Issue and the diff and fixes what it can in place (those fixes are covered by CI and the merge gate, not by another review), the runner rather than the agent merges, and releases ship through a separate release Issue that only a person can label `ai-release`, so a human decides when a milestone ships. [Pi](https://github.com/earendil-works/pi) and the [runner are open source](https://github.com/orbi-build/orbi), and you can [connect a repository to Orbi Cloud](https://orbi.build/cloud/?ref=blog-ralph) to try it on your own Issues.

## Related

Read [Claude Code headless mode exits 0 despite denials](/blog/run-claude-code-unattended/), [Claude Code in Actions: who presses merge?](/blog/claude-code-github-actions-who-merges/), [Orbi vs Claude Code](/compare/claude-code/) and [Cloud](/cloud/).
