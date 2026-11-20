---
title: Orbi 周报 #1：k8e 的 etcd 测试先被打回，以及 9 月最后一周的新东西
date: 2026-10-08
summary: 9 月最后一周：k8e 的 etcd 测试被打回又合进去了；Orbi 的 Claude 插件发布了；Cloud 支持支付宝 / 微信开通。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-1-card.png
mirror: orbi-weekly-1
series: newsletter
---

这是 2026 年 10 月 8 日发给订阅者的 Orbi 周报第 1 期原文。文中的价格、免费额度和界面以发出那天为准，现在的情况见 [Orbi Cloud](/zh/cloud/?ref=blog-nl01)。

你好，

这是 Orbi 的第一封周报。每周讲一次真实交付，从开票到合并，再说说 Orbi 自己上了什么。

## 这期的交付：给 k8e 写 etcd 测试，先被打回

k8e 是一个内嵌 etcd 的 Kubernetes 发行版，497 星。9 月 20 日，维护者 Deshi Xiao 开了 #612，要一套分四期的 etcd 健壮性测试，10:28 打上 `ai-ready` 交给了 Orbi。

11:37 Orbi 开出 PR #613，只做第一期，2483 行。13:21 维护者的评审打了回来。三条意见说的是同一件事：数据没恢复对的时候，这套测试会报「恢复正确」。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl01/pr613-review-v2.png" alt="维护者 xiaods 在 PR #613 上的评审：结论 REQUEST_CHANGES，测试方向有价值，但恢复判定器和故障观察边界存在会漏报的数据正确性问题。" width="856" height="530" loading="lazy" style="max-width:544px">
<figcaption>维护者在 PR #613 上的评审（截自 GitHub）。</figcaption>
</figure>

- 判定器把结果未知的 CAS 当成普通写入，放过了一个不可能出现的结果；
- 记录器和被 SIGKILL 的 etcd 跑在同一个进程里，写入确认了也可能没记下来；
- 写入空值和键不存在分不清，空值键丢了测试照样通过。

15:05，一个 commit 把三条都改了，第一条和第三条各补了正反两个方向的测试。Orbi 自己也出了错：引擎非要 PR 正文写 `Fixes #612`，可这张票分四期，这一行会让票在第一期合并时就被关掉。评审是对的，引擎死守规则，runner 为此崩了 84 次。

[读完整复盘，包括时间线和修法 →](https://orbi.build/zh/blog/k8e-rejected-then-merged/?ref=blog-nl01)

## 9 月最后一周上新

Orbi 的 Claude 插件刚发布。在 Claude Code 或 Cursor 里把需求聊清楚，敲 `/orbi:ship`，它把对话写成一张带验收清单的 ai-ready 票交给 Orbi；`/orbi:status` 查进度。[安装说明](https://github.com/orbi-build/orbi/tree/main/integrations/claude-plugin)

Orbi Cloud 的月额度放大了，价格不变：Solo 的 token 月额度从 100M 提到 400M，Pro 从 300M 提到 1.2B。

Solo 和 Pro 现在也可以用支付宝或微信一次付清，月付、年付都行。

DeepSeek 模板之前把 deepseek-flash 的上下文限在 131072，Orbi 自己的交付有 42% 撞上了压缩，现在放开到 1M。

不允许 merge commit 的仓库，之前合并会失败，现在能合了。

## 把一张票交给 Orbi

在仓库里给 Issue 打上 `ai-ready`，Orbi 接着写代码、过 CI、评审、合并，一路做到发版。Orbi Cloud 每个账号可以先试 3 次合并交付，不用绑卡。创始伙伴永久 5 折，一共 6 个名额，结账时填 `FOUNDING50`。

[连上第一个仓库 →](https://orbi.build/zh/cloud/?ref=blog-nl01)

想自己部署也行，Orbi 是开源的：[github.com/orbi-build/orbi](https://github.com/orbi-build/orbi)。

手上有想交出去的票，或者卡在哪一步了，直接回这封信。

## 相关

- [Orbi 周报合集](/zh/guides/newsletter/)
- [Orbi 和其他编程 agent 的对比](/zh/compare/)
- [Orbi Cloud](/zh/cloud/?ref=blog-nl01)
