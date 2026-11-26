---
title: Orbi 周报 #8：写需求可以附截图了，同事按 GitHub 权限一起用
date: 2026-11-26
summary: 写需求可以附截图了；在 GitHub Issue 里贴一张截图，Orbi 也照着图改。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-8-card.png
mirror: orbi-weekly-8
series: newsletter
---

这是 2026 年 11 月 26 日发给订阅者的 Orbi 周报第 8 期原文。文中的价格、免费额度和界面以发出那天为准，现在的情况见 [Orbi Cloud](/zh/cloud/?ref=blog-nl08)。

您好，我是 Lawrence，在做 Orbi。您说一句想改什么，Orbi 先把它写成需求，再让 AI 写代码、另一个 AI 评审，最后合并发版。这周起，需求可以带截图了。

[写一个需求 →](/zh/cloud/?ref=blog-nl08)

用 GitHub 登录，写一句话、贴一张图就行；还没连仓库的，会先带您连上。

## 写需求时附截图

在写需求页粘贴或拖入一张截图，再写一句话。颜色、位置这类不好描述的，画在图里就行。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl08/attach-zh.gif" alt="写需求页：输入框里只有一句「照截图给每条待办加优先级」，附着一张草图；点开草图，画的是每条待办前加红、橙、灰三色的「高、中、低」标签；提交后，Orbi 写出的需求标题是「给每条待办加优先级标签（高=红、中=橙、低=灰）」。" width="730" height="660" loading="lazy">
<figcaption>测试仓库实录：只写了一句话，颜色规则只画在草图里，Orbi 照图写进了需求</figcaption>
</figure>

不到 13 分钟，改动合并了（测试应用是英文界面）：

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl08/result-zh.png" alt="合并后的待办应用：三条待办前分别是红色 High、橙色 Medium、灰色 Low 标签，输入框右侧多了优先级下拉框。" width="900" height="570" loading="lazy">
</figure>

## 自己部署的，命令行也能附图

引擎 v0.7.64 起，`orbi draft` 加上 `--attach`，截图、HTML 或文本就一起交给 Orbi 起草；按回车，Issue 就建好、排上队了。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl08/cli2-zh.gif" alt="先是一张效果图：greet_all 的四种输入和对应输出，规则是名字用逗号隔开、最后两个之间用 and、空列表返回 stranger；然后终端里执行 orbi draft --attach want.png &quot;照截图加一个函数&quot;，Orbi 写出的需求列着图上的四种输入输出；按回车后建出 Issue #9。" width="518" height="580" loading="lazy">
<figcaption>本机自部署实录：命令里只写了「照截图加一个函数」，输入输出都在图里</figcaption>
</figure>

## 同事按 GitHub 权限一起用

同事用自己的 GitHub 账号登录，不用邀请就能进您的项目。能做什么跟着他在仓库上的角色走：只读能看进度，可分诊能提需求，可写还能建版本；设置和付费只有项目主人能改（组织的项目是管理员）。大家用的都是计费账号的额度，点右上角头像就能看到是哪个账号。

## 其他更新

- 提交需求后，进度一直留在第一屏，刷新也不重新计时。
- 新建版本时，会一起建好这个版本的 Release 任务，需求做完就发版。
- 仓库在 GitHub 上被删除或转走，Orbi 一小时内断开它，并告诉您原因。
- 需求卡住时，状态页只写一句原因和一句下一步。
- 过去一周，Orbi 在自家仓库合并了自己开的 264 个 PR，发了 32 个版本。

## 这周的文章

- [让 AI 改页面，把截图直接附进 Issue](https://orbi.build/zh/blog/attach-screenshot-to-issue/?ref=blog-nl08)
- [CLAUDE.md 和 AGENTS.md：各家 agent 到底读哪个](https://orbi.build/zh/blog/claude-md-vs-agents-md/?ref=blog-nl08)
- [Claude Ship：它自动做了什么，又停在哪一步](https://orbi.build/zh/blog/claude-ship/?ref=blog-nl08)
- [Pi vs omp（Oh My Pi）：同一模型，无人值守实测](https://orbi.build/zh/blog/pi-vs-oh-my-pi/?ref=blog-nl08)

往期周报都在官网：[Orbi 周报合集](https://orbi.build/zh/guides/newsletter/?ref=blog-nl08)。

有问题来用户群找我。[加入 Orbi Telegram 用户群 →](https://t.me/+kJRTTpFGBRU0M2Y9)

Lawrence  
Orbi 创始人

## 相关

- [Orbi 周报合集](/zh/guides/newsletter/)
- [Orbi 和其他编程 agent 的对比](/zh/compare/)
- [Orbi Cloud](/zh/cloud/?ref=blog-nl08)
