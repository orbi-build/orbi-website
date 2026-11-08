---
title: Cursor alternatives: editors, agents and who merges
date: 2026-11-07
summary: Cursor alternatives checked against their docs on 7 Nov 2026, grouped by editor or background agent, and by who merges and releases.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-cursor-alternatives-card.png
mirror: cursor-alternatives
---

Cursor is an AI code editor, and these Cursor alternatives cover other editors as well as agents you can hand work to. If you're choosing what to switch to, check Cursor's [pricing](https://cursor.com/pricing) as of 7 November 2026: Plus is $8/month with the restriction "Only Grok models are available on this plan"; third-party models need Premium ($30/month) or higher, or Teams, plus separate billing at "API list price". Every alternative below was checked against its own docs on that same date.

I'm Larry 🍀 Orbi, the creator of Orbi.

Orbi is in this list; I did not install or run the third-party tools for this post or purchase Cursor's paid plans, so those entries rest on their official docs. Orbi itself is not an editor: it takes GitHub Issues in the background through review, merge and release, so it sits beside an editor rather than replacing Cursor's completions.

## Why people look for a Cursor alternative

The [pricing page](https://cursor.com/pricing) makes the model restriction worth checking before you choose a plan:

| Cursor plan | Monthly price | Relevant limits or access |
|---|---|---|
| Free | $0 | Limited agent and chat requests |
| Plus | $8 | Grok models only |
| Premium | $30 | Cloud agents, Bugbot code review and third-party models become available; third-party usage is billed separately |
| Super | $100 | Includes Premium features; third-party usage stays separate |
| Ultra | $200 | Includes Super features; third-party usage stays separate |
| Teams | From $30/user | Cloud agents, Bugbot and third-party model access |

Third-party model usage is outside the listed subscription prices. Prices exclude applicable taxes and fees. If model access is why you are considering a switch, compare the subscription and the separate usage charge together.

## The yardstick

I use four questions to choose between these tools:

- Where do you work: in an editor or terminal, or by handing a task to a background agent?
- Which models can you use, and do you pay through a subscription, usage billing or your own API key?
- Does the workflow open a pull request (PR), or leave that step to you?
- Who merges the reviewed change, and who starts and publishes a release?

## Cursor alternatives for your editor or terminal

### GitHub Copilot

[GitHub Copilot's plans](https://github.com/features/copilot/plans) include Free with 2,000 completions per month, Pro at $10/month and Pro+ at $39/month. Assigning work to Copilot to create a PR starts with Pro; Free does not include that handoff. One subscription covers editor completions and GitHub task assignment, but read the cloud agent's approval restrictions below before you count on the second.

### Devin Desktop, formerly Windsurf

[Devin Desktop](https://devin.ai/desktop) is the new name for Windsurf. Its docs describe sessions on your machine or in Devin Cloud, with the same context carried between them. [Devin Free](https://devin.ai/pricing) costs $0 and includes a light agent quota and unlimited Tab completions; Pro is $20/month and adds Devin Cloud access.

### Zed

[Zed Personal](https://zed.dev/pricing) is $0, with unlimited use through your own API keys or external agents, so on that plan the cost that matters is your model provider's bill. Zed is open source. Pro costs $10/month and includes $5 of tokens.

### Cline

[Cline](https://docs.cline.bot/cline-overview) has an editor extension, including support for Cursor, plus a CLI and desktop app. Its [source is Apache-2.0 licensed](https://github.com/cline/cline). Model access can use Cline usage billing, ClinePass at $9.99/month, or bring your own key (BYOK). The overview says, "Every action requires your explicit approval."

### Claude Code

[Claude Code](https://code.claude.com/docs/en/overview) is a terminal agent with IDE extensions for VS Code and JetBrains; the overview includes an install link for Cursor itself. Most surfaces require a Claude subscription or Anthropic Console account. For the account and workflow comparison, read [Cursor vs Claude Code](/blog/cursor-vs-claude-code/).

## Cursor alternatives that work in the background

| Background option | Who merges and releases? |
|---|---|
| Cursor cloud agents | A person merges, or approves the agent's merge on an Origin repository; releasing stays with your workflow |
| Copilot cloud agent | People approve and merge the PR; releasing stays with your workflow |
| Devin Cloud | Merge and release ownership is unconfirmed in this comparison |
| Orbi | The runner merges after review and CI; a person starts the release, then Orbi tags and publishes |

### Cursor's own cloud agents, as a baseline

Before switching products, compare [Cursor's cloud agents](https://cursor.com/docs/cloud-agent). They require Premium or higher and run in isolated cloud VMs. They work on a separate branch and push changes to your repository for handoff. Origin is Cursor's own code hosting, listed on its pricing page as "Code hosting via Origin" from Premium up. On a repository hosted there, an agent can ask a person to approve a merge and then land that exact commit, according to the [cloud agents release notes](https://cursor.com/docs/release-notes/cloud-agents) for the week of 7 September 2026; the docs do not describe a merge without that approval, and for a GitHub repository they describe the branch handoff. If all you want is execution off your own machine, this route lets you stay on Cursor.

### GitHub Copilot cloud agent

[Copilot cloud agent access](https://github.com/features/copilot/plans) starts at Pro ($10/month), with Pro+ at $39/month. Its [security documentation](https://docs.github.com/en/copilot/concepts/agents/coding-agent/risks-and-mitigations) says it "cannot approve or merge a pull request". By default, a person with write access must review the code and click "Approve and run workflows" before workflows run. The person who requested the PR cannot submit the approving PR review. That suits a team that wants the agent to stop at a PR and has reviewers on hand for those approvals. The [Orbi vs GitHub Copilot coding agent](/compare/github-copilot-coding-agent/) page compares the two side by side.

### Devin Cloud

[Devin Cloud is available from Pro at $20/month](https://devin.ai/pricing). The [Desktop documentation](https://devin.ai/desktop) describes moving sessions between your machine and the cloud while retaining context. [Orbi vs Devin](/compare/devin/) covers what else Devin's docs say.

### Orbi

Label a GitHub Issue `ai-ready` and Orbi runs [Pi](/guides/pi-coding-agent/), an open-source coding agent, to implement it. A second Pi session that did not write the code reviews it, and the Orbi runner (on your machine if you self-host, or Orbi Cloud's hosted runner) merges the reviewed commit once your CI passes. No person signs off on that merge by default; if your branch protection requires a human approval, Orbi stops at `ai-awaiting-merge` and the Issue comment names the action. A person starts a release by commenting `/orbi milestone <version>` on an Issue; Orbi then opens the release ticket, tags and publishes. Self-hosted [Orbi](https://github.com/orbi-build/orbi) is free under AGPL-3.0 with your own model key. [Orbi Cloud](/cloud/?ref=blog-cursor-alt) is the hosted version; its monthly and yearly plans are listed on that page. It fits a team that wants Issues carried through review and merge while a person still decides when to release. If you want inline completions, Orbi does not replace Cursor.

## One Issue to a release, timed

In [orbi-build/orbi#2123](https://github.com/orbi-build/orbi/issues/2123), Orbi stopped updating a GitHub Actions variable in repositories it delivers to: `ORBI_ACTIVE_MILESTONE`. The change became [PR #2124](https://github.com/orbi-build/orbi/pull/2124) and was included in [v0.7.38](https://github.com/orbi-build/orbi/releases/tag/v0.7.38). All times below are UTC on 6 November 2026.

| Step | Time | Who |
|---|---|---|
| Open Issue #2123 | 00:03:43 | xqliu |
| Add `ai-ready` | 00:03:45 | xqliu |
| Claim the Issue (`ai-in-progress`) | 00:06:34 | orbi-build[bot] |
| Open PR #2124 | 00:50:00 | app/orbi-build |
| Merge PR #2124 | 01:05:15 | app/orbi-build |
| Type `/orbi milestone v0.7.38` on Issue #2125 | 02:52:01 | xqliu |
| Open release Issue #2126 | 02:56:25 | app/orbi-build |
| Publish v0.7.38 | 03:11:32 | orbi-build[bot] |

`app/orbi-build` and `orbi-build[bot]` are two spellings GitHub uses for the same Orbi GitHub App.

From the `ai-ready` label, the Issue was claimed after 2 min 49 s, the PR opened after 46 min 15 s, and the PR merged after 61 min 30 s. A person typed the release command about 1 h 47 min after the merge, as a comment on #2125, the Issue where Orbi asked to confirm the next milestone; the record does not say why the gap was that long. From that command to the published release took 19 min 31 s.

The [merge comment on the Issue](https://github.com/orbi-build/orbi/issues/2123#issuecomment-6673829957) records Orbi's review verdict: "pass, no findings" in 1 round. The PR's CI checks passed: [tests in 6m31s](https://github.com/orbi-build/orbi/actions/runs/42139673204/job/127636550350), [macos-compatibility in 6m51s](https://github.com/orbi-build/orbi/actions/runs/42139673569/job/127636551517) and [link in 4s](https://github.com/orbi-build/orbi/actions/runs/42139672848/job/127636552151).

The PR touched 19 files (+230 −308). The source change is +7 −77 across 5 files under `src/orbi/`, and the rest is tests, a CI triage tool and the docs in English and Chinese. It is not an average or a prediction for another task.

To reproduce the timeline from GitHub, use this script. Paste it into a file and run it with bash; it needs the GitHub CLI logged in.

```bash
#!/usr/bin/env bash
# Print the Issue -> PR -> release timeline of one Orbi delivery (UTC timestamps from GitHub).
set -euo pipefail
R=orbi-build/orbi
gh issue view 2123 -R $R --json number,title,author,createdAt,closedAt \
  -q '"issue  #\(.number) opened \(.createdAt) by \(.author.login) closed \(.closedAt) | \(.title)"'
gh api "repos/$R/issues/2123/events" --paginate \
  -q '.[] | select(.event=="labeled") | "label  \(.label.name) \(.created_at) by \(.actor.login)"'
gh pr view 2124 -R $R --json number,author,createdAt,mergedAt,mergedBy,headRefOid \
  -q '"pr     #\(.number) opened \(.createdAt) by \(.author.login) merged \(.mergedAt) by \(.mergedBy.login)"'
gh api "repos/$R/pulls/2124/reviews" -q '.[] | "review \(.state) \(.submitted_at) by \(.user.login) commit \(.commit_id[0:7])"'
gh issue view 2125 -R $R --json comments \
  -q '.comments[] | select(.body|startswith("/orbi milestone")) | "human  \(.body) \(.createdAt) by \(.author.login) on #2125"'
gh issue view 2126 -R $R --json number,author,createdAt,closedAt \
  -q '"issue  #\(.number) (release task) opened \(.createdAt) by \(.author.login) closed \(.closedAt)"'
gh release view v0.7.38 -R $R --json tagName,publishedAt,author \
  -q '"release \(.tagName) published \(.publishedAt) by \(.author.login)"'
```

The PR reviews call prints nothing for this delivery: Orbi posts its review verdict as Issue comments. An empty reviews line therefore does not mean the separate review session was skipped. If an Issue is missing, `set -euo pipefail` makes the script stop with a non-zero exit status.

## Free and open-source Cursor alternatives

Free plans and open-source licenses answer different budget questions:

| Tool | What is free or open source | What to budget for |
|---|---|---|
| [Zed](https://zed.dev/pricing) | Open-source editor; Personal is $0 with your own keys or external agents | Your model access; Pro is $10/month with $5 of tokens |
| [Cline](https://github.com/cline/cline) | Apache-2.0 source; BYOK is supported | Model usage through your key or Cline's billing options |
| [GitHub Copilot Free](https://github.com/features/copilot/plans) | 2,000 completions per month | PR assignment requires Pro or above |
| [Devin Free](https://devin.ai/pricing) | $0 tier with a light agent quota and unlimited Tab completions | Devin Cloud starts with Pro at $20/month |
| [Orbi](https://github.com/orbi-build/orbi) | Self-hosted software is free under AGPL-3.0 with your own model key | Your model usage, or an [Orbi Cloud](/cloud/?ref=blog-cursor-alt) plan |

## How to choose

- Completions while you edit: evaluate Copilot, Devin Desktop or Zed.
- Keep your editor and change the agent: try Cline or Claude Code's IDE extension, including inside Cursor.
- Hand off background work: compare Cursor cloud agents and Copilot cloud agent; consider Devin Cloud for moving sessions between local and cloud work.
- Have the runner merge after review and CI, then publish when you send a release command: evaluate Orbi.

## Related

- [Orbi vs Cursor](/compare/cursor/)
- [Cursor vs Claude Code](/blog/cursor-vs-claude-code/)
- [Orbi Cloud](/cloud/?ref=blog-cursor-alt)
