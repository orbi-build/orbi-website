---
title: How Orbi is built on the Pi coding agent
summary: Orbi turns labelled GitHub issues into merged pull requests and releases, with the Pi coding agent writing the code. This page explains the runner.
lang: en
mirror: pi-coding-agent
published: 2026-10-05
updated: 2026-11-10
---

Orbi is an open-source runner that takes a GitHub issue labelled `ai-ready`, delivers it as a reviewed and merged pull request, and, when you open a release issue, ships the merged work in a tagged release. It runs on your machine, or hosted as Orbi Cloud. All of the coding inside it is done by the [Pi coding agent](https://pi.dev), which Pi's own site calls "a minimal agent harness". Pi is MIT-licensed and made by Earendil ([earendil-works/pi](https://github.com/earendil-works/pi)); Orbi is not part of the Pi project. As of 10 November 2026, Orbi Cloud's sandbox hosts have Pi 1.5.0 installed. The host installation script follows npm's `latest`; the latest release on npm is 1.5.1, published on 9 November 2026 UTC. The production window below spans several Pi versions and cannot be attributed to one version.

To install and run Pi yourself, see the installation section of [the Pi agent harness post](/blog/pi-agent-harness/), tested on Pi 1.5.0.

## The series

If you are new here, start with [Pi + DeepSeek Flash, 169 merged PRs](/blog/orbi-on-pi-coding-agent/) from 5 October.

<!--@series:pi-->

The 169-PR post leads with cost, but it also follows one real issue through every Pi session Orbi started for it, and covers why we stay on Pi and the two incidents that shaped how we run it. The rest of this page is the reference for the same machinery. The 6 October post puts three ways of running Pi through the same kill -9 test: `pi --print`, Pi through the adapter for Vercel's AI SDK, and Pi Durable run on Cloudflare through the Agents SDK's `PiHarness`. The two "Searching for Orbi's harness" posts are earlier benchmarks. There the harness means the prompts and review rules Orbi wraps around the model, not Pi itself; everywhere else on this page, harness means Pi, as on Pi's own site. Those posts cover how we changed those rules and compared models, and their data is not part of the production numbers below.

## Words used on this page

- A **delivery** is one issue taken to a merged pull request.
- A **session** is one Pi coding agent process for one role. Most deliveries need two: one session writes the code and one reviews it. A delivery uses more when review needs another round after problems are found or when a stuck session has to be restarted.
- A **run** is one attempt at a delivery, with an eight-character `run_id` and its own worktree. If the runner has to kill a stuck session, the next session continues the same run in the same worktree. A fresh claim of the same issue, for example after a person moves it from `ai-blocked` back to `ai-ready` when no pull request exists yet, starts a new run with a new `run_id`, on the same branch.
- A **tick** is one pass of the runner. A runner runs as several instances, one per slot (below), each with its own systemd timer (launchd on macOS) that starts a tick every five minutes. Each tick takes one delivery one step further: first a delivery that already has a pull request, then one interrupted earlier (the resume condition: only when no other slot is busy), and only then a new `ai-ready` issue. A Pi session runs inside the tick that started it until it exits, or until the runner kills it after a long silence (see below).
- A **slot** is one issue a runner can work on at the same time, and a runner has a fixed number of them. Slots exist because a tick can take an hour if its session does; an instance's timer does not start a new tick while its previous one is still running, so ticks overlap only across slots, and a later tick leaves an issue alone while its session is still running. Things outside the runner's control, like CI still running, are not waited on; the next tick checks them again.

## In production

Orbi Cloud records the Pi sessions behind its deliveries. From 5 October 2026 at 15:36, the previous cutoff, to 10 November 2026 at 00:00 (both UTC+8), Orbi merged pull requests for 947 issues that also have Cloud usage records. The window uses the pull request merge time recorded by Cloud. Of these deliveries, 853 were in Orbi's own three repositories (`orbi`, `orbi-cloud` and `orbi-website`), 14 were in three other repositories under `orbi-build` (forks and test repositories), and 80 were in 15 repositories under other GitHub accounts.

These 947 deliveries recorded 2,271 Pi sessions, a mean of 2.40 per delivery and a median of 2. One delivery in an external demonstration repository recorded 61 sessions and pulls the mean up, so the median is the better guide. Exactly 713 (75.3%) recorded two sessions: one wrote the code and one reviewed it and passed it (the reviewer may fix problems itself before passing; see review rounds below). Another 23 recorded only one session. These counts can understate the work: Cloud keeps usage for only the latest delivery of each issue, and a later delivery overwrites the previous session count.

The model field records `deepseek-flash` for 946 deliveries and `gemini-3.5-flash-lite` for the 61-session delivery. It takes the first session in each delivery that has a model record, so it does not show which model the review sessions used.

This page's 5 October snapshot covered 21 September to 5 October: 170 deliveries, 375 sessions, and 85% with exactly two sessions. Reharvesting refreshes the collection timestamp and overwrites old records, so today's records cannot reproduce that snapshot on the same basis; the two windows are not a like-for-like comparison. Cost analysis as of 5 October is in [the 169-PR post](/blog/orbi-on-pi-coding-agent/).

## Why Orbi stays on the Pi coding agent

Pi lets Orbi bring its own model through a `models.json` of providers, and everything Orbi hands a session (system prompt, skills, provider and model, the tools switch, the session directory) has a native Pi flag, so no bridge sits in between. Orbi's runner speaks Pi's flags, so when we tried two other coding-agent CLIs, Claude Code and zcode, we wrote a small adapter for each to translate those flags. Both of our adapters lost the `--skill` list while translating, so those sessions ran without Orbi's skills, and we only noticed later. The bug was in the adapters, not in those tools, and with Pi there is no adapter to get wrong. The longer answer is in the 169-PR post, under [why we stay on Pi](/blog/orbi-on-pi-coding-agent/#why-we-stay-on-pi).

## How Orbi starts the Pi coding agent

Every delivery session is a non-interactive `pi --print` process. Each run has one session directory, `.pi-session/` in its worktree (excluded from git, like `.orbi/`, so it never counts as an uncommitted change), and every Pi process in the run writes its own JSONL file there (a `ticket` session uses a temporary directory instead). Those files are what the runner reads for live progress and for failure reports. The system prompt and task context are written to `.pi-session/system-prompt.md` and `.pi-session/task-context.md`; the command line passes their paths as `--system-prompt <file>` and `@<file>`, avoiding a command line too long for Pi to start. The command is built in [`pi_command.py`](https://github.com/orbi-build/orbi/blob/main/src/orbi/pi_command.py). Delivery uses three roles, with two uses of `ticket`:

| Role | Started for | Tools | What it produces |
|---|---|---|---|
| `implement` | an `ai-ready` issue; or an `ai-ready` issue that also has `ai-ops-only` (operations work such as checking logs), with an operations prompt | on | a plan in `.orbi/plan.md`, code changes and tests, ending at a local commit; it never pushes (for ops work, evidence posted on the issue, often with no commit) |
| `review` | each review round on the pull request | on | fixes for what it finds, pushed to the task branch, and one `REVIEW_VERDICT` JSON line naming the commit it ends on, after its own fixes |
| `ticket` (answers in text) | an `ai-ready` issue also labelled `ai-content-only`, which asks for a written answer | off (`--no-tools`) | the text Orbi posts on the issue |
| `ticket` (clarification) | when `clarify_thin_tickets` is on, a check that a new issue has enough detail before it is claimed | only the engine's verdict tool (`--no-builtin-tools`) | a verdict through that tool; an issue held back gets `ai-needs-detail` |

`implement` and `review` sessions start with `--no-extensions`. In Pi that turns off both extension discovery and Pi's built-in extensions, such as MCP and Codemode (Pi's code-execution tool mode), so anything a role needs has to come back through `pi_extensions` in Orbi's config, passed as `--extension`. Orbi Cloud adds Codemode back this way. For `ai-content-only`, the `ticket` role runs with `--no-tools` and has used the same `--no-extensions` and configured `--extension` flags since v0.6.2 ([Issue #1558](https://github.com/orbi-build/orbi/issues/1558), 5 October 2026); before that it started with no extension flags at all, so extensions the runner's OS user had installed could load into it.

The clarification gate uses `--no-builtin-tools --no-extensions --extension <clarify_verdict.ts>`, loading only the engine's own verdict tool and none of the configured extensions. An issue held back by this gate gets `ai-needs-detail`; `/orbi split` can split it into child issues. How Orbi loads and writes extensions is covered in [the extensions post](/blog/pi-extensions-in-production/). Delivery roles can also load the user's own skills: Orbi adds its own with `--skill` but does not pass `--no-skills` to those roles.

A fourth role, `suggest`, is used only by `orbi suggest` and `orbi draft`, outside runner delivery. It has a read-only tool allowlist and runs with `--no-skills`.

Models are chosen in the runner's `orbi.toml`; a repository's own `.github/orbi.toml` cannot set the model keys. A minimal setup, where the two review keys could point at a different model but here use the same one:

```toml
pi_providers = ".orbi/pi-providers.json"   # relative to this config file; Pi's models.json shape
pi_provider = "deepseek"
pi_model = "deepseek-flash"
review_pi_provider = "deepseek"            # optional; falls back to pi_provider
review_pi_model = "deepseek-flash"         # optional; falls back to pi_model
```

Ready-made provider files are in [`templates/pi-providers`](https://github.com/orbi-build/orbi/tree/main/templates/pi-providers). When `pi_provider` and `pi_model` are set, the provider and model for each delivery role are passed as `--provider` and `--model` on its command line (review uses the `review_` keys first, falling back key by key); left unset, Pi silently falls back to the default model in the user's settings (see the incident below). With no `pi_providers` file, those keys must name a model Pi can resolve on its own (a built-in provider, or one in the user's `~/.pi/agent/models.json`). `orbi doctor` prints the configured provider and model when a providers file, `pi_provider` and `pi_model` are all set and the API key resolves. Without a providers file it reports the model as not configured, even though Pi can still run a model it resolves on its own.

## The layers Orbi adds around the Pi coding harness


A Pi process only knows about its own session. Which issue gets a session, what happens to the commit it leaves, and what to do when a session goes silent are all decided by the runner.

### Claiming an issue

When a tick has no open pull request or interrupted run to continue, it scans `ai-ready` issues in priority order: those labelled `p0` first, then `bug`, then the rest, ordered by creation time from oldest to newest within each group. It skips issues already in progress or labelled `ai-blocked`, and issues with an open "blocked by" link to another issue. When `active_milestone` is set (in the repository's `.github/orbi.toml`, or in the runner's own config as a fallback), only that milestone is scanned; once it is closed, a tick that has nothing else to continue moves on to the next open milestone with a higher version number (or, with `auto_next_milestone = false`, posts a notice and waits for you); if no such milestone exists, it drops the filter and scans all `ai-ready` issues again. A runner can work on several issues at once, so a claim lock and per-slot locks make sure no issue is taken twice.

The claimed issue gets a git worktree on a branch named `orbi/<owner>-<repo>-issue-<N>`. On the first claim the branch is cut from the base branch's current commit. The branch name has no run id in it, so a later claim of the same issue fetches the existing branch and continues on it, reusing the pull request if it is still open. Details are in the [workflow docs](https://docs.orbi.build/workflow).

### From commit to pull request

The `implement` session stops at a commit, and the runner does the rest, in this order:

1. Check the output once the session has exited on its own (a session the runner kills is handled under "When a session goes silent" below). For a plain `ai-ready` issue (not an ops issue, see below): if the session left uncommitted changes, with or without commits, the issue stays `ai-in-progress` and a later tick resumes the same run, under the resume condition above; if the worktree is clean and HEAD is still the base branch commit recorded when the run started, the issue goes straight to `ai-blocked`. The same applies if HEAD has advanced but its tree is identical to that base, as with empty commits. A reused branch carrying earlier commits with a different tree does not hit these cases.
2. Merge the base. If the base branch has moved, merge it into the task branch; if that conflicts, abort the merge, carry on without the new base commits, and leave the conflict to the first review session.
3. Push without force, then check that the remote branch now points at the commit just pushed, so a push that silently failed is caught before a pull request exists.
4. Open the pull request with `Fixes #N` and the `run_id` in the body.

### Review rounds

Review always runs in a new Pi session, so the code `implement` wrote is checked by a session that did not write it. The reviewer is allowed to fix what it finds: it fixes Blocker and Major problems in the same session, reruns the tests and pushes to the task branch. Its verdict describes the pull request after those fixes:

- `pass` means no Blocker or Major problems are left.
- `findings` means problems remain that the reviewer could not fix and verify within its session. The issue moves to `ai-fix-needed` and the next tick starts another review round, again in a fresh session, which fixes and reviews again. `implement` does not run again.
- `blocked_on_human_decision` means the reviewer found something only a person can settle.

The review budget is five rounds, and it counts rounds, not sessions. When the five are used up, or on `blocked_on_human_decision`, the issue moves to `ai-blocked`; these cases need a human to move it back to `ai-fix-needed`. Only a budget that was used up starts again at five; after `blocked_on_human_decision`, the rounds left carry over. When a pull request conflicts with a base branch that keeps moving, the next review session merges the base and resolves the conflict; those rounds come out of a separate budget, also five, which is reset only together with the review budget when a used-up review budget is restored. The two automatic recoveries from `ai-blocked` apply to failed base checks turning green and the GitHub App gaining permission to read checks (see the merge gate below).

An optional human acceptance gate runs before any Pi review session starts. It is off by default; a runner enables it with `human_review_gate = true` in `orbi.toml`. When enabled, Orbi posts an acceptance checklist on the issue when the pull request opens. If the checklist has items a machine cannot verify, review pauses before starting a Pi session: the issue returns to `ai-ready`, the slot is released, and no review round is spent. A person confirms those items and adds `ai-human-review`; the next tick reviews and merges as usual. Only a person adds or removes this label; the runner leaves it alone.


### The merge gate

Before merging, the runner reads the pull request's state, mergeability, head commit and check results in a single call, so it never acts on a mix of old and new answers. The merge uses `gh pr merge --match-head-commit <sha>`, so GitHub refuses it if anyone pushed in between. On the normal path, the sha is the commit named by the latest review verdict; every review session names the commit it ends on. A `pass` records that head and a hash of the issue body for later ticks. A head pushed in the current tick is never merged in that tick. On a retry after `ai-awaiting-merge`, the sha is the pull request's current head. The gate handles these cases:

- **Checks still running.** The runner does not wait. Once checks are green, a later tick merges directly if the head and issue body hash still match the recorded pass. Waiting for CI does not start another review session. If the head still matches but the issue body has changed, another review runs.
- **Base branch moved.** If the pull request still merges cleanly, the runner merges the base in, pushes, records the new head in the review record and always defers the merge. A later tick can merge directly once that head's checks are green, provided the head and issue body are unchanged.
- **A check failed on the pull request only.** The issue moves to `ai-fix-needed` and the next review round fixes it, out of the same five-round budget, even if the earlier verdict was `pass`.
- **A check with the same name also fails on the base branch.** The runner treats it as an existing base failure and moves the issue to `ai-blocked`, so the base gets fixed first. It matches checks by name, so this does not prove the pull request is clean. Its comment offers `/orbi fix-base`, which can open an `ai-ready` + `p0` fix issue for each failed check. Each tick rechecks the base; once its checks turn green, the issue automatically moves from `ai-blocked` to `ai-fix-needed` and continues toward merge. After seven days without recovery, the runner posts one reminder and stops polling.
- **A branch protection rule needs a maintainer.** The issue moves to `ai-awaiting-merge`. Retries from there do not start a Pi review; they rerun the merge gate against the pull request's current head, but only when the tick has no work to review, resume or newly claim. After the maintainer acts, merging waits for the first idle tick.

An issue blocked because the GitHub App lacks permission to read checks also resumes automatically once that permission is approved and the App can read them.

More in [CI gates](/guides/ci-gates/) and [auto-merging AI pull requests](/guides/auto-merge-ai-prs/).

### Ops and release issues

An issue labelled `ai-ops-only` gets an `implement` session with a shell but an operations prompt, for jobs like "check how often this error shows up in the logs and post the query and the result". The session posts its evidence as comments on the issue itself. If it makes no commit and leaves the worktree clean, the runner closes the issue instead of opening a pull request; if it does commit, the usual pull request flow takes over.

Releases don't involve Pi: an issue labelled `ai-release` runs a fixed sequence that bumps the version, tags, and publishes the GitHub Release ([from issue to release](/guides/issue-to-release/)).

### The labels

Three labels, added alongside `ai-ready`, choose the path: `ai-content-only` switches to the `ticket` role, `ai-ops-only` keeps `implement` with an operations prompt, and `ai-release` skips Pi. The labels below track delivery status or a required human action (an issue that passes review while its checks run keeps its current label, `ai-pr-opened` or `ai-fix-needed`):

| Label | Meaning |
|---|---|
| `ai-ready` | waiting to be claimed |
| `ai-in-progress` | claimed; a run is working on it |
| `ai-pr-opened` | pull request open, waiting for checks or review |
| `ai-fix-needed` | review, CI, a base conflict or a failed review session left problems; the next tick starts another review round. It also stays on an issue that later passed review and is only waiting for checks (see the merge gate) |
| `ai-awaiting-merge` | passed review, but a protection rule needs a maintainer |
| `ai-human-review` | a person has confirmed acceptance items the machine cannot verify, when `human_review_gate = true`; only a person adds or removes it |
| `ai-needs-detail` | held back by the clarification gate; `/orbi split` can split it into child issues |
| `ai-merged` | done |
| `ai-blocked` | needs a human, except for automatic recovery when failed base checks turn green or the GitHub App can read checks after permission approval |

### Progress comments and the run id

While a session runs, the runner reads its JSONL file every 15 seconds and edits one comment on the issue with the current phase, the last action and the latest test result: right away when something changes, and about every 30 seconds otherwise to refresh the elapsed time. When a run fails for good, the failure comment carries the last 20 session records reduced to their timestamp, record type, sender, tool name and the kinds of content blocks, without message text, plus up to 4,000 characters per section of Pi's stdout, stderr and the test log tail, with local paths stripped. If the full comment exceeds 20,000 characters, those section limits shrink in 500-character steps until it fits.

The `run_id` prefixes every log line of the run and appears in the progress comment, the pull request body and the failure record, so searching the logs and GitHub for it turns up the same run.

### When a session goes silent

A hung Pi session does not exit, so the runner never receives an error from it. It watches whether the session file is still growing, and handles two cases differently: a session stuck in a tool, and a session waiting for the model.

**Stuck in a tool.** After 5 minutes of silence, the runner logs a warning and, in that same pass, sends SIGTERM to Pi's child processes that started before the warning and are still running, such as a test run or a dev server that never exits. The tool call then fails and the model gets an error it can react to. A child that survives gets SIGKILL in the next window, at about 10 minutes of silence. A process running under its own `timeout` command is left alone until its deadline, for up to an hour from when the runner notices it. If killing child processes does not bring output back, or there was nothing to kill (Pi itself is stuck), the runner keeps counting, and this silence watchdog ends the Pi session after about 60 minutes of silence, but not while a valid `timeout` wait lasts. The silence keeps adding up during the wait and the runner only holds off ending the session, so once the wait is over, a session already past the mark is ended soon after.

**Waiting for the model.** When the last record is a tool result and Pi is waiting for the model's next reply, a separate timer applies: the session is ended after 30 minutes without an answer by default. A runner pointed at a llama.cpp server can also probe its `/slots` endpoint, which reports whether the server is working on a request; if every one of the llama.cpp server's own slots (not the runner slots above) shows idle for about a minute, the request was dropped and the session is ended then. Pi's own idle timeout, described in the next section, ends a single silent request after 300 seconds, but Pi can then retry a failed request up to three times by default (`retry.maxRetries`), and an `httpIdleTimeoutMs: 0` setting, which turns that timeout off, can still be in place when no `pi_providers` file is set, or when a trusted project's `.pi/settings.json` sets it. The 30-minute timer only covers silence while the last record is still a tool result. Once a retry leaves an assistant error record behind, any further silence is left to the silence watchdog in the previous paragraph, which ends the session after about 60 minutes.

What happens next depends on the role. A stuck `implement` session leaves the issue `ai-in-progress`; a later tick, once no other slot is busy (the resume condition above), starts a new session in the same worktree under the same `run_id`, told to continue the existing work rather than start over. Repeats of the same failure update one recovery comment on the issue, and after the same failure three times in a row the runner adds a health warning. It does not block the issue or stop resuming; the warning is the signal for a person to step in. A stuck `review` session moves the issue to `ai-fix-needed`, and three identical review failures in a row move it to `ai-blocked`.

## The agent directory and models

When `pi_providers` is set in `orbi.toml`, each run gets its own Pi agent directory at `.orbi/pi-agent/` inside the worktree (a `ticket` session gets one in its temporary directory), passed to Pi through `PI_CODING_AGENT_DIR` and rewritten before every session for that session's role. `.orbi/` is in the worktree's local git exclude file, so a normal `git add` in the session will not pick it up. The directory is generated from the `~/.pi/agent` of the OS user the runner runs as:

- `models.json` merges that user's providers with Orbi's configuration; the configuration wins on the same id.
- `settings.json` starts from that user's settings. If the role has a provider and model configured, `defaultProvider` and `defaultModel` (the model a session starts with) and `enabledModels` (the list Pi cycles through when switching) are all locked to that one model. Otherwise Orbi only removes `enabledModels` entries that name a model the merged `models.json` does not contain. If the settings contain `httpIdleTimeoutMs: 0`, Orbi removes it: zero turns off Pi's idle timeout for model requests, so a request whose first response never arrives waits forever. Without it, Pi uses its 300-second default. These are user-level settings: if Pi trusts the project, the repository's own `.pi/settings.json` is loaded on top and can override them, though `--provider` and `--model` on the command line still win.
- `auth.json` is a symlink to the user's own file.

Session flags control extension loading. The directory still decides which user skills load for delivery roles: Orbi does not pass `--no-skills` to those roles, so the skills under the user's `~/.pi/agent` (or under the generated directory when `pi_providers` is set) load into them; [the extensions post](/blog/pi-extensions-in-production/) has the per-role table.

Without `pi_providers`, Pi uses that user's `~/.pi/agent` directly, and neither the `enabledModels` lock nor the `httpIdleTimeoutMs` cleanup happens. `--no-extensions`, `--provider` and `--model` on the command line (when configured), and the silence watchdog above are unaffected. See [providers](https://docs.orbi.build/providers) and [configuration](https://docs.orbi.build/configuration).

## Where these rules came from

`--no-extensions` on this page came out of an incident: an extension from a Pi package in the `~/.pi/agent` of the runner's OS user intermittently hung runs at startup. A second incident is why every Orbi runner we operate sets `pi_provider` and `pi_model` explicitly and gets checked with `orbi doctor`: one runner without them once fell back to a local model without any error. Both are written up in the 169-PR post, under [two incidents](/blog/orbi-on-pi-coding-agent/#two-incidents-that-shaped-how-we-run-pi).

## Try it

Orbi is open source at [orbi-build/orbi](https://github.com/orbi-build/orbi): install the runner and point it at your repository and your model. [Orbi Cloud](/cloud/?ref=seo-pi-coding-agent) runs the same runner and the same Pi sessions for you. How that compares with driving a coding agent by hand is in [Orbi vs Claude Code](/compare/claude-code/).

## Update log

- 2026-11-10: Updated the production figures to the new window and the Cloud host Pi version to 1.5.0. Corrected the deferred merge path without re-review, automatic recovery from `ai-blocked`, the clarification gate and file-based prompt arguments. Corrected the termination timing: SIGTERM at the 5-minute warning, SIGKILL in the next window at about 10 minutes, and session termination still at about 60 minutes of silence.
- 2026-10-06: Moved the series list to the top and added a pointer to where to start. The model cost estimate counted recorded tokens only.
- 2026-10-05: First version. Pi version on Orbi Cloud runners: 1.0.0.
