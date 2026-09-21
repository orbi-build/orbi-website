---
title: An autonomous coding agent that can tell itself no
date: 2026-09-20
summary: Most agents that call themselves autonomous stop at the pull request. The interesting question is not whether a model can write the code, it is what happens when a second model reads that code and refuses it. Here is one delivery where the review blocked twice, with the commits and the release to check.
lang: en
author: Orbi
image: /img/blog-autonomous.png
---

Search for an autonomous coding agent and you will find a lot of tools that
open pull requests. That part has been solved for a while. The part nobody
shows you is the refusal: what happens when something reads the diff and says
this does not ship.

I want to walk through one delivery where that happened. The writing part is
easy to demo. The refusal is not.

## The delivery

[Issue #1018](https://github.com/orbi-build/orbi/issues/1018) described a real
defect in our own release code. A change had moved the docs sync before the tag
push, which opened three windows where a tagged release could exist without its
docs page.

The Issue got the `ai-ready` label. Nothing else was set up.

Orbi claimed it, worked in an isolated worktree, and opened
[PR #1023](https://github.com/orbi-build/orbi/pull/1023) against a recorded base
commit. So far this is what every agent does.

Then a second session, with a fresh context and no memory of writing the code,
read that diff.

## The refusal

Round one came back with one Major finding. Not a style note:

> **Location:** `src/orbi/release.py:2377`
>
> **Note:** If `publish_release` fails after the tag is pushed,
> `rollback_release_docs` removes the docs commit while leaving the remote tag
> published. CI can then observe a released tag without its docs page,
> violating acceptance criteria.

The fix for the bug had reintroduced the bug, in a narrower window. The review
named the file, the line, the mechanism, and what a correct fix would look like.

Orbi read the finding, pushed a recovery path, and ran again. Round two came
back too, this time on coverage: new branches with no tests. Three more commits.

Nine commits in total, +427/-43, three hours and two minutes from the Issue to
the merge. Then [v0.5.17](https://github.com/orbi-build/orbi/releases/tag/v0.5.17),
with the Issue and the PR listed in the generated notes.

No human decided anything in that window.

## The part the screenshots cannot show

Here is something I had to label on [the video we cut from this
run](https://youtu.be/Et6gBSaXqqA), because the frames are misleading on their
own.

The runner posts through my own GitHub account. It has my token, so its commits
carry my name and its review comments carry my name and my avatar. On screen,
the review that blocked PR #1023 appears under `xqliu`, with the badges
`Collaborator` and `Author`.

A first-time visitor reads that as a developer reviewing his own pull request,
which is exactly the impression the whole exercise is meant to refute. Directly
below that comment sits a `github-actions` comment wearing a `Bot` badge, so the
same screen teaches you what a bot looks like here and then shows you a review
that is not one.

I cannot make GitHub show it differently. What I can do is say it out loud: that
was a second model, running in a separate session, and it had no memory of
writing the code it refused.

## What changes when the gate can fail

An agent that writes code and opens a PR has moved the work to a human. Someone
still has to read it, decide, and merge. The agent did the typing.

Making the gate real turned out to be mostly plumbing. The verdict has to be
bound to a specific commit, or a later push slips past a judgement that was
issued for an earlier one. And the findings have to be specific enough that a
fresh session, with no memory of the original work, can act on them: a check
that only says "not done yet" leaves the next session guessing.

The harder part is that it has to be allowed to fail the delivery outright. I
have been comparing notes with a few maintainers who ship gates like this, and
they all report the same thing: people leave the check advisory, because a
blocking check slows down rapid iteration.

I think that is about who is waiting rather than whether the check is right.
Blocking a human's PR costs that human time right now, and they feel it.
Blocking an agent's PR costs nobody anything, because the agent reads the
finding and goes again at 3am while everyone is asleep.

## Trying it

The whole loop is one container. systemd runs as PID 1 inside it, which is what
the cgroup bind is for:

```bash
docker run -d --name orbi \
  --stop-signal SIGRTMIN+3 \
  --tmpfs /run --tmpfs /tmp \
  --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
  -v orbi-deploy:/orbi \
  -v orbi-work:/work \
  -e GH_TOKEN="github_pat_xxx" \
  -e ORBI_SOURCE_REPO="OWNER/REPO" \
  -e ORBI_PI_PROVIDER=deepseek \
  -e ORBI_PI_MODEL=deepseek-chat \
  -e ORBI_PI_BASE_URL=https://api.deepseek.com \
  -e ORBI_PI_API_KEY="sk-xxx" \
  ghcr.io/orbi-build/orbi:latest
```

The engine is whichever model you point those four variables at. Label an Issue
`ai-ready` and the next tick picks it up. The review runs as a separate session
against the frozen head, and nothing merges unless that session passes it.
Full walkthrough: [docs.orbi.build/docker](https://docs.orbi.build/docker).

## The ledger

This is running on its own repository. As of today, 27 days in: 334 merged pull
requests from `orbi/` branches, 51 tagged releases.

Every one of those is a link you can open, including the reviews that blocked
something and the commits that came after.

Orbi is open source and self-hostable:
[github.com/orbi-build/orbi](https://github.com/orbi-build/orbi).
