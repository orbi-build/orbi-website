---
title: OpenCode 替代方案：PR 之后那条线归谁
date: 2026-10-19
summary: OpenCode 能把一个 Issue 跑到开好 PR、留下评审就停了。下面这些 OpenCode 替代方案的分别，在于 PR 之后的合并和发版归谁。
lang: zh
author: Lawrence Liu
image: /img/blog-opencode-alternatives-card.png
mirror: opencode-alternatives
---

OpenCode 的流程停在 PR，找替代方案前先认清这一点。OpenCode 是 Anomaly 做的开源编码 agent（[github.com/sst/opencode](https://github.com/sst/opencode)，MIT 许可，GitHub 上 21 万多 star，是目前 star 数最高的编码 agent 之一）。它的官方 GitHub 集成本身就能做不少事：跑一次 `opencode github install`，在 Issue 里提一句 `/opencode`，它就会读 Issue 的来龙去脉、建分支、改代码、开 PR，还能评审 PR，这些都在你自己的 GitHub Actions runner 里跑。

它不做的是合并和发版。OpenCode 的 GitHub 文档讲到提交一个带改动的 PR 就停了，没有哪一步去合并这个 PR 或者打 tag。所以挑替代方案时，真正要问的是：PR 开出来、评审过了之后，谁来判断它能不能合、谁对那个发版 tag 负责？这几个工具的分别就在这里。

我是 Lawrence Liu，Orbi 的创始人。下面每个工具，包括 Orbi 在内，我都在 2026 年 10 月 19 日对着它自己的官方文档核过，用同一把尺子量。

## 怎么比较

判断一个替代方案合不合适，看四件事：怎么跑（终端里、编辑器里，还是一个无人值守的 runner），替不替你开 PR，PR 之后那段归谁，以及许可和谁维护，毕竟开源这件事往往正是你当初用 OpenCode 的原因。

还有一点：这些工具你都要自带模型 key、自己付推理费用，花多少由你选的模型决定，跟换哪个 agent 关系不大。OpenCode 本身支持 75 家以上的模型供应商，包括本地模型和 DeepSeek，想换更便宜的模型，在它里面换就行。换工具真正要看的，是整条工作流合不合适。

## 各工具停在哪一步

### 还是停在 PR

这几个和 OpenCode 最像：把需求变成代码很强，但合并和发版那段要你自己搭。

- **[Claude Code](https://code.claude.com/docs/en/github-actions)** 既是终端 agent，也能在 GitHub Actions 里把一个 Issue 变成 PR。评审是另一回事：Anthropic 托管的 [Code Review](https://code.claude.com/docs/en/code-review) 会在 PR 上逐行评论，但它的文档说得很明确，「a review never approves or blocks the pull request, so the decision to merge stays with your team」（评审从不批准也不阻止 PR，合不合的决定权留在你团队手里）。如果你要的交接点就是一个评审过的 PR、合并和发版你自己来，选它。注意它不是开源的（[许可证](https://github.com/anthropics/claude-code/blob/main/LICENSE.md)保留所有权利），所以如果你用 OpenCode 正是看中开源，它不是等价替换。
- **[Codex CLI](https://developers.openai.com/codex/cli/)** 把 OpenAI 的 Codex 带进终端，`codex exec` 能把同一个 agent 放进可重复的脚本和流水线。你自己在写那些步骤、想要一条命令就能调起 agent 时，选它。
- **[Aider](https://aider.chat/docs/)** 是终端里的结对编程，全程用 git 记录改动：它给仓库建索引、用自己的提交信息 commit，所以普通 git 工具就能 diff 和回退。它只 commit 到本地，开 PR 以及之后的一切都归你。
- **[Cline](https://docs.cline.bot/cline-overview)** 待在你的编辑器和终端里，动手前要你批准，不过它的 [Auto Approve](https://docs.cline.bot/features/auto-approve) 设置能按动作类型放开这道关，一直到它自己文档都称作危险的 YOLO 全自动模式。想默认一步步看着批、再有意识地放开时，选它。
- **[Goose](https://goose-docs.ai/)**（开源，Apache-2.0，起于 Block、现在归 Agentic AI Foundation；[aaif-goose/goose](https://github.com/aaif-goose/goose)，5 万多 star）以 CLI 和桌面应用的形态跑，有个无人值守的 `goose run -t "…"` 或 `-i instructions.md`，任务做完就结束会话，能放进 CI 的一步。它改文件、跑命令，但不替你开 PR，所以 PR、合并、发版全是你的流程。

这一组里的每个工具，PR 之后那段（判断 PR 安不安全、合并它、切发版）都是你用 GitHub 的分支保护、必需检查和自己的发版步骤拼出来的一条流水线。如果你本来就想自己掌控这段，这样正合适。OpenCode 自己的 GitHub 集成已经把你带到评审过的 PR，换成这一组里的某个 agent，并不改变剩下那段归谁。

### 从 Issue 一路做到合并之后

- **[Orbi](https://docs.orbi.build)** 不用你亲手驱动。它认领一个 `ai-ready` 的 GitHub Issue，跑一个叫 [Pi](/zh/guides/pi-coding-agent/) 的编码 agent 把改动写出来。然后一个独立的评审会话读这份改动，锁定在它评审的那一版提交上，runner 只合并这一版评审过的提交。发版是唯一需要人起头的一步：由人去开一个发版 Issue，之后 Orbi 自己打 tag、发布。Orbi 在 AGPL-3.0 下开源，自己部署时用你自己的 key。Orbi Cloud 是托管版，替你跑同一条流程，默认用 DeepSeek，所以在那里跑一趟不会动你的 Claude 订阅额度。

跟上面那一组的分别很具体：合并是在评审闸门后自动做的，发版是人工的一步，测试保证仍然是你仓库的 CI 说了算，Orbi 跑的是你已经定好的检查。

Orbi 的成本是公开实测的。Orbi Cloud 的[成本页](/zh/cost/?ref=blog-opencode-alt)记录了 2026-09-16 到 2026-10-05 之间的 169 次已合并交付，全部跑在 deepseek-flash（默认那个 DeepSeek 模型）上，每次合并交付中位 $0.082、90 分位 $0.22，都按 DeepSeek 的非高峰费率算。那是 Orbi 在自己工作流上的交付，衡量的 agent 和任务构成跟你的 OpenCode 跑法不同，所以把它当托管模式的参考点，不是你账单的预测。

## 怎么选

给这些 OpenCode 替代方案排个序，按 PR 之后那条线你想自己扛多少来配：

- 想换个 agent 写代码、合并和发版你乐意自己来：Claude Code、Codex CLI、Aider、Cline、Goose 任选，看你要的是终端、编辑器，还是一个无人值守的 CI 步骤。
- 为了模型灵活度和开源许可继续留在 OpenCode，真正缺的是 PR 之后那几步：留着 OpenCode，在 GitHub 上把合并到发版这条流水线搭起来，或者拿它跟一个把那条线包了的 runner 比一比。
- 想把 Issue 一路推进到合并、再到发版 tag，又不想自己拼那条流水线：这正是 Orbi 覆盖的范围；同一段流程里其他工具做到哪一步，上文已经列出。

## 相关

想看针对某一个具体 agent 的同类对比，读[Orbi 对比 Claude Code](/zh/compare/claude-code/)，那页也列了 Claude Code 的替代方案。想要那个把 Issue 带到发版 tag 的托管 runner，[Orbi Cloud](/zh/cloud/?ref=blog-opencode-alt) 是托管版，[成本页](/zh/cost/?ref=blog-opencode-alt)列出它实测的每次交付数字。
