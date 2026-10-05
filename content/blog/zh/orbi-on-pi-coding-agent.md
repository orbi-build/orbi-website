---
title: Orbi 跑在 Pi 上：我们在 Pi 编程 agent 外面搭了什么
date: 2026-10-05
summary: Orbi 交付的每张 GitHub issue，写代码的都是 Pi 编程 agent。这篇讲我们怎么调用 Pi、为什么选它，以及 Pi 留给用户自己搭的那一层，我们放在了哪里。
lang: zh
author: Orbi
image: /img/blog-orbi-on-pi-card.png
mirror: orbi-on-pi-coding-agent
---

Orbi 里所有写代码的活都交给 [Pi 编程 agent](https://pi.dev)。我们通过命令行调用 Pi，一件活起一个会话。Pi 刻意没放进核心的那些东西，比如审批、子 agent、计划、任务列表、长时间运行的任务，由 Orbi 自己的代码负责。Pi 是 Earendil 做的开源项目，MIT 协议；Orbi 不是 Pi 官方项目。

我是 Lawrence Liu，Orbi 的维护者。Orbi 的用法是：给 GitHub issue 打上 `ai-ready` 标签，它交回一个评审过、已合并的 PR；另开一张发版票，它把合并的改动发成带 tag 的版本。2026 年 9 月 16 日到 10 月 5 日（北京时间），Orbi Cloud 的托管 runner 一共合并了 365 个 PR。其中 345 个在我们自己的 11 个仓库里，Orbi 的代码大部分是 Orbi 自己交付的；另外 20 个在别人的 9 个仓库里。这些交付全部跑在 Pi 会话上。

这是讲 Orbi 架构的系列第一篇。先看我们给 Pi 传的命令行，再说为什么选它，最后讲 Pi 留给用户自己搭的那一层，我们放在了哪里。

## Orbi 怎么调用 Pi

Orbi 起的每个 Pi 会话都是一个 `pi --print` 进程。去掉提示词正文，命令行长这样（出自 [`src/orbi/pi_command.py`](https://github.com/orbi-build/orbi/blob/main/src/orbi/pi_command.py)）：

```text
pi [--no-tools] --no-extensions [--extension <白名单里的扩展>] \
   --skill <路径> ... \
   --provider <p> --model <m> [--thinking <级别>] \
   --print --session-dir <本次 run 的目录> \
   --system-prompt <角色提示词> <issue 上下文>
```

会话分三种角色，参数各不相同：

- **实现**：有工具，加载交付用的 skill，用实现模型。在这张 issue 的 worktree 里写计划、改代码、跑测试，最后停在一次 commit 上。
- **评审**：对着 PR 另起一个会话。它不加载 `tdd-dev` 和 `review-fix-loop` 这两个 skill，因为它的活是审这一份 diff、把问题修掉，不是再走一遍交付。评审可以换一个模型（`review_pi_provider`、`review_pi_model`），最后必须输出一行 `REVIEW_VERDICT {...}` JSON，由 Orbi 解析。
- **开票**：只在 issue 上回答问题，不改任何东西。带 `--no-tools`、不加载扩展，输出就是 Orbi 要贴到 issue 上的那段文字。

`--session-dir` 比我们当初想的重要。每个 run 一个目录，Pi 把会话以 JSONL 写在里面。Orbi 一边读这个文件，一边把进度实时贴到 issue 上（[orbi#24](https://github.com/orbi-build/orbi/issues/24)）。在 Orbi Cloud 上，真正的 `pi` 外面套了一层很薄的包装，每个会话结束后重读这些文件、把 token 用量加起来；Cloud 上每次交付的用量和每月的 token 上限，都从这里来。

## 为什么是 Pi

有记录可查的理由有两条。

**模型自己带。** Pi 内置了很多家 provider，还接受一个照它 `models.json` 格式写的 provider 文件，Orbi 靠这个就能接任意 OpenAI 兼容的端点（[orbi#157](https://github.com/orbi-build/orbi/issues/157)）。不绑死某一家模型厂商，是 Orbi 和同类产品的一个重要区别（[orbi#305](https://github.com/orbi-build/orbi/issues/305)）。在我们的 harness 测评里，`deepseek-flash`、`gpt-5.6-luna`、`gpt-5.6-sol` 用的是同一个 runner、同一条 Pi 命令行。

**命令行小到可以当接口用。** Orbi 需要的东西，全都是一条 `pi --print` 上的参数。同一轮测评里，我们还试过 Claude Code 跑 Opus 5.5、zcode 跑 GLM 5.3 flash。要把它们接进来，得各写一个"模仿 Pi 命令行"的桥。结果两座桥都悄悄把 skill 丢了，排查后才修好（见 harness 系列[第一篇](/zh/blog/searching-for-orbis-harness/)）。Pi 的 `--skill` 是原生参数，不存在丢不丢的问题。

## Pi 留给用户的那一层，Orbi 放在哪

Pi 对自己核心里不做什么说得很直白。它的首页列了五样：子 agent、权限弹窗、plan 模式、待办、后台 bash，每一样都给了自己补的办法：扩展、第三方包、容器、写文件、tmux（2026 年 10 月 5 日查看）。这五样 Orbi 都补上了，只是放在 Pi 外面，放在 runner 里。

| Pi 核心里没有的 | Pi 建议的补法 | Orbi 放在哪 |
|---|---|---|
| 权限弹窗 | 放进容器跑，或者用扩展做确认流程 | 每张 issue 一个独立的 git worktree，从冻结的 `origin/main` commit 建出来。实现会话停在 commit，由 runner 推送、开 PR。只有评审过的那个 head 能合并，任何 agent 都不推保护分支。 |
| 子 agent | 用 tmux 起多个 Pi，或用扩展、第三方包 | runner 按角色起独立的 Pi 会话：实现、独立评审、开票。 |
| plan 模式 | 把计划写进文件，或用扩展、第三方包 | 实现会话第一步写 `.orbi/plan.md`：目标、看过的上下文、任务、验证命令。评审会去读它。 |
| 待办 | 写 `TODO.md`，或用扩展、第三方包 | GitHub Issues 就是任务队列，`ai-ready` 标签是入口。 |
| 后台 bash | tmux | systemd 定时器（macOS 上是 launchd）每 5 分钟跑一次。长时间没有输出的会话会被发现并终止（[orbi#94](https://github.com/orbi-build/orbi/issues/94)）。 |

在这些之外，同一个 `run_id` 把日志、issue 评论和 PR 串在一起；Orbi 自己修不了的失败，会把 issue 标成 `ai-blocked`，交给人决定下一步。

### 为什么放在 Pi 外面，而不做成扩展

这些东西大部分都能做成 Pi 扩展，我们没这么做，原因有三条。

**检查不能长在被检查的东西里面。** 如果合并闸门和评审是加载进实现会话的扩展，它们跑不跑，就取决于这个会话自己的配置。在 Orbi 里，Pi 会话只产出 commit 和评审结论；PR 合不合，由 runner 决定，而它读的结论来自一个实现会话碰不到的独立会话。

**无人值守的会话必须从已知状态起步。** Pi 会加载当前用户装过的所有东西。有一个用户级扩展就曾让我们的 run 在 systemd 下卡死：它启动时发起一个 D-Bus 调用，偶尔一直不返回，会话就一直空等，直到空转检测把它判死（[orbi#249](https://github.com/orbi-build/orbi/issues/249)）。从那以后，每个会话都以 `--no-extensions` 启动，只加回 Orbi 配置里白名单上的扩展。

**换引擎，流程不丢。** worktree、评审、合并闸门都在 runner 里，所以测评里 Claude Code 和 zcode 的桥，跑在和 Pi 完全相同的闸门之下。哪天真要换 agent，这些控制也都还在原处。

我们并不觉得 Pi 该把这些做进核心。它的核心小，我们的 runner 才能用一条命令行把它驱动起来。

## 如果你也想无人值守地跑 Pi

下面是我们 runner 上踩出来的、Pi 特有的几条。通用的那部分（谁认领任务、谁评审、谁合并、谁发版）在[无人值守地跑 Claude Code](/zh/blog/run-claude-code-unattended/) 里，对 Pi 一样适用。

- **每个 run 一个独立的 `--session-dir`。** 只有它完整记录了 agent 做过什么，token 用量也在里面。
- **从 `--no-extensions` 起步。** 需要什么扩展再显式加。不然你自己账号下装的东西，会被带进一个没人盯着的 run。
- **skill 按角色分。** 评审会话要是加载了实现那一套流程 skill，它会去"交付"，而不是评审。
- **provider 和模型写在命令行上。** 不写的话，Pi 会悄悄退回到 settings 里的默认模型，不报错。我们就遇到过：以为 runner 跑的是某个模型，日志一看，跑的是全局默认。
- **盯住长时间没输出的会话。** 卡住的会话不会失败，只会一直挂着。

## 系列接下来写什么

接下来会写：无人值守地跑 Pi 的细节（卡住检测，以及那次 D-Bus 卡死的完整排查）、为什么每张 issue 都在自己的 worktree 里单独起一个 Pi 会话、Orbi 用了哪些 Pi skill。harness 测评已经发了[第一篇](/zh/blog/searching-for-orbis-harness/)和[第二篇](/zh/blog/is-the-regression-guard-worth-its-tokens/)。

Orbi 开源在 [orbi-build/orbi](https://github.com/orbi-build/orbi)。[Orbi Cloud](https://orbi.build/zh/cloud/?ref=blog-pi) 用的是同一个 runner、同样的 Pi 会话，跑在你自己的仓库上。

## 相关

看看[和 Claude Code 的对比](/zh/compare/claude-code/)和 [Cloud](/zh/cloud/)。
