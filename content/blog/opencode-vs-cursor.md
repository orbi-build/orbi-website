---
title: OpenCode vs Cursor: CLI, pricing and unattended runs
date: 2026-11-16
summary: OpenCode and Cursor compared on headless CLI runs, credentials and prices, with real command output and counts of the public PRs their GitHub Apps opened.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-opencode-vs-cursor-card.png
---

OpenCode vs Cursor is a choice between [OpenCode, an MIT-licensed, open-source terminal coding agent from anomalyco](https://github.com/anomalyco/opencode) that uses [whichever model provider you connect](https://opencode.ai/docs/providers/), and [Cursor, a subscription product](https://cursor.com/help/account-and-billing/pricing) with an AI editor, [cloud agents](https://cursor.com/docs/cloud-agent) and a [terminal CLI called `agent`](https://cursor.com/docs/cli/overview). For developers and team leads choosing unattended runs in scripts, cron or CI, credentials are the first difference: OpenCode ran on a free model without a key; Cursor stopped. I have no Cursor account on the test machine and did not create or pay for one, so I made no logged-in Cursor run; authenticated behaviour below comes from Cursor's docs. I compare both vendors' pages on 16 November 2026, give missing-key and wrong-key output and exit codes, four OpenCode tasks' costs and passes with a free model and my DeepSeek key, prices, and public GitHub App PR counts with their limits.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi takes GitHub Issues through implementation, separate review and merge using Pi, another open-source terminal agent; it overlaps with Cursor's cloud-agent half, so read the last section with that in mind.

## OpenCode vs Cursor at a glance

Cursor's docs say it has the capabilities in its column; I did not test them signed in.

| | OpenCode | Cursor |
|---|---|---|
| What it is | [Terminal coding agent](https://opencode.ai/docs/cli/) | [Editor, cloud agents](https://cursor.com/docs/cloud-agent), [CLI](https://cursor.com/docs/cli/overview) |
| Licence / source | [MIT, open source](https://github.com/anomalyco/opencode) | [Subscription product](https://cursor.com/help/account-and-billing/pricing) |
| Where the agent runs | [Your machine](https://opencode.ai/docs/cli/) or [CI runner](https://opencode.ai/v1/docs/github/) | Editor/CLI on your machine; [requests through Cursor](https://cursor.com/help/models-and-usage/api-keys), [CLI needs its API](https://cursor.com/docs/cli/github-actions); [cloud agents in Cursor's cloud](https://cursor.com/docs/cloud-agent) |
| Models | [Connected providers](https://opencode.ai/docs/providers/), [free models](https://opencode.ai/docs/console/models/), optional [Go](https://opencode.ai/docs/console/go/)/[Console](https://opencode.ai/docs/console/) | [Grok, Composer in plan; third-party models from Premium at API list price](https://cursor.com/help/account-and-billing/pricing); [own keys in editor settings](https://cursor.com/help/models-and-usage/api-keys) |
| Headless command | [`opencode run "..."`](https://opencode.ai/docs/cli/) | [`agent -p "..."`](https://cursor.com/docs/cli/headless) |
| Credential for scripts | [Provider key](https://opencode.ai/docs/providers/), e.g. `DEEPSEEK_API_KEY`; free models need none in my test | [`CURSOR_API_KEY`](https://cursor.com/docs/cli/reference/authentication) |
| With no credential | Free model, exit 0: [my test](#what-happens-when-the-credential-is-missing-or-wrong) | `Authentication required`, exit 1: [my test](#what-happens-when-the-credential-is-missing-or-wrong) |
| Cheapest way to run it | [$0 free models](https://opencode.ai/docs/console/models/) or [own key, provider bill](https://opencode.ai/docs/providers/); [Go $10/month optional](https://opencode.ai/docs/console/go/) | [Free $0 limited; Plus $8/month; cloud agents and third-party models from Premium $30/month](https://cursor.com/help/account-and-billing/pricing) |
| GitHub entry point | [`/opencode` or `/oc`, your Actions runner; V1 docs only](https://opencode.ai/v1/docs/github/) | [`@cursor` on a PR or issue starts a cloud agent](https://cursor.com/docs/cloud-agent) |

With OpenCode you bring the model and machine. With Cursor you buy the plan, including the machine for cloud agents. Free/Plus prices describe plans; their CLI access is unverified.

## OpenCode vs Cursor CLI: running headless

### The commands

The [Cursor install and print-mode commands](https://cursor.com/docs/cli/overview) and [OpenCode V2 package](https://opencode.ai/docs/) and [run command](https://opencode.ai/docs/cli/) are below. The npm install is local; add its `node_modules/.bin` directory to `PATH` before calling `opencode`.

```bash
curl https://cursor.com/install -fsS | bash
agent -p "Reply with exactly: hi"

npm install @opencode/cli
opencode run --standalone "Reply with exactly: hi"
```

I installed both into clean Linux homes on 16 November 2026: Cursor CLI `2026.11.13-eacade1` and OpenCode `2.3.0`. I mistakenly installed `opencode-ai` first and got `1.19.5`; [older packages install OpenCode 1](https://opencode.ai/docs/). All OpenCode results use V2 with [`--standalone`](https://opencode.ai/docs/cli/), leaving no shared background service behind.

Cursor's installer placed `agent` and `cursor-agent` in `~/.local/bin`. Its [GitHub Actions snippet](https://cursor.com/docs/cli/github-actions) instead adds `$HOME/.cursor/bin` to `PATH`. I did not test on a GitHub runner; check which directory exists on yours.

### What happens when the credential is missing or wrong

Both tables used `Reply with exactly: hi`. Long lines end with `…`. Cursor had no logged-in session; its wrong key was `CURSOR_API_KEY=key_bad`.

| Case | Command | What it printed | Exit code |
|---|---|---|---|
| No credentials | `agent -p "Reply with exactly: hi"` | `Error: Authentication required. …` | 1 |
| No credentials, force | `agent -p --force "Reply with exactly: hi"` | `Error: Authentication required. …` | 1 |
| Wrong `CURSOR_API_KEY` | `agent -p "Reply with exactly: hi"` | `⚠ Warning: The provided API key is invalid.` | 1 |
| No credentials | `agent status` | `Not logged in` | 0 |
| Wrong `CURSOR_API_KEY` | `agent status` | `Not logged in` | 0 |
| No credentials | `agent models` | `Error: Authentication required. …` | 1 |

For OpenCode, Command lists only extra flags, inserted before the prompt below. Key cases supplied `DEEPSEEK_API_KEY`; the wrong key was `sk-bad`. Each case had a fresh home.

```bash
opencode run --standalone "Reply with exactly: hi"
```

| Case | Command | What it printed | Exit code |
|---|---|---|---|
| No credentials, no model | No extra flags | `> build · big-pickle`; `hi` | 0 |
| Key, no model | No extra flags | `> build · iceman-free`; `hi` | 0 |
| Key, pinned model | `-m deepseek/deepseek-flash` | `> build · deepseek-flash`; `hi` | 0 |
| Wrong key, pinned model | `-m deepseek/deepseek-flash` | `Error: Authentication Fails, Your api key: ****-bad is invalid …` | 1 |
| No key, pinned model | `-m deepseek/deepseek-flash` | `Error: Model unavailable: deepseek/deepseek-flash` | 1 |
| Config sets `deepseek/deepseek-flash`, no key | No extra flags | `> build · big-pickle`; `hi` | 0 |
| Free models disabled, no credentials | No extra flags | `Error: No model is available for session …` | 1 |
| Free models disabled, key, no model | No extra flags | `> build · deepseek-flash`; `hi` | 0 |

Cursor's run failed closed. `agent status` returned 0 without login and with a wrong key, making it useless as a CI authentication precheck. `agent models` returned 1 without credentials; I could not test it with valid credentials.

OpenCode ran without a key. Even supplying my DeepSeek key did not select DeepSeek unless I pinned it or disabled free models. The no-model cases each picked the same model across three repetitions. OpenCode's [model docs](https://opencode.ai/docs/models/) describe the fallback as “falls back to the newest available supported model”. A configured default was insufficient when its key was missing.

Those free models have different data terms. The [model page](https://opencode.ai/docs/console/models/) says Big Pickle's collected data may improve the model during its free period; Iceman Free's data is retained and used to improve it. A CI secret going missing can therefore send code to another model under different terms and still report success.

I'd disable free models and pin the model:

```bash
export OPENCODE_DISABLE_FREE_MODELS=1
opencode run --standalone -m deepseek/deepseek-flash "your prompt"
```

[`OPENCODE_DISABLE_FREE_MODELS=1` hides free models](https://opencode.ai/docs/models/). With both lines in place, a missing key and an empty `DEEPSEEK_API_KEY` each gave `Error: Model unavailable: deepseek/deepseek-flash` and exit 1, a wrong key gave the provider's `Authentication Fails` error and exit 1, and the real key ran on `deepseek-flash` and exited 0. Replace `deepseek/deepseek-flash`, my model, with yours.

### What a headless run may do without asking

With no config file and no `--auto` (the probes pinned `-m deepseek/deepseek-flash`), OpenCode created a project file, ran a shell command writing outside the project, and ran `curl` against `https://example.com`, returning HTTP 200. All three exited 0 and nothing was asked or rejected. That matches the [permission defaults](https://opencode.ai/docs/permissions/#defaults): every agent starts from a base rule of `{ "action": "*", "resource": "*", "effect": "allow" }`, with `ask` only for reading `.env` files, and the docs add that reads and edits outside the project “proceed without a prompt”. So the default policy allowed all three probes; the `.env` read rule and the rules built into each agent still apply. To restrict anything else, you add rules.

To restrict shell commands, I put this rule in `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "permissions": [
    { "action": "shell", "resource": "*", "effect": "ask" }
  ]
}
```

The outside-write probe then reported: `This non-interactive run cannot ask the user for permission, so the request was rejected. Continue without this action.` The file was absent, yet exit was 0. Adding `--auto` let it through. Changing `"effect"` to `"deny"` blocked the shell command with or without `--auto`, matching the [flag's explicit-deny exception](https://opencode.ai/docs/permissions/).

On task 1 with the ask rule, OpenCode edited the file, but its `python3 -m unittest` calls were rejected. The tests passed when I ran them afterwards.

Cursor's authenticated behaviour here is untested. [Cursor's docs say](https://cursor.com/docs/cli/headless) print mode edits workspace files without `--force`; outside writes and unapproved MCP tools or web fetches are rejected, as are shell commands neither allowlisted nor runnable in an enabled sandbox. The docs say `--force`/`--yolo` allows everything except [`permissions.deny`](https://cursor.com/docs/cli/reference/permissions) and team-policy blocks. [Team admins can disable headless mode](https://cursor.com/docs/cli/headless), enforced by the client.

In either tool, exit 0 does not establish that every step ran; have your script check tests and the diff.

## Free model vs my own key: four small tasks on OpenCode

I reused the four tiny Python repositories from [OpenCode vs Codex](/blog/opencode-vs-codex/): fix a bug in one file, implement a function, find a bug across files, and fix several bugs with extra hidden checks. Each ran three times per model in a fresh clone and clean home. A pass means the repository tests passed afterwards, test files were unchanged, and task 4's hidden checks passed.

I pinned both models: `deepseek/deepseek-flash` with my key, and `opencode/big-pickle`, the free model selected by the no-credential probe. Medians are separate per metric; a row need not describe one run.

| Task | Model | Passed | Median steps | Median wall time | Median cost reported by OpenCode |
|---|---|---|---|---|---|
| 1: one-file bug | `deepseek/deepseek-flash` | 3/3 | 5 | 6.6s | $0.00109 |
| 1: one-file bug | `opencode/big-pickle` | 3/3 | 3 | 17.4s | $0.00000 |
| 2: implement function | `deepseek/deepseek-flash` | 3/3 | 5 | 6.1s | $0.00111 |
| 2: implement function | `opencode/big-pickle` | 3/3 | 5 | 20.2s | $0.00000 |
| 3: across files | `deepseek/deepseek-flash` | 3/3 | 5 | 7.3s | $0.00132 |
| 3: across files | `opencode/big-pickle` | 3/3 | 5 | 32.4s | $0.00000 |
| 4: hidden checks | `deepseek/deepseek-flash` | 3/3 | 5 | 13.2s | $0.00241 |
| 4: hidden checks | `opencode/big-pickle` | 3/3 | 5 | 34.5s | $0.00000 |

DeepSeek: 12 runs, 12 passes, $0.01686 total reported cost, 7.1s median wall time. Big Pickle: 12 runs, 12 passes, $0.00000 total reported cost, 20.1s median wall time.

These tasks are too small to separate models or tools. Cost is OpenCode's event-stream `cost` field summed across steps, not my DeepSeek invoice. Free means free of charge with the data terms above; [Big Pickle is free “for a limited time”](https://opencode.ai/docs/console/models/). I broke task 4's second DeepSeek repetition by editing the runner while it was running, then reran it; the table uses the replacement. I could not run these tasks on Cursor CLI because I had no account.

## OpenCode vs Cursor pricing

Monthly prices on 16 November 2026. [Cursor is part of The X Subscription; legacy Pro/Pro+ plans are closed to new customers](https://cursor.com/help/account-and-billing/pricing).

| Cursor plan | Monthly price | Access |
|---|---|---|
| [Free](https://cursor.com/help/account-and-billing/pricing) | $0 | Limited; Cursor models only |
| [Plus](https://cursor.com/help/account-and-billing/pricing) | $8 | Cursor models (Grok, Composer) at fixed settings; no cloud agents, Bugbot, Origin or third-party models |
| [Premium](https://cursor.com/help/account-and-billing/pricing) | $30 | Adds those; third-party models separately at API list price from prepaid credit |
| [Super](https://cursor.com/help/account-and-billing/pricing) | $100 | Higher usage |
| [Ultra](https://cursor.com/help/account-and-billing/pricing) | $200 | Higher usage |
| [Teams](https://cursor.com/help/account-and-billing/pricing) | $30/$100/$200 per seat | Seat-tier usage |

| OpenCode option | Price | What you pay for |
|---|---|---|
| [CLI](https://github.com/anomalyco/opencode) | Free, MIT | Model usage separate |
| [Free models](https://opencode.ai/docs/console/models/) | $0 | Free periods; data terms vary |
| [Own provider key](https://opencode.ai/docs/providers/) | Provider bill | My 12 DeepSeek tasks reported $0.01686 |
| [Go / Go Plus / Go Teams](https://opencode.ai/docs/console/go/) | $10/month / $40/month / $20/member/month | Selected open models; monthly dollar limits |
| [Console](https://opencode.ai/docs/console/models/) | Pay as you go, per token | Example below |

[Console's Claude Opus 5.5 row](https://opencode.ai/docs/console/models/) lists, per million tokens: $4.00 input, $20.00 output, $0.20 cached read and $5.00 cached write. [Go is optional](https://opencode.ai/docs/console/go/), as is [Console](https://opencode.ai/docs/console/); I tested neither paid service.

[Cursor's own-key docs](https://cursor.com/help/models-and-usage/api-keys) describe editor settings and chat models only; Tab uses built-in models. Cursor's docs say your provider bills model usage, and requests still pass through Cursor's servers. On Premium, Super and Ultra, own-key requests use neither included usage nor prepaid credit; on Teams/Enterprise, eligible third-party models incur the Cursor Token Rate of $0.25 per million tokens even with your key. I found no docs sentence saying whether own keys apply to the CLI. Its help lists `bedrock`, described as `Configure AWS Bedrock usage for CLI`; I did not test it.

I'd read Cursor's price as a seat and OpenCode's as my model bill. Which costs less depends on token usage. I have no Cursor usage data, so I give no cheaper-product verdict.

## Cursor vs OpenCode on GitHub: the PRs their Apps opened

OpenCode's [V1 GitHub integration](https://opencode.ai/v1/docs/github/) runs on your Actions runner with your model key after `/opencode` or `/oc`. Its App's PR author is `opencode-agent[bot]`. The documented `use_github_token: true` mode requires no App installation, so those PRs fall outside this App count, as do PRs you open yourself after terminal work. The V2 docs index has no GitHub page, and CLI `2.3.0` has no `github` subcommand. I did not test this integration on V2. Cursor's [cloud agents](https://cursor.com/docs/cloud-agent) open PRs observed here as `cursor[bot]`.

I counted public PRs created 2 to 8 November 2026 UTC on 16 November 2026. These are states at query time; they can change. The rows are not a merge-rate comparison.

| Author | Opened | Merged | Closed unmerged | Still open | Draft now | Repositories |
|---|---|---|---|---|---|---|
| `opencode-agent[bot]` | 167 | 119 | 24 | 24 | 3 | 32 |
| `cursor[bot]` | 4,758 | 928 | 440 | 3,390 | 3,601 | 750 |

The populations differ in scale: 167 PRs across 32 repositories against 4,758 across 750. OpenCode's publisher also matters: in October, 2,709 of its App's 3,435 PRs were in anomalyco, including 2,357 in `anomalyco/models.dev`. Outside anomalyco, October had 726 opened and 530 merged. In the November week, anomalyco accounted for 37 of 167.

Draft now overlaps the state columns: Cursor's 3,601 flagged records include 363 closed unmerged and 36 merged PRs. I did not establish why merged records retained the flag, or the default at creation. Of all 4,758, 19.5% were merged; among the 1,157 not flagged draft, 892 (77.1%) were. [Devin vs Cursor](/blog/devin-vs-cursor/) found the same gap for October: 19.2% of all `cursor[bot]` PRs merged, 73.0% of those not flagged draft. The creation windows and observation dates differ, giving unequal follow-up periods.

I also read `merged_by`: all 119 merged OpenCode App PRs had 87 user-account merges and 32 bot merges, including 28 by `github-actions[bot]` and 4 by `opencode-agent[bot]`. Among 150 randomly sampled merged Cursor PRs, 101 were merged by users and 49 by bots, including 43 by `cursor[bot]`. The field does not say who requested the merge.

I take this as evidence of public usage: a small set of repositories wiring OpenCode into Actions, and a larger set with mostly draft Cursor PRs. It cannot tell me which agent's code gets accepted more often. Private repositories and other PR authors are absent.

To count your own:

```bash
gh api -X GET search/issues \
  -f q='is:pr repo:OWNER/REPO author:app/cursor is:merged created:2026-11-02..2026-11-08' \
  -q .total_count
```

Replace `OWNER/REPO`, the App slug (`cursor` or `opencode-agent`) and dates; drop `is:merged` for the total. It needs GitHub CLI logged in. My tests returned 17 merged PRs in a repository with matches; no matches printed 0 and exited 0. A nonexistent repository or App produced `gh: Validation Failed (HTTP 422)` and exit 1. The search API allows 30 requests a minute. The [fuller script](/blog/devin-vs-cursor/#count-it-yourself) counts the other states too.

## Which one I'd pick, and what I'd check first

- Choose Cursor for an [editor with completions and a subscription bill](https://cursor.com/help/account-and-billing/pricing). I have not compared the editors hands-on.
- Choose OpenCode to pick your own [provider](https://opencode.ai/docs/providers/), run on your own [machine or CI runner](https://opencode.ai/v1/docs/github/), or [read the source](https://github.com/anomalyco/opencode).
- For unattended Cursor runs, supply [`CURSOR_API_KEY`](https://cursor.com/docs/cli/reference/authentication) and [access to Cursor's API](https://cursor.com/docs/cli/github-actions). [Cloud agents and third-party models start at Premium](https://cursor.com/help/account-and-billing/pricing).
- For unattended OpenCode runs, pin `-m`, set `OPENCODE_DISABLE_FREE_MODELS=1`, add permission rules and verify results yourself.
- Before buying seats, I'd run the same real tickets through both on copies of my repository for a week and count what merged.

## Where Orbi fits, and where it doesn't

Orbi does not review or merge PRs opened by OpenCode or Cursor. Its work starts with a GitHub Issue labelled `ai-ready`: it implements, has a separate session review, fixes findings, and merges when review passes and CI is green. It stops for required human approval. A release starts when a person requests it.

Orbi has no editor or terminal chat; its only intake is a GitHub Issue. Its engine is [Pi, an open-source terminal agent like OpenCode](/blog/pi-coding-agent-vs-opencode/). The [Cursor comparison](/compare/cursor/) covers the handoff. Anyone wanting to pair with an agent in an editor or terminal should skip Orbi.

## Related

- [OpenCode vs Codex CLI: same model, headless](/blog/opencode-vs-codex/)
- [Devin vs Cursor: what happens to the PRs they open](/blog/devin-vs-cursor/)
- [Cursor alternatives: editors, agents and who merges](/blog/cursor-alternatives/)
- [Orbi compared with Cursor](/compare/cursor/)
- [Orbi Cloud](/cloud/?ref=blog-oc-vs-cursor)
