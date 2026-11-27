---
title: AI 该不该批准 PR？批准按钮放错了地方
date: 2026-11-27
summary: Copilot、Claude Approvals、Cursor 和 CodeRabbit 都能批准 PR。为什么不该卡在批准按钮、Orbi 的合并门禁和 30 天数据。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-should-ai-approve-card.png
mirror: should-ai-approve-pull-requests
---

GitHub Copilot、Claude Approvals、Cursor 和 CodeRabbit 现在都能在 PR 上提交批准评审，但四款工具都需要先有人打开开关、启用自动化，或者提交策略文件，才会开始批准。这篇写给正在考虑要不要打开这项功能、或者在想 agent 提的 PR 能不能不经人点批准就合并的工程师和技术负责人。下面会写出我的立场、Orbi 用来替代批准按钮的合并门禁、我三个仓库 30 天的真实数据，以及哪些场景还是该留真人批准。

我是 Larry 🍀 Orbi，Orbi 的创始人。[Orbi](https://github.com/orbi-build/orbi) 是一个开源交付引擎：给它一个打好标签的 GitHub Issue，它会让编程 agent Pi 写完改动，把 PR 交给独立的评审会话，检查通过后直接合并，全程没人去点 Approve。所以这件事和我有利益关系。

GitHub 的批准评审只记录了哪个账号在哪个 commit 上点过头，并不记录检查过什么，也不记录改动是基于哪个 base 测过的。现在各家平台都允许 AI 来点这个按钮，让它顶上必需批准的名额。那 AI 到底该不该批准 PR？我的看法是，评审应当独立于写代码的一方，但评审者不必是真人；人应该管规则和最终验收，不用逐个 PR 去点批准。Orbi 完全不用 GitHub 批准：我的三个仓库把必需批准数都设成了 0，把门禁挪到了合并这一侧。

## 现在哪些工具能批准 PR

GitHub 在 2026 年 10 月 28 日的 [Octoverse 2026](https://github.blog/news-insights/octoverse/octoverse-commits-pushes-reach-new-highs-in-2026-as-developers-build-with-agents/) 报告里写道："By September 2026, more than 40% of pull requests on GitHub started with an agent's first draft, up from 17% in March."（截至 2026 年 9 月，GitHub 上超过 40% 的 PR 初稿来自 agent，3 月时还是 17%。）下面四款工具里，有两款标明了 AI 批准功能的发布日期：Copilot 是 2026 年 9 月 1 日，Claude Approvals 是 2026 年 11 月 23 日；我读的 Cursor 和 CodeRabbit 文档页没有写日期。四款都需要先有人开启或写策略文件。

| 工具 | 默认状态 / 启用方式 | 支持套餐 | 状态 | 日期 |
|---|---|---|---|---|
| GitHub Copilot | 默认关闭 | Pro、Pro+、Max、Business、Enterprise | 公测（Public preview） | 2026-09-01 |
| Claude Approvals | 在默认分支放策略文件 `.claude/approvals.yml` | Team、Enterprise | 公测（Public beta） | 2026-11-23 |
| Cursor | 在 Automations 开启 "Automatically Approve PRs"；可选放 `APPROVAL_POLICY.md` | Team、Enterprise | 我读的页面未注明 | 文档未标注日期 |
| CodeRabbit | 默认关闭（`reviews.auto_approvals.enabled`） | Essentials、Team、Advanced、Enterprise | 我读的页面未注明 | 未标注日期 |

GitHub 在 [2026 年 9 月 1 日更新日志](https://github.blog/changelog/2026-09-01-copilot-code-review-can-now-approve-pull-requests)里说明："By default, Copilot will not approve pull requests."（默认不批准 PR。）开启后，"When enabled, Copilot can submit an approval that counts toward the repository's required-approvals rule."（Copilot 提交的批准会计入仓库的必需批准规则。）适用范围是："This feature is available in public preview to GitHub Copilot Pro, Pro+, Max, Business, and Enterprise plans."（向上述套餐公测开放。）管理员可以 "choose which file paths Copilot is allowed to approve."（指定允许 Copilot 批准的文件路径。）有新提交时，"If new commits are pushed after Copilot approves, its approval is dismissed just like a human reviewer's."（Copilot 的批准会和真人一样自动失效。）[配置文档](https://docs.github.com/copilot/how-tos/copilot-on-github/set-up-copilot/configure-code-review)进一步写明了企业级默认限制（"Organizations cannot enable Copilot approvals. This is the default."，默认禁止组织启用）、路径上限（"Up to 15 globs are supported."，最多支持 15 条 glob 规则），以及两个开关项："Allow Copilot to approve pull requests" 和 "Allow Copilot approvals to count toward merge requirements"。

Anthropic 在 2026 年 11 月 23 日的 [Claude Ship](https://claude.com/blog/introducing-claude-ship) 发布中推出了 Claude Approvals。按 [Claude Ship 文档](https://code.claude.com/docs/en/claude-ship)和 [Approvals 文档](https://code.claude.com/docs/en/approvals.md)："PR Steward and Claude Approvals are in public beta."（目前处于公测），并且 "Claude Ship is for organizations on Team and Enterprise plans."（面向 Team 和 Enterprise 组织）。启用方式靠 `.claude/approvals.yml`："Claude Approvals starts when a connected repository has a policy file on its default branch, and an admin can turn it off."（已连接仓库的默认分支只要有策略文件就会启动，管理员可以关掉。）也就是说，"anyone who can merge a policy file into the default branch can turn Approvals on."（任何能把策略文件合进默认分支的人都能把它打开。）在席位规则下，"the author can fill a seat, so with `seats: 1` nobody else has to look."（作者自己就能占满一个席位，配成 `seats: 1` 时别人可以完全不看。）配合分支规则，"where a GitHub branch rule requires one approval, Claude's approving review can be that approval"（分支要求 1 个批准时，Claude 给出的批准评审就能顶上）。文档专门加了提醒："If you use GitHub auto-merge or a merge queue with a policy that doesn't require a person's approval, a change can merge without anyone acting."（策略不要求真人批准，同时开了 auto-merge 或 merge queue，改动就会在没人操作的情况下合进去。）

Cursor 的 [Approval Agents 文档](https://cursor.com/docs/approval-agents)写着："PR Routing & Approval routes pull requests to the right reviewers and can approve low-risk changes."（负责把 PR 分给合适的评审人，并可以批准低风险改动。）入口在 Cursor Automations 里："Automatically Approve PRs approves low-risk PRs after you configure approval criteria."（配好批准条件后会自动批准低风险 PR。）仓库里的 `APPROVAL_POLICY.md` 是可选的，agent 会自动发现并按里面的规则判断。文档也说明："If Bugbot or Security Agents report findings that need human review, PR Routing & Approval will not approve the PR."（如果 Bugbot 或 Security Agents 报出需要人工复核的问题，它就不会批准。）

CodeRabbit 的 [Automatic Approvals 文档](https://docs.coderabbit.ai/pr-reviews/automatic-approvals.md)写明："Automatic Approvals is off by default."（默认关闭。）开关是 `reviews.auto_approvals.enabled`，"CodeRabbit approves only when every approval requirement is met."（只有满足全部批准条件时才会批准。）

## 一次批准记下了什么，又漏掉了什么

GitHub 的必需评审规则核验的是账号身份。按 [GitHub 文档](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews)："Pull request authors cannot approve their own pull requests."（PR 作者不能批准自己的 PR。）

一次批准评审只记下了“另一个 GitHub 账号批准过某个 commit”，但决定一次合并安不安全的关键条件，它都没有记下来：

- 到底查了什么。逐条核对过验收标准，和扫一眼标题顺手点过，最后留下的绿勾一模一样。
- diff 是对照哪个 base commit 看的。`main` 往前推进以后，早先给的批准依然算数，除非分支规则同时要求先同步到最新 base 再合并。
- 这条批准现在还算不算数。GitHub 确实存了每条评审对应的 commit，但只要规则没开“推送新提交时使旧批准失效”，必需批准数里就可能还算着之前那次提交上给的批准。

就算留着真人评审，一部分开源项目里 agent PR 得到的审查本来也很稀薄。2026 年 1 月的一篇论文（[arXiv 2601.13754](https://arxiv.org/abs/2601.13754)）研究了开源项目里非仓库所有者提交的 AI 共同编写 PR，结论是："AI-co-authored PRs from non-owners receive the least, with approximately 80% merged without any explicit review."（非所有者提交的 AI 共同编写 PR 得到的审查最少，大约 80% 没有任何显式审查就合并了。）这项统计的口径很窄（只覆盖开源仓库、只看非所有者提交的 AI 共同编写 PR），不能用来推断公司私有仓库的情况，也不能套到维护者自己提的 PR 上。它说明的是这批 PR 实际得到的显式审查很少，不代表随时间推移的变化趋势。

把点 Approve 的动作交给 AI，守着的还是同一套机制：看某个账号点过头，依然没有把检查绑在最新的 base、通过的 CI，以及最终真正要合并的那个 commit 上。

## 没有真人时的独立评审：Orbi 里的“独立”指什么

在 [Orbi](https://github.com/orbi-build/orbi)（`main`，commit `d11224a5`）里，评审是一个单独跑起来的进程，用自己的提示词（`prompts/prompt_review.md`）开全新会话，不接续实现阶段的上下文。它读的是 Issue 原文、可信评论、人在 PR 上留的反馈，以及一对冻结好的 base/head SHA。

评审结束后必须给出三种结论之一：`pass`、`findings` 或 `blocked_on_human_decision`。只要有 Blocker 或 Major 级别的问题，就不能给 `pass`，结论里也会明确写出所评审的 head commit。如果输出解析不出来，一律按报错处理，绝不当成 `pass`。

这种“独立”在两个地方比听上去要弱：

- 默认用的并非另一家厂商的模型。Orbi 支持单独配置评审模型（`review_pi_provider` 和 `review_pi_model`），没配的时候就复用实现阶段的模型。我不会声称自己的仓库用了不同厂商的模型。
- 评审员会在同一个会话里直接把 Blocker 和 Major 问题修掉、跑测试、推送提交，然后给出最终结论。这些会话内顺手修好的改动，不会再过第二个评审会话。

这两个缺口靠兜底机制限制住。评审员推上去的任何 commit，后面都必须重新过 CI 和下一节的合并门禁。它修不掉的问题会贴上 `ai-fix-needed` 标签退回去重修，走新一轮流程。评审最多跑五轮，超过五轮就把 Issue 标成 `ai-blocked` 交给人拍板。同一个问题连续两轮重复出现，评审也会停下来问人。

## Orbi 不点批准，合并前查什么

Orbi 从不提交 GitHub 批准评审，也不传 `--admin`，而是直接走合并流程，在合并时强制查五道门禁：

- 没有任何 CI 检查失败；检查还在跑就等下一轮轮询再看。
- PR 分支必须包含最新的 base。合并前 Orbi 会先拉取最新 base；如果 PR 落后且合并没有冲突，Orbi 就把 base 合进 PR 分支、推送、记下这个合并 commit 作为准备落地的 head，然后等它跑完 CI。同一轮里刚推上去的 head 绝不直接合并。这次合并 base 不会触发第二次评审；一旦有冲突，或者其他人往分支推了新提交，PR 就会被退回重新评审。
- 真正合进去的 head 必须是刚验过的那个。Orbi 用 `gh pr merge --match-head-commit <head>` 执行合并，如果上次检查完之后分支又动过，合并会直接报错退出，不会把没检查过的提交合进去。
- 如果某项检查在 base 分支上本身就失败，Orbi 会暂停当前 PR，另外开一张修 base 故障的 Issue。
- 只要 Issue 上挂着 `ai-blocked` 标签，就算评审和 CI 全过，合并也会拦住。

如果仓库的分支规则要求批准（`required_approving_review_count >= 1`），Orbi 不会自己批准自己，而是给 Issue 贴上 `ai-awaiting-merge` 标签，评论写明需要人做什么，之后再重试。这条路径在我自己的仓库里还没触发过，因为我的仓库要求 0 个批准；这里描述的是 Orbi 的设计行为，不是我的亲身运行记录。

有一类改动不走 PR：发版时，Orbi 会确认当前里程碑下没有未完成的工作，直接把版本号递增的 commit 推到 base 分支，等这个 commit 的 CI 全绿后再打 tag 和发布。

## 30 天，零批准合并的 agent PR 数据

2026 年 11 月 27 日通过 GitHub API 核对，我的三个仓库都不要求批准评审：`orbi-build/orbi-website` 在 `beta` 和 `main` 上的 ruleset 要求走 PR，但 `required_approving_review_count` 是 `0`；`orbi-build/orbi-cloud` 的 ruleset 只拦删分支和强推，没有 pull-request 规则；`orbi-build/orbi` 没有作用于 `main` 的 ruleset（include 列表为空），也没有经典分支保护。三个仓库查经典分支保护都返回 `"Branch not protected"`（404）。同样在 2026 年 11 月 27 日核对过，runner 的 PR 都由 GitHub App `orbi-build`（`app/orbi-build`）打开并合并。

以下是 Orbi Cloud 生产交付回执的统计，时间范围从 2026 年 10 月 28 日 00:00 到 2026 年 11 月 27 日 00:00（+08），只计入由 Orbi runner 交付并合并的 PR：

| 仓库 | 已合并 | 1 轮评审 | 2 轮 | 3 轮及以上 | 最多轮数 |
|---|---:|---:|---:|---:|---:|
| `orbi` | 167 | 159 | 6 | 2 | 3 |
| `orbi-cloud` | 462 | 394 | 53 | 15 | 4 |
| `orbi-website` | 92 | 86 | 6 | 0 | 2 |
| 合计 | 721 | 639 | 65 | 17 | 4 |

721 个 PR 里有 82 个（11.4%）跑了不止一轮评审。触发第二轮的原因有两种：评审发现了自己会话内修不掉的问题，或者合并门禁阶段有 CI 挂掉。在公开仓库里，跑了不止一轮的一共 14 个 PR：10 个是因为合并门禁阶段 CI 失败，4 个是因为评审发现问题。这 721 个 PR 合并时没有一个需要批准：仓库把要求设成了 0，Orbi 也从不提交批准。

公开仓库的数据可以直接复现。在 GitHub 搜索 `repo:orbi-build/orbi is:pr is:merged author:app/orbi-build merged:2026-10-27T16:00:00Z..2026-11-26T16:00:00Z` 会返回 167 个 PR，换成 `orbi-build/orbi-website` 会返回 92 个。这 259 个 PR 上没有任何 GitHub 评审记录，批准数也是 0，和上面的回执完全对得上。

读这组数据要注意四件事：

- 这不是问题检出率。统计里混了 CI 重试，而评审员在自己会话里顺手修掉的问题留在第 1 轮里，没有拆出来计。私有的 `orbi-cloud` 我也没有按原因拆分的记录。
- 表格只统计了最终合并的 PR。
- 这些数字只能说明评审加 CI 的回路会把有问题的 PR 退回去重做，不能证明“没人批准就合并”一定安全。安全性靠的是合并门禁和发版阶段的验收。
- `orbi-cloud` 是私有仓库，`orbi` 和 `orbi-website` 是公开的，所以读者只能点开核对那 259 个公开 PR。

## 人还守在哪里

拿掉逐个 PR 点批准以后，人退到了两个位置：规则和发版验收。上游由人写 Issue、维护分支和 CI 规则，并在评审满五轮、问题重复出现或返回 `blocked_on_human_decision` 时处理 `ai-blocked` 的单子。

下游以 `orbi-cloud` 为例（具体过程我写过[AI 代码评审是瓶颈吗？我们的 PR 卡在合并之后](/zh/blog/ai-code-review-bottleneck/)），推向生产仍然由人把关：打完 tag 后先部署到 `beta`，在 `beta` 上跑端到端新用户检查，我签字确认后再把晋升合进 `main`，最后生产部署还要人点一次确认。验收挪到了跑起来的发布版本上，不再拆成逐个 PR 看 diff。

## 哪些情况应该保留人工批准

下面四种情况还是应该留着真人批准：

- 没有 CI 或测试很薄弱的仓库。Orbi 不要求仓库至少配一项 CI 检查；没有 CI 的仓库只凭评审就能合并，没有测试兜底的项目不适合关掉人工批准。
- 没有预发验收步骤、合完直接上生产的分支。少了 `beta` 验证和人工发版签字，撤掉逐 PR 批准就等于撤掉了验收门禁。
- 策略和治理类文件。在 Claude Approvals 里，只要能把 `.claude/approvals.yml` 合进默认分支就能把 Approvals 打开；修改策略文件和 CI 规则的 PR 值得留人把关。
- 合规要求或团队制度规定每个 PR 必须由真人批准。保持 `required_approving_review_count >= 1`，交给 GitHub 强制拦截（Orbi 会把单子停在 `ai-awaiting-merge` 等人处理）。

## 如果你还是打算开 AI 自动批准

如果你打算保留必需批准规则，让 AI 工具去填这个批准名额，开之前先查五项设置：

- 限制路径范围。Copilot 最多支持 15 条 path glob，把自动批准收在低风险文件里。
- 别让作者自己占满唯一席位。在 Claude Approvals 里，`seats: 1` 允许作者自己填满席位，别人完全不用看；而且任何能把 `.claude/approvals.yml` 合进默认分支的人都能打开 Approvals。
- 保持 CI 为必需检查，并要求合并前分支必须与 base 同步，确保批准对应的是在最新 base 上测过的代码。
- 推送新提交时使旧批准失效。Copilot 的批准在新提交推上去后会和真人一样失效；顺手核对一下规则对真人批准也开了同样设置。
- 排查 auto-merge 和 merge queue。只要策略里不要求真人批准，配合 auto-merge 或 merge queue，改动就能在没人动手的情况下直接合进去。

## 查一下你的分支到底要求什么

GitHub 的 ruleset 和经典分支保护用的是两套 API。查分支的 ruleset 是否要求批准：

```bash
gh api repos/OWNER/REPO/rules/branches/BRANCH \
  --jq '.[] | select(.type=="pull_request") | .parameters.required_approving_review_count'
```

2026 年 11 月 27 日实测：`orbi-website` 的 `beta` 输出 `0`；`orbi-cloud` 的 `beta` 没有任何输出（没有 `pull_request` 规则）；传一个不存在的分支名同样没有任何输出且退出码为 `0`；传一个不存在的仓库会返回 HTTP 404，退出码为 `1`。空输出代表“没有 ruleset 要求走 PR”，不代表“要求 0 个批准”，而且分支名拼错时结果完全一样。

上面那个接口只查 ruleset，经典分支保护要分开查：

```bash
gh api repos/OWNER/REPO/branches/BRANCH/protection \
  --jq '.required_pull_request_reviews.required_approving_review_count'
```

读取经典分支保护可能需要管理员权限。在我的三个分支上，这条命令都返回了 `{"message":"Branch not protected",...,"status":"404"}` 和 `gh: Branch not protected (HTTP 404)`，退出码 `1`。

## 相关

关于 `.claude/approvals.yml` 可以读[Claude Ship：它自动做了什么，又停在哪一步](/zh/blog/claude-ship/)，GitHub Actions 停在哪一步见[Claude Code 跑完之后，谁来合并 PR](/zh/blog/claude-code-github-actions-who-merges/)，合并门禁细节见[AI 代码审查工作流：让 AI 自己合并 PR 的四道门](/zh/guides/auto-merge-ai-prs/)，发版晋升流程见[AI 代码评审是瓶颈吗？我们的 PR 卡在合并之后](/zh/blog/ai-code-review-bottleneck/)。哪些检查该放进 CI 可以看[CI 门禁：CI 里放什么，Orbi 就保证什么](/zh/guides/ci-gates/)，Orbi 和 Copilot cloud agent 的对比见[Copilot cloud agent 替代：谁来合并 PR](/zh/compare/github-copilot-coding-agent/)。托管版本见 [Orbi Cloud](/zh/cloud/?ref=blog-ai-approve)。
