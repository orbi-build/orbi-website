---
title: Pi coding agent worktree：失败的交付怎么继续
date: 2026-10-26
summary: 一次 GitHub 连接失败后，代码已经推到远端，PR 还没开出来。Orbi 恢复任务时误判了已有分支，反复让出执行，后面三张任务也跟着等。这篇从那次故障讲起，说明 Pi 会话、worktree 和交付分支怎样配合，以及回归测试为什么要覆盖到真正消费状态的那一步。
lang: zh
author: Lawrence Liu
image: /img/og.png
mirror: pi-coding-agent-worktree
series: pi
---

Pi coding agent worktree 能让一次交付在独立的工作目录里改代码。任务失败后，还得找回已经推到远端的工作。2026 年 10 月 10 日，Orbi 就卡在这里：GitHub 连接中断，远端留下了代码分支，PR 还没开出来。任务重新入队后，Orbi 一直拒绝继续，后面三张待执行的 Issue 也跟着等。修复于 10 月 11 日 00:42（UTC+8）[合入](https://github.com/orbi-build/orbi/pull/1596)。

我是 Lawrence Liu，Orbi 的创始人。[Orbi](https://github.com/orbi-build/orbi) 从 GitHub Issue 开始，让 Pi 写代码，另起会话评审，通过后合并；发版由发版 Issue 驱动。这篇属于 [Pi 架构系列](/zh/guides/pi-coding-agent/?ref=blog-pi-worktree)。这次出问题的是 Orbi 的调度程序 runner，任务还没重新交到 Pi 手里。

## 分支在，PR 不在

[故障记录](https://github.com/orbi-build/orbi/issues/1594)里，这次运行因为临时的 GitHub 连接失败而停止。远端交付分支上留着一个 commit，没有打开的 PR。有人把 Issue 放回待执行队列后，runner 应该沿用这个分支继续实现。

每次尝试都会留下 `claim_yield` 日志，原因是 `stable_branch_appeared`。runner 认为，自己准备认领任务的这段时间里，另一次交付可能已经创建了分支，因此先让出执行。可这个分支在扫描任务之前就存在了。

故障记录里的时间如下，统一换成 UTC+8：

| 时间 | 记录到的事件 |
|---|---|
| 10 月 10 日 19:40 | GitHub 连接失败，原运行停止，留下远端分支，没有 PR。 |
| 10 月 10 日 21:31:24 | 记录中第一次出现 `stable_branch_appeared`，runner 让出执行。 |
| 10 月 10 日 23:47:11 | 记录中最后一次重复让出执行。 |
| 10 月 10 日 23:51:59 | 人工删除分支后，runner 再次选中这张 Issue，队列恢复推进。 |
| 10 月 11 日 00:42:30 | PR #1596 合并修复。 |

当时 runner 每轮处理一张 Issue。每轮都选中它，又每轮都让出，后面三张已经就绪的 Issue 一直等着。

人工删除分支让任务重新跑了起来，但这也删掉了恢复流程本该接着使用的分支。这是那次事故的临时处置，不是本文推荐的恢复操作。

## Pi coding agent worktree 和会话各管什么

看一张 Issue 的交付记录时，容易混在一起的有四样东西：

| 名称 | 代表什么 |
|---|---|
| Issue | 要完成的那项改动。 |
| run_id | runner 为完成这张 Issue 发起的一次尝试。可以恢复的尝试会保留自己的 run_id。 |
| Pi 会话 | 一次 agent 对话及工具执行。写代码和独立评审用不同会话。 |
| 交付分支 | 承载这张 Issue 的代码、用于开 PR 的 Git 分支。多次尝试沿用同一个分支名。 |

Orbi 的[分支命名函数](https://github.com/orbi-build/orbi/blob/b2462b5caf1316703beef51f3e1e78bac5a045cc/src/orbi/gitops.py#L68)使用仓库名和 Issue 编号；worktree 的目录名还包含 run_id。因此，新一次尝试可以换工作目录，继续使用同一张 Issue 的交付分支。有些可以恢复的故障会保留当前 run 和 worktree，重试也就不一定重新建目录。

独立工作目录能把 agent 的文件改动和其他 checkout 的工作文件分开。worktree 本身不提供安全沙箱。[Git 官方文档](https://git-scm.com/docs/git-worktree.html)说明，大部分 refs 和默认配置等仓库数据仍然共享。进程权限、凭据和网络访问，需要各自的隔离措施。

## 查到了分支，却没把结果传下去

runner 在认领前查询远端交付分支是否存在，把答案放进局部变量 `stable_branch_present`。

随后，它要把这些观察结果装进 `DeliveryFacts`，交给下一步决定怎么执行。构造对象时，漏传了这个字段。即使查询结果是 `True`，对象里的值仍然是默认的 `False`。

认领路径还有一次远端查询，用来检查准备认领期间是否出现了并发工作。判断相当于下面这样：

```python
if not stable_branch_present and stable_branch_exists(...):
    # 分支可能是在认领期间出现的，先让出执行。
```

这是解释逻辑的代码片段，不能直接当恢复命令运行。第一次查询确认不存在，第二次却发现存在，确实可能是另一个交付进程先动了手。但字段漏传后，runner 每次都会把早已存在的分支误判为刚刚出现的分支。

[修复](https://github.com/orbi-build/orbi/pull/1596/files)补上了观察结果的传递：

```diff
 return DeliveryFacts(
     ...
     stable_branch=stable_branch,
+    stable_branch_present=stable_branch_present,
     ...
 )
```

原来的并发检查保留了，现在能拿到第一次查询的真实结果。

## 回归测试要走到消费这个结果的地方

[PR #1596 新增的测试](https://github.com/orbi-build/orbi/pull/1596/files)把“分支是否存在”的查询替换为一个始终返回 `True` 的测试函数，再从处理 Issue 的入口执行。第一次查询的结果正确传进来后，判断会短路，不再执行第二次查询。

测试记录创建 worktree 时的参数，检查 runner 是否传入 `existing_branch=True`，是否返回 PR 结果，以及日志里是否没有 `claim_yield`。

这样才会穿过“收集事实，再决定动作”的交接位置。只测查询函数能否找到分支，即使测试通过，漏传字段的问题也可能还在。

自己搭 Git worktree coding agent 的恢复流程时，我会分别检查这些状态：

| 第一次查询 | 第二次查询 | 测试要确认什么 |
|---|---|---|
| 已存在 | 已存在 | 识别已有工作，进入预期的接续路径。正确路径可能跳过第二次查询。 |
| 不存在 | 已存在 | 识别可能的并发工作，不直接接管。 |
| 查询失败 | 未知 | 报出查询失败，不能当成已经确认“不存在”。 |

这次新增的回归测试覆盖第一行。其余状态需要分别验证。Orbi [当前查询远端分支的实现](https://github.com/orbi-build/orbi/blob/b2462b5caf1316703beef51f3e1e78bac5a045cc/src/orbi/gitops.py#L138)把“命令成功、结果为空”当作不存在，命令执行失败则继续抛出错误。

## 重启任务前先确认留下了什么

先找到这张 Issue 的交付分支，查它有没有对应的 PR。再确认留下的是本地 worktree、已经推送的 commit，还是两者都有。把 run_id 和日志放在一起，区分旧尝试的记录与新尝试的记录。

这次事故里，推到远端的 commit 已经保住了。出错的是 runner 决定是否沿用它的那一步。验证恢复流程时，要测到真正使用观察结果的动作，也要包含“代码已经在，PR 还没建”的状态。

## 相关

- [Orbi 怎样使用 Pi coding agent](/zh/guides/pi-coding-agent/?ref=blog-pi-worktree)
- [一张 Issue 怎样经过多个 Pi 会话](/zh/blog/orbi-on-pi-coding-agent/?ref=blog-pi-worktree)
- [Orbi 怎样把 Pi 用作 agent harness](/zh/blog/pi-agent-harness/?ref=blog-pi-worktree)
- [Orbi 与 OpenHands 的比较](/zh/compare/openhands/?ref=blog-pi-worktree)
- [Orbi Cloud](/zh/cloud/?ref=blog-pi-worktree)
