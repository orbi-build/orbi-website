---
title: AI code review bottleneck? Our PRs wait after merge
date: 2026-11-04
summary: 847 agent PRs merged in a median 21 minutes, yet the oldest change in each production promotion had waited a median 3.4 hours on beta, once 169 hours.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-merge-wait-card.png
---

The AI code review bottleneck looks different in our pipeline: from 14 September to 21 October 2026 (+08), 847 pull requests the Orbi runner opened in Orbi Cloud's repository merged into `beta` in a median 21 minutes (20.6), including CI and every agent review round. Yet each promotion's oldest change had waited a median 3.4 hours on beta, 13.7 hours at the 90th percentile, and once 169 hours. The slow part was after merge, while finished work waited to be released and promoted.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi Cloud, the hosted product, is itself built by Orbi: an agent takes each GitHub Issue, opens a pull request into `beta`, and a separate agent session reviews it. It merges when review and CI pass.

A release ticket tags a version on beta. After a soak on beta, a promotion merges the tag into `main`, the production branch. The production deploy waits for a one-click human approval. The orbi-cloud repository is private, so I show aggregate numbers without repository links.

## Measuring the AI code review bottleneck

I counted PRs and promotions merged during the window separately. Promotions are main first-parent merges whose second parent is on beta, identified by ancestry, regardless of title. B follows only beta's first-parent line, excluding earlier commits on PR branches. It measures each batch's oldest wait; its denominator differs from the PR clock.

| Clock | Definition | Sample | Median | p90 |
|---|---|---|---|---|
| PR open to merge | Runner PR opened → merged into beta, including CI and all review/fix rounds | 847 PRs | 20.6 min | 79.1 min |
| A: newest tag | Newest release's tagged commit → merge into main | 110 promotions | 0.77 h | 4.95 h |
| C: oldest tag | Oldest unpromoted release's tagged commit → merge into main | 110 promotions | 1.04 h | 8.43 h |
| B: oldest change | Oldest change on beta still absent from main → merge into main | 110 promotions | 3.44 h | 13.73 h |

The runner PRs had a median size of 116 changed lines, counting additions plus deletions; 87% changed at most 500 lines. These include PRs under my account carrying the engine's "Built by Orbi" marker.

A and C approximate waiting after a release is cut, using tagged commits' committer times. B adds pre-release waiting. Without a new tag, A and C use the latest reachable tag.

B reached 169.01 hours and exceeded 24 hours five times. Changes per promotion, counted on beta's first-parent line, had a median of 6, p90 of 20, and maximum of 276. Of the 110 promotions, 27 carried two or more tags.

Promotion clocks stop at main's merge, before the approval and deploy.

## What happens between merged and promoted

The release process calls for a release ticket to tag beta, a beta deploy, a one-hour soak, an end-to-end new-user check and my sign-off, then promotion and the production approval click.

The approval step was quick: across 69 approval tickets, the median open-to-close time was 1.6 minutes. That clock covers the approval step and deploy script. The checking already happened on beta, before the ticket opened. It leaves my earlier verification and sign-off time unmeasured.

Each step is reasonable. Changes queue behind them in batches, and when one thing holds a promotion, everything behind it waits.

## 12 October: the player was ready before the clips

At 16:39 (+08) on 12 October, a change to the onboarding help popup merged into beta. It played new how-to clips, which were a separate step in the website repository.

The next release ticket, v0.7.31, made promotion conditional on all six clips being live on orbi.build: "if missing, ship the website first, then promote Cloud".

| Time | Event |
|---|---|
| 17:23 | v0.7.31 tagged |
| 18:22 | v0.7.32 tagged |
| 20:32 | v0.7.33 tagged |
| 22:17 | v0.7.34 tagged |
| 22:25 | Clips landed in the website repository |
| 23:02 | All four versions promoted into main together |

Every tag contained the player. By promotion, the first tag had waited 5.7 hours (5.66). Other changes waited in the same batch, including a checkout fix. The [setup video](/blog/watch-the-six-steps/) shows the flow those clips help explain.

## 21 October: 276 changes arrived together

On 21 October, a promotion brought 276 changes and 12 tags, v0.8.0 through v0.8.11, into main. Its oldest change had waited 169 hours.

Production also had v0.7.40 promoted on 14 October and a hotfix on 17 October. Beta was shipping the v0.8 series; milestone v0.8.5 alone contained 102 tickets.

## Drift alerts and the next step

A scheduled check opens an issue when beta is more than 24 hours ahead of main and closes it automatically when that clears. Four such alerts opened in the window. Their median lifetime was 14.5 hours; the longest lasted 143 hours, from 16 October 00:58 to 22 October 00:14 (+08).

An alert's lifetime measures how long the drift lasted. It cannot establish whether anyone acted while it was open.

A time threshold says "behind" without identifying what is stuck. I'd rather check an event: the oldest unpromoted tag is over 2 hours old, and nobody can name the next step. I need the pending deploy, soak end time, or sign-off named.

## How this compares with larger samples

The [DORA 2024 report, page 40](https://dora.dev/research/2024/dora-report/2024-dora-accelerate-state-of-devops-report.pdf), estimates a 7.2% drop in delivery stability and a 1.5% drop in throughput for every 25% increase in AI adoption. DORA hypothesizes that changelists are growing. The result is correlational.

[Faros AI's 2025 study](https://www.faros.ai/blog/ai-software-engineering), covering over 10,000 developers across 1,255 teams, reports 98% more merged PRs, 91% longer PR review time, and 154% larger PRs with high AI adoption. It found no significant correlation with company-level improvement.

In this pipeline, each ticket is a small change and a separate agent reviews it. The oldest-change waits extend well past the PR clock; the batch moved downstream. This single pipeline proves nothing about those studies' samples.

## Working in small batches past the PR

DORA's [working in small batches capability page](https://dora.dev/capabilities/working-in-small-batches/) says: "Any batch of code that takes longer than a week to complete and check is too big". It also warns that AI tools tempt developers into massive pull requests, and that regrouping small batches before release delays feedback.

I need to apply that past the PR. The batch that matters is what reaches production together.

For the 40 milestones from v0.7.14 through v0.8.11, released within the window, the median was 3 tickets; 32 had 7 or fewer. The outliers were v0.7.29, with 78 tickets and a 43.7-hour promotion wait by B, and v0.8.5, with 102 tickets.

I'll try two rules next; neither is in force yet:

1. A milestone must be a batch that can go to production on its own.
2. Don't merge code that needs something that isn't live yet: assets, configuration, or another repository's change. Ship the dependency first, and connect the UI entry point last.

The second follows Martin Fowler's [Keystone Interface](https://martinfowler.com/bliki/KeystoneInterface.html): "Build all the back-end code, integrate, but don't build the user-interface." The visible entry point completes the feature after its dependencies are ready.

I'll check the rules with merge-wait's median and p90 over the next four weeks. That follow-up needs a revised query for the promotion-history change described below.

## Measure merge wait in your repository

Save this as `merge-wait.sh`:

```bash
#!/usr/bin/env bash
# How long did the oldest commit in each promotion wait?
# Usage: merge-wait.sh <production-branch> <since YYYY-MM-DD> [until YYYY-MM-DD]
#   e.g. merge-wait.sh origin/main 2026-09-14 2026-10-22
# For every merge on the production branch's first-parent line, prints the
# merge date, how many changes it brought in (first-parent commits of the
# merged branch, i.e. one per PR merged there) and how long the oldest had been
# waiting (merge time minus its committer time), then the median.
set -euo pipefail
branch=${1:?usage: merge-wait.sh <production-branch> <since YYYY-MM-DD> [until YYYY-MM-DD]}
since=${2:?usage: merge-wait.sh <production-branch> <since YYYY-MM-DD> [until YYYY-MM-DD]}
until=${3:-now}
git rev-parse --verify -q "$branch^{commit}" >/dev/null || { echo "unknown ref: $branch" >&2; exit 2; }

rows=$(git log "$branch" --first-parent --merges --since="$since" --until="$until" --format='%H %ct' |
  while read -r h ct; do
    oldest=$(git log --first-parent --format=%ct "$h^1..$h^2" | sort -n | head -n 1)
    [ -n "$oldest" ] || continue
    printf '%s\t%s\t%s\n' "$(git log -1 --format=%cs "$h")" "$(git rev-list --first-parent --count "$h^1..$h^2")" \
      "$(awk -v a="$ct" -v b="$oldest" 'BEGIN{printf "%.1f", (a-b)/3600}')"
  done)
[ -n "$rows" ] || { echo "no merges into $branch between $since and $until" >&2; exit 1; }
printf 'date\tcommits\toldest_wait_h\n%s\n' "$rows"
printf '%s\n' "$rows" | cut -f3 | sort -n |
  awk '{v[NR]=$1} END{m=(NR%2)?v[(NR+1)/2]:(v[NR/2]+v[NR/2+1])/2; printf "merges=%d median_oldest_wait_h=%.1f max=%.1f\n", NR, m, v[NR]}'
```

From the repository root, fetch first, make it executable, and supply the production branch, start date, and optional end date:

```bash
git fetch
chmod +x merge-wait.sh
TZ=Asia/Shanghai ./merge-wait.sh origin/main 2026-09-14 2026-10-22
```

`TZ=Asia/Shanghai` makes the date boundaries +08, as in my window; the end date is the boundary after 21 October, and without it the script uses `now`. It prints each merge's date, incoming first-parent change count, and oldest wait in hours, then a summary. Exit codes are 0 for success, 1 for a missing argument or no merges in the window, and 2 for an unknown ref.

Its last line on orbi-cloud was:

```text
merges=111 median_oldest_wait_h=3.4 max=169.0
```

The 111 versus the table's 110 includes the hotfix merge the table skips.

This assumes promotions are merge commits on the production branch's first-parent line, and the merged branch has its own first-parent history, with one commit per PR merge. Squash-only promotions, tag-only release flows, and promotions recreated as new commits need a different query. Our pipeline switched to that last style on 23 October, which is why this window stops on 21 October.

For repositories that still merge beta's history into main, this quick check counts all commits absent from main, including PR-branch commits, and finds the oldest committer time. Its scope is broader than B.

```bash
git rev-list --count origin/main..origin/beta
date -d @"$(git log --format=%ct origin/main..origin/beta | sort -n | head -1)"
```

Sorting ISO dates as strings gives the wrong order when commits carry different time zone offsets. I made that mistake while measuring; sorting epoch seconds numerically fixes it.

## Limits

This is one agent-built product, one maintainer, and about five weeks. I use committer time on beta's first-parent line as "landed on beta"; tag clocks use the tagged commit's committer time. Main's merge time precedes deployment. The approval-ticket and drift-alert numbers depend on this team's process.

## Related

[Who presses merge after Claude Code runs in Actions](/blog/claude-code-github-actions-who-merges/), [the long-polling new-user wait](/blog/long-polling-new-user-wait/) and [the search for Orbi's harness](/blog/searching-for-orbis-harness/) cover other parts of the same pipeline. [Orbi Cloud](/cloud/?ref=blog-merge-wait) runs this loop on your GitHub repositories (Issue → agent PR → separate agent review → merge on green CI), and the [comparisons](/compare/) set it next to other coding agents.
