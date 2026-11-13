---
title: Devin vs Cursor: what happens to the PRs they open
date: 2026-11-13
summary: Devin vs Cursor: editors, cloud agents and prices from both vendors' pages, plus counts of PRs their GitHub Apps opened in public GitHub repositories.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-devin-vs-cursor-card.png
---

Devin vs Cursor is a choice between two product families that both offer editors and cloud agents: [Devin, from Cognition](https://cognition.com/), includes a cloud coding agent you hand tasks to and [Devin Desktop, the editor called Windsurf until 2 June 2026](https://devin.ai/blog/windsurf-is-now-devin-desktop); Cursor is an [AI code editor](https://cursor.com/docs/agent/overview) with its own [cloud agents](https://cursor.com/docs/cloud-agent). For a developer or team lead deciding which to pay for, I compare the editors, cloud agents and prices from both vendors' pages on 13 November 2026, count what happened to the pull requests (PRs) their GitHub Apps opened in public repositories in October 2026, and give a script to repeat the count on any repository. I did not buy either cloud agent for this post: [Devin Cloud requires Pro at $20/month](https://devin.ai/pricing) and [Cursor Cloud Agents require Premium at $30/month](https://cursor.com/help/account-and-billing/pricing). Both vendors have a $0 plan, but neither $0 plan includes the cloud agent. So I have no hands-on results and make no judgment about which writes better code.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi takes GitHub Issues through implementation, separate review and merge; it competes with the cloud-agent half of both products, so read the last section with that in mind.

## Devin vs Cursor at a glance

| | Devin | Cursor |
|---|---|---|
| Editor | [Devin Desktop](https://docs.devin.ai/desktop/devin-desktop-faq) | [Cursor, with Agent](https://cursor.com/docs/agent/overview) |
| Cloud agent | [Devin Cloud](https://docs.devin.ai/desktop/devin) | [Cloud Agents](https://cursor.com/docs/cloud-agent) |
| Terminal CLI | [Devin CLI](https://docs.devin.ai/cli/introducing-devin-cli) | [Cursor CLI, command `agent`](https://cursor.com/docs/cli/overview) |
| Code review product | [Devin Review](https://docs.devin.ai/work-with-devin/devin-review) | [Bugbot](https://cursor.com/docs/bugbot) |
| Where cloud work runs | [Own VM per session](https://docs.devin.ai/desktop/devin) | [Own VM per agent](https://cursor.com/help/ai-features/background-agents) |
| Start a cloud task | [Web, Slack, API](https://docs.devin.ai/enterprise/deployment/overview); more below | [App, web, editor, integrations, API](https://cursor.com/docs/cloud-agent) |
| Lowest cloud plan | [Pro, $20/month](https://devin.ai/pricing) | [Premium, $30/month](https://cursor.com/help/account-and-billing/pricing) |
| Review before merge, per docs | [“Human engineers review PRs created by Devin before choosing whether to merge the code changes.”](https://docs.devin.ai/essential-guidelines/sdlc-integration) | [“merge-ready PRs”](https://cursor.com/docs/cloud-agent); I found no sentence about who reviews |
| Can the agent merge, per docs | The [GitHub guide](https://docs.devin.ai/integrations/gh) recommends branch protection “before Devin can merge changes” | On [Origin](https://cursor.com/docs/origin), Cursor's own code hosting, [an agent asks a person to approve the merge](https://cursor.com/docs/release-notes/cloud-agents); for GitHub I found no sentence |

Devin's docs point both ways. The SDLC guide has people reviewing and choosing whether to merge; the GitHub guide recommends branch protection “to ensure all required checks pass before Devin can merge changes”, which allows for Devin doing the merge. Cursor's [Cloud Agents release notes](https://cursor.com/docs/release-notes/cloud-agents) for the week of 7 September 2026 describe an agent asking for approval to merge a PR on an Origin repository; I found no equivalent sentence for repositories on GitHub. The [census below](#what-happened-to-the-prs-each-bot-opened) reads GitHub's `merged_by` field to see which account merged in practice.

## Cursor vs Devin Desktop: the editors

Windsurf is now Devin Desktop, following the [2 June 2026 rename](https://devin.ai/blog/windsurf-is-now-devin-desktop). The [FAQ](https://docs.devin.ai/desktop/devin-desktop-faq) calls it “the same IDE, same editor”, so a search for “Devin vs Windsurf” now leads to products under one brand.

[Devin Desktop](https://devin.ai/blog/windsurf-is-now-devin-desktop) is a full IDE with an agent manager. Devin Local succeeded Cascade; Desktop also runs Codex, Claude Agent, OpenCode and other ACP-compatible agents. [Local-only use is supported](https://docs.devin.ai/desktop/devin-desktop-faq). [Free](https://devin.ai/pricing) includes a light agent quota, limited models, unlimited inline edits and unlimited Tab completions.

[Cursor's editor Agent](https://cursor.com/docs/agent/overview) edits code and runs terminal commands. Its [model page](https://cursor.com/help/models-and-usage/available-models) includes Grok 4.7 and Composer 2.5 in plan usage; Free and Plus run Cursor's own models only. [Free has limited usage](https://cursor.com/help/account-and-billing/pricing). [Premium and above unlock Claude, GPT and other third-party models](https://cursor.com/help/account-and-billing/pricing), billed separately at API list price from prepaid credit. For editor work, I'd compare Desktop's external-agent support with Cursor's model access and separate bill. I have not compared either editor hands-on.

## Cursor agent vs Devin: the cloud agents

[Cursor Cloud Agents were formerly called Background Agents](https://cursor.com/docs/cloud-agent).

| | Devin Cloud | Cursor Cloud Agents |
|---|---|---|
| Default execution | [VM per session](https://docs.devin.ai/desktop/devin) | [Dedicated VM per agent](https://cursor.com/help/ai-features/background-agents) |
| Own machines | [Outposts](https://docs.devin.ai/cloud/outposts/overview); agent loop stays in Devin's cloud | [Self-Hosted Machines](https://cursor.com/docs/cloud-agent/self-hosted); agent loop stays in Cursor's cloud |
| Start tasks | [Web, Slack, API](https://docs.devin.ai/enterprise/deployment/overview), [Teams](https://docs.devin.ai/integrations/microsoft-teams), [Linear](https://docs.devin.ai/integrations/linear), [Jira](https://docs.devin.ai/integrations/jira), [`/devin` on an open PR](https://docs.devin.ai/integrations/gh), [CLI](https://docs.devin.ai/cli/cloud), [Desktop](https://docs.devin.ai/desktop/devin), [Automations](https://docs.devin.ai/product-guides/automations) | [iOS, web, desktop, Slack, `@cursor` on a GitHub PR or issue, Linear, API](https://cursor.com/docs/cloud-agent); [Jira on Teams/Enterprise](https://cursor.com/docs/integrations/jira) |
| Review comments | [Replies while session is unarchived](https://docs.devin.ai/integrations/gh) | [Subscriptions resume work on comments](https://cursor.com/docs/cloud-agent/capabilities) |
| CI failures | [Allow the CI bot's comments for automatic fixes](https://docs.devin.ai/product-guides/bot-comment-settings) | [Auto-fix on its own PRs, GitHub Actions only; automatic on Teams/Enterprise](https://cursor.com/docs/cloud-agent/capabilities) |

GitHub issue intake differs: Devin's [ordinary `/devin` integration ignores issue comments](https://docs.devin.ai/integrations/gh); configure an [Automation](https://docs.devin.ai/product-guides/automations) to start from those. On smaller Cursor plans, [ask the agent to monitor and fix CI](https://cursor.com/docs/cloud-agent/capabilities); automatic CI fixing also excludes human commits.

[Devin Review is included in the Free plan; on Teams it draws on shared on-demand credits, and public PRs are free](https://docs.devin.ai/admin/billing/self-serve). Its beta [Autoapprover “does not merge PRs itself”](https://docs.devin.ai/work-with-devin/devin-review). [Bugbot bills by usage](https://cursor.com/docs/bugbot), with an [average run costing $1.00 to $1.50](https://cursor.com/help/account-and-billing/bugbot-usage-based-billing). [Bugbot Autofix spawns a Cloud Agent](https://cursor.com/docs/bugbot) to address findings.

## Cursor vs Devin pricing

[Cursor is now sold as part of The X Subscription](https://cursor.com/help/account-and-billing/pricing), covering Grok, Cursor and X. Pro and Pro+ are legacy plans closed to new customers. Monthly prices on 13 November 2026:

| Plan | Monthly price | Relevant inclusion |
|---|---|---|
| [Devin Free](https://devin.ai/pricing) | $0 | Light local-agent quota; unlimited Tab |
| [Devin Pro](https://devin.ai/pricing) | $20 | Cloud access; full model availability |
| [Devin Max](https://devin.ai/pricing) | $200 | Pro features, higher quota |
| [Devin Teams](https://docs.devin.ai/admin/billing/self-serve) | $80 minimum; $40/full seat | Shared credits |
| [Devin Enterprise](https://docs.devin.ai/admin/billing/enterprise) | Order-form Agent Compute Unit (ACU) rate | No public per-ACU price found |
| [Cursor Free](https://cursor.com/help/account-and-billing/pricing) | $0 | Limited usage; no cloud agent |
| [Cursor Plus](https://cursor.com/help/account-and-billing/pricing) | $8 | Cursor models only; no cloud agent |
| [Cursor Premium](https://cursor.com/help/account-and-billing/pricing) | $30 | Cloud Agents, Bugbot, third-party access |
| [Cursor Super](https://cursor.com/help/account-and-billing/pricing) | $100 | Larger included pool; same access |
| [Cursor Ultra](https://cursor.com/help/account-and-billing/pricing) | $200 | Larger included pool; same access |
| [Cursor Teams](https://cursor.com/help/account-and-billing/pricing) | $30/$100/$200 per seat | Usage follows seat tier |
| [Cursor Enterprise](https://cursor.com/pricing) | Custom | [Pooled usage, admin controls](https://cursor.com/help/account-and-billing/pricing) |

Devin's Teams pages differ: its [pricing page](https://devin.ai/pricing) says “$80/month for team plan + $40/mo per full dev seat”; [billing docs](https://docs.devin.ai/admin/billing/self-serve) say seats and credits can meet the $80 minimum. I'd confirm the checkout total.

[Devin's quota](https://docs.devin.ai/admin/billing/self-serve) is shared by cloud sessions, CLI and Desktop: daily and weekly on Pro/full Teams seats, weekly only on Max. Its size is unpublished; [extra credits use API pricing](https://devin.ai/pricing). [Cursor's weekly pool](https://cursor.com/docs/models-and-pricing) covers its own models across editor, CLI and Cloud Agents; [third-party models cost extra](https://cursor.com/help/the-x-subscription/overview). Neither vendor publishes cloud tasks per plan on these pages, so I can't tell you which is cheaper per merged PR.

## What happened to the PRs each bot opened

I queried GitHub's search API with `is:pr is:public author:app/<slug> created:<range>`, and ran every count on 13 November 2026 between 01:46 and 02:46 UTC (09:46 to 10:46 in UTC+8). Counts reflect each PR's state when queried; open counts will keep changing.

The census covers pull requests in public GitHub repositories whose author is `devin-ai-integration[bot]` or `cursor[bot]`, leaving other product output uncounted. Each bot gets its own table, because the two rows should not be read against each other. The reasons follow the tables.

PRs by `devin-ai-integration[bot]`, created 1 to 31 October 2026 UTC:

| Opened | Merged | Closed unmerged | Still open | Draft (any state) |
|---|---|---|---|---|
| 52,775 | 38,381 (72.7%) | 4,832 (9.2%) | 9,562 (18.1%) | 974 (1.8%) |

PRs by `cursor[bot]`, same window:

| Opened | Merged | Closed unmerged | Still open | Draft (any state) |
|---|---|---|---|---|
| 28,400 | 5,446 (19.2%) | 2,864 (10.1%) | 20,090 (70.7%) | 21,547 (75.9%) |

“Draft (any state)” counts every PR that GitHub's search flagged as a draft when I ran the query, whether it was open, closed or merged. The script further down prints only the drafts that are still open (381 and 18,916), so its draft numbers are smaller. The flag is the state at query time, not at creation: `is:merged draft:true` also returned 275 `devin-ai-integration[bot]` PRs and 441 `cursor[bot]` PRs. I did not establish why those merged records matched the draft filter.

Three quarters of the `cursor[bot]` PRs were flagged draft, and 18,916 of those were still open. Drafts were rare among `devin-ai-integration[bot]` PRs. Cursor's [release notes for the week of 19 October 2026](https://cursor.com/docs/release-notes/cloud-agents) say Cloud Agents “now open pull requests ready for review instead of as drafts, unless you or the task ask for a draft”. The public counts had not moved when I counted: 11,061 of the 14,346 `cursor[bot]` PRs created 1 to 18 October were flagged draft (77.1%), 10,486 of the 14,054 created 19 to 31 October (74.6%), and 5,334 of the 7,107 created 1 to 10 November (75.1%). From the outside I can't tell whether those repositories ask for drafts or the change had not reached them.

This is why I don't rank the two by merge share. Take every October PR and the `devin-ai-integration[bot]` share is the higher one. Count only PRs not flagged draft and the answer depends on the window. For October it is 38,106 of 51,801 (73.6%) for `devin-ai-integration[bot]` and 5,005 of 6,853 (73.0%) for `cursor[bot]`. For the week of 12 to 18 October it is 6,188 of 8,209 (75.4%) and 1,156 of 1,241 (93.2%), and now the `cursor[bot]` share is the higher one. In that week the not-draft filter keeps only 1,241 of 4,709 `cursor[bot]` PRs, the ones somebody had already marked ready. Change the cut and the order flips, so none of these shares is a quality score. They describe the state of public PRs by these two authors in these windows.

For 12 to 18 October 2026 UTC, I fetched every matching PR in full: 13,055, with no sampling.

| Author | PRs | Repositories / owners | Top repository | Top 10 repositories | Repositories with one PR | Repositories with any merge |
|---|---|---|---|---|---|---|
| `devin-ai-integration[bot]` | 8,346 | 1,473 / 979 | 241 (2.9%) | 1,201 (14.4%) | 696 (47.3%) | 1,077 of 1,473 (73.1%) |
| `cursor[bot]` | 4,709 | 812 / 722 | 165 (3.5%) | 1,050 (22.3%) | 339 (41.7%) | 269 of 812 (33.1%) |

Three of the four largest repositories for `devin-ai-integration[bot]` that week belong to two organisations: COG-GTM (two repositories, 373 PRs, none merged) and Cognition-Partner-Workshops (one repository, 113 PRs, 39 merged). Those two organisations' GitHub profiles have no description or website, and I could not confirm who runs them; demo or workshop traffic is a possibility for those three repositories. The fourth is Open-MBEE/OpenSysML, an open-source project with its own website, where 179 of 182 PRs were merged. For `cursor[bot]`, the five repositories with 100 or more PRs that week accounted for 701 PRs; none merged.

Leave out the repositories with 100 or more matching PRs that week, five for each author, and `devin-ai-integration[bot]` has 7,570 PRs, of which 5,941 were merged and 105 were flagged draft. `cursor[bot]` has 4,008 PRs, of which 1,300 were merged and 2,767 were flagged draft.

For the full week again, half of the merged PRs were merged within the times below. These times say nothing about unmerged PRs.

| Author | Merged PRs | Half merged within | A quarter merged within | Merged within one minute |
|---|---|---|---|---|
| `devin-ai-integration[bot]` | 6,211 | 24.6 minutes | 5.1 minutes | 660 (10.6%) |
| `cursor[bot]` | 1,300 | 85.6 minutes | 8.0 minutes | 112 (8.6%) |

I randomly sampled 150 merged PRs per author from that week (seed `20261113`) and read `merged_by` from GitHub's pulls API:

| PR author | User account | Same bot account | `github-actions[bot]` | Other / empty |
|---|---|---|---|---|
| `devin-ai-integration[bot]` | 100 | 48 | 1 | 1 by `cursor[bot]` |
| `cursor[bot]` | 100 | 41 | 8 | 1 empty |

About three in ten sampled merges used the author's own bot account on each side. I don't know whether a person requested the merge or a rule did it; the field records only the account. The docs rows in the first table don't settle who merges on GitHub, and this sample doesn't either: it shows the bot's account doing the merge, and it cannot show who decided. At least one review comment appeared on 29 of the 150 sampled `devin-ai-integration[bot]` PRs and 13 of the 150 `cursor[bot]` PRs; comment counts cannot establish whether human review happened.

Four limits matter:

- Devin's [“Open PRs as” setting](https://docs.devin.ai/integrations/gh) can use a user's account. Those PRs are absent.
- Cursor documents `cursor` authorship for [Automations](https://cursor.com/docs/cloud-agent/automations), without specifying ordinary Cloud Agent authorship. [Bugbot Autofix also starts Cloud Agents](https://cursor.com/docs/bugbot), so this author may include that work.
- Only public repositories are visible. The paying teams whose work is mostly private are outside this census.
- Search counts drift: for the same week, `devin-ai-integration[bot]` merged counts changed from 6,211 to 6,201 ten minutes later.

For context, [Cognition's November 2025 review](https://cognition.com/blog/devin-annual-performance-review-2025) said about two thirds of Devin's PRs were being merged; [Cursor said on 2 September 2026](https://cursor.com/blog/self-hosted-machines) that cloud agents created more than 60% of the PRs it merged internally. Those have different denominators and cannot be compared with each other or this census.

## Count it yourself

This counts basic PR states, with drafts counted only among open PRs. It does not reproduce the non-draft merge shares above.

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

Save it as `agent-pr-count.sh`, then run `chmod +x agent-pr-count.sh`. It needs bash and the GitHub CLI `gh` logged in; I tested gh 2.100.0 and bash 5.3. Do not paste it into an interactive shell: `set -e` can close that shell on its first failure.

Two actual runs follow. `exit=0` records the status printed after execution; the timestamps are UTC.

```text
$ ./agent-pr-count.sh devin-ai-integration 2026-10-01..2026-10-31
app/devin-ai-integration, created 2026-10-01..2026-10-31, is:public, counted 2026-11-13T02:02Z
opened           52775
merged           38381
closed unmerged  4832
still open       9562 (draft: 381)
exit=0

$ ./agent-pr-count.sh devin-ai-integration 2026-10-01..2026-10-31 airbytehq/airbyte   # one repository
app/devin-ai-integration, created 2026-10-01..2026-10-31, repo:airbytehq/airbyte, counted 2026-11-13T02:02Z
opened           453
merged           225
closed unmerged  88
still open       140 (draft: 58)
exit=0
```

The third argument restricts the count to one repository, including a private repository your `gh` login can read.

No matches exits 1 with `no PRs by app/cursor in 2031-01-01..2031-01-31 (is:public)` in my empty-range test. An unknown app slug or repository exits 1 with `gh: Validation Failed (HTTP 422)`; bad credentials exit 1 with `gh: Bad credentials (HTTP 401)`. Failed searches also print the query. A parts/total mismatch prints the warning in the script.

The search API allows 30 requests a minute, so the script sleeps 2.2 seconds between its five queries. Search exposes at most 1,000 results per query; this script reads counts only. My full census scripts are not published on this site. To list every PR, I split time ranges until each slice held 1,000 results or fewer, then paged through each slice.

## Devin or Cursor: which one I'd pick for what

- If I already paid for Claude or GPT API usage, I'd check whether [Desktop's external agents](https://devin.ai/blog/windsurf-is-now-devin-desktop) can use that billing before buying another subscription. [Cursor requires Premium for third-party models and bills their usage separately](https://cursor.com/help/account-and-billing/pricing).
- For Slack/Linear/Jira ticket handoff, I'd trial both cloud agents using the intake routes above. [Cursor's Jira integration requires Teams/Enterprise](https://cursor.com/docs/integrations/jira).
- For GitHub issue comments, [Cursor reads `@cursor`](https://cursor.com/docs/cloud-agent); [Devin needs an Automation](https://docs.devin.ai/product-guides/automations).
- For automatic CI fixing on a small plan, I'd investigate [Devin's CI-bot allowance](https://docs.devin.ai/product-guides/bot-comment-settings). [Cursor requires Teams/Enterprise for automatic fixes](https://cursor.com/docs/cloud-agent/capabilities).
- For work on my own machines, I'd check [Outposts](https://docs.devin.ai/cloud/outposts/overview) and [Self-Hosted Machines](https://cursor.com/docs/cloud-agent/self-hosted). Both keep the agent loop in their vendor's cloud.

Before paying for a team, I'd run the same ten backlog tickets from the same baseline in separate repository copies for one week, then run the script on each repository. I'd check PR authors first; if they differ from these bots, I'd record the PR list manually. I'd read the changes and record the actual bill.

## Where Orbi fits, and where it doesn't

Orbi does not review or merge PRs opened by Devin or Cursor. It handles work starting from your GitHub Issues labelled `ai-ready`: it implements, has a separate session review the change, fixes findings, then merges when review passes and CI is green. When branch protection requires human approval, it stops and waits for you. A release starts when a person requests it.

Orbi has no editor, and its only intake is a GitHub Issue; there is no Slack, Linear or Jira route. The [Devin comparison](/compare/devin/) and [Cursor comparison](/compare/cursor/) cover the handoffs. I'd consider Orbi for an Issue-to-merge workflow; it won't replace either editor.

## Related

- [Cursor alternatives: which one merges the PR for you?](/blog/cursor-alternatives/)
- [Best AI agent for coding: test them on your own repo](/blog/best-ai-agent-for-coding/)
- [Orbi compared with Devin](/compare/devin/)
- [Orbi compared with Cursor](/compare/cursor/)
- [Orbi Cloud](/cloud/?ref=blog-devin-cursor)
