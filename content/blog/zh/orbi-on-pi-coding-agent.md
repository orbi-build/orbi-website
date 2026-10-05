---
title: Orbi 跑在 Pi 上：我们在 Pi 编程 agent 外面搭了什么
date: 2026-10-05
summary: Orbi 交付的每张 GitHub issue，写代码的都是 Pi 编程 agent。这篇讲我们怎么调用 Pi、为什么选它，以及 Pi 留给用户自己搭的那一层，我们放在了哪里。
lang: zh
author: Orbi
image: /img/blog-orbi-on-pi-card.png
mirror: orbi-on-pi-coding-agent
---

Orbi 里所有写代码的活都交给 [Pi 编程 agent](https://pi.dev)。我们通过命令行调用 Pi，每张 issue 每个角色单独起一个会话；会话之外的交付流程由 Orbi 的 runner 负责：做哪张 issue、实现和评审分开、什么能合并、定时调度和卡住恢复。Pi 是 Earendil 做的开源项目，MIT 协议（[earendil-works/pi](https://github.com/earendil-works/pi)）；Orbi 不是 Pi 官方项目。

我是 Lawrence Liu，Orbi 的维护者。Orbi 的用法是：给 GitHub issue 打上 `ai-ready` 标签，它交回一个评审过、已合并的 PR；另开一张发版票，它把合并的改动发成带 tag 的版本。从 2026 年 9 月 16 日到 10 月 5 日 11 点（北京时间），Orbi Cloud 的托管 runner 一共合并了 365 个 PR。其中 334 个在 Orbi 自己的三个仓库里（orbi、orbi-cloud、orbi-website），因为 Orbi 的开发本身就交给 Orbi；11 个在我们组织下别人开源项目的 fork 和一个测试仓库里；另外 20 个在别人的 9 个仓库里。这些交付全部跑在 Pi 会话上。

这是讲 Orbi 架构的系列第一篇。先看我们给 Pi 传的命令行，再说为什么选它，最后讲 Pi 留给用户自己搭的那一层，我们放在了哪里。

## Orbi 怎么调用 Pi

Orbi 起的每个 Pi 会话都是一个 `pi --print` 进程。去掉提示词正文，命令行长这样（出自 [`src/orbi/pi_command.py`](https://github.com/orbi-build/orbi/blob/main/src/orbi/pi_command.py)）：

```text
pi [--no-tools] [--no-extensions [--extension <白名单里的扩展>]] \
   --skill <路径> ... \
   [--provider <p>] [--model <m>] [--thinking <级别>] \
   --print --session-dir <本次 run 的目录> \
   --system-prompt <角色提示词> <issue 上下文>
```

会话分三种角色，参数各不相同：

- **实现**：有工具，加载交付用的 skill，用实现模型。在这张 issue 的 worktree 里写计划、改代码、跑测试，最后停在一次 commit 上。
- **评审**：对着 PR 另起一个会话。Orbi 不给它传 `tdd-dev` 和 `review-fix-loop` 这两个 skill，因为它的活是审这一份 diff、把问题修掉，不是再走一遍交付。评审可以换一个模型（`review_pi_provider`、`review_pi_model`），最后必须输出一行 `REVIEW_VERDICT {...}` JSON，由 Orbi 解析。
- **答复**：只在 issue 上作答，不改任何东西。带 `--no-tools`，Orbi 不给它传任何扩展参数，输出就是 Orbi 要贴到 issue 上的那段文字。

`--session-dir` 比我们当初想的重要。每个 run 一个目录，Pi 把会话以 JSONL 写在里面。Orbi 一边读这个文件，一边把进度实时贴到 issue 上（[orbi#24](https://github.com/orbi-build/orbi/issues/24)）。在 Orbi Cloud 上，真正的 `pi` 外面套了一层很薄的包装，每个会话结束后重读这些文件、把 token 用量加起来；Cloud 上每次交付的用量就来自这些汇总，每月的 token 上限也是拿它们来算的。

## 为什么一直用 Pi

Orbi 从 8 月的第一批提交起就在驱动 Pi，当初选它之前并没有写下正式的对比。回头看，让我们留在 Pi 上的有两点。

**模型自己带。** Pi 内置了很多家 provider，还接受一个照它 `models.json` 格式写的 provider 文件，Orbi 靠这个就能接任意 OpenAI 兼容的端点（[orbi#157](https://github.com/orbi-build/orbi/issues/157)）。不绑死某一家模型厂商，是 Orbi 和同类产品的一个重要区别（[orbi#305](https://github.com/orbi-build/orbi/issues/305)）。在我们的 harness 测评里，`deepseek-flash`、`gpt-5.6-luna`、`gpt-5.6-sol` 用的是同一个 runner、同一条 Pi 命令行。

**要的东西都在一条命令上。** skill、provider、模型、思考档位、会话目录、扩展，全是一条 `pi --print` 上的参数。同一轮测评里，我们还试过 Claude Code 跑 Opus 5.5、zcode 跑 GLM 5.3 flash，为了接进来，各写了一座把这条命令行翻译给对方的桥。结果两座桥都悄悄把 skill 丢了，排查后才修好（见 harness 系列[第一篇](/zh/blog/searching-for-orbis-harness/)）。这类问题是翻译层带来的，用 Pi 就没有这一层。

## Pi 留给用户的那一层，Orbi 放在哪

Pi 对自己核心里不做什么说得很直白。它的首页除了已经内置的 MCP，还列了五样：子 agent、权限弹窗、plan 模式、待办、后台 bash，每一样都给了自己补的办法：扩展、第三方包、容器、写文件、tmux（2026 年 10 月 5 日查看）。Orbi 没有给 Pi 加上这些功能，而是在 runner 里，从交付的角度各做了一件对应的事。表格最后一列写的是每件事管到哪里为止。

| Pi 核心里没有的 | Pi 建议的补法 | Orbi 的做法，以及边界 |
|---|---|---|
| 权限弹窗 | 放进容器跑，或者用扩展做确认流程 | 每张 issue 一个独立的 git worktree，从 base 分支冻结的 commit 建出来。实现会话停在 commit，由 runner 推送、开 PR，再由 runner 合并评审通过的那个 head（如果 base 分支在这期间有了新提交、又能无冲突合并，runner 会先把 base 合进来，等这个新 head 的 CI 通过后再合，不会重新评审）。这管的是什么能合并，管不到一次工具调用能碰什么。后者 Pi 自己的[安全文档](https://pi.dev/docs/latest/security)建议靠容器和沙箱。在 Orbi Cloud 上，每个租户的 runner 是一个独立的系统用户，有自己的资源配额，这比 Pi 推荐的容器边界要窄。 |
| 子 agent | 用 tmux 起多个 Pi，或用扩展、第三方包 | runner 按角色起独立的 Pi 会话：实现、评审、答复，各自单独一个会话。它们不是会话内部的子 agent。 |
| plan 模式 | 把计划写进文件，或用扩展、第三方包 | 动代码之前，实现会话先写 `.orbi/plan.md`：目标、看过的上下文、仓库决策、任务、验证命令。会话的上下文被压缩之后，就靠它接上。 |
| 待办 | 写 `TODO.md`，或者用扩展自己做 | 会话之间，GitHub Issues 就是任务队列，`ai-ready` 标签是入口。会话内部，agent 仍然没有待办工具。 |
| 后台 bash | tmux | 在 Orbi 里，agent 同样没有后台 bash。在后台跑的是 runner：systemd 定时器（macOS 上是 launchd）每 5 分钟跑一次，长时间没有输出的会话会被发现并终止（[orbi#94](https://github.com/orbi-build/orbi/issues/94)）。 |

在这些之外，同一个 `run_id` 把日志、issue 评论和 PR 串在一起；Orbi 自己修不了的失败，会把 issue 标成 `ai-blocked`，交给人决定下一步。

### 为什么放在 Pi 外面，而不做成扩展

这些东西大部分都能做成 Pi 扩展，我们没这么做，原因如下。

**合不合并，不能由被评判的会话自己决定。** 如果合并闸门是加载进实现会话的扩展，它跑不跑，就取决于这个会话自己的配置。在 Orbi 里，Pi 会话只产出 commit 和评审结论，什么能合并由 runner 决定。评审会话发现问题可以自己修、推到任务分支，修完之后判定没问题的也是它自己，所以评审和它自己的修改并不完全独立。合并是 runner 的步骤：评审的提示词要求它不要合并，合并由 runner 用 `gh pr merge --match-head-commit` 完成。这是职责分工，不是权限隔离，评审会话带着工具、和 runner 跑在同一个环境里。

**无人值守的会话必须从已知状态起步。** Pi 会加载当前用户装过的所有东西。有一个用户级扩展就曾让我们的 run 在 systemd 下卡死：它启动时发起一个 D-Bus 调用，偶尔一直不返回，会话就一直空等，直到卡住检测把它停掉（[排查见 orbi#311](https://github.com/orbi-build/orbi/issues/311)，[修复见 orbi#249](https://github.com/orbi-build/orbi/issues/249)）。从那以后，实现和评审会话都以 `--no-extensions` 启动，只加回 Orbi 配置里白名单上的扩展。不带工具的答复角色，目前还没有加这个参数。

**换 agent 的时候，这几道关不会跟着走。** worktree、评审、合并闸门都在 runner 里，所以测评里 Claude Code 和 zcode 的桥，跑在和 Pi 完全相同的闸门之下。哪天真要换 agent，这几道关也都还在原处。

10 月 1 日，Earendil 和 Pi 社区发布了 Pi 1.0，一起发布的还有 [Pi Durable](https://earendil.com/posts/pi-durable/)：一个独立的、实验性的 TypeScript 框架，用来写长时间运行的 agent 应用，带子 agent、后台任务、基于 checkpoint 的崩溃恢复和审批 hook。我们估计它不会改变上面的分工。Durable 管的是让一次运行活下来、能恢复；Orbi 的闸门管的是这次运行的产出能不能合并，我们希望它待在 agent 进程之外。Orbi 是 Python 写的，通过命令行驱动 Pi，Durable 我们还没有评估过。

我们并不觉得 Pi 该把这些做进核心。正因为它核心小，我们用一条命令行就够了。

## 如果你也想无人值守地跑 Pi

下面是我们 runner 上踩出来的、Pi 特有的几条。通用的那部分（谁认领任务、谁评审、谁合并、谁发版）在[无人值守地跑 Claude Code](/zh/blog/run-claude-code-unattended/) 里，对 Pi 一样适用。

- **每个 run 一个独立的 `--session-dir`。** 只有它完整记录了 agent 做过什么，token 用量也在里面。
- **从 `--no-extensions` 起步。** 需要什么扩展再显式加。不然你自己账号下装的东西，会被带进一个没人盯着的 run。这个参数也会关掉 Pi 的内置扩展，包括 MCP，用得到的话要加回 `-e builtin:mcp`。
- **skill 按角色分，还要管住自动发现。** 评审会话要是加载了实现那一套流程 skill，它会去「交付」，而不是评审。注意 `--skill` 是在 Pi 从用户目录和项目目录自动发现的 skill 之外再加；要让某个角色看不到某个 skill，还得加 `--no-skills` 或者保证 skill 目录干净。Orbi 目前只过滤了自己显式传入的那部分。
- **provider 和模型写在命令行上。** 不写的话，Pi 会用 settings 里的 `defaultModel`，无人值守的 runner 察觉不到。我们就遇到过：以为 runner 跑的是某个模型，日志一看，跑的是全局默认。
- **盯住长时间没输出的会话。** 卡住的会话不退出，上游也就永远看不到报错。

## 系列接下来写什么

接下来会写：无人值守地跑 Pi 的细节（卡住检测，以及那次 D-Bus 卡死的完整排查）、为什么每张 issue 都在自己的 worktree 里单独起一个 Pi 会话、Orbi 用了哪些 Pi skill。harness 测评已经发了[第一篇](/zh/blog/searching-for-orbis-harness/)和[第二篇](/zh/blog/is-the-regression-guard-worth-its-tokens/)，每次合并交付在 Pi + DeepSeek 上花多少钱也写过：[每个合并 PR 的成本](/zh/blog/deepseek-coding-agent-cost-per-merged-pr/)。

Orbi 开源在 [orbi-build/orbi](https://github.com/orbi-build/orbi)。[Orbi Cloud](https://orbi.build/zh/cloud/?ref=blog-pi) 用的是同一个 runner、同样的 Pi 会话，跑在你自己的仓库上。

## 相关

看看[和 Claude Code 的对比](/zh/compare/claude-code/)和 [Cloud](/zh/cloud/)。
