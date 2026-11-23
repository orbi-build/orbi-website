---
title: Pi vs omp（Oh My Pi）：同一模型，无人值守实测
date: 2026-11-23
summary: 同一模型、同一任务，omp 用的 token 是 Pi 的 3.9 倍，按 DeepSeek 标价只贵 1.2 倍。JSON 模式下 API 密钥错误时，Pi 退出码是 0，omp 是 1。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-pi-vs-omp-card.png
mirror: pi-vs-oh-my-pi
series: pi
---

Pi 是一个开源的终端编程 agent，体量很小；omp（Oh My Pi）是它的一个分叉，在里面塞了大量现成功能：默认开 16 个工具（Pi 默认 4 个）、工具调用审批、花费上限、子代理、联网搜索和语言服务器工具。这篇写给想让它们在没人盯着时运行的人：脚本、定时任务、CI，或者 Orbi 这样的交付流水线。2026 年 11 月 23 日，我用同一个模型、同一个任务把两者各跑了一遍，再专门试了没人按键时最要紧的几种出错情况。

先说结论：两边每次都把缺陷修好了。omp 每个任务发出的 token 大约是 Pi 的 3.9 倍，但多出来的大部分命中了缓存，按 DeepSeek 标价算只贵约 1.2 倍。无人值守时更大的差别在出错处理：用 JSON 输出模式时，API 密钥错误或模型名写错，Pi 退出码是 0，omp 是 1。omp 还有审批模式，在单次模式下遇到要审批的操作会直接拒绝，不会卡住，但进程照样以 0 退出。

我是 Larry 🍀 Orbi，Orbi 的创始人。Orbi 每次交付都用上游的 Pi，我手上没有要维护的 omp 配置，这次测试之前也从没跑过 omp。

## omp 在 Pi 之上改了什么

omp 的 README 说它是 Mario Zechner 的 [Pi](https://github.com/badlogic/pi-mono) 的分叉，"重写成以编程为先的形态"，现在由 Stencil Labs 维护。上游 Pi 现在发布为 [`@earendil-works/pi-coding-agent`](https://pi.dev/)。两者都是 MIT 许可。下表取自本次测试版本各自的 `--help`：

| | Pi 1.6.0 | omp 19.1.0 |
|---|---|---|
| 内置工具 | 默认 4 个（read、bash、edit、write）；grep、find、ls 自带但默认关闭 | 默认 16 个，另有 13 个可选 |
| 工具审批 | 没有，每个工具调用都直接执行 | `--approval-mode`：always-ask、always-ask-cached、write、yolo |
| 花费上限 | 没有 | `--max-cost`（单次模式超限退出码 3）、`--warn-cost` |
| 时间上限 | 没有内置 | `--max-time` |
| 无界面入口 | `-p`、`--mode json`、`--mode rpc` | `-p`、`--mode json`、`--mode rpc`、ACP |
| 运行时 | Node | Bun（1.4.4 及以上） |

omp 多出来的工具包括 grep 和 glob、一个能跑 Python 和 JavaScript 的 `eval`、开子代理的 `task`、`web_search`、`lsp`、`ast_edit` 和调试器。想知道哪个在大量任务上代码写得更好，可以看 Composio 用同一模型做的 [30 个任务测评](https://composio.dev/content/pi-vs-omp)，我没有重复它。这篇只看两者自己跑起来时的行为。

## 测试环境

每次运行都新起一个 Docker 容器（`node:22-bookworm`），家目录是空的：没有配置文件、没有 `AGENTS.md`、没有 skill。Pi 1.6.0（11 月 20 日发布）用 npm 安装，omp 19.1.0（11 月 21 日发布）用 Bun 1.4.4 安装。两边都直连 DeepSeek API，关闭思考。我请求的模型名是 `deepseek-v4-flash`；DeepSeek 的[价格页](https://api-docs.deepseek.com/quick_start/pricing)写明这个旧名字现在由 `deepseek-flash`（DeepSeek-V4.1-Flash）处理，所以两边用的是同一个模型。

安装和运行（两边都从 `DEEPSEEK_API_KEY` 读密钥）：

```bash
npm install -g @earendil-works/pi-coding-agent@1.6.0
bun install -g @oh-my-pi/pi-coding-agent@19.1.0
export DEEPSEEK_API_KEY=...   # 你的 DeepSeek 密钥

pi  -p --no-session --provider deepseek --model deepseek-v4-flash --thinking off "$PROMPT" < /dev/null
omp -p --no-session --model deepseek/deepseek-v4-flash --thinking off "$PROMPT" < /dev/null
```

Pi 这里必须加 `--provider deepseek`。只写 `--model deepseek/deepseek-v4-flash` 时，Pi 1.6.0 报这个名字"在多个服务商之间有歧义"（OpenRouter 和 Vercel AI Gateway 都有同名模型），以退出码 1 结束；omp 则把同一个字符串认成 DeepSeek 自己的模型。即使是能跑通的那条 Pi 命令，每次也会打印 `Warning: Model "deepseek-v4-flash" not found for provider "deepseek". Using custom model id.`，因为 Pi 的模型目录里没有这个名字。Pi 照样发出请求，DeepSeek 也照样接受。

任务是一个小 Python 仓库：`slugify()` 没去掉标点，三个单元测试里有两个失败。提示词要求修好 `slugify.py`、不许改测试、结束前自己跑一遍测试。每次运行看三件事：退出码、跑完后 `python3 -m unittest` 是否通过、`git status` 显示改了哪些文件。

## 编程任务的结果

每个工具跑 6 次：3 次文本模式，3 次 JSON 模式（用来读 token 数）。

| | Pi 1.6.0 | omp 19.1.0 |
|---|---|---|
| 测试通过 | 6/6 | 6/6 |
| 改动的文件 | 只有 `slugify.py` | 只有 `slugify.py` |
| 自己跑了测试 | 6/6 | 6/6 |
| 每次耗时 | 4.0–5.0 秒 | 4.7–7.1 秒 |
| 每次平均 token（JSON 模式，3 次） | 10,950 | 42,443 |
| 其中缓存命中 | 9,088 | 40,661 |
| 每次平均花费（DeepSeek 高峰价） | $0.00098 | $0.00117 |

每次的改法实质相同：把任何一串非字母数字字符都当分隔符，不再只按空白切分。多数用的是 `re.findall(r"[a-z0-9]+", ...)`，少数用 `re.split` 按非字母数字切。"自己跑了测试"指我跑测试之前，仓库里已经有 `__pycache__` 目录。

token 的差距来自固定提示词。只让它"回复一个词 OK"，Pi 发了 1,502 个 token，omp 发了 7,839 个，约 5.2 倍，几乎全是系统提示词和工具定义。到了编程任务上，比例是 3.9 倍。

花费差得少，是因为 DeepSeek 对缓存命中只收未命中输入价的 2%（高峰价每百万 0.006 美元对 0.3 美元）。omp 多出来的 token 大多命中了缓存，即使每次都是全新容器也一样，因为缓存在 DeepSeek 服务端。如果全部按未命中算，同样的平均值是 omp 约 0.0131 美元、Pi 约 0.0037 美元，差 3.6 倍。所以实际差多少，取决于你的服务商有多少提示词能命中缓存。

两个工具自报的花费不能直接比。Pi 对第一次运行自报 0.00378 美元，约是上表数字的 4 倍，因为它的目录里没有这个模型名的价格；omp 自报用的是 DeepSeek 的闲时价。上表两列都按 DeepSeek 公布的高峰价算；闲时价两边都减半，比例不变。

## 退出码和出错情况

下面这些出错场景，流水线得在没人时自己处理。除终止信号那一行外，每种情况每个工具各跑一次。

| 情况 | Pi 1.6.0 | omp 19.1.0 |
|---|---|---|
| API 密钥错误，文本模式 | 退出码 1 | 退出码 1 |
| API 密钥错误，JSON 模式 | 退出码 0 | 退出码 1 |
| 模型名不存在，文本模式 | 退出码 1，请求已发出 | 退出码 1，什么都没发 |
| 模型名不存在，JSON 模式 | 退出码 0 | 退出码 1 |
| 标准输入开着但没有数据 | 挂到我设的 60 秒超时（124），没有任何输出 | 挂到超时（124），一直提示在等标准输入 |
| 运行中途收到 SIGTERM（2、3、4 秒；omp 另加 4.5 秒） | 退出码 143 | 退出码 143 |
| `--max-cost 0.000001` | 没有这个参数 | 退出码 3："Cost cap reached" |

JSON 模式那两行最需要在你的封装里处理。Pi 把 401 或 400 错误写进了事件流，退出码却是 0；我上次拿 Pi 1.5.0 和 OpenCode 对比时也是这样，见[那篇](/zh/blog/pi-coding-agent-vs-opencode/#无人值守时的权限与退出码)。用 JSON 模式驱动 Pi 时，要看最后一条消息：这几次运行里它带着 `"stopReason":"error"` 和 `errorMessage`，而退出码是 0。

模型名不存在时，Pi 1.6.0 打出的还是每次都会出现的那条"not found ... Using custom model id"警告，然后照样发请求，由 DeepSeek 拒掉。所以这条警告分辨不出你是不是写错了名字。omp 则在本地直接拒绝："Model ... not found"，并提示用 `omp models find` 查。

两个工具都会一直读管道输入，直到它关闭，所以流水线如果没关掉标准输入，两个都会挂住。omp 至少会说出来："Reading prompt from piped stdin (waiting for EOF; Ctrl+C to abort)"，之后每 10 秒打一行状态；Pi 什么都不打印。Orbi 在 Pi 上踩过这个坑，现在每个会话都把标准输入设成 `/dev/null`（[orbi#1562](https://github.com/orbi-build/orbi/issues/1562)）。

收到 SIGTERM 时，两边都以 143 退出，什么都不回滚。如果信号到来前修改已经写入（Pi 在第 3、4 秒，omp 在第 4.5 秒），改过的 `slugify.py` 就会留在工作区里。进程被杀之后，先检查工作区再复用。

## 没人盯着时 omp 的审批模式

omp 用 `tools.approvalMode` 检查每个工具调用。它的源码注释写着这个设置默认是 `yolo`，也就是全部放行，和我看到的一致：前面那些不加参数的运行都没被拦。我又用更严的模式在单次模式下跑了编程任务：`write` 两次，`always-ask` 四次（文本模式、JSON 模式各两次）。

| 模式 | 发生了什么 | 测试 | 退出码 |
|---|---|---|---|
| 默认（yolo） | 改了文件，也跑了测试 | 通过，6/6 | 0 |
| `--approval-mode write` | 改了 `slugify.py`；所有运行 Python 的途径都被拒 | 我跑时通过，agent 自己没跑成，2/2 | 0 |
| `--approval-mode always-ask` | 只能读文件；修改和命令都被拒 | 失败，什么都没改，4/4 | 0 |

没有一次卡住。每个被拒的调用都以"requires approval but no interactive UI available"返回给模型，并提示去设 `tools.approvalMode` 或在配置里放行这个工具。模型在最后的回答里如实说了被挡住（"Blocked: cannot run or edit anything"），但进程照样以正常的 `stop` 退出，退出码 0。所以在单次模式下，更严的审批模式能用来禁止写文件或执行命令，却不能用来等一个人来批准，而且退出码不会告诉你的脚本这次活被拒了。

Pi 根本没有审批这一步。它的[安全文档](https://pi.dev/docs/latest/security)也这么写；想拦某个工具，要靠扩展或 `--exclude-tools`，OpenCode 那篇里有一个拦 `rm` 的[小扩展](/zh/blog/pi-coding-agent-vs-opencode/#无人值守时的权限与退出码)。两个工具都不是沙箱，无人值守时把它们放进随时可以扔掉的容器或虚拟机里。

## 无人值守该用哪个

如果你已经把 agent 放进沙箱，并且每次运行后都检查测试和改动，那主要看出错处理和提示词大小。

想要现成的安全限制，我会选 omp：有独立退出码的花费上限、时间上限、我测过的两种输出模式下 API 出错都返回非零、能拒绝写入的审批模式，卡在标准输入时还会说出来。代价是固定提示词大得多，你的服务商不缓存的话，这笔钱很明显。

想要最小的提示词、一分钟就能看完的工具面，并且愿意自己补上限制，我会选 Pi：接 `< /dev/null`、设超时、JSON 模式下检查 `"stopReason":"error"`。不管选哪个，都要按测试和改动判断一次运行成没成。这次测试里，两个工具都出现过什么都没做却以 0 退出的情况。

## Orbi 为什么继续用 Pi

我当初[没做比较就选了 Pi](/zh/blog/orbi-on-pi-coding-agent/#为什么一直用-pi)，这次测试也没给我换的理由。omp 为无人值守加的那些东西，Orbi 的流水线自己已经在做：把标准输入设成 `/dev/null`、强制超时、按会话里的实际证据判断结果而不看 Pi 的退出码、每次交付用独立的检出目录。之后再由独立评审和合并门禁决定改动能不能上线。固定提示词小，每一次运行都更省。[Orbi Cloud](/zh/cloud/?ref=blog-pi-vs-omp) 替你跑这条流水线，从 GitHub Issue 一直到合并的 PR 和打好 tag 的版本。

## 局限

一台 Linux 机器、一天、一个模型（DeepSeek V4.1 Flash，关闭思考）、一个小任务。每个工具 6 次编程运行；omp 的严格模式 `write` 2 次、`always-ask` 4 次；每个工具 3 个终止时间点（omp 多一个）；其余每种出错情况各 1 次。这些结果说明不了在难任务上谁写代码更好，那要看 Composio 的测评。omp 的设置远比我碰过的多，默认值也可能随版本变化。版本：Pi 1.6.0、omp 19.1.0。

## 相关

[Pi 和 OpenCode 对比](/zh/blog/pi-coding-agent-vs-opencode/)、[Pi 和 Claude Code 对比](/zh/blog/pi-coding-agent-vs-claude-code/)、[Pi 编程 agent 指南](/zh/guides/pi-coding-agent/)和[好用的 Pi 扩展](/zh/blog/best-pi-extensions/)覆盖了 Pi 这一侧的其余内容。[Orbi 对比页](/zh/compare/)和 [Orbi Cloud](/zh/cloud/?ref=blog-pi-vs-omp) 介绍了基于 Pi 的交付流水线。
