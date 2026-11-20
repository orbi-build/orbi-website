---
title: 一句话需求，怎么走到 PR 合并
date: 2026-11-20
summary: 两条待办需求和一次自动拆票的实际记录：一句话交出去，Orbi 自己补验收条件、把多件事拆成子议题，再一路做到合并。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-vague-request-to-merged-pr-card.png
mirror: vague-request-to-merged-pr
---

Orbi 是一个开源系统，从一句话需求开始，一路完成编码、独立评审、合并和发版。如果你在 GitHub 上用编程 agent，想用一句话交出改动，这篇用实际记录说明 Orbi 动工前怎样补验收条件，遇到包含几个结果的需求又怎样拆分。

我是 Larry 🍀 Orbi，Orbi 的创始人。文中这些行为涉及引擎 v0.7.44 到 v0.7.52；下文待办演示应用上的三次请求运行在生产环境中，用的都是 v0.7.52。

## 认领 Issue 前，Orbi 看什么

一张 Issue 进入队列后，Orbi 会在认领前检查三件事：

- 结果能不能观察到：交付后，用户会看到什么，或能做什么。
- 有没有验收条件：用什么具体办法区分做完和没做完。
- 是不是只有一个结果：这项改动能不能独立交付。

检查依据是票里写了什么，不要求按模板分出几个小节。Orbi Cloud 会为每个接入的仓库开启这项检查；自托管引擎默认关闭，在 `.github/orbi.toml` 里设置 `clarify_thin_tickets = true` 就能开启。模型报错、超时或返回格式不对时，程序会记录这次检查已跳过，继续交付。

这里的「认领」，指 Runner 从队列里接下一张票，开始处理。若票里只缺验收条件，Orbi 又能提出可用的条件，引擎就直接把它们追加到 Issue 正文。验收条件、小节标题（`## Acceptance` 或 `## 验收`）和评论，都使用仓库配置的消息语言，可选英文或中文，不受原票语言影响。

追加后，这次认领就继续进入交付。负责编码的 agent 会话（下文称实现会话）拿到的是补过验收条件的正文，不会再排一次队，也不用来回确认。英文评论的开头是：

> Added the proposed acceptance criteria to this ticket.

列完条件后，评论接着写：

> They are under `## Acceptance`, and this claim continues to delivery. Editing this ticket changes them.

意思是验收条件已写进 `## Acceptance`，本次认领会继续交付，编辑 Issue 就能修改这些条件。这条自动流程会立即继续，开始实现前没有留出等待批准的时间。

## 中文需求 #19：6 分 47 秒合并

Orbi 自己的待办演示应用运行在生产环境中，仓库是 `orbi-build/orbi-e2e-prod`。其中 Issue #19 的标题是「待办多了想知道还剩几个没做」，正文只有一句：

> 待办一多就数不过来了。

仓库的消息语言设成了中文，Orbi 补上的两条验收条件和评论也都用中文。截图里能看到原来的需求，以及追加在「验收」小节下的条件。

<figure class="post-media">
<img src="/img/blog-vague-criteria-zh.webp" alt="GitHub Issue #19：中文标题和一句话正文下，「验收」小节新增两条中文条件，Orbi 的中文评论说明已追加验收条件。" width="912" height="782">
<figcaption>演示仓库里的 Issue #19，仓库消息语言为中文。这是私有仓库，因此这里用截图展示记录。</figcaption>
</figure>

这张票在 2026 年 11 月 19 日 23:46:05 UTC创建。23:48:42 UTC，Orbi 补上验收条件；23:52:52 UTC，改动合并。从那句话到合并，用了 6 分 47 秒。

## 英文需求 #21：8 分 26 秒合并

同一个仓库的 Issue #21 在 2026 年 11 月 19 日 23:54:56 UTC创建，标题是「I lose count of my open todos」，正文也只有一句：

> Once the list gets long I can't tell how many are left.

也就是列表一长，就看不出还剩多少件没做。23:58:28 UTC，Orbi 补上两条验收条件，英文原文是：

> - The todo list shows how many open todos are left, and that number matches the actual count of open items
> - The count stays visible and correct once the list gets long

第一条明确了数字要数什么：剩余未完成的待办，且要与实际数量一致。第二条保留了用户提出需求的场景：列表变长后，这个数字仍要看得见、数得对。用户可以直接检查这两条描述的行为。

<figure class="post-media">
<img src="/img/blog-vague-criteria-en.webp" alt="GitHub Issue #21，标题为 I lose count of my open todos，一句话正文下的 Acceptance 小节新增两条条件，Orbi 评论确认已追加条件。" width="912" height="782">
<figcaption>Issue #21 追加验收条件后的记录。Orbi 的这个演示仓库是私有的，因此这里展示截图。</figcaption>
</figure>

23:58:32 UTC，补完条件 4 秒后，Orbi 开始交付。11 月 20 日 00:00:12 UTC创建 PR #22，经过 1 轮评审，在 00:03:22 UTC合并。从最初那句话到合并，共 8 分 26 秒。这里的起止时间采用 GitHub 记录的 Issue 创建时间和 PR 合并时间。

运行 #21 和 #25 时，仓库的消息语言临时切成了英文，所以这两次收到的验收条件和评论都是英文。

Issue #25 的标题是「Let me clear the whole list」，正文是「The list is a mess and I want to start over.」，想把乱了的列表清空重来。这次评审发现了 1 个问题，在同一会话中修复后合并。这三次都是演示应用上的实际运行记录，用时只描述各自那次请求。

三次请求的时间如下：

| 需求 | 创建时间（UTC） | 补上验收条件（UTC） | 合并时间（UTC） | 从一句话到合并 |
|---|---|---|---|---|
| #19，中文待办计数 | 11 月 19 日 23:46:05 | 11 月 19 日 23:48:42 | 11 月 19 日 23:52:52 | 6 分 47 秒 |
| #21，英文待办计数 | 11 月 19 日 23:54:56 | 11 月 19 日 23:58:28 | 11 月 20 日 00:03:22 | 8 分 26 秒 |
| #25，清空列表 | 11 月 20 日 00:20:07 | 11 月 20 日 00:23:38 | 11 月 20 日 00:30:02 | 9 分 55 秒 |

UTC 加 8 小时是北京时间，三次请求都在北京时间 11 月 20 日早上 7 点 46 分到 8 点 30 分之间。

## 一张票里有几个结果，怎么拆

认领前的检查也能给出拆分方案。票里包含几个结果、方案又可用时，Orbi 会在同一次认领中创建子议题，并让它们进入队列。引擎 v0.7.44 以前，方案要等维护者回复 `/orbi split` 才执行；从 v0.7.44 起，引擎会自行执行。

11 月 18 日 17:26:06 UTC，Orbi Cloud 自己仓库里一张提速需求就自动拆成了两张子议题：一张处理测试准备耗时，一张让 CI 并行跑测试。到第二天 02:42:40 UTC，两张都已交付并合并。那个仓库是私有的，消息语言为中文，记录如下：

<figure class="post-media">
<img src="/img/blog-vague-split-auto-zh.webp" alt="Orbi 在私有的 Orbi Cloud Issue 上用中文说明已拆成 2 张子议题 #3508 和 #3509，父议题标为 ai-epic，两张子议题已排队，前面没有维护者的拆分命令。" width="922" height="382">
<figcaption>11 月 18 日的一次自动拆分，仓库消息语言为中文。</figcaption>
</figure>

### 公开记录里的早期拆分流程

早期流程有一份公开记录，可以查看拆分后的子议题。[Issue #263](https://github.com/xqliu/orbi-e2e-2609260042/issues/263)来自公开测试仓库，一句话里提了三项 CLI 改动：`export` 支持 `--email`，`summary` 支持 `--by-month`，`refunds-summary` 从按月统计改成按周统计。

<figure class="post-media">
<img src="/img/blog-vague-split-request-263.webp" alt="GitHub Issue #263，一句话正文提出三项 CLI 改动，带有 ai-epic 标签，子议题面板列出 #266、#267、#268，三张均已关闭。" width="922" height="525">
<figcaption>Issue #263：一个需求，拆成三个 GitHub 原生子议题。</figcaption>
</figure>

2026 年 10 月 28 日 14:20:04 UTC，维护者回复 `/orbi split` 后，Orbi 发出「Split into 3 child tickets.」的评论，列出 #266（`export --email`）、#267（`summary --by-month`）和 #268（按周统计退款），末尾写道：

> This ticket is now their parent (`ai-epic`) and every child is queued.

也就是原票成为父议题，带上 `ai-epic` 标签，所有子议题都已排队。

<figure class="post-media">
<img src="/img/blog-vague-split-comment-263.webp" alt="Orbi 在 GitHub 上的拆分评论：Split into 3 child tickets，列出 #266、#267 和 #268，确认父议题标为 ai-epic，所有子议题已排队。" width="922" height="322">
<figcaption>Issue #263 上的拆分评论。</figcaption>
</figure>

#266 完成交付，PR 在 14:36:05 UTC 合并，距拆分约 16 分钟。#263 是测试票，#267 和 #268 没有交付，随后手动关闭了。

v0.7.44 及之后的版本会直接发出同样的评论，不用等人回复 `/orbi split`。

### 子议题怎样进入交付

每张子议题都有自己的结果和验收条件。Orbi 先用 GitHub 原生子议题功能建立父子关联，再给子议题加上排队标签。父议题会加上表示父项的 `ai-epic`，摘掉原来的排队标签 `ai-ready`；交付在子议题上继续，父议题不创建 PR。

一次拆分至少要有 2 张子议题。引擎自身没有设置数量上限，要求用尽量少的拆分覆盖所有目标；GitHub 每个父议题最多允许 100 张子议题。某张子议题依赖另一张时，方案可以引用排在前面的条目，Orbi 会通过 GitHub 原生的 `blockedBy` 关系记录依赖。父议题有里程碑，或带着 `p0`、`bug` 标签时，子议题也会继承。

如果缺少必要细节，又提不出可用的方案来补齐，Orbi 会说明缺什么，摘掉排队标签，加上 `ai-needs-detail`。

## Orbi Cloud「写需求」会替你定哪些选项

GitHub Issue 还没创建，准备工作就可以开始。在 Orbi Cloud 的「写需求」（"Write a request"）里，负责起草需求的 agent 会话提出的问题带有推荐选项时，引擎会直接选择推荐项。这项行为从引擎 v0.7.44 开始提供。

引擎把决定送回同一个起草会话。会话指令要求把每项决定写进受影响 Issue 的 `Assumptions`（假设）小节，说明选了什么、为什么这么选；回复里也要列出这些决定。没有推荐项的问题，会交给人回答。

在「写需求」里，明确要求只解释或不要改代码，例如「only explain」或「don't touch the code」，Orbi 就只回复查到的结果，不起草也不创建 Issue。

已经开始的交付停下来以后怎么办，见[交付卡住后，Orbi 怎样处理](/zh/blog/stuck-delivery-one-click/)。

## 怎样写好这一句话

写出你想看到的结果。上面的待办需求给了 Orbi 可以转成验收条件的具体目标：看出还剩多少件，或者清空列表重新开始。

一条需求只放一项改动。已经知道有几个独立结果，就分别提；合在一张票里时，若 Orbi 在认领前检查中识别出这些结果，就会通过拆分流程处理。

补上的验收条件仍可在 Issue 正文里编辑，用来表达你想要的结果。实现会话在交付开始时读取当时的正文，自动流程不会等待你检查或修改。

## 相关

- [在 Orbi Cloud 里写需求](/zh/blog/write-a-request/)
- [Orbi 的高频开发：让自动交付持续运行](/zh/blog/high-frequency-agent-development/)
- [交付卡住了，在状态页上点一下](/zh/blog/stuck-delivery-one-click/)
- [Orbi 和编程 agent 的对比](/zh/compare/?ref=blog-vague)
- [Orbi Cloud](/zh/cloud/?ref=blog-vague)
