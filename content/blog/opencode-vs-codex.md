---
title: OpenCode vs Codex CLI: same model, headless
date: 2026-11-11
summary: All 24 controlled DeepSeek runs passed; Codex sent more input and took longer at every task median but cached more. With default flags it left a bug unfixed.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-opencode-vs-codex-card.png
---

I tested OpenCode vs Codex headless: OpenCode is an open-source terminal coding agent that works with many model providers. Codex CLI is OpenAI's open-source terminal coding agent, built for OpenAI's models. For scripts, CI jobs or cron with nobody watching, this gives you measured overhead and default behaviour on the same model, plus DeepSeek config and a no-op reproduction script. On my Linux machine on 11 November 2026, OpenCode 2.2.7 and Codex CLI 0.167.1 both used DeepSeek V4.1 Flash (`deepseek-flash`). All 24 controlled coding runs passed with Codex given workspace-write; Codex used more total input and took longer at every task median.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi runs Pi, an open-source coding agent CLI, to turn GitHub Issues into merged changes, with a separate Pi session reviewing each one.

## How I ran OpenCode vs Codex

OpenCode used its built-in DeepSeek provider:

```bash
opencode run --standalone --format json -m deepseek/deepseek-flash "<prompt>"
```

Codex needed a custom provider. It now speaks the Responses API; `wire_api = "chat"` was rejected during setup with:

```text
Error loading config.toml: `wire_api = "chat"` is no longer supported.
How to fix: set `wire_api = "responses"` in your provider config.
```

The compatibility check used 0.167.0. DeepSeek offers a Responses endpoint; this seven-line `~/.codex/config.toml` worked:

```toml
model = "deepseek-flash"
model_provider = "ds"
[model_providers.ds]
name = "DeepSeek"
base_url = "https://api.deepseek.com/v1"
env_key = "DEEPSEEK_API_KEY"
wire_api = "responses"
```

Codex warned it had no model metadata for `deepseek-flash` and fell back to defaults, which could degrade performance. Codex CLI is built and tuned for OpenAI's models; DeepSeek is off its home turf. I ran its own model as a reference below.

Each controlled run used `env -i`, an empty HOME, a fresh git repository and stdin from `/dev/null`. A small logging proxy in front of `api.deepseek.com` recorded every model request and DeepSeek's usage numbers. Codex's self-reported input matched the proxy on all 28 Codex runs in the two logged matrices (no-ops, tasks, rule checks and permission probes), so nothing went around it. Input totals include cached tokens, also listed separately because DeepSeek bills them very differently.

## Default behaviour with nobody watching

Each result is one run, including the separate network-enabled probe. All exited 0, including blocked attempts. "Not written" records the final file state. Codex columns use `codex exec` with the indicated sandbox flag.

| What I asked | OpenCode default | Codex: no sandbox flag | `--sandbox workspace-write` | `--sandbox danger-full-access` |
|---|---|---|---|---|
| Create a project file | Written | Not written | Written | Not run |
| Shell command writing outside the project | Written | Blocked | Blocked | Written |
| `curl https://example.com` | 200 | Could not resolve host | Could not resolve host; 200 with `-c sandbox_workspace_write.network_access=true` | 200 |
| Add a line to parent `notes.md`, no command supplied | Written | Not written | Not written | Not run |
| Task 1: fix the duration bug | Fixed | Not fixed | Fixed | Not run |

Plain `codex exec "<task 1 prompt>"` read the code, then stderr reported `patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings`. Codex verified a corrected version in memory, described the fix in its final message and exited 0. The file stayed unchanged and its tests still failed. It used 6 requests, 67,537 input tokens and 27.2 seconds, more input and time than any successful run of that task.

The [Codex automation docs](https://developers.openai.com/codex/noninteractive) say: "By default, codex exec runs in a read-only sandbox." They document `--sandbox workspace-write` for edits. OpenCode has no OS-level sandbox; its [permissions docs](https://opencode.ai/docs/permissions/) say "shell runs with the host user’s filesystem, process, and network authority." The full [Codex sandbox and approval matrix](/blog/codex-yolo-mode/) covers the other modes. A script checking only the exit code would count that read-only run as done: check the tests or diff.

For unattended GitHub Issues, [Orbi Cloud](/cloud/?ref=blog-oc-vs-codex) runs Pi on each Issue and stops runs that changed no file. A separate Pi session reviews the pull request; merge requires both that review and the repository's CI to pass.

## Fixed overhead: asking for OK

I sent `Reply with exactly OK` three times per tool; request, input and cache counts were identical.

| Tool | Requests | Total input | Cached input | Uncached input |
|---|---|---|---|---|
| OpenCode | 2 | 5,815 | 2,048 | 3,767 |
| Codex CLI | 1 | 8,560 | 7,808 | 752 |

OpenCode's main request sent 5,370 input tokens with 12 tools; a separate title request added 445 without tools. Codex sent 9 tools with its single request.

OpenCode's tools were `edit`, `glob`, `grep`, `question`, `read`, `shell`, `skill`, `subagent`, `webfetch`, `websearch`, `write` and `execute`. Codex's were `exec_command`, `write_stdin`, `request_user_input`, `view_image`, `multi_agent_v1`, `get_goal`, `create_goal`, `update_goal` and `web_search`.

Captured coding requests show where some overhead comes from: OpenCode had one system message of 8,654 characters and 14,043 bytes of tool JSON. Codex had two developer messages of 16,979 and 2,492 characters, an environment-context message, and 17,767 bytes of tool JSON.

Cache hits depend on an identical prompt prefix having been sent recently. These runs happened within minutes; I'd expect fewer hits on a first-ever run, whose cold-cache rate I did not measure. DeepSeek's prefix cache left Codex with 752 full-price input tokens against OpenCode's 3,767. I did not test caching on other providers.

## Four small coding tasks

Task 1 fixed a bug in `duration.py`, named in the prompt. Task 2 implemented `top_words`. Task 3 searched a three-file `shop` package without a filename in the prompt. Task 4 used a new four-file `ledger` package with four bugs, nine visible tests and hidden checks the agent never saw.

I ran each task three times per tool: 24 runs, with Codex using `--sandbox workspace-write` and OpenCode its default policy. All passed, including task 4's hidden checks. No run edited a test file.

Each median below is calculated per metric over three runs; a row does not describe one single run. Input includes cached tokens.

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

Codex used more total input at every task median, fewer uncached tokens, and 2.1–5.9× the output tokens. Every task median took longer with Codex.

At [DeepSeek's peak list prices](https://api-docs.deepseek.com/quick_start/pricing), cached input costs $0.006, uncached input $0.30 and output $1.20 per million tokens. These runs fell in peak hours. Medians of the per-run list-price costs were:

| Task | OpenCode | Codex CLI |
|---|---|---|
| 1 | $0.00198 | $0.00359 |
| 2 | $0.00236 | $0.00258 |
| 3 | $0.00280 | $0.00320 |
| 4 | $0.00471 | $0.00722 |

All these runs cost under one cent. Costs were calculated per run before taking medians. In the runs defining each cost median, Codex's input cost was lower; extra output made the total higher. These tasks do not separate the tools on correctness. This measures overhead and default behaviour; it is not a benchmark and ranks neither agent's ability.

## Project rules: use AGENTS.md

I put a rule in project `AGENTS.md` asking replies to end with `ZEBRA-MARKER`. Both followed it. With the same line in `CLAUDE.md` instead, neither did: one run per file/tool combination.

For Codex, this matches the [instruction-file docs](https://developers.openai.com/codex/guides/agents-md): "Filenames not on this list are ignored for instruction discovery." Add `CLAUDE.md` to `project_doc_fallback_filenames` to include it. OpenCode's [rules page, labelled V1](https://opencode.ai/docs/rules/), lists "CLAUDE.md in your project directory (used if no AGENTS.md exists)". My 2.2.7 run did not pick it up, matching [2.2.5 in the earlier comparison](/blog/opencode-vs-claude-code/). Put shared rules in `AGENTS.md`.

## Codex vs OpenCode with a ChatGPT login

I ran the same four tasks once each through my ChatGPT login, using `gpt-6.1-sol`, medium reasoning effort and `--sandbox workspace-write`. All four passed, including task 4's hidden checks, with 3–5 shell commands per task and wall times of 17.3–44.9 seconds.

These used my normal Codex home, including global `AGENTS.md` and config, preventing a controlled performance comparison with the clean-home runs. Their token counts are not comparable and are omitted.

I could not run OpenCode on GPT. Its [providers docs](https://opencode.ai/docs/providers/) describe "Sign in with ChatGPT", an interactive sign-in I did not test. This machine's OpenAI API key was rejected.

## Subscriptions and price

On the [Codex pricing page](https://developers.openai.com/codex/pricing), CLI access through a ChatGPT plan starts at Plus ($20/month). Pro starts at $100/month, and Business is $20/user/month billed annually for two or more users, or $25 billed monthly. The Free ($0) and Go ($8/month) plans list Codex in the desktop app only. An API key pays per token instead. [Codex CLI is Apache-2.0](https://github.com/openai/codex).

[OpenCode is free and MIT-licensed](https://github.com/anomalyco/opencode); you pay your model provider. It also offers [OpenCode Go at $10/month](https://opencode.ai/docs/).

## Reproduce the no-op

Save this as a Bash script: it uses `PIPESTATUS` and needs OpenCode 2.x, Codex 0.167 or later, `jq`, and an exported `DEEPSEEK_API_KEY`. Run it from a directory with no `AGENTS.md` in it or above it, so no project rules get added to the prompt.

```bash
#!/usr/bin/env bash
# Needs: opencode 2.x, codex 0.167+, jq, and DEEPSEEK_API_KEY exported.
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

My usage lines were:

```json
{"input":3562,"output":2,"reasoning":0,"cache":{"read":1792,"write":0}}
{"input_tokens":8556,"cached_input_tokens":7808,"cache_write_input_tokens":0,"output_tokens":2,"reasoning_output_tokens":0}
```

OpenCode's `step_finish` counts input plus cache read: 5,354 for the main request, excluding its title request. Codex reported 8,556 input. Temporary-directory path lengths explain the few-token differences from the table.

With a wrong or empty key, both exited 1 and printed no usage line. Among the failed jobs here, authentication was the one case where the exit code did tell the truth.

## Codex CLI vs OpenCode: which one I'd use

I'd choose Codex if I already paid for ChatGPT and wanted a sandbox that blocks out-of-project writes and network by default. Pass `--sandbox workspace-write` for edits and check results beyond exit codes.

I'd choose OpenCode for picking providers with one model flag and fewer input tokens per request in the no-op test. It runs with your user's full authority: deny rules restrict actions; a container supplies OS isolation. Either way, verify the diff and tests yourself.

## Limits

One machine, one day, one DeepSeek model, four small tasks, three runs each per tool. Probes ran once per setting. Codex was off its home model; cache numbers belong to DeepSeek and these repeated runs. There was no OpenCode-on-GPT run. Counts apply to these versions.

## Related

- [OpenCode vs Claude Code: the same method](/blog/opencode-vs-claude-code/)
- [Pi coding agent vs OpenCode](/blog/pi-coding-agent-vs-opencode/)
- [Codex YOLO mode and sandbox settings](/blog/codex-yolo-mode/)
- [Orbi compared with Codex](/compare/codex/)
- [Orbi Cloud](/cloud/?ref=blog-oc-vs-codex)
