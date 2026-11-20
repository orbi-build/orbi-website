---
title: 一句话需求，怎么走到 PR 合并
date: 2026-11-20
summary: 三次待办改动和一次自动拆分的实际记录：Orbi 怎样给一句话需求补验收条件，把包含多个结果的需求拆成子 Issue，以及修改条件后评审会读到什么。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-vague-request-to-merged-pr-card.png
mirror: vague-request-to-merged-pr
---

Orbi 是开源的代码交付系统：你在已接入的仓库创建 GitHub Issue，加上 `ai-ready` 标签，一次交付会话负责编码，另一次交付会话按 Issue 的验收条件和 CI 评审，评审通过且 CI 全绿后由 Orbi 合并，发版则交给单独的 Release 任务。一句话需求可能说清了想要什么，却没写怎样才算做完，也可能把几个结果放进同一张 Issue。这篇用实际记录说明 Orbi 怎样处理这些情况，其中一个可以借用的设计是：把自动提出的决定写进 Issue，让你能修改后续评审采用的条件。

我是 Larry 🍀 Orbi，Orbi 的创始人。

Orbi Cloud 是托管版，替你运行同一个开源引擎。你可以直接在已接入的仓库创建 Issue，加上 `ai-ready` 标签排队；也可以在 Orbi Cloud 的「写需求」页面描述改动，由 Orbi 起草 Issue 并放进队列。

Orbi 用 GitHub 标签记录交付状态：`ai-ready` 表示已排队，`ai-in-progress` 表示正在交付，`ai-blocked` 表示已停止，`ai-fix-needed` 表示现有改动还需要继续处理，`ai-merged` 表示已合并。负责评审的独立交付会话会在同一分支上处理评审发现的问题，再由 Orbi 合并。

## 认领 Issue 前检查什么

「认领」指 runner 从队列里接下一张 Issue。进入交付前，模型会读 Issue，检查三件事：

- 结果能否观察到：交付后，用户能看到什么，或能做什么。
- 有没有验收条件：用什么具体办法判断已经做完。
- 是否只有一个结果：这项改动能否独立交付。

发现缺项时，Orbi 按下面的情况处理：

- 只缺验收条件，而且能提出可用的条件：直接追加到 Issue 正文，同一次认领继续交付。
- 包含多个结果，而且能提出可用的拆分方案：创建子 Issue 并排队，父 Issue 加上 `ai-epic`、移除 `ai-ready`。交付在子 Issue 上进行，父 Issue 本身不交付，也不创建 PR。
- 缺少细节，又没有可用的提案：评论说明缺什么，移除 `ai-ready`，加上 `ai-needs-detail`。你补齐后，再加一次 `ai-ready` 就能重新排队。

模型看的是 Issue 写了什么，因此不要求套用固定的小节标题。如果检查本身报错、超时或返回格式不对，Orbi 会跳过检查，继续交付；检查程序自身失败不会挡住工作。

## 一句话的待办需求

验收条件和评论使用仓库配置的消息语言。Orbi 的演示仓库设为中文，所以 #19 收到的是中文条件和评论；运行 #21 和 #25 时，我把它切成了英文消息。

Orbi 的演示仓库是私有的，里面是一个小型待办应用，这几次交付都运行在 Orbi Cloud 的生产服务上。三张 Issue 都是我自己开的。这些是小应用上的小改动，不是性能基准测试。

先看 #21。标题是「I lose count of my open todos」，正文只有一句，想解决列表变长后数不清剩余待办的问题：

> Once the list gets long I can't tell how many are left.

23:58:28 UTC，Orbi 给它补上两条验收条件，译成中文是：

> - 待办列表显示剩余未完成项的数量，与实际数量一致。
> - 列表变长后，这个数字仍然可见且正确。

<figure class="post-media">
<img src="/img/blog-vague-criteria-en.webp" alt="GitHub Issue #21，标题为 I lose count of my open todos，一句话正文下的 Acceptance 小节新增两条条件，Orbi 评论确认已追加条件。" width="912" height="782">
<figcaption>Issue #21 追加验收条件后的记录。</figcaption>
</figure>

23:58:32 UTC，补完条件 4 秒后，负责编码的交付会话读到更新后的 Issue，开始实现。11 月 20 日 00:00:12 UTC 创建的 PR #22 改了 `index.html` 和两个测试文件（+28/−1）。另一次独立交付会话按 Issue 的验收条件和 CI 评审，经过一轮评审、CI 全绿后，Orbi 合并了 PR。从创建需求到合并共 8 分 26 秒。

#19 提的也是待办计数，标题是「待办多了想知道还剩几个没做」，正文只有「待办一多就数不过来了。」

<figure class="post-media">
<img src="/img/blog-vague-criteria-zh.webp" alt="GitHub Issue #19：中文标题和一句话正文下，「验收」小节新增两条中文条件，Orbi 的中文评论说明已追加验收条件。" width="912" height="782">
<figcaption>Issue #19 按仓库的中文消息配置收到了验收条件。</figcaption>
</figure>

#25 想清空列表重新开始，标题是「Let me clear the whole list」，正文是「The list is a mess and I want to start over.」。

表格说明：日期均为 2026 年，时刻均为 UTC；「创建」取 Issue 创建时间，「合并」取 PR 合并时间。北京时间是 UTC+8。

| 需求 | 创建 | 补上验收条件 | 合并 | 从一句话到合并 |
|---|---|---|---|---|
| #19，待办计数 | 11 月 19 日 23:46:05 | 11 月 19 日 23:48:42 | 11 月 19 日 23:52:52 | 6 分 47 秒 |
| #21，待办计数 | 11 月 19 日 23:54:56 | 11 月 19 日 23:58:28 | 11 月 20 日 00:03:22 | 8 分 26 秒 |
| #25，清空列表 | 11 月 20 日 00:20:07 | 11 月 20 日 00:23:38 | 11 月 20 日 00:30:02 | 9 分 55 秒 |

## 改过的条件，哪次会话能读到

负责编码的交付会话在启动时读取 Issue。#21 从补完条件到开始编码只隔了 4 秒，留给你改条件的时间很短；会话已经运行后，再编辑 Issue，修改不会传进正在编码的会话。

评审每一轮都会由独立交付会话重新读取当前 Issue 正文，以其中的验收条件为准。你在这一轮开始前改过的条件，就是这一轮评审检查的条件。

要自己定验收条件，就在加 `ai-ready` 之前写进 Issue。

## 多个结果怎样拆成子 Issue

11 月 18 日 17:26:06 UTC，Orbi Cloud 自己仓库里一张加快测试套件的需求被自动拆成了两个子 Issue：一个处理测试准备耗时，另一个让 CI 并行跑测试。两张都在第二天完成交付并合并，最晚到 02:42:40 UTC。拆分后，测试准备和 CI 改动分别有自己的验收条件，各自交付。这个仓库是私有的，消息语言为中文。

<figure class="post-media">
<img src="/img/blog-vague-split-auto-zh.webp" alt="Orbi 的中文评论说明已拆成两个子 Issue #3508 和 #3509，父 Issue 标为 ai-epic，两个子 Issue 已排队，前面没有维护者的拆分命令。" width="922" height="382">
<figcaption>11 月 18 日的自动拆分记录。</figcaption>
</figure>

拆分至少需要两个子 Issue，每个都有自己的结果和验收条件，才能各自交付。Orbi 先通过 GitHub 原生子 Issue 功能建立父子关联，再给子 Issue 加 `ai-ready`。子 Issue 之间的依赖用 GitHub 原生的 `blockedBy` 关系记录，明确哪张必须先完成；父 Issue 有里程碑或带有 `p0`、`bug` 标签时，子 Issue 会继承。交付已转到子 Issue，父 Issue 因此加上 `ai-epic`，移除 `ai-ready`。

## Orbi Cloud 的「写需求」

「写需求」（Write a request）是 Orbi Cloud 的一个页面，你描述想改什么，Orbi 读取仓库并起草 Issue。

Orbi 起草 Issue 时，提出的问题若带有推荐选项，就会自行采用推荐项。起草指令要求把选择和理由写进受影响 Issue 的 `Assumptions`（假设）小节，方便你查看决定；没有推荐项的问题才会交给你。只要求解释的请求会得到回复，不创建 Issue。

## 写需求时写什么

写出你想看到的结果，例如显示剩余待办数量，或清空列表重新开始。这样 Orbi 才有具体目标可以转成验收条件。

已经知道要分成哪几项，就分别提需求，顺序和依赖也由你掌握。如果你在意精确的完成标准，就在排队前写好自己的验收条件。之后修改 Issue，仍然能影响读取最新正文的评审。

Orbi Cloud 为每个接入的仓库开启认领前检查。自托管引擎默认关闭这项检查，在 `.github/orbi.toml` 里设置 `clarify_thin_tickets = true` 就能开启。

版本说明：自动补验收条件、起草时自动选择推荐项需要引擎 v0.7.44 及以上版本；v0.7.44 之前，拆分方案要等维护者回复 `/orbi split`，从 v0.7.44 起由 Orbi 自行执行。演示请求使用 v0.7.52。

## 相关

- [在 Orbi Cloud 里写需求](/zh/blog/write-a-request/)
- [Orbi 的高频开发：让自动交付持续运行](/zh/blog/high-frequency-agent-development/)
- [交付卡住了，在状态页上点一下](/zh/blog/stuck-delivery-one-click/)
- [Orbi 和编程 agent 的对比](/zh/compare/?ref=blog-vague)
- [Orbi Cloud](/zh/cloud/?ref=blog-vague)
