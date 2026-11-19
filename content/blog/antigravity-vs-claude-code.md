---
title: Antigravity vs Claude Code: headless CLI test
date: 2026-11-19
summary: Antigravity vs Claude Code on one failing Python test: Claude Code needs explicit permissions to fix it; Antigravity hit errors on a free Gemini API key.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-antigravity-vs-claude-code-card.png
mirror: antigravity-vs-claude-code
---

[Google Antigravity](https://antigravity.google/docs/cli/reference) is Google's agent-first coding product, with a desktop app, IDE extensions and a terminal CLI called `agy`; [Claude Code](https://code.claude.com/docs/en/permission-modes) is Anthropic's terminal coding agent. For this Antigravity vs Claude Code test, I ran both CLIs headless on the same failing Python test, for anyone picking one for scripts or unattended runs.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi turns GitHub Issues into reviewed, merged PRs using Pi, a different open-source agent; it does not run Antigravity or Claude Code.

I did not run the desktop app. My Antigravity attempts hit Gemini API errors or timed out, so I have no successful `agy` fix run to compare with Claude Code's fixes. The Antigravity permission defaults below are attributed to Google's documentation.

## Antigravity vs Claude Code at a glance

| Your requirement | Start with | What to check |
|---|---|---|
| A terminal agent in a Claude subscription | [Claude Code](https://claude.com/pricing) | Free excludes it; paid plans include it |
| Google's coding product with a terminal CLI | [Antigravity](https://antigravity.google/docs/cli/reference) | Account authentication versus Gemini API key configuration |
| An unattended fix verified on this fixture | Claude Code with explicit permissions | Allow `Write` as well as `Edit` (or use `acceptEdits`), plus the test command |
| Unattended Antigravity runs | `agy`, with a timeout | API availability and JSON status (from my failed runs and Google's docs) |
| A result your script can accept | Either | Inspect the diff and run tests independently |

## What I tested

I tested on 19 November 2026 on Linux with `agy 1.5.12`, Claude Code `2.1.322` and Python `3.14.7`. Each attempt started from a fresh copy of the same committed, failing fixture. The runner recorded the command, process exit code, wall time, output, Git status and diff, then ran the tests independently.

Antigravity used a Gemini API key and an isolated HOME. Its settings file contained only the provider selection below. Claude Code used its own login; I passed `--safe-mode --setting-sources project` so my user settings and hooks did not apply; the fixture has no project settings. The `--model sonnet` runs reported `claude-sonnet-5-5` in JSON `modelUsage`.

The two agents used different models, so these runs say how each CLI behaves on one small task and nothing about which model writes better code.

### The failing Python fixture

Save these files in a throwaway Git checkout and commit the failing version. Start each attempt from that version.

`slug.py`:

```python
def slugify(title: str) -> str:
    """Turn a post title into a URL slug."""
    return title.lower().replace(" ", "-")
```

`test_slug.py`:

```python
import unittest
from slug import slugify

class SlugTest(unittest.TestCase):
    def test_spaces(self):
        self.assertEqual(slugify("Hello World"), "hello-world")

    def test_punctuation_dropped(self):
        self.assertEqual(slugify("Antigravity vs. Claude Code!"), "antigravity-vs-claude-code")

if __name__ == "__main__":
    unittest.main()
```

The spacing test passes. The punctuation test fails because the function returns `antigravity-vs.-claude-code!` instead of `antigravity-vs-claude-code`.

### Antigravity with a Gemini API key

I installed the CLI with Google's documented installer, `curl -fsSL https://antigravity.google/cli/install.sh | bash`. It put version 1.5.12 at `~/.local/bin/agy`, a 257 MB binary, and appended a PATH line to `~/.zshrc`, `~/.bashrc`, `~/.bash_profile` and `~/.profile`. Check those files afterwards if you manage your shell configuration by hand.

Google's [authentication guide](https://antigravity.google/docs/install) describes the API key route: set `modelProvider` to `gemini` and export `GEMINI_API_KEY`; setting only the variable has no effect. In the isolated HOME, I used `~/.gemini/antigravity-cli/settings.json`:

```json
{"modelProvider":"gemini"}
```

Set the key in the environment before running `agy`:

```bash
export GEMINI_API_KEY="<your Gemini API key>"
```

I pointed HOME at a separate directory holding only that settings file, so my own Antigravity configuration could not affect the run. Create that directory and settings file, then run the command:

```bash
export AGY_HOME="$HOME/agy-home"
mkdir -p "$AGY_HOME/.gemini/antigravity-cli"
echo '{"modelProvider":"gemini"}' > "$AGY_HOME/.gemini/antigravity-cli/settings.json"
HOME="$AGY_HOME" GEMINI_API_KEY="<your Gemini API key>" timeout 480 ~/.local/bin/agy \
  -p 'Fix slugify in slug.py so every test in test_slug.py passes, then run python3 -m unittest and report the result.' \
  --model gemini-3.6-flash-low \
  --output-format json \
  --print-timeout 7m
```

`-p` runs one prompt without the interactive interface and exits. `-low` is the low thinking level listed by `agy models`. I used 3.6 Flash because, right before this run, a direct API request to it returned HTTP 200 while 3.8 Flash returned 503. Pick a model from `agy models` that still has quota. Keep the outer `timeout` longer than `--print-timeout`: in my runs a print timeout exited 3, while an outer `timeout` kill exits 124.

This attempt, `ag-e2-default-b2`, returned a Gemini API 503 error and reached its print timeout. It did not fix the file.

### Claude Code with its own login

With Claude Code already authenticated, the default-permission attempt was:

```bash
timeout 600 claude --safe-mode --setting-sources project \
  --model sonnet --output-format json \
  -p 'Fix slugify in slug.py so every test in test_slug.py passes, then run python3 -m unittest and report the result.'
```

After each agent exits, run `python3 -m unittest` yourself and inspect `git status --short` and `git diff`. A successful fix changes `slug.py`, leaves `test_slug.py` untouched and passes both tests. Some runs also left an untracked `__pycache__/` directory.

## Permissions when nobody approves

### Claude Code: an answer can succeed while the fix is denied

[Anthropic's permission-mode docs](https://code.claude.com/docs/en/permission-modes) say that since `v2.1.302`, `claude -p` without an explicit permission mode starts in Manual mode. Tool calls needing approval are denied unless another mechanism allows them.

My default run, `cc-e2-default`, attempted to write `slug.py` with the `Write` tool and run the tests with `Bash`. Both were denied. Claude Code printed the proposed fix in its answer, left the file unchanged and exited 0 with `is_error: false`. The independent test run still failed.

All runs used the same fix prompt. Every run in this table exited 0, including the three that left the test failing.

| Permission configuration | Run | Result | Exit |
|---|---|---|---|
| No permission mode or allow rules | `cc-e2-default` | Write and Bash denied; no fix | 0 |
| `--allowedTools Edit "Bash(python3 -m unittest:*)"` | `cc-e3-allow`, `cc-e3-allow-r2` | Tests ran; Write denied; still failing | 0 |
| `--allowedTools "Edit(./**)" "Bash(python3 -m unittest:*)"` | `cc-e3c-editpath` | Fixed; 2/2 passed | 0 |
| `--permission-mode acceptEdits --allowedTools "Bash(python3 -m unittest:*)"` | `cc-e3b-acceptedits` | Fixed; 2/2 passed | 0 |
| `--permission-mode dontAsk --allowedTools "Read,Edit,Write,Bash(python3 -m unittest:*)"` | `cc-e3d-dontask` | Fixed; 2/2 passed | 0 |
| `--dangerously-skip-permissions` | `cc-e4-skip` | Fixed; 2/2 passed | 0 |

In both failed allow-rule runs, the model chose `Write` and the bare `Edit` rule did not authorize it. The allowed test command ran against the unchanged source. The path-scoped `Edit(./**)` configuration succeeded without a permission denial, but its result JSON does not identify which tool changed the file. These runs do not prove whether the path form or a different tool choice made the difference. In practice, allow `Write` explicitly, as the `dontAsk` command below does, or use `acceptEdits`.

For CI, I would use the tested `dontAsk` command and list the required tools explicitly:

```bash
timeout 600 claude --safe-mode --setting-sources project \
  --model sonnet --output-format json \
  --permission-mode dontAsk \
  --allowedTools 'Read,Edit,Write,Bash(python3 -m unittest:*)' \
  -p 'Fix slugify in slug.py so every test in test_slug.py passes, then run python3 -m unittest and report the result.'
```

The [documented `dontAsk` mode](https://code.claude.com/docs/en/permission-modes) denies calls that would otherwise prompt, so the session does not wait for input. The `acceptEdits` configuration also worked when I allowed the test command separately. I would reserve `--dangerously-skip-permissions` for isolated containers. [Run Claude Code unattended](/blog/run-claude-code-unattended/) covers the surrounding process setup.

With the diagnostic prompt, "List the files in this directory and tell me which unit test fails and why. Do not change any files.", Claude Code changed nothing (`cc-e1-readonly`). One Bash call attempting to run tests was denied; it diagnosed the punctuation bug by reading the files and exited 0.

### Antigravity: failed attempts, with defaults from Google's docs

The recorded fix attempt `ag-e2-default-b2` used `gemini-3.6-flash-low`, returned `status: "ERROR"` with an API 503 message and ended with `finished_reason: "print_timeout"`. Its process exited 3 after 420.9 seconds. The Git diff was empty and the punctuation test still failed.

The diagnostic attempts also hit 503 errors or print timeouts. I have no successful `agy` fix run and cannot report measured permission behavior for the default mode, an allow rule, plan mode or skipped permissions. In particular, an unchanged file after an API failure does not show that a permission rule blocked a write.

Google's [CLI reference](https://antigravity.google/docs/cli/reference) says `agentMode` defaults to `"auto"` where supported from `v1.5.7` onward, otherwise to the standard default mode. The same reference says auto mode requires the terminal sandbox. It auto-approves edits and runs commands in that sandbox by default. A command that needs to run outside the sandbox is checked automatically: safe, reversible ones run without prompting, and irreversible actions still prompt. Google's [sandbox page](https://antigravity.google/docs/sandbox) says Linux uses kernel namespaces for that isolation.

The [headless documentation](https://antigravity.google/docs/cli/headless) says actions that need approval and cannot obtain it are soft-denied: the run continues, exits 0 and prints a permission notice to stderr. My runs ended on API errors and timeouts before reaching that point.

Google documents advance grants through `permissions.allow`, including `command(git)` and `write_file(src/)`. It also documents `--dangerously-skip-permissions` as approving every tool request. I could not test any of them.

## Failures a script must catch

My Antigravity attempts used a free-tier Gemini API key. Many returned Gemini API 503 errors reporting high demand. I reproduced a 503 with a direct `curl` request to the Gemini API using the same key, without `agy`.

Even a short response and exit 0 did not establish success. The model-availability probes asked only for `Reply with exactly: ok`:

| Antigravity probe model | Response | JSON status | Process exit |
|---|---|---|---|
| `gemini-3.6-flash-low` | `ok` | `ERROR`, with API 503 | 0 |
| `gemini-3.8-flash-low` | `ok` | `ERROR`, with API 503 | 0 |
| `gemini-4-hydrogen-low` | `ok` | `SUCCESS` | 0 |

In the two `ERROR` rows, one JSON envelope held both the reply `ok` and a 503 message of the form `API error (attempt N)`, and the status stayed `ERROR`.

The `SUCCESS` probe only answered a one-line prompt; it edited nothing and ran no tests. Probes for `gemini-3.1-pro-low` and `gemini-4-carbon-low` returned Free Tier quota-exceeded errors on their first request, so those models appear to have no usable free quota on this key. Later fix attempts on `gemini-3.6-flash-low` failed in under a second with a 429: the free tier allowed 20 `generate_content` requests per day for that model, and my earlier attempts and probe requests had used them up. One 503 probe logged `attempt 5`, so the CLI retried that request at least four times; a failed run can therefore use several requests from the daily quota. The 429 runs ended in under a second. These limits belong to the Gemini API key's free tier; I did not test Antigravity's own plan quotas.

Authentication and model-selection failures were different:

| Setup | Observed result | Wall time | Exit |
|---|---|---|---|
| `agy`, not logged in | Printed a Google OAuth URL, waited, then `authentication failed or timed out` | 60.2s | 1 |
| `agy`, Gemini provider selected but no key | Clear message that `GEMINI_API_KEY` was not set | 0.1s | 1 |
| Claude Code, not logged in | `Not logged in · Please run /login` | 0.7s | 1 |
| Claude Code, unknown model | Model-selection error; `is_error: true` | 2.0s | 1 |

For Antigravity, check `.status` as well as the process exit code, and retain stderr for permission notices. For Claude Code, check `.is_error` and `permission_denials`; the default run had no JSON error but did have denied tools and an unfixed test. Run against my saved JSON, the first check exits 1 for the failed `agy` run `ag-e2-default-b2`; the second exits 1 for Claude Code's default run and 0 for the `dontAsk` run:

```bash
jq -e '.status == "SUCCESS"' agy-result.json
jq -e '.is_error == false and (.permission_denials | length) == 0' claude-result.json
```
 In both cases, inspect the diff and run tests independently before accepting the change.

Set a time limit on the job. I used Antigravity's `--print-timeout` as well as an outer `timeout`; several attempts exited 3 with partial output at the print limit. Google's [headless guide](https://antigravity.google/docs/cli/headless) documents that timeout flag. These failure times do not measure coding speed.

## Models and plans

I checked the official plan pages on 19 November 2026. My Gemini API key runs are separate from Antigravity's Google AI plan quotas; I did not test those subscription allowances.

### Claude Code access

| Claude plan | Price and Claude Code access |
|---|---|
| [Free](https://claude.com/pricing) | Does not include Claude Code |
| [Pro](https://claude.com/pricing) | $20/month billed monthly; $17/month with annual billing; includes Claude Code |
| [Max](https://claude.com/pricing) | $100/month; includes Claude Code |
| [Ultra](https://claude.com/pricing) | $200/month; includes Claude Code |

I did not measure what the fixture runs cost.

### Antigravity access and model availability

Google's [plans page](https://antigravity.google/docs/plans) says all plans receive baseline quota, including Gemini 3.8 Flash and access to the CLI. On Antigravity's free plan, quota refreshes weekly. Google AI Pro and Ultra raise limits and refresh quota every five hours, with weekly limits also applying. Pro and Ultra users can use purchased AI credits for overages.

The same page says BYOK and custom endpoints are not supported for additional Antigravity rate limits. The [Gemini API provider setting](https://antigravity.google/docs/cli/reference) used in this test sends requests directly to the Gemini API; it does not demonstrate an increase to a Google AI subscription's quota. See [Google's plan details](https://antigravity.google/docs/plans) for the available routes; I have not verified US dollar prices for those plans.

Google's [model table](https://antigravity.google/docs/models) lists Claude Sonnet 5.5 (thinking) and Claude Opus 5.5 (thinking) for Google AI Pro with a non-trial subscription, Ultra and Enterprise. When I checked it on 19 November 2026, it still listed Claude Sonnet 4.6, Claude Opus 4.6 and GPT-OSS-120b, with a note that they would be removed on 18 November 2026. I did not verify whether the removal had happened.

In my Gemini API key configuration, `agy models` listed only Gemini models. So don't assume a model in the plan table is available through the API key route.

## Codex CLI on the same test

If your shortlist is Antigravity vs Codex instead, here is Codex on the same fixture. I tested Codex CLI `0.167.0` with `gpt-6.2-sol` through a ChatGPT login on the same Python fixture. In this test environment, the run without a sandbox override reported a read-only sandbox and approval `never`. It left the source unchanged, as Claude Code's default run did, but for a different reason: Codex could not write, while Claude Code tried and was denied. Google documents Antigravity's auto mode as approving workspace edits.

These commands rely on that environment's default model; I did not pass a model flag.

```bash
timeout 400 codex exec --skip-git-repo-check \
  'Fix slugify in slug.py so every test in test_slug.py passes, then run python3 -m unittest and report the result.'
```

Allowing workspace writes fixed the source:

```bash
timeout 400 codex exec -s workspace-write \
  'Fix slugify in slug.py so every test in test_slug.py passes, then run python3 -m unittest and report the result.'
```

| Codex configuration | Run | Result | Wall time / exit |
|---|---|---|---|
| No sandbox override in this environment | `cx-e2-default` | No change; one test still failed | 18.9s / 0 |
| `-s workspace-write` | `cx-e4-workspace-write` | Fixed; both tests passed | 16.1s / 0 |

[OpenCode vs Codex](/blog/opencode-vs-codex/) has a separate CLI comparison; [Codex yolo mode](/blog/codex-yolo-mode/) covers broader permission settings.

## Where Orbi fits

The commands above run an agent against a checkout. You still need to arrange review and merging if you put them in a delivery workflow.

Orbi starts from a GitHub Issue labelled `ai-ready`, implements with Pi, has a separate session review the work, and merges when review passes and CI is green.

In Claude Code, the [Orbi plugin](https://github.com/orbi-build/orbi/blob/main/integrations/claude-plugin/README.md) provides `/orbi:ship` to turn the current task into an Issue. In a repository Orbi delivers, it creates the Issue with `ai-ready` after confirmation. `/orbi:status` checks delivery status.

Antigravity is not in that README's supported list. I have not tested an Antigravity integration and cannot claim the Orbi skills work there. [Orbi compared with Claude Code](/compare/claude-code/) explains the Issue-to-PR handoff; Orbi is a poor fit when you want an agent to pair with you live.

## Related

- [Cline vs Claude Code: same model, headless test](/blog/cline-vs-claude-code/)
- [Cursor vs Claude Code: workflow, plans and usage](/blog/cursor-vs-claude-code/)
- [Run Claude Code unattended](/blog/run-claude-code-unattended/)
- [Orbi compared with Claude Code](/compare/claude-code/)
- [Orbi Cloud](/cloud/?ref=blog-ag-vs-cc)
