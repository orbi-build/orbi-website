---
title: Pi vs omp (Oh My Pi): same model, run unattended
date: 2026-11-23
summary: Same task: omp used 3.9× Pi's tokens but cost 1.2× at DeepSeek's prices, cache hits included. On a bad API key in JSON mode, Pi exited 0 and omp exited 1.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-pi-vs-omp-card.png
mirror: pi-vs-oh-my-pi
series: pi
---

Pi is a small open-source coding agent for the terminal, and omp (Oh My Pi) is a fork of it that adds a lot more built in: 16 tools on by default instead of Pi's four, approval modes, a cost cap, subagents, web search and language-server tools. This Pi vs omp comparison is for people who want to run one of them without a person watching: from a script, a cron job, CI, or a runner like Orbi. I ran both on 23 November 2026 against the same model and the same task, then poked at the failure cases that matter when nobody is there to press a key.

The short version: both fixed the bug every time. omp sent about 3.9 times as many tokens per task, but most of them were cache hits, so at DeepSeek's list price it cost about 1.2 times as much. The bigger difference for unattended use is failure handling. With a bad API key or an unknown model in JSON output mode, Pi exited 0 and omp exited 1. omp also has approval modes; in print mode they deny instead of hanging, and the run still exits 0.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi runs the upstream Pi agent for every delivery, so I had no omp setup to defend and no omp runs of my own before this test.

## Oh My Pi vs Pi: what omp changes

omp's README calls it a fork of [Pi](https://github.com/badlogic/pi-mono) by Mario Zechner that was "rewritten as a coding-first surface", and it is now built by Stencil Labs. Upstream Pi lives on as [`@earendil-works/pi-coding-agent`](https://pi.dev/). Both are MIT licensed. From each tool's `--help` on the versions tested:

| | Pi 1.6.0 | omp 19.1.0 |
|---|---|---|
| Built-in tools | 4 on by default (read, bash, edit, write); grep, find and ls ship off | 16 on by default, 13 more optional |
| Tool approval | None; every tool call runs | `--approval-mode` always-ask, always-ask-cached, write or yolo |
| Spend limit | None | `--max-cost` (print mode exits 3), `--warn-cost` |
| Time limit | None built in | `--max-time` |
| Headless entry points | `-p`, `--mode json`, `--mode rpc` | `-p`, `--mode json`, `--mode rpc`, ACP |
| Runtime | Node | Bun (1.4.4 or newer) |

The extra omp tools include grep and glob, a Python and JavaScript `eval` kernel, `task` for subagents, `web_search`, `lsp`, `ast_edit` and a debugger. If you want to know which one writes better code across many tasks, Composio ran [a 30-task benchmark](https://composio.dev/content/pi-vs-omp) with the same model on both. I did not try to repeat it. This post is about how each one behaves when it runs on its own.

## Setup

Each run started a fresh Docker container (`node:22-bookworm`) with an empty home directory: no config files, no `AGENTS.md`, no skills. I installed Pi 1.6.0 (released 20 November) with npm and omp 19.1.0 (released 21 November) with Bun 1.4.4. Both called the DeepSeek API directly with thinking off. I asked for `deepseek-v4-flash`; DeepSeek's [pricing page](https://api-docs.deepseek.com/quick_start/pricing) says that legacy name is now served by `deepseek-flash` (DeepSeek-V4.1-Flash), so both tools hit the same model.

Install and run (both read the key from `DEEPSEEK_API_KEY`):

```bash
npm install -g @earendil-works/pi-coding-agent@1.6.0
bun install -g @oh-my-pi/pi-coding-agent@19.1.0
export DEEPSEEK_API_KEY=...   # your DeepSeek key

pi  -p --no-session --provider deepseek --model deepseek-v4-flash --thinking off "$PROMPT" < /dev/null
omp -p --no-session --model deepseek/deepseek-v4-flash --thinking off "$PROMPT" < /dev/null
```

Pi needs `--provider deepseek` here. With only `--model deepseek/deepseek-v4-flash`, Pi 1.6.0 called the name "ambiguous across providers" (OpenRouter and Vercel AI Gateway both list it) and exited 1; omp read the same string as DeepSeek's own model. Even the working Pi command prints `Warning: Model "deepseek-v4-flash" not found for provider "deepseek". Using custom model id.` on every run, because Pi's catalog does not list that name. Pi still sends the request, and DeepSeek accepts it.

The task was a small Python repository whose `slugify()` kept punctuation, so two of its three unit tests failed. The prompt asked the agent to fix `slugify.py` without touching the tests and to run the tests before finishing. I judged each run by its exit code, whether `python3 -m unittest` passed afterwards, and which files `git status` showed as changed.

## Results on the coding task

Each tool ran the task six times: three in text mode and three in JSON mode, which I used to read token counts.

| | Pi 1.6.0 | omp 19.1.0 |
|---|---|---|
| Runs passing the tests | 6/6 | 6/6 |
| Files changed | `slugify.py` only | `slugify.py` only |
| Ran the tests itself | 6/6 | 6/6 |
| Wall time per run | 4.0–5.0 s | 4.7–7.1 s |
| Mean tokens per run (JSON mode, n=3) | 10,950 | 42,443 |
| of which cache hits | 9,088 | 40,661 |
| Mean cost per run, DeepSeek peak price | $0.00098 | $0.00117 |

Every run made the same fix in substance: treat any run of non-alphanumeric characters as a separator instead of splitting only on whitespace. Most runs used `re.findall(r"[a-z0-9]+", ...)`; a few used `re.split` on non-alphanumeric runs. "Ran the tests itself" means a `__pycache__` directory existed before my own test run.

The token gap comes from the fixed prompt. Asked only to "Reply with the single word OK", Pi sent 1,502 tokens and omp sent 7,839, about 5.2 times as many, almost all of it system prompt and tool definitions. That fixed part is sent again with every model call, and the coding task took about five calls: 6,337 extra tokens times five is about 31,700, which accounts for nearly all of the 31,500-token gap per run. The ratio drops to 3.9 because the task's own tokens are the same size for both.

The cost gap is much smaller because DeepSeek bills cache hits at 2% of the cache-miss input price ($0.006 vs $0.3 per million at peak). Most of omp's extra tokens were cache hits even in fresh containers, because DeepSeek keeps the cache on its side and earlier runs in this same test had already sent the same prompt prefix. A first run on a cold cache would pay closer to full price. Price everything as a cache miss and the same averages come to about $0.0131 for omp and $0.0037 for Pi, a 3.6× gap. So the real difference depends on how often your provider serves the prompt from cache. Don't compare the costs the tools report themselves. Pi's own totals for its three JSON runs were $0.0038 to $0.0042, about four times Pi's column above, even though most of their input was cache hits; it has no catalog price for this model name and prices the run at a different model's rate; omp's own figure used DeepSeek's off-peak rate. Both columns above use DeepSeek's published peak rate. Off-peak is half for both, so the ratio stays the same.

## Exit codes and failures

These are the cases a runner has to handle without a person. Each ran once per tool, except the SIGTERM row.

| Case | Pi 1.6.0 | omp 19.1.0 |
|---|---|---|
| Invalid API key, text mode | Exit 1 | Exit 1 |
| Invalid API key, JSON mode | Exit 0 | Exit 1 |
| Unknown model name, text mode | Exit 1, after sending the request | Exit 1, before sending anything |
| Unknown model name, JSON mode | Exit 0 | Exit 1 |
| Stdin left open with no data | Hung until my 60 s timeout (124), no output | Hung until the timeout (124), printing that it was waiting for stdin |
| SIGTERM mid-run (2, 3, 4 s; omp also 4.5 s) | Exit 143 | Exit 143 |
| `--max-cost 0.000001` | No such flag | Exit 3: "Cost cap reached" |

The JSON-mode rows are the ones to fix in your wrapper. Pi printed the 401 or 400 error in its event stream and still exited 0, the same behaviour I saw in Pi 1.5.0 when I compared it with OpenCode in [that post](/blog/pi-coding-agent-vs-opencode/#permissions-exit-codes-and-unattended-runs). If you drive Pi in JSON mode, check the final message: in these runs it carried `"stopReason":"error"` and an `errorMessage`, while the exit status said 0.

On an unknown model, Pi 1.6.0 printed the same "not found ... Using custom model id" warning it prints on every run with this model and sent the request anyway; DeepSeek rejected it. So that warning cannot tell you whether you made a typo. omp refused locally with "Model ... not found" and pointed to `omp models find`.

Both tools read piped stdin until it closes, so a runner that leaves stdin open will hang either one. omp at least says so: "Reading prompt from piped stdin (waiting for EOF; Ctrl+C to abort)", then a status line every 10 seconds. Pi printed nothing. Orbi hit this with Pi and now starts every session with stdin set to `/dev/null` ([orbi#1562](https://github.com/orbi-build/orbi/issues/1562)).

A SIGTERM stops both with 143 and rolls nothing back. When the edit landed before the signal (Pi at 3 and 4 seconds, omp at 4.5 seconds), the changed `slugify.py` stayed in the working tree. After a kill, check the tree before you reuse it.

## omp's approval modes with nobody watching

omp checks tool calls against `tools.approvalMode`. Its source says the setting defaults to `yolo`, which runs everything, and that matched what I saw: the default runs above needed no flag. I also ran the coding task in print mode with each stricter mode: `write` twice, and `always-ask` four times (twice in text mode, twice in JSON mode).

| Mode | What happened | Tests | Exit |
|---|---|---|---|
| default (yolo) | Edited and ran tests | Pass, 6/6 | 0 |
| `--approval-mode write` | Edited `slugify.py`; every way to run Python was denied | Pass on my run, never run by the agent, 2/2 | 0 |
| `--approval-mode always-ask` | Could read files only; edits and shell denied | Fail, nothing changed, 4/4 | 0 |

Nothing hung. Each denied call came back to the model as "requires approval but no interactive UI available", with a hint to set `tools.approvalMode` or allow the tool in config. The model reported the block honestly in its final answer ("Blocked: cannot run or edit anything"), but the process still exited 0 with a normal `stop`. So a stricter mode in print mode is a way to stop writes or commands, not a way to get a person's approval, and the exit code will not tell your script that the work was refused.

Pi has no approval step at all. Its [security docs](https://pi.dev/docs/latest/security) say so, and blocking a tool takes an extension or `--exclude-tools`; the OpenCode post shows a [small guard extension](/blog/pi-coding-agent-vs-opencode/#permissions-exit-codes-and-unattended-runs) for `rm`. Neither tool is a sandbox. For unattended runs, put either one in a container or VM you can throw away.

## Pi vs omp: which one to run unattended

If you already wrap the agent in a sandbox and check tests and the diff after every run, the deciding factors are failure handling and prompt size.

I'd pick omp if I wanted the safety limits built in: a spend cap that exits with its own code, a time limit, non-zero exits on API errors in both output modes I tested, and an approval mode that refuses writes. It also tells you when it is stuck waiting for stdin. The price is a much larger fixed prompt, which matters if your provider does not cache it.

I'd pick Pi if I wanted the smallest prompt and a tool surface I can read in a minute, and I was willing to add the limits myself: `< /dev/null`, a timeout, and a check for `"stopReason":"error"` in JSON mode. Either way, judge a run by its tests and its diff. In this test, a run that did nothing could still exit 0 in both tools.

## Why Orbi stays on Pi

I [picked Pi without a comparison](/blog/orbi-on-pi-coding-agent/#why-we-stay-on-pi), and this test did not give me a reason to switch. Orbi already does the things omp adds for unattended work in its own runner: it sets stdin to `/dev/null`, enforces timeouts, classifies the result from the session's evidence rather than Pi's exit code, and runs each delivery in its own checkout. Then an independent review and the merge gate decide whether the change ships. A smaller fixed prompt is cheaper on every one of those runs. [Orbi Cloud](/cloud/?ref=blog-pi-vs-omp) runs that pipeline for you, from a GitHub Issue to a merged pull request and a tagged release.

## Limits

One Linux machine, one day, one model (DeepSeek V4.1 Flash, thinking off), one small task. Six coding runs per tool; for omp's stricter modes, two `write` and four `always-ask` runs; three SIGTERM timings per tool (plus one more for omp); one run for each other failure case. This says nothing about which agent writes better code on hard tasks; Composio's benchmark is the place for that. omp has far more settings than I touched, and its defaults may change between releases. Versions: Pi 1.6.0 and omp 19.1.0.

## Related

[Pi coding agent vs OpenCode](/blog/pi-coding-agent-vs-opencode/), [Pi coding agent vs Claude Code](/blog/pi-coding-agent-vs-claude-code/), the [Pi coding agent guide](/guides/pi-coding-agent/) and [the best Pi extensions](/blog/best-pi-extensions/) cover the rest of the Pi side. The [Orbi comparison](/compare/) and [Orbi Cloud](/cloud/?ref=blog-pi-vs-omp) describe the delivery pipeline built on Pi.
