---
title: Devin vs Cursor：它们开出的 PR 后来怎么样了
date: 2026-11-13
summary: 按两家官方页面对照编辑器、云端 agent 和价格，再统计它们的 GitHub App 在公开 GitHub 仓库开出的 PR。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-devin-vs-cursor-card.png
mirror: devin-vs-cursor
---

Devin vs Cursor 比的是两条都提供编辑器和云端 agent 的产品线：[Devin 是 Cognition 的产品](https://cognition.com/)，包括可以派活的云端编程 agent，以及 [2026 年 6 月 2 日前叫 Windsurf 的编辑器 Devin Desktop](https://devin.ai/blog/windsurf-is-now-devin-desktop)；Cursor 是 [AI 代码编辑器](https://cursor.com/docs/agent/overview)，也有自己的[云端 agent](https://cursor.com/docs/cloud-agent)。这篇写给正在决定为哪款产品付费的开发者和团队负责人。我按 2026 年 11 月 13 日两家的官方页面，对照编辑器、云端 agent 和价格，统计它们的 GitHub App 在 2026 年 10 月于公开仓库开出的 PR（pull request，拉取请求）后来怎么样了，并附上能在任意仓库重复统计的脚本。先说统计的结论：单看一个合并占比说明不了什么，同一个 bot 的占比，随草稿和时间窗口怎么筛，会从 19% 变到 93%。这次写文章，我没有购买任何一家的云端 agent：[Devin Cloud 需要每月 $20 的 Pro](https://devin.ai/pricing)，[Cursor Cloud Agents 需要每月 $30 的 Premium](https://cursor.com/help/account-and-billing/pricing)。两家都有 $0 套餐，但都不包含云端 agent。所以我没有上手实测结果，也不判断谁写的代码更好。

我是 Larry 🍀 Orbi，Orbi 的创始人。Orbi 接手 GitHub Issue，完成实现、独立评审和合并，与这两款产品的云端 agent 部分存在竞争关系。读最后一节时，请把这层关系算进去。

## Devin vs Cursor 的区别一览

Devin 和 Cursor 的区别，先看这张表。

| | Devin | Cursor |
|---|---|---|
| 编辑器 | [Devin Desktop](https://docs.devin.ai/desktop/devin-desktop-faq) | [Cursor，带 Agent](https://cursor.com/docs/agent/overview) |
| 云端 agent | [Devin Cloud](https://docs.devin.ai/desktop/devin) | [Cloud Agents](https://cursor.com/docs/cloud-agent) |
| 终端 CLI | [Devin CLI](https://docs.devin.ai/cli/introducing-devin-cli) | [Cursor CLI，命令是 `agent`](https://cursor.com/docs/cli/overview) |
| 代码评审产品 | [Devin Review](https://docs.devin.ai/work-with-devin/devin-review) | [Bugbot](https://cursor.com/docs/bugbot) |
| 云端任务在哪运行 | [每个会话独享一台 VM](https://docs.devin.ai/desktop/devin) | [每个 agent 独享一台 VM](https://cursor.com/help/ai-features/background-agents) |
| 云端任务入口 | [网页、Slack、API](https://docs.devin.ai/enterprise/deployment/overview)；下文还有其他入口 | [应用、网页、编辑器、集成、API](https://cursor.com/docs/cloud-agent) |
| 最低云端套餐 | [Pro，每月 $20](https://devin.ai/pricing) | [Premium，每月 $30](https://cursor.com/help/account-and-billing/pricing) |
| 合并前的评审，文档怎么说 | [“Human engineers review PRs created by Devin before choosing whether to merge the code changes.”](https://docs.devin.ai/essential-guidelines/sdlc-integration) | [“merge-ready PRs”](https://cursor.com/docs/cloud-agent)；我没找到谁来评审的说明 |
| agent 能否合并，文档怎么说 | [GitHub 指南](https://docs.devin.ai/integrations/gh)建议设置分支保护，原文是 “before Devin can merge changes” | 在 Cursor 自家的代码托管 [Origin](https://cursor.com/docs/origin) 上，[agent 会请人批准合并](https://cursor.com/docs/release-notes/cloud-agents)；GitHub 上我没找到说明 |

Devin 的文档既提到人决定是否合并，也提到 Devin 可以执行合并。SDLC 指南写的是人来评审，再决定是否合并；GitHub 指南建议设置分支保护，“to ensure all required checks pass before Devin can merge changes”，提到了由 Devin 执行合并的可能。Cursor 在 [2026 年 9 月 7 日当周的 Cloud Agents 更新记录](https://cursor.com/docs/release-notes/cloud-agents)里，描述了 agent 在 Origin 仓库请求批准合并 PR 的流程；GitHub 仓库我没找到同样的说明。下文有一组[抽样](#各个-bot-开出的-pr-后来怎么样了)读取了 GitHub 的 `merged_by` 字段，看实际执行合并的是哪个账号。

## 编辑器：Cursor 和原来叫 Windsurf 的 Devin Desktop

Windsurf 在 [2026 年 6 月 2 日改名](https://devin.ai/blog/windsurf-is-now-devin-desktop)为 Devin Desktop。[FAQ](https://docs.devin.ai/desktop/devin-desktop-faq) 的原话是 “the same IDE, same editor”。所以现在搜 “Devin vs Windsurf”，找到的是同一品牌下的产品。

[Devin Desktop](https://devin.ai/blog/windsurf-is-now-devin-desktop) 是带 agent 管理器的完整 IDE。它内置的本机 agent 叫 Devin Local，接替了原来的 Cascade。Desktop 还能运行 Codex、Claude Agent、OpenCode，以及其他支持 ACP 的 agent；ACP 是它用来接入外部 agent 的协议。它[可以只用本机 agent](https://docs.devin.ai/desktop/devin-desktop-faq)，不接 Devin Cloud。[Free](https://devin.ai/pricing) 提供少量 agent 额度、有限的模型选择，以及不限次数的行内编辑和 Tab 补全。

[Cursor 编辑器里的 Agent](https://cursor.com/docs/agent/overview) 能改代码、运行终端命令。[模型页](https://cursor.com/help/models-and-usage/available-models)把 Grok 4.7 和 Composer 2.5 纳入套餐用量；Free 和 Plus 只能运行 Cursor 自家的模型。[Free 用量有限](https://cursor.com/help/account-and-billing/pricing)。[Premium 及以上套餐开放 Claude、GPT 和其他第三方模型](https://cursor.com/help/account-and-billing/pricing)，费用按 API 标价从预付额度里另扣。只比较编辑器的话，我会对照 Desktop 对外部 agent 的支持，以及 Cursor 的模型权限和额外账单。我没有上手比较过这两款编辑器。

## 云端 agent：Devin Cloud 和 Cursor Cloud Agents 怎么接任务

搜 Cursor agent vs Devin 的人，要比的是 Devin Cloud 和 Cursor Cloud Agents；后者[以前叫 Background Agents](https://cursor.com/docs/cloud-agent)。

| | Devin Cloud | Cursor Cloud Agents |
|---|---|---|
| 默认运行方式 | [每个会话一台 VM](https://docs.devin.ai/desktop/devin) | [每个 agent 一台专用 VM](https://cursor.com/help/ai-features/background-agents) |
| 使用自己的机器 | [Outposts](https://docs.devin.ai/cloud/outposts/overview)；agent 循环仍在 Devin 云端 | [Self-Hosted Machines](https://cursor.com/docs/cloud-agent/self-hosted)；agent 循环仍在 Cursor 云端 |
| 任务入口 | [网页、Slack、API](https://docs.devin.ai/enterprise/deployment/overview)、[Teams](https://docs.devin.ai/integrations/microsoft-teams)、[Linear](https://docs.devin.ai/integrations/linear)、[Jira](https://docs.devin.ai/integrations/jira)、[尚未关闭的 PR 上的 `/devin`](https://docs.devin.ai/integrations/gh)、[CLI](https://docs.devin.ai/cli/cloud)、[Desktop](https://docs.devin.ai/desktop/devin)、[Automations](https://docs.devin.ai/product-guides/automations) | [iOS、网页、桌面、Slack、GitHub PR 或 Issue 上的 `@cursor`、Linear、API](https://cursor.com/docs/cloud-agent)；[Jira 需要 Teams/Enterprise](https://cursor.com/docs/integrations/jira) |
| 评审评论 | [会话尚未归档时会回复](https://docs.devin.ai/integrations/gh) | [通过订阅在收到评论后恢复工作](https://cursor.com/docs/cloud-agent/capabilities) |
| CI 失败 | [允许接收 CI bot 的评论后自动修复](https://docs.devin.ai/product-guides/bot-comment-settings) | [只修自己开的 PR，且只支持 GitHub Actions；Teams/Enterprise 可自动修复](https://cursor.com/docs/cloud-agent/capabilities) |

两家在 GitHub Issue 上的做法不同。Devin [普通的 `/devin` 集成会忽略 Issue 上的评论](https://docs.devin.ai/integrations/gh)，要从 Issue 评论启动任务，得先配置 [Automation](https://docs.devin.ai/product-guides/automations)。Cursor 在 Issue 和 PR 上都能读到 `@cursor`。

CI 的处理也不同。Cursor [只有 Teams 和 Enterprise 套餐会自动修复失败的 CI](https://cursor.com/docs/cloud-agent/capabilities)；用较低档套餐时，你得自己让 agent 盯着这个 PR 并修复。有人往分支推了提交之后，这次提交上的 CI 失败它不会自动修。

[Devin Review 包含在 Free 套餐里。在 Teams 套餐上，它消耗团队共享的按需额度；评审公开 PR 不收费](https://docs.devin.ai/admin/billing/self-serve)。它的 beta 功能 [Autoapprover “does not merge PRs itself”](https://docs.devin.ai/work-with-devin/devin-review)。[Bugbot 按用量计费](https://cursor.com/docs/bugbot)，[每次运行平均 $1.00 到 $1.50](https://cursor.com/help/account-and-billing/bugbot-usage-based-billing)。[Bugbot Autofix 会启动一个 Cloud Agent](https://cursor.com/docs/bugbot) 来处理评审发现的问题。

## Cursor 和 Devin 的价格

[Cursor 现在作为 The X Subscription 的一部分销售](https://cursor.com/help/account-and-billing/pricing)，订阅覆盖 Grok、Cursor 和 X。Pro、Pro+ 是旧套餐，已不接受新客户。以下是 2026 年 11 月 13 日的月付价格：

| 套餐 | 月费 | 相关功能或额度 |
|---|---|---|
| [Devin Free](https://devin.ai/pricing) | $0 | 少量本机 agent 额度；不限次数的 Tab 补全 |
| [Devin Pro](https://devin.ai/pricing) | $20 | 云端使用权限；完整模型选择 |
| [Devin Max](https://devin.ai/pricing) | $200 | Pro 功能，更高额度 |
| [Devin Teams](https://docs.devin.ai/admin/billing/self-serve) | 最低 $80；每个完整席位 $40（两处页面说法不一致，见下文） | 共享额度 |
| [Devin Enterprise](https://docs.devin.ai/admin/billing/enterprise) | Agent Compute Unit（ACU）费率以订单为准 | 未找到公开的每 ACU 价格 |
| [Cursor Free](https://cursor.com/help/account-and-billing/pricing) | $0 | 用量有限；不含云端 agent |
| [Cursor Plus](https://cursor.com/help/account-and-billing/pricing) | $8 | 仅限 Cursor 模型；不含云端 agent |
| [Cursor Premium](https://cursor.com/help/account-and-billing/pricing) | $30 | Cloud Agents、Bugbot、第三方模型权限 |
| [Cursor Super](https://cursor.com/help/account-and-billing/pricing) | $100 | 包含的额度更多；使用权限相同 |
| [Cursor Ultra](https://cursor.com/help/account-and-billing/pricing) | $200 | 包含的额度更多；使用权限相同 |
| [Cursor Teams](https://cursor.com/help/account-and-billing/pricing) | 每席 $30/$100/$200 | 用量随席位档位变化 |
| [Cursor Enterprise](https://cursor.com/pricing) | 定制 | [共享用量、管理控制](https://cursor.com/help/account-and-billing/pricing) |

Devin 的 Teams 页面说法不一致：[定价页](https://devin.ai/pricing)写的是 “$80/month for team plan + $40/mo per full dev seat”；[计费文档](https://docs.devin.ai/admin/billing/self-serve)说席位和额度费用可以合计满足最低 $80。我会在结账时核对总额。

[Devin 的额度](https://docs.devin.ai/admin/billing/self-serve)由云端会话、CLI 和 Desktop 共用：Pro 和 Teams 完整席位同时有每日和每周两道上限，Max 只有每周上限。具体额度没有公开；[额外额度按 API 价格计费](https://devin.ai/pricing)。[Cursor 的每周共享额度](https://cursor.com/docs/models-and-pricing)覆盖编辑器、CLI 和 Cloud Agents 中使用的自家模型；[第三方模型另收费](https://cursor.com/help/the-x-subscription/overview)。两家都没有在这些页面公布每档套餐能跑多少云端任务，所以从这些页面算不出，把同样的活干到合并，哪家花的钱更少。

## 各个 bot 开出的 PR 后来怎么样了

我用 `is:pr is:public author:app/<slug> created:<range>` 查询 GitHub 搜索 API，所有计数都在 2026 年 11 月 13 日 01:46 到 02:46 UTC 之间完成（UTC+8 的 09:46 到 10:46）。数字反映查询时每个 PR 的状态；仍开着的 PR 数量还会继续变化。

这次普查只统计公开 GitHub 仓库里作者为 `devin-ai-integration[bot]` 或 `cursor[bot]` 的 PR，两款产品的其他产出没有计入。两个 bot 分开列表，因为两行数字不宜直接对比，看草稿那一列就知道原因。

`devin-ai-integration[bot]` 在 2026 年 10 月 1 日至 31 日 UTC 创建的 PR：

| 开出 | 已合并 | 关闭未合并 | 仍开着 | 草稿（所有状态） |
|---|---|---|---|---|
| 52,775 | 38,381 (72.7%) | 4,832 (9.2%) | 9,562 (18.1%) | 974 (1.8%) |

`cursor[bot]` 在同一时段创建的 PR。看「已合并」那一列之前，先看最后一列：这些 PR 有四分之三被标为草稿，而 GitHub 文档写明 “[Draft pull requests cannot be merged](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests)”，要有人把它标为可评审之后才能合并：

| 开出 | 已合并 | 关闭未合并 | 仍开着 | 草稿（所有状态） |
|---|---|---|---|---|
| 28,400 | 5,446 (19.2%) | 2,864 (10.1%) | 20,090 (70.7%) | 21,547 (75.9%) |

「草稿（所有状态）」统计查询时被 GitHub 搜索标为草稿的全部 PR，包括仍开着、已关闭和已合并的。后面的脚本只输出仍开着的草稿数（381 和 18,916），所以数字更小。草稿标记反映的是查询时的状态，不是创建时的状态：`is:merged draft:true` 也返回了 275 个 `devin-ai-integration[bot]` PR 和 441 个 `cursor[bot]` PR。我没有查明这些已合并记录为什么会匹配草稿筛选条件。

`cursor[bot]` 开出的 PR 有四分之三被标为草稿，其中 18,916 个仍开着。`devin-ai-integration[bot]` 的 PR 里草稿很少。Cursor 在 [2026 年 10 月 19 日当周的更新记录](https://cursor.com/docs/release-notes/cloud-agents)里说，Cloud Agents “now open pull requests ready for review instead of as drafts, unless you or the task ask for a draft”。我统计时，公开数据还没有明显变化：10 月 1 日至 18 日创建的 14,346 个 `cursor[bot]` PR 中，11,061 个被标为草稿（77.1%）；10 月 19 日至 31 日的 14,054 个里有 10,486 个（74.6%）；11 月 1 日至 10 日的 7,107 个里有 5,334 个（75.1%）。从外部看不出是这些仓库要求开草稿，还是改动尚未覆盖它们。

同一个作者，换个筛选范围，合并占比就会差很多。

`cursor[bot]` 在 10 月开出的全部 PR 中，19.2% 已合并。只看统计时没有草稿标记的 10 月 PR，已合并的是 6,853 个中的 5,005 个（73.0%）。再缩到 10 月 12 日至 18 日且没有草稿标记的 PR，则是 1,241 个中的 1,156 个（93.2%）；这次筛选只留下了当周 4,709 个 PR 中的 1,241 个。

`devin-ai-integration[bot]` 的草稿很少，同样三种筛选下分别是 72.7%、51,801 个中的 38,106 个（73.6%）、8,209 个中的 6,188 个（75.4%）。

同一个作者，数字随筛选条件从 19% 变到 93%，不能把它当成质量分。我不会用这些占比判断哪款产品更好。它们只描述这两个作者在这些时段开出的公开 PR 的状态。

对 2026 年 10 月 12 日至 18 日 UTC 这一周，我完整拉取了全部 13,055 个匹配的 PR，没有抽样。

| 作者 | PR 数 | 仓库数 / 所有者数 | PR 最多的仓库 | PR 最多的 10 个仓库 | 只有一个 PR 的仓库 | 有已合并 PR 的仓库 |
|---|---|---|---|---|---|---|
| `devin-ai-integration[bot]` | 8,346 | 1,473 / 979 | 241 (2.9%) | 1,201 (14.4%) | 696 (47.3%) | 1,473 个中有 1,077 个 (73.1%) |
| `cursor[bot]` | 4,709 | 812 / 722 | 165 (3.5%) | 1,050 (22.3%) | 339 (41.7%) | 812 个中有 269 个 (33.1%) |

这一周 `devin-ai-integration[bot]` PR 最多的四个仓库中，包括排第一、有 241 个 PR 的那个在内，三个属于两个组织：COG-GTM（两个仓库，373 个 PR，没有已合并的 PR）和 Cognition-Partner-Workshops（一个仓库，113 个 PR，39 个已合并）。这两个组织的 GitHub 资料都没有简介或网站，我无法确认由谁运营；这三个仓库的流量可能来自演示或工作坊。第四个是 Open-MBEE/OpenSysML，这是有自己网站的开源项目，182 个 PR 中有 179 个已合并。`cursor[bot]` 当周有五个仓库的 PR 数达到 100 或更多，共 701 个 PR，没有已合并的。

去掉当周匹配 PR 数达到 100 或更多的仓库，每个作者各去掉五个。`devin-ai-integration[bot]` 去掉的是上面四个加 airbytehq/airbyte，共 776 个 PR，剩下 7,570 个，其中 5,941 个已合并，105 个被标为草稿。`cursor[bot]` 剩下 4,008 个 PR，其中 1,300 个已合并，2,767 个被标为草稿；被去掉的 701 个 PR 里没有已合并的，所以已合并数不变。

下表是完整一周（没有去掉任何仓库）里已合并 PR 的合并耗时。这些耗时不反映尚未合并的 PR。每一行只在该作者自己已合并的 PR 上计算，两行的取样范围不同，不宜拿来互相比较。

| 作者 | 已合并 PR 数 | 一半在此时间内合并 | 四分之一在此时间内合并 | 一分钟内合并 |
|---|---|---|---|---|
| `devin-ai-integration[bot]` | 6,211 | 24.6 分钟 | 5.1 分钟 | 660 (10.6%) |
| `cursor[bot]` | 1,300 | 85.6 分钟 | 8.0 分钟 | 112 (8.6%) |

我从这一周每个作者的已合并 PR 里（6,211 个和 1,300 个）分别随机抽了 150 个（种子为 `20261113`），读取 GitHub pulls API 的 `merged_by` 字段：

| PR 作者 | 由用户账号合并 | 由同一个 bot 合并 | 由 `github-actions[bot]` 合并 | 其他 |
|---|---|---|---|---|
| `devin-ai-integration[bot]` | 100 | 48 | 1 | 1 个由 `cursor[bot]` 合并 |
| `cursor[bot]` | 100 | 41 | 8 | 1 个空值 |

两组抽样里，分别有 150 个中的 48 个和 41 个，约三成，是由 PR 作者自己的 bot 账号合并的。我不知道是人请求了合并，还是规则触发的；这个字段只记录账号。第一张表里的文档说明无法确定 GitHub 上谁负责合并，这次抽样也无法确定。抽到的 150 个 `devin-ai-integration[bot]` PR 中，29 个至少有一条评审评论；150 个 `cursor[bot]` PR 中有 13 个。评论数不能证明是否有人评审过。

有四个统计限制：

- Devin 的 [“Open PRs as” 设置](https://docs.devin.ai/integrations/gh)可以使用用户账号。这些 PR 没有计入。
- Cursor 文档写明 [Automations](https://cursor.com/docs/cloud-agent/automations) 使用 `cursor` 作为作者，但没说明普通 Cloud Agent 的作者账号。[Bugbot Autofix 也会启动 Cloud Agents](https://cursor.com/docs/bugbot)，所以这个作者名下可能包含这部分工作。
- 只能看到公开仓库。主要在私有仓库工作的付费团队，不在这次普查范围内。
- 搜索计数会变。同一周的 `devin-ai-integration[bot]` 已合并数，十分钟后就从 6,211 变成了 6,201。数字为什么会减少，我没有查明；变动幅度约 0.2%。

还有两组数据可供了解背景：[Cognition 在 2025 年 11 月的回顾](https://cognition.com/blog/devin-annual-performance-review-2025)里说，Devin 开出的 PR 约有三分之二被合并；[Cursor 在 2026 年 9 月 2 日说](https://cursor.com/blog/self-hosted-machines)，它内部已合并的 PR 中，超过 60% 由云端 agent 创建。这两组数据的分母不同，彼此不能比较，也不能和这次普查比较。

## 自己统计一遍

下面的脚本统计 PR 的基本状态，草稿只计入仍开着的 PR。它不会复现上文排除草稿后的合并占比。参数用 App 的 slug，不带 `[bot]` 后缀：`devin-ai-integration` 或 `cursor`。

```bash
#!/usr/bin/env bash
# Count the pull requests a GitHub App opened, by what happened to them.
# usage: agent-pr-count.sh <app-slug> <created-range> [owner/repo]
#   agent-pr-count.sh devin-ai-integration 2026-10-01..2026-10-31
#   agent-pr-count.sh cursor 2026-10-01..2026-10-31 your-org/your-repo
set -euo pipefail
app="${1:?app slug, for example devin-ai-integration or cursor}"
range="${2:?created range, for example 2026-10-01..2026-10-31}"
scope="is:public"
if [ -n "${3:-}" ]; then scope="repo:$3"; fi

count() {
  local n
  n=$(gh api -X GET search/issues -f q="is:pr $scope author:app/$app created:$range $1" -q .total_count) ||
    { echo "search failed: is:pr $scope author:app/$app created:$range $1" >&2; return 1; }
  [[ "$n" =~ ^[0-9]+$ ]] || { echo "no count returned: is:pr $scope author:app/$app created:$range $1" >&2; return 1; }
  sleep 2.2 # the search API allows 30 requests a minute
  echo "$n"
}

opened=$(count "")
[ "$opened" -gt 0 ] || { echo "no PRs by app/$app in $range ($scope)" >&2; exit 1; }
merged=$(count "is:merged")
closed=$(count "is:closed is:unmerged")
open=$(count "is:open")
open_draft=$(count "is:open draft:true")
if [ $((merged + closed + open)) -ne "$opened" ]; then
  echo "warning: the parts do not add up to the total; PRs changed state during the run" >&2
fi

echo "app/$app, created $range, $scope, counted $(date -u +%Y-%m-%dT%H:%MZ)"
echo "opened           $opened"
echo "merged           $merged"
echo "closed unmerged  $closed"
echo "still open       $open (draft: $open_draft)"
```

存为 `agent-pr-count.sh`，再运行 `chmod +x agent-pr-count.sh`。需要 bash，以及已登录的 GitHub CLI `gh`；我测试的版本是 gh 2.100.0 和 bash 5.3。别直接粘进交互式 shell：第一次失败时，`set -e` 可能会把那个 shell 关掉。

下面是三次实际运行的输出，三次在同一分钟内跑完，时间戳为 UTC。`exit=0` 那几行不是脚本打印的，是我在每次运行后用 `echo "exit=$?"` 打印的。PR 的状态一直在变，你跑出来的数字会略有不同。

```text
$ ./agent-pr-count.sh devin-ai-integration 2026-10-01..2026-10-31
app/devin-ai-integration, created 2026-10-01..2026-10-31, is:public, counted 2026-11-13T02:02Z
opened           52775
merged           38381
closed unmerged  4832
still open       9562 (draft: 381)
exit=0

$ ./agent-pr-count.sh cursor 2026-10-01..2026-10-31
app/cursor, created 2026-10-01..2026-10-31, is:public, counted 2026-11-13T02:02Z
opened           28400
merged           5446
closed unmerged  2864
still open       20090 (draft: 18916)
exit=0

$ ./agent-pr-count.sh devin-ai-integration 2026-10-01..2026-10-31 airbytehq/airbyte   # one repository
app/devin-ai-integration, created 2026-10-01..2026-10-31, repo:airbytehq/airbyte, counted 2026-11-13T02:02Z
opened           453
merged           225
closed unmerged  88
still open       140 (draft: 58)
exit=0
```

第三个参数把统计范围限定到一个仓库，也支持你的 `gh` 登录账号有权读取的私有仓库。

没有匹配结果时，脚本退出码为 1。我用空时间范围测试时，报错是 `no PRs by app/cursor in 2031-01-01..2031-01-31 (is:public)`。不存在的 app slug 或仓库会以退出码 1 报 `gh: Validation Failed (HTTP 422)`；凭据无效时，以退出码 1 报 `gh: Bad credentials (HTTP 401)`。搜索失败还会打印查询语句。分项之和与总数不一致时，会打印脚本里的警告。

搜索 API 每分钟允许 30 次请求，所以脚本在五次查询之间各等 2.2 秒。每次搜索最多能列出 1,000 条结果，但 `total_count` 仍是完整的数量；这个脚本只读计数。我的完整普查脚本没有在本站发布。为了列出每个 PR，我把时间范围切分到每段不超过 1,000 条，再逐段分页拉取。

## 选之前我会先查什么

- 如果我已经在为 Claude 或 GPT 的 API 用量付费，我会先确认 [Desktop 的外部 agent](https://devin.ai/blog/windsurf-is-now-devin-desktop) 能否沿用这份账单，再决定是否购买另一份订阅。[Cursor 使用第三方模型需要 Premium，用量还要另付费](https://cursor.com/help/account-and-billing/pricing)。
- 要从 Slack、Linear 或 Jira 派任务，我会按上文的入口试用两家的云端 agent。[Cursor 的 Jira 集成需要 Teams/Enterprise](https://cursor.com/docs/integrations/jira)。
- 要从 GitHub Issue 评论派任务，[Cursor 能读取 `@cursor`](https://cursor.com/docs/cloud-agent)；[Devin 需要配置 Automation](https://docs.devin.ai/product-guides/automations)。
- 低档套餐要自动修 CI，我会查 [Devin 允许接收 CI bot 评论的设置](https://docs.devin.ai/product-guides/bot-comment-settings)。[Cursor 的自动 CI 修复需要 Teams/Enterprise](https://cursor.com/docs/cloud-agent/capabilities)。
- 要在自己的机器上执行，我会查 [Outposts](https://docs.devin.ai/cloud/outposts/overview) 和 [Self-Hosted Machines](https://cursor.com/docs/cloud-agent/self-hosted)。两者的 agent 循环都留在供应商云端。

替团队付费前，我会从同一个基线复制出独立仓库，让它们用一周时间处理同样的十张积压任务票，再对每个仓库运行脚本。我会先检查 PR 作者；如果不是这两个 bot，就手动记下 PR 列表，再读改动、记录实际账单。

## Orbi 能接哪部分工作

Orbi 是我做的产品，它不评审也不合并 Devin、Cursor 开出的 PR。它从你打了 `ai-ready` 标签的 GitHub Issue 开始：先实现，再由独立会话评审改动，修复发现的问题，评审通过且 CI 全绿后合并。分支保护要求人工批准时，它会停下来等你。发版由人发起。

Orbi 没有编辑器，唯一的任务入口是 GitHub Issue，没有 Slack、Linear 或 Jira 入口。[Orbi 对比 Devin](/zh/compare/devin/) 和 [Orbi 对比 Cursor](/zh/compare/cursor/) 写了各自的交接方式。要把 Issue 推进到合并，我会考虑 Orbi；它替代不了这两款编辑器。

## 相关

- [Cursor 替代品怎么选：编辑器、后台 agent 与合并发版](/zh/blog/cursor-alternatives/)
- [最好的 AI 编程 agent 怎么选：在自己的仓库上试一周](/zh/blog/best-ai-agent-for-coding/)
- [Orbi 对比 Devin](/zh/compare/devin/)
- [Orbi 对比 Cursor](/zh/compare/cursor/)
- [Orbi Cloud](/zh/cloud/?ref=blog-devin-cursor)
