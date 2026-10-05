---
title: Orbi on Pi: what we built around the Pi coding agent
date: 2026-10-05
summary: Orbi hands every GitHub issue to the Pi coding agent. How we call Pi, why we picked it, and the parts Pi leaves to its users that we built outside it.
lang: en
author: Orbi
image: /img/blog-orbi-on-pi-card.png
mirror: orbi-on-pi-coding-agent
---

Orbi uses the [Pi coding agent](https://pi.dev) for all of its coding work. We call Pi from the command line, one session per job, and Orbi's own code handles the parts Pi deliberately leaves out of its core: approvals, sub-agents, planning, a task list and long-running jobs. Pi is MIT-licensed and made by Earendil. Orbi is not part of the Pi project.

I'm Lawrence Liu, and I maintain Orbi. Orbi takes a GitHub issue labelled `ai-ready` and hands back a reviewed, merged pull request. A separate release issue turns merged work into a tagged release. On Orbi Cloud, the managed runners merged 365 pull requests between 16 September and 5 October 2026 (UTC+8). 345 of them were in 11 of our own repositories, because Orbi builds Orbi. The other 20 were in 9 repositories owned by other people. Every one of those deliveries ran through Pi sessions.

This is the first post in a series on how Orbi is built. It starts with the command line we send to Pi, then the two reasons we chose it, then where we put the layer Pi leaves to you.

## How Orbi calls Pi

Every Pi session Orbi starts is one `pi --print` process. Stripped of the prompt text, the command has this shape (from [`src/orbi/pi_command.py`](https://github.com/orbi-build/orbi/blob/main/src/orbi/pi_command.py)):

```text
pi [--no-tools] --no-extensions [--extension <allowlisted>] \
   --skill <path> ... \
   --provider <p> --model <m> [--thinking <level>] \
   --print --session-dir <run dir> \
   --system-prompt <role prompt> <issue context>
```

There are three roles, and each gets its own flags:

- **Implementer.** Gets tools, the delivery skills and the implementation model. It plans, writes the change and runs the tests in the issue's worktree, then stops at a commit.
- **Reviewer.** A separate session on the pull request. It drops the `tdd-dev` and `review-fix-loop` skills, because its job is to review one diff and fix it, not to start another delivery. It can use a different model (`review_pi_provider` and `review_pi_model`), and it has to end with a single `REVIEW_VERDICT {...}` JSON line that Orbi parses.
- **Ticket.** Answers on an issue without changing anything. It runs with `--no-tools` and no extensions, and its output is the text Orbi posts.

`--session-dir` turned out to matter more than we expected. Each run gets its own directory, and Pi writes the session there as JSONL. Orbi tails that file to post live progress on the issue ([orbi#24](https://github.com/orbi-build/orbi/issues/24)). On Orbi Cloud, a thin wrapper around the real `pi` binary rereads the same files after each session to total the token usage. The per-delivery usage Cloud reports, and its monthly token cap, are built from those totals.

## Why Pi

Two reasons are on record.

**You bring your own model.** Pi supports a long list of providers out of the box, and it also takes a providers file in the shape of its `models.json`, which lets Orbi point it at any OpenAI-compatible endpoint ([orbi#157](https://github.com/orbi-build/orbi/issues/157)). Not being tied to one model vendor is one of the things that sets Orbi apart ([orbi#305](https://github.com/orbi-build/orbi/issues/305)). In our harness benchmark, `deepseek-flash`, `gpt-5.6-luna` and `gpt-5.6-sol` all ran through the same runner and the same Pi command line.

**The command line is small enough to be a contract.** Everything Orbi needs is a flag on one `pi --print`. The same benchmark also tried Opus 5.5 through Claude Code and GLM 5.3 flash through zcode. To fit them in, we wrote bridges that imitate Pi's command line. Both bridges silently dropped skills until we found and fixed it ([part 1 of that series](/blog/searching-for-orbis-harness/)). With Pi, `--skill` is a native flag, so there's no bridge to drop it.

## What Pi leaves to you, and where Orbi puts it

Pi is upfront about what it doesn't put in its core. Its homepage lists sub-agents, permission popups, plan mode, to-dos and background bash. For each one it suggests a way to add it yourself: extensions, third-party packages, containers, files or tmux (checked on 5 October 2026). Orbi adds every one of them, but outside Pi, in the runner.

| Pi leaves out | What Pi suggests | Where Orbi has it |
|---|---|---|
| Permission popups | Run in a container, or build a confirmation flow as an extension | Each issue gets its own git worktree, created from a frozen `origin/main` commit. The implementer stops at a commit, and the runner pushes and opens the pull request. Only the reviewed head can merge, and no agent pushes a protected branch. |
| Sub-agents | Spawn Pi in tmux, or use an extension or package | Separate Pi sessions per role, started by the runner: implementer, independent reviewer, ticket. |
| Plan mode | Write plans to files, or use an extension or package | The implementer's first step is to write `.orbi/plan.md`: goal, context, tasks, verification commands. The reviewer reads it. |
| To-dos | A `TODO.md`, or an extension or package | GitHub Issues are the queue. The `ai-ready` label is how work gets in. |
| Background bash | tmux | A systemd timer (launchd on macOS) ticks every 5 minutes. Sessions that stop producing output are detected and stopped ([orbi#94](https://github.com/orbi-build/orbi/issues/94)). |

Around all of that, one `run_id` ties together the journal, the issue comments and the pull request, and a failure Orbi can't fix on its own marks the issue `ai-blocked` for a person to decide.

### Why outside Pi, not as extensions

Pi would let us build most of this as extensions. We didn't, for three reasons.

**The checks shouldn't live inside the thing being checked.** If the merge gate and the reviewer were extensions loaded into the implementer's session, that session's configuration would decide whether they ran. In Orbi, the Pi sessions only produce commits and verdicts. The runner decides whether a pull request merges, and it reads the verdict from a session the implementer never touched.

**Unattended sessions have to start from a known state.** A Pi installation picks up whatever its user has installed. One user-level extension once hung our runs in systemd: it waited on a D-Bus call that never returned, and the session sat idle until the recovery timer killed it ([orbi#249](https://github.com/orbi-build/orbi/issues/249)). Since then, every session starts with `--no-extensions` and adds back only the extensions on an allowlist in Orbi's config.

**The engine can change without losing the loop.** Because the worktree, the review and the merge gate live in the runner, the Claude Code and zcode bridges in our benchmark ran under exactly the same gates as Pi. If we ever swap the agent, the controls stay where they are.

We don't think Pi should put any of this in its core. A small core is what lets a runner drive it with one command line.

## If you run Pi unattended yourself

These are the Pi-specific lessons from our runners. The general ones (who claims a task, who reviews, who merges, who releases) are in [Run Claude Code unattended](/blog/run-claude-code-unattended/), and they apply to Pi just as much.

- **Give every run its own `--session-dir`.** It's the only complete record of what the agent did, and it's where the token usage is.
- **Start from `--no-extensions`.** Then add extensions explicitly. Whatever is installed for your user account will otherwise load into a run nobody is watching.
- **Choose skills per role.** A reviewer loaded with an implementer's workflow skills will try to deliver instead of review.
- **Pass provider and model on the command line.** If you leave them out, Pi falls back to the default model in your settings without any warning. We once deployed a runner we thought was on one model, and the logs showed it was running the global default.
- **Watch for sessions that stop producing output.** A hung session doesn't fail. It just sits there.

## What's next in this series

Next we'll write about running Pi unattended in more depth (the stuck-session detection and the D-Bus hang), why every issue gets its own Pi session in its own worktree, and the Pi skills Orbi uses. The harness work is already up: [part 1](/blog/searching-for-orbis-harness/) and [part 2](/blog/is-the-regression-guard-worth-its-tokens/).

Orbi is open source at [orbi-build/orbi](https://github.com/orbi-build/orbi). [Orbi Cloud](https://orbi.build/cloud/?ref=blog-pi) runs the same runner and the same Pi sessions on your own repositories.

## Related

Read the [Claude Code comparison](/compare/claude-code/) and [Cloud](/cloud/).
