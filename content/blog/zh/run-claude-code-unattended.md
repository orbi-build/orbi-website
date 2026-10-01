---
title: Claude Code headless 模式只解决了一半：无人值守开发还缺什么
date: 2026-10-01
summary: claude -p 能让 agent 没人看着也跑完一个会话。认领哪张票、谁来评审、什么时候能合并、谁来发版，这些还得自己搭。下面是我们在 Orbi 自己的仓库里一项项踩过的。
lang: zh
author: Orbi
image: /img/blog-headless-card.png
mirror: run-claude-code-unattended
---

让 Claude Code 在没人看着的时候干活，只要一个参数。`claude -p` 就是它的非交互模式（官方文档叫 headless）：跑完一个提示词就退出，失败了返回非零退出码。再加上权限模式，它就不会停下来问你：

```bash
claude -p "Fix the failing test in tests/test_auth.py" \
  --permission-mode auto --permission-prompts none
```

塞进 cron，你睡觉它干活。剩下的参数在 [headless 文档](https://code.claude.com/docs/en/headless)里：`--allowedTools` 预先放行工具，`--output-format json` 给脚本读，`--bare` 让这次运行不加载机器上碰巧装着的 hooks 和 MCP server。

做到这一步，你得到的是一个能自己跑完的会话。它该做哪件事、做完的东西怎么处理，还是你的事。

## cron 回答不了的几件事

Orbi 从 8 月下旬开始无人值守地交付自己仓库里的 Issue。到今天，[仓库](https://github.com/orbi-build/orbi)里有 599 张 Issue 带着 `ai-merged` 标签，最近一次发版是 9 月 30 日的 v0.5.58。下面这些问题，我们基本都是先答错、再改对的。在 `claude -p` 外面套一层循环，一个都答不了。

### 认领哪张票，而且只认领一次

总得有个东西决定下一张做哪张，还要防止两个进程抢同一张。在 Orbi 里，人给 Issue 打上 `ai-ready`。runner 认领时把这个标签换成 `ai-in-progress`，再从一个固定的基线提交建 worktree。紧急的先做，然后是 bug。

每一步都会写回 Issue。队列就是 GitHub 的 Issue 列表，日志就是 Issue 自己的时间线，没有哪条记录只存在于跑任务的那台机器上。

### 用哪个账户跑

`-p` 会话不弹工作区信任对话框。不加 `--bare` 的话，它会执行项目里的 hooks 和 MCP server，哪怕这个目录你从没打开过。没人审批，能挡住它的就只剩它运行时用的那个系统用户。Orbi Cloud 给每个接入的仓库单独开一个 Unix 用户。这件事我们错过一次：写了 1,164 行加固代码，当天下午又撤掉了，经过在 [GitSpawn 那篇](/zh/blog/gitspawn-unattended-agent/)里。

### 谁来评审

写代码的会话自己说「做完了」，等于没人审过。Orbi 另起一个会话，拿 Issue 里的验收项去对照确切的基线提交和头提交，发现问题当场修，最后给出结论。结论和测试数一起贴回 Issue。

### 什么时候能合并

旧提交上跑绿的 CI，说明不了你现在要合的这个提交。所以合并前一刻，Orbi 会再确认四件事：评审结论对应的是 PR 当前的 head，这个 head 包含最新的基线分支，CI 已经跑完，GitHub 显示 PR 可以合并。CI 还在跑，就等下一轮。每一条在[自动合并指南](/zh/guides/auto-merge-ai-prs/)里有详细说明。

这张清单前几天还有个洞。北京时间 9 月 30 日凌晨，我给一张 Issue 打了 `ai-blocked`，还留言说它的 PR 不能合。71 秒后，runner 把它合了。合并闸重读了基线、head 和 CI，唯独没重读 Issue 的标签，评审期间加上的标签它根本看不到。我们回滚了这次合并，开了 [#1504](https://github.com/orbi-build/orbi/issues/1504)：

![GitHub 上的 Issue #1504：维护者打上 ai-blocked 71 秒后 PR 仍被合并的时间线，原因是 merge_gate 从不重读 Issue 标签](/img/headless-1504-bug.webp)

8 小时后，Orbi 认领了这张票，开了 [PR #1505](https://github.com/orbi-build/orbi/pull/1505)，自己的评审没有发现问题，从认领到合并用了 45 分钟。现在合并前会最后读一次标签，Issue 上有 `ai-blocked` 就不合。

![#1504 时间线的后半段：Orbi 开了 PR #1505，一轮评审后合并，标签从 ai-pr-opened 换成 ai-merged](/img/headless-1504-merged.webp)

如果你的循环最后一步是 `gh pr merge`，同样的洞也在。只是要等有人想拦它的时候，你才会发现。

### 失败了怎么办

运行失败是常事，要紧的是失败之后去哪。能自己恢复的，Orbi 把 Issue 转成 `ai-fix-needed`，下一轮接着用同一个分支、同一个 PR，不另开新的。需要人拍板的，就停在 `ai-blocked`，并在 Issue 上写明原因。

9 月 28 日，[#1482](https://github.com/orbi-build/orbi/issues/1482) 的第一轮跑完，一个提交都没有。Orbi 没开空 PR，而是打上 `ai-blocked`，把情况写了出来：

![Issue #1482：Orbi 启动 Pi 之后贴出「Orbi blocked — waiting on a human decision」，说明 agent 没有交付提交，HEAD 仍是冻结的基线](/img/headless-1482-blocked.webp)

我看了一遍，判断票本身没问题，摘掉了标签。第二轮开了 [PR #1491](https://github.com/orbi-build/orbi/pull/1491)，当天合并。一次运行失败，人该做的大概就这么多：读一条评论，做一个决定。

### 谁来发版

PR 合了，没进版本，用户还是用不上。Orbi 里发版也是一张 Issue，打 `ai-release` 标签，写明版本号和里程碑。Orbi 等里程碑里其余的票都关了，发版提交上的 CI 通过后打 tag。这是 v0.5.58 的发版票，#1504 的修复就是随它发出去的：

![Issue #1508「Release v0.5.58」：范围是 v0.5.58 里程碑，Release 段写明版本号、基线分支和版本文件，Orbi 以 ai-in-progress 认领](/img/headless-1508-release.webp)

## 还留给人做的那一步

9 月 25 日，Orbi 给这个网站合了一个[手机端表格的修复](https://github.com/orbi-build/orbi-website/pull/523)。测试检查了每个有表格的页面会不会横向溢出，全部通过。然后我们打开了一张 390px 宽的截图。

![在今天的页面上套回 PR #523 的 CSS，390px 下的 Orbi 与 Devin 价格表：「Free」在「Fre」处断开，「Individual」占了四行](/img/headless-table-before.webp)

这张是复现图：在今天的页面上把 PR #523 的规则套回去截的，所以价格是现在的。

25 个页面上，一共 193 个英文单词被从中间劈开。测试测溢出测得没错，只是没人让它看单词。

我们把量到的数字写进一张新 Issue，Orbi [32 分钟](https://github.com/orbi-build/orbi-website/pull/530)交付了修复：

![orbi.build 今天的同一张表，390px 下：每个套餐叠成一块，单词都是完整的](/img/headless-table-after.webp)

抓住问题的是那张截图，所以留下来的也是这一步：从 beta 推到生产之前，我们会有人在手机和桌面上把改过的页面打开看一遍。agent 做到了票上写的每一条，只是票上没提单词这回事。

## 如果你想继续用 Claude Code

上面这些都可以围着 `claude -p` 自己搭：用标签做队列、给认领加锁、另起一个会话做评审、合并前的检查、失败后的续跑、发版任务。大部分力气会花在处理失败上。Orbi 的 [workflow 文档](https://github.com/orbi-build/orbi/blob/main/docs/workflow.mdx)有八百来行，很大一部分讲的是某一步出错之后怎么办。#1504 就是其中一种，还是前几天人工发现的。

也可以直接用 Orbi。先说清楚，Orbi 不跑 Claude Code，它的 agent 是 [Pi](https://github.com/earendil-works/pi)，模型用 ChatGPT 订阅或 DeepSeek API key，Orbi 自己的交付从 9 月 22 日起一直跑在 DeepSeek 上。如果你离不开 Claude，这是实打实的代价。如果你要的只是一张 Issue 进去、一个评审过并发了版的改动出来，大部分活其实不在模型身上。

[把仓库接入 Orbi Cloud](https://orbi.build/zh/cloud/?ref=blog-headless)，或者自托管[开源 runner](https://github.com/orbi-build/orbi)。

## 相关

继续阅读：[Orbi 与 Claude Code 对比](/zh/compare/claude-code/)、[Claude Code 跑完之后，谁来合并 PR](/zh/blog/claude-code-github-actions-who-merges/) 与 [Cloud](/zh/cloud/)。
