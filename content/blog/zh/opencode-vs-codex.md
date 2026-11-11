---
title: OpenCode vs Codex CLI：同一模型，无人值守实测
date: 2026-11-11
summary: 24 次受控 DeepSeek 编程运行全部通过；Codex 各任务中位数的输入更多、耗时更长、缓存命中的输入也更多。Codex 默认参数下没修好 bug。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-opencode-vs-codex-card.png
mirror: opencode-vs-codex
---

我做了 OpenCode vs Codex 的无人值守实测：OpenCode 是支持多家模型提供商的开源终端编程 agent，Codex CLI 则是 OpenAI 开发、面向自家模型的开源终端编程 agent。这篇文章写给把它们放进脚本、CI 或定时任务、运行时没人盯着的开发者。读完能了解同一模型下的额外开销和默认行为，也能拿到 DeepSeek 配置和空操作复现脚本。这里的无人值守运行，就是不开交互界面、从脚本里跑。

我是 Larry 🍀 Orbi，Orbi 的创始人。Orbi 用 Pi 这个开源编程 agent 命令行工具，把 GitHub Issue 做成改动并合并进仓库，每次改动都由另一个 Pi 会话评审。

我在 2026 年 11 月 11 日用自己的 Linux 机器做了测试，OpenCode 2.2.7 和 Codex CLI 0.167.1 都调用 DeepSeek V4.1 Flash（`deepseek-flash`）。受控编程运行中，我给 Codex 开了 workspace-write 权限，两个工具合计 24 次全部通过。按每个任务的中位数比较，Codex 的输入总量更多，耗时也更长。

## OpenCode vs Codex 的测试配置

OpenCode 用内置的 DeepSeek provider：

```bash
opencode run --standalone --format json -m deepseek/deepseek-flash "<prompt>"
```

Codex 需要配置自定义 provider。它现在用 Responses API，配置时填 `wire_api = "chat"` 会报错：

```text
Error loading config.toml: `wire_api = "chat"` is no longer supported.
How to fix: set `wire_api = "responses"` in your provider config.
```

编程实测用 0.167.1，配置兼容性检查用的是 0.167.0。DeepSeek 提供 Responses 接口，下面这 7 行 `~/.codex/config.toml` 配置跑通了：

```toml
model = "deepseek-flash"
model_provider = "ds"
[model_providers.ds]
name = "DeepSeek"
base_url = "https://api.deepseek.com/v1"
env_key = "DEEPSEEK_API_KEY"
wire_api = "responses"
```

Codex 警告说，找不到 `deepseek-flash` 的模型元数据，已回退到默认值，可能导致表现变差。Codex CLI 主要为 OpenAI 的模型设计和调优，DeepSeek 并非它主要适配的模型。我也跑了 Codex 调用 OpenAI 模型的测试，结果放在后文供参考。两组环境不同，无法做受控性能比较。

每次受控运行都用 `env -i`、空 HOME、新建的 git 仓库，并把 stdin 指向 `/dev/null`。我在 `api.deepseek.com` 前放了一个小型日志代理，记录每次模型请求和 DeepSeek 返回的用量。两组测试的日志覆盖了空操作、编程任务、规则检查和权限探测，其中 Codex 共跑了 28 次。每次 Codex 自报的输入用量都与代理记录一致，没有请求绕过代理。输入总量包含缓存 token，下文也把缓存用量单独列出，因为 DeepSeek 对两类输入的收费差别很大。

## 没人盯着跑时的默认行为

下表每项只跑了 1 次，单独开启网络的探测也只跑了 1 次。所有运行的退出码都是 0，操作被拦也一样。“未写入”指文件最终没有写入。Codex 各列都用 `codex exec`，沙箱参数见表头。

| 我让它做什么 | OpenCode 默认 | Codex：不加沙箱参数 | `--sandbox workspace-write` | `--sandbox danger-full-access` |
|---|---|---|---|---|
| 在项目中创建文件 | 已写入 | 未写入 | 已写入 | 未测试 |
| 用 shell 命令向项目外写入 | 已写入 | 被拦截 | 被拦截 | 已写入 |
| `curl https://example.com` | 200 | Could not resolve host | Could not resolve host；加 `-c sandbox_workspace_write.network_access=true` 后为 200 | 200 |
| 在上级目录的 `notes.md` 追加一行，不提供命令 | 已写入 | 未写入 | 未写入 | 未测试 |
| 任务 1：修复 duration bug | 已修复 | 未修复 | 已修复 | 未测试 |

直接运行 `codex exec "<task 1 prompt>"` 时，Codex 读取了代码，随后 stderr 报出 `patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings`。它在内存中验证了修正后的版本，在最终回复中描述了修复，然后以 0 退出。文件没改，测试仍然失败。这次用了 6 次请求、67,537 个输入 token，耗时 27.2 秒。这个任务的所有成功运行，输入和耗时都比这次少。

[Codex 自动化文档](https://developers.openai.com/codex/noninteractive)写着："By default, codex exec runs in a read-only sandbox." 文档给出的编辑参数是 `--sandbox workspace-write`。OpenCode 没有操作系统级沙箱，它的[权限文档](https://opencode.ai/docs/permissions/)写着："shell runs with the host user’s filesystem, process, and network authority." 其他模式可以看完整的 [Codex 沙箱与审批矩阵](/zh/blog/codex-yolo-mode/)。脚本只看退出码，就会把那次只读运行算作完成，还得检查测试或 diff。

处理无人值守的 GitHub Issue 时，[Orbi Cloud](/zh/cloud/?ref=blog-oc-vs-codex) 会为每张 Issue 运行 Pi。如果一次运行连一个文件都没改，就会被停下。PR 交给另一个 Pi 会话评审，评审和仓库的 CI 都通过才合并。

## 只回复 OK 的固定开销

我给每个工具各发了 3 次 `Reply with exactly OK`，同一工具每次的请求数、输入和缓存计数都相同。

| 工具 | 请求数 | 输入总量 | 缓存命中的输入 | 未命中缓存的输入 |
|---|---|---|---|---|
| OpenCode | 2 | 5,815 | 2,048 | 3,767 |
| Codex CLI | 1 | 8,560 | 7,808 | 752 |

OpenCode 的主请求带了 12 个工具，发送 5,370 个输入 token；单独的标题请求不带工具，又加了 445 个。Codex 的 1 次请求带了 9 个工具。

OpenCode 的工具是 `edit`、`glob`、`grep`、`question`、`read`、`shell`、`skill`、`subagent`、`webfetch`、`websearch`、`write` 和 `execute`。Codex 的工具是 `exec_command`、`write_stdin`、`request_user_input`、`view_image`、`multi_agent_v1`、`get_goal`、`create_goal`、`update_goal` 和 `web_search`。

从记录下来的编程请求中，能看到一部分开销的来源：OpenCode 有 1 条 system 消息，长 8,654 个字符，工具 JSON 为 14,043 字节。Codex 有 2 条 developer 消息，分别长 16,979 和 2,492 个字符，另有 1 条 environment-context 消息，工具 JSON 为 17,767 字节。

要命中缓存，近期必须发送过完全相同的 prompt 前缀。这些运行相隔只有几分钟。我预计首次运行的缓存命中会更少，但没有测过冷缓存时的命中率。用了 DeepSeek 的前缀缓存后，Codex 只有 752 个输入 token 按全价计费，OpenCode 则有 3,767 个。我没有测试其他 provider 的缓存。

## 4 个小编程任务

任务 1 修复 `duration.py` 的 bug，prompt 给了文件名。任务 2 实现 `top_words`。任务 3 在一个有 3 个文件的 `shop` 包里找问题，prompt 没给文件名。任务 4 用一个新建的 `ledger` 包，里面有 4 个文件、4 个 bug、9 个可见测试，还有 agent 从未见过的隐藏检查。

每个任务用每个工具各跑 3 次，共 24 次。Codex 加 `--sandbox workspace-write`，OpenCode 用默认策略。所有运行都通过了测试，包括任务 4 的隐藏检查，也都没改测试文件。单看这些任务的正确性，两个工具没有分出差别。

下表对每项指标分别取 3 次运行的中位数，一行里的数字不代表同一次运行。输入包含缓存 token。

| 任务 / 工具 | 模型请求数 | 输入 | 缓存命中的输入 | 未命中缓存的输入 | 输出 | 耗时（秒） |
|---|---|---|---|---|---|---|
| 1 / OpenCode | 5 | 24,416 | 19,584 | 4,832 | 348 | 6.1 |
| 1 / Codex | 5 | 52,561 | 49,792 | 2,747 | 2,049 | 11.4 |
| 2 / OpenCode | 6 | 31,504 | 26,368 | 5,136 | 586 | 6.9 |
| 2 / Codex | 4 | 39,735 | 37,632 | 2,068 | 1,488 | 9.2 |
| 3 / OpenCode | 7 | 37,578 | 32,256 | 5,322 | 885 | 8.3 |
| 3 / Codex | 4 | 41,333 | 38,912 | 2,421 | 1,869 | 10.1 |
| 4 / OpenCode | 7 | 46,814 | 39,680 | 7,259 | 1,947 | 15.3 |
| 4 / Codex | 6 | 79,305 | 74,240 | 5,065 | 4,378 | 25.3 |

按每个任务的中位数比较，Codex 的输入总量更多，未命中缓存的输入更少，输出 token 是 OpenCode 的 2.1–5.9 倍。每个任务的耗时中位数也都更长。

按 [DeepSeek 的高峰时段标价](https://api-docs.deepseek.com/quick_start/pricing)，每百万 token 的价格是：缓存命中的输入 $0.006，未命中缓存的输入 $0.30，输出 $1.20。这批运行都在高峰时段。先按标价计算每次运行的费用，再取中位数，结果如下：

| 任务 | OpenCode | Codex CLI |
|---|---|---|
| 1 | $0.00198 | $0.00359 |
| 2 | $0.00236 | $0.00258 |
| 3 | $0.00280 | $0.00320 |
| 4 | $0.00471 | $0.00722 |

这些运行每次都不到 1 美分。费用是先逐次计算，再取中位数。对每个任务，我把每个工具的 3 次运行按总费用排序，各取中间那次来比较。Codex 的输入费用更低，但输出更多，算下来总费用更高。这次测的是开销和默认行为，不构成 benchmark，也不对 agent 的能力排名。

## 项目规则放进 AGENTS.md

我在项目 `AGENTS.md` 里写了一条规则，要求回复以 `ZEBRA-MARKER` 结尾，两个工具都遵守了。把同一行改放进 `CLAUDE.md`，两个工具都没遵守。每种文件和工具的组合只跑了 1 次。

Codex 的结果符合它的[指令文件文档](https://developers.openai.com/codex/guides/agents-md)："Filenames not on this list are ignored for instruction discovery." 要让它读取 `CLAUDE.md`，可以把这个文件名加入 `project_doc_fallback_filenames`。OpenCode 标为 V1 的[规则页面](https://opencode.ai/docs/rules/)列出了 "CLAUDE.md in your project directory (used if no AGENTS.md exists)"。我这次的 2.2.7 没有读取它，与[上一篇对比中的 2.2.5](/zh/blog/opencode-vs-claude-code/) 一致。共用规则放进 `AGENTS.md`。

## Codex vs OpenCode：ChatGPT 登录的补充测试

我用自己的 ChatGPT 账号登录，选 `gpt-6.1-sol`、medium 推理强度，加上 `--sandbox workspace-write`，把同样的 4 个任务各跑了 1 次。4 个都通过了测试，包括任务 4 的隐藏检查。每个任务执行 3–5 条 shell 命令，耗时 17.3–44.9 秒。

这组运行用了我平常的 Codex HOME，里面有全局 `AGENTS.md` 和配置，无法和空 HOME 的运行做受控性能比较。token 计数也没法直接比较，所以没列。

我没跑成 OpenCode 调用 GPT 的测试。它的 [provider 文档](https://opencode.ai/docs/providers/)介绍了 "Sign in with ChatGPT"，需要交互式登录，这条路径我没测。这台机器上的 OpenAI API key 被拒绝了。

## 订阅与价格

按 [Codex 价格页](https://developers.openai.com/codex/pricing)，通过 ChatGPT 套餐使用 CLI，至少需要 Plus（$20/月）。Pro 起价为 $100/月；Business 至少 2 位用户，按年付是 $20/用户/月，按月付是 $25/用户/月。Free（$0）和 Go（$8/月）列出的 Codex 权益只适用于桌面应用。用 API key 就按 token 付费。[Codex CLI 采用 Apache-2.0 许可证](https://github.com/openai/codex)。

[OpenCode 免费，采用 MIT 许可证](https://github.com/anomalyco/opencode)，模型费用付给 provider。它也提供 [OpenCode Go，$10/月](https://opencode.ai/docs/)。

## 复现空操作

把下面的内容保存为 Bash 脚本。脚本用到了 `PIPESTATUS`，需要 OpenCode 2.x、Codex 0.167 或更新版本、`jq`，还要提前导出 `DEEPSEEK_API_KEY`。运行目录及其上级目录都不能有 `AGENTS.md`，否则项目规则也会加进 prompt。

脚本打印的 OpenCode 用量来自主请求，不含标题请求。

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

我的用量输出如下：

```json
{"input":3562,"output":2,"reasoning":0,"cache":{"read":1792,"write":0}}
{"input_tokens":8556,"cached_input_tokens":7808,"cache_write_input_tokens":0,"output_tokens":2,"reasoning_output_tokens":0}
```

OpenCode 的 `step_finish` 用量要把 input 和 cache read 加起来算：主请求共 5,354，不含标题请求。Codex 报告了 8,556 个输入 token。临时目录的路径长度不同，所以这里的数字和表格相差几个 token。

密钥错误或为空时，两个工具的退出码都是 1，也都没有打印用量行。前面那些操作被拦的运行，退出码却都是 0。这次测到的失败情况里，只有认证失败才返回了非零退出码。

## Codex CLI vs OpenCode：我会怎么选

已经付费订阅 ChatGPT，又想让沙箱默认拦住项目外写入和网络访问，我会选 Codex。需要编辑文件时加 `--sandbox workspace-write`，检查结果时别只看退出码。

想用一个模型参数切换 provider，我会选 OpenCode。空操作测试里，它每次模型请求的输入 token 也更少。它拥有当前用户的完整权限，deny 规则可以限制操作。需要操作系统级隔离，就得自己把它放进容器。无论选哪个，都要自己检查 diff 和测试。

## 测试范围

这次只用了一台机器，都在同一天测完，用一个 DeepSeek 模型跑 4 个小任务，每个任务用每个工具各跑 3 次。权限等探测每种设置只跑 1 次。受控对比中的 Codex 没有使用它主要适配的模型，缓存数据也只适用于 DeepSeek 和这批重复运行。没有 OpenCode 调用 GPT 的运行数据。用量计数只适用于这些版本。

## 相关

- [OpenCode vs Claude Code：同样的测试方法](/zh/blog/opencode-vs-claude-code/)
- [Pi coding agent vs OpenCode](/zh/blog/pi-coding-agent-vs-opencode/)
- [Codex YOLO 模式与沙箱设置](/zh/blog/codex-yolo-mode/)
- [Orbi 与 Codex 对比](/zh/compare/codex/)
- [Orbi Cloud](/zh/cloud/?ref=blog-oc-vs-codex)
