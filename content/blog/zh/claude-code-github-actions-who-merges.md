---
title: Claude Code 跑完之后，谁来合并 PR
date: 2026-09-19
updated: 2026-11-23
summary: Claude Code 会写代码、评审 PR，却不会替你合并或发版。从 431 个已合并 PR 的记录看，独立评审、合并门禁和发版流程怎样补上剩余链路。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-claude-actions-card.png
---

把 Claude Code 接进 GitHub Actions，或者写个循环让它自己跑，并不难。难的是它跑完以后：PR 在那里，测试是绿的，代码和评审都来自它，合并按钮该由谁来按。

这篇 2026 年 9 月首发时，我这边的答案是没有人按：发文前一个月，431 个 PR 合进主干，416 张 Issue 走完全流程，发了 40 个版本。代码我基本不读。

听起来像在赌。要让这件事站得住，流程里得补上几道具体的检查。

## 谁来判断一个 PR 可以合并

大家担心的是模型写错。这确实会发生，测试能拦住大部分。真正贵的是另一种：判断「这东西可以合了」的，还是写它的那个会话；或者是一个三周前就不再认真看了的人。

所以第一条：评审的不能是写代码的那一个。同一个会话里换个 prompt 再跑一遍不算，得另起一个进程、全新上下文、等 PR 建好之后读冻结的 diff。它不知道实现时在想什么。我一开始觉得这是缺点，后来发现正好：一段代码要是非得知道作者当时怎么想才看得懂，那它还没写完。

评审发现问题可以自己改、推到同一个分支，然后对新的 head 重新出结论。这一轮如果还留着问题，就不合并，进入下一轮。轮次上限是五轮，用完还没过就停下来等人，不会含糊过去。

## 合并的瞬间重查三个条件

光有评审结论不够，因为评审和合并之间隔着时间。合并前对着远端重新查三件事：

- CI 是绿的，而且是评审过的那个 head 上的绿。
- head 没动过。评审之后有人推了东西，这个结论就作废。
- base 是最新的。PR 必须包含最新的 main，用普通 merge 吸收，不用 rebase，因为 rebase 会改写被评审过的那些提交。

落到命令上就是一行，关键在那个 pin：

```bash
gh pr merge "$PR" --squash --match-head-commit "$REVIEWED_HEAD"
```

评审之后远端的 head 要是动过，这条命令直接失败，而不是把没人看过的东西合进去。三条都过，才按评审过的那个 commit 合进去。任何一条不过，票要么等下一跳，要么停下来等人。没有一条路径是「看起来没问题」就合的。

这三条本身很普通，任何团队在代码评审时都会念叨。区别是它们写在状态机里自动检查，不靠人记得，所以凌晨三点的第九十个 PR 也照样检查。

## 为什么 GitHub 不让你批准自己的 PR

GitHub 从另一头执行同一条规则。它的文档写得很直白：PR 的作者不能批准自己的 PR。仓库要求至少一个批准时，这个批准只能来自别人；能绕过去的只有管理员豁免，下面会说。[用必需审查批准 PR](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews)

代码换成 agent 写以后，这条规则落在谁头上，要看 agent 用什么身份连 GitHub：

- agent 用你的 token 推代码、开 PR：GitHub 认为作者是你，你批不了，得由仓库里的另一个人批。
- 你把 Issue 指派给 Copilot：GitHub 文档另外写明，你指派的 Issue 由 Copilot 开出的 PR，你也不能批准。
- Copilot 用它自己的应用身份开 PR，不代表任何一个人（比如在 Slack 或 Teams 的群聊里让它干活）：规则集对这类 PR 默认多要求一个批准，这个功能还在公开预览阶段。[规则集可用的规则](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)

还有两项设置决定谁能合并。打开「Require approval of the most recent reviewable push」后，批准必须来自最后一次推送者以外的人，所以评审方往分支上推了修复，就批不了自己的修复。另外，经典分支保护默认不约束仓库管理员，除非打开「Do not allow bypassing the above settings」，否则管理员不需要批准也能合并。[关于受保护分支](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

Orbi 照这条规则办，不绕开它。它的评审是独立会话，但开 PR 和合并用的是同一个 GitHub 身份，由 Orbi 来批准就等于作者批准自己。目标分支要求至少一个批准时，GitHub 会拒绝 Orbi 的合并。Orbi 随后读取导致拒绝的分支保护设置，把 Issue 转到 `ai-awaiting-merge`，在评论里写明 PR 的 head 和唯一需要做的那一步，比如加一个别的批准人。有人批准之后，等到队列里没有别的活的那一轮，Orbi 自己合并。这个等待状态的前提是 token 能读到分支保护设置；读不到的话，交付会停在 `ai-blocked`，报一行 `merge_gate: UNKNOWN`，要求授予仓库管理权限。想在交付走到合并之前就看到这项检查，运行 `orbi doctor`，它会给每个源仓库打出同样的 `merge_gate:` 结果。我自己的仓库去掉了必需批准这条规则，用上面三个条件代替它；想让每次合并都有人过目的团队，保留这条规则，Orbi 就等那个人来批。

## 人还剩下什么活

我写票。这就是全部的活，而且比听起来费劲：一张票一个可观察的结果，验收条件要写到「做完了没有」能被一个不能反过来问我的东西判断。票写得含糊，交付出来的就是一个理直气壮的错东西，而且下游任何闸门都拦不住，因为闸门查的是代码有没有做到票上写的事。

我还写发版票：版本号和范围。发版本身是一个确定性的状态机，不是模型会话。它冻结 base、等 CI 绿、改版本号、打 tag、发布、关里程碑。任何一步不对就停下来等我。

这两张票之间我不介入。中途想看进度就去 Issue 里翻评论，那里有每一轮的记录。

## 想自己搭的话

不用换掉现在用的东西。Claude Code 是执行层，缺的是做决定那一层。按收益排，加三样：

1. 评审换一个会话，读冻结的 diff，有权判交付失败。
2. 合并前重查 CI、head、base，不信任十分钟前的结论。
3. 发版走确定性流程，别让模型决定「应该可以发了吧」。

[Orbi](https://github.com/orbi-build/orbi) 就是我按这三条做的实现，开源（AGPL-3.0），可以自己部署，而且它在自己身上跑：上面那 431 个 PR 全是公开的，每一轮评审结论也都在 Issue 的评论里，随便点开一张看。它跑在 Pi 上，模型用你自己的：任何 OpenAI 兼容的接口，或者 Codex 订阅。它不能拿 Claude Code 当引擎。

或者干脆把这三个条件搬进你自己的流程里，用什么工具执行都行。


## 相关

继续阅读：[Claude Code 对比](/zh/compare/claude-code/)、[CI 门禁指南](/zh/guides/ci-gates/)与 [Cloud](/zh/cloud/)。
