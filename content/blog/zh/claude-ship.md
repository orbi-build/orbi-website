---
title: Claude Ship：它自动做了什么，又停在哪一步
date: 2026-11-26
summary: Claude Ship 是 Anthropic 给 Team/Enterprise 的三个 GitHub PR agent，它们都不合并 PR，能不能合由 GitHub 分支规则决定；规则没配好，PR 可能没人审就合进去。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-claude-ship-card.png
mirror: claude-ship
---

Claude Ship 是 Anthropic 在 2026 年 11 月 23 日[发布](https://claude.com/blog/introducing-claude-ship)的三个 GitHub PR agent（Code Review、PR Steward 和 Claude Approvals），面向 Claude Team 和 Enterprise 套餐。这篇写给在考虑要不要开它的团队：读完能知道它停在哪一步、要花什么钱、哪些设置要先改。

我是 Larry 🍀 Orbi，Orbi 的创始人。Orbi 是 Agent 时代的开源软件黑灯工厂：你给它一个打好标签的 Issue，它自己认领、写代码、交给独立评审、修完问题，CI 通过后合并，中间不用人守着；你开一张发版单并打上 `ai-release`，它就发版。它运行的是开源编程 agent Pi，不运行 Claude Code，也不运行 Claude Ship。2026 年 11 月 26 日我读了官方文档，并在 Claude Code 里亲手试了 `/ship`。组织级的三个 agent 我测不了，因为它们需要 Team 或 Enterprise 组织。

## Code Review、PR Steward 和 Claude Approvals 怎么分工

按 [Claude Ship 文档](https://code.claude.com/docs/en/claude-ship)，三个 agent 分工处理已经打开的 GitHub PR：

| Agent | 做什么 | 状态 | 计费方式 |
|---|---|---|---|
| Code Review | 结合周边代码读改动，按严重程度发内联审查意见 | 正式版（GA） | 组织用量额度（按 token） |
| PR Steward | 修失败的检查、合并冲突和审查意见，直接推送 commit | 公测（Public beta） | 组织用量额度（按 token），默认无消费上限 |
| Claude Approvals | 按 `.claude/approvals.yml` 跑 PR 检查；策略允许时可给出批准 | 公测（Public beta） | 分类器调用及策略触发的 Code Review（observe 模式同样计费） |

Code Review 已经是正式版，主要查 bug，不管代码格式偏好。组织 Owner 可以按仓库选择 Quick、Standard（默认）或 Deep 审查级别。Code Review 自己既不批准 PR，也不拦截合并。

PR Steward 目前处于公测。按 [PR Steward 文档](https://code.claude.com/docs/en/pr-steward)，它会处理失败的检查、合并冲突，以及人和审查机器人（比如 Code Review）留下的审查意见，再直接推送 commit。每次推送后，它会发评论说明改了什么、怎么撤销；在 PR 里评论 `@claude stop` 或移除 `claude-pr-steward-watching` 标签，它就会停手。文档注明它“设计为不批准也不合并 PR”，而且在你手动设限之前，它没有自己的消费上限。

同样在公测的 Claude Approvals 会增加一项 PR 检查，对照默认分支里的 `.claude/approvals.yml` 策略文件，列出还缺谁的批准，策略允许时也会由 Claude 发出批准评审。这项检查只有在 GitHub 里设为必需检查（required check）时才会拦截合并。策略文件默认就是强制执行；Anthropic 建议先写 `mode: observe` 观察一段时间，不过 observe 模式照样计费。

这三个 agent 都不负责合并，一个 PR 能不能合进去，还是由你的 GitHub 分支规则决定。

## 谁能用 Claude Ship，怎么计费

Claude Ship 需要 Claude Team 或 Enterprise 套餐，且只支持 GitHub 仓库。启用了 Zero Data Retention、HIPAA 配置或客户自管加密密钥（customer-managed encryption keys）的组织无法使用；如果组织启用了 FERPA 或 Access Transparency 设置，Approvals 也无法启动。改配置需要 Claude 组织的 Owner 角色，但 Approvals 是例外：只要前置条件满足（已连接 Claude GitHub App），任何能把策略文件合进仓库默认分支的人都能把它打开并开始计费，除非 Owner 在组织层面关掉了 Approvals。

三个 agent 都按 token 用量从组织的 usage credits 里扣费，和套餐本身包含的用量分开算。Approvals 没有基础月费，但根据 [Approvals 配置文档](https://code.claude.com/docs/en/approvals-setup)，分类器运行会计费，如果策略里要求跑 Code Review，即便处于 observe 模式也会触发计费审查。

在组织设置里关掉 usage credits 并不会停掉已经打开的 agent，它们还会继续跑、继续计费。要停用必须直接关掉 agent，并且按顺序来：先关 Approvals，再关 PR Steward，最后关 Code Review。Approvals 要最先关，因为策略里只要要求了 Code Review，就算你关掉了自动 Code Review，策略仍会继续触发计费的审查。

根据[发布公告](https://claude.com/blog/introducing-claude-ship)，符合条件的 Enterprise 组织在 2027 年 1 月 15 日前可以领取至少 10,000 美元的 Claude Ship 额度，领取后 30 天内有效。

## 什么设置下，PR 没人审也能合并

Claude Ship 没有合并步骤。PR Steward 设计为不执行合并，[PR Steward 安全文档](https://code.claude.com/docs/en/pr-steward-security)也写明，它拦截合并和自动合并命令靠的是文本规则加模型判断，换种写法就能绕过，所以能拦住合并的还是你的 GitHub 分支规则。PR 没人审就合进去，一种典型情况是 Claude Approvals 这项检查没在 GitHub 里设为必需检查，等于什么都拦不住（按文档，observe 模式下这项检查通常也不拦合并）。

就算把这项检查设成了必需且强制执行，[Approvals 与 GitHub 规则文档](https://code.claude.com/docs/en/approvals-github-rules)还列出了几种不需要作者以外的真人也能通过的情况：

- `seats: 0`，允许机器人打开的 PR 在没人看的情况下通过。
- `seats: 1`，PR 作者自己就能占满这个席位。
- `from` 列表里放行了机器人。
- 机器账号（machine user，也就是脚本或 agent 驱动的账号），Approvals 会把它算作一个人（person）。
- `reuse` 在新提交推送后沿用了早先的批准席位。
- 没有任何规则覆盖到的文件，GitHub 会把 neutral 结果当成通过。
- 用了分类器判断的条件（写在 `if`、override 的 `if` 或 `reuse` 里），PR 自身的文本可能把分类器带偏。

直接推送到默认分支不会触发任何检查，所以 GitHub 分支规则依然要设成必须通过 PR 合并。如果同时开了 GitHub auto-merge 或 merge queue，再加上策略不要求真人，改动就能在没人动手的情况下合进去。当策略允许 Claude 批准时，Claude 发出的批准评审也能满足 GitHub 里“需要 1 个批准”的规则。

要把“没审过”和“没真人审过”分开看。一条写了 `claude: approves` 又没配 `claude/code_review = pass` 条件的规则，会让 Claude 在完全没做审查的情况下就批准 PR。如果是 Code Review 通过，但规则是 `seats: 1`（由作者自己填满）或 `seats: 0`，那这个 PR 只有 AI 审查，作者之外并没有真人看过。

要让每一条路径都至少经过一位非作者的批准，就在 `.claude/approvals.yml` 里强制执行下面这段规则，同时在 GitHub 里把 Claude Approvals 设为必需检查、来源指定为 Claude app。这段 YAML 是我从 [Approvals GitHub 规则文档](https://code.claude.com/docs/en/approvals-github-rules)原样复制的；我只检查过它能按 YAML 正常解析，没有在 Approvals 下实际跑过。照原样放进默认分支就会立即强制执行；想先观察，就在顶层加一行 `mode: observe`。删掉这行切到强制执行后，已打开的 PR 在你逐个评论 `@claude approvals rerun` 之前，可能仍带着 GitHub 当作通过的检查，见[强制执行步骤](https://code.claude.com/docs/en/approvals-setup)。

```yaml
# .claude/approvals.yml
version: 1
rules:
  - purpose: "A change takes one person who isn't an author."
    paths: ["**"]
    nested: inherit
    verdict:
      claude: comments
      seats: [{ count: 1, from: [humans, "!pr/authors"] }]
    advisory: [claude/code_review]
```

每一项的作用：

- 不写 `if` 和 `override`，避免分类器回答把规则放宽；`nested: inherit` 让它在子目录策略文件下继续生效。
- `claude: comments` 防止 Claude 发出批准评审。
- `"!pr/authors"` 把 PR 作者排除在席位之外。对于来自 fork 的 PR，任何批准都不会计入这个席位，所以把这项检查设为必需检查后，这条规则会让所有来自 fork 的 PR 都无法通过。
- `humans` 依然包含机器账号，脚本驱动的账号也能占这个席位，所以这条规则要的是一位非作者批准者，这位批准者可能是机器账号。要把某个机器账号排除掉，用 `"!"` 加上它的登录名，比如 `[humans, "!pr/authors", "!acme-ci"]`。
- `advisory: [claude/code_review]` 让自动 Code Review 继续运行（否则文件一旦被策略覆盖，只要规则里没写 `claude/code_review`，自动审查就会关掉）。

如果 GitHub 规则要求批准，也要打开“推送新提交时使旧批准失效”（或要求批准最新的可审查推送），免得早先的批准在后面新推的提交上继续生效。

## /ship 命令不是 Claude Ship

四个名字长得很像，干的是不同的事。Claude Ship 是组织级的三个 GitHub agent，走组织 usage credits 计费。Claude Code 的 `/ship` 命令跑在你本地终端会话里，算你自己的 Claude Code 用量。Orbi 的 `/orbi:ship` 命令（来自 Orbi 的 Claude Code 插件）把任务写成带 `ai-ready` 标签的 GitHub Issue 交给 Orbi，它不合并任何东西。Claude Code 还有个 `/steward`，在你自己已打开的 PR 上直接开始同样的 watch、不先审查；文档说明它和组织级的 PR Steward 是两回事，PR Steward 已在处理的 PR 上它不会启动。

在 [`/ship` 命令文档](https://code.claude.com/docs/en/ship-command)里，`/ship` 会以你的身份提交、推送并打开 GitHub PR，跑一次 `/code-review`（这是 Claude Code 的本地审查命令，算你自己的用量，不是组织级的 Code Review agent），再在当前会话里启动一个“watch”，持续处理失败的检查、合并冲突、审查评论和审查问题；通常由你自己合并 PR，但文档里[「When a watch can lead to a merge」](https://code.claude.com/docs/en/ship-command#when-a-watch-can-lead-to-a-merge)一节列了例外：PR 开了 auto-merge 时，Claude 推上去的修复可能直接触发合并；在 auto 模式下，Claude 回复你输入的消息期间，watch 的限制是关着的，它可能被允许合并。

使用 `/ship` 需要 Claude Code v2.1.330+、已登录的 GitHub CLI 2.63+ 和 `git` 2.38+。无人看守的 watch 需要 auto 模式（`bypassPermissions` 不会启动 watch，v2.1.331+ 上 `/ship` 在 plan 模式下也不会启动），原生 Windows 和后台会话里同样不会启动 watch。在公开仓库里，`/ship` 不会替你提交工作区里还没提交的改动；在允许提交和推送的仓库里，它不会弹确认提示，只会在提交前和推送前各打出一行 `Esc to cancel`。

2026 年 11 月 26 日，我在一个私有的临时仓库里用 Claude Code 2.1.331 实测了 `/ship` 命令。在由另一个 agent 会话启动的会话里输入 `/ship`，返回的是：

```text
This session was started by another session, so /ship can't run here. Run it in a session you started yourself.
```

运行 `claude -p "/ship"` 返回的是：

```text
Nothing started. Claude Code's built-in /ship doesn't start in this kind of session. Run claude in a terminal, and type it there.
```

两次运行都没有提交、推送或打开 PR。这两条拒绝提示都在 [`/ship` 排障表](https://code.claude.com/docs/en/ship-command-troubleshooting)里有记录：`/ship` 只能由坐在键盘前的人亲手输入触发，程序、定时任务或另一个 agent 都调不起来。我没有在自己手动启动的会话里跑完整个流程。

## Claude Ship 和 Orbi 各管哪一步

两者最大的区别是谁在推动这条线。Claude Ship 守在一个已经打开的 PR 旁边：代码要由你或 Claude Code 先写好，它负责审查、修评论、按策略批准，合不合并还看你的 GitHub 规则。Orbi 是整条产线：从 Issue 开始，认领、实现、开 PR、独立评审、修复、合并都由它自己推进，人在开头给出 Issue，发版时开一张发版单并打上 `ai-release`；只有仓库规则要求人工批准时，才需要人去批那一步。

| 步骤 | Claude Ship | Orbi |
|---|---|---|
| 写任务（Issue） | 不管（由你或 Claude Code 写代码） | 带 `ai-ready` 标签的 Issue（手写、`orbi draft` 或 `/orbi:ship` 生成） |
| 认领并实现 | 不管 | 认领后在 runner 上用 Pi 实现 |
| 打开 PR | `/ship` 可以以你的身份开；组织级 agent 从已有 PR 开始 | 自动打开并做核验（基于最新 base，带 `Fixes #N`） |
| 审查 | Code Review | 在精确的 base 和 head SHA 上开独立评审会话 |
| 修审查问题 / 失败 CI | PR Steward | 在同一评审会话里修复；修不掉的问题打上 `ai-fix-needed`，留到同一 PR 的下一轮评审 |
| 批准判定 | 按你的策略跑 Claude Approvals 检查 | 无策略文件；遇到 Orbi 满足不了的仓库规则（比如需要人工批准），会把 Issue 停在 `ai-awaiting-merge` 并写明维护者需要做的那一步，人工操作完成后由 Orbi 合并 |
| 合并 | GitHub 分支规则、人工合并或 auto-merge | 合并门禁通过后由 Orbi 合并：head 包含最新 base、CI 跑完且无失败项、PR 可合并、head 未变动 |
| 发版 | 不覆盖 | 你来开发版 Issue 并打上 `ai-release`（只有人能贴这个标签）；里程碑下其他 Issue 全部关闭后，Orbi 认领并跑确定性的发版状态机（不跑 Pi，不开 PR） |
| 没人敲键盘能不能跑 | Code Review 会在已启用仓库的 PR 上自动跑；PR Steward 只有设为 On 才会自己启动（文档建议先用 Manual，靠 `@claude steward` 触发）；Approvals 按策略文件自动跑；`/ship` 需要你亲手敲 | 可以，从打好标签的 Issue 一路跑到 PR 合并；发版要你开发版 Issue，且等里程碑下其他 Issue 关完 |

Claude Ship 和 Orbi 之间没有集成，我也没有在同一个仓库上同时跑过两者。Claude Code 和 Orbi 之间唯一的交接点，就是插件把 Issue 交过去。Orbi 的常规交付到 PR 合并为止。发版从不自动触发：由人来开发版 Issue，再交给 Orbi 执行。

## 一次真实的 Orbi 交付时间线

下面是 `orbi-build/orbi` 仓库里的一次真实交付，时间都在 2026 年 11 月 25 日（UTC+8）：

| 时间 | 距开票 | 谁 | 做了什么 |
|---|---|---|---|
| 10:08 | 0 分钟 | 我 | 开 [Issue #2387](https://github.com/orbi-build/orbi/issues/2387) |
| 10:12 | 4 分钟 | Orbi | 认领，启动 Pi 开始实现 |
| 10:51 | 43 分钟 | Orbi | `orbi-build` 应用打开 [PR #2388](https://github.com/orbi-build/orbi/pull/2388) |
| 11:04 | 56 分钟 | Orbi | 一轮独立评审后合并 |
| 11:14 | 66 分钟 | 我 | 开发版单 #2389 |
| 11:31 | 83 分钟 | Orbi | `orbi-build[bot]` 发布 [v0.7.63](https://github.com/orbi-build/orbi/releases/tag/v0.7.63) |

从开票到发版 83 分钟，我只动了两次手：开 Issue，开发版单。认领、实现、开 PR、评审、合并、发版都是 Orbi 自己做的。

同一个仓库从 2026 年 10 月 27 日到 11 月 25 日（按 UTC 日期计）的 30 天里，一共合并了 182 个 PR，其中 164 个由 `orbi-build` 应用自己打开并合并，平均每天 5 个多；同期发布了 46 个版本（`v0.7.19` 到 `v0.7.64`）。这是 Orbi 自己的仓库：Orbi 的代码就是这样由 Orbi 交付的。

## 你的团队适合哪一个

- 你们团队（人或 Claude Code）已经在写代码，用的是 Team 或 Enterprise 套餐加 GitHub，瓶颈卡在代码审查、修评论和批准策略上，就选 Claude Ship。先开 observe 模式，切到强制执行前把非作者批准规则加上。
- 想要一条从 Issue 到合并 PR 都不用人守着的产线，就选 Orbi：给它打好标签的 Issue，它自己做完、评审完、合并；要发版时你开一张带 `ai-release` 的发版单，等里程碑下其他 Issue 关完后 Orbi 执行。价格是固定月费：Orbi Cloud Solo 标价 US$29/月（当前价格和创始会员折扣见 [Orbi Cloud](/zh/cloud/?ref=blog-claude-ship)）。
- 没有 Team 或 Enterprise 套餐就用不了 Claude Ship，不过 `/ship` 照常可用，按普通的 Claude Code 用量计费。

## 相关

想看合并门禁和 CI 检查怎么保护自动生成的 PR，可以读[自动合并 AI PR](/zh/guides/auto-merge-ai-prs/?ref=blog-claude-ship)和[CI 门禁](/zh/guides/ci-gates/?ref=blog-claude-ship)。GitHub Actions 停在哪一步我写过[Claude Code 跑完之后，谁来合并 PR](/zh/blog/claude-code-github-actions-who-merges/)，合并后的等待时间实测见[AI 代码评审是瓶颈吗？我们的 PR 卡在合并之后](/zh/blog/ai-code-review-bottleneck/)。逐项流程对比见[Orbi vs Claude Code](/zh/compare/claude-code/?ref=blog-claude-ship)，托管版价格见[Orbi Cloud](/zh/cloud/?ref=blog-claude-ship)。
