---
title: Orbi 周报 #7：免费试用改成 14 天，卡住一键交回，急的需求优先做
date: 2026-11-20
summary: 这周 Orbi Cloud：试用改成 14 天，卡住的需求改好后一键交回，急的需求能插队。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-orbi-weekly-7-card.png
mirror: orbi-weekly-7
series: newsletter
---

这是 2026 年 11 月 20 日发给订阅者的 Orbi 周报第 7 期原文。文中的价格、免费额度和界面以发出那天为准，现在的情况见 [Orbi Cloud](/zh/cloud/?ref=blog-nl07)。

您好，我是 Lawrence。Orbi 把您的需求一路做到发版：AI 写代码，另一个 AI 评审，Orbi 合并并发布。这周试用规则改了，还上线了三个新功能。

[写一个需求 →](/zh/cloud/?ref=blog-nl07)

写一句话就行，Orbi 会读您的代码，把这句话整理成 Issue 再开工；还没连仓库的，会先带您连上。

## 免费试用改成 14 天，期间合并 PR 不限次数

注册后 14 天内，合并多少个 PR 都不收费，不用绑卡。之前注册的账号分两种：原来 3 次免费没用完的，试用到 12 月 4 日；已经用完的，在状态页开始一次示例任务，也能再用 14 天。到期后不订阅，新的交付会暂停，已有的数据都保留。模型用量上限等细则见[额度与限制](https://cloud-docs.orbi.build/zh/limits-and-quotas?ref=blog-nl07)。

## 需求只写一句，Orbi 先补验收条件再开工

在「写需求」页写一句，或者自己在 GitHub 开一张只有一句话的 Issue、打上 `ai-ready`，都不用先写清验收条件。Orbi 先把条件补进 Issue，再写代码、评审、合并。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl07/criteria-zh.gif" alt="GitHub Issue「想一下清空所有待办」，正文只有一句「列表乱了，想全清掉重来。」；随后正文里多了「验收」一节和三条条件；最后这个 Issue 显示 Closed，旁边是合并它的 PR #24。" width="804" height="617" loading="lazy">
<figcaption>本期动图都录自我们的测试仓库；图里这一例：Issue 开出后 90 秒补好条件，8 分钟内 PR 合并</figcaption>
</figure>

## 需求卡住了，点一下交回 Orbi

Orbi 交不出改动时会停下，状态页写明原因。在 GitHub 上把 Issue 改清楚，回到状态页点「已改好，让 Orbi 继续」就行。有的问题必须您来定（比如收不收外部贡献者的代码），Orbi 会停下来问您，在卡片上点选项就行。其余带推荐答案的问题，它先照推荐的做，卡片上写着它选了什么，不合适可以改选。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl07/stuck-zh.gif" alt="状态页上一个卡住的需求：原因是「Orbi 没有交出任何改动」，下面是「在 GitHub 上改票」和「已改好，让 Orbi 继续」两个按钮；点了后者，卡片里出现「已重新交给 Orbi：#390 会接着做，进度这一页自动更新。」" width="799" height="163" loading="lazy">
</figure>

## 急的需求，点「优先做」插到最前

在状态页的任务记录里，给排队的需求点「优先做」。正在做的那个做完，Orbi 接着就做它。

<figure class="post-media">
<img src="https://newsletter.orbi.build/img/nl07/prio-zh.gif" alt="手机上的任务记录：两个排队中的需求 #417 和 #416 都带「优先做」；点了 #416 的「优先做」后，它排到最上面，显示「已标为优先」。" width="750" height="525" loading="lazy" style="max-width:390px">
</figure>

## 其他更新

- 任务记录能按状态筛选，停下的需求点开就能看原因。
- 每次交付都有一页公开的交付证明，首屏显示 Orbi 用了多久、花了多少 AI 费用。
- 同一个失败连续出现 3 次，Orbi 会停下来交给您，不再反复重试。
- GitHub 临时出错，Orbi 会自动重试；主分支的检查失败时，Orbi 会开一张修复 Issue。
- 上周 Orbi 在自家三个仓库合并了自己开的 86 个 PR，发了 19 个版本。
- 往期周报都在官网：[Orbi 周报合集](https://orbi.build/zh/guides/newsletter/?ref=blog-nl07)。
- 自己部署的：引擎 v0.7.53 也有补验收条件、自动重试和开修复 Issue，补验收条件要在 `.github/orbi.toml` 里设 `clarify_thin_tickets = true`。

## 这周的文章

- [一句话需求，怎么走到 PR 合并](https://orbi.build/zh/blog/vague-request-to-merged-pr/?ref=blog-nl07)
- [AI 编码交付卡住后，怎么让 Orbi 继续](https://orbi.build/zh/blog/stuck-delivery-one-click/?ref=blog-nl07)
- 另外三篇实测：[Devin vs Cursor](https://orbi.build/zh/blog/devin-vs-cursor/?ref=blog-nl07)、[OpenCode vs Cursor](https://orbi.build/zh/blog/opencode-vs-cursor/?ref=blog-nl07)、[Cline vs Claude Code](https://orbi.build/zh/blog/cline-vs-claude-code/?ref=blog-nl07)。

有问题来用户群找我。[加入 Orbi Telegram 用户群 →](https://t.me/+kJRTTpFGBRU0M2Y9)

Lawrence  
Orbi 创始人

## 相关

- [Orbi 周报合集](/zh/guides/newsletter/)
- [Orbi 和其他编程 agent 的对比](/zh/compare/)
- [Orbi Cloud](/zh/cloud/?ref=blog-nl07)
