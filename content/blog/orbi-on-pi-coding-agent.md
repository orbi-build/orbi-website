---
title: Orbi on Pi: what we built around the Pi coding agent
date: 2026-10-05
summary: One real GitHub issue followed through every Pi session Orbi ran for it, what those sessions cost, and the layer Pi leaves to you that we built outside it.
lang: en
author: Orbi
image: /img/blog-orbi-on-pi-card.png
mirror: orbi-on-pi-coding-agent
---

All of Orbi's coding is done by the [Pi coding agent](https://pi.dev). Orbi calls Pi from the command line and starts a separate session for each role on an issue. Everything around those sessions belongs to Orbi's runner: picking the issue, keeping the implementer and the reviewer apart, deciding what merges, scheduling, and recovering when something hangs. Pi is MIT-licensed and made by Earendil ([earendil-works/pi](https://github.com/earendil-works/pi)). Orbi isn't part of the Pi project.

I'm Lawrence Liu, and I maintain Orbi. You label a GitHub issue `ai-ready` and Orbi hands back a reviewed, merged pull request; a separate release issue turns merged work into a tagged release. From 16 September to 11:00 on 5 October 2026 (UTC+8), Orbi Cloud's managed runners merged 365 pull requests. 334 of them were in Orbi's own three repositories (orbi, orbi-cloud and orbi-website), since Orbi builds itself. 11 were in forks of other open-source projects and a test repository in our organization, and the remaining 20 were in 9 repositories that belong to other people. Pi did the work on every one.

This is the first post in a series about Orbi and Pi. Rather than draw boxes, I'll walk through one real issue and every Pi session Orbi ran for it, then get to the command line, the numbers across all deliveries, and the parts of the job Pi leaves to you.

## One issue, start to finish

The issue is [orbi#1554](https://github.com/orbi-build/orbi/issues/1554), and it happens to be about Pi. For each run, Orbi writes its own copy of Pi's `models.json` into the worktree, and it used to resolve `$VAR` API key references and write the actual keys into that file. A comment in our code said this was because Pi 0.84.3 couldn't interpolate them. Pi's own docs for 0.84.3 say otherwise: `apiKey` accepts `$ENV_VAR` and `${ENV_VAR}`. We had been working around a limitation that wasn't there, and putting keys on disk to do it. The fix was to keep the reference and let Pi resolve it. I filed it in the middle of the night, labelled it `ai-ready` and went to bed.

<figure class="post-media">
<img src="/img/diagrams/orbi-pi-flow.svg" alt="One issue through Orbi and Pi, in three lanes. GitHub: the issue is labelled ai-ready, CI checks run, and the issue ends as ai-merged. Orbi runner: claim with a worktree from a frozen base, push and open the PR, and a merge gate that checks CI, the verdict and whether the base is current. Pi sessions: an implement session (plan.md, code, tests, commit) and a review session that reviews, fixes and ends with REVIEW_VERDICT. A red dashed loop sends red CI to a new review session that fixes it, and a failed gate leads to ai-blocked, where a person decides." width="1050" height="470">
</figure>

By morning the issue's timeline looked like this (UTC+8):

| Time | What happened |
|---|---|
| 03:21 | Issue filed and labelled `ai-ready`. |
| 03:31 | The runner claimed it and started the first Pi session (run `598a0fb3`). |
| 03:42 | The implementer committed the fix, `fix(pi): keep apiKey env-var references verbatim in per-run models.json`. |
| 03:43 | The runner pushed and opened [PR #1555](https://github.com/orbi-build/orbi/pull/1555). |
| 03:47, 04:08 | CI failed twice with the same fingerprint, in a docs test that was failing on `main` too. Each time the runner started a new review session, which reads the CI log first and then fixes (the second CI run was on a docs commit that session pushed). |
| 04:22 | The review session stopped at the delivery gate: the check failing on the PR was failing on `main` too (the gate named `macos-compatibility`), so merging wouldn't fix anything. The issue went to `ai-blocked`. |
| 12:06 | A different issue, [orbi#1552](https://github.com/orbi-build/orbi/issues/1552), also delivered by Orbi, fixed the failing docs test on `main`. |
| 13:39 | I moved #1554 back to the queue. |
| 13:42 | The branch picked up the new `main`. |
| 13:58 | Review passed with no findings, and the runner merged the PR. |

While a run is going, Orbi keeps editing one comment on the issue. The runner fills in the role. The rest comes from Pi's session file: when Pi last produced output, the session id, and the phase. In the screenshot, `phase: codemode` is the last tool phase the runner saw, which is Pi 1.0's Codemode, where the model writes a short script that strings several tool calls together.

<figure class="post-media">
<img src="/img/blog-orbi-on-pi-progress.webp" alt="Orbi's progress comment on orbi#1554: PR #1555 merged with review_rounds=1; role: review; tests: 4034 passed, 11 skipped in 7 minutes 38 seconds; run details with run_id 598a0fb3, phase codemode, elapsed 16m 57s, the branch name and the Pi session id." width="1200" height="731">
<figcaption>The progress comment on orbi#1554, captured on 5 October 2026.</figcaption>
</figure>

At 04:22 the gate could have pushed the merge through anyway. It posted this and waited for me instead:

<figure class="post-media">
<img src="/img/blog-orbi-on-pi-blocked.webp" alt="Orbi's blocked comment on orbi#1554: Orbi blocked, waiting on a human decision. Reason: the independent review of PR #1555 failed: delivery gate: main is already red on check macos-compatibility, fix main first." width="1200" height="331">
<figcaption>In short: the PR was fine, but the base it would merge into was already red.</figcaption>
</figure>

The issue used 4 Pi sessions in total, 1 implementer and 3 reviewer. Orbi Cloud's usage records put it at 51 minutes of Pi runtime, 164 model requests, 108 thousand output tokens and 8.4 million cache-read tokens, all on `deepseek-flash`. Pi wasn't doing much between 04:22 and 13:39. The issue was waiting for me to wake up.

## How Orbi calls Pi

Each Pi session Orbi starts is one `pi --print` process. Without the prompt text, the command looks like this (from [`src/orbi/pi_command.py`](https://github.com/orbi-build/orbi/blob/main/src/orbi/pi_command.py)):

```text
pi [--no-tools] [--no-extensions [--extension <allowlisted>]] \
   [--skill <path> ...] \
   [--provider <p>] [--model <m>] [--thinking <level>] \
   --print --session-dir <run dir> \
   --system-prompt <role prompt> <issue context>
```

The implementer session gets tools, the delivery skills and the implementation model. Before it touches code it writes `.orbi/plan.md` with the goal, the context it looked at, a repository decision, the tasks and the commands it will verify with. Then it edits the code in the issue's worktree, runs the tests, and stops at a commit.

The reviewer is a separate session on the pull request. Orbi doesn't pass it the `tdd-dev` or `review-fix-loop` skills, because its job is to review one diff and fix what's wrong with it, and those skills would steer it into another delivery. It can run on its own model (`review_pi_provider` and `review_pi_model`), and it has to finish with a single `REVIEW_VERDICT {...}` JSON line, which is what Orbi parses.

The third role, ticket, answers a question on an issue and changes nothing. It runs with `--no-tools`, Orbi passes it none of its extension flags, and whatever it prints is what Orbi posts.

I underestimated `--session-dir` at first. Every run gets its own directory, and Pi writes the session there as JSONL, one record per message or tool result. Orbi tails that file to update the progress comment ([orbi#24](https://github.com/orbi-build/orbi/issues/24)), and when a run fails it attaches the last 20 records to the failure comment. Four of the 20 it attached when #1554's review was blocked:

```text
2026-10-04T20:13:35.691Z message role=assistant content=thinking,toolCall:codemode
2026-10-04T20:13:35.899Z message role=toolResult tool=codemode content=text,text
2026-10-04T20:13:37.044Z message role=assistant content=toolCall:codemode
2026-10-04T20:13:37.175Z message role=toolResult tool=codemode content=text,text
```

On Orbi Cloud there's also a thin wrapper around the real `pi` binary. After each session it rereads those files and adds up the token usage. That's where the per-delivery usage in Cloud comes from, and it's what the monthly token cap is checked against.

## What Pi sessions cost, across 186 deliveries

As of 14:00 on 5 October (UTC+8), the usage records covered 186 deliveries, all on `deepseek-flash`: 399 Pi sessions and 24,285 model requests between them. Per delivery:

| | Median | 90th percentile |
|---|---|---|
| Pi runtime | 35 minutes | 89 minutes |
| Model requests | 107 | 238 |
| Output tokens | 69,502 | 188,228 |
| Input tokens, not cached | 133,413 | 318,496 |
| Cache-read tokens | 6.76 million | 19.2 million |

I didn't expect the last row. In the median delivery, 97.7% of the input tokens were cache reads. It makes sense once you think about what a Pi session sends on every turn: the system prompt, the issue and the files it has read, almost unchanged from the turn before, so the provider serves most of it from cache. That goes a long way toward explaining [what a merged delivery on DeepSeek through Pi costs](/blog/deepseek-coding-agent-cost-per-merged-pr/).

## Why we stay on Pi

Pi was already in Orbi's first commits in August, and I didn't do a proper comparison before picking it. Looking back, there are two reasons we haven't replaced it.

The first is that you bring your own model. Pi ships with a long list of providers and also reads a providers file in the shape of its `models.json`, so Orbi can point it at any OpenAI-compatible endpoint ([orbi#157](https://github.com/orbi-build/orbi/issues/157)). I don't want Orbi tied to one model vendor, and [orbi#305](https://github.com/orbi-build/orbi/issues/305) says as much. In our harness benchmark, `deepseek-flash`, `gpt-5.6-luna` and `gpt-5.6-sol` ran through the same runner and the same Pi command.

The second is that everything Orbi passes to Pi fits on one `pi --print`. In the same benchmark we also tried Opus 5.5 through Claude Code and GLM 5.3 flash through zcode. Each needed a bridge that rewrote Pi's command into flags the other agent understood, and both bridges quietly lost the skills until we noticed and fixed them ([part 1 of that series](/blog/searching-for-orbis-harness/)). With Pi there's no bridge in between to lose anything.

## What Pi leaves to you, and where Orbi puts it

Pi says plainly what it keeps out of its core. Apart from MCP, which it now ships, its homepage lists sub-agents, permission popups, plan mode, to-dos and background bash, each with a suggestion for adding it yourself through extensions, third-party packages, containers, files or tmux (I checked on 5 October 2026). Orbi doesn't add any of these to Pi. It does something comparable at the delivery level, in the runner.

<figure class="post-media">
<img src="/img/diagrams/orbi-pi-layers.svg" alt="Two panels. Pi, inside each session: calls the model you configure, tools including Pi 1.0 Codemode, skills, the session written as JSONL, and allowlisted extensions. Orbi runner, around the sessions: a queue of GitHub Issues labelled ai-ready, one worktree per issue from a frozen base, sessions per role, a merge gate on CI, the verdict and a current base, a tick every 5 minutes that stops stuck sessions, and token totals from the session files. Between them: one pi --print per role in one direction, and the session file, commit and verdict in the other." width="960" height="380">
</figure>

| Pi leaves out | What Pi suggests | What Orbi does instead, and the limit |
|---|---|---|
| Permission popups | Run in a container, or build a confirmation flow as an extension | Each issue gets its own git worktree from a frozen commit of the base branch. The implementer stops at a commit, the runner pushes and opens the pull request, and the runner merges the head the reviewer passed (if the base branch has moved on and merges cleanly, it first merges the base in and, if the repository has CI checks, waits for them on that new head, without another review). That controls what merges, not what a tool call can touch. For that, Pi's own [security docs](https://pi.dev/docs/latest/security) point to containers and sandboxes. On Orbi Cloud each tenant's runner is a separate OS user with its own resource limits, which is a narrower boundary than the container Pi recommends. |
| Sub-agents | Spawn Pi in tmux, or use an extension or package | Separate Pi sessions per role, started by the runner: implementer, separate reviewer, ticket. They aren't sub-agents inside a session. |
| Plan mode | Write plans to files, or use an extension or package | The implementer writes `.orbi/plan.md` before touching code. It's what a session falls back on if its context gets compacted. |
| To-dos | A `TODO.md`, or build one as an extension | Between sessions, GitHub Issues are the queue and the `ai-ready` label is how work gets in. Inside a session the agent still has no to-do tool. |
| Background bash | tmux | The agent doesn't get background bash in Orbi either. What runs in the background is the runner: a systemd timer (launchd on macOS) ticks every 5 minutes, and sessions that stop producing output are detected and stopped ([orbi#94](https://github.com/orbi-build/orbi/issues/94)). |

The journal, the issue comments and the pull request all carry the same `run_id`, so one run can be traced end to end. When Orbi hits a failure it can't fix on its own, it labels the issue `ai-blocked` and leaves the call to a person, which is what happened to #1554 at 04:22.

### Why outside Pi, not as extensions

Most of this could have been Pi extensions. I kept it in the runner for a few reasons.

The main one is that a session shouldn't decide whether its own work merges. If the merge gate were an extension inside the implementer's session, that session's configuration would decide whether the gate ran. In Orbi a Pi session hands over commits and a verdict, and the runner decides what merges. There is a gap I should be upfront about. The reviewer fixes what it finds and pushes to the task branch, and then the same session declares the branch clean, so the review isn't fully independent of its own fixes. What it doesn't do is merge. Its prompt tells it not to, and the runner does the merge with `gh pr merge --match-head-commit`. That's a split of duties rather than a permission boundary, since the reviewer has tools and runs in the same environment as the runner.

Unattended sessions also need to start from a known state, which the first incident below shows better than I can explain it.

And keeping the gates in the runner makes the agent replaceable. The Claude Code and zcode bridges in our benchmark went through exactly the same worktree, review and merge gate as Pi. If we ever switch agents, those stay put.

On 1 October, Earendil and the Pi community shipped Pi 1.0, along with [Pi Durable](https://earendil.com/posts/pi-durable/), a separate, experimental TypeScript framework for long-running agent applications. It has background tasks, checkpoint-based crash recovery, and hooks you can build approvals on. I don't expect it to change the split above. Durable is about keeping a run alive and resumable, while Orbi's gates decide whether that run's output merges, and I'd still want those outside the agent's process. Orbi is written in Python and drives Pi through its CLI, and we haven't evaluated Durable properly yet.

None of this means Pi should carry these features. A small core is exactly what lets us drive it with a single command.

## Two incidents that shaped how we run Pi

The first was a plugin. On the evening of 4 September, runs started hanging before Pi had sent a single model request. It happened run after run, on z.ai and on Gemini, and each one sat for 15 minutes until the idle timer killed it and labelled the issue `ai-blocked`. The stuck `pi` process was alive but barely moving (2 seconds of CPU in two and a half minutes). It had no TCP connection to any model API, its only socket was the user's D-Bus, and its session directory was empty because Pi hadn't even created the session file. The same configuration run by hand from a shell worked more than 20 times in a row; only runs started by the systemd user service hung. The culprit turned out to be a user-level Pi package, `pi-mcp-adapter`, which initialised the system keyring over D-Bus at startup, and under systemd that call sometimes never returned. With the package removed from `~/.pi/agent/settings.json`, the same run got its first model response in 15 seconds ([diagnosis in orbi#311](https://github.com/orbi-build/orbi/issues/311)). The lasting fix was to stop delivery sessions from inheriting the user's plugins: implementer and reviewer sessions now start with `--no-extensions` and load only the extensions declared in Orbi's config ([orbi#249](https://github.com/orbi-build/orbi/issues/249)).

The second was a runner on the wrong model. On 20 September we set up a second runner that was supposed to use a GPT model through Pi. Its config named the repository but left out `pi_provider` and `pi_model`, so Orbi passed no `--provider` or `--model` and Pi fell back to the `defaultModel` in the account's settings. The journal said `provider=LLAMA_INTRANET model=qwen3.8:27b`, a local model, on a runner we'd been calling the GPT runner. Nothing errored, and that was the problem. Every runner's config now sets provider and model explicitly (`orbi doctor` reports a runner without them as not configured), and we check the launch line in the journal to see which model actually runs.

## If you run Pi unattended yourself

These are the Pi-specific lessons from our runners. The general questions, like who claims a task, who reviews, who merges and who releases, are covered in [Run Claude Code unattended](/blog/run-claude-code-unattended/), and they apply to Pi just as well.

- Give every run its own `--session-dir`. It's the only full record of what the agent did, the token usage lives there, and the last few records make a better failure report than any error message.
- Start from `--no-extensions` and add extensions back one by one. Otherwise whatever is installed under your account loads into a run nobody is watching. The flag also turns off Pi's built-in extensions, MCP included, so add back `-e builtin:mcp` if you need it.
- Give each role its own skills, and watch out for discovery. A reviewer that loads the implementer's workflow skills will start delivering instead of reviewing. `--skill` adds to whatever Pi discovers in user and project directories, so keeping a skill away from a role also takes `--no-skills` or a clean skills directory.
- Put provider and model on the command line. Leave them out and Pi uses the `defaultModel` from your settings, which an unattended runner will never notice.
- Watch for sessions that go quiet. A hung session doesn't exit, so nothing upstream sees an error. Check when the session file last grew, not just whether the process is still there.
- Read the Pi docs for your version before you work around something. We carried a workaround for a `models.json` limitation that the docs show never existed, and it wrote API keys to disk. That's how #1554 started.

## What's next in this series

Next up: why every issue gets its own Pi session in its own worktree, and after that, which Pi skills Orbi loads and why. If you want numbers in the meantime, the harness posts are out: [part 1](/blog/searching-for-orbis-harness/) and [part 2](/blog/is-the-regression-guard-worth-its-tokens/).

Orbi's code is at [orbi-build/orbi](https://github.com/orbi-build/orbi). [Orbi Cloud](https://orbi.build/cloud/?ref=blog-pi) runs the same runner and the same Pi sessions against your own repositories.

## Related

Read the [Claude Code comparison](/compare/claude-code/) and [Cloud](/cloud/).
