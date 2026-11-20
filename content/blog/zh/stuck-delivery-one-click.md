---
title: 交付卡住了，在状态页上点一下
date: 2026-11-20
summary: 交付开始后卡住了：在 Orbi Cloud 状态页看停下的原因，点按钮回答，Orbi 接着做。附真实案例、每个按钮的作用、合并前改答和自托管怎么回答。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-stuck-delivery-one-click-card.png
mirror: stuck-delivery-one-click
---

Orbi 是一个开源系统，把一句话需求一路做到写代码、独立评审、合并和发版。这篇写给已经启动编程 agent 交付、任务却中途停下的开发者和维护者：在 Orbi Cloud 上该选哪个答案，点完会怎样改动 GitHub 上的任务。有些任务可以直接回答，有些需要先改票或补好模型服务商余额，再重新排队。

我是 Larry 🍀 Orbi，Orbi 的创始人。Cloud v0.8.61 已在 2026 年 11 月 20 日上线生产环境，使用引擎 v0.7.52。回答流程基于引擎 v0.7.46+，下文提到的改答处理从 v0.7.47 开始提供。本文的例子来自 Orbi 的 beta 站。

如果任务还没开始，Orbi 就有问题要问，看另一篇[《一句话需求，怎么走到 PR 合并》](/zh/blog/vague-request-to-merged-pr/)。

## 在状态页找到卡住的任务

打开 [Orbi Cloud](/zh/cloud/?ref=blog-stuck)，用 GitHub 登录，进入已连接项目的状态页。「Orbi 卡住了，需要您看一下」卡片会列出卡住的任务，直接写明原因。有些任务会显示一道问题和 2 到 4 个回答按钮，这是引擎写出的结构化选择题。想补充背景，可以先在「（选填）一句理由」里写一句，再点选项。

任务每次因等待人做决定而停下时，最多会问一道问题。技术原因造成的停止，也可能只显示原因和恢复所需的操作。Issue 上有 `ai-blocked` 标签，不代表一定有问题要回答。

<figure class="post-media">
<img src="/img/blog-stuck-flow-zh.webp" alt="中文状态页动图：鼠标悬停在卡住任务的回答选项上，随后把任务记录筛选为「需要您处理」，展开 #394 查看原因和回答按钮。" width="1280" height="913">
<figcaption>beta 站实拍：悬停查看选项，把任务记录筛选为「需要您处理」，再展开卡住的任务。</figcaption>
</figure>

## 外部贡献收不收，由维护者决定

测试仓库 `xqliu/orbi-e2e-2609260042` 的 Issue #394 跟踪 PR #393。这份 PR 在 Orbi 之外发起，用来模拟外部贡献。Orbi 已经评审过，结论是通过。但是否接受贡献、随哪个版本发布，仍由维护者决定，引擎把合并留给人来操作。

卡片问的是这份外部贡献该怎么处理，三个按钮分别是：

- 「去 GitHub 审阅合并」：这是 `link` 动作，打开 PR 后由你在 GitHub 上处理。
- 「不收，让 Orbi 自己做」：关闭外部 PR，把 Issue 重新排队，交给 Orbi 完成原任务。对应 `close_external_pr`。
- 「这件事不做了」：关闭 Issue 和它指向的 PR。对应 `close_all`。

Issue 卡住时，引擎可以执行这两种关闭操作。这三个选项都没有推荐项，也不会自动执行。

<figure class="post-media">
<img src="/img/blog-stuck-cards-zh.webp" alt="中文状态页列出 4 个卡住的任务：#394 的问题下有三个处理外部贡献的按钮，下方 #390 显示改票和继续交付的按钮。" width="1280" height="913">
<figcaption>beta 页面列出 4 个卡住的任务。#394 的问题按仓库规定的消息语言撰写，这个测试仓库用中文。</figcaption>
</figure>

## 改好任务票后，交回 Orbi

[Issue #390](https://github.com/xqliu/orbi-e2e-2609260042/issues/390)停下的原因不同：「Orbi 没有交出任何改动。」这张卡片给出的处理入口是「在 GitHub 上改票」和「已改好，让 Orbi 继续」。先打开 Issue，说清楚要改成什么，改好后再交回来。

「已改好，让 Orbi 继续」是重新排队按钮，点击后会直接修改 GitHub 上的任务标签。如果有尚未关闭的 Orbi 交付 PR，Cloud 先加 `ai-fix-needed`；没有则加 `ai-ready`。然后留一条重新排队的评论，最后移除 `ai-blocked`。页面会显示：「已重新交给 Orbi：#390 会接着做，进度这一页自动更新。」

## 点一次回答，GitHub 上会发生什么

选择题的答案会先作为评论提交。点选答案时，表单会提交到 Cloud 的 `POST /api/issues/answer`，带上仓库、Issue、问题和所选答案，以及选填的理由。Cloud 先检查登录会话和已连接仓库，再核对你的 GitHub 仓库写入权限。`admin`、`maintain` 和 `write` 权限都可以回答。

Cloud 用 GitHub App 的安装令牌，在 Issue 上发布一条结构化回答评论，并在 `by` 中记录你的登录名。这个接口负责写评论；具体工作和标签变更，交给引擎在下一次调度时处理。

直接在 GitHub 上回答时，引擎核对的是评论实际作者的仓库写入权限，也信任它自己的 Runner 身份。把别人的登录名填进 `by`，不会让回答获得那个人的权限。

提交后，Cloud 用回执替换选项，确认收到回答。下面这张 beta 截图拍于 2026 年 11 月 18 日，回执写着：

> 已收到。Orbi 正在交付，一分钟内按您的新选择重做。

看到回执时，引擎还不一定已经执行。已经停止的任务，要等下一次调度才会读到回答。交付会话正在运行时，也可以改答：默认每 60 秒检查一次来自可信身份的新评论，按修改后的任务票重启会话；同一个交付会话默认最多这样重启三次。实际响应时间受调度和重启次数限制。处在两轮之间时，回执是「Orbi 在两轮之间，下一轮按您的新选择改。」

<figure class="post-media">
<img src="/img/blog-stuck-answered-zh.webp" alt="中文 beta 状态页：卡住任务的问题下，原来的选项按钮已换成收到回答的回执，说明 Orbi 会按新选择继续。" width="1568" height="775">
<figcaption>2026 年 11 月 18 日 beta 站回答后的状态。回执确认收到，并说明会按新选择继续。</figcaption>
</figure>

## 哪些推荐项，Orbi 可以自己选

如果某次运行停下时留了一道结构化选择题，且决策分类为 `pick_best` 或 `missing_info`，引擎可以自行采用推荐项。这个选项必须有推荐标记、有理由，动作必须是 `amend_requeue`，也就是把选项描述写进 Issue 的验收条件，再恢复交付。运行必须有 ID，还要能读到可信的评论历史，确认其中没有此前自动重新排队的记录。

一个 Issue 从开到关，最多这样自动恢复一次。GitHub 临时错误后的自动重新排队也占用这一次机会。新开一轮运行不会重置次数。

有些决定仍须由人来做：接受外部代码，涉及钱、价格或套餐的决定，以及推翻维护者在 Issue 或 AGENTS.md 里明确写下的要求。链接和关闭操作不会自动执行，确认题、文本题和没有推荐项的选择题也不会。

Orbi 会把所选项的验收条件写进 Issue，并留下这条评论：

> Orbi 自行选择了 **{label}**：{reason}
>
> 该选项的验收标准已写入本 Issue，下一个 session 会读到修改后的工单。不合适？回复另一个选项即可。

Cloud 显示「Orbi 替你做了决定：{label}，理由：{reason}」，旁边有「改选」。展开后，回答控件会重新出现，可以换掉 Orbi 的选择。在 GitHub 上改答，要按文末的格式发一条新的结构化回答评论。

## 修改任务票的答案，合并前可以改

如果答案的作用是修改任务票、恢复尚未结束的交付，可信的评论作者可以给同一道题再提交一个有效答案。新答案会替代旧答案。如果旧选择已经写进任务票，Orbi 会在原处替换这道题的验收条件，保留其他问题的条件。

交付尚未合并、又有新答案等待落实时，Orbi 会先暂停合并，让交付先落实新选择。这项改答处理包含在引擎 v0.7.47 中。合并前最后一次检查发生在哪里，见[高频开发一文的说明](/zh/blog/high-frequency-agent-development/)。

## 在任务记录里查原因、回答问题

任务记录有五个筛选项：「全部」「进行中」「排队中」「需要您处理」「已完成」，默认选中「全部」。还没关闭、处于卡住状态的任务，点「查看原因与处理方法」，原因会在当前行展开。有问题要回答时，「下一步：去回答」下面会显示同一组回答控件。

答完后，任务会归入「进行中」，等待引擎下一次调度，即使 GitHub 上仍有 `ai-blocked`。

<figure class="post-media">
<img src="/img/blog-stuck-record-reason-zh.webp" alt="任务记录筛选为「需要您处理」，#394 已展开，「下一步：去回答」下面显示中文问题和回答按钮。" width="1280" height="913">
<figcaption>#394 在任务记录里也能回答。</figcaption>
</figure>

模型服务商账户余额不足，也有对应的原因和恢复办法：给服务商账户充值，或到模型设置点「换一把有余额的 key」。补好余额或换好 key 后，还要把受影响的任务重新排队。

## 自托管用户怎样回答

不用 Cloud，也可以参照这份[结构化回答格式](https://github.com/orbi-build/orbi/blob/v0.7.52/src/orbi/answer.py)，在 Issue 上发一条新评论：

```html
<!-- orbi:answer:v1 {"q":"q1","action":"accept","value":"<the option's full label>","by":"<your GitHub login>","reason":"optional reason"} -->
```

查看 Orbi 提问评论的原始正文，隐藏的 `orbi:question:v1` 块里有 `question.id`，把这个 ID 填进 `q`。保留示例中的 `action` 为 `accept`，把 `value` 的占位内容换成选项的完整文字，`by` 换成你的 GitHub 登录名。`reason` 选填，没有理由就删掉整个字段，空字符串会被拒绝。提交评论的账号必须有仓库写入权限。想改掉先前修改任务票的回答，就针对同一道题再发一条新的结构化评论。

## 相关

- [对比 Orbi 的交付流程](/zh/compare/?ref=blog-stuck)
- [Orbi Cloud](/zh/cloud/?ref=blog-stuck)
- [一句话需求，怎么走到 PR 合并](/zh/blog/vague-request-to-merged-pr/)
- [Orbi 的高频开发：让自动交付持续运行](/zh/blog/high-frequency-agent-development/)
- [写需求：说一句话，Orbi Cloud 替你写好 GitHub Issue](/zh/blog/write-a-request/)
