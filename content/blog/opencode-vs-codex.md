---
title: OpenCode vs Codex CLI: same model, headless
date: 2026-11-11
summary: With Codex on workspace-write, all 24 DeepSeek runs passed; it sent more input and ran longer at each task median. Its default read-only run fixed nothing.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-opencode-vs-codex-card.png
mirror: opencode-vs-codex
---

OpenCode vs Codex CLI is a choice between two open-source terminal coding agents: OpenCode works with many model providers, and OpenAI builds Codex CLI for its own models. If you run one of them headless (no interactive UI) from a script, a CI job or cron with nobody watching, the numbers below show what each sends to the model and what each does by default. The config and a script to repeat the simplest measurement are included. On my Linux machine on 11 November 2026, I ran OpenCode 2.2.7 and Codex CLI 0.167.1 on the same model, DeepSeek V4.1 Flash (`deepseek-flash`). All 24 controlled coding runs passed once Codex had workspace-write. Codex used more total input and took longer at every task median.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi runs Pi, an open-source coding agent CLI, to turn GitHub Issues into merged changes. A separate Pi session reviews each one.

## Test setup

I ran OpenCode with its built-in DeepSeek provider, which reads `DEEPSEEK_API_KEY` from the environment. `--standalone` starts a private server for the run instead of using OpenCode's background service:

```bash
opencode run --standalone --format json -m deepseek/deepseek-flash "<prompt>"
```

For Codex, I configured a custom provider. Codex now speaks only OpenAI's Responses API, the successor to Chat Completions. During setup, it rejected `wire_api = "chat"` with:

```text
Error loading config.toml: `wire_api = "chat"` is no longer supported.
How to fix: set `wire_api = "responses"` in your provider config.
```

That error came from 0.167.0, the version already on the machine. Every measured run used 0.167.1. DeepSeek has a Responses endpoint, and this seven-line `~/.codex/config.toml` worked:

```toml
model = "deepseek-flash"
model_provider = "ds"
[model_providers.ds]
name = "DeepSeek"
base_url = "https://api.deepseek.com/v1"
env_key = "DEEPSEEK_API_KEY"
wire_api = "responses"
```

Codex warned that it had no model metadata for `deepseek-flash` and fell back to defaults, which could degrade performance. Codex CLI is built and tuned for OpenAI's models. I also ran it with its own model as a reference.

For each controlled run, I used `env -i`, an empty HOME and a fresh git repository, with stdin from `/dev/null`. I put a small logging proxy in front of `api.deepseek.com` to record every model request and DeepSeek's usage numbers. Every Codex run in the controlled comparison went through the proxy, 29 in all: 3 no-op runs (the prompt was `Reply with exactly OK`), 13 runs of the coding tasks, 2 rule-file checks and 11 permission probes. Codex also reports its own input tokens, and on all 29 that number matched what the proxy recorded. My input totals include cached tokens. I list those separately because DeepSeek bills them very differently.

## Default behaviour with nobody watching

I ran each probe once, including a separate probe with network access enabled, and I ran `danger-full-access` on only two of the blocked probes, the out-of-project shell write and the network fetch. The task 1 row is different: its OpenCode and `workspace-write` cells summarise the three controlled runs in the task section below, and its no-flag cell is a single extra run. Every run in this table exited 0, even when an action was blocked. "Not written" means the file remained unchanged at the end of the run. I used `codex exec` with the sandbox flag shown in each Codex column.

| What I asked | OpenCode default | Codex: no sandbox flag | `--sandbox workspace-write` | `--sandbox danger-full-access` |
|---|---|---|---|---|
| Create a project file | Written | Not written | Written | Not run |
| Shell command writing outside the project | Written | Blocked | Blocked | Written |
| `curl https://example.com` | 200 | Could not resolve host | Could not resolve host; 200 with `-c sandbox_workspace_write.network_access=true` | 200 |
| Add a line to parent `notes.md`, no command supplied | Written | Not written | Not written | Not run |
| Task 1: fix the duration bug | Fixed | Not fixed | Fixed | Not run |

With plain `codex exec "<task 1 prompt>"`, Codex read the code, then reported this on stderr: `patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings`. It then loaded a patched copy of the module in memory, ran the tests against that copy, where they passed, described the fix in its final message and exited 0. The patch never reached disk, so the file stayed unchanged and the repository's tests still failed when I ran them afterwards. That run used 6 requests, 67,537 input tokens and 27.2 seconds, more input and time than any successful run of that task. A script that checks only the exit code would count it as done.

The [Codex automation docs](https://developers.openai.com/codex/noninteractive) say: "By default, codex exec runs in a read-only sandbox." They document `--sandbox workspace-write` for edits. OpenCode has no OS-level sandbox; its [permissions docs](https://opencode.ai/docs/permissions/) say "shell runs with the host user’s filesystem, process, and network authority." The full [Codex sandbox and approval matrix](/blog/codex-yolo-mode/) covers the other modes.

For unattended GitHub Issues, [Orbi Cloud](/cloud/?ref=blog-oc-vs-codex) runs Pi on each Issue and stops runs that changed no file. A separate Pi session reviews the pull request; merge requires both that review and the repository's CI to pass.

## Fixed overhead: asking for OK

I sent `Reply with exactly OK` three times per tool. Each tool's request, input and cache counts were identical across its three runs, all of them with a warm cache.

| Tool | Requests | Total input | Cached input | Uncached input |
|---|---|---|---|---|
| OpenCode | 2 | 5,815 | 2,048 | 3,767 |
| Codex CLI | 1 | 8,560 | 7,808 | 752 |

OpenCode's main request sent 5,370 input tokens with 12 tools; a separate title request added 445 without tools. Codex sent 9 tools with its single request.

OpenCode's tools were `edit`, `glob`, `grep`, `question`, `read`, `shell`, `skill`, `subagent`, `webfetch`, `websearch`, `write` and `execute`. Codex's were `exec_command`, `write_stdin`, `request_user_input`, `view_image`, `multi_agent_v1`, `get_goal`, `create_goal`, `update_goal` and `web_search`.

In the coding requests I captured, OpenCode sent one system message of 8,654 characters and 14,043 bytes of tool JSON. Codex sent two developer messages of 16,979 and 2,492 characters, an environment-context message, and 17,767 bytes of tool JSON.

Cache hits depend on an identical prompt prefix having been sent recently. I ran these tests within minutes of each other, so I'd expect fewer hits on a first-ever run. I did not measure that cold-cache rate. DeepSeek's prefix cache left Codex with 752 full-price input tokens against OpenCode's 3,767. I did not test caching on other providers.

## OpenCode vs Codex on four small coding tasks

For task 1, I asked each agent to fix a bug in `duration.py` and named the file in the prompt. Task 2 was to implement `top_words`. For task 3, the agent had to search a three-file `shop` package without a filename in the prompt. Task 4 used a new four-file `ledger` package with four bugs, nine visible tests and hidden checks the agent never saw.

I ran each task three times per tool: 24 runs, with Codex using `--sandbox workspace-write` and OpenCode its default policy. Codex was on a model it is not tuned for, as noted in the setup. All passed, including task 4's hidden checks. No run edited a test file.

I calculated the median for each metric separately over three runs. A row does not represent a single run, so Uncached is not always Input minus Cached. Input includes cached tokens.

| Task / tool | Model requests | Input | Cached | Uncached | Output | Wall seconds |
|---|---|---|---|---|---|---|
| 1 / OpenCode | 5 | 24,416 | 19,584 | 4,832 | 348 | 6.1 |
| 1 / Codex | 5 | 52,561 | 49,792 | 2,747 | 2,049 | 11.4 |
| 2 / OpenCode | 6 | 31,504 | 26,368 | 5,136 | 586 | 6.9 |
| 2 / Codex | 4 | 39,735 | 37,632 | 2,068 | 1,488 | 9.2 |
| 3 / OpenCode | 7 | 37,578 | 32,256 | 5,322 | 885 | 8.3 |
| 3 / Codex | 4 | 41,333 | 38,912 | 2,421 | 1,869 | 10.1 |
| 4 / OpenCode | 7 | 46,814 | 39,680 | 7,259 | 1,947 | 15.3 |
| 4 / Codex | 6 | 79,305 | 74,240 | 5,065 | 4,378 | 25.3 |

At every task median, Codex took longer and used more total input, with fewer uncached tokens. Its output was 2.1 to 5.9 times OpenCode's.

At [DeepSeek's peak list prices](https://api-docs.deepseek.com/quick_start/pricing), cached input costs $0.006, uncached input $0.30 and output $1.20 per million tokens. I ran these tests between 01:52 and 02:03 UTC on a Wednesday, inside one of DeepSeek's two weekday peak windows, 01:00 to 04:00 UTC (the other is 06:00 to 10:00 UTC). The median list-price cost per run was:

| Task | OpenCode | Codex CLI |
|---|---|---|
| 1 | $0.00198 | $0.00359 |
| 2 | $0.00236 | $0.00258 |
| 3 | $0.00280 | $0.00320 |
| 4 | $0.00471 | $0.00722 |

All these runs cost under one cent. I calculated costs per run before taking medians. In the runs that defined each cost median, Codex's input cost was lower. Its extra output made the total higher. Both tools passed these tasks, so they say nothing about which agent is more capable. This is not a benchmark.

## Project rules: use AGENTS.md

I put a rule in the project's `AGENTS.md` asking each agent to end its replies with `ZEBRA-MARKER`. Both followed it. With the same line in `CLAUDE.md` and no `AGENTS.md` in the project, neither followed it. I ran each file/tool combination once.

For Codex, this matches the [instruction-file docs](https://developers.openai.com/codex/guides/agents-md): "Filenames not on this list are ignored for instruction discovery." I'd add `CLAUDE.md` to `project_doc_fallback_filenames` for Codex to read it. OpenCode's [rules page](https://opencode.ai/docs/rules/), which is marked as V1 documentation, lists "CLAUDE.md in your project directory (used if no AGENTS.md exists)". My 2.2.7 run did not read that file, matching [2.2.5 in the earlier comparison](/blog/opencode-vs-claude-code/). I'd keep shared rules in `AGENTS.md`.

## Codex on its own model, through a ChatGPT login

I ran the same four tasks once each through my ChatGPT login, using `gpt-6.1-sol`, medium reasoning effort and `--sandbox workspace-write`. All four passed, including task 4's hidden checks, with 3 to 5 shell commands per task and wall times of 17.3 to 44.9 seconds.

Because I used my normal Codex home, including global `AGENTS.md` and config, I could not make a controlled performance comparison with the clean-home runs. I left out the token counts because they are not comparable.

I could not run OpenCode on GPT with this machine's OpenAI API key because the key was rejected. Its [providers docs](https://opencode.ai/docs/providers/) describe "Sign in with ChatGPT", an interactive sign-in I did not test.

## Subscriptions and price

On the [Codex pricing page](https://developers.openai.com/codex/pricing), CLI access through a ChatGPT plan starts at Plus ($20/month). Pro starts at $100/month, and Business is $20/user/month billed annually for two or more users, or $25 billed monthly. The Free ($0) and Go ($8/month) plans list Codex in the desktop app only. Those are the prices on that page on 11 November 2026. API-key usage is billed per token. [Codex CLI is Apache-2.0](https://github.com/openai/codex).

[OpenCode is free and MIT-licensed](https://github.com/anomalyco/opencode); model usage is billed by the provider. It also offers [OpenCode Go at $10/month](https://opencode.ai/docs/).

## Reproduce the no-op

Only the no-op measurement can be repeated from this post; the four task repositories are not published. Save the following as a Bash script. It uses `PIPESTATUS`. I ran it with OpenCode 2.2.7 and Codex CLI 0.167.1; it also needs `jq` and an exported `DEEPSEEK_API_KEY`. Codex stays in its default read-only sandbox here, which is enough for a reply; add `--sandbox workspace-write` before asking it to edit files. Run it from a directory with no `AGENTS.md` in it or above it, so no project rules get added to the prompt.

```bash
#!/usr/bin/env bash
# Tested with opencode 2.2.7 and codex 0.167.1. Needs jq and DEEPSEEK_API_KEY exported.
# OpenCode no-op: empty HOME, stdin closed
H=$(mktemp -d)
env -i HOME="$H" PATH="$PATH" DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
  opencode run --standalone --format json -m deepseek/deepseek-flash "Reply with exactly OK" < /dev/null \
  | jq -c 'select(.type=="step_finish") | .part.tokens'
echo "opencode exit: ${PIPESTATUS[0]}"

# Codex CLI no-op on the same model
H=$(mktemp -d); mkdir -p "$H/.codex"
cat > "$H/.codex/config.toml" <<'EOF'
model = "deepseek-flash"
model_provider = "ds"
[model_providers.ds]
name = "DeepSeek"
base_url = "https://api.deepseek.com/v1"
env_key = "DEEPSEEK_API_KEY"
wire_api = "responses"
EOF
env -i HOME="$H" PATH="$PATH" DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
  codex exec --json --skip-git-repo-check "Reply with exactly OK" < /dev/null \
  | jq -c 'select(.type=="turn.completed") | .usage'
echo "codex exit: ${PIPESTATUS[0]}"
```

My usage lines on the latest run were:

```json
{"input":234,"output":2,"reasoning":0,"cache":{"read":5120,"write":0}}
{"input_tokens":8557,"cached_input_tokens":7808,"cache_write_input_tokens":0,"output_tokens":8,"reasoning_output_tokens":6}
```

OpenCode printed one line, for its main request: add `input` and `cache.read` to get 5,354 input tokens. Its title request is not in `step_finish`. An earlier run of the same script printed 3,562 and 1,792, the same sum with fewer cache hits. Codex reported 8,557 this time and 8,556 the first time. OpenCode's 5,354 is 16 tokens below the 5,370 of its main request quoted above, and Codex's two results are 3 and 4 below the 8,560 in the table. The script runs in a different directory, outside a git repository and without the proxy; I did not trace the difference further. If you get numbers close to 5,354 and 8,557, you have repeated the measurement.

With a wrong or empty key, both tools exited 1 and printed no usage line. The blocked runs earlier had exited 0.

## Codex vs OpenCode: which one I'd use

I'd choose Codex if I already paid for ChatGPT and wanted a sandbox that blocks out-of-project writes and network by default. I'd pass `--sandbox workspace-write` for edits.

I'd choose OpenCode if I expected to switch model providers often. That took one `-m` flag, where Codex needed a custom provider block and warned about missing model metadata. OpenCode's main request was also smaller in my no-op test, 5,370 input tokens against 8,560, though more of its input was billed at full price on DeepSeek. OpenCode runs with the host user's full authority. Its deny rules can block specific actions, but for OS-level isolation I'd run it in a container. With either tool, I'd verify the diff and run the tests myself.

## Limits

I tested on one machine, on one day, with one DeepSeek model. I ran four small tasks three times per tool and each probe once per setting. I used DeepSeek for the controlled runs of Codex, which is tuned for OpenAI's models. The cache numbers apply to DeepSeek and these repeated runs. I did not run OpenCode on GPT. All counts apply to the versions I tested.

## Related

- [OpenCode vs Claude Code: the same method](/blog/opencode-vs-claude-code/)
- [Pi coding agent vs OpenCode](/blog/pi-coding-agent-vs-opencode/)
- [Codex YOLO mode and sandbox settings](/blog/codex-yolo-mode/)
- [Orbi compared with Codex](/compare/codex/)
- [Orbi Cloud](/cloud/?ref=blog-oc-vs-codex)
