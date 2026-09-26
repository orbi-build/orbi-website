---
title: GitSpawn 绕开的是审批，我们的 agent 本来就不审批
date: 2026-09-26
summary: GitSpawn 让七个编程 agent 在审批弹窗之前就执行了程序。Orbi 没有审批这一步，我们写了修复，查清是谁在跑 git，当天又撤了。
lang: zh
author: Orbi
image: /img/blog-gitspawn.png
mirror: gitspawn-unattended-agent
---

9 月 1 日，Manifold Security 披露了 [GitSpawn](https://www.manifold.security/blog/ai-coding-agents-git-hijack)，涉及七个编程 agent 的八个问题：Claude Code、Codex、Cursor、Goose、Hermes Agent、Qwen Code 和 Grok Build。简单说，仓库里的 git 配置能让一个程序在 agent 弹出审批之前就跑起来。细节看 Manifold 的原文，好几家已经发了修复。

我在 X 上[发了一条](https://x.com/xqliu/status/2103343487668154834)。回复里大家的意见差不多：agent 的工作区得在循环开始前就确认可信，等到审批 shell 命令时再管，已经晚了。

对我们来说，真正要回答的是：Orbi 受不受影响？我们第二天上午合了一个修复，当天下午又撤了。

## 修复

9 月 25 日我开了 [#1366](https://github.com/orbi-build/orbi/issues/1366)，Orbi 当天就交付了 [PR #1368](https://github.com/orbi-build/orbi/pull/1368)。它让 runner 调用的所有 git 命令都经过同一个函数，把披露里点名的那几项 git 设置关掉，再加一条检查：哪段代码绕开这个函数直接调 git，构建就失败。改了 26 个文件，加了 1164 行。

![PR #1368：加固修复，已合并](/img/gitspawn-fix-pr.png)

## 回滚

3 小时 50 分钟后，我用 [PR #1376](https://github.com/orbi-build/orbi/pull/1376) 把它回滚了。

![PR #1376：回滚这个修复](/img/gitspawn-revert-pr.png)

我漏问了一个问题：跑这条 git 命令的是谁，用的是哪个用户？

受影响的七个工具，安全模型是一样的：模型提议一条命令，人批准，然后执行。GitSpawn 危险，是因为它在人批准之前就执行了东西。

Orbi 没有审批这一步。它本来就是无人值守的，agent 手里本来就有 shell。我们的边界是操作系统账号：在 Orbi Cloud 里，每个接入的仓库都跑在自己独立的 Unix 用户下，runner 和 agent 用的是同一个用户。就算 runner 自己的 git 调用被骗去执行了什么，拿到的权限也和 agent 本来就有的一样，所以这个修复什么也没挡住。

权限更高的地方我们也查了。宿主机上有个读取各沙箱用量的任务，以 root 运行。但它读 git 时本来就切换成了各沙箱自己的用户。这是一次故障留下的：9 月 12 日它以 root 身份跑 git，git 的 `safe.directory` 检查拒绝操作别的用户的仓库，用量统计每 5 分钟静默失败一次，后来才改成以仓库主人的身份运行。

所以这 1164 行，守的是一条 Orbi 根本没有的边界。回滚 PR 里写得很直接：以现阶段来说，设计过度了。同一个 PR 还在仓库的 AGENTS.md 里加了一条规矩：不为理论上的风险开预防性的票。

## 我们的结论

如果你的 agent 在执行命令前会先问人，照 Manifold 的建议修。这类工具的修法很小，值得做。

如果你的 agent 是无人值守的，就没有审批可以保护，账号就是边界。每个仓库一个用户，别让权限更高的程序进到这个用户的文件里干活。动手写修复之前，先查清楚代码到底是以哪个用户在跑。

这个顺序我们搞反过一次，整个过程都公开在 Orbi 自己的仓库里。Orbi 把一张 GitHub Issue 做成经过评审、已合并、打好 tag 的 Release，可以[在你自己的仓库上试试](https://orbi.build/cloud/?ref=blog-gitspawn)。

## 相关

继续阅读：[托管 agent 对比](/zh/compare/managed-agents/) 与 [Cloud](/zh/cloud/)。
