---
title: How Orbi is built on the Pi coding agent
summary: Orbi turns labelled GitHub issues into merged pull requests and releases, with the Pi coding agent writing the code. How the runner around Pi works.
lang: en
mirror: pi-coding-agent
updated: 2026-10-05
---

Orbi is an open-source runner that takes a GitHub issue labelled `ai-ready`, delivers it as a reviewed and merged pull request, and, when you open a release issue, ships the merged work in a tagged release. It runs on your machine, or hosted as Orbi Cloud. All of the coding inside it is done by the [Pi coding agent](https://pi.dev), which Pi's own site calls "a minimal agent harness". Pi is MIT-licensed and made by Earendil ([earendil-works/pi](https://github.com/earendil-works/pi)); Orbi is not part of the Pi project. Orbi Cloud runners currently run Pi 1.0.0.

## Words used on this page

- A **delivery** is one issue taken to a merged pull request.
- A **session** is one Pi coding agent process for one role. Most deliveries need two: one session writes the code and one reviews it. A delivery uses more when review needs another session (another round after problems are found, or the final re-review that runs when the merge had to wait for checks) or when a stuck session has to be restarted.
- A **run** is one attempt at a delivery, with an eight-character `run_id` and its own worktree. If the runner has to kill a stuck session, the next session continues the same run in the same worktree. A fresh claim of the same issue, for example after a person moves it from `ai-blocked`, the waiting-for-a-human label, back to `ai-ready` when no pull request exists yet, starts a new run with a new `run_id`, on the same branch.
- A **tick** is one pass of the runner. A runner runs as several instances, one per slot (below), each with its own systemd timer (launchd on macOS) that starts a tick every five minutes. Each tick takes one delivery one step further: first a delivery that already has a pull request, then one interrupted earlier (the resume condition: only when no other slot is busy), and only then a new `ai-ready` issue. A Pi session runs inside the tick that started it until it exits, or until the runner kills it after a long silence (see below).
- A **slot** is one issue a runner can work on at the same time, and a runner has a fixed number of them. Slots exist because a tick can take an hour if its session does; an instance's timer does not start a new tick while its previous one is still running, so ticks overlap only across slots, and a later tick leaves an issue alone while its session is still running. Things outside the runner's control, like CI still running, are not waited on; the next tick checks them again.

## In production

Orbi Cloud counts the Pi sessions behind every delivery it runs. Between 21 September and 5 October 2026, 170 deliveries have such a count and match a merged pull request: 141 in Orbi's own repositories (`orbi`, `orbi-cloud` and `orbi-website`), 11 in our forks of open-source projects and our test repositories, and 18 in 8 repositories of outside Orbi Cloud users. Merges from before then, and those made by our self-hosted runner before Orbi's own repositories moved to Orbi Cloud, are not in these numbers.

For these 170 deliveries: the model recorded in their Pi session files is DeepSeek's `deepseek-flash` for all of them. They used 375 Pi sessions, 2.21 per delivery, and 144 of the 170 (85%) used exactly two: one session wrote the code and one reviewed it and passed it. In those, no checks were still pending when the merge gate ran, so no re-review (below) was needed. 169 of them also have token counts. Pricing those tokens at DeepSeek's off-peak list price, the lowest of its published rates, the median delivery cost about 8 cents in model usage, so treat that as a floor; the breakdown is in [the first post of this series](/blog/orbi-on-pi-coding-agent/). (Figures as of 5 October 2026. The numbers on this page are refreshed with each new post in the Pi series listed at the bottom.)

## Why Orbi stays on the Pi coding agent

Pi lets Orbi bring its own model through a `models.json` of providers, and everything Orbi hands a session (system prompt, skills, provider and model, the tools switch, the session directory) has a native Pi flag, so no bridge sits in between. Orbi's runner speaks Pi's flags, so when we tried two other coding-agent CLIs, Claude Code among them, we wrote a small adapter for each to translate those flags. Both adapters silently dropped the skills, and we only noticed later. The longer answer is in [the first post of this series](/blog/orbi-on-pi-coding-agent/#why-we-stay-on-pi).

## How Orbi starts the Pi coding agent

Every session is a non-interactive `pi --print` process. Each run has one session directory, `.pi-session/` in its worktree (excluded from git, like `.orbi/`, so it never counts as an uncommitted change), and every Pi process in the run writes its own JSONL file there (a `ticket` session uses a temporary directory instead). Those files are what the runner reads for live progress and for failure reports. The command is built in [`pi_command.py`](https://github.com/orbi-build/orbi/blob/main/src/orbi/pi_command.py). There are three roles:

| Role | Started for | Tools | What it produces |
|---|---|---|---|
| `implement` | an `ai-ready` issue; or an `ai-ready` issue that also has `ai-ops-only` (operations work such as checking logs), with an operations prompt | on | a plan in `.orbi/plan.md`, code changes and tests, ending at a local commit; it never pushes (for ops work, evidence posted on the issue, often with no commit) |
| `review` | each review round on the pull request | on | fixes for what it finds, pushed to the task branch, and one `REVIEW_VERDICT` JSON line naming the commit it ends on, after its own fixes |
| `ticket` (answers in text) | an `ai-ready` issue also labelled `ai-content-only`, which asks for a written answer; also, when `clarify_thin_tickets` is on, a check that a new issue has enough detail before it is claimed | off (`--no-tools`) | the text Orbi posts on the issue |

`implement` and `review` sessions start with `--no-extensions`. In Pi that turns off both extension discovery and Pi's built-in extensions, such as MCP and Codemode, Pi's code-execution tool mode, so anything a role needs has to come back through `pi_extensions` in Orbi's config, passed as `--extension`. Orbi Cloud adds Codemode back this way. The `ticket` role, which runs with no tools, gets no extension flags at all, so it does not get the `--no-extensions` protection the other two roles have: Pi's built-in extensions load, and so can extensions the runner's OS user has installed (which ones is covered under the agent directory below). This is a known gap. Skills are not isolated the same way either: Orbi adds its own with `--skill` but does not pass `--no-skills`, so the user's own skills can load in every role.

Models are chosen in the runner's `orbi.toml`; a repository's own `.github/orbi.toml` cannot set the model keys. A minimal setup, where the two review keys could point at a different model but here use the same one:

```toml
pi_providers = ".orbi/pi-providers.json"   # relative to this config file; Pi's models.json shape
pi_provider = "deepseek"
pi_model = "deepseek-flash"
review_pi_provider = "deepseek"            # optional; falls back to pi_provider
review_pi_model = "deepseek-flash"         # optional; falls back to pi_model
```

Ready-made provider files are in [`templates/pi-providers`](https://github.com/orbi-build/orbi/tree/main/templates/pi-providers). When `pi_provider` and `pi_model` are set, the provider and model for each role are passed as `--provider` and `--model` on its command line (review uses the `review_` keys first, falling back key by key); left unset, Pi silently falls back to the default model in the user's settings (see the incident below). With no `pi_providers` file, those keys must name a model Pi can resolve on its own (a built-in provider, or one in the user's `~/.pi/agent/models.json`). `orbi doctor` prints the configured provider and model when a providers file, `pi_provider` and `pi_model` are all set and the API key resolves. Without a providers file it reports the model as not configured, even though Pi can still run a model it resolves on its own.

## The layers Orbi adds around the Pi harness


A Pi process only knows about its own session. Which issue gets a session, what happens to the commit it leaves, and what to do when a session goes silent are all decided by the runner.

### Claiming an issue

When a tick has no open pull request or interrupted run to continue, it scans `ai-ready` issues in priority order: those labelled `p0` first, then `bug`, then the rest. It skips issues already in progress or labelled `ai-blocked`, and issues with an open "blocked by" link to another issue. When `active_milestone` is set (in the repository's `.github/orbi.toml`, or in the runner's own config as a fallback), only that milestone is scanned; once it is closed, a tick that has nothing else to continue moves on to the next open milestone with a higher version number (or, with `auto_next_milestone = false`, posts a notice and waits for you); if no such milestone exists, it drops the filter and scans all `ai-ready` issues again. A runner can work on several issues at once, so a claim lock and per-slot locks make sure no issue is taken twice.

The claimed issue gets a git worktree on a branch named `orbi/<owner>-<repo>-issue-<N>`. On the first claim the branch is cut from the base branch's current commit. The branch name has no run id in it, so a later claim of the same issue fetches the existing branch and continues on it, reusing the pull request if it is still open. Details are in the [workflow docs](https://docs.orbi.build/workflow).

### From commit to pull request

The `implement` session stops at a commit, and the runner does the rest, in this order:

1. Check the output once the session has exited on its own (a session the runner kills is handled under "When a session goes silent" below). For a plain `ai-ready` issue (not an ops issue, see below): if the session left uncommitted changes, with or without commits, the issue stays `ai-in-progress` and a later tick resumes the same run, under the resume condition above; if the worktree is clean and HEAD is still the base branch commit recorded when the run started, the issue goes straight to `ai-blocked`. A reused branch that already carries earlier commits does not hit this case.
2. Merge the base. If the base branch has moved, merge it into the task branch; if that conflicts, abort the merge, carry on without the new base commits, and leave the conflict to the first review session.
3. Push without force, then check that the remote branch now points at the commit just pushed, so a push that silently failed is caught before a pull request exists.
4. Open the pull request with `Fixes #N` and the `run_id` in the body.

### Review rounds

Review always runs in a new Pi session, so the code `implement` wrote is checked by a session that did not write it. The reviewer is allowed to fix what it finds: it fixes Blocker and Major problems in the same session, reruns the tests and pushes to the task branch. Its verdict describes the pull request after those fixes:

- `pass` means no Blocker or Major problems are left.
- `findings` means problems remain that the reviewer could not fix and verify within its session. The issue moves to `ai-fix-needed` and the next tick starts another review round, again in a fresh session, which fixes and reviews again. `implement` does not run again.
- `blocked_on_human_decision` means the reviewer found something only a person can settle.

The review budget is five rounds, and it counts rounds, not sessions. When the five are used up, or on `blocked_on_human_decision`, the issue moves to `ai-blocked` and waits for a human, who moves it back to `ai-fix-needed`. Only a budget that was used up starts again at five; after `blocked_on_human_decision`, the rounds left carry over. When a pull request conflicts with a base branch that keeps moving, the next review session merges the base and resolves the conflict; those rounds come out of a separate budget, also five, which is reset only together with the review budget when a used-up review budget is restored.


### The merge gate

Before merging, the runner reads the pull request's state, mergeability, head commit and check results in a single call, so it never acts on a mix of old and new answers. The merge uses `gh pr merge --match-head-commit <sha>`, so GitHub refuses it if anyone pushed in between. On the normal path, the sha is the commit named by the latest review verdict; every review session, including a re-review, names the commit it ends on. When the base branch has moved, it is the runner's own merge commit instead; on a retry after `ai-awaiting-merge`, it is the pull request's current head. The gate handles these cases:

- **Checks still running.** This can happen when a reviewer has just pushed a fix. The runner does not wait; later ticks skip the merge, and once the checks finish, a fresh review session looks at the final commit before it merges. The deferred pass and that re-review count as one round between them. So a reviewer's own fixes get a second look whenever their checks are still running at the gate; if the checks have already finished, they merge without one.
- **Base branch moved.** If the pull request still merges cleanly, the runner merges the base in, pushes, and pins the merge to that new commit of its own instead. If its checks are then still running, the case above applies.
- **A check failed on the pull request only.** The issue moves to `ai-fix-needed` and the next review round fixes it, out of the same five-round budget, even if the earlier verdict was `pass`.
- **A check with the same name also fails on the base branch.** The runner treats it as an existing base failure and moves the issue to `ai-blocked`, so the base gets fixed first. It matches checks by name, so this does not prove the pull request is clean.
- **A branch protection rule needs a maintainer.** The issue moves to `ai-awaiting-merge`. Later retries from there do not start a Pi review; they rerun the merge gate against the pull request's current head.

More in [CI gates](/guides/ci-gates/) and [auto-merging AI pull requests](/guides/auto-merge-ai-prs/).

### Ops and release issues

An issue labelled `ai-ops-only` gets an `implement` session with a shell but an operations prompt, for jobs like "check how often this error shows up in the logs and post the query and the result". The session posts its evidence as comments on the issue itself. If it makes no commit and leaves the worktree clean, the runner closes the issue instead of opening a pull request; if it does commit, the usual pull request flow takes over.

Releases don't involve Pi: an issue labelled `ai-release` runs a fixed sequence that bumps the version, tags, and publishes the GitHub Release ([from issue to release](/guides/issue-to-release/)).

### The labels

Three labels, added alongside `ai-ready`, choose the path: `ai-content-only` switches to the `ticket` role, `ai-ops-only` keeps `implement` with an operations prompt, and `ai-release` skips Pi. The status labels that track where an issue is are (an issue that passes review while its checks run keeps its current label, `ai-pr-opened` or `ai-fix-needed`):

| Status label | Meaning |
|---|---|
| `ai-ready` | waiting to be claimed |
| `ai-in-progress` | claimed; a run is working on it |
| `ai-pr-opened` | pull request open, waiting for checks or review |
| `ai-fix-needed` | review, CI, a base conflict or a failed review session left problems; the next tick starts another review round. It also stays on an issue that later passed review and is only waiting for checks (see the merge gate) |
| `ai-awaiting-merge` | passed review, but a protection rule needs a maintainer |
| `ai-merged` | done |
| `ai-blocked` | needs a human; the runner will not touch it again on its own |

### Progress comments and the run id

While a session runs, the runner reads its JSONL file every 15 seconds and edits one comment on the issue with the current phase, the last action and the latest test result: right away when something changes, and about every 30 seconds otherwise to refresh the elapsed time. When a run fails for good, the failure comment carries the last 20 session records reduced to their timestamp, record type, sender, tool name and the kinds of content blocks, without message text, plus the first 4,000 characters of each of Pi's stdout and stderr and the tail of the test log, with local paths stripped.

The `run_id` prefixes every log line of the run and appears in the progress comment, the pull request body and the failure record, so searching the logs and GitHub for it turns up the same run.

### When a session goes silent

A hung Pi session does not exit, so the runner never receives an error from it. It watches whether the session file is still growing, and handles two cases differently: a session stuck in a tool, and a session waiting for the model.

**Stuck in a tool.** The runner logs a warning after 5 minutes of silence. At about 10 minutes it sends SIGTERM to Pi's child processes that started before that warning and are still running, such as a test run or a dev server that never exits. The tool call then fails and the model gets an error it can react to. A child that survives gets SIGKILL on the next poll, about 15 seconds later. A process running under its own `timeout` command is left alone until its deadline, for up to an hour from when the runner notices it. If killing child processes does not bring output back, or there was nothing to kill (Pi itself is stuck), the runner keeps counting, and this silence watchdog ends the Pi session after about 60 minutes of silence, but not while a valid `timeout` wait lasts. The silence keeps adding up during the wait and the runner only holds off ending the session, so once the wait is over, a session already past the mark is ended soon after.

**Waiting for the model.** When the last record is a tool result and Pi is waiting for the model's next reply, a separate timer applies: the session is ended after 30 minutes without an answer by default. A runner pointed at a llama.cpp server can also probe its `/slots` endpoint, which reports whether the server is working on a request; if every one of the llama.cpp server's own slots (not the runner slots above) shows idle for about a minute, the request was dropped and the session is ended then. Pi's own idle timeout, described in the next section, ends a single silent request after 300 seconds, but Pi can then retry a failed request up to three times by default (`retry.maxRetries`), and an `httpIdleTimeoutMs: 0` setting, which turns that timeout off, can still be in place when no `pi_providers` file is set, or when a trusted project's `.pi/settings.json` sets it. The 30-minute timer only covers silence while the last record is still a tool result. Once a retry leaves an assistant error record behind, any further silence is left to the silence watchdog in the previous paragraph, which ends the session after about 60 minutes.

What happens next depends on the role. A stuck `implement` session leaves the issue `ai-in-progress`; a later tick, once no other slot is busy (the resume condition above), starts a new session in the same worktree under the same `run_id`, told to continue the existing work rather than start over. Repeats of the same failure update one recovery comment on the issue, and after the same failure three times in a row the runner adds a health warning. It does not block the issue or stop resuming; the warning is the signal for a person to step in. A stuck `review` session moves the issue to `ai-fix-needed`, and three identical review failures in a row move it to `ai-blocked`.

## The agent directory and models

When `pi_providers` is set in `orbi.toml`, each run gets its own Pi agent directory at `.orbi/pi-agent/` inside the worktree (a `ticket` session gets one in its temporary directory), passed to Pi through `PI_CODING_AGENT_DIR` and rewritten before every session for that session's role. `.orbi/` is in the worktree's local git exclude file, so a normal `git add` in the session will not pick it up. The directory is generated from the `~/.pi/agent` of the OS user the runner runs as:

- `models.json` merges that user's providers with Orbi's configuration; the configuration wins on the same id.
- `settings.json` starts from that user's settings. If the role has a provider and model configured, `defaultProvider` and `defaultModel` (the model a session starts with) and `enabledModels` (the list Pi cycles through when switching) are all locked to that one model. Otherwise Orbi only removes `enabledModels` entries that name a model the merged `models.json` does not contain. If the settings contain `httpIdleTimeoutMs: 0`, Orbi removes it: zero turns off Pi's idle timeout for model requests, so a request whose first response never arrives waits forever. Without it, Pi uses its 300-second default. These are user-level settings: if Pi trusts the project, the repository's own `.pi/settings.json` is loaded on top and can override them, though `--provider` and `--model` on the command line still win.
- `auth.json` is a symlink to the user's own file.

For the `ticket` role this decides which user extensions can load: without `pi_providers`, everything installed in the user's `~/.pi/agent`; with it, automatic discovery moves to the generated directory, but extensions and packages the user's `settings.json` declares (by absolute or `~/` path, or as packages) can still load. Either way, `ticket` has no allowlist.

Without `pi_providers`, Pi uses that user's `~/.pi/agent` directly, and neither the `enabledModels` lock nor the `httpIdleTimeoutMs` cleanup happens. `--no-extensions`, `--provider` and `--model` on the command line (when configured), and the silence watchdog above are unaffected. See [providers](https://docs.orbi.build/providers) and [configuration](https://docs.orbi.build/configuration).

## Where these rules came from

`--no-extensions` on this page came out of an incident: an extension from a user-installed Pi package intermittently hung runs at startup. A second incident is why every Orbi runner we operate sets `pi_provider` and `pi_model` explicitly and gets checked with `orbi doctor`: one runner without them once fell back to a local model without any error. Both are written up, with the rest of our notes on running Pi unattended, in [the first post of this series](/blog/orbi-on-pi-coding-agent/#two-incidents-that-shaped-how-we-run-pi).

## The series

<!--@series:pi-->

## Try it

Orbi is open source at [orbi-build/orbi](https://github.com/orbi-build/orbi): install the runner and point it at your repository and your model. [Orbi Cloud](/cloud/?ref=seo-pi-coding-agent) runs the same runner and the same Pi sessions for you. How that compares with driving a coding agent by hand is in [Orbi vs Claude Code](/compare/claude-code/).

## Update log

- 2026-10-05: First version. Pi version on Orbi Cloud runners: 1.0.0.
