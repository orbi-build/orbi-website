---
title: Orbi 周报 #5：大需求一句话写，Orbi 拆成几张票一次建好
date: 2026-11-05
summary: 一句话写下大需求，Orbi 先拆成几张能开工的票，您确认后一次建好。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-5-card.png
mirror: orbi-weekly-5
series: newsletter
---

这是 2026 年 11 月 5 日发给订阅者的 Orbi 周报第 5 期原文。文中的价格、免费额度和界面以发出那天为准，现在的情况见 [Orbi Cloud](/zh/cloud/?ref=blog-nl05)。

您好，我是 Lawrence，Orbi 是我做的。告诉 Orbi 您想改什么，它帮您一路做到发版：AI 写代码，另一个 AI 评审，Orbi 合并并发布。这周起，需求写得再大，「写需求」页也会先拆成几张票，等您确认再一起建好。

[写一个需求 →](/zh/cloud/?ref=blog-nl05)

Orbi 起草不占免费次数，每张票的 PR 合并后才算一次。

下图里，我在测试仓库写了一句需求，Orbi 拆成了两张互不依赖的票：

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl05/split-zh-3.gif" alt="写需求页：输入一句同时改两个命令的需求，Orbi 起草后显示「拆成了 2 张，互不依赖」；点「交给 Orbi 开始做」后显示「建好了 2 张：#318、#319」。" width="932" height="925" loading="lazy" style="max-width:524px">
</figure>

## 开源引擎也能写需求

Orbi 的核心是一个开源引擎，Orbi Cloud 替您托管运行它，写需求这一步也在引擎里。自己部署引擎的，升级到 v0.7.32 或更新的版本，在终端里运行：

`orbi draft --repo 用户名/仓库名 "您的需求"`

效果和写需求页一样，您确认后才建票。

## Orbi 这周给自己干的活

10 月 29 日到 11 月 4 日，Orbi 在自己的三个仓库（引擎、Cloud、官网）合并了 148 个 PR，合并前都没有人手动改过代码，一共发了 27 个版本。写这期周报时，我在写需求页发现一处文案错误，开票后 51 分钟，Orbi 就把修复合并了。

## 本周其他更新

- 您的仓库第一次有 PR 合并后，Orbi 会发邮件，列出下一批可以交给它的任务。
- 免费次数用完后被拦下的票，开通 Orbi 付费套餐后会自动开始。
- 公开仓库的交付页默认允许搜索引擎收录，可以在项目页关掉。

有问题欢迎来用户群找我。[加入 Orbi Telegram 用户群 →](https://t.me/+kJRTTpFGBRU0M2Y9)

Lawrence  
Orbi 创始人

## 相关

- [Orbi 周报合集](/zh/guides/newsletter/)
- [Orbi 和其他编程 agent 的对比](/zh/compare/)
- [Orbi Cloud](/zh/cloud/?ref=blog-nl05)
