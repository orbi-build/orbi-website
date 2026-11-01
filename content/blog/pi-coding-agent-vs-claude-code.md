---
title: Pi coding agent vs Claude Code: same model, measured
date: 2026-11-01
summary: Same model, two small tasks, all 3 runs passed on both tools, but default Claude Code used 3 to 6.5 times Pi's input tokens; --bare used fewer than Pi.
lang: en
author: Lawrence Liu
image: /img/blog-pi-vs-claude-code-card.png
series: pi
---

I ran the Pi coding agent vs Claude Code on the same model and the same two small coding tasks: both passed every run, and default Claude Code used 3 to 6.5 times as many input tokens per run as Pi. Run with `--bare`, Claude Code used fewer input tokens than Pi on the bug-fix task (I didn't run the other task in bare mode). For scripts with an API key, that flag matters more than the choice of harness.

I'm Lawrence Liu, the creator of Orbi. I measured this on my Linux machine on 2026-11-01, using Pi 1.2.0 and Claude Code 2.1.281. Orbi runs its implementer and reviewer sessions as `pi --print`.

## Pi coding agent vs Claude Code: the setup

Both used DeepSeek V4.1 Flash (`deepseek-flash`). Pi used its built-in `deepseek` provider, `--provider deepseek --model deepseek-flash`, and `DEEPSEEK_API_KEY`. Claude Code used `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`, `ANTHROPIC_AUTH_TOKEN=<deepseek key>` and `ANTHROPIC_MODEL=deepseek-flash`, following [DeepSeek's endpoint documentation](https://api-docs.deepseek.com/guides/anthropic_api).

[Anthropic says](https://code.claude.com/docs/en/llm-gateway) it "doesn't support routing Claude Code to non-Claude models through any gateway". I used this only as a measuring instrument; I do not recommend that routing setup. Pi used the OpenAI-compatible API and Claude Code the Anthropic-compatible API: same model and tokenizer, different wire formats.

`PI_CODING_AGENT_DIR` and `CLAUDE_CONFIG_DIR` pointed at empty folders. Neither session loaded extensions, skills, plugins, MCP servers or CLAUDE.md/AGENTS.md. These measurements cover out-of-the-box overhead. Input totals are DeepSeek's reported input + cache read + cache write, summed over every model request. Pi records usage in its session file; Claude Code returns it with `--output-format json`.

## Pi vs Claude Code token usage: a prompt needing no tools

The prompt was `Reply with exactly OK`. Each run made a single model request. I ran each setup 3 times with identical input counts, except the system-prompt replacement, which I ran once.

| Setup | Input tokens per request |
|---|---|
| Pi default: read, bash, edit, write | 4,731 |
| Pi `--no-tools` | 2,643 |
| Claude Code default: 23 tools | 28,376 |
| Claude Code `--tools=Bash,Read,Edit,Write` | 14,292 |
| Claude Code same 4 tools + `--system-prompt="You are a coding assistant."` | 12,910 (1 run) |
| Claude Code `--bare`: Bash, Edit, Read | 1,407 |

For this single-request prompt, default Claude Code used about 6× Pi's input. Restricting it to Pi's four tools roughly halved it, leaving about 3× Pi's. Replacing the system prompt removed about 1,400 more tokens. The remaining input includes tool definitions and whatever else default mode adds; this test does not separate them. `--bare` was lower than Pi's default.

Claude Code's init event listed these 23 default tools: Task, Bash, CronCreate, CronDelete, CronList, DesignSync, Edit, EnterWorktree, ExitWorktree, ListAgents, Monitor, NotebookEdit, PushNotification, Read, ReportFindings, ScheduleWakeup, SendMessage, Skill, TaskStop, WebFetch, WebSearch, Workflow, Write.

The [headless docs](https://code.claude.com/docs/en/headless) recommend `--bare` for scripted and SDK calls and say it will become the default for `-p` in a future release. It skips auto-discovery of hooks, skills, plugins, MCP servers, auto memory and CLAUDE.md. It supplies Bash, file read and file edit tools, and requires `ANTHROPIC_API_KEY` or `apiKeyHelper`, ignoring OAuth/subscription login. For bare measurements I set `ANTHROPIC_API_KEY` to the DeepSeek key.

As a separate check, Claude Haiku 4.5 through my subscription (`--model haiku`, clean config with only login copied) used 37,269 input tokens for the same no-op in 2 identical runs. The tokenizer differs, so those counts are not directly comparable. Default overhead also appeared on Claude's own model. I could not test Pi on Claude: I had no Anthropic API key or OpenRouter credit.

## Pi vs Claude Code benchmark: small coding tasks

Task A was a bug fix in a 25-line `duration.py`: `format_duration` swapped minutes and seconds. Of 3 tests in `test_duration.py`, 2 failed beforehand. My prompt was:

> The tests in test_duration.py fail. Fix the bug in duration.py so that python3 -m unittest passes. Do not edit the tests.

Task B implemented `top_words(text, n)` in `words.py`, replacing `NotImplementedError`. Its 6 tests covered case, punctuation, alphabetical tie-break, apostrophes, n > vocabulary and empty input. The prompt was:

> Implement top_words in words.py so that python3 -m unittest passes. Do not edit the tests.

I ran each tool 3 times per task on `deepseek-flash`, then ran `python3 -m unittest` myself and checked the test-file `git diff`. The tests were never edited. Every Claude Code coding run here used `--dangerously-skip-permissions`. In this table, "default" means the default tools and regular startup, with execution permissions opened for comparability with Pi.

| Run set | Successful runs | Model requests per run | Input tokens per run | Wall time per run |
|---|---|---|---|---|
| Pi, task A | 3/3 | 5, 5, 5 | 28,357 / 29,140 / 27,481 | 7.1 / 8.1 / 6.8 s |
| Claude Code default, task A | 3/3 | 4, 6, 4 | 115,592 / 175,822 / 115,610 | 8.1 / 10.6 / 9.1 s |
| Claude Code `--bare`, task A | 3/3 | 5, 5, 4 | 11,107 / 12,136 / 8,406 | 6.0 / 6.9 / 4.9 s |
| Pi, task B | 3/3 | 5, 5, 5 | 27,139 / 27,381 / 27,537 | 7.5 / 6.4 / 7.5 s |
| Claude Code default, task B | 3/3 | 6, 3, 5 | 177,610 / 86,021 / 145,048 | 12.2 / 5.6 / 9.3 s |

Per run, default Claude Code used between 3.1 and 6.5 times Pi's input tokens. Bare Claude Code used fewer tokens on task A. I did not run task B with `--bare`.

Most input tokens were cache reads: in task A's first run, 25,600 of Pi's 28,357 and 86,272 of default Claude Code's 115,592. DeepSeek automatically caches repeated prefixes, and cache reads are cheaper, so the token gap overstates the bill gap.

Separately, subscription Claude Haiku 4.5 with `--dangerously-skip-permissions` passed task A in both of 2 runs: 246,804 and 288,461 input tokens, 6 and 7 requests, 20.8 and 22.5 s, respectively. That used a different model.

## Unattended execution: exit code 0 with no fix

For a control, I ran default `claude -p` on task A without permission flags. It made 13 requests, used 402,128 input tokens and took 57.7 s. Its JSON listed 11 permission denials, in order: Edit, Bash, Bash, Write, Edit, Edit, Bash, Bash, Bash, Read, Write.

The tests still failed afterwards. The process exited 0, and its final text described the fix it wanted to make. In scripts, check `permission_denials` in the JSON and run your own checks; a successful process exit does not establish that the change happened.

The [headless docs](https://code.claude.com/docs/en/headless) say approval-requiring calls are denied in Manual-mode `claude -p` runs unless approved. They specify that v2.1.302 or later starts `-p` in Manual mode when no permission mode is set. That later-version rule does not establish the mode of my 2.1.281 run. Documented controls include `--allowedTools "Bash,Read,Edit"`, `--permission-mode acceptEdits|auto|dontAsk`, and `--permission-prompts none` (v2.1.259+). The [unattended guide](/blog/run-claude-code-unattended/) and [YOLO-mode guide](/blog/claude-code-yolo-mode/) cover permission choices.

[Pi](https://pi.dev) has no permission popups; its README says it has no built-in permission system restricting filesystem, process, network or credential access. Pi suggests a container or an extension providing confirmation. With Pi, the sandbox is your responsibility; Claude Code requires you to open permissions for unattended work.

## Flags side by side

These CLI options were checked against Pi 1.2.0 and Claude Code 2.1.281 help.

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
| Subagents/plan mode | Not built in; use extensions | Built in; `Task` tool |
| License | MIT (`earendil-works/pi`) | Proprietary, Anthropic PBC |

## Reproduce the comparison

Run these in bash, inside a git repository holding the task files described above. Reset the files to their broken state (`git checkout -- .`) before every coding run. `mktemp -d` gives each run an empty config directory.

```bash
# Pi: no-op, then task A
export DEEPSEEK_API_KEY=...
PI_CODING_AGENT_DIR=$(mktemp -d) pi --print --mode json --no-session \
  --provider deepseek --model deepseek-flash "Reply with exactly OK"
PI_CODING_AGENT_DIR=$(mktemp -d) pi --print --mode json --no-session \
  --provider deepseek --model deepseek-flash \
  "The tests in test_duration.py fail. Fix the bug in duration.py so that python3 -m unittest passes. Do not edit the tests."
python3 -m unittest
git diff -- test_duration.py
```

Pi's assistant messages in JSON output contain `usage.input`, `usage.cacheRead` and `usage.cacheWrite`; sum them across requests.

```bash
# Unsupported by Anthropic; measurement only
export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
export ANTHROPIC_AUTH_TOKEN=$DEEPSEEK_API_KEY
export ANTHROPIC_MODEL=deepseek-flash
CLAUDE_CONFIG_DIR=$(mktemp -d) claude -p --output-format json \
  "Reply with exactly OK" | jq '.usage'
CLAUDE_CONFIG_DIR=$(mktemp -d) claude -p --output-format json \
  --dangerously-skip-permissions \
  "The tests in test_duration.py fail. Fix the bug in duration.py so that python3 -m unittest passes. Do not edit the tests."
python3 -m unittest
git diff -- test_duration.py
```

For bare runs, `unset ANTHROPIC_AUTH_TOKEN`, `export ANTHROPIC_API_KEY="$DEEPSEEK_API_KEY"` and add `--bare`. For the four-tool row, add `--tools=Bash,Read,Edit,Write`.

## What Orbi learned about switching harnesses

Pi was in Orbi's first August commits, [chosen without a comparison](/blog/orbi-on-pi-coding-agent/#why-we-stay-on-pi). The [harness benchmark](/blog/searching-for-orbis-harness/) includes harder-task evidence: Opus 5.5 through a Claude Code bridge scored 1/3, 2/3 and 3/4 on Orbi harness versions v1, v5 and v11; `deepseek-flash` through Pi went from 6/15 on the original harness to 9/9 on v15.

Different models, prompt versions and few runs prevent ranking the harnesses. Orbi's bridge dropped Pi's `--skill` list until 29 September, making those Opus runs prompt-only. The bug was in Orbi's adapter, not in Claude Code. When switching harnesses, check that every flag arrived, including the init event's tool/skill list.

## Choosing Claude Code vs Pi

With a scheduler in place, Pi agent vs Claude Code comes down to model choice and permissions. I would pick Pi for model choice and provide a sandbox. Claude Code fits Anthropic subscription users wanting built-in subagents, plan mode and deny-by-default permissions. For API scripts, use `--bare`, explicit `--allowedTools` or a permission mode, and check `permission_denials`.

Orbi adds scheduling, review and merge gates around `pi --print`, available through [Cloud](/cloud/?ref=blog-pi-vs-cc).

## Limits

These were two toy Python tasks, 3 runs per tool per task, with bare tested only on task A. The controlled comparison used one model, one machine and one day, at the versions stated above. It says nothing about hard-task success or long sessions and compaction. There are no Pi-on-Claude measurements.

## Related

The [Pi hub](/guides/pi-coding-agent/) collects Orbi's Pi articles. For the runner around the CLI, read the [Claude Code comparison](/compare/claude-code/) and [Cloud](/cloud/?ref=blog-pi-vs-cc).
