---
title: Pi coding agent 和 Claude Code 对比：同一模型实测
date: 2026-11-01
summary: 用同一模型测了两个小编程任务，放开权限的运行全部通过。默认 Claude Code 的输入 token 是 Pi 的 7 到 8 倍；加 --bare 后，用量落在 Pi 的范围内。
lang: zh
author: Lawrence Liu
image: /img/blog-pi-vs-claude-code-card.png
series: pi
---

我是 Lawrence Liu，Orbi 的创始人。Pi 和 Claude Code 的区别，主要在模型选择、内置功能和权限控制。这次实测里，默认配置下的 Pi 更省输入 token。我让两边用同一个 DeepSeek V4.1 Flash，跑相同的两个小编程任务。放开执行权限后，两边每次都通过；默认 Claude Code 每次发送的输入 token 是 Pi 的 7–8×。加上 `claude -p --bare`，用量就落在 Pi 的范围内，有的高，有的低。

默认 Claude Code 多出来的输入，大部分来自它的 21 个工具定义。对拿 API key 跑脚本的人，先用对这个参数，比先选哪套 harness 更影响用量。

这次测试在 2026 年 11 月 1 日完成，用的是我的 Linux 机器，版本为 Pi 1.2.0 和 Claude Code 2.1.281。Orbi 的实现和评审会话都通过 `pi --print` 启动。

## Pi 和 Claude Code 怎么比：模型相同，环境清空

两边都用 DeepSeek V4.1 Flash（`deepseek-flash`）。Pi 走内置的 `deepseek` provider，参数是 `--provider deepseek --model deepseek-flash`，密钥放在 `DEEPSEEK_API_KEY`。Claude Code 按 [DeepSeek 的端点文档](https://api-docs.deepseek.com/guides/anthropic_api)配置：`ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`、`ANTHROPIC_AUTH_TOKEN=<deepseek key>`、`ANTHROPIC_MODEL=deepseek-flash`。

[Anthropic 明确说](https://code.claude.com/docs/en/llm-gateway)，不支持通过任何 gateway 把 Claude Code 路由到非 Claude 模型。我这里只把这套接法用作测量，不建议照此选择日常使用的路由。Pi 走 OpenAI-compatible API，Claude Code 走 Anthropic-compatible API。模型和 tokenizer 相同，请求在网络上传输的格式不同。

每次运行都把 `HOME` 指向空目录，用最小环境（`env -i`）。空操作在空目录里跑；每个编程任务各用一个新建的 git 仓库，里面只有该任务的两个文件。这些目录都在 `/var/tmp` 下，所有上级目录里都没有 AGENTS.md 或 CLAUDE.md。这样测到的是工具开箱启动时的开销，没有加载我自己的配置内容。Pi 会把工作目录路径写进 prompt，路径长短会让计数变动几个 token：换一个更短的路径，就从 1,641 变成了 1,634。我检查了每次重跑的会话记录，没有一份含有我真实家目录下的路径。

输入总量包含缓存读取和写入。Pi 按 assistant 消息累加 `usage.input + cacheRead + cacheWrite`。Claude Code 累加每次请求，包括子 agent，再与 JSON 输出里的 `modelUsage` 核对。

## 不调用工具，光启动要多少 token

先给一个不用工具的 prompt：`Reply with exactly OK`。每次只请求一次模型。每种配置跑 3 次，同一配置的输入计数完全相同。

| 配置 | 每次请求的输入 token |
|---|---|
| Pi default: read, bash, edit, write | 1,641 |
| Pi `--no-tools` | 466 |
| Claude Code default: 21 tools | 17,398 |
| Claude Code `--tools=Bash,Read,Edit,Write` | 3,316 |
| Claude Code same 4 tools + `--system-prompt="You are a coding assistant."` | 2,072 |
| Claude Code `--bare`: Bash, Edit, Read | 1,265 |

在这个只请求一次的任务里，默认 Claude Code 的输入约为 Pi 的 10.6×。把工具限制为与 Pi 相同的四个，用量降到 3,316，约为 Pi 的 2×。也就是说，去掉其余 17 个工具，就从默认的 17,398 个输入 token 里省下了约 14,000 个。再替换 system prompt，又少了约 1,240 个。`--bare` 用了 1,265，低于 Pi 默认的 1,641；Pi 完全不带工具时是 466。

干净环境的 init 事件列出了这 21 个默认工具，2 次检查得到的清单一致：Task、Bash、CronCreate、CronDelete、CronList、DesignSync、Edit、EnterWorktree、ExitWorktree、ListAgents、NotebookEdit、Read、ReportFindings、ScheduleWakeup、SendMessage、Skill、TaskStop、WebFetch、WebSearch、Workflow、Write。init 事件把子 agent 工具列为 `Task`；模型实际收到的工具定义里，它叫 `Agent`，文档里也这么叫。

[headless 文档](https://code.claude.com/docs/en/headless)建议脚本和 SDK 调用使用 `--bare`，并说以后的版本会把它设为 `-p` 的默认行为。它跳过 hooks、skills、plugins、MCP servers、auto memory 和 CLAUDE.md 的自动发现，只提供 Bash、文件读取和文件编辑工具。认证需要 `ANTHROPIC_API_KEY` 或 `apiKeyHelper`，会忽略 OAuth 和订阅登录。测 bare 时，我把 DeepSeek key 放在了 `ANTHROPIC_API_KEY`。

我还单独用订阅里的 Claude Haiku 4.5 测了相同的空操作：`--model haiku`，同样清空 HOME，只复制登录凭据。2 次运行分别用了 20,787 和 20,660 个输入 token。tokenizer 不同，这组数字不能直接拿来比较，但 Claude 自家的模型也有默认启动开销。我没有 Anthropic API key，也没有 OpenRouter 余额，所以没测 Pi 跑 Claude。

## 小编程任务：都能做对，用量差在哪

任务 A 是修 `duration.py` 的 bug。`format_duration` 把分钟和秒交换了，导致 `test_duration.py` 里的测试失败。prompt 原文是：

> The tests in test_duration.py fail. Fix the bug in duration.py so that python3 -m unittest passes. Do not edit the tests.

任务 B 要在 `words.py` 里实现 `top_words(text, n)`，替换 `NotImplementedError`。测试覆盖大小写、标点、同频词按字母排序、撇号、n > vocabulary 和空输入。prompt 是：

> Implement top_words in words.py so that python3 -m unittest passes. Do not edit the tests.

每种配置在 `deepseek-flash` 上，每个任务跑 3 次。任务 A 和任务 B 各用一个新建的 git 仓库，里面只有该任务的两个文件。跑完后，我自己执行 `python3 -m unittest`，并检查测试文件的 `git diff`。测试文件没有被改过。

这里所有 Claude Code 编程测试，包括 bare，都带了 `--dangerously-skip-permissions`。表中的 default 指默认工具和常规启动方式；执行权限已经放开，以便和 Pi 比较。

| 运行组 | 成功次数 | 每次运行的模型请求数 | 每次运行的输入 token | 每次运行的实际耗时 |
|---|---|---|---|---|
| Pi, task A | 3/3 | 4, 5, 4 | 9,081 / 11,788 / 8,962 | 3.8 / 5.2 / 4.3 s |
| Claude Code default, task A | 3/3 | 4, 5, 4 | 72,382 / 92,756 / 72,622 | 6.0 / 8.3 / 6.1 s |
| Claude Code `--bare`, task A | 3/3 | 5, 5, 4 | 10,475 / 10,799 / 8,127 | 6.3 / 5.7 / 4.7 s |
| Pi, task B | 3/3 | 5, 5, 5 | 12,650 / 11,834 / 11,894 | 6.2 / 5.6 / 6.5 s |
| Claude Code default, task B | 3/3 | 5, 5, 5 | 91,062 / 91,218 / 92,033 | 6.6 / 7.0 / 8.0 s |
| Claude Code `--bare`, task B | 3/3 | 5, 4, 4 | 10,735 / 7,740 / 7,804 | 7.8 / 6.0 / 5.5 s |

按每次运行配对比较，默认 Claude Code 的输入 token 是 Pi 的 7.2 到 8.1 倍。请求次数差不多，差距主要在每次请求的开销：工具定义会随每次请求重新发送。bare 和 Pi 在同一范围内，六组配对里有一组高于 Pi，其余五组低于 Pi。

这些输入大部分来自缓存读取。任务 A 的首次运行中，Pi 的 9,081 个输入 token 里有 6,912 个是缓存读取，默认 Claude Code 的 72,382 个里有 53,760 个。DeepSeek 会自动缓存重复前缀，读取缓存比未缓存输入便宜。因此，输入 token 的比例不能直接当作账单比例。

另测的订阅版 Claude Haiku 4.5 带 `--dangerously-skip-permissions`，任务 A 的 2 次运行都通过。输入分别是 174,693 和 174,630 个 token，各请求 7 次，耗时分别为 19.6 和 18.2 s。这组用的是另一个模型。

## 无人值守时，退出码 0 也可能没改成

我还做了一组权限对照：默认 `claude -p` 跑任务 A，不传权限参数。它发了 9 次请求，连同子 agent 在内共用了 169,247 个输入 token，耗时 19.1 s。JSON 的 `permission_denials` 按顺序列出 6 次调用：Edit、Bash、Bash、Edit、Bash、Write。

跑完测试仍然失败。进程退出码却是 0，最终回复的开头是：

> I found the bug, but every write/edit tool call is being denied by the permission system in this session, so I can't apply the change.

在脚本里，要检查 JSON 的 `permission_denials`，还要自己验证结果。进程正常退出，不能证明文件已经改了。

[headless 文档](https://code.claude.com/docs/en/headless)说，Manual-mode 的 `claude -p` 运行中，需要审批的调用如果没获批准，就会被拒绝。文档列出的控制方式包括 `--allowedTools "Bash,Read,Edit"`、`--permission-mode acceptEdits|auto|dontAsk` 和 `--permission-prompts none`。怎么选权限，见[无人值守指南](/zh/blog/run-claude-code-unattended/)和 [YOLO mode 指南](/zh/blog/claude-code-yolo-mode/)。

[Pi](https://pi.dev) 没有权限弹窗。它的 README 说明，内置机制不会限制文件系统、进程、网络或凭据访问。Pi 建议用容器，或者用扩展加确认。用 Pi，沙箱要自己准备；用 Claude Code 跑无人值守任务，则要明确放开所需权限。

## 命令行参数放在一起看

下表的 CLI 选项都核对过 Pi 1.2.0 和 Claude Code 2.1.281 的 `--help` 输出。

| 需求 | Pi | Claude Code |
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

## 配置目录空了，测试环境未必干净

我最初只把 `PI_CODING_AGENT_DIR` 和 `CLAUDE_CONFIG_DIR` 指向空文件夹，结果仍然加载了自己的文件。Pi 读了 `~/AGENTS.md`、上级目录的 `AGENTS.md`，以及 `~/.agents/skills` 下的 8 个 skill。Claude Code 读了 `~/.claude/CLAUDE.md` 和上级目录的 `CLAUDE.md`。两位独立评审读会话文件时发现了这个问题。我丢弃了那轮数字；清理后的空操作计数是 Pi 1,641，默认 Claude Code 17,398。

自己测 harness 时，要把 `HOME` 指向空目录，工作目录的上级不能有 AGENTS.md 或 CLAUDE.md，再用 grep 检查会话记录里有没有真实家目录的路径。Pi 的 `--no-context-files`、`--no-skills` 和 Claude Code 的 `--bare` 能处理其中一部分。我重跑时用的是空 HOME、最小环境，以及上级没有上下文文件的工作目录。

## 怎么复现这次对比

下面的命令用 bash 跑。在我的机器上，它们与前面的空操作计数只差几个 token：Pi 是 1,634，默认 Claude Code 是 17,381，`--bare` 是 1,258。差的这几个 token 来自工作目录路径的长短。`env -i` 会丢掉你 shell 里导出过的其他变量，比如 `PI_CODING_AGENT_DIR`、`CLAUDE_CONFIG_DIR`，否则它们会把真实配置目录带回来。

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

测编程任务时，每个任务各建一个 git 仓库，只放该任务的两个文件。把 `Reply with exactly OK` 换成任务 prompt，给 Claude Code 命令加上 `--dangerously-skip-permissions`。结束后自己跑 `python3 -m unittest` 和 `git diff -- <test file>`。每次编程测试前，用 `git checkout -- .` 把文件恢复到有 bug 的状态。要复现四工具那一行，加上 `--tools=Bash,Read,Edit,Write`。Pi 按每条 assistant 消息输出用量，需要累加；Claude Code 的 `modelUsage` 已经加总全部请求，包括子 agent。

## Orbi 换 harness 时踩过的坑

Orbi 最早的提交里就有 Pi，[当时没有做过对比](/zh/blog/orbi-on-pi-coding-agent/#为什么一直用-pi)。更难任务的数据在 [harness 测评](/zh/blog/searching-for-orbis-harness/)里：Opus 5.5 经 Claude Code 桥接，在三版 Orbi harness 上分别拿到 1/3、2/3 和 3/4；`deepseek-flash` 经 Pi，在原版 harness 上是 6/15，后来的版本是 9/9。

模型不同、prompt 版本不同，运行次数又少，这些结果排不出 harness 的名次。Orbi 的桥接代码还丢了 Pi 的 `--skill` 列表，直到 9 月 29 日才修好，所以那些 Opus 测试没有带 Orbi 的 skills。bug 在 Orbi 的适配器里，责任不在 Claude Code。换 harness 时，要检查每个参数有没有传到，包括 init 事件里的工具和 skill 清单。

## Pi 和 Claude Code 怎么选

已经有调度器时，我会按模型选择和权限需求来选。需要自由选模型，我会用 Pi，再自己提供沙箱。用 Anthropic 订阅，希望自带子 agent、plan mode 和默认拒绝的权限控制，Claude Code 更合适。

这次小任务里，默认 Claude Code 的输入 token 是 Pi 的 7 到 8 倍，`--bare` 落在 Pi 的范围内。API 脚本优先用 `--bare`，至少也要限制 `--tools`，因为大部分额外输入来自工具清单。再明确设置 `--allowedTools` 或 permission mode，并检查 `permission_denials`。

Orbi 在 `pi --print` 外面加调度、评审和合并检查，也通过 [Cloud](/zh/cloud/?ref=blog-pi-vs-cc)提供。

## 这些数字能说明多大范围

测试只有两个简单的 Python 任务，每种配置、每个任务各跑 3 次，bare 在两个任务上都测了。受控对比只用了一个模型、一台机器、一天，以及上面列出的版本。它说明不了难任务的成功率，也说明不了长会话和 compaction 的表现。这里没有 Pi 跑 Claude 的测量。

## 相关

[Pi 专题页](/zh/guides/pi-coding-agent/)收录了 Orbi 的 Pi 系列文章。要看 CLI 外面那层 runner，见 [Claude Code 对比](/zh/compare/claude-code/)和 [Cloud](/zh/cloud/?ref=blog-pi-vs-cc)。
