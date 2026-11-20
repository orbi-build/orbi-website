---
title: 交付卡住了，在状态页上点一下
date: 2026-11-20
summary: Orbi 交付停下后，先看是要回答、改 Issue，还是处理模型账户。分清两类按钮何时生效，了解改答、重新排队和自托管操作。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-stuck-delivery-one-click-card.png
mirror: stuck-delivery-one-click
---

Orbi 是一个开源引擎，在已连接仓库里接收带 `ai-ready` 标签的 GitHub Issue，由一个交付会话写代码，另一个交付会话对照 Issue 和 CI 独立评审，再由 Orbi 合并 PR；版本发布交给单独的 Release 任务。交付停下后，你需要先判断是缺一个决定，还是要改 Issue、处理账户后才能继续。下面用 Orbi Cloud 的实际例子说明怎么接续交付，也介绍一个可以用在自己产品里的设计做法：把「收到回答」和「执行回答」分开呈现。

我是 Larry 🍀 Orbi，Orbi 的创始人。

Orbi Cloud 是托管版，替你运行同一个开源引擎。Issue 承载任务，交付会话是 agent 在这个任务上的一段工作过程。Orbi 用 GitHub 标签记录状态：`ai-ready` 表示排队中，`ai-in-progress` 表示正在做，`ai-blocked` 表示已停止，`ai-fix-needed` 表示已有交付 PR 要再做一轮，`ai-merged` 表示交付已合并。

## 先分清：交回 Orbi，还是回答问题

打开 [Orbi Cloud](/zh/cloud/?ref=blog-stuck)，用 GitHub 登录，进入已连接项目的状态页。「Orbi 卡住了，需要您看一下」卡片会显示原因，并给出相应操作。

- 「已改好，让 Orbi 继续」是重新排队按钮。Cloud 会立即修改 GitHub 标签：有开放的 Orbi 交付 PR，就先加 `ai-fix-needed`；没有就加 `ai-ready`。随后留一条重新排队的评论，再移除 `ai-blocked`，让引擎能再次接手这个 Issue。
- 问题下面的回答按钮，会在 Issue 上发布一条结构化回答评论。引擎到下一次调度才执行回答，包括回答所需的标签变更。页面先确认收到，执行随后发生。

<figure class="post-media">
<img src="/img/blog-stuck-flow-zh.webp" alt="中文状态页动图：查看已停止 Issue 的回答选项，把任务记录筛选为「需要您处理」，再展开 #394 的原因和回答按钮。" width="1280" height="913">
<figcaption>beta 站实拍：卡片上的回答入口，以及任务记录里展开的同一道问题。</figcaption>
</figure>

## 有些要改 Issue，有些要你决定

[Issue #390](https://github.com/xqliu/orbi-e2e-2609260042/issues/390) 的原因是「Orbi 没有交出任何改动」。这张卡片给出的恢复步骤是「在 GitHub 上改票」，再点「已改好，让 Orbi 继续」。先按停止原因和处理说明修改 Issue，写清楚该改成什么，再重新排队。

Issue #394 则停在一个决定上。它来自测试仓库 `xqliu/orbi-e2e-2609260042`，对应的 PR #393 在 Orbi 之外创建，用来模拟外部贡献。Orbi 的评审已经通过，但引擎从不自行合并外部贡献者的代码，所以要问维护者收不收。一般来说，即使评审通过，你也可能不愿接受贡献带来的长期维护工作，这仍是拒收的合理理由。

每次决策停点可以带一道结构化问题；选择题有 2 到 4 个按钮，也可以在「（选填）一句理由」里补充背景。同一个 Issue 多次停下，就可能留下多道问题。`ai-blocked` 标签本身并不代表有问题可答，模型服务商余额不足这样的账户问题有自己的处理方式。交付开始前的提问，见[《一句话需求，怎么走到 PR 合并》](/zh/blog/vague-request-to-merged-pr/)。

<figure class="post-media">
<img src="/img/blog-stuck-cards-zh.webp" alt="中文状态页列出 4 个已停止的 Issue：#394 显示处理外部贡献的选项，#390 显示改 Issue 后交回 Orbi 的按钮。" width="1280" height="913">
<figcaption>#394 等你做决定，#390 要先改 Issue。问题按仓库规定的消息语言撰写，这个测试仓库用中文。</figcaption>
</figure>

#394 的三个操作分别是：

- 「去 GitHub 审阅合并」打开 PR，由你在 GitHub 上处理合并。
- 「不收，让 Orbi 自己做」让引擎关闭外部 PR，再把 Issue 重新排队，交给 Orbi 完成。
- 「这件事不做了」让引擎关闭 Issue 和它指向的 PR。

这两种关闭操作要等引擎下一次调度、在 Issue 仍处于停止状态时执行。三个选项都没有推荐项，也不会自动执行。已关闭的 PR 可以在 GitHub 上重新打开。

## 收到回执后，引擎怎样接手

回答已停止的 Issue 后，卡片标题会变成「已收到您的回答，Orbi 会接着做」，项目行显示「已收到您的回答：…等 Orbi 继续」。引擎要到下一次调度才读取并执行这条回答。

如果回答是补充验收条件、恢复交付，执行后的变化可以在 GitHub 上看到：Issue 出现这条条件，`ai-blocked` 换成 `ai-fix-needed` 或 `ai-ready`，分别对应有开放的 Orbi 交付 PR、没有交付 PR 的情况。

谁有权回答，由账号权限决定。Cloud 先核对当前登录用户有没有仓库写入权限，再以 Orbi GitHub App 的身份发布评论。Runner 本身使用的就是这个账号，引擎信任这个身份。直接在 GitHub 上回答时，引擎检查评论作者自己的仓库写入权限。回答里的 `by` 只记录是谁回答，不授予权限。

## Orbi 什么时候可以自己选推荐项

如果问题是在几种实现办法之间做选择，而答案只会给 Issue 增加一条验收条件、恢复交付，Orbi 可以自行采用带理由的推荐项。下一段交付会话会从修改后的 Issue 读到这条条件。

每个 Issue 从开到关，最多自动恢复一次。GitHub 临时错误后的自动重新排队也占用同一次机会，防止自动重试循环。新开交付会话不会重置次数。

接受外部代码、涉及钱、价格或套餐，以及推翻维护者在 Issue 或 AGENTS.md 中明确写下的要求，都留给你决定。Orbi 不会自动打开链接或执行关闭操作，也不会自动回答确认题、文本题。选择题没有推荐项时，同样要等你回答。

引擎会在评论里说明选了什么、为什么选，并写着「不合适？回复另一个选项即可」。在 Cloud 上，点「改选」就能重新展开回答控件。在 GitHub 上，要按文末格式发一条新的结构化回答评论；普通文字回复不会作为答案读取，因为引擎需要从结构化评论里确定对应的问题和选项。

## 合并前改答，会先落实新选择

对于修改 Issue、恢复交付这类回答，同一道题有了新的有效可信回答，旧答案就会被替代。如果旧答案已经写入 Issue，Orbi 会原位替换这道题的验收条件，保留其他问题的条件，避免同一道题留下相互冲突的要求。

交付还没合并时，新回答如果尚未落实，会挡住合并，让交付回去应用新选择。PR 合并以后，回答不能撤销已经合并的改动。合并前在哪里检查新回答，见[高频开发一文](/zh/blog/high-frequency-agent-development/)。

运行中的交付会话也能接收结构化改答：引擎先把新验收条件写进 Issue，让重启后的交付会话读到它。默认每 60 秒检查一次可信的回答评论，最多重启三次；检查间隔和次数都可配置。已停止的 Issue 则走前面所说的调度流程。

## 模型服务商余额不足，先处理账户

这类停止会在卡片上写明原因，并用「换一把有余额的 key」链接打开模型设置。Cloud 按配置使用你自己的模型 key 或默认 key。

你可以给有权管理的服务商账户充值，也可以在模型设置里换一把有余额的 key。完成后，仍要按引擎的失败说明，在 GitHub 上把 Issue 重新排队：有开放的 Orbi 交付 PR，就用 `ai-fix-needed` 替换 `ai-blocked`；没有则换成 `ai-ready`。只保存新 key 不会让余额不足的 Issue 重新排队。

## 任务记录里也能回答

任务记录可以按「全部」「进行中」「排队中」「需要您处理」「已完成」筛选，初始选中「全部」。开放且已停止的 Issue，点「查看原因与处理方法」会在当前行展开原因；有问题时，「下一步：去回答」下面就是同一组回答控件。

答完后，这一行归入「进行中」，即使 GitHub 仍显示 `ai-blocked`，因为回答已经提交，正在等 Orbi 接手。

<figure class="post-media">
<img src="/img/blog-stuck-record-reason-zh.webp" alt="任务记录筛选为「需要您处理」，#394 展开后，在「下一步：去回答」下面显示问题和回答按钮。" width="1280" height="913">
<figcaption>在任务记录展开 #394，也能回答同一道题。</figcaption>
</figure>

## 自托管：发结构化评论，或手动重新排队

自托管用户可以直接在 Issue 上发一条[结构化回答评论](https://github.com/orbi-build/orbi/blob/v0.7.52/src/orbi/answer.py)。先列出 Issue 的评论，找到 Orbi 提问的那一条：

```sh
gh api --paginate repos/OWNER/REPO/issues/ISSUE_NUMBER/comments --jq '.[] | {id, body}'
```

把那条评论的数字 `id` 填入 `COMMENT_ID`，读取原始正文。GitHub 网页会隐藏 HTML 注释：

```sh
gh api repos/OWNER/REPO/issues/comments/COMMENT_ID --jq .body
```

在隐藏的 `orbi:question:v1` 块里找到 `question.id`，填入回答的 `q`：

```html
<!-- orbi:answer:v1 {"q":"q1","action":"accept","value":"<the option's full label>","by":"<your GitHub login>","reason":"optional reason"} -->
```

选择任意一个选项时，`action` 都填 `"accept"`，包括会关闭 PR 的选项。具体选哪个，由 `value` 携带：照抄问题里选项的完整文字，保留问题使用的语言。即使 Cloud 的固定按钮用了另一种语言，也要以问题里的选项为准，因为引擎按选项文字匹配。

另外两种动作有各自的用途。使用 `"decline"` 时，引擎取非空的 `reason`，没有这个字段才取 `value` 中的文字，写成验收条件后恢复交付。`"cancel"` 只在 Issue 停止时关闭 Issue 和它指向的 PR。

`by` 填你的 GitHub 登录名，发表评论的账号必须有仓库写入权限。没有理由就删除整个 `reason` 字段，空字符串会被拒绝。要改答，就针对同一个 `q` 发一条新的结构化评论。

遇到 #390 这类需要改 Issue 的情况，改好后手动换标签：有开放的 Orbi 交付 PR，就用 `ai-fix-needed` 替换 `ai-blocked`；没有则换成 `ai-ready`。只摘掉 `ai-blocked` 没有作用，引擎需要排队标签才能再次接手。

版本范围：示例来自使用 Cloud v0.8.61、引擎 v0.7.52 的 beta 站；回答流程要求引擎 v0.7.46+，改答处理要求 v0.7.47+。

## 相关

- [对比 Orbi 的交付流程](/zh/compare/?ref=blog-stuck)
- [Orbi Cloud](/zh/cloud/?ref=blog-stuck)
- [一句话需求，怎么走到 PR 合并](/zh/blog/vague-request-to-merged-pr/)
- [Orbi 的高频开发：让自动交付持续运行](/zh/blog/high-frequency-agent-development/)
- [写需求：说一句话，Orbi Cloud 替你写好 GitHub Issue](/zh/blog/write-a-request/)
