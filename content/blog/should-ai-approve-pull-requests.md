---
title: Should AI approve pull requests? Move the gate
date: 2026-11-27
summary: Copilot, Claude Approvals, Cursor, and CodeRabbit can now approve PRs. Why the approve button is the wrong gate, Orbi's merge checks, and 30 days of data.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-should-ai-approve-card.png
---

GitHub Copilot, Claude Approvals, Cursor, and CodeRabbit can now submit an approving review on a pull request, and each needs someone to enable a setting or commit a policy file before it approves anything. This post is for engineers and tech leads deciding whether to turn that on, or whether agent pull requests should merge with no human click. Below is my position, the gates Orbi checks instead of an approve click, 30 days of numbers from my repositories, and when to keep a human approver.

I'm Larry 🍀 Orbi, the creator of Orbi. [Orbi](https://github.com/orbi-build/orbi) is an open-source engine that takes a labelled GitHub Issue, has the Pi coding agent write the change, sends the pull request to a separate review session, and merges it when the checks pass, without anyone clicking Approve. So I have a stake here.

The approve button records that someone clicked; it does not record what was checked, against which base, or at which commit. Platforms now let an AI fill that button so it counts toward required approvals. So should AI approve pull requests? My position is that review should be independent of the side that wrote the code, while the reviewer does not have to be a person; a person should own the rules and acceptance rather than the per-PR click. Orbi does not use GitHub approvals at all: my three repositories require zero approvals, and the gate moves to the side that merges.

## Who can approve a pull request now

In [Octoverse 2026](https://github.blog/news-insights/octoverse/octoverse-commits-pushes-reach-new-highs-in-2026-as-developers-build-with-agents/) (28 October 2026), GitHub reported: "By September 2026, more than 40% of pull requests on GitHub started with an agent's first draft, up from 17% in March." Three of the four tools below dated their AI approval feature in 2026 (Cursor's blog post on 5 March, Copilot on 1 September, Claude Approvals on 23 November). CodeRabbit's docs page carries no date. Each one needs someone to turn it on or write a policy file.

| Tool | Default / activation | Plans | Status | Date |
|---|---|---|---|---|
| GitHub Copilot | Off by default | Pro, Pro+, Max, Business, Enterprise | Public preview | 1 Sep 2026 |
| Claude Approvals | Policy file `.claude/approvals.yml` on default branch | Team, Enterprise | Public beta | 23 Nov 2026 |
| Cursor | Policy file `APPROVAL_POLICY.md` | Not stated on the pages I read | Not stated on the pages I read | 5 Mar 2026 (blog) |
| CodeRabbit | Off by default (`reviews.auto_approvals.enabled`) | Essentials, Team, Advanced, Enterprise | Not stated on the pages I read | Undated |

GitHub's [1 September 2026 changelog](https://github.blog/changelog/2026-09-01-copilot-code-review-can-now-approve-pull-requests): "By default, Copilot will not approve pull requests." Once enabled, "When enabled, Copilot can submit an approval that counts toward the repository's required-approvals rule." Availability: "This feature is available in public preview to GitHub Copilot Pro, Pro+, Max, Business, and Enterprise plans." Admins "choose which file paths Copilot is allowed to approve." On updates, "If new commits are pushed after Copilot approves, its approval is dismissed just like a human reviewer's." The [configuration docs](https://docs.github.com/copilot/how-tos/copilot-on-github/set-up-copilot/configure-code-review) state the enterprise default ("Organizations cannot enable Copilot approvals. This is the default."), path limits ("Up to 15 globs are supported."), and settings "Allow Copilot to approve pull requests" and "Allow Copilot approvals to count toward merge requirements".

Anthropic announced Claude Approvals on 23 November 2026 in [Claude Ship](https://claude.com/blog/introducing-claude-ship). Per the [Claude Ship docs](https://code.claude.com/docs/en/claude-ship) and [Approvals docs](https://code.claude.com/docs/en/approvals.md): "PR Steward and Claude Approvals are in public beta." and "Claude Ship is for organizations on Team and Enterprise plans." Activation uses `.claude/approvals.yml`: "Claude Approvals starts when a connected repository has a policy file on its default branch, and an admin can turn it off." That means "anyone who can merge a policy file into the default branch can turn Approvals on." Under seat rules, "the author can fill a seat, so with `seats: 1` nobody else has to look." With branch rules, "where a GitHub branch rule requires one approval, Claude's approving review can be that approval". The docs add a warning: "If you use GitHub auto-merge or a merge queue with a policy that doesn't require a person's approval, a change can merge without anyone acting."

Cursor's [Approval Agents docs](https://cursor.com/docs/approval-agents): "PR Routing & Approval routes pull requests to the right reviewers and can approve low-risk changes." It is driven by `APPROVAL_POLICY.md` that you write, and "If Bugbot or Security Agents report findings that need human review, PR Routing & Approval will not approve the PR." Cursor's [5 March 2026 blog post](https://cursor.com/en/blog/automations) summarizes it as: "Low-risk PRs get auto-approved."

CodeRabbit's [Automatic Approvals docs](https://docs.coderabbit.ai/pr-reviews/automatic-approvals.md): "Automatic Approvals is off by default." Controlled by `reviews.auto_approvals.enabled`, "CodeRabbit approves only when every approval requirement is met."

## What an approval records, and what it leaves out

GitHub's required-review rule checks account identity. Per [GitHub's docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews): "Pull request authors cannot approve their own pull requests."

All an approving review records is that another GitHub account clicked Approve. It leaves out the conditions that decide whether a merge is safe:

- What was checked. The checkmark is identical whether someone verified acceptance criteria or skimmed the title.
- Which base commit the diff was evaluated against. An approval given before `main` moved still counts, unless your rules also require the branch to be up to date before merging.
- Which head commit was approved. Without stale-approval dismissal, later pushes inherit an older click.

Even with human reviewers, review on agent PRs is already sparse in parts of open source. A January 2026 study ([arXiv 2601.13754](https://arxiv.org/abs/2601.13754)) covering open-source projects found on AI-co-authored PRs from non-owners: "AI-co-authored PRs from non-owners receive the least, with approximately 80% merged without any explicit review." That scope is narrow (open-source repos, AI-co-authored PRs from non-owners only), so it does not describe private company repos or maintainers, though it shows how quickly review thins under higher volume.

Letting an AI click Approve keeps the same weak abstraction: a boolean flag on an account identity, rather than verifiable checks bound to a fresh base, passing CI, and an exact commit SHA.

## Independent review without a person: what "independent" means in Orbi

In [Orbi](https://github.com/orbi-build/orbi) (`main`, commit `d11224a5`), review runs as a separate process with its own prompt (`prompts/prompt_review.md`) and a fresh session. It does not continue the implementer's conversation. It reads the Issue, trusted comments, human PR feedback, and a frozen base/head SHA pair.

The reviewer emits one of three verdicts: `pass`, `findings`, or `blocked_on_human_decision`. A `pass` cannot carry a Blocker or Major finding, and the verdict names the head commit it reviewed. An unreadable verdict is an error, never a `pass`.

That independence is weaker than it sounds in two ways:

- It is not a different company's model by default. Orbi supports a separate review model (`review_pi_provider` and `review_pi_model`), and when unset it uses the implementer's model. I do not claim my repos use a different vendor.
- The reviewer fixes Blocker and Major findings itself in the same session, runs tests, pushes, and emits the final verdict. Those in-session fixes are not reviewed by a second session.

Backstops limit both gaps. Any commit the reviewer pushes still has to pass CI and the merge gate below. Findings it cannot fix go back as a fix round (label `ai-fix-needed`) for a fresh cycle. Review is capped at five rounds, after which the Issue becomes `ai-blocked` and a person decides. If the same problem repeats two rounds in a row, the reviewer stops and asks a person.

## The gates Orbi checks instead of an approve click

Orbi never submits a GitHub approve review. It merges directly and never passes `--admin`. At merge time it enforces five checks:

- No CI check has failed; while checks run, Orbi waits for the next poll.
- The PR branch contains the latest base. Orbi fetches the latest base before merging; if the PR lacks it, Orbi merges base in, pushes, and waits for CI on that new head. It never merges a head pushed in the same pass.
- The head matches the reviewed commit. Orbi runs `gh pr merge --match-head-commit <head>`, so only the reviewed commit can land.
- A check also failing on the base branch pauses the PR and opens a separate fix ticket for the base failure.
- An `ai-blocked` label on the Issue stops the merge even after review and CI pass.

When a branch rule requires an approval (`required_approving_review_count >= 1`), Orbi does not self-approve. It labels the Issue `ai-awaiting-merge`, comments what a person must do, and retries later. This path has not been triggered in my own repos because they require zero approvals; I am describing Orbi's behavior, rather than my experience.

One exception: not every change goes through a PR. For releases, Orbi pushes the version-bump commit straight to the base branch, gated on green CI on that commit and no unfinished work in the milestone.

## 30 days of agent PRs merged with no approval

Checked on 27 November 2026 via the GitHub API, none of my three repositories requires an approving review. `orbi-build/orbi-website` rulesets on `beta` and `main` require a PR with `required_approving_review_count` set to `0`; `orbi-build/orbi-cloud` has a ruleset blocking only deletion and force-push, with no pull-request rule; `orbi-build/orbi` has no ruleset applying to `main` (empty include list) and no classic protection. Classic branch protection returned "Branch not protected" (404) on all three. Runner PRs are opened and merged by the GitHub App `orbi-build` (`app/orbi-build`), checked on 27 November 2026.

From Orbi Cloud's production delivery receipts for PRs merged 28 October 2026 00:00 to 27 November 2026 00:00 (+08), counting only PRs the Orbi runner delivered and merged:

| Repo | Merged | 1 review round | 2 rounds | 3+ rounds | Max |
|---|---:|---:|---:|---:|---:|
| `orbi` | 167 | 159 | 6 | 2 | 3 |
| `orbi-cloud` | 462 | 394 | 53 | 15 | 4 |
| `orbi-website` | 92 | 86 | 6 | 0 | 2 |
| Total | 721 | 639 | 65 | 17 | 4 |

82 of 721 (11.4%) needed at least one more round after a review sent findings back. None of the 721 needed an approval to merge: the repositories require zero, and Orbi never submits one.

You can reproduce the public subset. GitHub search `repo:orbi-build/orbi is:pr is:merged author:app/orbi-build merged:2026-10-27T16:00:00Z..2026-11-26T16:00:00Z` returns 167 PRs, and the same query on `orbi-build/orbi-website` returns 92. Across those 259 PRs there are 0 GitHub reviews of any kind and 0 approvals, matching the receipts above.

Four caveats matter here:

- A review round counts only findings the reviewer could not fix in-session. Fixes it made itself stay inside round 1, so 11.4% undercounts how often review found something.
- The table counts merged PRs only.
- These numbers show that review does work; they do not prove that merging without a human is safe. The safety argument rests on the gates and on acceptance at release time.
- `orbi-cloud` is private, while `orbi` and `orbi-website` are public, so readers can open only those 259 PRs.

## Where a person still sits

Dropping per-PR clicks moves a person to two places: rules and release acceptance. Upstream, a person writes Issues, maintains branch and CI rules, and resolves `ai-blocked` Issues when review hits five rounds, repeats a finding, or returns `blocked_on_human_decision`.

Downstream on `orbi-cloud` (covered in [AI code review bottleneck? Our PRs wait after merge](/blog/ai-code-review-bottleneck/)), promotion to production stays human-owned: after a tag, `beta` deploys it, an end-to-end new-user check runs on `beta`, I sign off, the promotion merges into `main`, and the production deploy needs a one-click approval. Acceptance happens on the running release instead of per-PR diffs.

## When to keep a human approver

Keep a human approver in four cases:

- Repos with no CI or weak tests. Orbi does not require at least one CI check; a repo with no CI would merge on review alone, making a testless repo a bad fit.
- Branches that deploy straight to production with no staging acceptance step. Without a `beta` check and human release sign-off, dropping per-PR approval removes the acceptance gate.
- Policy and governance files. In Claude Approvals, anyone who can merge `.claude/approvals.yml` into the default branch can turn Approvals on; changes to policy files and CI rules warrant a human approver.
- Compliance or team rules requiring a human approval per PR. Keep `required_approving_review_count >= 1` so GitHub enforces it (Orbi parks at `ai-awaiting-merge`).

## If you turn on AI approvals anyway

If you keep required approvals and let an AI tool fill them, check five settings first:

- Limit paths. Copilot supports up to 15 path globs so approvals stay scoped to lower-risk files.
- Do not let the author fill the only seat. In Claude Approvals, `seats: 1` lets the author fill the seat so nobody else has to look, and anyone who can merge `.claude/approvals.yml` to the default branch can turn Approvals on.
- Keep CI required and require branches to be up to date with the base before merging, so approvals refer to code tested on the current base.
- Dismiss stale approvals on new pushes. Copilot's approval is dismissed on new commits like a human's; verify your rule dismisses stale approvals for humans too.
- Audit auto-merge and merge queues. If a policy does not require a person's approval, auto-merge or a merge queue can merge a change with nobody acting.

## Check what your branch requires

Rulesets and classic branch protection use separate APIs. To check whether a branch's rulesets require an approval:

```bash
gh api repos/OWNER/REPO/rules/branches/BRANCH \
  --jq '.[] | select(.type=="pull_request") | .parameters.required_approving_review_count'
```

Tested on 27 November 2026: `orbi-website` `beta` printed `0`; `orbi-cloud` `beta` printed nothing (no `pull_request` rule); a nonexistent branch also printed nothing with exit `0`; a nonexistent repo returned HTTP 404 with exit `1`. Empty output means "no ruleset requires a pull request", rather than "zero approvals", and a typo in the branch name looks identical.

This endpoint covers rulesets only. Check classic branch protection separately:

```bash
gh api repos/OWNER/REPO/branches/BRANCH/protection \
  --jq '.required_pull_request_reviews.required_approving_review_count'
```

Reading classic branch protection may need admin access. On all three of my branches, this returned `{"message":"Branch not protected",...,"status":"404"}` and `gh: Branch not protected (HTTP 404)`, exit `1`.

## Related

Read [Claude Ship: what it automates and where it stops](/blog/claude-ship/) on `.claude/approvals.yml`, [Claude Code in Actions: who presses merge?](/blog/claude-code-github-actions-who-merges/) on where Actions stops, [Auto-merge AI pull requests](/guides/auto-merge-ai-prs/) on merge gates, and [AI code review bottleneck? Our PRs wait after merge](/blog/ai-code-review-bottleneck/) on release promotion. [CI gates: what you put in CI is what Orbi guarantees](/guides/ci-gates/) covers which checks to require, and [Orbi vs Copilot cloud agent](/compare/github-copilot-coding-agent/) compares the two. The hosted version is [Orbi Cloud](/cloud/?ref=blog-ai-approve).
