---
title: Best AI agent for coding: test them on your own repo
date: 2026-11-12
summary: Six agents sorted by what you hand over, a one-week trial on your own repo, and a gh script that scores it from GitHub's issue and pull request records.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-best-ai-agent-for-coding-card.png
mirror: best-ai-agent-for-coding
---

There is no single best AI agent for coding; the choice depends on what you want to hand over: a prompt in your terminal or editor, a cloud task that returns a pull request (PR), or an issue whose implementation gets reviewed and merged. I wrote this for solo developers and maintainers choosing a first agent for their own GitHub repository. I group six agents by that handoff (Claude Code, Cursor, Codex, GitHub Copilot, OpenCode and Orbi, the issue-to-merge runner I built), then give you a one-week trial on your repo and a [GitHub CLI](https://cli.github.com/) (`gh`) script to score it from GitHub's records.

I'm Larry 🍀 Orbi, the creator of Orbi.

For the other five tools, I read official docs on 12 November 2026; I didn't install or run them for this post. I don't rank the agents or benchmark their speed or quality here. Orbi is the only agent this post measures, on its own repository near the end, and those numbers aren't a comparison. Orbi works only with GitHub and has no editor or inline completions.

## How to choose the best AI agent for coding

I start with one question: what do I hand over, and where does the work stop? Several agents support more than one of these workflows.

| Group | You hand over | Work stops at | Agents in this post |
|---|---|---|---|
| Terminal or editor session | A prompt | Session output; you manage the handoff | Claude Code, Cursor, Codex, GitHub Copilot, OpenCode |
| Work off your machine | A task or assigned issue | A diff, branch or PR for your next action | Claude Code, Cursor, Codex, GitHub Copilot; OpenCode via Actions |
| Issue through merge | An issue | Reviewed merge after CI, or a required human approval | Orbi |

Which AI coding agent is best for you follows from that answer. For an editor with cloud tasks, I'd try Cursor. For an issue carried through merge, I'd try Orbi. [Cursor alternatives](/blog/cursor-alternatives/) covers plan-by-plan pricing.

## The six agents

Prices and plan access below are as of 12 November 2026.

### Claude Code

[Claude Code](https://code.claude.com/docs/en/overview.md) runs in a terminal, IDE, desktop app or browser. Start a [cloud session](https://code.claude.com/docs/en/claude-code-on-the-web.md) with `claude --cloud`, or use `@claude` in GitHub through its [GitHub Action](https://code.claude.com/docs/en/github-actions.md). [Auto-fix](https://code.claude.com/docs/en/claude-code-on-the-web.md) investigates failed checks and reviewer comments. It pushes a fix when one is clear. Hosted [Code Review](https://code.claude.com/docs/en/code-review.md) is available only on Team/Enterprise and "never approves or blocks" a PR. The [model configuration](https://code.claude.com/docs/en/model-config.md) lists only Claude models. [Pro](https://claude.com/pricing) costs $20/month ($17/month billed annually). Free does not include Claude Code.

Pick it when you want a Claude session locally or in the cloud; [Orbi vs Claude Code](/compare/claude-code/) covers the Issue workflow difference.

### Cursor

[Cursor's plans](https://cursor.com/pricing) include its editor. Cloud Agents and Bugbot access start with Premium at $30/month. Plus at $8/month is limited to Grok models. On Premium and above, third-party models are billed separately by usage. [Cloud Agents](https://cursor.com/docs/cloud-agent.md) work on separate branches and produce PRs. [Bugbot Autofix](https://cursor.com/docs/bugbot.md) starts a Cloud Agent to fix review findings and uses Cloud Agent credits. The [merge-approval workflow](https://cursor.com/docs/release-notes/cloud-agents.md) is documented for Origin repositories, Cursor's own hosting in early beta. The docs I read on 12 November don't describe automatic merging on GitHub without human approval.

Pick it when you want an editor and cloud execution together; [Orbi vs Cursor](/compare/cursor/) compares the handoffs.

### Codex

[Codex CLI](https://learn.chatgpt.com/docs/codex/cli.md) runs locally. [Codex Cloud](https://learn.chatgpt.com/docs/cloud.md) returns work for you to inspect, commit or open as a PR. On GitHub, [`@codex review` or automatic review](https://learn.chatgpt.com/docs/third-party/github.md) flags only P0 and P1, its high-priority findings. [Reviewing a PR in chat](https://learn.chatgpt.com/docs/code-review.md) "doesn't post comments, approve it, or merge it". GitHub review also leaves branch protection and required approvals in place. The docs have moved to `learn.chatgpt.com`. [Plus is $20/month](https://learn.chatgpt.com/docs/pricing.md), and API-key access has no cloud features.

Pick it when you want local sessions and cloud tasks whose results you inspect before committing or opening a PR; see [Orbi vs Codex](/compare/codex/).

### GitHub Copilot

Copilot runs in IDEs and a CLI. I cover its cloud agent, which GitHub now calls Copilot in the cloud. [Assigning an issue](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task) "always creates a pull request", and the [cloud agent](https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/risks-and-mitigations) "cannot approve or merge a pull request". [Agent Merge](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/get-pull-requests-ready-to-merge) watches for and fixes CI failures and conflicts. It "does not enable auto-merge". Separately, [Copilot approvals](https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/code-review) can make code review's approval count toward required approvals. That setting is off by default. [Pro is $10/month, Pro+ $39/month and Max $100/month](https://github.com/features/copilot/plans), with usage billed in GitHub AI Credits. Free includes neither cloud agent access nor code review.

Pick it when you want GitHub issue assignment to create a PR for human review and merge; see [Orbi vs GitHub Copilot coding agent](/compare/github-copilot-coding-agent/).

### OpenCode

[OpenCode](https://opencode.ai/docs/) is a terminal coding agent with [MIT-licensed source](https://github.com/anomalyco/opencode) and support for [many model providers and your own key](https://opencode.ai/docs/providers/). Its [GitHub integration](https://opencode.ai/v1/docs/github/) runs in your own Actions runner. A `/opencode` or `/oc` comment can have it implement an issue and open a PR. The docs I read on 12 November don't describe merging. The software costs nothing; budget for model access through your provider or a subscription such as [OpenCode Go at $10/month](https://opencode.ai/docs/console/go/).

Pick it when you want to choose your model provider and run the GitHub workflow in your own Actions runner.

### Orbi

Label a GitHub Issue `ai-ready` and Orbi runs [Pi](/guides/pi-coding-agent/), an open-source coding agent, to implement it. A second Pi session reviews the code without having written it. The Orbi runner merges the reviewed commit once your CI passes. If your branch protection requires a human approval, Orbi stops at `ai-awaiting-merge` and an Issue comment tells you which action is needed. Releases require a person to open a release Issue and apply both `ai-ready` and `ai-release`. Orbi tags and publishes once its release checks pass.

Self-hosted [Orbi](https://github.com/orbi-build/orbi) costs nothing under AGPL-3.0 and uses your own model key. [Orbi Cloud](/cloud/?ref=blog-best-agent) is the paid hosted version, with plans listed on that page.

Pick it when you want Issues carried through review and merge.

## Try two agents on your own repo for a week

The docs won't tell you which is the best AI coding agent for your repo. A week of real issues will.

1. Pick 6–10 small, real issues with a clear definition of done. Create each issue when you hand it over: the script's clock starts at issue creation.

2. Label every handed-over issue `trial-<agent>`. The label is only how the script finds the issue; hand the work over the way each agent expects, whether that is assigning the issue, commenting on it, or pasting its text into a terminal session. For two agents, create both labels in the trial repo:

   ```bash
   gh label create trial-a -R OWNER/REPO --description 'issue handed to agent a'
   gh label create trial-b -R OWNER/REPO --description 'issue handed to agent b'
   ```

3. I'd start with one repo and alternate issues between agents. Each merge changes the code the next agent starts from; compare the two sets with that change in mind. To give both agents the same issues from the same baseline, make one private copy per agent from the same commit. Run the commands from your source checkout and set `OWNER` to your account. For the second agent, change `AGENT=a` to `AGENT=b` in the block and run it again. Replace the example issue's title and body with a real problem from your repo:

   ```bash
   OWNER=YOUR_GITHUB_LOGIN
   AGENT=a
   BASE=$(git rev-parse HEAD)
   NAME=trial-copy-$AGENT
   gh repo create "$OWNER/$NAME" --private
   git push "https://github.com/$OWNER/$NAME.git" "${BASE}:refs/heads/main"
   gh label create "trial-$AGENT" -R "$OWNER/$NAME" --description "issue handed to agent $AGENT"
   gh issue create -R "$OWNER/$NAME" --label "trial-$AGENT" \
     --title 'add() subtracts' --body 'add(2, 3) returns -1. Expected 5.'
   ```

   Keep the braces in `${BASE}:`. In zsh, `"$BASE:refs/heads/main"` invokes a modifier. My first push failed with this exact line:

   ```text
   error: src refspec 6465d879e845fbb914f0b1db9d5a04706e359b88efs/heads/main does not match any
   ```

   A copy has no CI secrets or branch protection unless you add them. Set those up before handing over work.

4. Keep the agents' instructions file (`AGENTS.md`, `CLAUDE.md` or whatever each agent reads) unchanged throughout the week. If you fix a stuck run by hand, leave a PR comment so the script counts the intervention. Make sure each PR says `Closes #N` for its issue. The script falls back to PRs that only mention the issue; check those rows by hand.

5. At the end of the week, run the script for both sets one after the other, so unfinished issues are counted at the same moment. With three to five issues per agent, read the result as whether each agent works in your repo at all; rates and medians from so few issues are too noisy to rank on. Record costs from your bill or usage record:

   | Agent | Subscription, credits or API spend for the week | Issues handed over | Issues merged |
   |---|---|---|---|
   | A | | | |
   | B | | | |

## Score the trial from GitHub's records

Save this as `agent-trial-score.sh` and run `chmod +x agent-trial-score.sh`. This bash script needs the GitHub CLI (`gh`, logged in with `gh auth login`), `jq`, `awk` and `sort`. I tested it with gh 2.100.0, jq 1.8.2, bash 5.3 and GNU Awk 5.4.1 on Linux. It uses only POSIX awk features. I haven't run it on macOS.

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
# The list call returns at most 100 issues; a silently cut-off list would skew the score.
[ "$(jq length <<<"$issues")" -lt 100 ] || die "100 or more issues match '$query'; narrow the search"

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

Run it once per agent, with the label you gave that agent's issues and the name of your test job:

```bash
./agent-trial-score.sh OWNER/REPO 'label:trial-a' tests
```

The third argument is the exact name of the check run that runs your tests. To see the names GitHub recorded for a commit:

```bash
gh api repos/OWNER/REPO/commits/COMMIT_SHA/check-runs -q '.check_runs[] | "\(.name)\t\(.conclusion)"'
```

On one Orbi PR, that command printed three checks: `Mintlify Deployment` (skipped), `link` and `tests`. Only `tests` runs the test suite, so I pass that name. Without a name, the column stays `unset`. This avoids counting a skipped docs deployment or an agent's own status check as a pass.

I read the columns this way:

- `issue` and `pr` are GitHub numbers. `link=closes` means the PR was set to close the issue. `mention` means the script fell back to the last PR in the repo that mentions the issue; check those rows by hand.
- `result` is `NO_PR`, `CLOSED` (PR closed unmerged), `OPEN` or `MERGED`.
- `hours` runs from issue creation to PR merge, for merged PRs only. When a person merges, it includes however long the PR waited for that person, so compare `hours` only between agents whose PRs get merged the same way, and read it next to the `NO_PR` and `CLOSED` counts.
- `first_ci` is your test job on the first commit still on the branch: `pass`, `fail`, `pending`, or `none` when that job did not run or was skipped there. A force-push changes which commit is first. If the repo has no CI, pass no check name: this column stays `unset` and you judge the PRs by reading them.
- `commits` counts the PR's commits. `human_notes` counts comments on the issue and the PR, plus PR reviews, left by accounts GitHub types as `User`.
- `merged_by` names the account that merged the PR.

The script stops with exit code 2 if 100 or more issues match, because the list call returns at most 100 and a cut-off list would skew the score; narrow the search instead. If an agent runs under your own account, as Claude Code, Cursor or OpenCode can on your machine, its commits look like yours, so the script cannot tell your fix-up commits from the agent's. `human_notes` is only a proxy for intervention: automation that posts through a personal account also counts, and a manual edit without a comment does not.

In a private throwaway repository with a one-step `tests` workflow, I created four issues and played the agent myself. One PR merged before the workflow existed. Another was closed unmerged, and one issue got no PR. The remaining PR only mentioned its issue and failed `tests` on its first commit before two more commits fixed it. The repository name below is a placeholder; the output is unchanged:

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

The zero hours are from my manual test: I opened and merged the PRs within minutes. The `exit=` line in each block is the exit status, which I printed with `echo "exit=$?"` after the run.

Any failed GitHub call stops the script with exit code 2 and no summary. I checked that with a stand-in `gh` that returns HTTP 403 for one kind of call at a time (issue list, issue comments, linked PRs, timeline, PR state, PR commits, check runs, PR reviews). All eight stopped the same way. The output below shows two of those failures, then a repository that does not exist (also exit 2) and a search that matches no issue (exit 1):

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

## The same script on Orbi's own repository

I have no trial results for the other five agents to compare with this repository's record.

For [orbi-build/orbi](https://github.com/orbi-build/orbi), I ran the script on 12 November 2026 over issues created 5–11 November 2026, excluding epics and release tickets, with `tests` as the check name. The search argument was `'created:2026-11-05..2026-11-11 -label:ai-epic -label:ai-release'`. The 26 rows cover 23 work items and three milestone-confirmation tickets that Orbi opens to ask me a question. Those three `NO_PR` rows are not failed deliveries. I've kept those three rows and every row whose `first_ci` is not `pass`; `…` marks omitted rows:

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

- All 23 work items merged. I wrote 19 of those issues and Orbi opened the other four. I maintain the codebase, and Orbi has worked in it for months.
- Orbi's GitHub App merges once review and CI pass, so the measured time includes no wait for a merge click. The median 1.1 hours runs from issue creation to merge and includes implementation, review and CI.
- On three of the 23, `tests` failed on the first commit and later commits, all pushed by Orbi's App, fixed it before the merge. On two, `tests` has no run on the first commit, so they count as `other`, not as passes.
- Orbi posts its review as Issue comments from the App. In this run, `human_notes` counts only what I typed. Four of the 23 had a comment from me. Nobody commented on or reviewed the other 19 PRs; the only review they got was the second Pi session's.

The older [AI code review bottleneck post](/blog/ai-code-review-bottleneck/) reported a median 21 minutes from PR open to merge on Orbi Cloud's repository in a different window. That clock starts later and covers another repository, so the two numbers don't compare.

## What I'd check before paying for any of them

When choosing the best AI agent for coding on GitHub, I'd check:

- Who can merge under my branch protection, including whether an App's review counts or a human approval remains necessary.
- Whether the plan includes the cloud agent and review I intend to use: [Claude's hosted review](https://code.claude.com/docs/en/code-review.md), [Cursor Premium access](https://cursor.com/docs/cloud-agent.md) and [Copilot Free](https://github.com/features/copilot/plans) have different limits.
- Whether my required models are available, especially [Cursor Plus's Grok restriction](https://cursor.com/pricing), [Claude's listed models](https://code.claude.com/docs/en/model-config.md) and [OpenCode's provider choice](https://opencode.ai/docs/providers/).
- Whether my authentication method includes cloud features: [Codex API-key access does not](https://learn.chatgpt.com/docs/pricing.md).
- What the subscription excludes from its price, including [Cursor's third-party model usage](https://cursor.com/pricing) and [Copilot's cloud and Actions compute time, which GitHub counts separately from AI Credits](https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-on-github).

## Related

- [Cursor alternatives](/blog/cursor-alternatives/)
- [Orbi vs GitHub Copilot coding agent](/compare/github-copilot-coding-agent/)
- [The AI code review bottleneck](/blog/ai-code-review-bottleneck/)
- [Orbi Cloud](/cloud/?ref=blog-best-agent)
