---
title: CLAUDE.md vs AGENTS.md: which file each agent reads
date: 2026-11-25
summary: I tested Claude Code 2.1.331, Codex 0.167.0 and Pi 1.6.0 on ten repos. With both files, Claude Code reads only CLAUDE.md; the others read only AGENTS.md.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-claude-md-vs-agents-md-card.png
---

In CLAUDE.md vs AGENTS.md, `AGENTS.md` is the open, tool-neutral instructions file ([agents.md](https://agents.md/) says it is used by over 60k open-source projects) and `CLAUDE.md` is Claude Code's own: Claude Code 2.1.277+ reads `AGENTS.md` only when there is no `CLAUDE.md`, while Codex and Pi read `AGENTS.md` and ignore or rank `CLAUDE.md` lower. This is for developers whose repository is used by more than one coding agent, such as Claude Code alongside Codex, Pi, Cursor, Copilot or OpenCode. Below you get a tested loading table across ten repositories, one setup that works for all three CLIs, the `CLAUDE.local.md` trap and Codex's 32 KiB cut-off.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi runs Pi, an open-source coding agent CLI, to turn GitHub Issues into merged changes, and its delivery and review sessions read the target repository's `AGENTS.md`, which is why this split matters to me.

## CLAUDE.md vs AGENTS.md: which file each agent reads

I tested Claude Code 2.1.331, Pi 1.6.0 (`@earendil-works/pi-coding-agent`) and Codex CLI 0.167.0 (`codex-cli`) on my Linux machine on 25 November 2026. The table shows what each tool loaded on a direct context probe (P2) across nine file layouts, plus two Codex fallback runs using the `-c` flag shown under Traps; the plain prompt (P1) agreed unless noted.

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

The fourth row is the quiet failure. When a repository has both `AGENTS.md` and `CLAUDE.md` with different text, Claude Code follows only `CLAUDE.md`, while Codex and Pi follow only `AGENTS.md`. A repo that maintains both files separately silently hands different agents different rules.

Each CLI's lookup order explains its column. Pi 1.6.0 checks `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, `CLAUDE.MD` per directory and loads the first match (`dist/core/resource-loader.js`, line 130). Per the [Codex AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md), Codex checks each directory from project root (usually the Git root) down to the working directory for `AGENTS.override.md`, then `AGENTS.md`, then names in `project_doc_fallback_filenames`, taking at most one file per directory and concatenating them root-down. Claude Code uses `AGENTS.md` only when no `CLAUDE.md` file is present.

## How I tested it

I created ten throwaway git repositories under `/tmp/agentsmd-lab` (nine layouts above and a tenth size-limit case) after checking that `/tmp` and `/` had no instruction files. Each rules file said only "End every reply with the word MARK-X on its own line." with a distinct `MARK-` word per file. Tools were disabled in every run so the model could not read files itself: Claude Code ran `--model haiku` with `--tools ""`, Pi ran its default `deepseek/deepseek-flash` with `-nt` (plus `-ne -ns --no-mcp`), and Codex ran `gpt-6-luna` in `-s read-only`.

Each case got a plain prompt P1 ("Reply with the single word OK.") and a probe prompt P2 asking the model to list every `MARK-` word already in context without using tools, or reply `NONE`. The empty repo was the control (`none` in all three tools on P1 and P2) and the `AGENTS.md`-only repo was the positive check (`MARK-AGENTS` in all three). To repeat the probe:

```bash
P2='Without using any tools or reading any files, list every marker word (words in capitals that start with MARK-) that the instructions already in your context ask you to add. If there are none, reply NONE.'

claude -p "$P2" --model haiku --tools "" --setting-sources project,local --no-session-persistence
pi -p --no-session -nt -ne -ns --no-mcp "$P2"
codex exec --skip-git-repo-check -s read-only "$P2"
```

The Codex table rows are from a clean run whose `CODEX_HOME` held only `auth.json` and `config.toml` (`gpt-6-luna`, reasoning effort `medium`). In my first Codex run, with my 6,883-byte personal `~/.codex/AGENTS.md` loaded and reasoning effort `xhigh`, P2 returned the exact same loaded files, while the plain P1 reply carried the project marker in only 1 of the 7 repos where P2 proved the project file was loaded (clean run: 6 of 7). Because two variables changed (the personal file and the effort level), that does not isolate a cause; it does show that a direct probe is the reliable check of what loaded, since a model can ignore an instruction in context on a plain prompt.

## Does Claude Code read AGENTS.md?

Yes, starting in Claude Code 2.1.277, Claude Code reads `AGENTS.md` when there is no `CLAUDE.md` file in the working directory or above. Per the [Claude Code memory docs](https://code.claude.com/docs/en/memory), `CLAUDE.md`, `.claude/CLAUDE.md` and `CLAUDE.local.md` in the working directory or any parent directory count as a `CLAUDE.md` for that check, while `~/.claude/CLAUDE.md`, managed `CLAUDE.md` and `.claude/rules/` do not. Claude Code does not read `AGENTS.local.md`, `AGENTS.override.md` or anything under `.agents/`.

Some sessions still read `CLAUDE.md` only: versions before 2.1.277, sessions where the built-in plugin was disabled with `/plugin`, and in some cases the first session after upgrading from 2.1.276 or earlier.

To read both files without an import, Claude Code documents a "Project instructions" setting in `/config` with four values: `claude-md-or-agents-md` (default), `claude-md-and-agents-md`, `claude-md` and `managed-only`. From the docs (not tested):

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

Before v2.1.285 the plugin ID was `agents-md@builtin`. Claude Code reads this option from `~/.claude/settings.json`, a `--settings` file or managed settings, and ignores it in project or local settings.

## One setup for Claude Code, Codex and Pi

Keep `AGENTS.md` as the single source of shared project rules.

If Claude Code needs extra lines of its own, add a `CLAUDE.md` that starts with `@AGENTS.md`:

```markdown
@AGENTS.md

End every reply with the word MARK-CLAUDE on its own line.
```

In my test, Claude Code read both texts, while Pi and Codex read `AGENTS.md` only, so the Claude-only lines stayed in Claude Code. Per the Claude Code docs, `@AGENTS.md` never causes Claude Code to read `AGENTS.md` twice.

If you have no Claude-specific lines, omit `CLAUDE.md` on Claude Code 2.1.277+ (`orbi-build/orbi` itself has `AGENTS.md` and no `CLAUDE.md`), or add a `CLAUDE.md` symlink to `AGENTS.md` so sessions that read `CLAUDE.md` only still get the rules:

```bash
ln -s AGENTS.md CLAUDE.md
```

All three tools loaded the `AGENTS.md` text through the symlink, and the Claude Code docs confirm a symlink is read once.

Do not write a `CLAUDE.md` that only says in prose "read `AGENTS.md`". Per the Claude Code docs, Claude sees `AGENTS.md` in that case only if it decides to open the file, while the presence of `CLAUDE.md` has already turned off automatic `AGENTS.md` loading.

## Traps

Adding a private `CLAUDE.local.md` beside `AGENTS.md` makes Claude Code drop `AGENTS.md`. In my test, Claude Code loaded `CLAUDE.local.md` only while Pi and Codex still read `AGENTS.md`. Because `CLAUDE.local.md` counts as a `CLAUDE.md` file, an untracked local note can quietly switch off the team's `AGENTS.md` for your own Claude sessions. Put `@AGENTS.md` on the first line of `CLAUDE.local.md` (in my test Claude Code then loaded both files), or set `claude-md-and-agents-md` in `~/.claude/settings.json` (from the docs, not tested).

Adding `AGENTS.override.md` splits Pi and Codex from Claude Code. In my test, Pi and Codex loaded `AGENTS.override.md` only, while Claude Code ignored it and read `AGENTS.md`. Per Pi's `docs/configuration.md`, `AGENTS.override.md` replaces `AGENTS.md` or `CLAUDE.md` only in the same directory and does not suppress files from `~/.pi/agent` or other directories; Codex documents the same per-directory precedence and also supports `AGENTS.override.md` in `~/.codex` or `CODEX_HOME`.

Codex ignores a `CLAUDE.md`-only repository by default (P2 answered `NONE`). To let Codex fall back to `CLAUDE.md`, set `project_doc_fallback_filenames` in `~/.codex/config.toml` (the Codex docs give `TEAM_GUIDE.md` and `.agents.md` as examples):

```toml
project_doc_fallback_filenames = ["CLAUDE.md"]
```

I tested this with Codex's `-c` flag:

```bash
codex exec -c 'project_doc_fallback_filenames=["CLAUDE.md"]' --skip-git-repo-check -s read-only "$P2"
```

Codex loaded `CLAUDE.md` in the `CLAUDE.md`-only repo, and still loaded `AGENTS.md` only when both files existed.

## How long can AGENTS.md be?

The [Claude Code memory docs](https://code.claude.com/docs/en/memory) advise targeting under 200 lines per `CLAUDE.md` file, though Claude Code skips a file only above 4 MiB. Codex stops adding instruction files once the combined size reaches `project_doc_max_bytes`, which defaults to 32 KiB (32,768 bytes) per the Codex docs.

My own repository shows how fast a file crosses that cap. Orbi's delivery prompt instructs Pi to read the target repo's `AGENTS.md` and meet its test requirements, and the review prompt reads `AGENTS.md` too; both sessions keep context files on (`no_context_files = False`), while only the draft and suggest helper sessions turn them off. Before PR #237 (merged 2 September 2026 for Issue #232), `orbi-build/orbi`'s `AGENTS.md` was 630 lines. PR #237 cut it to 129 lines to stay at or under 200 lines. I did not keep it short: it crept back to 154 lines by 10 September 2026, 248 by 20 September 2026, 435 by 1 October 2026, 439 by 1 November 2026, and 444 lines (39,565 bytes) on its last change on 21 November 2026.

To test that 39,565-byte file against Codex's 32 KiB limit, I put a `MARK-HEAD` rule before Orbi's `AGENTS.md` and a `MARK-TAIL` rule after it (448 lines, 39,681 bytes) and ran P2 on all three tools. Claude Code and Pi returned both `MARK-HEAD` and `MARK-TAIL`. Default Codex returned only `MARK-HEAD` in 2 of 2 runs; the tail rule never reached Codex. Raising the limit fixed it:

```bash
codex exec -c project_doc_max_bytes=65536 --skip-git-repo-check -s read-only "$P2"
```

With `project_doc_max_bytes=65536`, Codex returned both markers. Put must-follow rules at the top, keep combined instructions under 32 KiB (or raise `project_doc_max_bytes`), and move rarely needed instructions into skills or nested files.

## AGENTS.md best practices

- Keep `AGENTS.md` as the single source of shared rules so Claude Code, Codex and Pi do not diverge.
- Import with `@AGENTS.md` (or a symlink) instead of prose telling the agent to read `AGENTS.md`, since prose is not an import and `CLAUDE.md` turns off direct `AGENTS.md` loading.
- Put non-negotiable rules first: Codex cuts from the end, so the top of the file survives.
- Keep combined instructions under Codex's 32 KiB default (or raise `project_doc_max_bytes`), and trim toward Claude Code's 200-line guideline.
- Split subdirectory rules into nested `AGENTS.md` files; in my nested test (`AGENTS.md` plus `pkg/AGENTS.md`, run in `pkg/`), all three tools loaded both.
- Verify what actually loaded with a no-tools probe like P2 instead of assuming a file on disk reached the prompt.

As an example layout (not from any real repository), a minimal `AGENTS.md` only needs the rules every change must obey:

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

`AGENTS.md` stays in context on every session unless disabled (for example, Pi's `--no-context-files` or `-nc` flag). Skills (`SKILL.md`) load on demand: per the [Claude Code skills docs](https://code.claude.com/docs/en/skills), skill descriptions stay in context while full skill content loads only when invoked. Pi's `docs/skills.md` documents the same pattern, adding each skill's name, description and path to the system prompt at startup so the model reads `SKILL.md` only when a task matches.

Put repo-wide invariants that every change must respect (test gates and generated-file boundaries) in `AGENTS.md`, and move occasional procedures (release checklists or migration guides) into `SKILL.md` files so they do not fill every session or push `AGENTS.md` past 32 KiB.

## Other tools

I did not test GitHub Copilot or Cursor, and I did not re-test OpenCode on 25 November 2026.

| Tool | Instruction files loaded | Basis |
|---|---|---|
| GitHub Copilot | `AGENTS.md` anywhere in the repo (nearest takes precedence); alternatively a single root `CLAUDE.md` or `GEMINI.md` | [GitHub Copilot docs](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions), not tested |
| Cursor | `AGENTS.md` in project root and subdirectories (nested files combined with parents); rules page does not mention `CLAUDE.md` | [Cursor rules docs](https://cursor.com/docs/context/rules), not tested |
| OpenCode 2.2.5 | Loaded project `AGENTS.md`; did not load project `CLAUDE.md` or `~/.claude/CLAUDE.md` | My test on 2 November 2026 in [OpenCode vs Claude Code](/blog/opencode-vs-claude-code/), not re-tested |

## Related

Read [OpenCode vs Claude Code](/blog/opencode-vs-claude-code/) for the 2 November 2026 OpenCode `AGENTS.md` test, [OpenCode vs Codex](/blog/opencode-vs-codex/) for Codex CLI behavior, and [Pi coding agent vs Claude Code](/blog/pi-coding-agent-vs-claude-code/) for how Pi compares with Claude Code. See [Orbi vs Claude Code](/compare/claude-code/?ref=blog-agents-md) and [Orbi Cloud](/cloud/?ref=blog-agents-md) for how Orbi uses Pi and your repository's `AGENTS.md` to turn GitHub Issues into reviewed, merged pull requests.
