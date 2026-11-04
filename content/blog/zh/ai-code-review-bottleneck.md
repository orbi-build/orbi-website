---
title: AI 代码评审是瓶颈吗？我们的 PR 卡在合并之后
date: 2026-11-04
summary: 847 个 agent PR 从创建到合入预发布分支，中位数 21 分钟；同一时期被晋升的 PR，合入后还要再等中位数 5.9 小时才进生产分支，最长 168 小时。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-merge-wait-card.png
mirror: ai-code-review-bottleneck
---

AI 代码评审在我的流水线上没有成为主要瓶颈：847 个 PR 从创建到合并，中位数约 21 分钟，包含 CI 和每轮 agent 评审。把窗口内晋升带进生产分支 main 的 PR 一个个算，合入 beta 之后的等待时间中位数是 5.9 小时，十个里有一个超过 62 小时，最长 168 小时。做完的改动在等发版、等晋升。本文说的「合并」都指合入 beta，「晋升」指合入 main。PR 计时从 PR 创建算起，agent 从接下 Issue 到创建 PR 的时间不在本文任何一个数字里。

我是 Larry 🍀 Orbi，Orbi 的创始人。托管产品 Orbi Cloud 也是用 Orbi 开发的：agent 接下 GitHub Issue，向预发布分支 beta 提 PR，另一个独立的 agent 会话负责评审。评审和 CI 都过了，就合并。

工作按里程碑分批，里程碑以版本号命名；一个里程碑的票做完，发版票就在 beta 上打出这个版本的发版标签（tag）。之后做晋升（promotion，把带发版标签的版本合进生产分支 main），生产部署再等人点一次批准。orbi-cloud 仓库是私有的，所以这里只给汇总数字，不放仓库链接。

## AI 代码评审花了多久，合并后又等了多久

统计窗口是 2026 年 9 月 14 日 0 点到 10 月 22 日 0 点（+08）。847 个 PR 都由 Orbi 执行器在 Orbi Cloud 仓库发起。

我把窗口内合并的 PR 和完成的晋升分开统计。沿 main 的第一父提交链找合并提交，第二父提交在 beta 的历史上，就算一次晋升。判定看提交的祖先关系，不看标题。窗口里共有 110 次，其中两次只发了版本，没有带入 PR，所以下表用其余 108 次。

B 只看 beta 第一父提交链上的 PR 合并提交，用它们记录 PR 合入 beta 的时刻；发版提交和杂务提交不算。每次晋升只取其中等得最久的 PR，所以 B 的分母是晋升次数。「每个 PR 合并后」那一行把窗口内晋升带入的每个 PR 都算上，共 912 个，包括执行器之外的 PR，也包括少数 9 月 14 日之前就合入 beta 的。大批次里的 PR 多，权重也大，所以它的中位数比 B 高。后文的脚本复现的是 B，不是这一行。

| 计时项 | 从哪算到哪 | 样本 | 中位数 | 90 分位 |
|---|---|---|---|---|
| PR 从创建到合并 | 执行器创建 PR → 合入 beta，包含 CI 和全部评审、修复轮次 | 847 个 PR | 20.6 分钟 | 79.1 分钟 |
| 每个 PR 合并后 | PR 合入 beta → 带它的那次晋升合入 main | 912 个 PR | 5.89 小时 | 62.65 小时 |
| A：最新发版标签 | 这次晋升带入的最新发版标签所指提交 → 合入 main | 108 次晋升 | 0.77 小时 | 4.95 小时 |
| C：最早发版标签 | 这次晋升带入的最早发版标签所指提交 → 合入 main | 108 次晋升 | 1.04 小时 | 8.43 小时 |
| B：最早的 PR | 已合入 beta、尚未进入 main 的最早 PR → 合入 main | 108 次晋升 | 2.88 小时 | 12.85 小时 |

这些 PR 的改动行数中位数为 116 行，新增和删除都算；87% 不超过 500 行。执行器有两种身份：415 个 PR 以 Orbi 的 GitHub App 发起，432 个经我的 GitHub 账号发起。后者全都有执行器的运行标记，其中 389 个还写着「Built by Orbi」。

A 和 C 从发版标签所指提交的提交者时间算起，近似衡量发版之后的等待；把那两次只发版本的晋升加回去，两者的中位数都不变。某次晋升没带入新发版标签时，两者取从被晋升提交往回能找到的最新发版标签。B 还包含发版之前的等待。

B 的 90 分位为 12.85 小时（脚本保留一位小数，显示 12.8），最长达到 168.48 小时，超过 24 小时的有五次。每次晋升带入的 PR 数，中位数为 4 个，90 分位为 15 个，最多 162 个。这 108 次晋升一共带入 159 个发版标签（v0.6.0 到 v0.8.11），其中 27 次带入两个或更多，6 次没有带入新的发版标签。最长的 168.48 小时，约一周。

晋升计时到合入 main 为止，之后才是生产审批和部署。

## 合并之后，晋升之前，在等什么

打完标签后，beta 部署这个版本，在 beta 上跑一遍新用户端到端检查，我确认后再晋升合入 main。生产部署在合入 main 之后才启动：它先检查 beta 已经跑这个版本满一小时（观察期从 beta 首次部署算起，热修经我同意可以跳过），再开审批票。A 的中位数是 0.77 小时，也就是说多数晋升在观察期满一小时之前就已合入 main，观察期剩下的部分落在合入之后，不在本文任何一个计时里。

批准到部署这段流程，我用审批票从创建到关闭的时间来量。审批票从 9 月 24 日才开始启用，没有覆盖窗口的前十天。窗口内有 69 张审批票，其中三张因为被新请求替代而关闭；其余 66 张的中位数为 1.5 分钟，包含点击批准和部署脚本运行。检查在 beta 上就已经做完，之后才开审批票，所以这 1.5 分钟不包括我的验证和确认。

单独计过时的只有点批准这一步；新用户检查和我的确认发生在晋升之前，包在晋升计时里，没有单独的数字。计时能说明的是：做完的 PR 会在这些步骤后面攒成一批，一件事挡住晋升，同批改动就得陪着等。

## 10 月 12 日：播放器先合入，短片晚到了六小时

10 月 12 日 16:39（+08），新用户引导帮助弹窗里的视频播放器合入 beta。它要播放的六段操作短片是另一项工作，要另外放进网站仓库。

下一张发版票 v0.7.31 把晋升条件写清楚了：六段短片必须全部在 orbi.build 上线，「缺了就先发网站，再晋升 Cloud」。

| 时间（+08） | 发生了什么 |
|---|---|
| 17:23 | 打出 v0.7.31 发版标签 |
| 18:22 | 打出 v0.7.32 发版标签 |
| 20:32 | 打出 v0.7.33 发版标签 |
| 22:17 | 打出 v0.7.34 发版标签 |
| 22:25 | 短片合入网站仓库 |
| 23:02 | 四个版本一起晋升到 main |

每个发版标签都包含那个播放器，所以四个版本都受同一个条件约束。到晋升时，第一个发版标签已等了 5.66 小时（C 口径），播放器那个 PR 本身在 beta 上等了 6.4 小时。短片具体几点在 orbi.build 上可访问，我没有记录；晋升发生在短片合入网站仓库 37 分钟之后。同批其他改动也跟着等，包括一项结账修复。[设置视频](/zh/blog/watch-the-six-steps/)展示了这些短片要解释的操作流程。

## 10 月 21 日：162 个 PR 一起合入 main

10 月 21 日，一次晋升把 162 个 PR、12 个发版标签一起带进 main：v0.7.41、v0.8.0 到 v0.8.3，以及 v0.8.5 到 v0.8.11。v0.8.4 没有打过发版标签。这批里最早的 PR 已经等了 168 小时。

期间生产也有更新：10 月 14 日晋升了 v0.7.40，10 月 17 日上过一次热修复。beta 则在持续发 v0.8 系列，光 v0.8.5 这一个里程碑就有 102 张票。那一周具体是哪件事挡住了晋升，我还没有查到单一原因。

## 积压告警没说卡在哪

定时检查发现 beta 上 main 还没有的最早提交已超过 24 小时，就会开一张 Issue，差距消除后自动关闭。窗口里开过三张这类积压告警，另有一张数据库迁移不一致告警，不算在这里。三张告警从创建到关闭，中位数为 16.2 小时。最长的一张从 10 月 16 日 00:58 持续到 10 月 22 日 00:14（+08），共 143 小时。检查按定时任务每六小时跑一次（GitHub 的定时任务经常晚启动），所以这张告警在 10 月 21 日晋升后的第一次检查才关闭。

告警要等最早提交已满 24 小时才开，差距消除后的下一次检查才关，所以告警时长只是差距持续时间的下限。单凭它，不能判断告警开着时有没有人在处理。

时间阈值只会说「落后了」，没有说卡在哪里。我想要的检查按事件来：最早尚未晋升的发版标签超过 2 小时时，要写明它在等什么，是哪个部署、观察期几点结束、等谁确认；写不出来，就是卡住了。这条 2 小时线我还没有拿本文的数据回测过。

## 放到更大的样本里看

[DORA 2024 报告第 40 页](https://dora.dev/research/2024/dora-report/2024-dora-accelerate-state-of-devops-report.pdf)的原话是：AI 采用程度每增加 25%，交付稳定性估计下降 7.2%，交付吞吐量估计下降 1.5%（报告里写的是“an estimated 7.2% reduction”这类相对估计）。DORA 提出的假设是代码变更集在变大。这是相关性结果。

DORA 的吞吐量看的是改动多久、多频繁地进生产，PR 数看的是产出量，两者可以一个跌一个涨。[Faros AI 的 2025 年研究](https://www.faros.ai/blog/ai-software-engineering)覆盖了 1,255 个团队、超过 10,000 名开发者。AI 采用程度高的开发者，合并的 PR 多了 98%，PR 评审耗时增加 91%，PR 平均大小增加 154%。这些是开发者和团队层面的数；放到公司层面，研究没有发现 AI 采用程度与改善有显著相关性。

我的流水线里，一张票是一项小改动，另有独立 agent 评审。最早 PR 在合并后还要等上数小时，批量积压出现在下游。这一条流水线说明不了那些研究样本的情况。

## 用小批量的标准看里程碑

DORA 的[小批量工作能力页](https://dora.dev/capabilities/working-in-small-batches/)说，一批代码如果要花超过一周才能完成并检查，批次就太大了。它也提醒，AI 工具容易让开发者写出很大的 PR；小批次在发版前重新攒成大批次，会延后反馈。

我这里的 PR 本来就小，变大的是一起进生产的那一批。

只看窗口后半段，从 v0.7.14 到 v0.8.11 共有 39 个已发版的里程碑，每个包含的票数中位数为 3 张，其中 31 个不超过 7 张。两个偏大的批次是 v0.7.29 的 78 张和 v0.8.5 的 102 张。带入 v0.7.29 的那次晋升，最早的 PR 等了 43.3 小时。

接下来我准备试两条规则，目前都还没有生效：

1. 一个里程碑里的改动，必须能作为一批独立进生产。
2. 需要尚未上线的素材、配置或另一个仓库改动的那部分代码，先别合。先上线依赖，最后接上界面入口。

第二条和 10 月 12 日的做法不同：那次是播放器先合入，检查放在晋升时，后面每个版本都排在它后面；按第二条，短片会在播放器合入之前上线，就不会有版本排队。它沿用 Martin Fowler 的 [Keystone Interface](https://martinfowler.com/bliki/KeystoneInterface.html) 做法：先把后端代码写好、集成好，暂时不做用户界面。

接下来四周，我会用下面脚本里的中位数和 90 分位来检查这两条规则。10 月 23 日起，Orbi 的晋升改成新建一个提交而不是合并，所以到时需要调整查询。

## 在自己的仓库量一遍合并后的等待

脚本的前提：晋升在生产分支的第一父提交链上表现为合并提交，晋升来源分支也用合并提交接收 PR。PR 用压缩合并、或者晋升是新建提交的仓库，脚本什么也找不到，会以退出码 1 结束。Orbi 自己在 10 月 23 日改成了新建提交的晋升方式，所以本文窗口截止于 10 月 22 日 0 点。

把下面的脚本保存为 `~/merge-wait.sh`，存在仓库外面，免得被误提交：

```bash
#!/usr/bin/env bash
# How long had the oldest merged PR in each promotion been waiting?
# Usage: merge-wait.sh <production-branch> <promoted-branch> <since YYYY-MM-DD> [until YYYY-MM-DD]
#   e.g. TZ=Asia/Shanghai ~/merge-wait.sh origin/main origin/beta 2026-09-14 2026-10-22
# Window: from since 00:00 up to and including until 00:00, local time; default until is now.
# A promotion is a merge on the production branch's first-parent line whose second
# parent is on the promoted branch (hotfix merges from elsewhere are skipped).
# For each one that brought in at least one merge from the promoted branch's
# first-parent line (one per PR, if that branch takes PRs as merge commits),
# prints its date, how many it brought and how long the oldest had been waiting,
# then median, p90 and max.
set -euo pipefail
export LC_ALL=C   # keep "." as the decimal point for awk and sort
usage='usage: merge-wait.sh <production-branch> <promoted-branch> <since YYYY-MM-DD> [until YYYY-MM-DD]'
branch=${1:?$usage}
promoted=${2:?$usage}
since=${3:?$usage}
until=${4:-}
for ref in "$branch" "$promoted"; do
  git rev-parse --verify -q "$ref^{commit}" >/dev/null || { echo "unknown ref: $ref" >&2; exit 2; }
done
range=(--since="${since}T00:00:00")
[ -z "$until" ] || range+=(--until="${until}T00:00:00")

rows=$(git log "$branch" --first-parent --merges "${range[@]}" --format='%H %ct' |
  while read -r h ct; do
    git merge-base --is-ancestor "$h^2" "$promoted" || continue
    times=$(git log --first-parent --merges --format=%ct "$h^1..$h^2")
    [ -n "$times" ] || continue
    oldest=$(printf '%s\n' "$times" | sort -n | awk 'NR==1')
    printf '%s\t%s\t%s\n' "$(git log -1 --format=%cs "$h")" "$(printf '%s\n' "$times" | wc -l | tr -d ' ')" \
      "$(awk -v a="$ct" -v b="$oldest" 'BEGIN{printf "%.1f", (a-b)/3600}')"
  done)
[ -n "$rows" ] || { echo "no merge-commit promotions carrying PR merges in that window" \
  "(squash-merged PRs and promotions made as new commits are not supported)" >&2; exit 1; }
printf 'date\tmerged_prs\toldest_wait_h\n%s\n' "$rows"
printf '%s\n' "$rows" | cut -f3 | sort -n |
  awk '{v[NR]=$1} END{m=(NR%2)?v[(NR+1)/2]:(v[NR/2]+v[NR/2+1])/2;
       printf "promotions=%d median_h=%.1f p90_h=%.1f max_h=%.1f\n", NR, m, v[int(0.9*(NR-1)+0.5)+1], v[NR]}'
```

加执行权限、拉取远端，再从仓库根目录运行，依次传入生产分支、晋升来源分支、开始日期，以及可选的结束日期：

```bash
chmod +x ~/merge-wait.sh
git fetch
TZ=Asia/Shanghai ~/merge-wait.sh origin/main origin/beta 2026-09-14 2026-10-22
```

两个日期都取 shell 所用时区的午夜。Git 的 `--until` 会包含恰好在那个午夜合并的提交，所以 `2026-10-22` 覆盖 10 月 21 日，以及时间恰好为 22 日 00:00:00 的合并，我的窗口里没有后一种。`TZ=Asia/Shanghai` 把午夜设为 +08，和本文窗口一致。不传结束日期，就一直算到现在。

每次晋升只要带入了至少一个 PR，脚本就输出一行：日期、带入多少个 PR、最早那个 PR 等了多少小时，最后再输出汇总。合入 main 的提交，如果第二父提交不在晋升来源分支上，例如从别处合入的热修复，就会跳过。成功时退出码为 0；缺少参数或找不到符合条件的晋升时为 1；分支未知时为 2。要在完整克隆上跑：浅克隆会丢掉深度以外的晋升，汇总行静默偏小，不报错（orbi-cloud 用 `--depth 300` 克隆时只算到 81 次，完整是 108 次）。需要 git、awk 和常见的 coreutils（sort、head、cut、wc、tr）。90 分位取排序后第 round(0.9 × (n − 1)) + 1 个值，和上表同一规则；用插值法的工具算出来会略有出入。

在 orbi-cloud 上，对本文窗口，汇总行与上表对应（脚本保留一位小数，12.85 显示为 12.8）：

```text
promotions=108 median_h=2.9 p90_h=12.8 max_h=168.5
```

压缩合并的 PR、只靠发版标签的流程、把晋升重新创建为新提交的流程，都需要换一种查询。如果你们会把 main 回合到来源分支，这些合并也在来源分支的第一父提交链上，会被当成 PR 计数，要先过滤掉。

仓库采用上述合并方式时，要看此刻还有什么在等，可以跑：

```bash
git rev-list --count origin/main..origin/beta
git log --first-parent --merges --format='%ct %cI %s' origin/main..origin/beta | sort -n | head -1
```

第一行统计 beta 有、main 还没有的提交数。第二行输出仍在等待的最早 PR 合并提交（从 main 回合到 beta 的合并也会出现在这里）。第二行没有输出，说明没有 PR 在等，但可能还有发版提交或杂务提交；第一行输出 0，才说明没有任何提交在等。排序要用第一列的纪元秒数。直接把 ISO 日期当字符串排序，遇到提交的时区偏移不同时，顺序会错。我测量时在一条临时查询里犯过这个错；脚本和上表用的都是纪元秒。

## 统计的限制

这只是一个由 agent 开发的产品、一个维护者、约五周的记录。我用 PR 在 beta 上的合并提交时间表示「合入 beta」，发版标签的计时用它所指提交的提交者时间。合入 main 的时刻早于实际部署。审批票和分支差距告警的数字，都取决于这个团队的流程。

## 相关

[Claude Code 跑完之后，谁来合并 PR](/zh/blog/claude-code-github-actions-who-merges/)、[新用户连上仓库后的长轮询改动](/zh/blog/long-polling-new-user-wait/)，以及[寻找 Orbi 的 harness](/zh/blog/searching-for-orbis-harness/)，讲的是同一条流水线的其他环节。[Orbi Cloud](/zh/cloud/?ref=blog-merge-wait) 可以在你的 GitHub 仓库运行这套流程：Issue → agent 提 PR → 独立 agent 评审 → CI 通过后合并。[对比页](/zh/compare/)把它和其他编程 agent 放在一起看。
