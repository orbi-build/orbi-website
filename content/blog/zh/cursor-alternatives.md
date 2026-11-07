---
title: Cursor 替代品怎么选：编辑器、后台 agent 与合并发版
date: 2026-11-07
summary: 按 2026 年 11 月 7 日的官方文档，把 Cursor 替代品分成编辑器和后台 agent 两组，比较模型费用、免费与开源边界，以及谁合并、谁发版。文末附一次 Issue 到发版的真实时间线和复查脚本。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-cursor-alternatives-card.png
mirror: cursor-alternatives
---

Cursor 是一款 AI 代码编辑器。挑 Cursor 替代品时，可以比较其他编辑器，也可以看看能接手任务的 agent。先看清 Cursor 在 2026 年 11 月 7 日的[定价](https://cursor.com/pricing)：Plus 每月 8 美元，只能用 Grok 模型；第三方模型要 Premium（每月 30 美元）或更高套餐，或者 Teams，还要按 API 标价另付使用费。这篇按同一天各家的官方文档，把工具分成编辑器或终端里用的一组、交给后台执行的一组，并附一次从 Issue 到发版的真实时间线。

我是 Larry 🍀 Orbi，Orbi 的创始人。

Orbi 也在名单里。这次我没有安装或运行第三方工具，也没有购买 Cursor 的付费套餐，相关比较依据的是官方文档。Orbi 本身不是编辑器：它在后台接手 GitHub Issue，把改动推进到评审、合并和发版，可以和编辑器一起用，不替代 Cursor 的代码补全。

## 找 Cursor 替代品前，先看模型限制

如果换工具是因为想用别的模型，Cursor [定价页](https://cursor.com/pricing)上的套餐限制值得先核一遍。

| Cursor 套餐 | 月费（美元） | 与选型有关的限制或功能 |
|---|---|---|
| Free | 0 | agent 和聊天请求次数有限 |
| Plus | 8 | 只能用 Grok 模型 |
| Premium | 30 | 开放云端 agent、Bugbot 代码评审和第三方模型，第三方模型用量另收费 |
| Super | 100 | 包含 Premium 功能，第三方模型用量仍另收费 |
| Ultra | 200 | 包含 Super 功能，第三方模型用量仍另收费 |
| Teams | 每人 30 起 | 可用云端 agent、Bugbot 和第三方模型 |

表里的订阅费不含第三方模型使用费，也不含适用的税费。比较 Cursor 替代方案的成本时，要把订阅费和模型账单加在一起看。

## 我用哪几个问题来比较

我先看工具把工作接到哪一步，再看费用：

- 你在编辑器、终端里操作，还是把任务交给后台 agent？
- 能用哪些模型，费用走订阅、按量计费，还是自带 API key？
- 它会开拉取请求（PR），还是把这一步留给你？
- 评审过的改动由谁合并，发版由谁发起、谁发布？

## 在编辑器或终端里用的 Cursor 替代品

### GitHub Copilot

[GitHub Copilot](https://github.com/features/copilot/plans) 的 Free 每月有 2,000 次代码补全，Pro 每月 10 美元，Pro+ 每月 39 美元。把任务交给 Copilot 并让它开 PR，要从 Pro 起，Free 不包含这一步。编辑器补全和 GitHub 任务分派都要用时，它能兼顾这两处；云端 agent 的审批限制在后文单列。

### Devin Desktop，原来的 Windsurf

[Devin Desktop](https://devin.ai/desktop) 是 Windsurf 的新名字。官方文档介绍了在本机或 Devin Cloud 中运行会话、切换时保留上下文的用法。[Devin Free](https://devin.ai/pricing) 为 0 美元，提供少量 agent 额度和不限次数的 Tab 补全；Pro 每月 20 美元，增加 Devin Cloud 使用权限。

### Zed

[Zed Personal](https://zed.dev/pricing) 为 0 美元，自带 API key 或使用外部 agent 时不限使用次数，模型供应商的账单另算。Zed 是开源编辑器，Pro 每月 10 美元，含 5 美元的 token 额度。

### Cline

[Cline](https://docs.cline.bot/cline-overview) 有编辑器扩展，也有 CLI 和桌面应用，扩展支持的编辑器包括 Cursor。[源码采用 Apache-2.0 许可](https://github.com/cline/cline)。模型可以走 Cline 按量计费、每月 9.99 美元的 ClinePass，或自带 API key（BYOK）。概览页写的是「Every action requires your explicit approval」，即每个动作都需要你明确批准。想保留 Cursor、又要逐步批准 agent 的每个动作，可以装 Cline。

### Claude Code

[Claude Code](https://code.claude.com/docs/en/overview) 是终端 agent，也提供 VS Code 和 JetBrains 的 IDE 扩展；概览页还有在 Cursor 中安装的链接。大多数使用方式需要 Claude 订阅或 Anthropic Console 账号。账号和工作流的区别见 [Cursor 对比 Claude Code](/zh/blog/cursor-vs-claude-code/)。

## 交给后台执行的几种选择

下面按官方文档列出各工具的交接点。Devin Cloud 的合并和发版归谁，这次尚未确认，表里保留为未确认项。

| 后台工具 | 谁合并，谁发版？ |
|---|---|
| Cursor 云端 agent | 人工合并；托管在 Cursor 自家 Origin 上的仓库，也可以由人批准后让 agent 合并；发版沿用你的流程 |
| Copilot 云端 agent | 由人批准并合并 PR，发版沿用你的流程 |
| Devin Cloud | 这次比较尚未确认合并和发版归谁 |
| Orbi | Orbi 在评审和 CI 通过后合并；人发起发版，Orbi 打 tag 并发布 |

### 先拿 Cursor 自己的云端 agent 作参照

换工具前，可以先比较 [Cursor 云端 agent](https://cursor.com/docs/cloud-agent)。它需要 Premium 或更高套餐，在隔离的云端虚拟机里运行，在单独的分支上工作，再把改动推到仓库交接。

Origin 是 Cursor 自家的代码托管，定价页写作「Code hosting via Origin」，Premium 起提供。如果仓库托管在 Origin 上，agent 可以请求人工批准合并，再合入批准时对应的那一版提交。这是 [2026 年 9 月 7 日当周的云端 agent 更新记录](https://cursor.com/docs/release-notes/cloud-agents)描述的行为，文档没有描述跳过批准直接合并的流程；GitHub 上的仓库，文档写的是推分支交接。只想把执行移出本机、不想离开 Cursor 的话，这条路就够用。

### GitHub Copilot 云端 agent

[Copilot 云端 agent](https://github.com/features/copilot/plans) 从 Pro 起可用。它的[安全文档](https://docs.github.com/en/copilot/concepts/agents/coding-agent/risks-and-mitigations)明确说，它不能批准或合并 PR。

默认情况下，需要一个有仓库写入权限的人评审代码，再点击「Approve and run workflows」，工作流才会运行。让 Copilot 创建这个 PR 的人，不能提交批准该 PR 的评审。如果你希望任务交到 PR 就停下，仓库里也有人能完成这些审批，用它比较顺手。两者的逐项对比见 [Orbi 对比 GitHub Copilot coding agent](/zh/compare/github-copilot-coding-agent/)。

### Devin Cloud

[Devin Cloud 从 Pro 起可用，每月 20 美元](https://devin.ai/pricing)。[Desktop 文档](https://devin.ai/desktop)介绍了本机和云端之间保留上下文、切换会话的用法。Devin 文档写明了哪些、没写哪些，见 [Orbi 对比 Devin](/zh/compare/devin/)。

### Orbi

给 GitHub Issue 打上 `ai-ready` 标签，Orbi 就会运行开源编码 agent [Pi](/zh/guides/pi-coding-agent/) 来实现改动。另开一个没写过这段代码的 Pi 会话做评审。评审和仓库 CI 通过后，Orbi runner（自部署时跑在你的机器上，用 Orbi Cloud 时是托管的 runner）合并评审过的那一版提交。默认没有人在合并前签字；如果分支保护要求人工批准，Orbi 会停在 `ai-awaiting-merge`，并在 Issue 评论里写明需要谁做什么。发版由人在 Issue 评论里输入 `/orbi milestone <version>` 发起，随后 Orbi 创建发版 Issue、打 tag 并发布。

[Orbi](https://github.com/orbi-build/orbi) 在 AGPL-3.0 下开源，自部署软件免费，模型 key 自备。[Orbi Cloud](/zh/cloud/?ref=blog-cursor-alt) 是托管版，月付和年付套餐以那一页为准。

如果你想把 Issue 交出去，让 runner 在评审和 CI 通过后合并，发版时机由自己定，可以用 Orbi。要的是编辑器里的行内补全，Orbi 接不了 Cursor 的这部分工作。

## 找免费或开源的 Cursor 平替，费用怎么算

想找免费的 Cursor 平替，要先看免费套餐包含什么，以及开源软件之外还要付哪些费用。

| 工具 | 免费或开源的部分 | 还要算什么费用 |
|---|---|---|
| [Zed](https://zed.dev/pricing) | 开源编辑器；Personal 为 0 美元，自带 key 或使用外部 agent | 模型费用；Pro 每月 10 美元，含 5 美元 token 额度 |
| [Cline](https://github.com/cline/cline) | Apache-2.0 源码，支持自带 key | 自己 key 的模型用量，或 Cline 的计费选项 |
| [GitHub Copilot Free](https://github.com/features/copilot/plans) | 每月 2,000 次代码补全 | 分派任务创建 PR 需要 Pro 或更高套餐 |
| [Devin Free](https://devin.ai/pricing) | 0 美元套餐，少量 agent 额度，不限次数的 Tab 补全 | Devin Cloud 从每月 20 美元的 Pro 起 |
| [Orbi](https://github.com/orbi-build/orbi) | AGPL-3.0 开源，自部署软件免费，自备模型 key | 模型用量，或 [Orbi Cloud](/zh/cloud/?ref=blog-cursor-alt) 套餐 |

## 怎么选

- 写代码时需要补全，先比较 Copilot、Devin Desktop 和 Zed。
- 想保留现有编辑器、换一个 agent，可以看 Cline 或 Claude Code 的 IDE 扩展，包括装在 Cursor 里使用。
- 想把任务交给后台，比较 Cursor 云端 agent 和 Copilot 云端 agent。Devin Cloud 适合本机与云端切换会话，但合并和发版归属仍未确认。
- 想让 runner 在评审和 CI 后合并，等你发出发版命令再发布，可以看 Orbi。

## 一次从 Issue 到发版的真实交付记录

[orbi-build/orbi#2123](https://github.com/orbi-build/orbi/issues/2123) 要求 Orbi 停止向它交付的仓库更新 GitHub Actions 变量 `ORBI_ACTIVE_MILESTONE`。改动进入 [PR #2124](https://github.com/orbi-build/orbi/pull/2124)，并随 [v0.7.38](https://github.com/orbi-build/orbi/releases/tag/v0.7.38) 发布。下表全部是 2026 年 11 月 6 日的 UTC 时间。

| 步骤 | UTC 时间 | 执行者 |
|---|---|---|
| 创建 Issue #2123 | 00:03:43 | xqliu |
| 打上 `ai-ready` | 00:03:45 | xqliu |
| 认领 Issue（`ai-in-progress`） | 00:06:34 | orbi-build[bot] |
| 创建 PR #2124 | 00:50:00 | app/orbi-build |
| 合并 PR #2124 | 01:05:15 | app/orbi-build |
| 在 Issue #2125 输入 `/orbi milestone v0.7.38` | 02:52:01 | xqliu |
| 创建发版 Issue #2126 | 02:56:25 | app/orbi-build |
| 发布 v0.7.38 | 03:11:32 | orbi-build[bot] |

`app/orbi-build` 和 `orbi-build[bot]` 是 GitHub 对同一个 Orbi GitHub App 的两种写法。

换成北京时间，都是 2026 年 11 月 6 日：08:03:45 打标签，09:05:15 合并，10:52:01 输入发版命令，11:11:32 发版。

从 `ai-ready` 标签算起，2 分 49 秒后 Issue 被认领，46 分 15 秒后开出 PR，61 分 30 秒后合并。合并约 1 小时 47 分钟后，人才在 #2125 的评论里输入发版命令；#2125 是 Orbi 开出来请人确认下一个里程碑的 Issue。记录里看不出这段间隔为什么这么长。从输入命令到发布完成，花了 19 分 31 秒。

[Issue 上的合并评论](https://github.com/orbi-build/orbi/issues/2123#issuecomment-6673829957)记录的评审结果是「pass, no findings」，1 轮通过，没有发现问题。PR 的 CI 检查均通过：[tests 用时 6 分 31 秒](https://github.com/orbi-build/orbi/actions/runs/42139673204/job/127636550350)、[macos-compatibility 用时 6 分 51 秒](https://github.com/orbi-build/orbi/actions/runs/42139673569/job/127636551517)、[link 用时 4 秒](https://github.com/orbi-build/orbi/actions/runs/42139672848/job/127636552151)。

这个 PR 改了 19 个文件，新增 230 行、删除 308 行。源码只在 `src/orbi/` 下 5 个文件里新增 7 行、删除 77 行，其余是测试、一个 CI 故障分诊工具，以及中英两版文档。它不能当成平均耗时，也不能用来预测另一个任务。

要从 GitHub 复查这条时间线，把下面的脚本存成文件，用 bash 运行。需要先登录 GitHub CLI，输出时间为 UTC。

```bash
#!/usr/bin/env bash
# Print the Issue -> PR -> release timeline of one Orbi delivery (UTC timestamps from GitHub).
set -euo pipefail
R=orbi-build/orbi
gh issue view 2123 -R $R --json number,title,author,createdAt,closedAt \
  -q '"issue  #\(.number) opened \(.createdAt) by \(.author.login) closed \(.closedAt) | \(.title)"'
gh api "repos/$R/issues/2123/events" --paginate \
  -q '.[] | select(.event=="labeled") | "label  \(.label.name) \(.created_at) by \(.actor.login)"'
gh pr view 2124 -R $R --json number,author,createdAt,mergedAt,mergedBy,headRefOid \
  -q '"pr     #\(.number) opened \(.createdAt) by \(.author.login) merged \(.mergedAt) by \(.mergedBy.login)"'
gh api "repos/$R/pulls/2124/reviews" -q '.[] | "review \(.state) \(.submitted_at) by \(.user.login) commit \(.commit_id[0:7])"'
gh issue view 2125 -R $R --json comments \
  -q '.comments[] | select(.body|startswith("/orbi milestone")) | "human  \(.body) \(.createdAt) by \(.author.login) on #2125"'
gh issue view 2126 -R $R --json number,author,createdAt,closedAt \
  -q '"issue  #\(.number) (release task) opened \(.createdAt) by \(.author.login) closed \(.closedAt)"'
gh release view v0.7.38 -R $R --json tagName,publishedAt,author \
  -q '"release \(.tagName) published \(.publishedAt) by \(.author.login)"'
```

这次交付的 PR reviews 查询没有输出，因为 Orbi 把评审结论写在 Issue 评论里。空结果不代表跳过了独立评审会话。如果查询的 Issue 不存在，`set -euo pipefail` 会让脚本以非零状态退出。

## 相关

- [Orbi 对比 Cursor](/zh/compare/cursor/)
- [Cursor 对比 Claude Code](/zh/blog/cursor-vs-claude-code/)
- [Orbi Cloud](/zh/cloud/?ref=blog-cursor-alt)
