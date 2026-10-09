---
title: Claude Code headless mode exits 0 despite denials
date: 2026-10-01
summary: In Claude Code headless mode, a claude -p run with denied tool calls still exits 0. Use --output-format json and check permission_denials to catch it.
lang: en
author: Lawrence Liu
image: /img/blog-headless-card.png
mirror: run-claude-code-unattended
---

In Claude Code headless mode, `claude -p` runs one prompt without the interactive UI, prints the result and exits ([docs](https://code.claude.com/docs/en/headless)). It exits non-zero when Claude itself fails, but a denied tool call doesn't count as a failure, so a run with a denied call still exits 0. With no one to answer prompts, a headless run denies anything that needs approval, so decide up front what it may do. The simplest setup is the `auto` permission mode:

```bash
claude -p "Fix the failing test in tests/test_auth.py" \
  --permission-mode auto --permission-prompts none
```

That command checks nothing on its own. Before it goes into cron, whatever mode you use, check `permission_denials`; the full script is below.

`--permission-prompts none` is optional. In cron or CI nobody can answer a prompt anyway; what the flag adds is that Claude stops retrying denied actions and drops tools that need a person to answer, such as AskUserQuestion. It needs Claude Code v2.1.259 or later, so drop it on older versions.

`auto` isn't always available either. If the model doesn't support it, or a settings file or Anthropic turns it off, the session starts in Manual mode (`--permission-mode default`), and any write you didn't pre-approve is denied. So for a nightly job I use `dontAsk` with an allowlist, which doesn't depend on `auto` at all; the check script below is set up that way. In a headless run `dontAsk` allows the same things as `default` with the same allowlist. The difference is that the [docs](https://code.claude.com/docs/en/permission-modes) make it the locked-down mode for CI: it denies even explicit `ask` rules and AskUserQuestion, and the session never waits for input.

I'm Lawrence Liu, the creator of Orbi, which takes GitHub Issues through to merged, released changes. Orbi's agent is Pi, an open-source coding agent, not Claude Code, but the second half of this post applies to a Claude Code loop just as much.

## Claude Code headless mode flags for cron and CI

- `--allowedTools` pre-approves specific tools, and `--permission-mode` sets a baseline for everything else.
- `--output-format json` gives a script the result, the session ID and the cost; `stream-json` (which also needs `--verbose`) prints events as they happen instead.
- `--resume <session_id>` continues an earlier run, with the ID taken from that run's JSON; `--continue` picks up the most recent one.
- `--max-budget-usd` stops the run once its spend reaches the amount you give it. The spend is Claude Code's own estimate, not your bill, and a run can pass the cap, so leave headroom.
- `--dangerously-skip-permissions` skips the routine permission prompts and checks. A few protections still apply, and in a headless run anything that still needs a person is denied. Anthropic says to use it only inside a container or VM, as a non-root user. On a machine you care about, `auto` or `dontAsk` (which denies anything that would ask for approval) with an allowlist is the safer choice.
- `--bare` skips hooks, plugins, MCP servers and CLAUDE.md from the machine and the repository. Without it, a headless run in a repository you've never trusted still runs that repository's hooks, and no trust dialog appears. `--bare` also ignores your Pro or Max login, so it needs an API key (see "Headless authentication" below).

### What a headless run returns, and what to check

(Updated 9 October.) Eight days after this post went up, I ran three headless sessions with Claude Code 2.1.281, logged in with a Claude subscription, to see what a script actually gets back.

The first session read a one-line file and replied with its first word: `claude -p "Read note.txt and reply with its first word only." --allowedTools "Read" --output-format json`. It exited 0 with `"subtype": "success"`, `"is_error": false` and the answer in `result`, after two turns (`num_turns: 2`: one to read the file, one to answer). It reported `total_cost_usd` of 0.49. On a subscription no bill corresponds to that number, but those tokens count against your usage limits: without `--bare` the run loaded my whole `~/.claude` setup, CLAUDE.md, skills and plugins included, and `usage.cache_creation_input_tokens` was 59,671 to answer one word. I had no API key to run the same task under `--bare`, so I can't tell you how much it saves.

The second session ran `claude --bare -p "say hi" --output-format json` with no `ANTHROPIC_API_KEY`. `--bare` doesn't read a subscription login, so this run was meant to fail, and I wanted to see what failure looks like. It exited 1, and the JSON still said `"subtype": "success"`. The failure showed only in `"is_error": true` and in `result`, which read `Not logged in · Please run /login`.

The third session asked for a file to be written under `--permission-mode default`, where nothing approves writes in a headless run. Nothing was written. The run exited 0, with `"subtype": "success"` and `"is_error": false`. The only sign was `permission_denials`, which listed the two tool calls that were refused: a Bash redirect and the Write tool. I hadn't pre-approved any write, which is exactly the position a nightly job is in when `auto` isn't available and the session starts in Manual mode (`default`) as described above. That job can exit 0 night after night with nothing done.

So a script has to check three things: the exit code, `is_error`, and whether `permission_denials` is empty. I haven't seen a run exit 0 with `is_error` true, so that check is a cheap second line. Put this in a bash script rather than typing it into a terminal, because `exit 1` would close your shell. It needs `jq`:

```bash
out=$(claude -p "Run the test suite and fix what fails" \
  --permission-mode dontAsk --allowedTools "Read,Edit,Bash(npm test *)" \
  --output-format json)
status=$?
if [ "$status" -ne 0 ]; then
  echo "claude exited with $status" >&2
  jq -r '.result // empty' <<<"$out" >&2
  exit 1
fi
if [ "$(jq -r '.is_error' <<<"$out")" != "false" ]; then
  echo "claude reported an error, or its output was empty or not JSON" >&2
  jq -r '.result' <<<"$out" >&2
  exit 1
fi
denied=$(jq '.permission_denials | if type == "array" then length else error("no permission_denials") end' <<<"$out") || exit 1
if [ "$denied" -ne 0 ]; then
  echo "$denied tool calls were denied:" >&2
  jq -r '.permission_denials[].tool_name' <<<"$out" >&2
  exit 1
fi
```

`dontAsk` denies anything that would otherwise ask for approval, while reads and the tools you list still run. `Bash(npm test *)` allows `npm test` with or without arguments, and read-only commands such as `ls`, `cat` and `grep` usually need no allowlist entry, though explicit deny rules still apply.

Because `Edit` is allowed, Claude can change what `npm test` runs. The allowlist guards against mistakes; it isn't a sandbox, so run the job as a dedicated user (see below). Any other Bash command that needs approval is denied and fails the script, so run the job once by hand, read `permission_denials`, and add the commands you're happy to allow. Every failure path, including empty or non-JSON output, exits 1; I tried each one against a fake `claude` script on the `PATH`.

### Headless authentication: API key or subscription token

`--bare` ignores your Pro or Max login. Against the Anthropic API it needs `ANTHROPIC_API_KEY`, or an `apiKeyHelper` passed in with `--settings`; cloud providers such as Bedrock keep their own credentials.

To use a subscription in CI, run `claude setup-token`, set the token it prints as `CLAUDE_CODE_OAUTH_TOKEN`, and leave `--bare` off. The token lasts a year. An `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `apiKeyHelper` takes priority over it, whether it's set on the machine or in the repository's settings, so check which credential a run actually used.

The [authentication docs](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token) cover both. To keep the repository's own settings and `.mcp.json` out of a run that can't use `--bare`, add `--setting-sources user`, and `--settings '{"disableAllHooks":true}'` turns hooks off for one run. Anthropic also says `--bare` will become the default for `-p` in a future release, so a token-based setup may need changing then.

### A minimal cron job

cron runs with a short `PATH` and none of your shell setup, so spell out the directory, the binary and the credentials. Put the token in a file only the user running the job can read (`chmod 600`), and `export` it, or Claude won't see it:

```bash
# ~/.claude-nightly.env
export CLAUDE_CODE_OAUTH_TOKEN="..."
export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"
```

The commands Claude runs during the job, such as your test runner, get their `PATH` from this file too, so add the directories your tools live in.

Save the check script from "What a headless run returns" above as `$HOME/bin/claude-nightly.sh`, with `#!/usr/bin/env bash` as its first line, and `chmod +x` it. It exits 1 when anything was denied. Then, in that user's crontab, with your own repository path:

```bash
# crontab -e: every night at 03:00
0 3 * * * cd /srv/myrepo && . "$HOME/.claude-nightly.env" && "$HOME/bin/claude-nightly.sh" >> "$HOME/claude-nightly.log" 2>&1
```

The script finds `claude` through the `PATH` set in the env file, so make sure the env file's `PATH` includes the directory `which claude` prints. The log gets a line explaining each failed run; a failure before the script starts, such as a bad `cd`, won't show up in it. Look in cron's mail or the system log for those. Whatever mode you use, don't drop the `permission_denials` check. If you switch to `auto` and it isn't available, the session starts in Manual mode, a denied write still exits 0, and only that check marks the run as failed.

If one scheduled job like that is all you need, you're done.

## Six things a headless loop doesn't answer

Orbi has been delivering its own Issues since late August. In the normal flow nobody writes, reviews or merges the code by hand; a person adds labels, makes the calls Orbi can't (including the two reverts below), and looks at pages before production. When this post went up on 1 October, 599 Issues in [its repository](https://github.com/orbi-build/orbi) carried the `ai-merged` label, and v0.5.58 went out on September 30. If you want Issues to reach a merge and a release, a bare loop around `claude -p` leaves most of the following to you. Two of them, the merge check and the isolation hardening, I got wrong first. A runner, below, is the loop process around the agent: it picks an Issue, starts a session and collects the result.

### Which task, and only once

In Orbi a person adds the `ai-ready` label to an Issue. A runner takes a lock, then picks the next Issue by priority, urgent first and then bugs; the lock means two runners never pick the same one. It adds `ai-in-progress`, which later scans skip, and creates a worktree from a pinned base commit. Each step is posted back to the Issue as a comment, so the Issue list doubles as the queue and each timeline as the log.

If you run several `claude -p` jobs from cron, the minimum is one `flock` lock shared by every job on the machine: pick an Issue that has `ai-ready` and neither `ai-in-progress` nor `ai-blocked`, and label it `ai-in-progress` while holding the lock, then release it and start Claude.

### Which system user it runs as

With nobody approving commands, a dedicated operating system user adds isolation: permission rules limit which tools Claude may call, and a separate user limits which files and credentials those tools can reach. In Orbi Cloud each connected repository runs as its own Unix user. On September 25, after reading about GitSpawn, a way to make coding agents run programs through a repository's git config, I over-corrected: I filed an Issue, Orbi wrote and merged 1,164 lines of hardening that guarded only the runner's own git calls, and I reverted it less than four hours later. The agent already ran as that user and could run the same git commands itself, so guarding the runner's calls protected nothing. If you run `claude -p` from cron, give it a dedicated user that holds only that repository's credentials. The full story is in [GitSpawn and the agent that never asks](/blog/gitspawn-unattended-agent/).

### Who reviews it

Orbi starts a second session that reads the exact base and head commits against the Issue's acceptance criteria. It fixes what it finds, reruns the full test suite and posts a verdict on the Issue, next to the test count. The session that wrote the change doesn't review it. What the reviewer changes itself is covered only by the tests and CI; no third session reviews it.

With `claude -p`, the minimum is a fresh session that gets only the diff and the acceptance criteria and returns a verdict.

### When it may merge

Right before merging, Orbi checks that the verdict names the current PR head, that the head contains the latest base branch, that CI on it has passed, that GitHub reports the PR as mergeable, and that the Issue isn't labelled `ai-blocked`. That last check was added on September 30. If CI is still running, it waits for the next pass. The [auto-merge guide](/guides/auto-merge-ai-prs/) goes through the first four.

At 16:47 UTC on September 29 I labelled an Issue `ai-blocked` and commented that its PR must not be merged. Seventy-one seconds later the runner merged it. The gate re-read the base, the head and CI, but never the Issue's labels, so a label added during review changed nothing. About eight hours later I filed [#1504](https://github.com/orbi-build/orbi/issues/1504) and reverted the merge:

![Issue #1504 on GitHub: the timeline of a merge that happened 71 seconds after a maintainer labelled the Issue ai-blocked, and the cause, merge_gate never re-reading the Issue's labels](/img/headless-1504-bug.webp)

Orbi claimed it a minute after I filed it, opened [PR #1505](https://github.com/orbi-build/orbi/pull/1505), passed the independent review with no findings and merged 45 minutes after the claim. The gate now reads the labels one last time, and an `ai-blocked` Issue stops the merge.

![The end of the #1504 timeline: Orbi opened PR #1505, merged it after one review round, and swapped ai-pr-opened for ai-merged](/img/headless-1504-merged.webp)

If your loop ends in `gh pr merge`, it has the same hole. A few lines in front of it narrow it for an immediate merge, though not to zero: a label added between the read and the merge still gets through. Save them as a bash script and run that; pasted into an interactive terminal, the `:` line reports the error but doesn't exit, and the lines after it still run:

```bash
#!/usr/bin/env bash
: "${ISSUE:?}" "${PR:?}" "${REVIEWED_SHA:?missing the SHA the review approved}"
labels=$(gh issue view "$ISSUE" --json labels -q '.labels[].name') || exit 1
grep -qx ai-blocked <<<"$labels" && { echo "blocked: $ISSUE"; exit 3; }
gh pr merge "$PR" --squash --match-head-commit "$REVIEWED_SHA"
```

The `:` line stops if the Issue, the PR or the reviewed SHA is missing. The `labels=` line exits if the labels can't be read, so a failed lookup never becomes a merge. A blocked Issue makes the script exit 3, so your loop doesn't count it as a success, and `--match-head-commit` merges only the commit that was reviewed.

A merge queue is the exception. There, `gh pr merge` enables auto-merge if required checks haven't passed, and adds the PR to the queue if they have, and this script never sees a blocking label added after that.

### What happens when it fails

If Orbi can recover, the Issue moves to `ai-fix-needed` and the next pass continues on the same branch and the same PR. If a person has to decide, it swaps `ai-in-progress` for `ai-blocked` and leaves a comment saying what happened.

On September 28 the first run on [#1482](https://github.com/orbi-build/orbi/issues/1482) ended in under three minutes with no commit at all, and Orbi labelled it `ai-blocked`:

![Issue #1482: Orbi started Pi, then posted "Orbi blocked — waiting on a human decision": the agent delivered no commit and HEAD is still the frozen base](/img/headless-1482-blocked.webp)

The comment said there was no commit, not why. I judged the Issue itself was fine and removed `ai-blocked`. `ai-ready` was still on it, so the runner picked it up again on its next pass, and the second run opened [PR #1491](https://github.com/orbi-build/orbi/pull/1491), merged the same day.

When your own loop fails, post the JSON's `result` and `permission_denials` back to the Issue at least, so whoever looks next doesn't have to dig through logs.

### Who ships it

In Orbi a release is an Issue too, labelled `ai-release`, naming the version and the milestone. Orbi waits until everything else in that milestone is closed, then tags the release once CI passes on the release commit. If you build your own, the minimum is a release ticket too: tag once the milestone is empty and CI is green. This is the one for v0.5.58, which shipped the #1504 fix:

![Issue #1508, Release v0.5.58: the scope is milestone v0.5.58, the Release block names version, base branch and version file, and Orbi claimed it with ai-in-progress](/img/headless-1508-release.webp)

## The step I still do by hand

A loop that runs clean can still ship a broken page. On September 25, Orbi merged [a mobile table fix](https://github.com/orbi-build/orbi-website/pull/523) for this website. Its overflow tests all passed. Then a 390px screenshot showed words split mid-word, so I measured all 34 table pages at 390px: no horizontal overflow anywhere, but 193 split words or numbers on 25 of them. Here is the effect, reproduced on the current page (October 2026) by putting PR #523's CSS back:

![The Orbi vs Devin capability table at 390px with PR #523's CSS put back: "Task entry" breaks into "Tas", "k", "ent", "ry"](/img/headless-table-before.webp)

I filed the measurements as [#526](https://github.com/orbi-build/orbi-website/issues/526), and Orbi merged the fix 53 minutes after picking it up. The same table on orbi.build now (October 2026):

![The same table on orbi.build in October 2026 at 390px: the row is a stacked block and every word reads whole](/img/headless-table-after.webp)

PR #523's tests did what its Issue asked, and that Issue never mentioned words. So before anything is promoted from beta to production, I open the changed pages on a phone and a desktop and look.

## If you'd rather not build it

All of this can be built around `claude -p`. Orbi's [workflow doc](https://github.com/orbi-build/orbi/blob/main/docs/workflow.mdx), which describes how its version works, runs to about 800 lines.

You can also use Orbi: Orbi Cloud runs [Pi](https://github.com/earendil-works/pi) on DeepSeek by default, and Orbi's own repository has run on DeepSeek since September 22. You can bring your own key instead, and Anthropic is on the provider list through its OpenAI-compatible endpoint. Anthropic positions that endpoint for testing, and it doesn't support prompt caching, so expect a higher token bill than the same model with caching. If you switch to Orbi, you give up Claude Code itself and the use of your Claude Pro or Max quota. [Orbi vs Claude Code](/compare/claude-code/) compares where each one stops. To get reviewed releases from your Issues without running the machinery yourself, [connect a repository to Orbi Cloud](https://orbi.build/cloud/?ref=blog-headless) or self-host the [open-source runner](https://github.com/orbi-build/orbi).

## Related

Read [Orbi vs Claude Code](/compare/claude-code/), [Claude Code in Actions: who presses merge?](/blog/claude-code-github-actions-who-merges/) and [Cloud](/cloud/).
