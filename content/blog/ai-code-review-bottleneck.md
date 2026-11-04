---
title: AI code review bottleneck? Our PRs wait after merge
date: 2026-11-04
summary: 847 agent PRs merged into beta in a median 21 minutes. The PRs promoted in the same weeks then waited a median 5.9 hours to reach main, at most 168 h.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-merge-wait-card.png
mirror: ai-code-review-bottleneck
---

The AI code review bottleneck isn't where Orbi's own pipeline loses time: from 14 September 00:00 to 22 October 00:00 2026 (+08), 847 pull requests the Orbi runner opened in Orbi Cloud's repository merged into `beta` in a median 21 minutes (20.6), including CI and every agent review round. Counting every PR that the window's promotions carried into `main`, the production branch, a PR waited a median 5.9 hours on beta after its merge; one in ten waited more than 62 hours, and the longest wait was 168 hours. The slow part was after merge, while finished work waited to be released and promoted. The PR clock starts when a PR opens, so the time an agent spends between taking an Issue and opening the PR isn't in any of these numbers.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi Cloud, the hosted product, is itself built by Orbi: an agent takes each GitHub Issue, opens a pull request into `beta`, and a separate agent session reviews it. It merges when review and CI pass.

Work is grouped into milestones named after versions; when a milestone's tickets are done, a release ticket tags that version on beta. A promotion then merges the tag into `main`, the production branch, and a production deploy follows after a one-click human approval. The orbi-cloud repository is private, so I show aggregate numbers without repository links.

## Measuring the AI code review bottleneck

I counted PRs and promotions merged during the window separately. A promotion is a merge on main's first-parent line whose second parent is on beta, identified by ancestry, regardless of title. The window had 110; two were version-only releases that brought in no PR, so the table uses the other 108. B looks only at PR merges on beta's first-parent line, the moment each PR landed there; release and chore commits don't count. B measures each promotion's oldest wait, so its denominator is promotions, not PRs. The per-PR row counts every PR that a promotion in the window carried (912): the runner's and anyone else's, including a few merged into beta before 14 September. Big batches weigh more there, which is why its median is higher than B's. The script further down reproduces B, not the per-PR row.

| Clock | Definition | Sample | Median | p90 |
|---|---|---|---|---|
| PR open to merge | Runner PR opened → merged into beta, including CI and all review/fix rounds | 847 PRs | 20.6 min | 79.1 min |
| Per PR after merge | PR merged into beta → the promotion that carried it merges into main | 912 PRs | 5.89 h | 62.65 h |
| A: newest tag | Newest tag the promotion carried → merge into main | 108 promotions | 0.77 h | 4.95 h |
| C: oldest tag | Oldest tag the promotion carried → merge into main | 108 promotions | 1.04 h | 8.43 h |
| B: oldest PR | Oldest PR merged into beta but not yet in main → merge into main | 108 promotions | 2.88 h | 12.85 h |

The runner PRs had a median size of 116 changed lines, counting additions plus deletions; 87% changed at most 500 lines. The runner opened 415 of them as the Orbi GitHub App and 432 through my GitHub account; all 432 carry the engine's run marker, and 389 also say "Built by Orbi".

A and C approximate waiting after a release is cut, using tagged commits' committer times; adding back the two version-only promotions leaves both medians unchanged. B adds pre-release waiting. When a promotion brought no new tag, A and C use the latest tag reachable from the promoted commit.

B reached 168.48 hours, about a week, and exceeded 24 hours five times. PRs per promotion had a median of 4, p90 of 15, and a maximum of 162. The 108 promotions carried 159 release tags between them (v0.6.0 to v0.8.11); 27 brought in two or more, and 6 brought in no new tag.

Promotion clocks stop at main's merge, before the approval and deploy.

## What happens between merged and promoted

After a tag, beta deploys it, an end-to-end new-user check runs on beta, and I sign off; then the promotion merges into main. The production deploy is started after that merge. It checks that beta has run the build for at least an hour (the soak, counted from beta's first deploy of it, and skippable for hotfixes with my agreement), then opens an approval ticket. A's median is 0.77 hours, so for a typical promotion the merge into main came before the hour was up, and the rest of the soak falls after the merge, outside every clock here.

The approval step was quick. Approval tickets started on 24 September, so they don't cover the first ten days of the window. The window had 69 of them; three were closed because a newer request replaced them, and the other 66 took a median 1.5 minutes from open to close. That clock covers the approval click and the deploy script. The checking had already happened on beta, before the ticket opened, so it doesn't include my verification and sign-off.

The approval click is the only step I timed on its own; the new-user check and my sign-off happen before the promotion and sit inside its clocks without a separate number. What the clocks do show is that finished PRs pile up behind these steps, and when one thing holds a promotion, everything in the batch waits with it.

## 12 October: the player was ready before the clips

At 16:39 (+08) on 12 October, a video player for the onboarding help popup merged into beta. The six how-to clips it plays were a separate step, to be added to the website repository.

The next release ticket, v0.7.31, made promotion conditional on all six clips being live on orbi.build: "if missing, ship the website first, then promote Cloud".

| Time | Event |
|---|---|
| 17:23 | v0.7.31 tagged |
| 18:22 | v0.7.32 tagged |
| 20:32 | v0.7.33 tagged |
| 22:17 | v0.7.34 tagged |
| 22:25 | Clips landed in the website repository |
| 23:02 | All four versions promoted into main together |

Every tag contained the player, so the same condition held all four. By promotion, the first tag had waited 5.66 hours (clock C), and the player PR itself had been on beta for 6.4 hours. I don't have the minute the clips went live on orbi.build; the promotion came 37 minutes after they reached the website repository. Other changes waited in the same batch, including a checkout fix. The [setup video](/blog/watch-the-six-steps/) shows the flow those clips help explain.

## 21 October: 162 PRs arrived together

On 21 October, a promotion brought 162 PRs and 12 tags into main: v0.7.41, v0.8.0 to v0.8.3 and v0.8.5 to v0.8.11 (v0.8.4 was never tagged). Its oldest PR had waited 168 hours.

Production also had v0.7.40 promoted on 14 October and a hotfix on 17 October. Beta was shipping the v0.8 series; milestone v0.8.5 alone contained 102 tickets. I haven't traced a single item that held that week's promotion.

## Drift alerts and the next step

A scheduled check opens an issue when the oldest commit on beta that main doesn't have is more than 24 hours old and closes it automatically when that clears. Three such backlog alerts opened in the window (a fourth alert, for a database migration mismatch, isn't counted here). Their median lifetime was 16.2 hours; the longest lasted 143 hours, from 16 October 00:58 to 22 October 00:14 (+08). The check is scheduled every six hours (GitHub often starts scheduled runs late), so that alert closed at its first run after the 21 October promotion.

An alert only opens once the oldest commit is already 24 hours old, and closes at the first run after the drift clears, so its lifetime is a lower bound on how long the drift lasted. It cannot establish whether anyone acted while it was open.

A time threshold says "behind" without saying what is stuck. The check I want is event-based: once the oldest unpromoted tag is more than 2 hours old, it has to name what it is waiting for (which deploy, when the soak ends, whose sign-off), and if nobody can, it is stuck. I haven't backtested the 2-hour line on this data.

## How this compares with larger samples

The [DORA 2024 report, page 40](https://dora.dev/research/2024/dora-report/2024-dora-accelerate-state-of-devops-report.pdf), estimates "a 7.2% reduction" in delivery stability and "a 1.5% reduction" in delivery throughput "for every 25% increase in AI adoption". DORA hypothesizes that changelists are growing. The result is correlational.

DORA's throughput measures delivery (how often and how fast changes reach production), so it can fall while PR counts rise. [Faros AI's 2025 study](https://www.faros.ai/blog/ai-software-engineering), covering over 10,000 developers across 1,255 teams, reports 98% more merged PRs, 91% longer PR review time, and 154% larger PRs with high AI adoption. Those are individual and team numbers; at the company level it found no significant correlation between AI adoption and improvement.

In this pipeline each ticket is a small change and a separate agent reviews it, so review stays short. The oldest-PR waits run hours past the PR clock: the batching happens downstream, at release and promotion. This single pipeline proves nothing about those studies' samples.

## Working in small batches past the PR

DORA's [working in small batches capability page](https://dora.dev/capabilities/working-in-small-batches/) says: "Any batch of code that takes longer than a week to complete and check is too big". It also warns that AI tools tempt developers into massive pull requests, and that regrouping small batches before release delays feedback.

Here the PRs were already small. What grew was the set of changes that reached production together.

Looking at the second half of the window, the 39 milestones released from v0.7.14 through v0.8.11 had a median of 3 tickets, and 31 had 7 or fewer. The outliers were v0.7.29 with 78 tickets and v0.8.5 with 102. The promotion that carried v0.7.29 had an oldest-PR wait of 43.3 hours.

I'll try two rules next; neither is in force yet:

1. A milestone must be a batch that can go to production on its own.
2. Don't merge code that needs something that isn't live yet: assets, configuration, or another repository's change. Ship the dependency first, and connect the UI entry point last.

Rule 2 differs from what happened on 12 October. There the player merged first and the check sat at promotion, so every later release queued behind it; under rule 2 the clips would have shipped before the player merged, and nothing would have queued. It follows Martin Fowler's [Keystone Interface](https://martinfowler.com/bliki/KeystoneInterface.html): "Build all the back-end code, integrate, but don't build the user-interface."

I'll check the rules with the median and p90 from the script below over the next four weeks. Since 23 October Orbi promotes by creating a new commit instead of a merge, so that check needs a query adapted to the new style.

## Measure merge wait in your repository

The script below assumes promotions are merge commits on the production branch's first-parent line and that the promoted branch takes PRs as merge commits. With squash-merged PRs or promotions made as new commits it finds nothing and exits 1. Orbi's own promotions switched to new commits on 23 October, which is why my window ends at midnight going into 22 October.

Save this as `~/merge-wait.sh`, outside the repository so it doesn't end up in a commit:

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

Make it executable, fetch, and run it from the repository root with the production branch, the branch you promote from, a start date and an optional end date:

```bash
chmod +x ~/merge-wait.sh
git fetch
TZ=Asia/Shanghai ~/merge-wait.sh origin/main origin/beta 2026-09-14 2026-10-22
```

Both dates mean midnight in the shell's time zone. Git's `--until` includes a merge made exactly at that midnight, so `2026-10-22` covers 21 October plus any merge stamped 00:00:00 on the 22nd (my window had none). `TZ=Asia/Shanghai` makes that midnight +08, as in my window; without an end date the window runs to now. The script prints one row per promotion that brought in at least one PR (date, how many PRs, the oldest one's wait in hours) and a summary line. Merges into main whose second parent isn't on the promoted branch, such as hotfixes, are skipped. It exits 0 on success, 1 for a missing argument or when no matching promotion is found, and 2 for an unknown branch. Run it on a full clone: in a shallow clone, promotions beyond the clone's depth are missing and the summary comes out low without an error (on orbi-cloud, `--depth 300` gave 81 promotions instead of 108). It needs git, awk and the usual coreutils (sort, head, cut, wc, tr). p90 is the value at rank round(0.9 × (n − 1)) + 1, the same rule as the table; tools that interpolate can give a slightly different number.

On orbi-cloud, for this window, the summary line matches the table (the script rounds to one decimal, so 12.85 shows as 12.8):

```text
promotions=108 median_h=2.9 p90_h=12.8 max_h=168.5
```

Squash-merged PRs, tag-only release flows, and promotions recreated as new commits need a different query. If you merge main back into the promoted branch, those merges sit on its first-parent line too and will be counted as PRs; filter them out first.

To see what's waiting right now in a repository that promotes this way:

```bash
git rev-list --count origin/main..origin/beta
git log --first-parent --merges --format='%ct %cI %s' origin/main..origin/beta | sort -n | head -1
```

The first line counts commits on beta that main doesn't have. The second prints the oldest PR merge still waiting (merges from main back into beta would show up here too). No output means no PR is waiting, though release or chore commits may be; a 0 from the first command means nothing is waiting at all. Sort on the epoch seconds in the first field: sorting ISO dates as strings gives the wrong order when commits carry different time zone offsets. I made that mistake in a one-off query while measuring; the script and the table use epoch seconds.

## Limits

This is one agent-built product, one maintainer, and about five weeks. I use the time of each PR's merge commit on beta as "landed on beta"; tag clocks use the tagged commit's committer time. Main's merge time precedes deployment. The approval-ticket and drift-alert numbers depend on this team's process.

## Related

[Who presses merge after Claude Code runs in Actions](/blog/claude-code-github-actions-who-merges/), [the long-polling new-user wait](/blog/long-polling-new-user-wait/) and [the search for Orbi's harness](/blog/searching-for-orbis-harness/) cover other parts of the same pipeline. [Orbi Cloud](/cloud/?ref=blog-merge-wait) runs this loop on your GitHub repositories (Issue → agent PR → separate agent review → merge on green CI), and the [comparisons](/compare/) set it next to other coding agents.
