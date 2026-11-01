---
title: Pi coding agent vs Claude Code: same model, measured
date: 2026-11-01
summary: With permissions open, both passed every run on two small tasks. Default Claude Code used about 7 to 8 times Pi's input tokens; --bare came close to Pi.
lang: en
author: Lawrence Liu
image: /img/blog-pi-vs-claude-code-card.png
series: pi
---

I tested Pi coding agent vs Claude Code with DeepSeek V4.1 Flash on the same two small coding tasks. With execution permissions open for the coding comparison, both passed every run. Default Claude Code sent 7–8× as many input tokens per run as Pi. Using `claude -p --bare` brought its input-token use close to Pi's: below Pi in five of six paired runs, above it in one. Most of the extra input in default Claude Code came from its 21 tool definitions. For scripts using an API key, that one flag changed input-token use about as much as switching harnesses did.

I'm Lawrence Liu, the creator of Orbi. I measured this on my Linux machine on 1 November 2026, with Pi 1.2.0 and Claude Code 2.1.281. Orbi runs its implementer and reviewer sessions as `pi --print`.

## Setting up Pi coding agent vs Claude Code on one model

Both used DeepSeek V4.1 Flash (`deepseek-flash`). Pi used its built-in `deepseek` provider, `--provider deepseek --model deepseek-flash`, and `DEEPSEEK_API_KEY`. Claude Code used `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`, `ANTHROPIC_AUTH_TOKEN=<deepseek key>` and `ANTHROPIC_MODEL=deepseek-flash`, following [DeepSeek's endpoint documentation](https://api-docs.deepseek.com/guides/anthropic_api).

[Anthropic says](https://code.claude.com/docs/en/llm-gateway) it "doesn't support routing Claude Code to non-Claude models through any gateway". I used that route only for measurement and do not recommend it. Pi used DeepSeek's [OpenAI-compatible API](https://api-docs.deepseek.com/); Claude Code used DeepSeek's [Anthropic-compatible API](https://api-docs.deepseek.com/guides/anthropic_api). Both reached the same model through different wire formats.

Each run had `HOME` set to an empty directory and a minimal environment (`env -i`). The no-op runs used an empty directory; each coding run used a fresh git repository holding only that task's two files. All of them sat under `/var/tmp`, with no AGENTS.md or CLAUDE.md in any parent directory. The counts therefore reflect each tool's default overhead, with none of my files loaded. Pi includes the working directory path in its prompt, so the count varies by a few tokens with path length (1,635 from the shorter temporary path in the reproduction below, instead of 1,641). I checked every rerun's session transcript and found no paths from my real home directory.

Input totals include cache reads and writes. For Pi, I summed `usage.input + cacheRead + cacheWrite` over assistant messages. For Claude Code, I summed every request, including subagents, and cross-checked against `modelUsage` in the JSON output.

## Token use on a no-op prompt

The prompt was `Reply with exactly OK`. Each run made a single model request. I ran each setup in the table 3 times, and its input count stayed the same.

| Setup | Input tokens per request |
|---|---|
| Pi default: read, bash, edit, write | 1,641 |
| Pi `--no-tools` | 466 |
| Claude Code default: 21 tools | 17,398 |
| Claude Code `--tools=Bash,Read,Edit,Write` | 3,316 |
| Claude Code same 4 tools, default system prompt replaced with `--system-prompt="You are a coding assistant."` | 2,072 |
| Claude Code `--bare`: Bash, Edit, Read | 1,265 |

For this single-request prompt, default Claude Code used about 10.6× Pi's input. A no-op request is nothing but fixed overhead, so this ratio is higher than the per-run ratio in the coding tasks below. Restricting it to Pi's four tools brought the count to 3,316, about 2× Pi's. Removing the other 17 tools cut about 14,000 of the default's 17,398 input tokens. Replacing the system prompt removed about 1,240 more. `--bare` used 1,265, below Pi's default of 1,641. Pi with no tools used 466.

In the clean environment, the tool definitions Claude Code sent to the model listed 21 default tools, the same list in all 3 no-op runs: Agent, Bash, CronCreate, CronDelete, CronList, DesignSync, Edit, EnterWorktree, ExitWorktree, ListAgents, NotebookEdit, Read, ReportFindings, ScheduleWakeup, SendMessage, Skill, TaskStop, WebFetch, WebSearch, Workflow, Write.

The [headless docs](https://code.claude.com/docs/en/headless) recommend `--bare` for scripted and SDK calls and say it will become the default for `-p` in a future release. It skips auto-discovery of hooks, skills, plugins, MCP servers, auto memory and CLAUDE.md. It includes Bash, file read and file edit tools. Authentication requires `ANTHROPIC_API_KEY` or `apiKeyHelper`; OAuth/subscription login is ignored. For the bare measurements, I set `ANTHROPIC_API_KEY` to the DeepSeek key.

I also checked Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) through my subscription (`--model haiku`, the same clean HOME with only the login copied in). It used 20,787 and 20,660 input tokens for the same no-op in 2 runs. The login brought my account's 13 skills into the prompt, and that session listed 11 tools, so this is not a defaults-only count. Those counts use a different tokenizer and cannot be compared directly with the DeepSeek counts, but Claude's own model also had default overhead. I could not test Pi on Claude because I had no Anthropic API key or OpenRouter credit.

## Two small coding tasks

Task A was a bug fix in `duration.py`: `format_duration` swapped minutes and seconds, causing tests in `test_duration.py` to fail. My prompt was:

> The tests in test_duration.py fail. Fix the bug in duration.py so that python3 -m unittest passes. Do not edit the tests.

Task B was to implement `top_words(text, n)` in `words.py`, replacing `NotImplementedError`. Its tests covered case, punctuation, alphabetical tie-break, apostrophes, n > vocabulary and empty input. The prompt was:

> Implement top_words in words.py so that python3 -m unittest passes. Do not edit the tests.

I ran Pi, default Claude Code and bare Claude Code 3 times per task on `deepseek-flash`. Each task had its own fresh git repository containing only that task's two files. Afterwards, I ran `python3 -m unittest` myself and checked the test-file `git diff`. The tests were never edited. All Claude Code coding runs in this comparison, including bare runs, used `--dangerously-skip-permissions`. Here, "default" means the default tools and regular startup, with execution permissions open to match Pi.

| Run set | Successful runs | Model requests per run | Input tokens per run | Wall time per run |
|---|---|---|---|---|
| Pi, task A | 3/3 | 4, 5, 4 | 9,081 / 11,788 / 8,962 | 3.8 / 5.2 / 4.3 s |
| Claude Code default, task A | 3/3 | 4, 5, 4 | 72,382 / 92,756 / 72,622 | 6.0 / 8.3 / 6.1 s |
| Claude Code `--bare`, task A | 3/3 | 5, 5, 4 | 10,475 / 10,799 / 8,127 | 6.3 / 5.7 / 4.7 s |
| Pi, task B | 3/3 | 5, 5, 5 | 12,650 / 11,834 / 11,894 | 6.2 / 5.6 / 6.5 s |
| Claude Code default, task B | 3/3 | 5, 5, 5 | 91,062 / 91,218 / 92,033 | 6.6 / 7.0 / 8.0 s |
| Claude Code `--bare`, task B | 3/3 | 5, 4, 4 | 10,735 / 7,740 / 7,804 | 7.8 / 6.0 / 5.5 s |

Default Claude Code used 7.2 to 8.1 times Pi's input tokens in each paired run. Request counts were about the same; the gap came from overhead on each request, which re-sends the tool definitions. I paired runs by their order (first with first, and so on). Bare came close to Pi: above it in one of six paired runs and below it in the other five. It is not an equal-tools comparison: bare has three tools (no Write) and a shorter prompt. With the same four tools and a replaced system prompt, Claude Code's no-op was 2,072 against Pi's 1,641.

Most input tokens were cache reads. In the first of the three task A runs, they accounted for 6,912 of Pi's 9,081 and 53,760 of default Claude Code's 72,382. DeepSeek [caches repeated prefixes by default](https://api-docs.deepseek.com/guides/kv_cache), and [cache-hit input is billed far below cache-miss input](https://api-docs.deepseek.com/quick_start/pricing), so the input-token ratio alone cannot tell you the cost ratio.

Through my subscription, Claude Haiku 4.5 with `--dangerously-skip-permissions` passed task A in both of 2 runs. It used 174,693 and 174,630 input tokens, with 7 requests each, and took 19.6 and 18.2 s, respectively. These runs used a different model and tokenizer, so don't compare their counts with the DeepSeek rows.

## Permission denials with exit code 0

As a control, I ran default `claude -p` on task A without permission flags. It made 9 requests, used 169,247 input tokens across all requests, including subagents, and took 19.1 s. Its JSON `permission_denials` listed 6 calls, in order: Edit, Bash, Bash, Edit, Bash, Write.

The tests still failed afterwards. The process exited 0, and its final text began: "I found the bug, but every write/edit tool call is being denied by the permission system in this session, so I can't apply the change." In scripts, check `permission_denials` in the JSON and verify the result yourself. The process can exit successfully even when it has made no change.

The [headless docs](https://code.claude.com/docs/en/headless) say approval-requiring calls are denied in Manual-mode `claude -p` runs unless approved. Documented controls include `--allowedTools "Bash,Read,Edit"`, `--permission-mode acceptEdits|auto|dontAsk`, and `--permission-prompts none`. The [unattended guide](/blog/run-claude-code-unattended/) and [YOLO-mode guide](/blog/claude-code-yolo-mode/) cover permission choices.

[Pi](https://pi.dev) has no permission popups. Its [README](https://github.com/earendil-works/pi) says it has no built-in permission system restricting filesystem, process, network or credential access, and suggests a container or an extension that asks for confirmation. You have to provide Pi's sandbox yourself. For unattended Claude Code runs, you have to configure which tool calls are allowed.

## CLI options

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
| License | [MIT](https://github.com/earendil-works/pi/blob/main/LICENSE) | [Proprietary, Anthropic PBC](https://github.com/anthropics/claude-code/blob/main/LICENSE.md) |

## Isolating config and context files

In my first round, I pointed `PI_CODING_AGENT_DIR` and `CLAUDE_CONFIG_DIR` at empty folders. Both tools still picked up my own files: Pi read `~/AGENTS.md`, a parent directory's `AGENTS.md` and 8 skills from `~/.agents/skills`; Claude Code read `~/.claude/CLAUDE.md` and a parent directory's `CLAUDE.md`. Two independent reviewers caught this in the session files. I discarded that round's numbers. The clean no-op counts are 1,641 for Pi and 17,398 for default Claude Code.

When benchmarking harnesses, set `HOME` to an empty directory and run outside any tree with AGENTS.md/CLAUDE.md above it. Before using the counts, grep the session transcript for paths from your real home. Pi's `--no-context-files` and `--no-skills`, and Claude Code's `--bare`, cover part of this. For my rerun, I used an empty HOME, a minimal environment and a working directory with no context files above it.

## Reproduce the no-op comparison

Run these commands in bash, with `claude` resolving to the npm-installed program (a wrapper script that resets `ANTHROPIC_*` or depends on `HOME` will fail here). Run that way on my machine on 1 November 2026 (Pi 1.2.0, Claude Code 2.1.281), they gave 1,635 for Pi, 17,379 for default Claude Code and 1,258 for `--bare`, within a few tokens of the counts above. Both tools put the working-directory path in their prompt, and the temporary directory had a shorter path than my test directories.

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
  ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY" ANTHROPIC_MODEL=deepseek-flash ANTHROPIC_SMALL_FAST_MODEL=deepseek-flash \
  claude -p --output-format json "Reply with exactly OK" | jq '.modelUsage'

# Claude Code --bare reads ANTHROPIC_API_KEY instead of ANTHROPIC_AUTH_TOKEN
env -i HOME="$CLEAN" PATH="$PATH" ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \
  ANTHROPIC_API_KEY="$DEEPSEEK_API_KEY" ANTHROPIC_MODEL=deepseek-flash ANTHROPIC_SMALL_FAST_MODEL=deepseek-flash \
  claude -p --bare --output-format json "Reply with exactly OK" | jq '.modelUsage'
```

For coding runs, write your own versions of the two tasks from the descriptions above; your token counts will differ from mine, since the files won't match byte for byte. Make one fresh git repository per task with only that task's two files and commit the broken state first (`git init && git add -A && git commit -m broken`), so `git checkout -- .` and `git diff` have something to compare against. Use the task prompt instead of `Reply with exactly OK`, add `--dangerously-skip-permissions` to the Claude Code commands, and afterwards run `python3 -m unittest` and `git diff -- <test file>` yourself. Reset the files to their broken state (`git checkout -- .`) before every coding run. For the four-tool row, add `--tools=Bash,Read,Edit,Write` to the default Claude Code command (the one with `ANTHROPIC_AUTH_TOKEN`). Pi prints usage per assistant message; add them up. Claude Code's `modelUsage` already totals all requests including subagents.

## Switching Orbi's harness

Pi was in Orbi's first commits, [chosen without a comparison](/blog/orbi-on-pi-coding-agent/#why-we-stay-on-pi). In the [harness benchmark](/blog/searching-for-orbis-harness/), which used harder tasks, Opus 5.5 through a Claude Code bridge scored 1/3, 2/3 and 3/4 (passes / runs, across three repositories) on Orbi harness versions v1, v5 and v11. With `deepseek-flash` through Pi, the score went from 6/15 on the original harness to 9/9 on v15.

Those runs used different models and prompt versions, with too few runs to rank the harnesses. Orbi's bridge translated Pi's flags into Claude Code's, and until 29 September it dropped the `--skill` list on the way, so the Opus runs had no Orbi skills. Orbi's adapter caused that bug. When switching harnesses, check that every flag reaches the new harness, including the tool/skill list in the init event.

## Which one I'd use

For scheduled jobs, I'd use Pi for model choice and provide a sandbox. Claude Code fits Anthropic subscription users who want built-in subagents, plan mode and deny-by-default permissions. On these tasks, default Claude Code used 7 to 8 times Pi's input tokens; `--bare` came close to Pi, mostly below it. For API scripts, I'd use `--bare` or at least restrict `--tools`, since the tool list accounts for most of the overhead. Set explicit `--allowedTools` or a permission mode, and check `permission_denials`.

Orbi adds scheduling, review and merge gates around `pi --print`, available through [Cloud](/cloud/?ref=blog-pi-vs-cc).

## Limits

I used two toy Python tasks, with 3 runs per DeepSeek setup per task, and tested bare on both. The Haiku runs (2 each) and the permission control (1 run) were extra checks. The controlled comparison used one model, one machine, one day and the versions above. These results do not tell us how either tool performs on hard tasks, in long sessions or during compaction. I have no Pi-on-Claude measurements.

## Related

The [Pi hub](/guides/pi-coding-agent/) collects Orbi's Pi articles. For the runner around the CLI, read the [Claude Code comparison](/compare/claude-code/) and [Cloud](/cloud/?ref=blog-pi-vs-cc).
