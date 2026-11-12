---
title: 最好的 AI 编程 agent 怎么选：在自己的仓库上试一周
date: 2026-11-12
summary: 按交接方式把六种 AI 编程 agent 分成三组，给出在自己仓库上试用一周的做法，附一个用 GitHub Issue 和 PR 记录统计结果的 gh 脚本。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-best-ai-agent-for-coding-card.png
mirror: best-ai-agent-for-coding
---

没有唯一最好的 AI 编程 agent，得看你交出去什么：终端或编辑器里的一条提示、云端执行后返回 PR 的任务，还是一张要走完评审和合并的 Issue。这篇写给独立开发者和维护者，帮你为自己的 GitHub 仓库选第一个 agent。文中把六种工具按交接方式分组，给出在自己仓库上试用一周的方法，并附上用 GitHub 记录统计结果的 [GitHub CLI](https://cli.github.com/)（`gh`）脚本。六种工具是 Claude Code、Cursor、Codex、GitHub Copilot、OpenCode，以及我做的 Orbi，它负责把 Issue 推进到合并。这里的 coding agent 指能自己读代码、改代码、跑命令的 AI 工具。

我是 Larry 🍀 Orbi，Orbi 的创始人。

另外五种工具我没有安装或运行，相关介绍都来自我在 2026 年 11 月 12 日读到的官方文档。我没做基准测试，也不按速度或质量给 agent 排名、打分。Orbi 只支持 GitHub，没有编辑器或行内补全功能。

## 最好的 AI 编程 agent：先按交接方式分三组

我先问自己：要交出去什么，工具做到哪一步会停？有些 agent 不止支持下面一种工作方式。

| 分组 | 你交出去什么 | 做到哪一步停下 | 本文涉及的 agent |
|---|---|---|---|
| 终端或编辑器会话 | 一条提示 | 给出会话结果，后续交接由你处理 | Claude Code, Cursor, Codex, GitHub Copilot, OpenCode |
| 在本机之外执行 | 一个任务或分派的 Issue | 返回 diff、分支或 PR，等你接着处理 | Claude Code, Cursor, Codex, GitHub Copilot；OpenCode 通过 Actions |
| 从 Issue 到合并 | 一张 Issue | CI 通过后合并评审过的改动，或等待必需的人工批准 | Orbi |

想在编辑器里写代码，同时把任务交给云端执行，我会把 Cursor 放进试用名单；想把 Issue 推进到合并，我会试 Orbi。各套餐的价格对比见 [Cursor 替代品](/zh/blog/cursor-alternatives/)。

## 六种 agent

下面的价格和套餐权限均以 2026 年 11 月 12 日为准。

### Claude Code

[Claude Code](https://code.claude.com/docs/en/overview.md) 可以在终端、IDE、桌面应用或浏览器中运行。用 `claude --cloud` 可以开启[云端会话](https://code.claude.com/docs/en/claude-code-on-the-web.md)，也可以通过 [GitHub Action](https://code.claude.com/docs/en/github-actions.md) 在 GitHub 上使用 `@claude`。[Auto-fix](https://code.claude.com/docs/en/claude-code-on-the-web.md) 会排查失败的检查和评审评论，找到明确的修复办法后就推送改动。

托管的 [Code Review](https://code.claude.com/docs/en/code-review.md) 只供 Team/Enterprise 使用，文档写明它「never approves or blocks」PR，即不会批准或阻止 PR。[模型配置](https://code.claude.com/docs/en/model-config.md)只列了 Claude 模型。[Pro](https://claude.com/pricing) 每月 $20，按年付费折合每月 $17；Free 不包含 Claude Code。

需要在本机或云端使用 Claude 会话时，我会试 Claude Code；Issue 工作流的差别见 [Orbi 对比 Claude Code](/zh/compare/claude-code/)。

### Cursor

在 [Cursor 的套餐](https://cursor.com/pricing)中，要同时用编辑器、Cloud Agents 和 Bugbot，得选每月 $30 的 Premium 或更高档。每月 $8 的 Plus 只能用 Grok 模型，第三方模型用量另收费。[Cloud Agents](https://cursor.com/docs/cloud-agent.md) 在单独的分支上工作，并创建 PR。[Bugbot Autofix](https://cursor.com/docs/bugbot.md) 会启动 Cloud Agent 修复评审发现的问题，消耗 Cloud Agent 额度。

[批准合并的工作流](https://cursor.com/docs/release-notes/cloud-agents.md)适用于 Origin 仓库。Origin 是 Cursor 自家的代码托管，目前还在早期 beta。文档没有说明在 GitHub 上跳过人工批准自动合并的流程。

要把编辑器和云端任务放在一起用，我会试 Cursor；交接方式的对比见 [Orbi 对比 Cursor](/zh/compare/cursor/)。

### Codex

[Codex CLI](https://learn.chatgpt.com/docs/codex/cli.md) 在本机运行；[Codex Cloud](https://learn.chatgpt.com/docs/cloud.md) 返回工作结果，检查、提交或开 PR 都由你来做。在 GitHub 上，[`@codex review` 或自动评审](https://learn.chatgpt.com/docs/third-party/github.md)只报告 P0 和 P1 级别的高优先级问题。

[在聊天里评审 PR](https://learn.chatgpt.com/docs/code-review.md) 的文档写的是「doesn't post comments, approve it, or merge it」，即不会发评论、批准或合并 PR。GitHub 评审也不会改变分支保护和必需的批准要求。文档已迁到 `learn.chatgpt.com`；[Plus 每月 $20](https://learn.chatgpt.com/docs/pricing.md)，用 API key 接入则没有云端功能。

需要本机会话和云端任务，又想自己检查结果后再提交或开 PR，我会试 Codex；见 [Orbi 对比 Codex](/zh/compare/codex/)。

### GitHub Copilot

Copilot 也能在 IDE 和 CLI 中运行，这里只讲它的云端 agent，GitHub 现在叫它 Copilot in the cloud。[分派 Issue](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task) 的文档写着「always creates a pull request」；[云端 agent](https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/risks-and-mitigations) 的限制是「cannot approve or merge a pull request」。[Agent Merge](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/get-pull-requests-ready-to-merge) 会监测并修复 CI 失败和冲突，但文档写明「does not enable auto-merge」。

代码评审另有一个 [Copilot approvals](https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/code-review) 设置，默认关闭。开启后，评审的批准可以计入必需的批准数。[Pro 每月 $10，Pro+ 每月 $39，Max 每月 $100](https://github.com/features/copilot/plans)，用量以 GitHub AI Credits 计费；Free 不包含云端 agent 和代码评审。

想把 GitHub Issue 分派出去，拿到 PR 后再由人评审和合并，我会试 Copilot；见 [Orbi 对比 GitHub Copilot coding agent](/zh/compare/github-copilot-coding-agent/)。

### OpenCode

[OpenCode](https://opencode.ai/docs/) 是终端里的 coding agent，[源码采用 MIT 许可](https://github.com/anomalyco/opencode)，支持[多家模型供应商和自带 key](https://opencode.ai/docs/providers/)。它的 [GitHub 集成](https://opencode.ai/v1/docs/github/)在你自己的 Actions runner 上运行：发一条 `/opencode` 或 `/oc` 评论，就能让它实现 Issue 并开 PR。文档没有说明合并流程。

软件本身免费，模型费用要另算，可以用供应商的服务，也可以订阅[每月 $10 的 OpenCode Go](https://opencode.ai/docs/console/go/)。

需要自己选模型供应商，并在自己的 Actions runner 上运行 GitHub 工作流时，我会考虑 OpenCode。

### Orbi

给 GitHub Issue 打上 `ai-ready` 标签，Orbi 就会运行开源 coding agent [Pi](/zh/guides/pi-coding-agent/) 来实现改动。评审交给另一个 Pi 会话，它没有参与这次代码编写。仓库 CI 通过后，Orbi runner 会合并评审过的那次提交。如果分支保护要求人工批准，Orbi 会停在 `ai-awaiting-merge`，并在 Issue 评论里写明要做什么。

发版需要人来发起：创建发版 Issue，同时打上 `ai-ready` 和 `ai-release`，Orbi 才会在发版检查通过后打 tag 并发布。

[Orbi](https://github.com/orbi-build/orbi) 采用 AGPL-3.0 许可，自部署软件免费，模型 key 自备。[Orbi Cloud](/zh/cloud/?ref=blog-best-agent) 是付费托管版，套餐以那一页为准。

想把 Issue 交出去，一直推进到评审和合并，可以选它。

## 在自己的仓库上试用两个 agent，一周后比较

1. 先准备 6–10 张真实小 Issue 的内容，写清各自的完成条件。等交给 agent 时再创建 Issue，脚本从创建时开始计时。

2. 给每张交出去的 Issue 打上 `trial-<agent>` 标签。试两个 agent，就在试用仓库里创建两个标签：

   ```bash
   gh label create trial-a -R OWNER/REPO --description 'issue handed to agent a'
   gh label create trial-b -R OWNER/REPO --description 'issue handed to agent b'
   ```

3. 默认用一个仓库，两个 agent 轮流接 Issue，最后比较两组结果。一张 Issue 对应的 PR 合并后，下一个 agent 面对的代码就变了。如果要让它们从同一份代码解决相同的 Issue，就从同一个提交各建一个私有副本。在源仓库目录里运行下面的命令，把 `OWNER` 设成你的账号；第二个 agent 再跑一遍，使用 `NAME=trial-copy-b` 和 `trial-b` 标签。示例 Issue 的标题和正文要换成你仓库里的真实问题：

   ```bash
   OWNER=YOUR_GITHUB_LOGIN
   BASE=$(git rev-parse HEAD)
   NAME=trial-copy-a
   gh repo create "$OWNER/$NAME" --private
   git push "https://github.com/$OWNER/$NAME.git" "${BASE}:refs/heads/main"
   gh label create trial-a -R "$OWNER/$NAME" --description 'issue handed to agent a'
   gh issue create -R "$OWNER/$NAME" --label trial-a \
     --title 'add() subtracts' --body 'add(2, 3) returns -1. Expected 5.'
   ```

   `${BASE}:` 要带花括号。zsh 会把 `"$BASE:refs/heads/main"` 当成带修饰符的表达式。我第一次推送就因此失败了，报错如下：

   ```text
   error: src refspec 6465d879e845fbb914f0b1db9d5a04706e359b88efs/heads/main does not match any
   ```

   副本不会自带 CI 密钥或分支保护，要在交给 agent 前自己配好。

4. 整周使用同一份指令文件。运行卡住时，别悄悄手动修补。修了什么，有 PR 后就在评论里写清，让脚本计入这次介入。每个 PR 都要写上对应 Issue 的 `Closes #N`。找不到关闭关联时，脚本会改为查找只提到了该 Issue 的 PR，这些行要手动核查。

5. 一周结束时，在同一个截止时点分别运行脚本，统计两个 agent 当时的结果，未完成的 Issue 也算进去。从账单或用量记录里记下费用：

   | Agent | 一周的订阅、额度或 API 费用 | 交出去的 Issue 数 | 已合并的 Issue 数 |
   |---|---|---|---|
   | A | | | |
   | B | | | |

## 用 GitHub 记录统计试用结果

把下面的脚本存成 `agent-trial-score.sh`，再运行 `chmod +x agent-trial-score.sh`。它需要 bash、GitHub CLI（`gh`，先用 `gh auth login` 登录）、`jq`、`awk` 和 `sort`。我在 Linux 上用 gh 2.100.0、jq 1.8.2、bash 5.3 和 GNU Awk 5.4.1 测过。脚本只用了 POSIX awk 功能，但我没有在 macOS 上跑过。

```bash
#!/usr/bin/env bash
# Score a coding-agent trial from GitHub's own records, one row per issue.
# Usage: ./agent-trial-score.sh OWNER/REPO 'ISSUE SEARCH' [CI_CHECK]
#   ISSUE SEARCH  selects every issue you handed to the agent, e.g.
#                 'label:trial-a' (GitHub issue search syntax)
#   CI_CHECK      exact name of the check run that is your test job, e.g. tests.
#                 Without it the first_ci column stays "unset".
set -euo pipefail

repo="${1:?usage: $0 OWNER/REPO 'ISSUE SEARCH' [CI_CHECK]}"
query="${2:?usage: $0 OWNER/REPO 'ISSUE SEARCH' [CI_CHECK]}"
check="${3:-}"

# Any failed read stops the script: a number built on a failed call is worse than none.
die() { echo "$1: stopping without a score" >&2; exit 2; }

issues=$(gh issue list -R "$repo" --state all --search "$query" --limit 100 \
  --json number,createdAt) || die "could not list issues for $repo"

if [ "$(jq length <<<"$issues")" -eq 0 ]; then
  echo "no issues match '$query' in $repo: nothing to score" >&2
  exit 1
fi

# Comments or reviews left by human accounts (GitHub user type "User").
humans() {
  local ids
  ids=$(gh api --paginate "$1?per_page=100" -q '.[] | select(.user.type == "User") | .id') || return 1
  grep -c . <<<"$ids" || true
}

rows=$(mktemp)
trap 'rm -f "$rows"' EXIT

while read -r issue; do
  i=$(jq -r .number <<<"$issue")
  notes=$(humans "repos/$repo/issues/$i/comments") || die "could not read comments on issue $i"

  # The last PR in this repository that was set to close the issue, merged or not.
  n=$(gh api graphql -F owner="${repo%/*}" -F name="${repo#*/}" -F number="$i" -f query='
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) { issue(number: $number) {
        closedByPullRequestsReferences(first: 20, includeClosedPrs: true) {
          nodes { number repository { nameWithOwner } } } } } }' \
    -q "[.data.repository.issue.closedByPullRequestsReferences.nodes[]
        | select(.repository.nameWithOwner == \"$repo\") | .number] | last // empty") \
    || die "could not read linked PRs of issue $i"
  link=closes
  if [ -z "$n" ]; then
    # No closing link: fall back to the last PR in this repository that mentions the issue.
    mentions=$(gh api --paginate "repos/$repo/issues/$i/timeline?per_page=100" -q ".[]
        | select(.event == \"cross-referenced\" and .source.issue.pull_request != null
                 and .source.issue.repository.full_name == \"$repo\") | .source.issue.number") \
      || die "could not read the timeline of issue $i"
    n=$(tail -n 1 <<<"$mentions")
    link=mention
  fi
  if [ -z "$n" ]; then
    printf '%s\t-\t-\tNO_PR\t-\t-\t-\t%s\t-\n' "$i" "$notes" >>"$rows"
    continue
  fi

  pr=$(gh pr view "$n" -R "$repo" --json state,mergedAt,mergedBy) || die "could not read PR $n"
  result=$(jq -r .state <<<"$pr")
  hours=-
  if [ "$result" = MERGED ]; then
    hours=$(jq -rn --arg a "$(jq -r .createdAt <<<"$issue")" --arg b "$(jq -r .mergedAt <<<"$pr")" \
      '(($b|fromdate) - ($a|fromdate)) / 3600 | . * 10 | round / 10')
  fi

  shas=$(gh api --paginate "repos/$repo/pulls/$n/commits?per_page=100" -q '.[].sha') \
    || die "could not read commits of PR $n"
  commits=$(grep -c . <<<"$shas" || true)
  first_sha=$(head -n 1 <<<"$shas")

  # Your test job on the first commit still on the branch: pass, fail, pending or none.
  # A skipped or missing run is "none", never "pass".
  first_ci=unset
  if [ -n "$check" ] && [ -n "$first_sha" ]; then
    first_ci=$(gh api --paginate "repos/$repo/commits/$first_sha/check-runs?per_page=100" \
      -q ".check_runs[] | select(.name == \"$check\") | .conclusion // \"pending\"" \
      | sort -u | tr '\n' ' ') || die "could not read check runs of PR $n"
    case " $first_ci" in
      *" pending "*) first_ci=pending ;;
      *" failure "*|*" timed_out "*|*" cancelled "*|*" action_required "*|*" startup_failure "*) first_ci=fail ;;
      *" success "*) first_ci=pass ;;
      *) first_ci=none ;;
    esac
  fi

  pr_notes=$(humans "repos/$repo/issues/$n/comments") || die "could not read comments on PR $n"
  reviews=$(humans "repos/$repo/pulls/$n/reviews") || die "could not read reviews on PR $n"
  merged_by=$(jq -r '.mergedBy.login // "-"' <<<"$pr")
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$i" "$n" "$link" "$result" "$hours" "$first_ci" "$commits" "$((notes + pr_notes + reviews))" "$merged_by" >>"$rows"
done < <(jq -c '.[]' <<<"$issues")

printf 'issue\tpr\tlink\tresult\thours\tfirst_ci\tcommits\thuman_notes\tmerged_by\n'
cat "$rows"

awk -F'\t' -v check="$check" '
  $4 == "MERGED" { m++; if ($6 == "pass") p++; if ($6 == "fail") f++; if ($8 == 0) q++ }
  $4 == "NO_PR"  { none++ }
  $4 == "CLOSED" { c++ }
  $4 == "OPEN"   { o++ }
  END {
    printf "\nissues handed over: %d  merged: %d  no PR: %d  PR closed unmerged: %d  PR still open: %d\n", NR, m, none, c, o
    if (m == 0) { print "no merged PRs: no merge-time numbers"; exit }
    if (check != "") printf "\"%s\" on the first commit of merged PRs: %d pass, %d fail, %d other\n", check, p, f, m - p - f
    printf "merged with no human comment or review: %d of %d\n", q, m
  }' "$rows"
# Median without gawk-only functions: sort first, then pick the middle.
awk -F'\t' '$4 == "MERGED" { print $5 }' "$rows" | sort -n | awk '
  { h[NR] = $1 }
  END {
    if (NR == 0) exit
    med = (NR % 2) ? h[(NR + 1) / 2] : (h[NR / 2] + h[NR / 2 + 1]) / 2
    printf "median hours from issue to merge: %.1f (of %d merged)\n", med, NR
  }'
```

每个 agent 跑一次，传入它那组 Issue 的标签和测试作业名：

```bash
./agent-trial-score.sh OWNER/REPO 'label:trial-a' tests
```

第三个参数要填测试作业对应的检查（check run）名称，必须与 GitHub 的记录完全一致。用下面的命令查某个提交的检查名称：

```bash
gh api repos/OWNER/REPO/commits/COMMIT_SHA/check-runs -q '.check_runs[] | "\(.name)\t\(.conclusion)"'
```

我在一个 Orbi PR 上查到了三项检查：`Mintlify Deployment`（跳过）、`link` 和 `tests`。只有 `tests` 跑测试套件，所以我传这个名字。不传名称，这一列就保持 `unset`，以免把跳过的文档部署或 agent 自己的状态检查算成测试通过。

各列的含义：

- `issue` 和 `pr` 是 GitHub 编号。`link=closes` 表示 PR 设置了关闭该 Issue 的关联；`mention` 表示没找到关闭关联，改用了仓库里最后一个提到该 Issue 的 PR，这些行要手动核查。
- `result` 是 `NO_PR`、`CLOSED`（PR 关闭但未合并）、`OPEN` 或 `MERGED`。
- `hours` 从 Issue 创建算到 PR 合并，只统计已合并的 PR。
- `first_ci` 记录你的测试作业在分支当前保留的第一个提交上的结果：`pass`、`fail`、`pending`，或 `none`（该作业没跑或被跳过）。强制推送会改变哪个提交算第一个。
- `commits` 是 PR 的提交数。`human_notes` 统计 GitHub 标为 `User` 的账号留下的 Issue 评论、PR 评论和 PR 评审。
- `merged_by` 是合并 PR 的账号。

脚本最多读取 100 张 Issue。在本机运行的 agent（比如 Claude Code、Cursor、OpenCode）如果用你自己的账号提交，脚本就分不出哪些修补提交来自你、哪些来自 agent。`human_notes` 只能间接反映人工介入：自动化通过个人账号发的评论也会被计入，手动改了代码却没留评论则不会。

我建了一个临时私有仓库来验证脚本。里面放了只有一步的 `tests` 工作流，我创建四张 Issue，自己扮演 agent。一个 PR 在工作流创建前就合并了，一个 PR 关闭但未合并，一张 Issue 没有 PR。还有一个 PR 只提到了对应 Issue，第一个提交的 `tests` 失败，又补了两个提交才修好。下面只把仓库名换成占位符，输出保持原样：

```text
$ ./agent-trial-score.sh OWNER/trial-copy-a 'label:trial-a' tests
issue	pr	link	result	hours	first_ci	commits	human_notes	merged_by
6	7	mention	MERGED	0	fail	3	0	xqliu
3	-	-	NO_PR	-	-	-	0	-
2	5	closes	CLOSED	-	none	1	1	-
1	4	closes	MERGED	0	none	1	0	xqliu

issues handed over: 4  merged: 2  no PR: 1  PR closed unmerged: 1  PR still open: 0
"tests" on the first commit of merged PRs: 0 pass, 1 fail, 1 other
merged with no human comment or review: 2 of 2
median hours from issue to merge: 0.0 (of 2 merged)
exit=0
```

小时数显示为零，是因为我在几分钟内就创建并合并了 PR，不能当成 agent 的结果。每个输出块里的 `exit=` 是退出状态，我在运行后用 `echo "exit=$?"` 打印出来。

读取失败后再算分数不可信，所以任何一次 GitHub 调用失败，脚本都会以退出码 2 停下，不输出汇总。我用替身 `gh` 让八类调用分别返回 HTTP 403：Issue 列表、Issue 评论、关联 PR、时间线、PR 状态、PR 提交、check run 和 PR 评审。下面列出其中两次，还有仓库不存在（同样退出 2）和搜索不到 Issue（退出 1）的例子：

```text
$ FAIL_ON='issues/6/comments' PATH=stub:$PATH ./agent-trial-score.sh OWNER/trial-copy-a 'label:trial-a' tests
gh: Resource not accessible (HTTP 403)
could not read comments on issue 6: stopping without a score
exit=2

$ FAIL_ON='check-runs' PATH=stub:$PATH ./agent-trial-score.sh OWNER/trial-copy-a 'label:trial-a' tests
gh: Resource not accessible (HTTP 403)
could not read check runs of PR 7: stopping without a score
exit=2

$ ./agent-trial-score.sh orbi-build/no-such-repo 'label:x'
GraphQL: Could not resolve to a Repository with the name 'orbi-build/no-such-repo'. (repository)
could not list issues for orbi-build/no-such-repo: stopping without a score
exit=2

$ ./agent-trial-score.sh orbi-build/orbi 'label:no-such-label-xyz'
no issues match 'label:no-such-label-xyz' in orbi-build/orbi: nothing to score
exit=1
```

## 在 Orbi 自己的仓库上运行同一个脚本

这一节只有一个仓库的记录。我没有另外五个 agent 的试用结果，无法放在一起比较。

2026 年 11 月 12 日，我在 [orbi-build/orbi](https://github.com/orbi-build/orbi) 上运行脚本，统计 2026 年 11 月 5–11 日创建的 Issue，排除 epic 和发版 Issue，检查名称用 `tests`。26 条结果里有 23 张工作 Issue，还有三张 Orbi 创建的里程碑确认 Issue，用来向我提问。这三张的 `NO_PR` 不算交付失败。下面保留了这三行，以及所有 `first_ci` 不为 `pass` 的行；`…` 表示省略的行：

```text
issue	pr	link	result	hours	first_ci	commits	human_notes	merged_by
…
2164	2166	closes	MERGED	1.4	none	2	0	app/orbi-build
…
2143	2150	closes	MERGED	3.6	fail	5	0	app/orbi-build
…
2141	-	-	NO_PR	-	-	-	0	-
2139	2146	closes	MERGED	2.2	fail	3	1	app/orbi-build
…
2127	2129	closes	MERGED	1	fail	3	0	app/orbi-build
2125	-	-	NO_PR	-	-	-	1	-
2123	2124	closes	MERGED	1	none	2	0	app/orbi-build
2120	-	-	NO_PR	-	-	-	1	-
…

issues handed over: 26  merged: 23  no PR: 3  PR closed unmerged: 0  PR still open: 0
"tests" on the first commit of merged PRs: 18 pass, 3 fail, 2 other
merged with no human comment or review: 19 of 23
median hours from issue to merge: 1.1 (of 23 merged)
exit=0
```

这些结果有几处需要说明：

- 23 张工作 Issue 的改动全部合并了。其中 19 张由我写，另外四张由 Orbi 创建。我用自己的工具处理这些任务，它已经在这个仓库里工作了几个月。
- Orbi 的 GitHub App 在评审和 CI 通过后就合并，省去了等人点合并按钮的时间。1.1 小时的中位数从 Issue 创建算到合并，包含实现、评审和 CI。
- 23 个 PR 中，有三个的 `tests` 在第一个提交上失败，后续提交在合并前修好了。还有两个的第一个提交没有 `tests` 运行记录，计入 `other`，不能算通过。
- Orbi 通过 App 在 Issue 评论里发评审结果，所以这里的 `human_notes` 只计我写的内容。23 张合并的工作 Issue 里，有四张带我的评论；那两张 `human_notes` 为 1 的 `NO_PR` 行，是我对里程碑确认的回复。

较早的 [AI 代码评审瓶颈一文](/zh/blog/ai-code-review-bottleneck/)统计的是 Orbi Cloud 仓库在另一个时间段里的记录，从 PR 创建到合并的中位数为 21 分钟。那次从 PR 创建才开始计时，仓库也不同，这两个数字不能直接比较。

## 付费前我会核对什么

我会查这几项：

- 我的分支保护允许谁合并，App 的评审是否计入批准数，是否仍需人工批准。
- 套餐是否包含我要用的云端 agent 和评审：[Claude 的托管评审](https://code.claude.com/docs/en/code-review.md)、[Cursor Premium 权限](https://cursor.com/docs/cloud-agent.md)和 [Copilot Free](https://github.com/features/copilot/plans) 的限制各不相同。
- 能否使用我要的模型，尤其是 [Cursor Plus 只能用 Grok](https://cursor.com/pricing)、[Claude 列出的模型](https://code.claude.com/docs/en/model-config.md)，以及 [OpenCode 的供应商选择](https://opencode.ai/docs/providers/)。
- 我的认证方式是否包含云端功能：[Codex 的 API key 接入不包含](https://learn.chatgpt.com/docs/pricing.md)。
- 订阅价格没包含哪些费用，包括 [Cursor 的第三方模型用量](https://cursor.com/pricing)和 [Copilot 云端和 Actions 的计算时间（与 AI Credits 分开计）](https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-on-github)。

## 相关

- [Cursor 替代品](/zh/blog/cursor-alternatives/)
- [Orbi 对比 GitHub Copilot coding agent](/zh/compare/github-copilot-coding-agent/)
- [AI 代码评审瓶颈](/zh/blog/ai-code-review-bottleneck/)
- [Orbi Cloud](/zh/cloud/?ref=blog-best-agent)
