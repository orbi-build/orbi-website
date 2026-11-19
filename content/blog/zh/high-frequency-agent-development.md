---
title: Orbi 的高频开发：实现、评审和发版怎样自动推进
date: 2026-11-19
summary: 用一周公开记录看 Orbi 如何自动推进实现、独立评审、CI、合并和发版，以及中断、状态延迟和需求变化时，怎样接续原有工作，让自动交付持续运行。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-high-frequency-agent-development-card.png
mirror: high-frequency-agent-development
---

Orbi 把 GitHub Issue 一路做到发版：AI 写代码，独立评审会话修复和验证，Orbi 合并并发布。我是 Larry 🍀 Orbi，Orbi 的创始人，也用 Orbi 开发 Orbi。如果你希望编程 agent 开出第一个 PR（拉取请求）后还能继续交付，需要解决几个问题：会话中断以后怎么接着做，等 CI 由谁负责，代码快合并时又改了主意怎么办。

需求准备好以后，Orbi 可以自动推进实现、评审和返修，等待 CI，再执行合并，不需要人逐步催动。之后，单独的发布任务负责版本号、tag 和 GitHub Release。规定需要批准的生产发布，仍由我批准。模型负责推理和改代码，Runner，也就是 Orbi 的调度程序，负责把这些步骤接起来。

Rocky 的[《Magpie 的高频开发实践》](https://83d.me/2026/11/19/magpie-agent-development)从公开记录研究了项目知识、协作与自动化。Orbi 这篇从内部开发的角度，沿着一张真实需求票看自动交付怎样运行，再讲几个让它能持续运行的修正。

以 2026 年 11 月 12 至 18 日，七个完整 UTC 日期为窗口，两个公开仓库留下了这些记录：

| 记录 | 数量 | 统计的是什么 |
|---|---:|---|
| 核心仓合入 `main` 的 PR | 33 | 已合并的拉取请求，包含修复和文档 |
| 核心仓 GitHub Release | 8 | 已发布、非草稿、非预发布的版本记录 |
| 官网仓合入 `beta` 的 PR | 26 | 进入官网测试分支的改动 |

[核心仓 PR 查询](https://github.com/orbi-build/orbi/pulls?q=is%3Apr+is%3Amerged+base%3Amain+merged%3A%3E%3D2026-11-12+merged%3A%3C2026-11-19)按合并时间统计，[Release](https://github.com/orbi-build/orbi/releases)按发布时间统计，窗口相同。官网同期还有 17 个 `beta` 到 `main` 的晋升 PR，它们携带的是已经合入 beta 的改动，所以没有再计入实现数量。这些数字说明开发活动的频率，不能直接换算成功能数或我提高了多少效率。

## 一张需求票怎样走完自动交付

11 月 18 日的 [Issue #2256](https://github.com/orbi-build/orbi/issues/2256)要修改 Orbi 自己的重启恢复逻辑。Runner 扫描中断任务时，可能把另一个部署正在交付的任务，当作本部署遗留的工作。两个部署于是可能同时修改同一条任务分支。

需求给出的目标很具体：只有本部署持有这张 Issue 对应的工作树和已保存的运行状态，才接续它。Git 工作树是一个独立检出目录，Orbi 把任务文件和执行状态留在里面。仅凭“正在交付”的标签，还不能判断这份工作属于谁。

这次改动从认领到分发都有公开记录：

| 阶段 | 公开证据 |
|---|---|
| 认领任务 | [启动回执](https://github.com/orbi-build/orbi/issues/2256#issuecomment-6975163075)记录本次运行、任务分支，以及基分支当时的提交 |
| 交付实现 | [PR #2258](https://github.com/orbi-build/orbi/pull/2258)包含恢复逻辑的修改 |
| 评审与合并 | [合并回执](https://github.com/orbi-build/orbi/issues/2256#issuecomment-6980679331)记录一轮评审、在 head `3507be8` 上保存的通过结果，以及 CI 后的合并 |
| 发布版本 | [v0.7.49](https://github.com/orbi-build/orbi/releases/tag/v0.7.49)的已核实发布范围包含这张 Issue 和 PR |
| 分发软件包 | Release 发布以后，[PyPI 发布](https://github.com/orbi-build/orbi/actions/runs/44362052953/job/135006009705)和随后[软件包验证](https://github.com/orbi-build/orbi/actions/runs/44362052953/job/135006307821)都已成功完成 |

实现会话使用 [Pi 编程 agent](/zh/blog/orbi-on-pi-coding-agent/)。随后，Orbi 启动一个上下文独立的评审进程。评审者读取需求和代码，可以在同一条任务分支直接修复问题，再给出绑定到提交的结论。修复不需要我把评审意见搬进另一个聊天会话。

#2256 的实现和评审回执属于同一次运行，`d7ce6300`。GitHub 记录的 PR 创建者和合并者都是 Orbi App。最终 head 的 tests 和 macOS 检查先通过，PR 在 13:56 UTC 合并；包含这项改动的版本在 17:44 UTC 发布。每个阶段都能分别核对。

这些阶段由 Runner 衔接：启动评审、保存结果、读取 GitHub 当前状态，条件满足后合并。发版则由另一张有明确范围和检查条件的任务推进。

## 会话中断后，接着原任务做

agent 进程退出时，文件、提交、分支、打开的 PR 和尚未解决的问题，可能都还在。如果重新从原始需求开始，就可能丢掉这些上下文，还在原交付旁边再启动一份工作。

Orbi 的[交付代码](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/implementation_delivery.py#L299)会在认领时记录基分支当时的提交、本次运行和工作树。接续现有工作树时，也沿用它原来的分支。

#2256 补上的条件，是恢复者必须能确认这份工作属于本部署。把它写成验收场景，其他项目也能采用：

> 一张任务正在交付，但本地没有它的执行状态，就不要接管；找到本部署保存的工作，则继续原任务。跳过前一张以后，还要能找到后一张本部署可以恢复的任务。

[最终 PR](https://github.com/orbi-build/orbi/pull/2258)据此完成了修改，没有再引入一套所有权服务。这张票如果只写“重启恢复坏了”，agent 就得自行发明一套归属规则。我需要把规则写进票里，附上触发条件、可观察的结果和修改边界。

## 等待交给调度程序

任务分支需要吸收基分支的最新代码时，也出现过无效重复。Runner 已经无冲突地合并并推送成功，紧接着查 GitHub PR，拿到的却还是旧 head。分支引用和 PR 查询结果短暂不一致。

[Issue #2017](https://github.com/orbi-build/orbi/issues/2017)记录了后果：Orbi 把旧查询结果当成 head 发生变化，重新送去评审。推送其实已经成功，没有新的实现问题需要模型处理。

10 月 30 日合并的 [PR #2019](https://github.com/orbi-build/orbi/pull/2019)把这两种情况分开了。确认分支推送成功以后，如果 PR 查询还停在推送前的 head，Runner 会短暂重读。读数追上来，就采用新状态；始终追不上，就不合并。如果读到既不是推送前、也不是刚推上去的“第三个提交”，则立即拒绝这次合并，因为它已经不是已知的旧读数。

[当前合并代码](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/merge_exec.py#L214)给这段等待设了边界。并入基分支的新代码并推送后，这一轮也不会马上合并，而是等后续调度再检查新 head 的 CI。通常，任务分支变化后要重新评审。但无冲突并入基分支时，Runner 只更新已记录的 head，不另起一轮模型评审。

普通的 CI 等待也是这个分工。Orbi 可以把没有待修问题的评审结果，与 head 提交、评审者读过的 Issue 正文一起保存。后续调度发现这些输入没变，就能直接查 CI 是否完成并尝试合并，不必再启动一个评审会话。

## 合并前，以维护者的新回答为准

评审结束、CI 还在运行时，维护者可能修改先前的回答。代码符合评审者读到的决定，但那个决定已经被更新了。

[Issue #2221](https://github.com/orbi-build/orbi/issues/2221)针对的就是这个缺口：Orbi 暂停并提问后，合并路径有时没有采用人的新回答，仍可能继续执行旧决定。11 月 17 日合并的 [PR #2229](https://github.com/orbi-build/orbi/pull/2229)在最后加了一次检查，读取可信、较新、尚未执行的回答。

[合并检查](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/merge_exec.py#L323)在执行合并命令前读取这份状态。有待执行的新回答，旧结果就不能合并，交付回到返修；已经实施过的回答，则不会一直挡着后续合并。如果连回答历史都读不到，[同样暂不合并](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/answer.py#L785)。

Orbi 暂停等待决定时，会在 Issue 上提出问题。拥有仓库写入权限的维护者，按[文档规定的结构化回答格式](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/docs/operations.mdx#L1093)发布一条新评论。Runner 在合并前检查这条回答，普通讨论评论不会进入这条路径。这项行为已经包含在 [v0.7.46](https://github.com/orbi-build/orbi/releases/tag/v0.7.46) 中。


## 把当前提交的 CI 证据交给评审者

评审需要证据。但当前提交的 CI 已经成功完成以后，再把同样的命令全部重跑一遍，可能只是多花一个会话证明同一件事。

11 月 19 日的 [PR #2265](https://github.com/orbi-build/orbi/pull/2265)修改了共享评审指令：以 PR 当前 head 的状态检查作为验证证据。需要复现失败检查、或者验证自己刚做的修复时，评审者仍应运行本地测试；只是确认当前 head 已通过的测试或构建结果，则不用再跑一次。

[测试阶梯](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/prompts/prompt_review.md#L203)还要求评审者在推送修复后给出结论，不留在会话里轮询 CI。Runner 会在合并前读取新提交的检查结果。

这项改动晚于前面的七日统计窗口。指令和约束它的测试已经合并，但我还没有前后运行时间的对比。它想省掉的是同一提交已有证据时的重复验证。

## 以明确范围发布版本

包含重启恢复修复的 [v0.7.49](https://github.com/orbi-build/orbi/releases/tag/v0.7.49)在 11 月 18 日发布。发布记录链接到任务 #2263，标明版本提交、已经关闭的范围内 Issue，以及版本提交对应的 GitHub 检查。沿这些链接，可以从最初的恢复需求一直查到正式版本。

<figure class="post-media">
<img src="/img/blog-high-frequency-release-gates.webp" alt="GitHub 上 v0.7.49 的发布记录，展示已关闭的范围内 Issue，以及版本提交的 CI 和测试回执。" width="1200" height="540">
<figcaption>v0.7.49 的公开发布记录列出发布范围和版本提交的检查结果。来源：GitHub Release。</figcaption>
</figure>

这条[发版路径](https://github.com/orbi-build/orbi/blob/8b543b232b4ee81dbd79018ca4b679599559f71b/src/orbi/release_run.py#L99)不会启动 Pi。程序检查范围和发布条件，写入版本变更，等待版本提交的 CI，再处理 tag 和 GitHub Release。里程碑里还有其他开放 Issue，就先不进入发版处理。发布任务按条件继续，不会把“已经等很久了”当作放行理由。

官网是另一种交付模式：先合入 beta，再把 beta 晋升到 main 用于生产，不为每批改动单独切一个版本。所以，官网的 26 个 beta PR、17 次晋升，与核心仓的 8 条 Release 分开统计。发布了 GitHub Release，也不能说明所有托管部署和自托管安装都已经运行这个版本。合并之后到部署还要等多久，我以前[单独量过](/zh/blog/ai-code-review-bottleneck/)。

## 把这套自动化用到自己的项目

我确定产品要达到什么结果，授权具体工作，处理必须由我决定的分歧，核对需要真实用户环境才能验证的行为，并在规定需要批准的地方批准生产发布。反复发生的实现和交付步骤可以自动推进，这些产品判断仍然需要有人负责。

换成另一个项目，我会先检查五件事：

1. 下一次会话能否找到已有任务、分支和工作，而不是另起一份交付？
2. 独立评审者能否修复发现的问题，还是需要人把意见搬到另一个会话？
3. Runner 能否不用再开模型会话就等完 CI，并确认检查对应正确的提交？
4. 合并前，新的已授权回答能否挡住过时的决定？
5. 发版是否有明确范围和可验证的条件，而不是凭模型一句“完成了”？

[DORA 的交付指标](https://dora.dev/guides/dora-metrics/)把吞吐和不稳定性一起看，其中包括部署返工。我也需要这两类证据。一周的 PR 和 Release 数说明这套流程在持续运转，还不能回答改动值不值得发布、之后又修了多少次。


## 相关

还可以看 [Orbi 怎样使用 Pi](/zh/blog/orbi-on-pi-coding-agent/)、[独立评审者怎样拒绝一次交付](/zh/blog/what-autonomous-actually-means/)、[Claude Code 对比](/zh/compare/claude-code/?ref=blog-hi-freq)和 [Orbi Cloud](/zh/cloud/?ref=blog-hi-freq)。
