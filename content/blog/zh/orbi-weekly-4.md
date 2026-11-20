---
title: Orbi 周报 #4：需求没写清，Orbi 先替您拆好、补全
date: 2026-10-29
summary: 本周：需求写得粗，Orbi 先给拆分方案和验收条件；默认分支 CI 失败时先暂停，恢复后自动合并；Orbi 两天半为第一位重度用户合并了 60 个 PR；从 GitHub 一点回到项目页；Orbi 给自己做了一次大重构。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-4-card.png
mirror: orbi-weekly-4
series: newsletter
---

这是 2026 年 10 月 29 日发给订阅者的 Orbi 周报第 4 期原文。文中的价格、免费额度和界面以发出那天为准，现在的情况见 [Orbi Cloud](/zh/cloud/?ref=blog-nl04)。

您好，我是 Lawrence。这周最大的变化：需求写得粗也没关系，Orbi 会先给出拆分方案或验收条件，您确认后就排队开工。另外，Orbi Cloud 迎来第一位重度外部用户：两天半，Orbi 在这位用户的仓库里合并了 60 个 PR，最多一天 29 个。

[写一个需求 →](/zh/cloud/?ref=blog-nl04)

用一句话写想改什么，Orbi 先出草稿，您点「交给 Orbi」后才开工。还没连仓库的，会先带您连上。

## 需求写得粗，Orbi 先给方案

几件事写在一张票里，或者没说怎么算做完，以前 Orbi 会先停下来请您补。现在它直接在评论里给方案：该拆的，列出拆成哪几张、每张怎么验收；缺验收的，替您写好验收条件。觉得不对，就在 GitHub 上直接改那条评论；没问题就回复：拆分方案回 `/orbi split`，验收条件回 `/orbi amend`，Orbi 按评论当前的内容开工。项目页上也有这张卡片：「改一改」只改方案，点「按这个拆分开工」或「就按这个开工」才开工。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl04/split-card-zh.gif" alt="项目页上的动图：卡片写着「Orbi 建议把这张票拆成 3 张」，每张带验收；点「改一改」可以直接改方案文字；点「按这个拆分开工」后卡片变成「已提交，Orbi 正在处理」；约 1 分钟后任务记录里出现拆出来的三张票，都在排队。" width="932" height="724" loading="lazy" style="max-width:524px">
</figure>

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl04/amend-card-zh.gif" alt="动图：卡片写着「Orbi 帮您补好了验收条件」并列出两条；点「就按这个开工」后变成「已提交」；随后 GitHub 上 Orbi 的回执说已把验收条件写进票面「## 验收」，工单已进入队列。" width="932" height="844" loading="lazy" style="max-width:524px">
</figure>

## 默认分支的 CI 失败了，PR 也不用干等

默认分支上的 CI 本来就是失败的，即使 PR 本身没问题也合不进去。现在 Orbi 会说明 PR 已经做好，列出默认分支上失败的检查，给您两条路：自己修好默认分支，或者回复 `/orbi fix-base`（需要仓库写权限），Orbi 为每项失败的检查各开一张修复票。默认分支的 CI 恢复正常后，Orbi 就自动合并原来的 PR，同一条评论跟着更新。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl04/fixbase-flow-zh.gif" alt="三帧动图，都是 GitHub 上的评论：第一帧，Orbi 说 PR 已就绪，但基础分支 main 上的 test (20)、test (22) 本来就是失败的，所以暂停，并给出两种下一步；第二帧，用户回复 /orbi fix-base，Orbi 回复已创建两张修复票；第三帧，同一条暂停评论多了两行：main 已经变绿，Orbi 自动合并了这个 PR。" width="1048" height="1527" loading="lazy" style="max-width:524px">
</figure>

## 排一串，按顺序做

这位重度用户常常一次排一长串 Issue。现在同一优先级的需求按排进来的顺序处理；最高优先级和缺陷票先做。

## 从 GitHub 一点回到项目页

Orbi 在 Issue 和 PR 下的评论多了一行「项目状态」，点一下就到这个仓库的项目页，看做到了哪一步。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl04/status-link-zh.gif" alt="先是 GitHub 上 Orbi 的评论，第三行是「项目状态：查看项目状态」；点进去是 Orbi 的项目页，显示「Orbi 正在检查改动 #216，通过后自动合并到项目」和当前进度。" width="500" height="292" loading="lazy" style="max-width:500px">
</figure>

## Orbi 给自己做了一次大重构

这周开源引擎合并了 21 个重构 PR，其中 20 个是 Orbi 自己交付的。主调度文件从 4059 行减到 3060 行，源码模块由 63 个增至 84 个。

## 来找我聊

项目页、连接页和写需求页的右下角这周加了对话窗口，用着哪里不明白，在页面上直接问。

也欢迎来用户群找我；不方便公开说的，私聊我。[加入 Orbi Telegram 用户群 →](https://t.me/+kJRTTpFGBRU0M2Y9)

Lawrence  
Orbi 创始人

截图和动图来自测试环境和我的测试仓。

## 相关

- [Orbi 周报合集](/zh/guides/newsletter/)
- [Orbi 和其他编程 agent 的对比](/zh/compare/)
- [Orbi Cloud](/zh/cloud/?ref=blog-nl04)
