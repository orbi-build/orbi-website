---
title: Can an AI agent contribute to open source?
date: 2026-10-17
summary: Orbi fixed issues in brig, LLMVault and pyinfra, and maintainers merged all three PRs. On pyinfra our automated review missed a bug and a human caught it.
lang: en
author: Lawrence Liu
image: /img/blog-oss-contributions-card.png
mirror: ai-contribute-to-open-source
---

I used Orbi, an AI coding agent, to contribute to open source: I pointed it at three projects I do not own, opened the fixes it wrote as pull requests, and the maintainers merged all three. This post links each one to the record of how it was made, so you can check the work rather than take my word for it. These three are all we have opened upstream this way, not a selection from a longer run, and on one of them I had to catch and rewrite a bug the agent's own review had missed.

I'm Lawrence Liu, and I maintain [Orbi](https://orbi.build/?ref=blog-ai-oss). On a repository you own, Orbi turns a GitHub Issue into a merged PR: an agent (we call it Pi) reads the Issue and writes the change in a sandbox, a second Pi session reviews that change with none of the context from writing it, CI runs, and the runner merges when all of those pass. Someone else's repository works differently, because I cannot let an agent write straight into it. So Orbi read the upstream issue, did the work in a fork we control, and I reviewed the result before opening the PR upstream under my own account, with a line in the body saying an AI agent wrote it.

## What got merged

| Project | Stars | Issue | What it fixed | Merged |
|---|---|---|---|---|
| [brig](https://github.com/brig-sh/brig) | 232 | [#357](https://github.com/brig-sh/brig/issues/357) | `--help` and `-h` on top-level commands | [PR #402](https://github.com/brig-sh/brig/pull/402) |
| [LLMVault](https://github.com/CyberSunil/LLMVault) | 340 | [#28](https://github.com/CyberSunil/LLMVault/issues/28) | Flask debug mode left on by default | [PR #39](https://github.com/CyberSunil/LLMVault/pull/39) |
| [pyinfra](https://github.com/pyinfra-dev/pyinfra) | 6,039 | [#1438](https://github.com/pyinfra-dev/pyinfra/issues/1438) | Result table misaligned by CJK text | [PR #1977](https://github.com/pyinfra-dev/pyinfra/pull/1977) |

Each one fixed a bug someone had already reported. Each section below also links the delivery record in our fork, where the agent did the first version.

## brig: a help-flag fix, reviewed by the maintainer's own AI

brig runs coding agents in a microVM sandbox, and its maintainer reviews pull requests with an AI agent too. Its [issue #357](https://github.com/brig-sh/brig/issues/357) reported that `brig run --help` and the other top-level verbs refused a help flag and exited with an error, while `brig help <verb>` printed the global text instead of the verb's. Orbi made the fix in our fork first ([orbi-build/brig#3](https://github.com/orbi-build/brig/pull/3)): every top-level verb now answers `--help`, `-h` and `brig help <verb>` with its own usage, read from one table so the spellings cannot drift. A brig command looks like `brig run <agent> ...`, where a flag before the agent name is brig's and a flag after it belongs to the agent. So `brig run --help` now prints brig's usage, while `brig run claude --help` still passes `--help` through to claude.

I opened [PR #402](https://github.com/brig-sh/brig/pull/402) from that fork branch, with a body that stated plainly Orbi wrote it and I reviewed it. The maintainer, Alexandros Sapranidis, ran their own AI review on it (`@claude-fleet review`); the review checked the help intercept against the tests, flagged only nits, and approved.

The rest was the ordinary back-and-forth of any contribution. They asked me to rebase onto main, and doing so turned up a `brig plan` command that had landed since we forked, so I added a `--help` entry for it too. They then asked me to bring the new commit in line with the project's commit guideline, which I did. Then they merged, with "thank @xqliu for the contribution and your patience here."

## LLMVault: a security fix the maintainer merged without changes

[LLMVault](https://github.com/CyberSunil/LLMVault) is a deliberately vulnerable training platform for LLM security. The vulnerabilities it teaches are in the app; this one was in how you run it. Its own [issue #28](https://github.com/CyberSunil/LLMVault/issues/28) noted that `app.run(debug=True)` was hardcoded, which turns on the Werkzeug interactive debugger. That is a code-execution risk for whoever runs the platform if the server is exposed, and it has nothing to do with the vulnerabilities the platform is built to teach.

Orbi's fix ([orbi-build/LLMVault#3](https://github.com/orbi-build/LLMVault/pull/3)) reads debug mode from a `LLMVAULT_DEBUG` variable and keeps it off unless the value is `1` or `true`. The Docker image runs gunicorn and never enabled the debugger, so only `python app.py` changed. The agent verified it by running the app with the variable unset, `0`, `1` and `true`. I opened [PR #39](https://github.com/CyberSunil/LLMVault/pull/39) and the maintainer merged it without asking for a change.

## pyinfra: a CJK width fix that needed a second pass

pyinfra turns Python into shell commands on your servers. Its [issue #1438](https://github.com/pyinfra-dev/pyinfra/issues/1438) reported that CJK characters shifted the columns of the results table: each such character takes two terminal cells, but the code measured width with `len()`, so a Chinese operation name pushed every following column to the right.

Orbi's first version, in our fork ([orbi-build/pyinfra#3](https://github.com/orbi-build/pyinfra/pull/3)), measured cell width with a hand-written loop over each character's East Asian Width. It fixed the CJK case the issue reported, and in doing so it broke alignment for emoji with skin-tone modifiers, which the issue never mentioned. In 👍🏽 both the base emoji and the skin-tone modifier carry a wide East Asian Width, so the loop counted the pair as four cells where the terminal draws two. `len()` undercounts a wide CJK character, but for this emoji it had happened to return the two cells the terminal draws, so those rows lined up fine before the loop; the new code was what broke them. The Pi review session, the same gate that reviews changes on a repository you own, ran on that version and let it through.

I caught the regression when I reviewed the fork change before taking it upstream. I reworked it with Claude Code to measure width with `rich.cells.cell_len` instead, then reviewed and tested the final diff myself. (Orbi's own agent is Pi; Claude Code was the tool I reached for on this rewrite.) `cell_len` only gives a skin-tone modifier zero width in recent rich, so I raised pyinfra's minimum rich version to 13.7.1, the first release that fixes it. I ran pyinfra's own test suite, and reran the issue's own example with `pyinfra @local exec` to confirm the table lined up. Then I opened [PR #1977](https://github.com/pyinfra-dev/pyinfra/pull/1977), and the PR body said all of it: an AI agent wrote the first version, a review found it made emoji rows worse, and I reworked and tested the final diff. The maintainer merged it.

I wrote the failure into the PR body so the maintainer could judge the diff with the same information our own review had. I do not know whether that disclosure made the difference, but they could see exactly what they were merging and what had gone wrong on the way.

## What it takes for AI to contribute to open source

The common objection to AI-written pull requests is that they are noise: plausible-looking diffs that waste a maintainer's time. All three of these went through a human before they reached the upstream repository. I cannot tell you why each maintainer accepted them, but I can tell you the pyinfra one would have been noise without that human pass: the Pi review session let the regression through, and I caught it only on my own review.

That human pass was specific to these contributions, because the repositories were not mine. On a repository you own, Orbi runs the same Pi review session, and by default the runner merges on its own once that review, CI and the PR checks pass, without waiting for you. It all happens on your own PRs, so you can read the findings as they land; and when you want a change held for a person to sign off, Orbi has an [AI-human review gate](/guides/auto-merge-ai-prs/?ref=blog-ai-oss) you can turn on. The [Issue-to-release guide](/guides/issue-to-release/?ref=blog-ai-oss) covers that flow end to end, and the [Pi architecture guide](/guides/pi-coding-agent/?ref=blog-ai-oss) explains the gates.

## Related

See how Orbi compares to [Devin](/compare/devin/?ref=blog-ai-oss), or run the same flow on your own repository with [Cloud](/cloud/).
