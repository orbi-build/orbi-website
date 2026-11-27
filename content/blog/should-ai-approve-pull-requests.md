---
title: Should AI approve pull requests? Gate the merge
date: 2026-11-27
summary: Copilot, Claude, Cursor and CodeRabbit can now approve PRs. I think the check belongs at merge time, and I show what Orbi checks across 721 agent PRs.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-should-ai-approve-card.png
mirror: should-ai-approve-pull-requests
---

GitHub Copilot, Claude Approvals, Cursor, and CodeRabbit can all submit approving reviews on pull requests now, once someone turns on a setting, sets up an automation, or commits a policy file. Engineers and tech leads have to decide whether to enable that, or whether agent pull requests should merge with no human click. My answer is to put the check at merge time, and below I show the checks Orbi runs there, 30 days of numbers from my repositories, and when a human approver should stay.

I'm Larry 🍀 Orbi, the creator of [Orbi](https://github.com/orbi-build/orbi), an open-source engine that takes a labelled GitHub Issue, has the Pi coding agent write the change, sends the pull request to a separate review session, and merges it once the checks pass without anyone clicking Approve. I have a stake in this.

To a GitHub branch rule, an approval means one eligible account approved one commit. The rule does not ask what the approver checked or which base the diff was tested against, and Copilot, Claude Approvals and CodeRabbit all say their AI approval can fill that required slot. My view: review should be independent of whoever wrote the code, even when the reviewer is not a person, and a person should own the rules and release acceptance instead of the per-PR click. Orbi's own reviewer is also an AI saying yes; the difference I care about is what that yes is tied to, which the rest of this post spells out. Orbi never submits a GitHub approval. It merges unattended only where the branch requires zero approvals, as my three repositories do; where a branch requires one, it stops and waits for a person.

## Can Copilot approve pull requests? Who else can now

In [Octoverse 2026](https://github.blog/news-insights/octoverse/octoverse-commits-pushes-reach-new-highs-in-2026-as-developers-build-with-agents/) (28 October 2026), GitHub reported: "By September 2026, more than 40% of pull requests on GitHub started with an agent's first draft, up from 17% in March." Of these four tools, two dated their AI approval feature: Copilot on 1 September 2026 and Claude Approvals on 23 November 2026. The Cursor and CodeRabbit docs pages I read have no date. Every one of the four needs someone to turn it on or write a policy file.

| Tool | Default / activation | Plans | Status | Date |
|---|---|---|---|---|
| GitHub Copilot | Off by default | Pro, Pro+, Max, Business, Enterprise | Public preview | 1 Sep 2026 |
| Claude Approvals | Policy file `.claude/approvals.yml` on default branch | Team, Enterprise | Public beta | 23 Nov 2026 |
| Cursor | Turn on "Automatically Approve PRs" in Automations; optional `APPROVAL_POLICY.md` files | Team, Enterprise | Not stated on the pages I read | Undated docs |
| CodeRabbit | Off by default (`reviews.auto_approvals.enabled`) | Essentials, Team, Advanced, Enterprise | Not stated on the pages I read | Undated |

GitHub's [1 September 2026 changelog](https://github.blog/changelog/2026-09-01-copilot-code-review-can-now-approve-pull-requests) says Copilot's approval, once enabled, "counts toward the repository's required-approvals rule." Admins can "choose which file paths Copilot is allowed to approve," and "If new commits are pushed after Copilot approves, its approval is dismissed just like a human reviewer's." The [configuration docs](https://docs.github.com/copilot/how-tos/copilot-on-github/set-up-copilot/configure-code-review) add the enterprise-level default, under which organizations can't turn it on until an enterprise admin allows it ("Organizations cannot enable Copilot approvals. This is the default."), the path limit ("Up to 15 globs are supported."), and the settings "Allow Copilot to approve pull requests" and "Allow Copilot approvals to count toward merge requirements".

Anthropic announced Claude Approvals on 23 November 2026 in [Claude Ship](https://claude.com/blog/introducing-claude-ship). According to the [Claude Ship docs](https://code.claude.com/docs/en/claude-ship) and [Approvals docs](https://code.claude.com/docs/en/approvals.md), "PR Steward and Claude Approvals are in public beta." (PR Steward is another Claude Ship agent; Claude Approvals is the one that approves.) They also note that "Claude Ship is for organizations on Team and Enterprise plans." Activation runs through `.claude/approvals.yml`: "Claude Approvals starts when a connected repository has a policy file on its default branch, and an admin can turn it off." The docs also say that "anyone who can merge a policy file into the default branch can turn Approvals on." A seat is one required approver in the policy file, and "the author can fill a seat, so with `seats: 1` nobody else has to look." Branch rules count Claude's review too: "where a GitHub branch rule requires one approval, Claude's approving review can be that approval". The docs include a warning: "If you use GitHub auto-merge or a merge queue with a policy that doesn't require a person's approval, a change can merge without anyone acting."

In Cursor's [Approval Agents docs](https://cursor.com/docs/approval-agents), "PR Routing & Approval routes pull requests to the right reviewers and can approve low-risk changes." You turn it on inside Cursor Automations, where "Automatically Approve PRs approves low-risk PRs after you configure approval criteria." `APPROVAL_POLICY.md` files in the repository are optional; the agent discovers and applies them before deciding. There is a stop condition as well: "If Bugbot or Security Agents report findings that need human review, PR Routing & Approval will not approve the PR."

CodeRabbit's [Automatic Approvals docs](https://docs.coderabbit.ai/pr-reviews/automatic-approvals.md) put it plainly: "Automatic Approvals is off by default." You turn it on with `reviews.auto_approvals.enabled`, and "CodeRabbit approves only when every approval requirement is met." The same page says "CodeRabbit's approval counts toward your Git provider's required approvals."

## What an approval records, and what it leaves out

GitHub's required-review rule checks account identity. As [GitHub's docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews) put it: "Pull request authors cannot approve their own pull requests."

That checkmark tells you another GitHub account approved a specific commit, while leaving out the conditions that decide whether a merge is safe:

- What was checked. The approval looks identical whether someone verified acceptance criteria or skimmed the title.
- Which base commit the diff was evaluated against. An approval given before `main` moved still counts unless your branch rules also require the branch to be up to date before merging.
- Whether the approval still applies. GitHub stores the commit each review was given on, yet unless your rule dismisses stale approvals, the required-approval count can still include an approval given before later pushes.

In parts of open source, AI-co-authored PRs already merge with little review. A January 2026 study ([arXiv 2601.13754](https://arxiv.org/abs/2601.13754)) reported: "AI-co-authored PRs from non-owners receive the least, with approximately 80% merged without any explicit review." The sample covers only non-owner PRs in open-source repositories, so it says nothing about private repos or maintainers' own PRs, and it is one snapshot, not a trend.

Handing the Approve button to an AI keeps that same account-based control, without tying the merge to the current base, passing CI, and the commit going in.

## What "independent" means in Orbi

In [Orbi](https://github.com/orbi-build/orbi) (`main`, commit `d11224a5`), review runs in a separate process with its own prompt (`prompts/prompt_review.md`) and a fresh session, never continuing the implementer's conversation. The reviewer reads the Issue, trusted comments, human PR feedback, and a frozen base/head SHA pair.

The reviewer returns one of three verdicts: `pass`, `findings`, or `blocked_on_human_decision`. A `pass` cannot carry a Blocker or Major finding, and the verdict names the head commit it reviewed. An unreadable verdict fails as an error and never passes.

That independence is weaker than it sounds in two ways:

- It is not a different company's model by default. Orbi supports a separate review model (`review_pi_provider` and `review_pi_model`), and when unset it uses the implementer's model. I do not claim my repos use a different vendor.
- The reviewer fixes Blocker and Major findings itself in the same session, runs tests, pushes, and returns the final verdict. No second session reviews those in-session fixes.

Both gaps have backstops. Any commit the reviewer pushes still has to pass CI and the merge gate. Findings it cannot fix go back as a fix round (label `ai-fix-needed`) for a fresh cycle. If five review rounds end without a pass, the Issue becomes `ai-blocked` and a person decides. If the same problem repeats two rounds in a row, the reviewer stops and asks a person.

## The gates Orbi checks instead of an approve click

Orbi never submits a GitHub approve review and never passes `--admin`. It merges directly once these checks pass:

- No CI check has failed; while checks are running, Orbi waits for the next poll.
- The PR branch contains the latest base. Orbi fetches the latest base before merging; if the PR is behind and merges cleanly, Orbi merges the base in, pushes, records that merge commit as the head to land, and waits for CI on it. It never merges a head pushed during the same pass. That base merge does not get a second review, while a conflict or a push from anyone else sends the PR back through review.
- The head matches what Orbi last checked. Orbi runs `gh pr merge --match-head-commit <head>`, so if the branch moved after the last check, the merge fails. After a clean base merge, that head went through the merge gate (and CI, where the repository has CI) but was not re-read by the reviewer; the review covered the PR's own changes.
- If a failing check is also failing on the base branch, Orbi pauses the PR and opens a separate fix ticket for the base failure.
- An `ai-blocked` label on the Issue stops the merge even after review and CI pass.

When a branch rule requires an approval (`required_approving_review_count >= 1`), Orbi does not self-approve. It labels the Issue `ai-awaiting-merge`, comments what a person must do, and retries later. My own repos require zero approvals, so I have not hit this path myself; this is how Orbi behaves when a branch requires approvals.

One exception sits outside the PR flow. For releases, Orbi checks that no work is unfinished in the milestone, pushes the version-bump commit straight to the base branch (which only works where the branch rules allow a direct push), and waits for green CI on that pushed commit before it tags and publishes the release.

## 30 days of agent PRs merged with no approval

I checked my three repositories through the GitHub API on 27 November 2026, and none of them requires an approving review. On `orbi-build/orbi-website`, rulesets on `beta` and `main` require a PR with `required_approving_review_count` set to `0`. `orbi-build/orbi-cloud` has a ruleset blocking only deletion and force-push, with no pull-request rule, while `orbi-build/orbi` has no ruleset applying to `main` (empty include list) and no classic protection. Classic branch protection returned "Branch not protected" (404) on all three. The GitHub App `orbi-build` (`app/orbi-build`) opens and merges runner PRs, also checked on 27 November 2026.

Orbi Cloud's production delivery receipts for PRs merged between 28 October 2026 00:00 and 27 November 2026 00:00 (+08) show the following counts, including only PRs the Orbi runner delivered and merged:

| Repo | Merged | 1 review round | 2 rounds | 3+ rounds | Max |
|---|---:|---:|---:|---:|---:|
| `orbi` | 167 | 159 | 6 | 2 | 3 |
| `orbi-cloud` | 462 | 394 | 53 | 15 | 4 |
| `orbi-website` | 92 | 86 | 6 | 0 | 2 |
| Total | 721 | 639 | 65 | 17 | 4 |

Out of 721 PRs, 82 (11.4%) needed more than one review round. A second round starts when the review returns findings it could not fix in its own session, or when a CI check fails at the merge gate. In the public repositories, 14 PRs needed more than one round: 10 because a CI check failed at the merge gate, and 4 because of findings from Orbi's reviewer, which it posts as comments, not as GitHub reviews. None of the 721 needed an approval to merge: the repositories require zero, and Orbi never submits one.

You can reproduce the public subset. GitHub search `repo:orbi-build/orbi is:pr is:merged author:app/orbi-build merged:2026-10-27T16:00:00Z..2026-11-26T16:00:00Z` returns 167 PRs, and the same query on `orbi-build/orbi-website` returns 92. Across those 259 PRs there are 0 GitHub reviews of any kind and 0 approvals (I counted reviews per PR through the GraphQL search API), and the PR counts match the receipts.

What these numbers do and do not show:

- This is not a findings rate. It includes CI retries, and a problem the reviewer fixed in its own session stays inside round 1 and is not counted. I have no per-reason split for the private `orbi-cloud` rounds.
- The table counts merged PRs only.
- These numbers show that the review-and-CI loop sends PRs back for more work, though they do not prove that merging without a human is safe. The safety argument rests on the gates and on acceptance at release time.
- `orbi-cloud` is private, while `orbi` and `orbi-website` are public, so you can open only those 259 PRs.

## Where a person still sits

Dropping per-PR clicks moves human work to the rules, the exceptions and release acceptance. Before merge, a person writes Issues, maintains branch and CI rules, and resolves `ai-blocked` Issues when five review rounds end without a pass, when a finding repeats, or when the reviewer returns `blocked_on_human_decision`.

On `orbi-cloud` (covered in [AI code review bottleneck? Our PRs wait after merge](/blog/ai-code-review-bottleneck/)), promotion to production stays owned by a person. After a tag, `beta` deploys it, and an end-to-end new-user check runs on `beta`. Once I sign off, the promotion merges into `main`, and the production deploy needs a one-click approval.

## When to keep a human approver

I would keep a human approver here:

- Repos with no CI or weak tests. Orbi does not require at least one CI check, so a repo with no CI would merge on review alone and is a bad fit.
- Branches that deploy straight to production with no staging acceptance step. Without a `beta` check and human release sign-off, dropping per-PR approval removes the acceptance gate.
- Policy and governance files. Whoever can merge `.claude/approvals.yml` can turn Claude Approvals on, so changes to policy files and CI rules need a human approver.
- Compliance or team rules requiring a human approval per PR. Keep `required_approving_review_count >= 1` so GitHub enforces it (Orbi parks at `ai-awaiting-merge`), and leave AI approvals off in that repository, because Copilot, Claude or CodeRabbit can fill that count once enabled.

## If you let AI approve pull requests anyway

If you keep required approvals and let an AI tool fill them, check these settings first:

- Limit paths. Copilot supports up to 15 path globs so approvals stay scoped to lower-risk files.
- Do not let the author fill the only seat. With `seats: 1` in Claude Approvals, nobody else has to look.
- Require CI and up-to-date branches before merging, so approvals cover code tested on the current base.
- Dismiss stale approvals on new pushes. Check that your branch rule dismisses stale approvals when new commits arrive, so no approval, human or AI, outlives a new push.
- Check auto-merge and merge queues. If a policy does not require a person's approval, auto-merge or a merge queue can merge a change with nobody acting.

## Check what your branch requires

Rulesets and classic branch protection use separate APIs. To check whether a branch's rulesets require an approval:

```bash
gh api repos/OWNER/REPO/rules/branches/BRANCH \
  --jq '.[] | select(.type=="pull_request") | .parameters.required_approving_review_count'
```

I tested this on 27 November 2026: `orbi-website` `beta` printed `0`; `orbi-cloud` `beta` printed nothing (no `pull_request` rule); a nonexistent branch also printed nothing with exit `0`; a nonexistent repo returned HTTP 404 with exit `1`. Empty output means "no ruleset requires a pull request" (distinct from "zero approvals"), and a typo in the branch name looks identical.

This endpoint covers rulesets only. Check classic branch protection separately:

```bash
gh api repos/OWNER/REPO/branches/BRANCH/protection \
  --jq '.required_pull_request_reviews.required_approving_review_count'
```

Reading classic branch protection may need admin access. On all three of my branches, this returned `{"message":"Branch not protected",...,"status":"404"}` and `gh: Branch not protected (HTTP 404)`, exit `1`.

## Related

See [Claude Ship: what it automates and where it stops](/blog/claude-ship/) on `.claude/approvals.yml`, and [Claude Code in Actions: who presses merge?](/blog/claude-code-github-actions-who-merges/) on where Actions stops. [Auto-merge AI pull requests](/guides/auto-merge-ai-prs/) goes into merge gates, [AI code review bottleneck? Our PRs wait after merge](/blog/ai-code-review-bottleneck/) details release promotion, and [CI gates: what you put in CI is what Orbi guarantees](/guides/ci-gates/) explains which checks to require. [Orbi vs Copilot cloud agent](/compare/github-copilot-coding-agent/) compares the two, and the hosted version is [Orbi Cloud](/cloud/?ref=blog-ai-approve).
