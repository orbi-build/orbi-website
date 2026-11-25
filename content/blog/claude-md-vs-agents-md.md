---
title: CLAUDE.md vs AGENTS.md: which file each agent reads
date: 2026-11-25
summary: I tested Claude Code 2.1.331, Codex 0.167.0 and Pi 1.6.0 in 11 repos. With both files, Claude Code reads only CLAUDE.md; Pi and Codex read only AGENTS.md.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-claude-md-vs-agents-md-card.png
---

The CLAUDE.md vs AGENTS.md difference is that `CLAUDE.md` is Claude Code's own instructions file while `AGENTS.md` is the open, tool-neutral one; Claude Code 2.1.277+ reads `AGENTS.md` only when no `CLAUDE.md` is present. Codex and Pi read `AGENTS.md` and either ignore `CLAUDE.md` or rank it lower ([agents.md](https://agents.md/) says over 60k open-source projects use `AGENTS.md`). If your repo gets touched by more than one coding agent, such as Claude Code alongside Codex, Pi, Cursor, Copilot or OpenCode, it is easy to end up feeding different tools different rules.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi runs Pi, an open-source coding agent CLI, to turn GitHub Issues into merged changes. Its delivery and review sessions read the target repository's `AGENTS.md`. That's why I tested 11 repos across Claude Code, Pi and Codex: nine file layouts, a `CLAUDE.local.md` follow-up and Codex's 32 KiB cap.

## CLAUDE.md vs AGENTS.md: which file each agent reads

On 25 November 2026, I tested Claude Code 2.1.331, Pi 1.6.0 (`@earendil-works/pi-coding-agent`) and Codex CLI 0.167.0 (`@openai/codex`) on my Linux machine across nine file layouts, plus two Codex fallback runs using the `-c` flag covered in Traps below. Each cell shows what the tool loaded on a direct context probe (P2); the plain prompt (P1) agreed unless noted.

| Repo has | Claude Code 2.1.331 | Pi 1.6.0 | Codex 0.167.0 |
|---|---|---|---|
| nothing | none | none | none |
| `AGENTS.md` only | `AGENTS.md` | `AGENTS.md` | `AGENTS.md` |
| `CLAUDE.md` only | `CLAUDE.md` | `CLAUDE.md` | none (P2 answered `NONE`) |
| both, different text | `CLAUDE.md` only | `AGENTS.md` only | `AGENTS.md` only |
| `CLAUDE.md` symlink to `AGENTS.md` | `AGENTS.md` text (once) | `AGENTS.md` | `AGENTS.md` |
| `CLAUDE.md` = `@AGENTS.md` + one Claude line | both texts | `AGENTS.md` only | `AGENTS.md` only |
| `AGENTS.md` + `CLAUDE.local.md` | `CLAUDE.local.md` only (`AGENTS.md` dropped) | `AGENTS.md` | `AGENTS.md` |
| `AGENTS.md` + `AGENTS.override.md` | `AGENTS.md` (override ignored) | `AGENTS.override.md` only | `AGENTS.override.md` only |
| root `AGENTS.md` + `pkg/AGENTS.md`, run in `pkg/` | both | both | both (P2); P1 replied `OK` |
| Codex fallback flag, `CLAUDE.md` only | — | — | `CLAUDE.md` |
| Codex fallback flag, both files | — | — | `AGENTS.md` only |

Row four is where repos drift apart. When a repository has both `AGENTS.md` and `CLAUDE.md` with different text, Claude Code follows only `CLAUDE.md`, while Codex and Pi follow only `AGENTS.md`. Maintaining both files separately means different agents follow different rules.

Each column comes from that CLI's lookup order. In `dist/core/resource-loader.js` (line 130), Pi 1.6.0 checks `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md` and `CLAUDE.MD` in each directory and loads the first match. According to the [Codex AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md), Codex walks from the project root (usually the Git root) down to the working directory, checking `AGENTS.override.md`, then `AGENTS.md`, then `project_doc_fallback_filenames`; it takes at most one file per directory and concatenates them root-down. Claude Code uses `AGENTS.md` only when no `CLAUDE.md` file is present.

## How I tested it

I set up 11 throwaway git repositories under `/tmp/agentsmd-lab`: the nine layouts in the table, one size-limit case and one `CLAUDE.local.md` follow-up (both covered below). Neither `/tmp` nor `/` had instruction files. Each rules file contained only "End every reply with the word MARK-X on its own line." with a distinct `MARK-` word per file.

Pi loaded my personal `~/.pi/agent/AGENTS.md` as usual, and the first Codex run loaded `~/.codex/AGENTS.md`; neither file has a `MARK-` word, which the empty-repo control confirmed. Claude Code skipped my user-level files because of the `--setting-sources` flag shown below. Claude Code ran `--model haiku` with tools off (`--tools ""`), and Pi ran its default `deepseek/deepseek-flash` with tools off (`-nt`, plus `-ne -ns --no-mcp`). Codex ran `gpt-6-luna` with `-s read-only`, a sandbox that blocks writes while still allowing file reads, so the Codex probe relied on asking the model not to use tools.

Each case got a plain prompt P1 ("Reply with the single word OK.") and a probe prompt P2 asking the model to list every `MARK-` word already in context without using tools, or reply `NONE`. The empty repo was the control (`none` across all three tools on P1 and P2), and the `AGENTS.md`-only repo was the positive check (`MARK-AGENTS` in all three). To repeat the probe:

```bash
P2='Without using any tools or reading any files, list every marker word (words in capitals that start with MARK-) that the instructions already in your context ask you to add. If there are none, reply NONE.'

claude -p "$P2" --model haiku --tools "" --setting-sources project,local --no-session-persistence
pi -p --no-session -nt -ne -ns --no-mcp "$P2"
codex exec --skip-git-repo-check -s read-only "$P2"
```

I passed `--setting-sources project,local` to keep my own hooks out of the Claude Code runs. That skips both `~/.claude/settings.json` and `~/.claude/CLAUDE.md` (I checked by probing for my user file's first heading, and it answered `NONE`). Drop that flag if you want to test the setting below, since Claude Code reads it from `~/.claude/settings.json`.

The Codex rows in the table come from a clean run where `CODEX_HOME` held only `auth.json` and `config.toml` (`gpt-6-luna`, reasoning effort `medium`). In my first Codex run, with my 6,883-byte personal `~/.codex/AGENTS.md` loaded and reasoning effort `xhigh`, P2 returned the exact same loaded files, while P1 carried the project marker in only 1 of the 7 repos where P2 proved the project file loaded (the clean run hit 6 of 7). Two variables changed between those runs (the personal file and the effort level), so that doesn't isolate a cause. Still, it shows that a plain prompt isn't enough to verify what loaded, because a model can have a rule in context and ignore it.

## Does Claude Code read AGENTS.md?

Yes. Starting in 2.1.277, Claude Code reads `AGENTS.md` when there is no `CLAUDE.md` file in the working directory or any parent directory. In the [Claude Code memory docs](https://code.claude.com/docs/en/memory), `CLAUDE.md`, `.claude/CLAUDE.md` and `CLAUDE.local.md` in the working directory or above count as a `CLAUDE.md` for that check; `~/.claude/CLAUDE.md`, managed `CLAUDE.md` and `.claude/rules/` do not. Claude Code ignores `AGENTS.local.md`, `AGENTS.override.md` and anything under `.agents/`.

A few sessions still read `CLAUDE.md` only: versions before 2.1.277, sessions where the built-in plugin was disabled with `/plugin`, and in some cases the first session after upgrading from 2.1.276 or earlier. Before v2.1.281, some sessions, such as those on Amazon Bedrock or with telemetry disabled, did the same. In those cases, import `AGENTS.md` from a `CLAUDE.md`.

If you want Claude Code to load both files without an import, it documents a "Project instructions" setting in `/config` with four values: `claude-md-or-agents-md` (default), `claude-md-and-agents-md`, `claude-md` and `managed-only`. The docs give this config (I didn't test it):

```json
{
  "pluginConfigs": {
    "cc-plugin-agents-md@builtin": {
      "options": {
        "instructionFiles": "claude-md-and-agents-md"
      }
    }
  }
}
```

Before v2.1.285, the plugin ID was `agents-md@builtin`. Claude Code reads this option from `~/.claude/settings.json`, a `--settings` file or managed settings, and ignores it in project or local settings.

## One setup for Claude Code, Codex and Pi

Put shared project rules in `AGENTS.md`. If Claude Code needs extra lines of its own, add a `CLAUDE.md` that starts with `@AGENTS.md`:

```markdown
@AGENTS.md

End every reply with the word MARK-CLAUDE on its own line.
```

In my test, Claude Code read both texts while Pi and Codex read only `AGENTS.md`, so the Claude-only lines stayed in Claude Code. The Claude Code docs note that `@AGENTS.md` never causes Claude Code to read `AGENTS.md` twice.

If you have no Claude-specific lines, you can skip `CLAUDE.md` on Claude Code 2.1.277+ (`orbi-build/orbi` itself has `AGENTS.md` and no `CLAUDE.md`). If sessions that only read `CLAUDE.md` still need the rules, symlink `CLAUDE.md` to `AGENTS.md`:

```bash
ln -s AGENTS.md CLAUDE.md
```

All three tools loaded `AGENTS.md` through the symlink, and the Claude Code docs confirm a symlink is read once. If anyone clones the repo on Windows, use the `@AGENTS.md` import instead: as the same docs point out, Git checks a committed symlink out as a plain text file unless `core.symlinks` is enabled, leaving a one-line `CLAUDE.md` that stops Claude Code from reading `AGENTS.md`.

Don't write a `CLAUDE.md` that only says in prose "read `AGENTS.md`". Having `CLAUDE.md` present has already turned off automatic `AGENTS.md` loading, so according to the Claude Code docs, Claude sees `AGENTS.md` in that setup only if it decides to open the file itself.

## Traps

A private `CLAUDE.local.md` beside `AGENTS.md` makes Claude Code drop `AGENTS.md`. In my test, Claude Code loaded only `CLAUDE.local.md`, while Pi and Codex kept reading `AGENTS.md`. Because `CLAUDE.local.md` counts as a `CLAUDE.md` file, an untracked local note can turn off the team's `AGENTS.md` in your Claude sessions. Putting `@AGENTS.md` on the first line of `CLAUDE.local.md` fixed it in my follow-up test (Claude Code then loaded both files). The other option from the docs, which I didn't test, is setting `claude-md-and-agents-md` in `~/.claude/settings.json`.

`AGENTS.override.md` splits the tools the other way. In my test, Pi and Codex loaded only `AGENTS.override.md`, while Claude Code ignored it and read `AGENTS.md`. In Pi's `docs/configuration.md`, `AGENTS.override.md` replaces `AGENTS.md` or `CLAUDE.md` only in the same directory and does not suppress files from `~/.pi/agent` or other directories; Codex documents the same per-directory precedence and also supports `AGENTS.override.md` in `~/.codex` or `CODEX_HOME`.

By default, Codex ignores a `CLAUDE.md`-only repo (P2 answered `NONE`). To let Codex fall back to `CLAUDE.md`, set `project_doc_fallback_filenames` in `~/.codex/config.toml` (the Codex docs give `TEAM_GUIDE.md` and `.agents.md` as examples):

```toml
project_doc_fallback_filenames = ["CLAUDE.md"]
```

I tested this with Codex's `-c` flag:

```bash
codex exec -c 'project_doc_fallback_filenames=["CLAUDE.md"]' --skip-git-repo-check -s read-only "$P2"
```

Codex loaded `CLAUDE.md` in the `CLAUDE.md`-only repo, and still loaded only `AGENTS.md` when both files existed.

## How long can AGENTS.md be?

The [Claude Code memory docs](https://code.claude.com/docs/en/memory) advise staying under 200 lines per `CLAUDE.md` file, though Claude Code skips a file only above 4 MiB. Codex stops adding instruction files once the combined size reaches `project_doc_max_bytes`, which defaults to 32 KiB (32,768 bytes) in the Codex docs.

It doesn't take long for a real repo to cross 32 KiB. Orbi's delivery prompt instructs Pi to read the target repo's `AGENTS.md` and meet its test requirements, and the review prompt reads `AGENTS.md` too; both sessions keep context files on (`no_context_files = False`), while only the draft and suggest helper sessions turn them off. Before PR #237 (merged 2 September 2026 for Issue #232), `orbi-build/orbi`'s `AGENTS.md` was 630 lines. PR #237 cut it to 129 lines to stay at or under 200 lines. I didn't keep it short: it crept back to 154 lines by 10 September 2026, 248 by 20 September 2026, 435 by 1 October 2026, 439 by 1 November 2026, and 444 lines (39,565 bytes) on its last change on 21 November 2026.

To test that 39,565-byte file against Codex's 32 KiB cap, I put a `MARK-HEAD` rule before Orbi's `AGENTS.md` and a `MARK-TAIL` rule after it (448 lines, 39,681 bytes) and ran P2 on all three tools. Claude Code and Pi returned both `MARK-HEAD` and `MARK-TAIL`. Default Codex returned only `MARK-HEAD` in 2 of 2 runs, dropping the tail rule. Raising `project_doc_max_bytes` fixed that:

```bash
codex exec -c project_doc_max_bytes=65536 --skip-git-repo-check -s read-only "$P2"
```

With `project_doc_max_bytes=65536`, Codex returned both markers. Without bumping that limit, anything past 32 KiB gets cut off, so rules every session must follow belong near the top, and rarely needed instructions belong in skills or nested files.

## AGENTS.md best practices

- Keep `AGENTS.md` as the single source of shared rules so Claude Code, Codex and Pi do not diverge.
- If you need a `CLAUDE.md`, use `@AGENTS.md` or a symlink. Prose telling the agent to read `AGENTS.md` is not an import, and having `CLAUDE.md` turns off automatic `AGENTS.md` loading.
- Put non-negotiable rules first, since Codex cuts from the end.
- Keep combined instructions under Codex's 32 KiB default (or raise `project_doc_max_bytes`), and trim toward Claude Code's 200-line guideline.
- Split subdirectory rules into nested `AGENTS.md` files. In my nested test (`AGENTS.md` plus `pkg/AGENTS.md`, run in `pkg/`), all three tools loaded both.
- Check what loaded with a probe like P2; having a file on disk doesn't mean it reached the prompt.

A minimal `AGENTS.md` only needs the rules every change must obey (this example is made up, not from a real repo):

```markdown
# AGENTS.md

- Run the project test suite before finishing and report exact failing commands and exit codes.
- Do not edit generated output directories by hand; edit source files and rebuild.
- Keep changes scoped to the assigned issue and avoid unrelated refactors.
- Add a regression test for every bug fix before writing the patch.
- Never commit secrets, tokens or local `.env` files.
- Ask before changing public API contracts or database schemas.
```

## AGENTS.md vs skills

Any `AGENTS.md` in your working directory or above it is in context on every session unless disabled (for example, with Pi's `--no-context-files` or `-nc` flag). A nested file below the working directory works differently: Claude Code loads it when it reads a file in that subdirectory, while Codex and Pi load it only when you start the session in that directory or below it. Skills (`SKILL.md`) load on demand. In the [Claude Code skills docs](https://code.claude.com/docs/en/skills), skill descriptions stay in context while full skill content loads only when invoked. Pi's `docs/skills.md` documents the same pattern, adding each skill's name, description and path to the system prompt at startup so the model reads `SKILL.md` only when a task matches.

Keep repo-wide rules that every change has to follow (test gates, generated-file boundaries) in `AGENTS.md`. Move occasional procedures (release checklists, migration guides) into `SKILL.md` files so they don't fill every session or push `AGENTS.md` past 32 KiB.

## Other tools

I didn't test GitHub Copilot or Cursor, and I didn't re-test OpenCode on 25 November 2026.

| Tool | Instruction files loaded | Basis |
|---|---|---|
| GitHub Copilot | `AGENTS.md` anywhere in the repo (nearest takes precedence); alternatively a single root `CLAUDE.md` or `GEMINI.md` | [GitHub Copilot docs](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions), not tested |
| Cursor | `AGENTS.md` in project root and subdirectories (nested files combined with parents); rules page does not mention `CLAUDE.md` | [Cursor rules docs](https://cursor.com/docs/context/rules), not tested |
| OpenCode 2.2.5 | Loaded project `AGENTS.md`; did not load project `CLAUDE.md` or `~/.claude/CLAUDE.md` | My test on 2 November 2026 in [OpenCode vs Claude Code](/blog/opencode-vs-claude-code/), not re-tested |

## Related

If you want to see the delivery loop these instructions feed into, start with [From GitHub Issue to merged PR and release](/guides/issue-to-release/?ref=blog-agents-md). My 2 November 2026 OpenCode `AGENTS.md` test is in [OpenCode vs Claude Code](/blog/opencode-vs-claude-code/), with Codex CLI behavior in [OpenCode vs Codex](/blog/opencode-vs-codex/) and how Pi compares with Claude Code in [Pi coding agent vs Claude Code](/blog/pi-coding-agent-vs-claude-code/). For how Orbi uses Pi and your repository's `AGENTS.md` to turn GitHub Issues into reviewed, merged pull requests, see [Orbi vs Claude Code](/compare/claude-code/?ref=blog-agents-md) and [Orbi Cloud](/cloud/?ref=blog-agents-md).
