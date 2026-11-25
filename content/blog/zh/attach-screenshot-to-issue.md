---
title: 让 AI 改页面，把截图直接附进 Issue
date: 2026-11-25
summary: orbi draft --attach 把截图、HTML 和文本文件写进 GitHub Issue，起草、交付、评审三个阶段都看得到。文中用一次真实运行讲清附件的上限，以及读不到附件时 Orbi 为什么停下。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-attach-screenshot-to-issue-card.png
mirror: attach-screenshot-to-issue
---

让 AI 改页面，最费劲的常常是用文字讲清「哪里不对」，截张图一眼就懂。Orbi 是一个开源系统，把 GitHub Issue 一路做成合并好的 PR；从 v0.7.59 起，`orbi draft --attach` 可以把截图直接附进 Issue。这篇用一次真实运行，从敲命令讲到两个 PR 合并，再讲文件去了哪里、读不到时会怎样，以及有哪些限制。

我是 Larry 🍀 Orbi，Orbi 的创始人。

我敲进去的需求只有一句：「收据页 docs/receipt.html 照截图里圈出的两处改，样式按 spec.html」。不看图，这句话什么也没说清。看了图，谁都能一眼看出两处毛病：下载按钮是灰的，像点不了；金额那一列没右对齐，小数点上下错开。在交互式工具里，你会把这张图贴进会话：Claude Code 的[官方文档](https://code.claude.com/docs/en/common-workflows.md)写了三种办法，拖进窗口、`Ctrl+V` 粘贴、或者给一个图片路径。用 Orbi 时，你在终端里确认草稿，之后就没人守在会话里了，交付和评审自己跑。所以截图得跟着 Issue 走，每个碰到这张 Issue 的会话都得看到它。

## 起草 Issue 时把截图附上

`orbi draft` 把一句话变成 Orbi 能直接交付的 Issue：先读仓库，需要时问你几个问题，写好预期结果和验收条件，你按回车就建票。`--attach` 往这次起草里加一个文件，可以写多次：

```bash
orbi draft --attach screen.png --attach spec.html \
  "收据页 docs/receipt.html 照截图里圈出的两处改，样式按 spec.html"
```

`screen.png` 是收据页，上面两个红框：① 「下载 PDF」按钮是灰的，像不能点；② 金额没右对齐，小数点对不上。`spec.html` 是一份很短的样式约定：主按钮背景 `#2563EB`、白字，悬停 `#1D4ED8`；灰色 `#9CA3AF` 只给不可点的按钮；金额右对齐、用等宽数字；退款用红色 `#DC2626`。

<img src="/img/blog-attach-screen.webp" alt="一张付款收据卡片，上面两个红框：一个框住灰色的「下载 PDF」按钮，标 ①；一个框住左对齐的金额列，标 ②；旁边写着按钮像不能点、小数点对不上。" width="1056" height="740">

这次是在一个公开的测试仓库 [xqliu/orbi-e2e-2609260042](https://github.com/xqliu/orbi-e2e-2609260042) 里跑的，收据页是我为这次演示加的一个小页面。Orbi 一个问题也没问，直接给了两张票，因为两处改动可以分开验收：

- [#521](https://github.com/xqliu/orbi-e2e-2609260042/issues/521)：「下载 PDF」改成主按钮，背景 `#2563EB`、白字，悬停变 `#1D4ED8`。
- [#522](https://github.com/xqliu/orbi-e2e-2609260042/issues/522)：表头、每行金额和合计都右对齐，用等宽数字；退款那行的 `-$29.00` 显示成 `#DC2626`。

两张票的内容都来自附件。按钮色值和悬停色只写在 `spec.html` 里，「像不能点」「小数点对不上」只在截图上，我那句话里一样都没有。所以这句话是交给 `orbi draft` 的，不是直接写成 Issue：起草会把截图里的内容用文字写进票里。手写 Issue 的话，也要用文字写清改什么，截图只当辅助。

有一处超出了我圈的范围：退款红色我在截图上没圈，#522 也写进去了。票面「假设」一节说了原因：截图只圈了对齐，但 `spec.html` 把退款红色写在同一节「金额列」约定里，所以一并实现。这一节在终端里的草稿上就看得到，那时还什么都没建。不想要，在提示符那里输入一句修改；觉得约定没错，直接按回车。票一建好就带着 `ai-ready` 进了队列，事后再改，可能已经开工了。

## 附件怎样从起草传到评审

**起草。** 每个文件先复制进起草会话自己的目录，改用生成的名字（`1.png`、`2.html`），文件名再怎么写也跑不出这个目录。会话收到一行说明（`The person attached: 1.png = screen.png, 2.html = spec.html`），HTML 和文本用读文件工具读。图片只有在模型目录里声明了能看图时，才按图片交给模型；Orbi 自带的 DeepSeek 模板声明了。

**Issue。** 你确认以后，每张新 Issue 末尾有一节 `## Attachments`，只放这张票用到的文件。本地图片用你自己的 `gh` 登录上传（`gh issue create --attach`），成为 GitHub 原生附件；HTML 和文本折叠在正文里。模型能看图时，在 GitHub 上打开 Issue 的人，看到的和 AI 看到的是同一份东西。

<img src="/img/blog-attach-issue.webp" alt="GitHub 上的 Issue #521，滚动到 Attachments 一节：标注过的收据截图以图片显示，下面是折叠起来的 spec.html，右侧栏有 ai-ready 标签。" width="1200" height="737">

**交付和评审。** 写代码的会话和评审的会话都会收到 Attachments 一节里的图片，以及正文、有写权限的人在评论里贴的 GitHub 原生图片。评审每一轮都重新读一遍，所以评审拿来对照的，和写代码时看的是同一张截图。HTML 和文本本来就在两个会话都会读的 Issue 正文里。其他人评论里贴的图片和链接一律不取。

## 交付做成了什么样

这次我在自己电脑上跑开源引擎，和自建部署的跑法一样，所以 PR 是用我自己的 GitHub 账号开的。两张票都在 11 月 25 日交付并合并（UTC 时间）：

- #521 对应 [PR #523](https://github.com/xqliu/orbi-e2e-2609260042/pull/523)：按钮背景从 `#9ca3af` 改成 `#2563EB`，加了一条 `.btn:hover`，颜色 `#1D4ED8`。02:33 开始交付，评审一轮通过，02:50 合并。
- #522 对应 [PR #524](https://github.com/xqliu/orbi-e2e-2609260042/pull/524)：金额单元格加上右对齐和 `tabular-nums`，退款那格加上 `#DC2626`。02:39 开始，03:08 合并，中间经过三次评审。最后一次，把 `main` 上的 #523 合进分支后有个测试没过，评审会话自己把它修好了（评审发现问题会在同一个会话里修），然后通过。

<img src="/img/blog-attach-before-after-zh.webp" alt="同一张收据改前改后并排对比。改之前：灰色的「下载 PDF」按钮，金额左对齐。改之后：蓝色按钮，金额右对齐、小数点上下对齐，退款金额是红色。" width="1230" height="475">

每个会话都拿到了截图。两次写代码、四次评审，一共六个会话，会话记录里都有这张图，而且是每个会话各自重新取的。

## 读不到附件，Orbi 就停下

附件常常就是需求本身。写代码的会话要是跳过了 `screen.png`，手里只剩「照截图里圈出的两处改」，却没有圈，它照样会写出点什么来；评审会话也没有截图，只能对着这些代码下结论。所以 Orbi 选择停下：

- 起草时有文件读不到，这一轮直接失败，并点名是哪个文件。
- 交付或评审时读不到，会话根本不开。Issue 打上 `ai-blocked`，留一条评论写明是哪张图、怎么修：重新上传（这张图确实用不上时才删掉它），再把 `ai-blocked` 换成 `ai-ready`（已经有 PR 就换成 `ai-fix-needed`）。之后不会自己重试，坏掉的图不会每隔几分钟刷一条评论。

有两种情况不会停，值得知道：

- **上传被拒。** `gh` 拒绝上传时，比如登录的是 GitHub App 令牌而不是你本人的账号，Issue 照样建出来，只是少了那张图，命令会打印哪些图没传上去。先摘掉这张 Issue 的 `ai-ready`，去 GitHub 上把图贴进去，再把 `ai-ready` 加回来。在这之前已经开工的那一轮看不到后补的图。如果用 `gh auth login` 换成自己的账号重新起草，会建出一张新票，记得把缺图的那张关掉。
- **模型看不了图。** 起草时，没有声明能看图的模型会被告知这张图看不了，需要时请你用文字描述。交付和评审时，这样的模型拿不到图，也不会收到任何提示，只按 Issue 里的文字往下做。截图要起作用，就得给 Orbi 配一个声明了能看图的模型，比如它自带的 DeepSeek 模板。

## 上限和前提

| | |
|---|---|
| 图片 | `png`、`jpg`、`jpeg`、`gif`、`webp` |
| HTML 和文本 | `html`、`htm`、`txt`、`md`、`csv`、`tsv`、`json`、`log` |
| 数量和大小 | 最多 10 个，单个不超过 10 MB；所有 HTML 和文本加起来不超过 5 万字符，好放进 Issue 正文 |
| 模型 | 交付和评审要用声明了能看图的模型，比如自带的 DeepSeek 模板；否则截图会被忽略，也没有提示 |
| 其他类型 | 直接拒绝并说明原因，比如 PDF、视频 |
| Orbi | v0.7.63 或更新（[github.com/orbi-build/orbi](https://github.com/orbi-build/orbi)；v0.7.59 起支持 `--attach`） |
| gh | 2.99 或更新，用本人账号登录（`gh auth login`） |

`--attach` 只在开始起草时生效。给已有 Issue 追加内容不会带附件，已经建好的 Issue 要补图，直接在 GitHub 上贴进去。

一点提醒：公开仓库里，附上的东西谁都看得到：图片，还有写进正文的 HTML 和文本（折叠只是收起，不是隐藏）。附之前先把不该公开的内容去掉。

## 和同类工具比

把截图放进 Issue 不是新鲜事。GitHub Copilot 的云端 agent [会看 Issue 正文里拖进去的截图](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/provide-visual-inputs)，`gh` 2.99 也[给所有人加了 `--attach`](https://github.blog/changelog/2026-09-01-github-cli-media-in-issues-pull-requests-and-comments/)，Orbi 用的就是这个上传。区别在上传前后：起草会话先读附件再写 Issue，预期结果和验收条件按截图和约定里的内容写；评审每一轮都重新看；附进来的文件读不出来，就停下说清是哪个文件，不带着半份需求往下做。

## 相关

- [AI agent：从 GitHub Issue 到合并与发版](/zh/guides/issue-to-release/)
- [一句话需求，怎么走到 PR 合并](/zh/blog/vague-request-to-merged-pr/)
- [写需求：说一句话，Orbi Cloud 替你写好 GitHub Issue](/zh/blog/write-a-request/)
- [AI 编码交付卡住后，怎么让 Orbi 继续](/zh/blog/stuck-delivery-one-click/)
- [Orbi 与其他编程 agent 对比](/zh/compare/?ref=blog-attach)
- [Orbi Cloud](/zh/cloud/?ref=blog-attach)
