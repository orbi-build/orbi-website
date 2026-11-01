---
title: Pi coding agent vs Claude Code: same model, measured
date: 2026-11-01
summary: Same model, two small tasks, all permitted runs passed. Default Claude Code used about 7 to 8 times Pi's input tokens; with --bare it landed in Pi's range.
lang: en
author: Lawrence Liu
image: /img/blog-pi-vs-claude-code-card.png
series: pi
---

I ran the Pi coding agent vs Claude Code on the same model, DeepSeek V4.1 Flash, and the same two small coding tasks. With execution permissions opened for the coding comparison, both passed every run; default Claude Code sent 7–8× Pi's input tokens per run. With `claude -p --bare`, it landed in the same range as Pi, with some runs above and some below. Most of default Claude Code's extra input came from its 21 tool definitions. For scripts with an API key, that flag matters more than the choice of harness.

I'm Lawrence Liu, the creator of Orbi. I measured this on my Linux machine on 1 November 2026, with Pi 1.2.0 and Claude Code 2.1.281. Orbi runs its implementer and reviewer sessions as `pi --print`.

## Pi coding agent vs Claude Code: the setup

Both used DeepSeek V4.1 Flash (`deepseek-flash`). Pi used its built-in `deepseek` provider, `--provider deepseek --model deepseek-flash`, and `DEEPSEEK_API_KEY`. Claude Code used `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`, `ANTHROPIC_AUTH_TOKEN=<deepseek key>` and `ANTHROPIC_MODEL=deepseek-flash`, following [DeepSeek's endpoint documentation](https://api-docs.deepseek.com/guides/anthropic_api).

[Anthropic says](https://code.claude.com/docs/en/llm-gateway) it "doesn't support routing Claude Code to non-Claude models through any gateway". I used this only as a measuring instrument; I do not recommend that routing setup. Pi used the OpenAI-compatible API and Claude Code the Anthropic-compatible API: same model and tokenizer, different wire formats.

Each run had `HOME` set to an empty directory and a minimal environment (`env -i`). The no-op runs used an empty directory; each coding run used a fresh git repository holding only that task's two files. All of them sat under `/var/tmp`, with no AGENTS.md or CLAUDE.md in any parent directory. So the numbers are each tool's out-of-the-box overhead with nothing of mine loaded. Pi puts the working directory path into its prompt, so the count moves by a few tokens with the path length (1,634 instead of 1,641 from a shorter path). I checked every rerun's session transcript; none contained a path from my real home directory.

Input totals include cache reads and writes. For Pi, I summed `usage.input + cacheRead + cacheWrite` over assistant messages. For Claude Code, I summed every request, subagents included, and cross-checked against `modelUsage` in the JSON output.

## Pi vs Claude Code token usage: a prompt needing no tools

The prompt was `Reply with exactly OK`. Each run made a single model request. I ran each setup 3 times with identical input counts.

| Setup | Input tokens per request |
|---|---|
| Pi default: read, bash, edit, write | 1,641 |
| Pi `--no-tools` | 466 |
| Claude Code default: 21 tools | 17,398 |
| Claude Code `--tools=Bash,Read,Edit,Write` | 3,316 |
| Claude Code same 4 tools + `--system-prompt="You are a coding assistant."` | 2,072 |
| Claude Code `--bare`: Bash, Edit, Read | 1,265 |

For this single-request prompt, default Claude Code used about 10.6× Pi's input. Restricting it to Pi's four tools brought it to 3,316, about 2× Pi's: removing the other 17 tools cut about 14,000 of the default's 17,398 input tokens. Replacing the system prompt removed about 1,240 more. `--bare` used 1,265, below Pi's default of 1,641; Pi with no tools at all used 466.

These 21 default tools were listed by the init event in the clean environment, with the same list in 2 checks: Task, Bash, CronCreate, CronDelete, CronList, DesignSync, Edit, EnterWorktree, ExitWorktree, ListAgents, NotebookEdit, Read, ReportFindings, ScheduleWakeup, SendMessage, Skill, TaskStop, WebFetch, WebSearch, Workflow, Write. The init event lists the subagent tool as `Task`; in the tool definitions the model receives, the same tool is named `Agent`, which is also what the docs call it.

The [headless docs](https://code.claude.com/docs/en/headless) recommend `--bare` for scripted and SDK calls and say it will become the default for `-p` in a future release. It skips auto-discovery of hooks, skills, plugins, MCP servers, auto memory and CLAUDE.md. It supplies Bash, file read and file edit tools, and requires `ANTHROPIC_API_KEY` or `apiKeyHelper`, ignoring OAuth/subscription login. For bare measurements I set `ANTHROPIC_API_KEY` to the DeepSeek key.

As a separate check, Claude Haiku 4.5 through my subscription (`--model haiku`, the same clean HOME with only the login copied in) used 20,787 and 20,660 input tokens for the same no-op in 2 runs. The tokenizer differs, so those counts are not directly comparable. Default overhead also appeared on Claude's own model. I could not test Pi on Claude: I had no Anthropic API key or OpenRouter credit.

## Pi vs Claude Code benchmark: small coding tasks

Task A was a bug fix in `duration.py`: `format_duration` swapped minutes and seconds, causing tests in `test_duration.py` to fail. My prompt was:

> The tests in test_duration.py fail. Fix the bug in duration.py so that python3 -m unittest passes. Do not edit the tests.

Task B implemented `top_words(text, n)` in `words.py`, replacing `NotImplementedError`. Its tests covered case, punctuation, alphabetical tie-break, apostrophes, n > vocabulary and empty input. The prompt was:

> Implement top_words in words.py so that python3 -m unittest passes. Do not edit the tests.

I ran each setup 3 times per task on `deepseek-flash`. Task A and task B each ran in its own fresh git repository containing only that task's two files. Afterwards, I ran `python3 -m unittest` myself and checked the test-file `git diff`. The tests were never edited. Every Claude Code coding run in this comparison, including bare runs, used `--dangerously-skip-permissions`. In this table, "default" means the default tools and regular startup, with execution permissions opened for comparability with Pi.

| Run set | Successful runs | Model requests per run | Input tokens per run | Wall time per run |
|---|---|---|---|---|
| Pi, task A | 3/3 | 4, 5, 4 | 9,081 / 11,788 / 8,962 | 3.8 / 5.2 / 4.3 s |
| Claude Code default, task A | 3/3 | 4, 5, 4 | 72,382 / 92,756 / 72,622 | 6.0 / 8.3 / 6.1 s |
| Claude Code `--bare`, task A | 3/3 | 5, 5, 4 | 10,475 / 10,799 / 8,127 | 6.3 / 5.7 / 4.7 s |
| Pi, task B | 3/3 | 5, 5, 5 | 12,650 / 11,834 / 11,894 | 6.2 / 5.6 / 6.5 s |
| Claude Code default, task B | 3/3 | 5, 5, 5 | 91,062 / 91,218 / 92,033 | 6.6 / 7.0 / 8.0 s |
| Claude Code `--bare`, task B | 3/3 | 5, 4, 4 | 10,735 / 7,740 / 7,804 | 7.8 / 6.0 / 5.5 s |

Per paired run, default Claude Code used 7.2 to 8.1 times Pi's input tokens. Request counts were about the same, so the gap was per-request overhead: each request re-sends the tool definitions. Bare landed in the same range as Pi: above it in one of six paired runs, below it in the other five.

Most input tokens were cache reads: in task A's first run, 6,912 of Pi's 9,081 and 53,760 of default Claude Code's 72,382. DeepSeek automatically caches repeated prefixes, and cache reads are cheaper than uncached input, so the input-token ratio alone does not establish the bill ratio.

Separately, subscription Claude Haiku 4.5 with `--dangerously-skip-permissions` passed task A in both of 2 runs: 174,693 and 174,630 input tokens, 7 requests each, 19.6 and 18.2 s, respectively. That used a different model.

## Unattended execution: exit code 0 with no fix

For a control, I ran default `claude -p` on task A without permission flags. It made 9 requests, used 169,247 input tokens across all requests, subagents included, and took 19.1 s. Its JSON `permission_denials` listed 6 calls, in order: Edit, Bash, Bash, Edit, Bash, Write.

The tests still failed afterwards. The process exited 0, and its final text began: "I found the bug, but every write/edit tool call is being denied by the permission system in this session, so I can't apply the change." In scripts, check `permission_denials` in the JSON and run your own checks; a successful process exit does not establish that the change happened.

The [headless docs](https://code.claude.com/docs/en/headless) say approval-requiring calls are denied in Manual-mode `claude -p` runs unless approved. Documented controls include `--allowedTools "Bash,Read,Edit"`, `--permission-mode acceptEdits|auto|dontAsk`, and `--permission-prompts none`. The [unattended guide](/blog/run-claude-code-unattended/) and [YOLO-mode guide](/blog/claude-code-yolo-mode/) cover permission choices.

[Pi](https://pi.dev) has no permission popups; its README says it has no built-in permission system restricting filesystem, process, network or credential access. Pi suggests a container or an extension providing confirmation. With Pi, the sandbox is your responsibility; Claude Code requires you to open permissions for unattended work.

## Flags side by side

These CLI options were checked against the `--help` output of Pi 1.2.0 and Claude Code 2.1.281.

| Need | Pi | Claude Code |
|---|---|---|
| Run once | `--print` / `-p` | `-p` |
| Structured output | `--mode json` / `rpc` | `--output-format json` / `stream-json` |
| Provider/model | `--provider`, `--model`; custom providers in `models.json` | `--model`, `ANTHROPIC_BASE_URL`; Anthropic supports Claude models only |
| Tool controls | `--tools read,bash`, `--no-tools`, `--exclude-tools` | `--tools`, `--allowedTools`, `--disallowedTools` |
| Replace/add system prompt | `--system-prompt`, `--append-system-prompt` | Same flags |
| Skills | `--skill <path>`, `--no-skills` | `.claude/skills` discovery; `--bare` skips it |
| Extensions/plugins | `-e <path>`, `--no-extensions` | `--plugin-dir`, settings hooks |
| Skip context files | `--no-context-files` | `--bare` skips CLAUDE.md |
| Sessions | `--session-dir`, `--no-session` | `--no-session-persistence`, `--resume <id>` |
| Permissions | No prompts | `--permission-mode`, `--dangerously-skip-permissions` |
| Subagents/plan mode | Not built in; use extensions | Built in (Agent tool) |
| License | MIT (`earendil-works/pi`) | Proprietary, Anthropic PBC |

## An empty config directory is not a clean run

My first round pointed `PI_CODING_AGENT_DIR` and `CLAUDE_CONFIG_DIR` at empty folders and still picked up my own files: Pi read `~/AGENTS.md`, a parent directory's `AGENTS.md` and 8 skills from `~/.agents/skills`; Claude Code read `~/.claude/CLAUDE.md` and a parent directory's `CLAUDE.md`. Two independent reviewers caught it by reading the session files. I discarded that round's numbers; the clean no-op counts are 1,641 for Pi and 17,398 for default Claude Code.

The lesson for anyone benchmarking harnesses: set `HOME` to an empty directory, run outside any tree with AGENTS.md/CLAUDE.md above it, and grep the session transcript for paths from your real home before trusting a number. Pi's `--no-context-files` and `--no-skills`, and Claude Code's `--bare`, cover part of this. For my rerun I used an empty HOME, a minimal environment and a working directory with no context files above it.

## Reproduce the comparison

Run these in bash. On my machine they reproduced the no-op counts within a few tokens: 1,634 for Pi, 17,381 for default Claude Code and 1,258 for `--bare`, the small differences coming from the longer working-directory path.

```bash
export DEEPSEEK_API_KEY=...
CLEAN=$(mktemp -d)        # empty HOME: no ~/AGENTS.md, ~/.agents/skills, ~/.claude/CLAUDE.md
cd "$(mktemp -d)"         # no AGENTS.md or CLAUDE.md in any parent directory
# env -i drops everything else you exported, such as PI_CODING_AGENT_DIR or CLAUDE_CONFIG_DIR

# Pi: one usage line per assistant message
env -i HOME="$CLEAN" PATH="$PATH" DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
  pi --print --mode json --no-session --provider deepseek --model deepseek-flash \
  "Reply with exactly OK" \
  | jq -c 'select(.type=="message_end") | .message | select(.role=="assistant") | .usage | {input, cacheRead, cacheWrite}'

# Claude Code on the same model (unsupported by Anthropic; measurement only)
env -i HOME="$CLEAN" PATH="$PATH" ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \
  ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY" ANTHROPIC_MODEL=deepseek-flash \
  claude -p --output-format json "Reply with exactly OK" | jq '.modelUsage'

# Claude Code --bare reads ANTHROPIC_API_KEY instead of ANTHROPIC_AUTH_TOKEN
env -i HOME="$CLEAN" PATH="$PATH" ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \
  ANTHROPIC_API_KEY="$DEEPSEEK_API_KEY" ANTHROPIC_MODEL=deepseek-flash \
  claude -p --bare --output-format json "Reply with exactly OK" | jq '.modelUsage'
```

For the coding tasks, make one fresh git repository per task with only that task's two files. Use the task prompt instead of `Reply with exactly OK`, add `--dangerously-skip-permissions` to the Claude Code commands, and afterwards run `python3 -m unittest` and `git diff -- <test file>` yourself. Reset the files to their broken state (`git checkout -- .`) before every coding run. For the four-tool row, add `--tools=Bash,Read,Edit,Write`. Pi prints usage per assistant message; add them up. Claude Code's `modelUsage` already totals all requests including subagents.

## What Orbi learned about switching harnesses

Pi was in Orbi's first commits, [chosen without a comparison](/blog/orbi-on-pi-coding-agent/#why-we-stay-on-pi). The [harness benchmark](/blog/searching-for-orbis-harness/) has harder-task evidence: Opus 5.5 through a Claude Code bridge scored 1/3, 2/3 and 3/4 on three Orbi harness versions, and `deepseek-flash` through Pi went from 6/15 on the original harness to 9/9 on a later one.

Different models, prompt versions and few runs prevent ranking the harnesses. Orbi's bridge dropped Pi's `--skill` list until 29 September, so those Opus runs ran without Orbi's skills. The bug was in Orbi's adapter, not in Claude Code. When switching harnesses, check that every flag arrived, including the init event's tool/skill list.

## Choosing Claude Code vs Pi

With a scheduler in place, Pi agent vs Claude Code comes down to model choice and permissions. I would pick Pi for model choice and provide a sandbox. Claude Code fits Anthropic subscription users wanting built-in subagents, plan mode and deny-by-default permissions. Default Claude Code used 7 to 8 times Pi's input tokens on these tasks; `--bare` landed in Pi's range. For API scripts, use `--bare` or at least restrict `--tools`: the tool list is where most of the overhead is. Set explicit `--allowedTools` or a permission mode, and check `permission_denials`.

Orbi adds scheduling, review and merge gates around `pi --print`, available through [Cloud](/cloud/?ref=blog-pi-vs-cc).

## Limits

These were two toy Python tasks, 3 runs per setup per task, with bare tested on both. The controlled comparison used one model, one machine, one day and the versions above. It says nothing about hard-task success or long sessions and compaction. There are no Pi-on-Claude measurements.

## Related

The [Pi hub](/guides/pi-coding-agent/) collects Orbi's Pi articles. For the runner around the CLI, read the [Claude Code comparison](/compare/claude-code/) and [Cloud](/cloud/?ref=blog-pi-vs-cc).
