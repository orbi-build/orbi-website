---
title: Orbi 周报 #3：Telegram 通知与终端 Follow 模式
date: 2026-10-22
summary: 本周重点：Telegram 交付通知、终端 Follow 模式。进展直接送到您手边。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-3-card.png
mirror: orbi-weekly-3
series: newsletter
---

这是 2026 年 10 月 22 日发给订阅者的 Orbi 周报第 3 期原文。文中的价格、免费额度和界面以发出那天为准，现在的情况见 [Orbi Cloud](/zh/cloud/?ref=blog-nl03)。

您好，我是 Orbi 的创始人 Lawrence。这周，Orbi 的交付进展可以直接发到 Telegram；自己部署的用户，也能用 Follow 模式在终端实时跟进。

[设置 Cloud 的 Telegram 通知 →](/zh/cloud/?ref=blog-nl03)

## Telegram 通知和中文评论

Orbi 卡住、要您补充信息、等您批准合并，或者合并了代码，都会给您发 Telegram 消息。Cloud 版在[设置页](/zh/cloud/?ref=blog-nl03)打开，开源版 v0.7.1 起支持，见[配置说明](https://docs.orbi.build/zh/configuration#通知)。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl03/telegram-zh.gif" alt="Telegram 里 Orbi 发来的消息：先是「需要您处理：需要您补充信息」和一条「代码已合并」，随后底部又进来一条「代码已合并」。每条都带仓库、编号和链接。" width="980" height="577" loading="lazy">
</figure>

评论和 Telegram 消息用什么语言，现在可以在设置的「Orbi 消息语言」里选择。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl03/comment-zh.png" alt="GitHub Issue 上 Orbi 写的中文评论：「Orbi 已合并 PR：#165」，评审通过、没有发现问题，合并目标 main，最后一行是「这次交付免费（免费额度还剩 2 次）」。" width="600" height="262" loading="lazy">
</figure>

## 开源版在终端里实时看进度

自己部署开源版的，用 `orbi status --follow` 就能在终端里实时看到 Issue 的进度（[v0.7.0 发布说明](https://github.com/orbi-build/orbi/releases/tag/v0.7.0)）。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl03/follow-zh.gif" alt="终端里 orbi status --follow 的输出，同一个 Issue 的标签从 ai-needs-detail 一路变到 ai-merged。" width="768" height="264" loading="lazy">
</figure>

## 进度在同一页自动更新

状态页上的进度会自动更新到合并完成，不用您手动刷新。页面也重新排了版：每种状态只留一个主按钮，新账号的开通步骤改成对钩加进度条。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl03/progress-zh.gif" alt="「现在的状态」从「Orbi 正在检查改动 #2」自动更新为「Orbi 已完成」和「改动已经合并到项目」。" width="560" height="200" loading="lazy">
</figure>

## 先在示例仓库里试一次

用官方模板在自己的 GitHub 账号下建一个示例仓库，就能让 Orbi 做一次小改动。下面这个例子，让 Orbi 给待办清单加上剩余项数：勾掉一项，计数从 3 变成 2。[试一个官方示例](/zh/cloud/?ref=blog-nl03)，不占新账号的 3 次免费合并额度。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl03/demo-result-v3-zh.gif" alt="示例需求是给待办清单加上剩余项数。Orbi 改好后的应用中，勾掉一项待办，顶部计数从 3 items left 变成 2 items left。" width="1200" height="1120" loading="lazy" style="max-width:400px">
</figure>

## 来 Telegram 和我聊

有问题或建议，来用户群找我；不方便公开说的，直接私聊我。[加入 Orbi Telegram 用户群 →](https://t.me/+kJRTTpFGBRU0M2Y9)

Lawrence  
Orbi 创始人

动图录自测试环境和我的测试仓，已加速。

## 相关

- [Orbi 周报合集](/zh/guides/newsletter/)
- [Orbi 和其他编程 agent 的对比](/zh/compare/)
- [Orbi Cloud](/zh/cloud/?ref=blog-nl03)
