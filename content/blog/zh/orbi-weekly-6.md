---
title: Orbi 周报 #6：写一句话，Orbi 直接开工
date: 2026-11-12
summary: 这周起，写一句话 Orbi 就开工；空仓库点个例子也行。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-6-card.png
mirror: orbi-weekly-6
series: newsletter
---

这是 2026 年 11 月 12 日发给订阅者的 Orbi 周报第 6 期原文。文中的价格、免费额度和界面以发出那天为准，现在的情况见 [Orbi Cloud](/zh/cloud/?ref=blog-nl06)。

您好，我是 Lawrence，Orbi 是我做的。告诉 Orbi 您想改什么，它帮您一路做到发版：AI 写代码，另一个 AI 评审，Orbi 合并并发布。

[写一个需求 →](/zh/cloud/?ref=blog-nl06)

没连仓库的话，会先让您用 GitHub 登录、挑一个仓库。写需求不花免费次数，PR 合并了才算一次。

从这周起，在写需求页写一句话，Orbi 写好草稿就直接建票开工，不用您再点确认。

只有真拿不准，它才会问您。问题下面列好了几个选项，推荐的那个已经替您选上，多数时候点一下就够了；同时它会发一封邮件，您不在页面上也看得到。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl06/draft-zh-v2.gif" alt="写需求页：输入「在笔记列表上方显示共 N 条，添加笔记后数字跟着变」，点「让 Orbi 写草稿」；Orbi 写好草稿后，页面显示「已交给 Orbi · 排队中 · 在 GitHub 查看（Issue #2）」，中间没有再点确认。" width="600" height="632" loading="lazy" style="max-width:524px">
<figcaption>在测试环境里录的，到最后一帧，需求已经排上队了</figcaption>
</figure>

状态页上的任务建议也改成点一下就开工。想最快看到 Orbi 干活，挑标着「约 10 分钟出 PR」的那条。

Issue 和 PR 都在您自己的 GitHub 上。评审通过后 Orbi 默认自己合并；您想亲自批，给分支加一条保护规则。

## 还没写代码的仓库也能开工

连上一个新建的空仓库，状态页会问您想做什么，旁边放了两个现成的例子：待办清单网页、计算器网页。点一个，Orbi 就在这个仓库里动手。

## 这周写的四篇实测

- [最好的 AI 编程 agent 怎么选：在自己的仓库上试一周](https://orbi.build/zh/blog/best-ai-agent-for-coding/?ref=blog-nl06)
- [OpenCode vs Codex CLI：同一模型，无人值守实测](https://orbi.build/zh/blog/opencode-vs-codex/?ref=blog-nl06)
- [systemd 到 launchd：1,548 次 macOS CI 查出了什么](https://orbi.build/zh/blog/systemd-to-launchd/?ref=blog-nl06)
- [Cursor 替代品怎么选：编辑器、后台 agent 与合并发版](https://orbi.build/zh/blog/cursor-alternatives/?ref=blog-nl06)

## Orbi 这周给自己干的活

11 月 5 日到 11 日，Orbi 在引擎、Cloud、官网三个仓库里合并了自己开的 148 个 PR，Cloud 占了 95 个。引擎和 Cloud 加起来发了 13 个版本。

## 自己部署引擎的看这里

升级到 v0.7.41 后，`orbi draft` 和写需求页一个脾气：有默认答案的直接写进需求的「假设」，非问不可的才问，每个问题给 2 到 4 个选项，推荐的排第一。

## 其他更新

- 第一个 PR 一合并，通知邮件马上就到，标题和链接都在里面。所有通知邮件也换了排版，长链接收进了文字，手机上好读得多。
- 如果票是因为 Orbi 应用缺权限停下的，您在 GitHub 上批准新权限后，它会自己接着跑。
- 有先后顺序的一批票，可以一次全打上 `ai-ready`，再用 GitHub 的「blocked by」标出谁等谁。前一张不关，Orbi 不碰后一张。
- 没登录、没装应用也能先点订阅。登录、装好以后，页面直接回到付款，邮箱已经填上；付完款，状态页马上显示「订阅已生效」。中文页的套餐区还能用支付宝或微信一次付清。

有问题来用户群找我。[加入 Orbi Telegram 用户群 →](https://t.me/+kJRTTpFGBRU0M2Y9)

Lawrence  
Orbi 创始人

## 相关

- [Orbi 周报合集](/zh/guides/newsletter/)
- [Orbi 和其他编程 agent 的对比](/zh/compare/)
- [Orbi Cloud](/zh/cloud/?ref=blog-nl06)
