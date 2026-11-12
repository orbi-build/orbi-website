---
title: Best AI agent for coding: test them on your own repo
date: 2026-11-12
summary: Six agents sorted by what you hand over, a one-week trial on your repo, and a gh script that scores the results using GitHub's issue and pull request records.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-best-ai-agent-for-coding-card.png
---

There is no single best AI agent for coding: the right one depends on whether you want to hand over a prompt in your terminal or editor, a cloud task that comes back as a pull request (PR), or an issue that gets reviewed and merged. I wrote this for solo developers and maintainers choosing a first agent for their own GitHub repository. I cover six agents sorted by that handoff (Claude Code, Cursor, Codex, GitHub Copilot, OpenCode and Orbi), a one-week trial on your repo, and a `gh` script that scores it from GitHub's records.

I'm Larry 🍀 Orbi, the creator of Orbi.

Orbi is on this list. I did not install or run the five third-party tools for this post; their entries rest on official docs read on 12 November 2026. This is not a benchmark, and I give no speed or quality scores. Orbi is GitHub only, not an editor, and has no inline completions.

## How to choose the best AI agent for coding

I start with one question: what do I hand over, and where does the work stop? Several agents support more than one of these workflows.

| Group | You hand over | Work stops at | Agents in this post |
|---|---|---|---|
| Terminal or editor session | A prompt | Session output; you manage the handoff | Claude Code, Cursor, Codex, OpenCode |
| Work off your machine | A task or assigned issue | A diff, branch or PR for your next action | Claude Code, Cursor, Codex, GitHub Copilot; OpenCode via Actions |
| Issue through merge | An issue | Reviewed merge after CI, or a required human approval | Orbi |

For an editor with cloud tasks, I'd include Cursor in my trial; for an issue carried through merge, I'd include Orbi. My choice of the best AI coding agent would depend on that handoff. For plan-by-plan pricing, see [Cursor alternatives](/blog/cursor-alternatives/).

## The six agents

Prices and plan access below are as of 12 November 2026.

### Claude Code

[Claude Code](https://code.claude.com/docs/en/overview.md) runs in a terminal, IDE, desktop app or browser; start a [cloud session](https://code.claude.com/docs/en/claude-code-on-the-web.md) with `claude --cloud`, or use `@claude` in GitHub through its [GitHub Action](https://code.claude.com/docs/en/github-actions.md). [Auto-fix](https://code.claude.com/docs/en/claude-code-on-the-web.md) investigates failed checks and reviewer comments, pushing a fix when one is clear. Hosted [Code Review](https://code.claude.com/docs/en/code-review.md) is Team/Enterprise only and "never approves or blocks" a PR; the [model configuration](https://code.claude.com/docs/en/model-config.md) lists Claude models only. [Pro](https://claude.com/pricing) costs $20/month ($17/month billed annually); Free does not include Claude Code.

Pick it when you want a Claude session locally or in the cloud; [Orbi vs Claude Code](/compare/claude-code/) covers the Issue workflow difference.

### Cursor

[Cursor's plans](https://cursor.com/pricing) combine its editor with Cloud Agents and Bugbot access from Premium at $30/month; Plus at $8/month is Grok models only, and third-party model usage costs extra. [Cloud Agents](https://cursor.com/docs/cloud-agent.md) work on separate branches and produce PRs. [Bugbot Autofix](https://cursor.com/docs/bugbot.md) starts a Cloud Agent to fix review findings and consumes Cloud Agent credits. The [merge-approval workflow](https://cursor.com/docs/release-notes/cloud-agents.md) is described for Origin repositories, Cursor's own hosting in early beta; the docs I read on 12 November don't describe automatic merging without human approval on GitHub.

Pick it when you want an editor and cloud execution together; [Orbi vs Cursor](/compare/cursor/) compares the handoffs.

### Codex

[Codex CLI](https://learn.chatgpt.com/docs/codex/cli.md) runs locally, while [Codex Cloud](https://learn.chatgpt.com/docs/cloud.md) returns work for you to inspect, commit or open as a PR. On GitHub, [`@codex review` or automatic review](https://learn.chatgpt.com/docs/third-party/github.md) flags only P0 and P1, its high-priority findings. [Reviewing a PR in chat](https://learn.chatgpt.com/docs/code-review.md) "doesn't post comments, approve it, or merge it"; GitHub review also leaves branch protection and required approvals in place. The docs have moved to `learn.chatgpt.com`; [Plus is $20/month](https://learn.chatgpt.com/docs/pricing.md), while API-key access has no cloud features.

Pick it when you want local sessions and cloud tasks whose results you inspect before committing or opening a PR; see [Orbi vs Codex](/compare/codex/).

### GitHub Copilot

For Copilot in the cloud / cloud agent, [assigning an issue](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task) "always creates a pull request", and the [cloud agent](https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/risks-and-mitigations) "cannot approve or merge a pull request". [Agent Merge](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/get-pull-requests-ready-to-merge) watches and fixes CI failures and conflicts, but "does not enable auto-merge". Separately, [Copilot approvals](https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/code-review) can make code review's approval count toward required approvals; that setting is off by default. [Pro is $10/month, Pro+ $39/month and Max $100/month](https://github.com/features/copilot/plans), with usage billed in GitHub AI Credits; Free includes neither cloud agent access nor code review.

Pick it when you want GitHub issue assignment to create a PR for human review and merge; see [Orbi vs GitHub Copilot coding agent](/compare/github-copilot-coding-agent/).

### OpenCode

[OpenCode](https://opencode.ai/docs/) is a terminal coding agent with [MIT-licensed source](https://github.com/anomalyco/opencode) and support for [many model providers and your own key](https://opencode.ai/docs/providers/). Its [GitHub integration](https://opencode.ai/v1/docs/github/) runs in your own Actions runner: a `/opencode` or `/oc` comment can have it implement an issue and open a PR. The docs I read on 12 November don't describe merging. For a free option, the software costs nothing and you budget for model access through your provider or a subscription such as [OpenCode Go at $10/month](https://opencode.ai/docs/console/go/).

Pick it when you want to choose your model provider and run the GitHub workflow in your own Actions runner.

### Orbi

Label a GitHub Issue `ai-ready` and Orbi runs [Pi](/guides/pi-coding-agent/), an open-source coding agent, to implement it. A second Pi session that did not write the code reviews it, and the Orbi runner merges the reviewed commit once your CI passes; if your branch protection requires a human approval, Orbi stops at `ai-awaiting-merge` and the Issue comment names the action. A person starts a release; Orbi then opens the release ticket, tags and publishes.

Pick it when you want Issues carried through review and merge, using self-hosted [Orbi](https://github.com/orbi-build/orbi) or [Orbi Cloud](/cloud/?ref=blog-best-agent).

## Try two agents on your own repo for a week

To decide which AI coding agent is best for my repo, I'd use this protocol:

1. Pick 6–10 small, real issues with a clear done-condition. Create each issue when you hand it over: the script's clock starts at issue creation.

2. Label every handed-over issue `trial-<agent>`. For two agents, create both labels in the trial repo:

   ```bash
   gh label create trial-a -R OWNER/REPO --description 'issue handed to agent a'
   gh label create trial-b -R OWNER/REPO --description 'issue handed to agent b'
   ```

3. Default to one repo and alternate issues between agents. Compare the two sets: after one issue merges, the next agent starts from changed code. For the same issues on the same baseline, make one private copy per agent from the same commit. Run from your source checkout, set `OWNER` to your account, and repeat with `NAME=trial-copy-b` and `trial-b` for the second agent. Replace the example issue's title and body with a real problem from your repo:

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

   Write `${BASE}:` with braces. In zsh, `"$BASE:refs/heads/main"` invokes a modifier; my first push failed with this exact line:

   ```text
   error: src refspec 6465d879e845fbb914f0b1db9d5a04706e359b88efs/heads/main does not match any
   ```

   A copy has no CI secrets or branch protection unless you add them. Set those up before handing over work.

4. Keep the same instructions file throughout the week. Don't rescue a stuck run silently: leave a PR comment if you fix something by hand so the script counts the intervention. Make sure each PR says `Closes #N` for its issue.

5. Use the same cutoff at the end of the week for both agents, and score both sets then, including unfinished issues. Record costs from your bill or usage record:

   | Agent | Subscription, credits or API spend for the week | Issues handed over | Issues merged |
   |---|---|---|---|
   | A | | | |
   | B | | | |

## Score the trial from GitHub's records

Save this as `agent-trial-score.sh`, run `chmod +x agent-trial-score.sh`, then execute it with bash. It needs logged-in `gh`, `jq`, `awk` and `sort`, plus the standard shell utilities it calls. I tested it with gh 2.100.0, jq 1.8.2, bash 5.3 and GNU Awk 5.4.1 on Linux; it uses only POSIX awk features but I have not run it on macOS.

```bash
#!/usr/bin/env bash
# Score a coding-agent trial from GitHub's own records, one row per issue.
# Usage: ./agent-trial-score.sh OWNER/REPO 'ISSUE SEARCH'
#   ISSUE SEARCH  selects every issue you handed to the agent, e.g.
#                 'label:trial-copilot' (GitHub issue search syntax)
set -euo pipefail

repo="${1:?usage: $0 OWNER/REPO 'ISSUE SEARCH'}"
query="${2:?usage: $0 OWNER/REPO 'ISSUE SEARCH'}"

issues=$(gh issue list -R "$repo" --state all --search "$query" --limit 100 \
  --json number,createdAt) \
  || { echo "could not list issues for $repo" >&2; exit 2; }

if [ "$(jq length <<<"$issues")" -eq 0 ]; then
  echo "no issues match '$query' in $repo: nothing to score" >&2
  exit 1
fi

# Comments or reviews left by human accounts (GitHub user type "User").
humans() { gh api --paginate "$1?per_page=100" -q '.[] | select(.user.type == "User") | .id' | wc -l; }

printf 'issue\tpr\tlink\tresult\thours\tfirst_ci\tcommits\thuman_notes\tmerged_by\n'
rows=$(jq -c '.[]' <<<"$issues" | while read -r issue; do
  i=$(jq -r .number <<<"$issue")
  notes=$(humans "repos/$repo/issues/$i/comments")
  # The last PR in this repository that was set to close the issue, merged or not.
  n=$(gh api graphql -F owner="${repo%/*}" -F name="${repo#*/}" -F number="$i" -f query='
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) { issue(number: $number) {
        closedByPullRequestsReferences(first: 20, includeClosedPrs: true) {
          nodes { number repository { nameWithOwner } } } } } }' \
    -q "[.data.repository.issue.closedByPullRequestsReferences.nodes[]
        | select(.repository.nameWithOwner == \"$repo\") | .number] | last // empty")
  link=closes
  if [ -z "$n" ]; then
    # No closing link: fall back to the last PR in this repository that mentions the issue.
    n=$(gh api --paginate "repos/$repo/issues/$i/timeline?per_page=100" -q "[.[]
        | select(.event == \"cross-referenced\" and .source.issue.pull_request != null
                 and .source.issue.repository.full_name == \"$repo\") | .source.issue.number] | last // empty" | tail -n 1)
    link=mention
  fi
  if [ -z "$n" ]; then
    printf '%s\t-\t-\tNO_PR\t-\t-\t-\t%s\t-\n' "$i" "$notes"
    continue
  fi

  pr=$(gh pr view "$n" -R "$repo" --json state,mergedAt,mergedBy)
  result=$(jq -r .state <<<"$pr")
  hours=-
  if [ "$result" = MERGED ]; then
    hours=$(jq -rn --arg a "$(jq -r .createdAt <<<"$issue")" --arg b "$(jq -r .mergedAt <<<"$pr")" \
      '(($b|fromdate) - ($a|fromdate)) / 3600 | . * 10 | round / 10')
  fi

  shas=$(gh api --paginate "repos/$repo/pulls/$n/commits?per_page=100" -q '.[].sha')
  commits=$(grep -c . <<<"$shas" || true)
  first_sha=$(head -n 1 <<<"$shas")

  # CI on the first commit still on the branch: pass, fail, pending or none.
  first_ci=none
  if [ -n "$first_sha" ]; then
    first_ci=$(gh api "repos/$repo/commits/$first_sha/check-runs?per_page=100" -q '
      [.check_runs[].conclusion] as $c
      | if ($c|length) == 0 then "none"
        elif any($c[]; . == null) then "pending"
        elif all($c[]; . == "success" or . == "skipped" or . == "neutral") then "pass"
        else "fail" end')
  fi

  notes=$((notes + $(humans "repos/$repo/issues/$n/comments") + $(humans "repos/$repo/pulls/$n/reviews")))
  merged_by=$(jq -r '.mergedBy.login // "-"' <<<"$pr")
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$i" "$n" "$link" "$result" "$hours" "$first_ci" "$commits" "$notes" "$merged_by"
done)
printf '%s\n' "$rows"

printf '%s\n' "$rows" | awk -F'\t' '
  $4 == "MERGED" { m++; if ($6 == "pass") p++; if ($6 == "fail") f++; if ($8 == 0) q++ }
  $4 == "NO_PR"  { none++ }
  $4 == "CLOSED" { c++ }
  $4 == "OPEN"   { o++ }
  END {
    printf "\nissues handed over: %d  merged: %d  no PR: %d  PR closed unmerged: %d  PR still open: %d\n", NR, m, none, c, o
    if (m == 0) { print "no merged PRs: no merge-time numbers"; exit }
    printf "first-commit CI on merged PRs: %d pass, %d fail, %d other\n", p, f, m - p - f
    printf "merged with no human comment or review: %d of %d\n", q, m
  }'
# Median without gawk-only functions: sort first, then pick the middle.
printf '%s\n' "$rows" | awk -F'\t' '$4 == "MERGED" { print $5 }' | sort -n | awk '
  { h[NR] = $1 }
  END {
    if (NR == 0) exit
    med = (NR % 2) ? h[(NR + 1) / 2] : (h[NR / 2] + h[NR / 2 + 1]) / 2
    printf "median hours from issue to merge: %.1f (of %d merged)\n", med, NR
  }'
```

I read the columns this way:

- `issue` and `pr` are GitHub numbers; `link=closes` is a closing link. `mention` falls back to the last PR in the repo that mentions the issue; check those rows by hand.
- `result` is `NO_PR`, `CLOSED` (PR closed unmerged), `OPEN` or `MERGED`.
- `hours` runs from issue creation to PR merge, for merged PRs only.
- `first_ci` reads check runs on the first commit still on the branch. It ignores legacy commit statuses; a force-push changes which commit is first.
- `commits` counts the PR's commits. `human_notes` counts issue/PR comments and PR reviews by accounts GitHub types as `User`.
- `merged_by` names the account that merged the PR.

The script reads up to 100 issues. If an agent runs under your own account, as Claude Code, Cursor or OpenCode can on your machine, its commits look like yours: this cannot distinguish your fix-up commits from the agent's. `human_notes` is only a proxy for intervention: automation using a personal account also counts, while manual edits without a comment do not.

In a private throwaway repository, I created three issues: one merged, one with a PR closed unmerged, and one with no PR. The repository name in this command is a placeholder; the output is unchanged:

```text
$ ./agent-trial-score.sh OWNER/trial-copy-a 'label:trial-a'
issue	pr	link	result	hours	first_ci	commits	human_notes	merged_by
3	-	-	NO_PR	-	-	-	0	-
2	5	closes	CLOSED	-	none	1	1	-
1	4	closes	MERGED	0	none	1	0	xqliu

issues handed over: 3  merged: 1  no PR: 1  PR closed unmerged: 1  PR still open: 0
first-commit CI on merged PRs: 0 pass, 0 fail, 1 other
merged with no human comment or review: 1 of 1
median hours from issue to merge: 0.0 (of 1 merged)
exit=0
```

The near-zero time comes from the throwaway probe. It is not an agent result. An inaccessible repository exits with code 2; a search matching no issues exits with code 1:

```text
$ ./agent-trial-score.sh orbi-build/no-such-repo 'label:x'
GraphQL: Could not resolve to a Repository with the name 'orbi-build/no-such-repo'. (repository)
could not list issues for orbi-build/no-such-repo
exit=2

$ ./agent-trial-score.sh orbi-build/orbi 'label:no-such-label-xyz'
no issues match 'label:no-such-label-xyz' in orbi-build/orbi: nothing to score
exit=1
```

## What the same table looks like on two real repositories

This is not a comparison of agents. These are different repositories, issues and people, queried on 12 November 2026.

For [orbi-build/orbi](https://github.com/orbi-build/orbi), I selected issues created 5–11 November 2026, excluding epics and release tickets. The 26 results include 23 work items and three milestone-confirmation tickets Orbi opens to ask me a question; their `NO_PR` rows are not failed deliveries. This excerpt keeps those three and all three first-CI failures; `…` marks omitted rows:

```text
issue	pr	link	result	hours	first_ci	commits	human_notes	merged_by
…
2143	2150	closes	MERGED	3.6	fail	5	0	app/orbi-build
2141	-	-	NO_PR	-	-	-	0	-
2139	2146	closes	MERGED	2.2	fail	3	1	app/orbi-build
2127	2129	closes	MERGED	1	fail	3	0	app/orbi-build
2125	-	-	NO_PR	-	-	-	1	-
2120	-	-	NO_PR	-	-	-	1	-
…

issues handed over: 26  merged: 23  no PR: 3  PR closed unmerged: 0  PR still open: 0
first-commit CI on merged PRs: 20 pass, 3 fail, 0 other
merged with no human comment or review: 19 of 23
median hours from issue to merge: 1.1 (of 23 merged)
exit=0
```

The 23 work items all merged: I wrote 19 and Orbi opened four. Orbi's GitHub App merges once review and CI pass, without waiting for my merge click, so the hours are short by design. The median 1.1 hours includes implementation and CI, running from issue creation through merge.

Orbi posts its review as Issue comments by the App, so `human_notes` counts only what I typed. Four of the 23 merged work items had my comments. Three of 23 failed CI on the first commit and were fixed before merge. The older [AI code review bottleneck post](/blog/ai-code-review-bottleneck/) reported a median 21 minutes from PR open to merge on Orbi Cloud's repository in a different window; the clocks differ, so don't compare them.

I also ran the script on a public repository where GitHub's Copilot agent (`app/copilot-swe-agent`) opened the PRs and the owner merged them, for issues created 1 April–31 July 2026:

```text
issues handed over: 14  merged: 11  no PR: 0  PR closed unmerged: 3  PR still open: 0
first-commit CI on merged PRs: 11 pass, 0 fail, 0 other
merged with no human comment or review: 9 of 11
median hours from issue to merge: 64.1 (of 11 merged)
exit=0
```

Three merged rows were found only through `mention`: the script catches PRs without closing links as well as PRs closed unmerged. The median 64.1 hours includes however long the owner took to review. I have not named this repository here, so readers cannot independently trace this sample from the post.

## What I'd check before paying for any of them

When choosing the best AI agent for coding on GitHub, I'd check:

- Who can merge under my branch protection, including whether an App's review counts or a human approval remains necessary.
- Whether the plan includes the cloud agent and review I intend to use: [Claude's hosted review](https://code.claude.com/docs/en/code-review.md), [Cursor Premium access](https://cursor.com/docs/cloud-agent.md) and [Copilot Free](https://github.com/features/copilot/plans) have different limits.
- Whether my required models are available, especially [Cursor Plus's Grok restriction](https://cursor.com/pricing), [Claude's listed models](https://code.claude.com/docs/en/model-config.md) and [OpenCode's provider choice](https://opencode.ai/docs/providers/).
- Whether my authentication method includes cloud features: [Codex API-key access does not](https://learn.chatgpt.com/docs/pricing.md).
- What the subscription excludes from its price, including [Cursor's third-party model usage](https://cursor.com/pricing) and [Copilot's separate compute allowance](https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-on-github).

## Related

- [Cursor alternatives](/blog/cursor-alternatives/)
- [Orbi vs GitHub Copilot coding agent](/compare/github-copilot-coding-agent/)
- [The AI code review bottleneck](/blog/ai-code-review-bottleneck/)
- [Orbi Cloud](/cloud/?ref=blog-best-agent)
