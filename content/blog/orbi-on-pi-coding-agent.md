---
title: Orbi on Pi: what we built around the Pi coding agent
date: 2026-10-05
summary: One real GitHub issue followed through every Pi session Orbi ran for it, what those sessions cost, and the layer Pi leaves to you that we built outside it.
lang: en
author: Orbi
image: /img/blog-orbi-on-pi-card.png
mirror: orbi-on-pi-coding-agent
---

Orbi uses the [Pi coding agent](https://pi.dev) for all of its coding work. We call Pi from the command line, one session per role for each issue, and Orbi's runner handles the delivery around those sessions: which issue to work on, keeping the implementer and the reviewer apart, deciding what merges, scheduling and recovery. Pi is MIT-licensed and made by Earendil ([earendil-works/pi](https://github.com/earendil-works/pi)). Orbi is not part of the Pi project.

I'm Lawrence Liu, and I maintain Orbi. Orbi takes a GitHub issue labelled `ai-ready` and hands back a reviewed, merged pull request. A separate release issue turns merged work into a tagged release. From 16 September to 11:00 on 5 October 2026 (UTC+8), Orbi Cloud's managed runners merged 365 pull requests. 334 were in Orbi's own three repositories (orbi, orbi-cloud and orbi-website), because Orbi builds Orbi. 11 were in forks of other open-source projects and a test repository in our organization, and 20 were in 9 repositories owned by other people. Every one of those deliveries ran through Pi sessions.

This is the first post in a series about Orbi and Pi. Instead of describing the architecture in the abstract, it follows one real issue through every Pi session Orbi ran for it, then looks at the command line, the numbers across all deliveries, and the parts of the job Pi leaves to you.

## One issue, start to finish

The issue is [orbi#1554](https://github.com/orbi-build/orbi/issues/1554), and it happens to be about Pi itself. Orbi writes a per-run copy of Pi's `models.json` into each worktree, and it was resolving `$VAR` API key references and writing the keys out in plain text. A comment in our code said Pi 0.84.3 couldn't interpolate them. Pi's own docs for 0.84.3 say otherwise: `apiKey` accepts `$ENV_VAR` and `${ENV_VAR}`. We had been working around a limitation that wasn't there. The fix was to keep the reference and let Pi resolve it. I filed it in the middle of the night, labelled it `ai-ready` and went to bed.

<figure class="post-media">
<img src="/img/diagrams/orbi-pi-flow.svg" alt="One issue through Orbi and Pi, in three lanes. GitHub: the issue is labelled ai-ready, CI checks run, and the issue ends as ai-merged. Orbi runner: claim with a worktree from a frozen base, push and open the PR, and a merge gate that checks CI, the verdict and whether the base is current. Pi sessions: an implement session (plan.md, code, tests, commit) and a review session that reviews, fixes and ends with REVIEW_VERDICT. A red dashed loop sends red CI to a new review session that fixes it, and a failed gate leads to ai-blocked, where a person decides." width="1050" height="470">
</figure>

Here is what happened, from the issue's own timeline (UTC+8):

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

The comment Orbi keeps editing on the issue shows where the run is. The runner fills in the role; the rest comes from Pi's session file: when Pi last produced output, the session id, and the phase. `phase: codemode` is the last tool phase the runner saw: Pi 1.0's Codemode, where the model writes a short script that composes several tool calls in one step.

<figure class="post-media">
<img src="/img/blog-orbi-on-pi-progress.webp" alt="Orbi's progress comment on orbi#1554: PR #1555 merged with review_rounds=1; role: review; tests: 4034 passed, 11 skipped in 7 minutes 38 seconds; run details with run_id 598a0fb3, phase codemode, elapsed 16m 57s, the branch name and the Pi session id." width="1200" height="731">
<figcaption>The progress comment on orbi#1554, captured on 5 October 2026.</figcaption>
</figure>

When the gate stopped, it didn't guess. It posted why and left the decision to a person:

<figure class="post-media">
<img src="/img/blog-orbi-on-pi-blocked.webp" alt="Orbi's blocked comment on orbi#1554: Orbi blocked, waiting on a human decision. Reason: the independent review of PR #1555 failed: delivery gate: main is already red on check macos-compatibility, fix main first." width="1200" height="331">
<figcaption>The gate's message: the PR was fine, but the base it would merge into was red.</figcaption>
</figure>

Orbi Cloud's usage records add up the whole delivery: 4 Pi sessions (1 implementer, 3 reviewer), 51 minutes of Pi runtime, 164 model requests, 108 thousand output tokens and 8.4 million cache-read tokens, all on `deepseek-flash`. Most of the wall-clock time between 04:22 and 13:39 was the issue waiting for me, not Pi working.

## How Orbi calls Pi

Every Pi session Orbi starts is one `pi --print` process. Stripped of the prompt text, the command has this shape (from [`src/orbi/pi_command.py`](https://github.com/orbi-build/orbi/blob/main/src/orbi/pi_command.py)):

```text
pi [--no-tools] [--no-extensions [--extension <allowlisted>]] \
   [--skill <path> ...] \
   [--provider <p>] [--model <m>] [--thinking <level>] \
   --print --session-dir <run dir> \
   --system-prompt <role prompt> <issue context>
```

There are three roles, and each gets its own flags:

- **Implementer.** Gets tools, the delivery skills and the implementation model. Before touching code it writes `.orbi/plan.md` (goal, context, repository decision, tasks, verification commands), then changes the code and runs the tests in the issue's worktree, and stops at a commit.
- **Reviewer.** A separate session on the pull request. Orbi doesn't pass it the `tdd-dev` and `review-fix-loop` skills, because its job is to review one diff and fix it, not to start another delivery. It can use a different model (`review_pi_provider` and `review_pi_model`), and it has to end with a single `REVIEW_VERDICT {...}` JSON line that Orbi parses.
- **Ticket.** Answers on an issue without changing anything. It runs with `--no-tools`, Orbi passes it none of its extension flags, and its output is the text Orbi posts.

`--session-dir` turned out to matter more than we expected. Each run gets its own directory, and Pi writes the session there as JSONL, one record per message and tool result. Orbi tails that file to post live progress on the issue ([orbi#24](https://github.com/orbi-build/orbi/issues/24)), and when a run fails it attaches the last 20 records to the failure comment. Here are four of the last 20 records Orbi attached when #1554's review session was blocked:

```text
2026-10-04T20:13:35.691Z message role=assistant content=thinking,toolCall:codemode
2026-10-04T20:13:35.899Z message role=toolResult tool=codemode content=text,text
2026-10-04T20:13:37.044Z message role=assistant content=toolCall:codemode
2026-10-04T20:13:37.175Z message role=toolResult tool=codemode content=text,text
```

On Orbi Cloud, a thin wrapper around the real `pi` binary rereads the same files after each session and totals the token usage. Cloud's per-delivery usage comes from those totals, and the monthly token cap is checked against them.

## What Pi sessions cost, across 186 deliveries

As of 14:00 on 5 October (UTC+8), those usage records covered 186 deliveries, all on `deepseek-flash`. Across them there were 399 Pi sessions and 24,285 model requests. Per delivery:

| | Median | 90th percentile |
|---|---|---|
| Pi runtime | 35 minutes | 89 minutes |
| Model requests | 107 | 238 |
| Output tokens | 69,502 | 188,228 |
| Input tokens, not cached | 133,413 | 318,496 |
| Cache-read tokens | 6.76 million | 19.2 million |

The last row is the one that surprised us. In the median delivery, 97.7% of the input tokens were cache reads. A Pi session keeps resending a long, mostly unchanged context (the system prompt, the issue, the files it has already read), and the provider serves most of it from cache. That's a large part of why [a merged delivery on DeepSeek through Pi costs what it does](/blog/deepseek-coding-agent-cost-per-merged-pr/).

## Why we stay on Pi

Orbi has driven Pi since its first commits in August, and we didn't write down a formal comparison before picking it. Looking back, two things keep us on it.

**You bring your own model.** Pi supports a long list of providers out of the box, and it also takes a providers file in the shape of its `models.json`, which lets Orbi point it at any OpenAI-compatible endpoint ([orbi#157](https://github.com/orbi-build/orbi/issues/157)). Not being tied to one model vendor is one of the things that sets Orbi apart ([orbi#305](https://github.com/orbi-build/orbi/issues/305)). In our harness benchmark, `deepseek-flash`, `gpt-5.6-luna` and `gpt-5.6-sol` all ran through the same runner and the same Pi command line.

**Everything we need is a flag on one command.** Skills, provider, model, thinking level, session directory and extensions all go on a single `pi --print`. The same benchmark also tried Opus 5.5 through Claude Code and GLM 5.3 flash through zcode, and to fit them in we wrote bridges that translate that command line for the other agent. Both bridges silently dropped skills until we found and fixed it ([part 1 of that series](/blog/searching-for-orbis-harness/)). That's the kind of bug a translation layer adds, and with Pi there isn't one.

## What Pi leaves to you, and where Orbi puts it

Pi is upfront about what it doesn't put in its core. Besides MCP, which it now ships, its homepage lists sub-agents, permission popups, plan mode, to-dos and background bash, and suggests how to add each one yourself: extensions, third-party packages, containers, files or tmux (checked on 5 October 2026). Orbi doesn't add these features to Pi. What it has is a delivery-level counterpart to each, in the runner.

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

Around all of that, one `run_id` ties together the journal, the issue comments and the pull request, and a failure Orbi can't fix on its own marks the issue `ai-blocked` for a person to decide, as #1554 showed.

### Why outside Pi, not as extensions

Pi would let us build most of this as extensions. We didn't, and here is why.

**The merge decision shouldn't live inside the session it judges.** If the merge gate were an extension loaded into the implementer's session, that session's configuration would decide whether it ran. In Orbi, Pi sessions produce commits and a verdict; the runner decides what merges. The reviewer can fix what it finds and push to the task branch, and it's the same session that then declares the branch clean, so the review isn't fully independent of its own fixes. Merging is the runner's step. The reviewer's prompt tells it not to merge, and the runner merges with `gh pr merge --match-head-commit`. That's a division of duties, not a permission boundary: the reviewer runs with tools in the same environment as the runner.

**Unattended sessions have to start from a known state.** That's the first incident below.

**Swapping the agent doesn't take the gates with it.** Because the worktree, the review and the merge gate live in the runner, the Claude Code and zcode bridges in our benchmark ran under exactly the same gates as Pi. If we ever swap the agent, the controls stay where they are.

On 1 October, Earendil and the Pi community shipped Pi 1.0, and with it [Pi Durable](https://earendil.com/posts/pi-durable/), a separate, experimental TypeScript framework for long-running agent applications, with background tasks, checkpoint-based crash recovery and hooks you can build approvals on. We don't expect it to change the split above. Durable is about keeping a run alive and resumable. Orbi's gates are about deciding whether that run's output merges, and we want them outside the agent's process. Orbi is Python and drives Pi through its CLI, and we haven't evaluated Durable yet.

## Two incidents that shaped how we run Pi

**A plugin that hung before the first request.** On 4 September, runs started hanging before Pi ever sent a model request. Run after run that evening, on z.ai and on Gemini, sat for 15 minutes until the idle timer killed it and marked the issue `ai-blocked`. The hung `pi` process was alive but idle (2 seconds of CPU in two and a half minutes), had no TCP connection to any model API, and its only socket was the user's D-Bus. Its session directory was empty: Pi hadn't even started the session file. The same configuration run by hand from a shell succeeded more than 20 times in a row; only runs started by the systemd user service hung. The cause was a user-level Pi package, `pi-mcp-adapter`, which initialised the system keyring over D-Bus at startup, and under systemd that call sometimes never returned. With the package removed from `~/.pi/agent/settings.json`, the same run got its first model response in 15 seconds ([diagnosis in orbi#311](https://github.com/orbi-build/orbi/issues/311)). The permanent fix was to stop the delivery sessions inheriting the user's plugins: implementer and reviewer sessions now start with `--no-extensions` and load only the extensions declared in Orbi's config ([orbi#249](https://github.com/orbi-build/orbi/issues/249)).

**A runner on the wrong model.** On 20 September we set up a second runner meant to use a GPT model through Pi. The config we wrote set the repository but none of the `pi_provider` or `pi_model` keys, so Orbi passed no `--provider` or `--model`, and Pi used the `defaultModel` from the account's settings. The runner's journal showed `provider=LLAMA_INTRANET model=qwen3.8:27b`, a local model, on a runner we had described as a GPT runner. Nothing failed, which is the problem. We now set provider and model explicitly in every runner's config (`orbi doctor` reports a runner without them as not configured), and we confirm the model from the launch line in the journal instead of reading the config and assuming.

## If you run Pi unattended yourself

These are the Pi-specific lessons from our runners. The general ones (who claims a task, who reviews, who merges, who releases) are in [Run Claude Code unattended](/blog/run-claude-code-unattended/), and they apply to Pi just as much.

- **Give every run its own `--session-dir`.** It's the only complete record of what the agent did, it's where the token usage is, and its last records are the best failure report you'll get.
- **Start from `--no-extensions`.** Then add extensions explicitly. Whatever is installed for your user account will otherwise load into a run nobody is watching. The flag also turns off Pi's built-in extensions, including MCP, so add back `-e builtin:mcp` if you use it.
- **Choose skills per role, and mind discovery.** A reviewer loaded with an implementer's workflow skills will try to deliver instead of review. `--skill` adds to the skills Pi discovers from user and project directories; to keep a skill out of a role, you also need `--no-skills` or a clean skills directory.
- **Pass provider and model on the command line.** If you leave them out, Pi uses the `defaultModel` from your settings, and an unattended runner won't notice.
- **Watch for sessions that stop producing output.** A hung session doesn't exit, so nothing upstream ever sees an error. Look at when the session file last grew, not just whether the process is alive.
- **Check Pi's docs for the version you run before working around it.** Our code carried a workaround for a `models.json` limitation that Pi's docs show didn't exist, and it wrote API keys to disk for it. That's how #1554 came about.

## What's next in this series

Next: why every issue gets its own Pi session in its own worktree, and the Pi skills Orbi loads and why. The harness work is already up: [part 1](/blog/searching-for-orbis-harness/) and [part 2](/blog/is-the-regression-guard-worth-its-tokens/).

Orbi is open source at [orbi-build/orbi](https://github.com/orbi-build/orbi). [Orbi Cloud](https://orbi.build/cloud/?ref=blog-pi) runs the same runner and the same Pi sessions on your own repositories.

## Related

Read the [Claude Code comparison](/compare/claude-code/) and [Cloud](/cloud/).
