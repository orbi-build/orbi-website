---
title: 一句话需求，怎么走到 PR 合并
date: 2026-11-20
summary: 三次真实需求记录了 Orbi 给一句话 Issue 补验收条件、交付并合并的过程，以及自动拆分需求和修改验收条件的规则。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-vague-request-to-merged-pr-card.png
mirror: vague-request-to-merged-pr
---

交给编码 agent 的需求，常常只有一句话。想改什么说了，怎样算做完却没写。Orbi 是把 GitHub Issue 交付成已合并 PR 的开源系统。加上 `ai-ready` 标签，AI 编码会话就会实现改动。另一个评审会话对照 Issue 和 CI 检查，再由 Orbi 合并。下面有三张一句话 Issue 从补验收条件到合并的记录。自动拆分需求另有一个实例。

我是 Larry 🍀 Orbi，Orbi 的创始人。

Orbi Cloud 是托管版，替你运行同一个开源引擎。「写需求」页面可以替你起草 Issue 并排队。Orbi 用 GitHub 标签记录每张 Issue 的状态：`ai-ready` 表示已排队，`ai-in-progress` 表示正在交付，`ai-blocked` 表示已停止，`ai-fix-needed` 表示已有 PR 需要再处理一轮，`ai-merged` 表示已完成。

## 开始交付前的检查

调度器从队列里接下一张 Issue，Orbi 把这一步称为「认领」。开始交付前，模型先读 Issue，检查三件事：

- 结果能否观察到：改完后，用户能看到什么，或能做什么。
- 有没有验收条件：用什么具体办法判断已经做完。
- 是否只有一个结果：这项改动能否独立交付。

发现缺项时，有三种处理方式：

- 只缺验收条件。Orbi 把拟定的条件写进 Issue 的 `## Acceptance` 小节，同一次认领直接继续交付。
- 一张 Issue 要做几件事。Orbi 按结果拆成子 Issue，分别排队。父 Issue 加上 `ai-epic` 标签，本身不交付。
- 缺少 Orbi 无法补齐的信息。Orbi 留评论说明缺什么，把 `ai-ready` 换成 `ai-needs-detail`，等待补充。补齐后，把 `ai-needs-detail` 换回 `ai-ready` 就能重新排队。

检查依据是 Issue 的内容，不要求使用模板。如果检查本身报错或超时，Orbi 会跳过检查，继续交付。Orbi Cloud 为每个接入的仓库开启这项检查；自托管引擎默认关闭，需要使用 v0.7.44 或更新版本，并在 `.github/orbi.toml` 中设置 `clarify_thin_tickets = true`。

## 一句话的待办需求，8 分 26 秒合并

Orbi 的演示仓库里是一个小型待办应用。仓库私有，运行在 Orbi Cloud 的生产服务上。下面三张 Issue 都是我自己开的，只涉及小应用上的小改动，不作为性能基准。

Issue #21 的标题是「I lose count of my open todos」，正文只有一句：

> Once the list gets long I can't tell how many are left.

创建约三分半后，23:58:28 UTC，Orbi 已认领这张 Issue，并补上两条验收条件。译成中文是：

> - 待办列表显示剩余未完成项的数量，与实际数量一致。
> - 列表变长后，这个数字仍然可见且正确。

第二条保留了原需求中「列表变长」的使用场景。只加一个计数，很容易漏掉列表很长时还能否看到它。

4 秒后，编码会话从补过条件的 Issue 开始实现。11 月 20 日 00:00:12 UTC，PR #22 创建，修改了 `index.html` 和两个测试文件（+28/−1）。评审会话对照这两条条件和 CI 检查。经过一轮评审，Orbi 在 00:03:22 UTC 合并了 PR，距创建 Issue 共 8 分 26 秒。

另外两张 Issue 也走完了这个流程。#19 用中文提出同样的计数需求：「待办一多就数不过来了。」#25 的标题是「Let me clear the whole list」，正文只有一句：

> The list is a mess and I want to start over.

#25 的评审会话在同一分支上修掉了一处问题再判通过，前后只用了一轮评审。

<figure class="post-media">
<img src="/img/blog-vague-criteria-zh.webp" alt="GitHub Issue #19：中文标题和一句话正文下，「验收」小节新增两条中文条件，Orbi 的中文评论确认已追加条件。" width="912" height="782">
<figcaption>Issue #19 补上中文验收条件后的记录。仓库私有，因此用截图展示。</figcaption>
</figure>

| 需求 | 创建 | 补上验收条件 | 合并 | 创建到合并 |
|---|---|---|---|---|
| #19，待办计数（中文） | 11 月 19 日 23:46:05 | 11 月 19 日 23:48:42 | 11 月 19 日 23:52:52 | 6 分 47 秒 |
| #21，待办计数 | 11 月 19 日 23:54:56 | 11 月 19 日 23:58:28 | 11 月 20 日 00:03:22 | 8 分 26 秒 |
| #25，清空列表 | 11 月 20 日 00:20:07 | 11 月 20 日 00:23:38 | 11 月 20 日 00:30:02 | 9 分 55 秒 |

日期均为 2026 年，时刻均为 UTC。「创建」取 Issue 创建时间，「合并」取 PR 合并时间。补上验收条件前的时间，包含了等待认领的时间。

验收条件使用仓库配置的消息语言，不随需求所用的语言变化。演示仓库配置为中文，所以 #19 收到中文条件；运行 #21 和 #25 时，我把消息语言切成了英文。

<figure class="post-media">
<img src="/img/blog-vague-criteria-en.webp" alt="GitHub Issue #21，标题为 I lose count of my open todos，一句话正文下的 Acceptance 小节新增两条英文条件，Orbi 评论确认已追加条件。" width="912" height="782">
<figcaption>Issue #21，当时仓库的消息语言已切成英文。</figcaption>
</figure>

## 修改 Issue 后，哪次会话能读到

Orbi 补上的验收条件只是提议，你可以改，编码开始后改也有用。编码会话运行期间，Orbi 默认每 60 秒看一次 Issue 正文；有仓库写入权限的人改了正文，Orbi 就带着新内容重启编码会话，默认最多重启三次。次数用完后，Orbi 会在 Issue 上说明这条修正未被执行，正在运行的会话按原有内容继续；评审仍读最新正文。

评审会话每轮都会重新读取当前 Issue 正文，并以其中的验收条件为准，所以评审检查的就是那一刻 Issue 上写的内容。

不过中途改一次就要重启一次，而 #21 从补完条件到开始编码只隔了 4 秒。如果你很在意「做完」的标准，更省事的做法是打上 `ai-ready` 之前就把验收条件写进 Issue，只要写清怎样算做完，Orbi 就直接用你写的，不再另提。

## 一张需求包含两个结果时

11 月 18 日，Orbi Cloud 自己仓库里的一张 Issue 要用两项改动加快测试：不再让每个测试文件都加载测试数据库，并让 CI 并行运行更多测试。17:26:06 UTC，Orbi 自动把它拆成两个子 Issue，每项改动一张，无需人发出拆分指令。两张子 Issue 各有验收条件，分别交付，都在第二天合并。这个仓库私有，消息语言为中文。

<figure class="post-media">
<img src="/img/blog-vague-split-auto-zh.webp" alt="Orbi 的中文评论说明已拆成两个子 Issue #3508 和 #3509，父 Issue 标为 ai-epic，两个子 Issue 已排队，前面没有维护者的拆分命令。" width="922" height="382">
<figcaption>11 月 18 日的自动拆分记录。</figcaption>
</figure>

子 Issue 使用 GitHub 原生的子 Issue 功能，Orbi 先建立父子关联，再排队。一次拆分至少产生两个子 Issue。如果其中一张依赖另一张，Orbi 会用 GitHub 原生的 `blockedBy` 关系记录，在 GitHub 上就能看到先后顺序。子 Issue 继承父 Issue 的里程碑，以及 `p0` 或 `bug` 标签。此前，拆分要等维护者回复 `/orbi split`；从引擎 v0.7.44 起，只要这项检查开着（Orbi Cloud 上一直开着），Orbi 会自行拆分。

## 起草需求时，哪些问题会交给你

在 Orbi Cloud 的「写需求」页面，你可以用一句话描述改动，Orbi 会读取仓库并起草 Issue。起草时遇到需要选择的地方，如果有推荐项，Orbi 会采用推荐项，把选择和理由写进 Issue 的 `Assumptions` 小节。没有推荐项的问题才会交给你回答。如果消息只要求解释，Orbi 会直接回答，不创建 Issue。

## 怎样写一张能交付的 Issue

- 写出想看到的结果，例如剩余待办数量，或清空后的空列表。Orbi 据此拟定验收条件。
- 已经知道需求包含几个独立部分，就分别创建 Issue。顺序由你定：在 GitHub 上把后一张设为 `blockedBy` 前一张，或者等前一张合并后再给后一张加 `ai-ready`。
- 在意完成标准时，先写好验收条件，再加 `ai-ready`。之后也能改，代价是编码会话重启一次。

交付开始后停下来、需要你回答的情况，见[AI 编码交付卡住后，怎么让 Orbi 继续](/zh/blog/stuck-delivery-one-click/)。

## 相关

- [在 Orbi Cloud 里写需求](/zh/blog/write-a-request/)
- [Orbi 的高频开发：让自动交付持续运行](/zh/blog/high-frequency-agent-development/)
- [AI 编码交付卡住后，怎么让 Orbi 继续](/zh/blog/stuck-delivery-one-click/)
- [Orbi 和编程 agent 的对比](/zh/compare/?ref=blog-vague)
- [Orbi Cloud](/zh/cloud/?ref=blog-vague)
