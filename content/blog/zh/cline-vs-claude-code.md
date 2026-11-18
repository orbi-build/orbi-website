---
title: Cline vs Claude Code：用同一模型测试无人值守运行
date: 2026-11-18
summary: Cline vs Claude Code 接入同一 DeepSeek 模型，实测无人值守命令、默认权限、退出码、token 用量与价格，附复现步骤。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-cline-vs-claude-code-card.png
mirror: cline-vs-claude-code
---

Cline 是[采用 Apache-2.0 许可的开源编程 agent](https://github.com/cline/cline/blob/main/LICENSE)，有 VS Code 扩展和命令行；Claude Code 是 [Anthropic 的终端编程 agent](https://code.claude.com/docs/en/headless)。这次 Cline vs Claude Code 实测中，我让两者接入同一个 DeepSeek 模型，修复同一份测试失败的代码。你若准备在脚本里调用它们，或让它们无人值守运行，可以用下面的命令复现这个任务。这里测的是无头运行，也就是不开交互界面。

我是 Larry 🍀 Orbi，Orbi 的创始人。Orbi 用开源 agent Pi 从 GitHub Issue 开始实现任务，之后经过独立评审再合并 PR。它不运行 Cline 或 Claude Code。

## Cline vs Claude Code 一览

| 你的需求 | 先看哪款 | 要确认什么 |
|---|---|---|
| 在 VS Code 和命令行里使用开源 agent | Cline | 模型服务商配置和工具审批 |
| 使用 Claude 套餐包含的终端 agent | Claude Code | 套餐是否支持、用量额度是多少 |
| 默认自动批准工具调用 | Cline CLI | 单次运行会自动批准工具 |
| 需要逐项放行工具调用 | Claude Code | 设置权限模式，放行任务需要的工具 |
| 让脚本验证修复结果 | 两者都可以 | 检查 diff，并独立跑测试 |

下文的实测走 DeepSeek API 计费，不使用 Claude 订阅提供的模型和额度。在这一个小任务上，只要权限允许，两者都修好了 bug。要比较编辑器，可以看 [Cursor vs Claude Code](/zh/blog/cursor-vs-claude-code/)。

## 测试任务与复现命令

测试日期是 2026 年 11 月 18 日，环境为 Linux、Node `v22.23.1`、Claude Code `2.1.322` 和 Cline CLI `3.0.74`。两者都使用 `deepseek-flash`，DeepSeek 将它标识为 DeepSeek-V4.1-Flash。每次运行都使用隔离的 HOME 和全新的配置目录，避免已有指令和权限设置影响结果。

测试用的是只有三个文件的 Node 仓库。`npm test` 执行 `node --test`，最初四项测试中有两项失败：函数逐个替换分隔字符，没有把连续分隔符合并，也没有去掉首尾的连字符。

复现时，把下面三个文件放进临时工作副本，提交测试失败的初始版本，每次尝试都从这个版本开始。下面的命令会使用你已安装的版本和用户设置；比较默认行为时，要用上面列出的版本，并从全新设置开始。

`package.json`：

```json
{"name":"slug-fixture","version":"1.0.0","type":"module","scripts":{"test":"node --test"}}
```

`src/slug.js`：

```js
export function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "-");
}
```

`test/slug.test.js`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/slug.js";

test("basic", () => assert.equal(slugify("Hello World"), "hello-world"));
test("collapses runs", () => assert.equal(slugify("Cline  vs -- Claude Code"), "cline-vs-claude-code"));
test("trims edges", () => assert.equal(slugify("  Hi! "), "hi"));
test("empty", () => assert.equal(slugify(""), ""));
```

### Claude Code 接入 DeepSeek

装好 Claude Code 后，我通过 [DeepSeek 兼容 Anthropic 的接口](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code)调用模型，并用下面的设置固定模型。运行前替换引号里的密钥占位符：

```bash
export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
export ANTHROPIC_AUTH_TOKEN="<your DeepSeek API key>"
export ANTHROPIC_MODEL=deepseek-flash
export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-flash
claude -p "The tests fail. Fix the bug in src/slug.js so that npm test passes. Do not change the tests." \
  --permission-mode acceptEdits \
  --allowedTools "Bash(npm test)" \
  --output-format json
```

### Cline CLI 接入 DeepSeek

给 Cline 设置同一个 DeepSeek 密钥，然后运行：

```bash
npm install -g cline
export DEEPSEEK_API_KEY="<your DeepSeek API key>"
cline -P deepseek -k "$DEEPSEEK_API_KEY" -m deepseek-flash --json \
  "The tests fail. Fix the bug in src/slug.js so that npm test passes. Do not change the tests."
```

[Cline CLI 文档](https://docs.cline.bot/usage/cli-overview)说，传入 `--json`、通过管道输入 stdin 或重定向输出，都会启用无头模式。它的 JSON 输出是事件流。

无论用哪个 agent，结束后都自己运行：

```bash
git status --short && npm test && git diff --name-only
```

预期只有 `src/slug.js` 改动，测试文件没动，四项测试全部通过。退出码 0 本身不能证明修复已经写进文件。

## 没人审批时的默认权限

在脚本里比较 Claude Code vs Cline，我这几次运行里差别最大的是默认权限。[Claude Code 权限文档](https://code.claude.com/docs/en/permission-modes)写明，从 `v2.1.302` 起，`claude -p` 不指定权限模式时会进入 Manual 模式。需要审批的调用会被拒绝，除非另有机制放行。

[Cline CLI README](https://github.com/cline/cline/blob/main/apps/cli/README.md)则说，单次运行使用 yolo 模式，默认自动批准工具调用。无人值守运行时没人处理审批提示，这些默认设置会影响工具能不能调用、任务能不能完成。

下表全部使用上面的修复提示词。耗时是从启动到结束的实际时间，编号表示不同次尝试。

| 配置 | 运行编号与耗时 | 进程结束后的结果 | 退出码 |
|---|---|---|---|
| Claude Code，不指定权限模式 | E1a: 45.7s; E1b: 82.9s | 没改文件，仍有两项测试失败 | 0 |
| Claude Code，`acceptEdits`，允许 `Bash(npm test)` | E3: 7.8s; E14: 10.5s | 只改源码，4/4 通过 | 0 |
| Claude Code，`dontAsk`，允许 `Read,Edit,Bash(npm test)` | E4: 8.4s | 只改源码，4/4 通过 | 0 |
| Cline，默认审批设置 | E2a: 10.1s; E2b: 9.8s; E15: 10.7s | 只改源码，4/4 通过 | 0 |
| Cline，`--auto-approve false` | E5 | 工具被拦，测试没修好，运行中止 | 0 |
| Cline，`--plan` | E8 | 没有文件改动 | 0 |

Claude Code 的两次默认运行分别记录了 9 次和 16 次权限拒绝，尝试过的 Edit、Write 和 Bash 调用全部被拒绝。它在回答里写出了正确修复，但文件没有变化，JSON 仍报告 `is_error: false`。

关掉自动批准后，Cline 提示要在 TTY 会话，也就是交互式终端里批准工具调用。它随后发出了提问，但当时没有人能回答。下面是 Claude Code 和 Cline 未完成修复时各自的结果字段：

```text
Claude Code E1a: "is_error": false
Cline E5: "type": "run_result", "finishReason": "aborted"
```

前面的 Claude Code 命令用 `acceptEdits` 放行文件编辑，再单独批准测试命令。放进 CI 时，我会用文档中的 `dontAsk` 模式，明确列出允许的工具；需要审批却没有获准的调用会被拒绝。下面这条也通过了测试：

```bash
claude -p "The tests fail. Fix the bug in src/slug.js so that npm test passes. Do not change the tests." \
  --permission-mode dontAsk \
  --allowedTools "Read,Edit,Bash(npm test)" \
  --output-format json
```

[Claude Code 无人值守运行指南](/zh/blog/run-claude-code-unattended/)里有运行进程的方法。`bypassPermissions` 和 `--dangerously-skip-permissions` 只在隔离容器中使用；[Claude Code yolo mode](/zh/blog/claude-code-yolo-mode/)解释了放宽这些权限的含义。

我还问了 `Why does npm test fail in this repo?`，也就是「这个仓库的 npm test 为什么失败？」。两者在默认设置下都没改文件。Claude Code 的三次测试调用被拒绝，靠读代码给出了诊断；Cline 则跑了测试再诊断。两者退出码都是 0。Cline 的自动批准允许编辑文件，但这条只问原因的提示词没有让它动手改。

### 密钥错误时，失败耗时不同

| DeepSeek 密钥写错 | 错误 | 实际耗时 | 退出码 |
|---|---|---|---|
| Claude Code | `Failed to authenticate. API Error: 401` | 178.5s，包含重试 | 1 |
| Cline | `Authentication Fails` | 1.2s | 1 |

脚本要自行判断是否超时：这两次失败的耗时差得很大。

## 同一模型下的 token 用量

这里统计的只是同一个小任务：Cline 使用默认设置成功运行了三次，Claude Code 使用 `acceptEdits` 成功运行了两次，样本不足以作为基准测试。

| Agent | 输入 token，包含缓存读取 | 其中的缓存输入 | 输出 token |
|---|---|---|---|
| Cline，E2a/E2b/E15 | 33,588 至 42,217 | 25,856 至 34,304 | 849 至 959 |
| Claude Code，E3/E14 | 59,710 至 74,426 | 46,976 至 61,184 | 655 至 783 |

Claude Code 的输入总量是我把 `input_tokens` 和缓存读取 token 相加得到的：E3 为 12,734 + 46,976，E14 为 13,242 + 61,184。Cline 的 `inputTokens` 已经包含缓存读取，再加一次会重复计算。

在同样的隔离环境里，提示词只有 `reply ok` 时，Claude Code 用了 11,162 个输入 token，Cline 用了 5,325 个。请求本身很短，agent 仍会带上自己的上下文。Cline 在这次测试里的输入用量较少；换成大仓库，需要重新测。

## 价格与模型账单

我在 2026 年 11 月 18 日核对了这些价格。比较时，要分清工具怎么收费、调用模型又花多少。

| 使用方式 | 价格与权限 |
|---|---|
| [Cline 个人使用](https://cline.bot/pricing) | 软件免费，模型推理按用量付费，也可用自己的模型服务商密钥 |
| [ClinePass](https://docs.cline.bot/) | 可选的固定订阅，每月 $9.99；本次没测 |
| [Cline Enterprise](https://cline.bot/pricing) | 定制报价 |
| [Claude Free](https://claude.com/pricing) | 不包含 Claude Code |
| [Claude Pro](https://claude.com/pricing) | 月付每月 $20；年付折合每月 $17；包含 Claude Code |
| [Claude Max / Ultra](https://claude.com/pricing) | Max 每月 $100 起；Ultra 每月 $200；包含 Claude Code |
| Claude Code 使用 API 密钥或网关 | 由对应渠道按用量计费；本次用的是 DeepSeek |

[Claude Code 价格说明](/zh/blog/claude-code-pricing/)介绍了订阅和 API 两种方式。

[DeepSeek 的 `deepseek-flash` 标价](https://api-docs.deepseek.com/quick_start/pricing)如下，单位是美元/百万 token：

| Token 类别 | 非高峰 | 高峰 |
|---|---|---|
| 缓存命中输入 | $0.003 | $0.006 |
| 缓存未命中输入 | $0.15 | $0.30 |
| 输出 | $0.60 | $1.20 |

高峰时段为周一至周五的 UTC 01:00–04:00 和 06:00–10:00，中国法定节假日除外；其余时间，包括周末和这些节假日，都是非高峰。我运行的时间约为周三 UTC 02:00，处在高峰时段。

Claude Code 在 E14 的 `total_cost_usd` 里报了约 $0.081，同时输出 `[claude-code:unrecognized_model]`。它按 Anthropic 价格计算这个未识别的模型，用第三方模型时应忽略这个费用字段。Cline 给 E15 报了约 $0.0018，和按 DeepSeek 非高峰标价算出的数一致。两者自报费用的计价口径不同，没法据此算出实际扣款的比例。

按上面的 token 数和高峰标价计算，E14 约 $0.0053（13,242 × $0.30 + 61,184 × $0.006 + 783 × $1.20，再除以一百万），E15 约 $0.0035（7,732 个未缓存输入 × $0.30 + 25,856 × $0.006 + 849 × $1.20，再除以一百万）。DeepSeek 账户余额显示到 0.01 CNY，我在每次运行结束 20 秒后检查，余额都没有变化，因此没能从账户确认实际扣款。

## Cline vs Codex

我还在同一份测试代码上跑了 Codex CLI `0.167.0`，通过 ChatGPT 登录，使用它默认的 `gpt-6.2-sol`。模型不同，这里不比较 token 用量。

```bash
codex exec "The tests fail. Fix the bug in src/slug.js so that npm test passes. Do not change the tests."
```

全新配置下，默认沙箱是只读，审批策略为 `never`。这次没改任何文件，耗时 28 秒，退出码 0。允许写入工作区后，15 秒修好了源码，四项测试全部通过：

```bash
codex exec -s workspace-write "The tests fail. Fix the bug in src/slug.js so that npm test passes. Do not change the tests."
```

同一个任务，Cline 的默认单次运行不用加额外参数，自动批准工具后就修好了 bug，4/4 通过；Codex 默认没有改动，直到我允许写入工作区才完成修复。还没亲眼看过脚本怎么跑之前，Codex 的只读默认设置更稳妥。两者在没有改动文件时也返回过 0，脚本还得检查文件。[OpenCode vs Codex](/zh/blog/opencode-vs-codex/)是另一组无头运行对比；额度问题见 [Codex 用量限制](/zh/blog/codex-usage-limits/)。

## Orbi 能接哪部分工作

Cline 和 Claude Code 都能在你写代码时帮忙，也能放进你自己配置的自动化里。例如 [Cline 支持定时运行](https://github.com/cline/cline/blob/main/apps/cli/README.md)，命令是 `cline schedule create ... --cron`。PR 由谁评审、谁合并，仍要自己配置。

Orbi 从打了 `ai-ready` 标签的 GitHub Issue 开始，用 Pi 实现，由独立会话评审，评审通过且 CI 全绿后合并。

在 Claude Code 里，[Orbi 插件](https://github.com/orbi-build/orbi/blob/main/integrations/claude-plugin/README.md)提供 `/orbi:ship`，把当前任务写成 Issue。在由 Orbi 交付的仓库里，它会在确认后加上 `ai-ready`。`/orbi:status` 用来查状态。

Cline 这边，我验证了下面的 skill 安装命令：

```bash
cline skill add orbi-build/orbi --skill write-ai-ready-issue -y
```

它把 `write-ai-ready-issue` 复制到 `./.agents/skills/write-ai-ready-issue`，这是 skills CLI 安装 Cline skill 时使用的目录。装好后，可以让 Cline 用它把任务写成 Issue。我只检查了安装是否成功，没有测试完整的 Cline 到 Orbi 交付流程。按插件说明，这份 skill 也能在 Codex、Copilot 和 Cursor 中加载；`/orbi:` 命令则只在 Claude Code 和 Cursor 中加载。[Orbi 对比 Claude Code](/zh/compare/claude-code/)介绍了交接方式；想让 agent 实时陪你写代码时，Orbi 并不适合。

## 相关

- [Cursor vs Claude Code：工作方式、套餐与用量](/zh/blog/cursor-vs-claude-code/)
- [OpenCode vs Codex CLI：同一模型，无头运行实测](/zh/blog/opencode-vs-codex/)
- [Claude Code 无人值守运行指南](/zh/blog/run-claude-code-unattended/)
- [Orbi 对比 Claude Code](/zh/compare/claude-code/)
- [Orbi Cloud](/zh/cloud/?ref=blog-cline-vs-cc)
