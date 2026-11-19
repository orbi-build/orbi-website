---
title: Orbi 的高频开发：实现、评审和发版怎样自动推进
date: 2026-11-19
summary: Orbi 可以把一个开发任务从写代码做到发版。本文沿着一张真实需求票，讲清独立评审、等待 CI 和发布怎样自动衔接，以及会话中断或决定改变后如何继续。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-high-frequency-agent-development-card.png
mirror: high-frequency-agent-development
---

Orbi 可以从一张 GitHub Issue 开始，把需求实现并发布出去。我是 Larry 🍀 Orbi，Orbi 的创始人，也用 Orbi 开发 Orbi。这篇写给已经在用编程 agent 的维护者，用一个完整例子说明：PR（拉取请求）开出来以后，评审、合并和发版怎样继续自动完成。

需求准备好并获得授权后，Orbi 可以自己写代码，再另开一个评审会话，检查代码、修复问题。CI 通过后，由程序执行合并；接下来的发版则交给单独的发布任务，负责版本号、tag 和 GitHub Release。我不用在每一步之间反复催它继续。模型负责读需求和改代码，Runner（Orbi 的调度程序）负责启动下一步、保存进度和等待检查。规定需要我批准的生产发布，仍由我批准。

Rocky 的[《Magpie 的高频开发实践》](https://83d.me/2026/11/19/magpie-agent-development)讨论了项目知识、协作与自动化，也是这篇文章的起点。这里用 Orbi 自己的公开开发记录，讲一张需求票如何做到发版，以及为让流程持续运行而修过的几个问题。

按 UTC 时间统计，2026 年 11 月 12 日至 18 日这七个完整自然日里，两个公开仓库有以下记录：

| 记录 | 数量 | 统计口径 |
|---|---:|---|
| 核心仓合入 `main` 的 PR | 33 | 已合并的拉取请求，包含修复和文档 |
| 核心仓 GitHub Release | 8 | 已发布、非草稿、非预发布的版本记录 |
| 官网仓合入 `beta` 的 PR | 26 | 进入官网测试分支的改动 |

[核心仓 PR 查询](https://github.com/orbi-build/orbi/pulls?q=is%3Apr+is%3Amerged+base%3Amain+merged%3A%3E%3D2026-11-12+merged%3A%3C2026-11-19)按合并时间统计，[Release](https://github.com/orbi-build/orbi/releases)按发布时间统计，时间范围相同。官网同期还有 17 个把 `beta` 合并到 `main` 的 PR，用于生产发布。这些 PR 带过去的是已经合入 beta 的改动，因此单独列出，不再重复计入开发数量。PR 和 Release 的数量能说明开发有多频繁，不能直接算出做成了多少功能，或者我提高了多少效率。

## 从一张需求票到一个正式版本

11 月 18 日的 [Issue #2256](https://github.com/orbi-build/orbi/issues/2256)要修复 Orbi 自己的重启恢复逻辑。Runner 查找中断任务时，可能把另一套 Orbi 正在做的任务也接过来，结果两个实例同时修改同一个任务分支。

修复规则是：当前实例必须先找到这张 Issue 对应的工作树和已保存的运行状态，才能继续执行这个任务。Git 工作树是独立的代码检出目录，Orbi 把任务文件和运行状态保存在这里。单看 GitHub 上“正在交付”的标签，还无法判断该由哪个实例接手。

这次修改从认领任务到发布软件包，都能查到公开记录：

| 阶段 | 公开证据 |
|---|---|
| 认领任务 | [启动回执](https://github.com/orbi-build/orbi/issues/2256#issuecomment-6975163075)记录本次运行、任务分支，以及基础分支当时的提交 |
| 提交代码 | [PR #2258](https://github.com/orbi-build/orbi/pull/2258)包含恢复逻辑的修改 |
| 评审与合并 | [合并回执](https://github.com/orbi-build/orbi/issues/2256#issuecomment-6980679331)记录了 1 轮评审，结论为通过，对应提交为 `3507be8`，并注明在 CI 后合并 |
| 发布版本 | [v0.7.49](https://github.com/orbi-build/orbi/releases/tag/v0.7.49)列出的已核实发布范围包含这张 Issue 和 PR |
| 发布并验证软件包 | Release 发布以后，[PyPI 发布](https://github.com/orbi-build/orbi/actions/runs/44362052953/job/135006009705)和随后[软件包验证](https://github.com/orbi-build/orbi/actions/runs/44362052953/job/135006307821)都已成功完成 |

实现这项修改时，Orbi 使用 [Pi 编程 agent](/zh/blog/orbi-on-pi-coding-agent/)。代码写好后，Orbi 会启动一个使用独立上下文的评审进程，重新读取需求和代码。评审者可以直接在原任务分支修复问题，最后给出结论，并注明结论对应哪次提交。我不需要再把评审意见复制到另一个聊天会话里。

这次任务的实现和评审回执都记录了同一个运行编号：`d7ce6300`。GitHub 记录的 PR 创建者和合并者都是 Orbi App。PR 最后一次提交（head）的 tests 和 macOS 检查先通过，随后在 13:56 UTC 合并；包含这项改动的版本在 17:44 UTC 发布。

启动评审、保存结论、读取 GitHub 当前状态，以及在条件满足后合并，都是 Runner 负责的步骤。发版由另一张任务票处理，发布范围和需要通过的检查也单独写清。

## 会话中断后，接着原任务做

agent 进程退出后，改过的文件、提交、分支、尚未关闭的 PR，以及还没解决的问题，都可能留着。如果新会话只从最初的需求重新开始，就可能忽略这些已有工作，把同一个任务另做一遍。

Orbi 的[交付代码](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/implementation_delivery.py#L299)会在认领任务时，记下基础分支当时的提交、本次运行和工作树。恢复已有工作树时，也继续使用原来的任务分支。

#2256 补上的检查是：准备恢复的工作，必须属于当前这个 Orbi 实例。其他项目也可以把这条规则写成验收场景：

> 扫到一张正在交付的任务票，如果当前实例没有保存它的执行状态，就跳过；找到自己保存的工作，才继续执行。跳过别的实例的任务后，还要继续扫描后续任务票，不能漏掉自己可以恢复的任务。

[最终 PR](https://github.com/orbi-build/orbi/pull/2258)按这条规则完成了修改，没有为了判断任务归属再引入一套服务。如果票里只写“重启恢复坏了”，就把“哪些工作能接手、哪些必须跳过”留给了 agent 自行决定。我需要先写清规则，再给出触发条件、可观察的结果和修改边界。

## 等待交给调度程序

把基础分支的最新代码合并到任务分支时，也出现过重复评审。Runner 已经成功合并并推送了代码，紧接着查询 GitHub PR，返回的却还是推送前的提交。远端分支已经更新，PR 接口暂时还没反映出来。

[Issue #2017](https://github.com/orbi-build/orbi/issues/2017)记录了后果：Orbi 把这个旧结果误判为任务分支又有了变化，再次启动评审。推送已经成功，此时并没有新的代码问题需要模型处理。

10 月 30 日合并的 [PR #2019](https://github.com/orbi-build/orbi/pull/2019)区分了两种情况。确认远端分支已收到推送后，如果查询 PR 得到的还是旧提交，Runner 会稍等并重新查询。查到刚推送的提交，就采用新状态；等待结束后仍然查到旧提交，就不合并 PR。如果查到的是另一个提交，既不是推送前的，也不是刚推送的，就立即拒绝合并。这时已经不能把差异解释为 GitHub 的查询结果还没更新。

这段等待有上限，具体写在[合并代码](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/merge_exec.py#L214)里。把基础分支的最新代码合入任务分支并推送后，Runner 也不会立刻合并 PR，而要等下一次调度时，检查新提交的 CI 结果。一般来说，任务分支有变化就需要重新评审；但如果只是无冲突地合入基础分支的代码，Runner 会更新保存的提交编号，不再启动一轮模型评审。

平时等待 CI，也不必一直占着模型会话。评审通过后，Orbi 可以把结论、当时的提交编号，以及评审者读过的 Issue 正文一起存下来。下一次调度时，若这些输入没有变化，就可以沿用这次评审，检查 CI 是否完成，满足条件后再合并 PR。

## 合并前，以维护者的新回答为准

评审结束、CI 还在运行时，维护者可能改了先前的决定。代码仍然按旧回答实现，即使评审已经通过，也需要先处理这个新决定。

[Issue #2221](https://github.com/orbi-build/orbi/issues/2221)要修的就是这种情况：Orbi 暂停并提问后，有时没有在合并前采用人的新回答，仍会继续执行旧决定。11 月 17 日合并的 [PR #2229](https://github.com/orbi-build/orbi/pull/2229)在合并前增加一次检查，读取来自可信身份的新回答，并判断其中的决定是否已经落实。

[这次检查](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/merge_exec.py#L323)就在执行合并命令之前。只要有新的回答还没落实，Runner 就先停止合并，让后续会话处理这个新决定。已经落实过的回答，不会继续阻止合并；如果连回答历史都无法读取，[也先不合并](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/answer.py#L785)。

这里的回答有规定的提交方式。Orbi 暂停等待决定时，会在 Issue 上提出问题；拥有仓库写入权限的维护者，按[文档规定的格式](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/docs/operations.mdx#L1093)发布一条新评论。Runner 在合并前检查这条回答，不会把普通讨论评论当作这类回答处理。这项修改已经包含在 [v0.7.46](https://github.com/orbi-build/orbi/releases/tag/v0.7.46) 中。

## 评审时，先看当前提交的 CI 结果

CI 已经验证过当前提交，再让评审者用同样的命令跑一遍，可能只是在重复验证同一份代码。

11 月 19 日的 [PR #2265](https://github.com/orbi-build/orbi/pull/2265)修改了共享评审指令：评审者直接使用 GitHub 上 PR 当前提交的状态检查作为依据。如果要复现 CI 中的失败，或者验证自己刚做的修复，仍要在本地运行相应测试。只是核实当前提交已经通过的测试或构建结果，查看已有 CI 记录即可，不必重跑相同命令。

同一份[评审指令](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/prompts/prompt_review.md#L203)还要求：修复并推送代码后，评审者给出结论就结束会话，后续 CI 由 Runner 检查，不在模型会话里反复查询。

这项改动发生在 11 月 19 日，晚于前面的七日统计范围。指令和配套测试都已合并，但实际运行时间能省多少，我还没有做前后对比。目标是省去同一提交已有检查结果时的重复验证。

## 发版前，先核对本次要发布什么

包含重启恢复修复的 [v0.7.49](https://github.com/orbi-build/orbi/releases/tag/v0.7.49)在 11 月 18 日发布。发布记录附有任务 #2263 的链接，还列出了这个版本对应的提交、发布范围内已关闭的 Issue，以及该提交的 GitHub 检查结果。沿着这些链接，可以从最初的需求一直查到正式版本。

<figure class="post-media">
<img src="/img/blog-high-frequency-release-gates.webp" alt="GitHub 上 v0.7.49 的发布记录，列出发布范围内已关闭的 Issue，以及版本提交的 CI 和测试回执。" width="1200" height="540">
<figcaption>v0.7.49 的公开发布记录列出了本次发布范围，以及版本提交的检查结果。来源：GitHub Release。</figcaption>
</figure>

这条[发版流程](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/release_run.py#L99)不启动 Pi，由程序按规则执行：核对发布范围和条件，提交版本变更，等版本提交的 CI 通过，再创建 tag 和 GitHub Release。如果里程碑里还有其他未关闭的 Issue，就暂不开始发版。

官网采用另一种方式：改动先合入 beta，再把 beta 合并到 main，部署到生产环境，不为每批改动单独发一个版本。因此，官网的 26 个 beta PR、17 个用于生产发布的合并 PR，与核心仓的 8 条 Release 分开统计。GitHub Release 已经发布，也不代表所有托管部署和自托管安装都已经升级。合并以后到部署还要等多久，我以前[单独量过](/zh/blog/ai-code-review-bottleneck/)。

## 把这套自动化用到自己的项目

我仍然负责决定产品要做什么、授权哪些工作，以及处理必须由我拍板的分歧。需要真实用户环境才能验证的行为，仍要由我检查；规定需要批准的生产发布，也要由我批准。日常的实现、评审和交付可以自动推进，这些产品判断和验收仍由人负责。

如果要在自己的项目里采用类似流程，可以先检查五件事：

1. 进程退出后，新会话能否找到已有的分支、文件和 PR，继续同一个任务？
2. 独立评审者能否直接修复问题，还是需要人来回复制评审意见？
3. CI 没跑完时，能否由调度程序等待，不额外启动模型会话，并确认检查对应的正是准备合并的提交？
4. 维护者按规定提交新决定后，系统能否在合并前停下来，先处理这个决定？
5. 本次发版包含哪些改动、满足什么条件才能发布，是否已经写清，并能由程序检查？

[DORA 的交付指标](https://dora.dev/guides/dora-metrics/)会把交付吞吐与稳定性放在一起看，部署返工也是其中一项。我也需要同时看这两方面的结果。一周合并了多少 PR、发了多少版本，只能说明流程在运转；改动有没有价值、发布后又返工了多少，还需要对应的结果来回答。

## 相关

还可以看 [Orbi 怎样使用 Pi](/zh/blog/orbi-on-pi-coding-agent/)、[独立评审者怎样拒绝一次交付](/zh/blog/what-autonomous-actually-means/)、[Claude Code 对比](/zh/compare/claude-code/?ref=blog-hi-freq)和 [Orbi Cloud](/zh/cloud/?ref=blog-hi-freq)。
