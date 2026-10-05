---
title: Orbi on Pi: what we built around the Pi coding agent
date: 2026-10-05
summary: Orbi runs every GitHub issue it delivers through the Pi coding agent. How we call Pi, why we stay on it, and the layer Pi leaves to you that we built outside.
lang: en
author: Orbi
image: /img/blog-orbi-on-pi-card.png
mirror: orbi-on-pi-coding-agent
---

Orbi uses the [Pi coding agent](https://pi.dev) for all of its coding work. We call Pi from the command line, one session per role for each issue, and Orbi's runner handles the delivery around those sessions: which issue to work on, keeping the implementer and the reviewer apart, deciding what merges, scheduling and recovery. Pi is MIT-licensed and made by Earendil ([earendil-works/pi](https://github.com/earendil-works/pi)). Orbi is not part of the Pi project.

I'm Lawrence Liu, and I maintain Orbi. Orbi takes a GitHub issue labelled `ai-ready` and hands back a reviewed, merged pull request. A separate release issue turns merged work into a tagged release. From 16 September to 11:00 on 5 October 2026 (UTC+8), Orbi Cloud's managed runners merged 365 pull requests. 334 were in Orbi's own three repositories (orbi, orbi-cloud and orbi-website), because Orbi builds Orbi. 11 were in forks of other open-source projects and a test repository in our organization, and 20 were in 9 repositories owned by other people. Every one of those deliveries ran through Pi sessions.

This is the first post in a series on how Orbi is built. It starts with the command line we send to Pi, then the two reasons we chose it, then where we put the layer Pi leaves to you.

## How Orbi calls Pi

Every Pi session Orbi starts is one `pi --print` process. Stripped of the prompt text, the command has this shape (from [`src/orbi/pi_command.py`](https://github.com/orbi-build/orbi/blob/main/src/orbi/pi_command.py)):

```text
pi [--no-tools] [--no-extensions [--extension <allowlisted>]] \
   --skill <path> ... \
   [--provider <p>] [--model <m>] [--thinking <level>] \
   --print --session-dir <run dir> \
   --system-prompt <role prompt> <issue context>
```

There are three roles, and each gets its own flags:

- **Implementer.** Gets tools, the delivery skills and the implementation model. It plans, writes the change and runs the tests in the issue's worktree, then stops at a commit.
- **Reviewer.** A separate session on the pull request. Orbi doesn't pass it the `tdd-dev` and `review-fix-loop` skills, because its job is to review one diff and fix it, not to start another delivery. It can use a different model (`review_pi_provider` and `review_pi_model`), and it has to end with a single `REVIEW_VERDICT {...}` JSON line that Orbi parses.
- **Ticket.** Answers on an issue without changing anything. It runs with `--no-tools`, Orbi passes it none of its extension flags, and its output is the text Orbi posts.

`--session-dir` turned out to matter more than we expected. Each run gets its own directory, and Pi writes the session there as JSONL. Orbi tails that file to post live progress on the issue ([orbi#24](https://github.com/orbi-build/orbi/issues/24)). On Orbi Cloud, a thin wrapper around the real `pi` binary rereads the same files after each session to total the token usage. Cloud's per-delivery usage comes from those totals, and the monthly token cap is checked against them.

## Why we stay on Pi

Orbi has driven Pi since its first commits in August, and we didn't write down a formal comparison before picking it. Looking back, two things keep us on it.

**You bring your own model.** Pi supports a long list of providers out of the box, and it also takes a providers file in the shape of its `models.json`, which lets Orbi point it at any OpenAI-compatible endpoint ([orbi#157](https://github.com/orbi-build/orbi/issues/157)). Not being tied to one model vendor is one of the things that sets Orbi apart ([orbi#305](https://github.com/orbi-build/orbi/issues/305)). In our harness benchmark, `deepseek-flash`, `gpt-5.6-luna` and `gpt-5.6-sol` all ran through the same runner and the same Pi command line.

**Everything we need is a flag on one command.** Skills, provider, model, thinking level, session directory and extensions all go on a single `pi --print`. The same benchmark also tried Opus 5.5 through Claude Code and GLM 5.3 flash through zcode, and to fit them in we wrote bridges that translate that command line for the other agent. Both bridges silently dropped skills until we found and fixed it ([part 1 of that series](/blog/searching-for-orbis-harness/)). That's the kind of bug a translation layer adds, and with Pi there isn't one.

## What Pi leaves to you, and where Orbi puts it

Pi is upfront about what it doesn't put in its core. Besides MCP, which it now ships, its homepage lists sub-agents, permission popups, plan mode, to-dos and background bash, and suggests how to add each one yourself: extensions, third-party packages, containers, files or tmux (checked on 5 October 2026). Orbi doesn't add these features to Pi. What it has is a delivery-level counterpart to each, in the runner. The last column says where each one stops.

| Pi leaves out | What Pi suggests | What Orbi does instead, and the limit |
|---|---|---|
| Permission popups | Run in a container, or build a confirmation flow as an extension | Each issue gets its own git worktree from a frozen commit of the base branch. The implementer stops at a commit, the runner pushes and opens the pull request, and the runner merges the head the reviewer passed (if the base branch has moved on and merges cleanly, it first merges the base in and waits for CI on that new head, without another review). That controls what merges, not what a tool call can touch. For that, Pi's own [security docs](https://pi.dev/docs/latest/security) point to containers and sandboxes. On Orbi Cloud each tenant's runner is a separate OS user with its own resource limits, which is a narrower boundary than the container Pi recommends. |
| Sub-agents | Spawn Pi in tmux, or use an extension or package | Separate Pi sessions per role, started by the runner: implementer, separate reviewer, ticket. They aren't sub-agents inside a session. |
| Plan mode | Write plans to files, or use an extension or package | Before touching code, the implementer writes `.orbi/plan.md`: goal, context, repository decision, tasks, verification commands. It's what a session falls back on if its context gets compacted. |
| To-dos | A `TODO.md`, or build one as an extension | Between sessions, GitHub Issues are the queue and the `ai-ready` label is how work gets in. Inside a session the agent still has no to-do tool. |
| Background bash | tmux | The agent doesn't get background bash in Orbi either. What runs in the background is the runner: a systemd timer (launchd on macOS) ticks every 5 minutes, and sessions that stop producing output are detected and stopped ([orbi#94](https://github.com/orbi-build/orbi/issues/94)). |

Around all of that, one `run_id` ties together the journal, the issue comments and the pull request, and a failure Orbi can't fix on its own marks the issue `ai-blocked` for a person to decide.

### Why outside Pi, not as extensions

Pi would let us build most of this as extensions. We didn't, and here is why.

**The merge decision shouldn't live inside the session it judges.** If the merge gate were an extension loaded into the implementer's session, that session's configuration would decide whether it ran. In Orbi, Pi sessions produce commits and a verdict; the runner decides what merges. The reviewer can fix what it finds and push to the task branch, and it's the same session that then declares the branch clean, so the review isn't fully independent of its own fixes. Merging is the runner's step. The reviewer's prompt tells it not to merge, and the runner merges with `gh pr merge --match-head-commit`. That's a division of duties, not a permission boundary: the reviewer runs with tools in the same environment as the runner.

**Unattended sessions have to start from a known state.** A Pi installation picks up whatever its user has installed. One user-level extension once hung our runs in systemd: at startup it made a D-Bus call that sometimes never returned, and the session sat idle until stuck-session detection stopped it ([diagnosis in orbi#311](https://github.com/orbi-build/orbi/issues/311), [fix in orbi#249](https://github.com/orbi-build/orbi/issues/249)). Since then, implementer and reviewer sessions start with `--no-extensions` and add back only the extensions on an allowlist in Orbi's config. The ticket role, which runs without tools, doesn't pass that flag yet.

**Swapping the agent doesn't take the gates with it.** Because the worktree, the review and the merge gate live in the runner, the Claude Code and zcode bridges in our benchmark ran under exactly the same gates as Pi. If we ever swap the agent, the controls stay where they are.

On 1 October, Earendil and the Pi community shipped Pi 1.0, and with it [Pi Durable](https://earendil.com/posts/pi-durable/), a separate, experimental TypeScript framework for long-running agent applications, with sub-agents, background tasks, checkpoint-based crash recovery and approval hooks. We don't expect it to change the split above. Durable is about keeping a run alive and resumable. Orbi's gates are about deciding whether that run's output merges, and we want them outside the agent's process. Orbi is Python and drives Pi through its CLI, and we haven't evaluated Durable yet.

We don't think Pi should put any of this in its core. Its small core is the reason one command line is enough for us.

## If you run Pi unattended yourself

These are the Pi-specific lessons from our runners. The general ones (who claims a task, who reviews, who merges, who releases) are in [Run Claude Code unattended](/blog/run-claude-code-unattended/), and they apply to Pi just as much.

- **Give every run its own `--session-dir`.** It's the only complete record of what the agent did, and it's where the token usage is.
- **Start from `--no-extensions`.** Then add extensions explicitly. Whatever is installed for your user account will otherwise load into a run nobody is watching. The flag also turns off Pi's built-in extensions, including MCP, so add back `-e builtin:mcp` if you use it.
- **Choose skills per role, and mind discovery.** A reviewer loaded with an implementer's workflow skills will try to deliver instead of review. Note that `--skill` adds to the skills Pi discovers from user and project directories; to keep a skill out of a role, you also need `--no-skills` or a clean skills directory. Orbi only filters what it passes explicitly today.
- **Pass provider and model on the command line.** If you leave them out, Pi uses the `defaultModel` from your settings, and an unattended runner won't notice. We once deployed a runner we thought was on one model, and the logs showed it was running the global default.
- **Watch for sessions that stop producing output.** A hung session doesn't exit, so nothing upstream ever sees an error.

## What's next in this series

Next we'll write about running Pi unattended in more depth (the stuck-session detection and the D-Bus hang), why every issue gets its own Pi session in its own worktree, and the Pi skills Orbi uses. The harness work is already up: [part 1](/blog/searching-for-orbis-harness/) and [part 2](/blog/is-the-regression-guard-worth-its-tokens/), and so is [what a merged delivery costs on DeepSeek through Pi](/blog/deepseek-coding-agent-cost-per-merged-pr/).

Orbi is open source at [orbi-build/orbi](https://github.com/orbi-build/orbi). [Orbi Cloud](https://orbi.build/cloud/?ref=blog-pi) runs the same runner and the same Pi sessions on your own repositories.

## Related

Read the [Claude Code comparison](/compare/claude-code/) and [Cloud](/cloud/).
