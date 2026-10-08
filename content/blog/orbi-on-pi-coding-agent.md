---
title: Pi + DeepSeek Flash, 169 merged PRs: 8–16¢ each
date: 2026-10-05
summary: In model tokens at DeepSeek off-peak prices, 169 merged deliveries cost a median of $0.082 each. One issue through four Pi sessions; what Pi leaves out.
lang: en
author: Lawrence Liu
image: /img/blog-orbi-on-pi-card.png
mirror: orbi-on-pi-coding-agent
series: pi
---

Orbi takes a GitHub issue labelled `ai-ready` and hands back a reviewed, merged pull request. The code itself is normally written by the [Pi coding agent](https://pi.dev), which Orbi starts from the command line, mostly as an implementer that makes the change or as a reviewer that checks the pull request. Everything around those Pi processes belongs to Orbi's runner, a scheduler that polls GitHub: picking the issue, keeping the implementer and the reviewer in separate sessions, deciding what merges, and recovering when something hangs. Pi is MIT-licensed and made by Earendil ([earendil-works/pi](https://github.com/earendil-works/pi)). Orbi has no connection to Earendil.

I'm Lawrence Liu, and I maintain Orbi. Orbi is open source, and Orbi Cloud hosts the same runner. Cloud learns about merges from GitHub's webhooks, not from the runner, and only for repositories with the Orbi GitHub App installed. From its first record on 16 September to 15:36 on 5 October 2026 (UTC+8), it has 373 merged pull requests. That isn't every merge Orbi made: runs on my own machine are only partly in it. Of the 373, 20 were in 9 repositories that belong to Cloud users; almost all the rest are in Orbi's own repositories, because Orbi is built by Orbi. 169 deliveries have Cloud usage records with token counts, all written in Pi sessions, and those are the numbers in this post.

This is the first post on Orbi's architecture in our Pi series (the two harness posts linked at the end belong to the same series). It follows one issue through every Pi session Orbi started for it, then covers the command line, what 169 deliveries cost (a median of $0.082 each in tokens, at DeepSeek's off-peak list prices), and the parts of the job Pi leaves to you. Three terms come up a lot. A **Pi session** is one `pi --print` process. A **run** is one attempt by the runner at an issue; it has one `run_id`, it can start several Pi sessions, and resuming it keeps the same `run_id` (as #1554 did when I requeued it). A new attempt gets a new one. A **delivery** is an issue that ended in a pull request Orbi merged.

## One issue, start to finish

The issue is [orbi#1554](https://github.com/orbi-build/orbi/issues/1554), and I picked it because the bug was in how Orbi talks to Pi. Pi reads models and API keys from a file called `models.json`. Orbi writes its own copy into each run's worktree, under `.orbi/pi-agent/`, so a run can use different provider settings without touching the machine's Pi configuration.

Orbi used to resolve `$VAR` key references and write the real keys into that copy. The directory is gitignored, so no key was ever committed, but every worktree had them in plain text. A comment in our code, written on 4 September when we were on Pi 0.84.4, said Pi couldn't interpolate the references. Pi's docs already said it could in 0.84.3, a release earlier: `apiKey` accepts `$ENV_VAR` and `${ENV_VAR}`. The fix was to keep the reference and let Pi resolve it. I filed the issue at 03:21 UTC+8, labelled it `ai-ready` and went to bed.

<figure class="post-media">
<img src="/img/diagrams/orbi-pi-flow.svg" alt="One issue through Orbi and Pi, in three lanes. GitHub: the issue is labelled ai-ready, CI checks run, and the issue ends as ai-merged. Orbi runner: claim the issue and create a worktree from the base commit recorded at claim time, push and open the PR, and a merge gate that checks CI, the review verdict and whether the base is current. Pi sessions: an implement session (plan, code, tests, commit) and a review session that reviews, fixes and ends with a verdict line. A red dashed loop sends red CI to a new review session that fixes it, and a failed gate leads to ai-blocked, where a person decides." width="1050" height="470">
</figure>

The issue's timeline, all on Monday 5 October (UTC+8). Note the first row: `main` was already red before I filed #1554.

| Time | What happened |
|---|---|
| 00:20 | Two docs tests on `main` started failing, one in `test_docs_site.py` and one in `test_docs_i18n.py`. Orbi's CI workflow opened [orbi#1552](https://github.com/orbi-build/orbi/issues/1552) for them automatically. |
| 03:21 | Issue filed and labelled `ai-ready`. |
| 03:26 | Orbi's runner labelled #1552 `ai-needs-detail`, asking for more detail before working on it. |
| 03:31 | The runner claimed #1554 and started the implementer session (run `598a0fb3`). |
| 03:43 | The implementer had committed the fix, but its own test run failed in the docs tests that had been failing on `main` since 00:20. The runner posted that result on the issue, pushed the branch and opened [PR #1555](https://github.com/orbi-build/orbi/pull/1555) anyway, leaving the failure to a reviewer. |
| 03:47 | CI failed in the same two tests. At 03:51 the runner started a reviewer session to fix it. |
| 04:08 | CI failed again in the same two tests, this time on a commit in which the reviewer had added a docs note about the change. The note had nothing to do with the failure and is part of the merged PR. At 04:11 the runner started another reviewer session. |
| 04:22 | That session passed the PR, and the runner moved to merge. The merge gate saw the PR's checks still red and looked at the same checks on the base commit: `main` was failing them too, `tests` and `macos-compatibility`, both of which run the full test suite, including those docs tests. The gate doesn't merge a PR with failing checks, so the runner labelled the issue `ai-blocked`. |
| 12:06 | Orbi delivered #1552, which fixed both tests on `main`. |
| 13:39 | I swapped `ai-blocked` for `ai-fix-needed`, which put #1554 back in the queue. (`ai-fix-needed` rather than `ai-ready`, because the PR was still open.) |
| 13:41 to 13:58 | A new reviewer session merged the new `main` into the branch, reviewed the PR and passed it with no findings. The runner merged the PR. |

<figure class="post-media">
<img src="/img/blog-orbi-on-pi-blocked.webp" alt="Orbi's blocked comment on orbi#1554: Orbi blocked, waiting on a human decision. Reason: the independent review of PR #1555 failed: delivery gate: main is already red on check macos-compatibility, fix main first." width="1200" height="331">
<figcaption>What the runner posted at 04:22. Orbi files merge-gate failures under the review step, hence "independent review failed"; the PR's own change was fine.</figcaption>
</figure>

The two reviewer sessions between 03:51 and 04:22 were wasted. They tried to fix a failure that came from `main`, which already had its own issue, and the fix that finally landed came from that issue. The runner only compares a PR's failing checks with the base in the merge gate, after a review. It could have known much earlier: at 03:31 it claimed #1554 from a `main` that had been red for three hours, with #1552 open about it. Holding the claim, or comparing at 03:43 or at the first red CI, would have saved both reviewer sessions. Orbi doesn't do any of that yet.

The nine hours after 04:22 were mostly on me. #1552 sat in `ai-needs-detail` until I added the detail at 11:33, and Orbi merged the fix at 12:06. Then #1554 waited for me to requeue it: `ai-blocked` is never cleared automatically, because the next step might be rewriting or closing the issue rather than retrying. No Pi session ran for #1554 between 04:22 and 13:41.

The issue used 4 Pi sessions, 1 implementer and 3 reviewer. Orbi Cloud's usage records put it at 51 minutes of Pi runtime, 164 model requests, 108 thousand output tokens and 8.4 million cache-read tokens, all on `deepseek-flash` (DeepSeek-V4.1-Flash). All four sessions ran outside DeepSeek's peak hours, so at list prices the whole issue cost about $0.12.

## How Orbi calls Pi

Each Pi session is one `pi --print` process; Cloud's runners now run Pi 1.0, released on 1 October. Without the prompt text, the command looks like this (from [`src/orbi/pi_command.py`](https://github.com/orbi-build/orbi/blob/main/src/orbi/pi_command.py)):

```text
pi [--no-tools] [--no-extensions [--extension <allowlisted>]] \
   [--skill <path> ...] \
   [--provider <p>] [--model <m>] [--thinking <level>] \
   --print --session-dir <run dir> \
   --system-prompt <role prompt> <issue context>
```

The extension allowlist comes from Orbi's config. On Cloud it has one entry, Pi's own Codemode extension, which is why implementer and reviewer sessions keep Codemode despite `--no-extensions`. The runners' Pi settings also switch the Codemode tool on, which the extension alone doesn't do (more under "If you run Pi unattended yourself").

The implementer gets tools, Orbi's delivery skills (including `tdd-dev`, which writes a failing test before the code) and the implementation model. Before it touches code it writes `.orbi/plan.md` with the goal, the files it looked at, the tasks and the commands it will verify with. Then it edits code in the issue's worktree, runs the tests and stops at a commit.

The reviewer is a separate session on the pull request. Its job is to review one diff and fix that diff until it can merge, which is why the reviewer at 03:51 pushed a commit. Orbi leaves two skills off its command line: `tdd-dev`, which would steer it into implementing the task from scratch, and `review-fix-loop` (review, fix, review again until clean), which would start a second review loop inside the session when the runner already runs one. The reviewer can use its own model (`review_pi_provider` and `review_pi_model`), and it has to end with a single `REVIEW_VERDICT {...}` JSON line, which is what Orbi parses.

A third role, ticket, answers a question on an issue and changes nothing. It runs with `--no-tools` and gets no extension flags at all, so unlike the other two it loads whatever Pi extensions the OS user has installed. Cloud's runner users have none, but on a self-hosted machine that's a gap: an extension like the one in the first incident below would load there too. Skills have a similar gap. Orbi doesn't pass `--no-skills`, so skills in the OS user's skill directories load in every role, and so do a repository's once Pi trusts the project, including the ones Orbi keeps from the reviewer.

Every run gets its own session directory, `.pi-session/` in the worktree, and Pi writes the session there as JSONL, one record per message or tool result. When a run fails, Orbi attaches a structured summary of up to the last 20 records to the failure comment (time, role, tool, without the content), so you can see what the session was doing when it stopped. While a run is going, Orbi also tails the file to keep one progress comment on the issue up to date ([orbi#24](https://github.com/orbi-build/orbi/issues/24)):

<figure class="post-media">
<img src="/img/blog-orbi-on-pi-progress.webp" alt="Orbi's progress comment on orbi#1554: PR #1555 merged with review_rounds=1; role: review; tests: 4034 passed, 11 skipped in 7 minutes 38 seconds; run details with run_id 598a0fb3, phase codemode, elapsed 16m 57s, the branch name and the Pi session id." width="1200" height="731">
<figcaption>The progress comment on orbi#1554, captured on 5 October 2026.</figcaption>
</figure>

The role, PR link, test result and review count come from the runner. The last-activity time, session id and `phase` come from the session file. Despite the name, `phase` records the last tool call; `codemode` is Pi 1.0's Codemode, where the model writes a short script that strings several tool calls together. A PR gets at most 5 review rounds before Orbi stops and asks a person. Review rounds aren't the number of reviewer sessions started. A round only counts once the runner records a review result for it. Of the two earlier reviewer sessions, one ended while CI was still running, and the other passed the PR but was stopped at the merge gate by the red-`main` block before the runner recorded the round. Neither was recorded, so the 13:41 review was round 1. `elapsed` is the last session's time, not the issue's.

On Orbi Cloud a thin wrapper around the real `pi` binary also rereads the session file after each session and adds up the token usage. That's where the next section's numbers come from. Self-hosted Orbi doesn't have the wrapper, but the session files are the same.

## What 169 deliveries cost

The wrapper only exists on Cloud and started recording in mid-September (its earliest row is from 16 September), and Orbi's own repositories were delivered by the open-source runner on my machine until they moved onto Cloud (orbi on 22 September, orbi-cloud and orbi-website on 2 October). So the usage records cover fewer deliveries than the 373 merges above. At 15:36 on 5 October (UTC+8) they had 170 deliveries, 169 of them with token counts, all on `deepseek-flash`.

The records keep one row per issue and branch: a resumed run adds to it, but a new attempt on the same branch overwrites it. Cloud also keeps one row per attempt, so I checked what that hides: 7 of the 169 had an earlier attempt. Three of those have token counts, and adding them back leaves the cost median and 90th percentile unchanged ($0.082 and $0.22); the other four weren't recorded, so their cost is unknown. The three do move the totals, covered after the table. All the other rows of the table are for the last attempt.

141 of the 169 were in Orbi's own three repositories, 11 in our organization's forks and test repositories, and 17 in 7 repositories that belong to Cloud users. Those 17 had a median cost of $0.090, close to the overall figure.

Each row of the table is calculated on its own, so the median column isn't one particular delivery. The cost row ranks each delivery's own total; it isn't the rows above added up.

| Per delivery | Median | 90th percentile | #1554 |
|---|---|---|---|
| Pi sessions | 2 | 3 | 4 |
| Pi runtime, all sessions | 35 minutes | 89 minutes | 51 minutes |
| Model requests | 107 | 235 | 164 |
| Output tokens | 69,502 | 188,121 | 107,977 |
| Input tokens, not cached | 132,641 | 302,859 | 231,688 |
| Cache-read tokens | 6.72 million | 19.1 million | 8.41 million |
| Cost, off-peak | $0.082 | $0.22 | $0.12 |

The typical delivery took two sessions, usually one implementer and one reviewer. #1554's four sessions put it above the 90th percentile; its runtime and requests weren't.

Costs use DeepSeek's [published `deepseek-flash` prices](https://api-docs.deepseek.com/quick_start/pricing), as listed on our [cost page](/cost/): $0.003 per million tokens for a cache hit, $0.15 for a cache miss and $0.60 for output. On weekdays other than Chinese public holidays, 09:00–12:00 and 14:00–18:00 UTC+8 (01:00–04:00 and 06:00–10:00 UTC), prices double. All 169 deliveries together came to $18.45 at off-peak prices. (The $0.082 median now on the [cost page](/cost/) is this same sample: the 169 deliveries Cloud recorded between 16 September and 5 October. The $0.125 figure it used to lead with is an earlier sample — 20 PRs in the orbi repository from 22 to 24 September.) The usage records hold one total per delivery, with no timestamps per request, so I can't split peak from off-peak. The real cost of these recorded rows was somewhere between $18.45 and twice that, and the median between $0.082 and $0.163.

That $18.45 counts only the last attempt of each delivery. With the three earlier attempts that have token counts added back, the 169 merged deliveries cost $19.04 at off-peak prices, an average of $0.113, above the median because a few large deliveries pull it up. There were also 16 issues with token counts that didn't end in a merge by Orbi (still open, abandoned, or finished by hand); all their recorded attempts together cost $2.73. Counting the ones that didn't merge too, everything Cloud recorded comes to $21.77; spread over the 169 merges, that's $0.129 each at off-peak prices, and up to twice that at peak.

Most of the input is cache reads. Per delivery, the median share of input tokens read from cache was 97.8%. Consecutive model requests in a Pi session resend mostly the same prefix, the system prompt, the issue and the conversation so far, until Pi compacts the context, and the provider serves that repeated prefix from its cache. Billed as cache misses, the same 169 recorded deliveries would have cost $253 at off-peak prices instead of $18.45. With the cache, output is about half the bill: $9.46 of the $18.45.

## Why we stay on Pi

Pi was already in Orbi's first commits in August, and I didn't compare it with anything before picking it. Looking back, there are two reasons we haven't replaced it.

The first is that switching models is a config change. Pi ships with many providers, and Orbi can merge a providers file of its own into the per-run `models.json`, which lets it point Pi at any OpenAI-compatible endpoint ([orbi#157](https://github.com/orbi-build/orbi/issues/157)). We use that in production: every delivery in Cloud's usage records ran on `deepseek-flash`, while the runners on my machine mostly used two OpenAI models through the same Pi command, `gpt-5.6-luna` to write code and `gpt-5.6-sol` to review it. Earlier, in September, runs also went through z.ai and Gemini. Our [harness benchmark](/blog/searching-for-orbis-harness/) compared those models and other coding-agent programs on the same tasks.

The second is switching cost. Orbi was built around Pi's command line, where everything a session needs, from skills and model to extensions and session directory, goes on one `pi --print`. In the same benchmark we ran Opus 5.5 through Claude Code and GLM 5.3 flash through zcode, a coding agent with its own CLI. The benchmark ran in private repositories under my personal account, without the Orbi GitHub App, so none of its merges are among the 373.

Each of those agents needed a bridge that mapped Pi's flags onto whatever the other agent offered, and both bridges lost the `--skill` list on the way, so those sessions ran without Orbi's skills until we noticed and fixed it on 29 September. The harness post marks which of its results ran that way. The zcode bridge also ran real deliveries: at times in September, for example most of 25 to 28 September, some runners on my machine had it standing in for `pi`, so those deliveries were written by zcode with GLM 5.3 flash, without Orbi's skills. They ran on my machine, so none of them are in Cloud's usage records.

## What Pi leaves to you, and where Orbi puts it

Pi's homepage (checked on 5 October 2026) lists five things it keeps out of its core: sub-agents, permission popups, plan mode, to-dos and background bash. MCP used to be on that list and is now built in. For each, Pi suggests a way to add it yourself, through extensions, third-party packages, containers, files or tmux. Orbi adds none of them to Pi. For three it has something close.

<figure class="post-media">
<img src="/img/diagrams/orbi-pi-layers.svg" alt="Two panels. Pi, inside each session: calls the model you configure, tools plus Codemode as an extension, skills, the session written as JSONL, and allowlisted extensions for the implementer and reviewer. Orbi runner, around the sessions: a queue of GitHub Issues labelled ai-ready, one worktree per issue from the base fixed at claim time, sessions per role, a merge gate on CI, the verdict and a current base, a tick every 5 minutes that stops stuck sessions, and, on Cloud only, token totals from the session files. Between them: one pi --print per role in one direction, and the session file, commit and verdict in the other." width="960" height="380">
</figure>

| Pi leaves out | What Pi suggests | Orbi's closest equivalent |
|---|---|---|
| Permission popups | A container, or a confirmation extension | A merge gate. It controls what merges, not what a tool call can touch. |
| Sub-agents | Pi in tmux, or an extension or package | A separate Pi session per role, started by the runner. |
| Plan mode | Plans in files, or an extension or package | `.orbi/plan.md`, written before any code and reread after Pi compacts the context. |
| To-dos | A `TODO.md`, or an extension | Nothing inside a session. |
| Background bash | tmux | Nothing. Delivery sessions don't run long-lived processes. |

On permissions: each issue gets its own git worktree from the base commit recorded when the runner claimed it. The implementer stops at a commit, and the runner pushes, opens the pull request and merges the head the reviewer passed. Orbi handles a moving base in two places. A reviewer session that starts on an out-of-date branch merges the new base in first, which is what happened at 13:41. If the base moves during a review and merges cleanly, the runner merges it in itself, waits for CI on that new head and merges the PR without another review. Nobody reviews that combination; CI on the new head is the only check, which is a trade-off we accepted. Either way, the final `gh pr merge --match-head-commit` refuses unless the branch head is the exact commit the runner expects.

None of this limits what a tool call can do on the machine. Pi's [security docs](https://pi.dev/docs/latest/security) say a working directory isn't a security boundary and recommend containers or sandboxes. On Orbi Cloud each tenant's runner is a separate OS user with its own resource limits, which is weaker than the container Pi recommends.

For sub-agents, what Orbi has instead is the runner starting sessions itself. A systemd timer (launchd on macOS) runs it every 5 minutes, and it stops sessions that go quiet ([orbi#94](https://github.com/orbi-build/orbi/issues/94)). The limits are longer now than the 15 minutes in the first incident below: 30 minutes while waiting on the model, and in other cases about an hour, plus a grace period, before the session is killed. The systemd journal, the issue comments and the pull request all carry the same `run_id`, so one run can be traced end to end.

### Why outside Pi, not as extensions

Most of what the runner does could have been Pi extensions. I kept it in the runner.

If the merge gate were an extension inside the implementer's session, that session's configuration would decide whether the gate ran. In Orbi a Pi session hands over commits and a verdict, and the runner decides what merges. The review isn't fully independent, though. The reviewer fixes what it finds, pushes to the task branch, and then the same session declares the branch clean. What it can't do is merge: its prompt forbids it, and the runner does the merge. That's a split of duties rather than a permission boundary, since the reviewer has tools and runs in the same environment as the runner.

Keeping the gates out of Pi also means Orbi can start every implementer and reviewer session with `--no-extensions` without turning the gates off. The first incident below shows why that flag matters.

If we switch agents, only the command-line layer changes, but that layer is where the Claude Code and zcode bridges lost the skills; the worktree, review and merge gate they ran through were the same ones Pi uses.

## Two incidents that shaped how we run Pi

The first was an extension. On the evening of 4 September, runs started hanging before Pi had sent a single model request, on z.ai and on Gemini. Each sat for 15 minutes until the idle timer killed it and labelled the issue `ai-blocked`. The stuck `pi` process was alive but barely moving (2 seconds of CPU in two and a half minutes). It had no TCP connection to any model API, its only socket was a connection to the user's D-Bus, and its session directory was empty, because Pi hadn't created the session file yet.

The same configuration started by hand from a shell worked more than 20 times in a row. Not every run under the systemd user service hung, but every hung run had been started by it. To check a stuck run for the same state on Linux, save this as `pi-hang.sh` and run it, as the user that runs pi, with the pi process's pid and the task worktree. On Cloud, the pi process is a child of the pid in Orbi's `process_spawned` journal line.

```bash
# Usage: bash pi-hang.sh <pid of the pi process> <task worktree>
PID=$1 WT=$2
[ "$(ps -o comm= -p "$PID" 2>/dev/null)" = pi ] || { echo "$PID is not a running pi process"; exit 1; }
ls "/proc/$PID/fd" >/dev/null 2>&1 || { echo "run this as the user that runs pi"; exit 1; }

# 1. Alive but idle: state S, CPU near 0
ps -o pid,stat,%cpu,wchan:32 -p "$PID"

# 2. TCP connections at the moment you look (none in our case)
tcp=$(ss -tnpH) || { echo "ss failed"; exit 1; }
grep "pid=$PID," <<<"$tcp" || echo "no TCP connections for this pid"

# 3. What its unix sockets connect to (in our case /run/user/1000/bus)
unix=$(ss -xpH) || { echo "ss failed"; exit 1; }
awk -v p="pid=$PID," '$0 ~ p {print $8}' <<<"$unix" |
  while read -r peer; do awk -v i="$peer" '$6 == i {print $5}' <<<"$unix"; done

# 4. Whether the session file exists yet (empty in our case)
ls -la "$WT/.pi-session/"
```

The cause was a Pi extension package installed for the user, `pi-mcp-adapter`. At startup it asked the desktop's Secret Service for a keyring over D-Bus, and inside the systemd user service that request sometimes never got an answer. We didn't dig further into why. With the package removed from `~/.pi/agent/settings.json`, the same run got its first model response in 15 seconds ([diagnosis in orbi#311](https://github.com/orbi-build/orbi/issues/311)). The lasting fix was [orbi#249](https://github.com/orbi-build/orbi/issues/249), already open since 3 September and merged on 8 September: implementer and reviewer sessions start with `--no-extensions` and load only the extensions listed in Orbi's config. It covered extensions only, which matters for the next incident.

The second was a runner on the wrong model. On 20 September I set up a second runner that was supposed to use a GPT model through Pi. Its config named the repository but left out `pi_provider` and `pi_model`, so Orbi passed no `--provider` or `--model`, and Pi fell back to `defaultModel` in the OS user's `~/.pi/agent/settings.json`, which #249 hadn't touched. I thought it was the GPT runner. Orbi's journal logs the provider and model each session resolves to at launch, and that line said `provider=LLAMA_INTRANET model=qwen3.8:27b`, a local model. Nothing errored; that line was the only sign, and I caught it the same day. Every runner's config now names provider and model. That's a convention, not a check Orbi enforces, so we read the launch line, not the config, to see which model runs.

## If you run Pi unattended yourself

These are the Pi-specific lessons. Who claims a task, who reviews and who merges are covered in [Run Claude Code unattended](/blog/run-claude-code-unattended/), and those answers carry over to Pi.

- Give every run its own `--session-dir`. It holds the full record of what the agent did, including token usage, and its last few records explain a failure better than the error message.
- Start from `--no-extensions` and add extensions back one at a time with `--extension` (short form `-e`). Otherwise whatever is installed under the account loads into a run nobody is watching. The flag also turns off Pi's built-in extensions, including MCP and Codemode, so add `--extension builtin:mcp` or `--extension builtin:codemode` back if you need them. Even then the Codemode tool stays off until something turns it on: an MCP server with Codemode exposure (the default) turns it on when it connects, or you can enable it yourself with `"defaultTools": ["+codemode"]` in Pi's settings, which is what Orbi's Cloud runners use. `--tools` works too, but it replaces the whole tool list, so name the default tools as well.
- If a role must not see a skill, pass `--no-skills` and list its skills explicitly. `--skill` only adds to whatever Pi discovers: always the user's skills directory, and the repository's once Pi trusts the project.
- Put provider and model on the command line. Otherwise Pi picks one from its settings and the models it can see; in our incident that was the saved `defaultModel`.
- Watch for sessions that go quiet. A hung session doesn't exit, so nothing upstream sees an error. Check when the session file last grew, and whether it exists at all a minute after launch.
- Read the Pi docs for your version before working around something. Our workaround for a limitation Pi didn't have wrote API keys to disk.

## What's next in this series

Next: why every issue gets its own Pi session in its own worktree, and after that, which Pi skills Orbi loads and why. The model comparison is in the harness posts: [part 1](/blog/searching-for-orbis-harness/) and [part 2](/blog/is-the-regression-guard-worth-its-tokens/).

Orbi's code is at [orbi-build/orbi](https://github.com/orbi-build/orbi). Orbi Cloud runs the same runner and the same Pi sessions on your own repositories.

## Related

Read the [Claude Code comparison](/compare/claude-code/) and [Cloud](/cloud/).
