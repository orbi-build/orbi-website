---
title: AI 编码交付卡住后，怎么让 Orbi 继续
date: 2026-11-20
summary: Orbi 交付停下后，看清原因再处理：回答问题、修改 Issue 或补模型余额。文中讲每个按钮何时生效、怎样改答，以及不用 Cloud 时怎样在 GitHub 上回答。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-stuck-delivery-one-click-card.png
mirror: stuck-delivery-one-click
---

Orbi 是开源的代码交付系统。你给 GitHub Issue 加上 `ai-ready` 标签，一个编码会话负责写代码。另一个评审会话对照 Issue 和 CI 检查，随后由 Orbi 合并 PR。这篇讲交付停下后，该在 Orbi Cloud 怎样回答，每个按钮会在 GitHub 上改什么。做 agent 工具时，也可以借用这里的设计：把收到回答与执行回答分开显示。

我是 Larry 🍀 Orbi，Orbi 的创始人。

Orbi Cloud 是托管版，替你运行开源引擎。Orbi 用 GitHub 标签记录 Issue 的状态：`ai-ready` 表示排队中，`ai-in-progress` 表示有会话正在处理，`ai-blocked` 表示已停止，`ai-fix-needed` 表示已有 PR 要再做一轮，`ai-merged` 表示已完成。

## 三种停止原因

打开 [Orbi Cloud](/zh/cloud/?ref=blog-stuck)，用 GitHub 登录，进入项目状态页。已停止的 Issue 会出现在「Orbi 卡住了，需要您看一下」卡片里，原因用直白的文字写明。先看原因，判断自己遇到的是哪一种情况。

<figure class="post-media">
<img src="/img/blog-stuck-flow-zh.webp" alt="中文状态页动图：查看已停止 Issue 的回答按钮，把任务记录筛选为「需要您处理」，再展开停止原因。" width="1280" height="913">
<figcaption>beta 站实拍：已停止 Issue 的卡片，以及从任务记录展开的同一道问题。</figcaption>
</figure>

**需要你做决定。** 卡片显示一道问题，下面有 2 到 4 个按钮，还可以在「（选填）一句理由」里补充背景。测试仓库 `xqliu/orbi-e2e-2609260042` 的 Issue #394 对应 PR #393。这个 PR 在 Orbi 之外创建，作为外部贡献的测试示例。Orbi 对它的评审已经通过，但不会自行合并外部贡献者的代码，所以要请维护者决定。

**需要修改 Issue。** [Issue #390](https://github.com/xqliu/orbi-e2e-2609260042/issues/390) 停下的原因是「Orbi 没有交出任何改动」，通常是 Issue 没写清楚要改什么。卡片上有「在 GitHub 上改票」和「已改好，让 Orbi 继续」两个按钮。

**需要处理账户。** 模型服务商报告账户余额不足时，卡片会写明原因，并提供模型设置的链接。后面有单独一节说明怎么处理。

<figure class="post-media">
<img src="/img/blog-stuck-cards-zh.webp" alt="中文状态页列出 4 个已停止的 Issue：#394 显示处理外部贡献的选项，#390 显示修改 Issue 后继续的按钮。" width="1280" height="913">
<figcaption>#394 需要你做决定，#390 需要先改 Issue。问题使用仓库规定的消息语言，这个测试仓库用中文；Cloud 自己的按钮跟随界面语言。</figcaption>
</figure>

## 点按钮后，GitHub 上会发生什么

重新排队按钮和回答按钮生效的时间不同。

点「已改好，让 Orbi 继续」，Cloud 会立即修改 GitHub 标签：有开放的 Orbi PR 就加 `ai-fix-needed`，没有就加 `ai-ready`，然后留一条评论，移除 `ai-blocked`。这个 Issue 随即回到队列。

点回答按钮后，Cloud 会把一条结构化回答写到 Issue 评论里。引擎下次调度检查已停止的 Issue 时，才按回答处理交付。等多久可以参考配套文章：在 Orbi Cloud 的演示仓库里，三个新 Issue 都在创建后约三分半钟内由引擎接手检查。

#394 的三个回答分别是：

- 「去 GitHub 审阅合并」打开 PR 页面。合并要由你在 GitHub 上完成，Orbi 不会代你操作。
- 「不收，让 Orbi 自己做」关闭外部 PR，再把 Issue 重新排队，让 Orbi 自己写代码。
- 「这件事不做了」关闭 Issue 和它对应的 PR。

三个选项都不会预先选中，必须由你选择。关闭操作要等引擎下一次调度，而且执行时 Issue 必须仍处于停止状态。如果你已经把它重新排队，引擎会留言说明这条回答没有执行。已关闭的 PR 可以在 GitHub 上重新打开。

评审通过后，你仍然可以拒收贡献。比如改动带来了你不想承担的维护工作，或者你打算留到后续版本再做。

回答需要仓库写入权限。Cloud 发表回答前会核对你的 GitHub 账号权限，再以 Orbi GitHub App 的身份发表评论，引擎接受这个身份的回答。直接在 GitHub 上回答时，引擎检查评论作者自己的写入权限。

## 为什么收到回答和执行完成要分开显示

回答已停止的 Issue 后，卡片标题变成「已收到您的回答，Orbi 会接着做」，项目行显示「已收到您的回答：…等 Orbi 继续」。此时，引擎还没在 GitHub 上执行回答。等它执行后，Issue 才会发生相应变化：如果回答要补充验收条件，条件会写进 Issue 正文，`ai-blocked` 会换成 `ai-fix-needed` 或 `ai-ready`。

其他按周期运行、需要人回答的 agent 工具，也可以先确认收到回答，再用一个看得见的状态变化表示执行结果。如果点击后就显示完成，用户刷新 GitHub 却看不到变化，可能会再点一次，或者换个回答。页面毫无反应，又会让人以为点击失败。

## Orbi 什么时候会自己选答案

有些问题只是在几种实现办法之间做选择，Orbi 也已经给出了推荐项和理由。遇到这类问题，Orbi 会在停下时直接采用推荐项，把选项写成 Issue 的验收条件，再将 Issue 排队。下一个会话读取的就是修改后的 Issue。

每个 Issue 最多自动采用一次推荐答案；GitHub 临时出错后的自动重新排队也占用这一次，所以自动重试不会循环下去。涉及外部代码、钱、价格或套餐的决定，以及会推翻维护者在 Issue 或 AGENTS.md 中明确要求的选择，Orbi 都不会自行处理。会打开链接或执行关闭操作的问题、确认题和文本题，也要等你回答。

Orbi 自己做了决定时，Cloud 会显示「Orbi 替你做了决定：…，理由：…」，点「改选」能重新展开回答按钮。在 GitHub 上，引擎的评论以「不合适？回复另一个选项即可」结尾。这里需要按文末格式发结构化回答，普通文字评论不会被读作答案。

## 怎样改答

有仓库写入权限的人对同一道问题提交新回答，旧回答就会被替代。如果旧回答已经写成验收条件，Orbi 会原位替换这道问题的条件，保留其他问题的条件，避免 Issue 同时要求两件相互矛盾的事。

交付还没合并时，如果新回答尚未执行，Orbi 会先拦住合并，让交付按新选择再做一轮。具体在哪一步检查，见[合并检查的说明](/zh/blog/high-frequency-agent-development/)。PR 合并后才收到的回答，无法撤销已合并的改动。

会话还在运行时也能改答。引擎更新 Issue，再重启会话，让它读到新的验收条件。默认每 60 秒检查一次新回答，最多重启三次，对应引擎配置项 `steering_poll_seconds` 和 `steering_max_rounds`。

## 模型账户余额不足

这类卡片会写明原因，并用「换一把有余额的 key」链接打开模型设置，但不会提供重新排队按钮。给服务商账户充值，或换一把有余额的 key 后，还要在 GitHub 上重新排队：有开放的 Orbi PR，就用 `ai-fix-needed` 替换 `ai-blocked`；没有则换成 `ai-ready`。引擎的失败说明里也写了这一步。只保存新 key 不会让 Issue 自动重新排队。

## 任务记录里也能回答

状态页底部的任务记录可以筛选为「需要您处理」。对于已停止的 Issue，点「查看原因与处理方法」会在当前行展开原因；如果有问题，「下一步：去回答」下面就是同一组回答按钮。答完后，这一行归入「进行中」，即使 GitHub 还显示 `ai-blocked`，因为回答正在等引擎执行。

<figure class="post-media">
<img src="/img/blog-stuck-record-reason-zh.webp" alt="任务记录筛选为「需要您处理」，#394 展开后，在「下一步：去回答」下面显示中文问题和回答按钮。" width="1280" height="913">
<figcaption>展开任务记录里的 #394，也能回答同一道问题。</figcaption>
</figure>

## 不用 Cloud，怎样回答

自托管引擎需要在 Issue 上发结构化评论。先找到 Orbi 提问的评论，读取原始正文，因为 GitHub 网页会隐藏 HTML 注释：

```sh
gh api --paginate repos/OWNER/REPO/issues/ISSUE_NUMBER/comments --jq '.[] | {id, body}'
```

问题放在隐藏的 `orbi:question:v1` 块里。记下 `question.id`，例如 `q1`，以及你要选的选项原文，再发一条新评论：

```html
<!-- orbi:answer:v1 {"q":"q1","action":"accept","value":"<the option's label>","by":"<your GitHub login>","reason":"optional reason"} -->
```

选择要由 Orbi 执行的选项时，`action` 都填 `"accept"`，包括会关闭 PR 的选项。「去 GitHub 审阅合并」这类只是链接的选项不这样回答：直接打开链接在 GitHub 上操作，引擎不会处理这类回答。具体选项填进 `value`，逐字复制问题块中的选项原文，保留问题使用的语言，引擎按文字匹配。`by` 填你的 GitHub 登录名，发表评论的账号必须有仓库写入权限。没有理由就删掉整个 `reason` 字段，空字符串会被拒绝。

另外还有两种动作：`"decline"` 把你在 `reason` 里写的内容作为新验收条件；`"cancel"` 在 Issue 停止时关闭 Issue 和它对应的 PR。要改答，就针对同一个 `q` 发一条新评论。

遇到 #390 这类需要修改 Issue 的情况，改好后手动换标签：有开放的 Orbi PR，就用 `ai-fix-needed` 替换 `ai-blocked`；没有则换成 `ai-ready`。只移除 `ai-blocked` 没有作用，引擎只接手带有排队标签的 Issue。

以上示例来自运行 Cloud v0.8.61、引擎 v0.7.52 的 Orbi beta 站。回答已停止的 Issue 需要引擎 v0.7.46 或以上版本，处理改答需要 v0.7.47 或以上版本。

## 相关

- [对比 Orbi 的交付流程](/zh/compare/?ref=blog-stuck)
- [Orbi Cloud](/zh/cloud/?ref=blog-stuck)
- [一句话需求，怎么走到 PR 合并](/zh/blog/vague-request-to-merged-pr/)
- [Orbi 的高频开发：让自动交付持续运行](/zh/blog/high-frequency-agent-development/)
- [写需求：说一句话，Orbi Cloud 替你写好 GitHub Issue](/zh/blog/write-a-request/)
