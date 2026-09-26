---
title: GitSpawn and the agent that never asks
date: 2026-09-26
summary: A git flaw hit seven coding agents by skipping their approval prompts. Orbi has none to skip, so we shipped a fix, checked who really runs git, and reverted it.
lang: en
author: Orbi
image: /img/blog-gitspawn.png
mirror: gitspawn-unattended-agent
---

On September 1, Manifold Security disclosed [GitSpawn](https://www.manifold.security/blog/ai-coding-agents-git-hijack), eight findings across seven coding agents: Claude Code, Codex, Cursor, Goose, Hermes Agent, Qwen Code and Grok Build. The short version is that a repository's git configuration could make a program run before the agent's approval prompt ever appeared. Manifold's post has the details, and several vendors have already shipped fixes.

I [posted about it on X](https://x.com/xqliu/status/2103343487668154834). The replies mostly said the same thing: an agent's workspace has to be trusted before the agent loop starts, and approving shell commands afterwards is too late.

That raised the question we actually had to answer. Does this affect Orbi? We merged a fix the next morning and reverted it that afternoon.

## The fix

On September 25 I filed [issue #1366](https://github.com/orbi-build/orbi/issues/1366). Orbi delivered it the same day as [PR #1368](https://github.com/orbi-build/orbi/pull/1368). It routed every git call the runner makes through one helper that switches off the git settings named in the disclosure, and it added a check that fails the build if any code calls git directly. The PR touched 26 files and added 1,164 lines.

![PR #1368, the hardening fix, merged](/img/gitspawn-fix-pr.png)

## The revert

Three hours and fifty minutes later I reverted it in [PR #1376](https://github.com/orbi-build/orbi/pull/1376).

![PR #1376 reverting the fix](/img/gitspawn-revert-pr.png)

I had skipped a question: who runs that git command, and as which user?

The seven affected tools share a safety model. The model proposes a command, a person approves it, then it runs. GitSpawn mattered because it ran something before that approval.

Orbi has no approval step. It works unattended by design, and its agent already has a shell. For us the boundary is the operating system account. In Orbi Cloud every connected repository runs as its own Unix user, and the runner and the agent run as that same user. Anything the runner's own git call could be tricked into running would get the access the agent already had, so the fix protected nothing.

We checked the one place with more privilege too. A host job reads usage data from every sandbox and runs as root. It already does its git reads as each sandbox's own user. That came from an earlier outage: on September 12 the job ran git as root, git's `safe.directory` check refused to touch a repository another user owned, and usage collection failed silently every five minutes until we switched it to the owning user.

So we had 1,164 lines guarding a boundary Orbi doesn't have. The revert says so directly: over-engineered for the current stage. The same PR added a rule to the repository's AGENTS.md: no preventive tickets for theoretical risks.

## What we took from it

If your agent asks a person before it runs commands, follow Manifold's advice. The fix for that kind of tool is small and worth making.

If your agent runs unattended, you have no prompt to protect. The account is your boundary. Give each repository its own user, keep anything more privileged from working inside that user's files, and before you write a fix, check which user actually runs the code.

We got that order wrong once, and all of it is public in Orbi's own repository. Orbi turns a GitHub Issue into a reviewed, merged and tagged release. You can [run it on your own repository](https://orbi.build/cloud/?ref=blog-gitspawn).

## Related

Read the [Managed agents comparison](/compare/managed-agents/) and [Cloud](/cloud/).
