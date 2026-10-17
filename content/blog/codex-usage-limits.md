---
title: How to check and reset Codex usage limits
date: 2026-10-17
summary: Codex usage limits use five-hour and weekly windows set by plan. Check them on the Usage page or with /status, see when they reset, and keep runs going.
lang: en
author: Lawrence Liu
image: /img/blog-codex-usage-card.png
mirror: codex-usage-limits
---

Codex usage limits are the allowance included with your ChatGPT plan. On most plans it is measured in a five-hour window, a weekly window, or both. Your remaining balance and reset times are on the [Codex usage dashboard](https://chatgpt.com/codex/settings/usage) (Settings → Usage), and `/status` shows your remaining limits inside a CLI session. If you hit a limit mid-turn, Codex lets the agent keep working on that turn, subject to fair-use limits. After that you wait for the reset, use a reset or credits if your account has them, or switch the CLI to API billing.

Every OpenAI fact below links to the official page it comes from. All were retrieved on 17 October 2026, and OpenAI changes these terms often, so your own Usage page wins whenever it disagrees with this post.

## How Codex usage limits work

If you also use ChatGPT Work, a separate feature from ordinary ChatGPT chat, it spends from the same allowance: OpenAI says Work inside ChatGPT "uses the same pricing, credits, and usage limits as Codex." How fast a message spends it depends on the model, the context it carries, reasoning, tool use, and whether the task runs locally or in the cloud. Cloud tasks may use more than local messages. [Codex pricing FAQ](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan)

Which windows apply depends on the plan:

| Plan | Five-hour window | What else to know |
|---|---|---|
| Plus, Business Standard | Yes | Weekly limits may also apply |
| Pro ($100, $200 or $500 a month) | None at the moment | The allowance is still finite, and a weekly limit can apply |
| Business Premium | None | Five times the included Work and Codex usage of a Standard seat; check Usage for any weekly limit |
| Enterprise and Edu with flexible pricing | No fixed rate limits | Usage draws on workspace credits |
| Enterprise and Edu without flexible pricing | As on Plus, for most features | Per-seat limits match Plus; check with your workspace admin |

Free and Go also include Codex, on GPT-6 Luna in the desktop app (subject to rollout); check their limits on the Usage page. Sources: [Codex pricing FAQ](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan), [managing usage in Work and Codex](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex), [ChatGPT Business models and limits](https://help.openai.com/en/articles/12003714-chatgpt-business-models-and-limits), [ChatGPT Business FAQ](https://help.openai.com/en/articles/8542115-chatgpt-business-general-faq).

OpenAI does not publish a fixed message count for any plan. Its estimate table for Plus and Business Standard gives a range per model instead: 15 to 160 local messages per five hours on GPT-6.1 Sol, and 350 to 3,000 on GPT-6 Luna. The page calls these estimates, "not fixed message limits." Fast mode spends included usage at 2.5 times the rate of Standard speed, and Ultrafast at 8 times. [Codex pricing FAQ](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan)

## How to check your Codex usage limit

1. Open Settings → Usage, or go straight to the [usage dashboard](https://chatgpt.com/codex/settings/usage). It shows what is left and when each limit resets.
2. Make sure you are looking at the account and workspace your agent runs under. On ChatGPT web, the profile menu shows the active account and workspace. In a terminal, `codex login status` only tells you the sign-in method: `Logged in using ChatGPT` or `Logged in using an API key`. The CLI uses whichever account last ran `codex login` under its `CODEX_HOME` (the folder where Codex keeps its login and settings, `~/.codex` by default); if you are not sure which one that was, sign in again. [Authentication](https://learn.chatgpt.com/docs/auth)
3. Inside a running CLI session, `/status` shows your remaining limits along with the active model and token usage. `/usage daily`, `/usage weekly` and `/usage cumulative` show how many tokens the account has used, which is a different number from what is left. Plain `/usage` opens a menu that can also redeem an available reset. [Slash commands](https://learn.chatgpt.com/docs/cli/slash-commands), [where to see your limits](https://learn.chatgpt.com/docs/pricing#where-can-i-see-my-current-usage-limits)
4. Note which allowance is empty: the five-hour window, the weekly window, or your credits. When both windows apply, an empty one blocks you even if the other still has room, so a refreshed five-hour window does not help while the weekly one is used up.

OpenAI suggests checking the dashboard every week or two. If usage runs higher than you expected, try a smaller model or a tighter task scope. [Codex pricing FAQ](https://learn.chatgpt.com/docs/pricing#where-can-i-see-my-current-usage-limits)

## How to reset a Codex usage limit

Every limit resets on its own schedule. The options below get you going sooner, and not every account has them. OpenAI support does not hand out extra resets. If Settings → Usage shows no reset you can use, refresh the page and confirm you are in the right account and workspace. If a promotion says you should have one and it still does not show, contact support so they can check it. [How banked Codex resets work](https://help.openai.com/en/articles/20001498-how-banked-codex-resets-work)

### Wait for the scheduled reset

Where a five-hour limit applies, the window does not start at a fixed time of day. Your first Work or Codex message after the previous window ends starts the next one, and the window ends five hours later. Hit the limit one hour into a window and you wait for the rest of that window, about four hours; the Usage page shows the exact time. The weekly window resets at the time shown on your Usage page. [Managing usage in Work and Codex](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex)

### Use a banked reset, if you have one

Some accounts receive a banked reset as a promotion. It is saved until you use it or it expires. In Settings → Usage, look for "1 reset available" or "Full reset", check which limits it covers and when it expires, then confirm. A full banked reset refreshes the five-hour and weekly windows that apply to you and moves your weekly reset date; the Usage page shows the new one. In the CLI, `/usage` can redeem an available reset too. [How banked Codex resets work](https://help.openai.com/en/articles/20001498-how-banked-codex-resets-work)

### Buy an instant reset, if offered

Eligible personal Plus and Pro accounts may see "Buy an instant reset" in the desktop app's Usage settings, or an offer after reaching the weekly limit. Reaching only the five-hour limit does not bring up that offer. A purchased reset restores the five-hour and weekly allowances that apply right away and cannot be saved for later. OpenAI describes it as pulling your normal weekly allowance forward, not as a separate extra allowance: you get a fresh week now. Your new weekly period starts with your first Work or Codex request after the reset, and the next automatic weekly reset comes seven days after that request. [Paid weekly resets](https://help.openai.com/en/articles/20001507-paid-weekly-work-and-codex-rate-limit-resets)

### Buy credits or upgrade

Plus and Pro users can buy credits to keep working after the included allowance runs out, without changing plans. Business, Edu and Enterprise workspaces on flexible pricing buy workspace credits instead ([what happens when you hit usage limits](https://learn.chatgpt.com/docs/pricing#what-happens-when-you-hit-usage-limits)). The other route is a plan with a larger allowance; the [Pro plans page](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-plans) compares the tiers.

### Check for Luna Reserve

Some personal Plus and Pro accounts, chosen by OpenAI, get Luna Reserve: after regular usage runs out, a separate allowance with its own limit lets them keep working on a Luna model. When regular usage runs out, look for a Luna Reserve notice or a moon icon in the usage warning; if none appears, your account probably does not have it. [Luna Reserve](https://help.openai.com/en/articles/20001499-luna-reserve-in-codex-and-chatgpt-work)

## Keep a long Codex run from stopping at the limit

If you reach a limit during an active turn, OpenAI says the agent "will be able to continue working on that turn, subject to fair use limits." The next turn needs allowance again. What happens to work queued behind it depends on the script or runner calling Codex. I have not tested what `codex exec` returns when a ChatGPT allowance runs out, so have the script stop on any non-zero exit and check the Usage page. Do not rely on the exit code alone: before starting the next task, check that the last one produced what it should, such as a commit or an output file. [What happens when you hit usage limits](https://learn.chatgpt.com/docs/pricing#what-happens-when-you-hit-usage-limits)

### Spend less of the allowance per task

Switching to another model does not give back allowance you already used, because it is one shared pool (Luna Reserve, above, is a separate allowance, not a refund). A lighter model makes what is left last longer, as the Sol and Luna ranges above show. Run routine work on it with `codex exec -m gpt-6-luna "..." </dev/null` from inside a Git repository (the API section below explains why), leave Fast mode off, keep `AGENTS.md` short, and turn off MCP servers the task does not need, since each one adds context to every message. [Managing usage in Work and Codex](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex), [making limits last longer](https://learn.chatgpt.com/docs/pricing#what-can-i-do-to-make-my-usage-limits-last-longer)

### Move the run to API billing

The CLI, IDE extension and desktop app can sign in with an OpenAI API key instead of ChatGPT. That usage is billed through your OpenAI Platform account at standard API rates and does not touch your plan's allowance. OpenAI recommends API-key sign-in for programmatic jobs such as CI. The trade-offs: Codex cloud and cloud features such as GitHub code review and Slack need ChatGPT sign-in, and the models you get are the ones your key can use. [Authentication](https://learn.chatgpt.com/docs/auth), [feature availability](https://learn.chatgpt.com/docs/pricing)

First create an API key in the [OpenAI Platform dashboard](https://platform.openai.com/api-keys) and export it in your shell as `OPENAI_API_KEY` (read the value from your secret store, or run `read -rs OPENAI_API_KEY && export OPENAI_API_KEY`, then paste the key and press Enter, which keeps it off the screen and out of shell history). Without `export`, the script cannot see it. Then give the API login its own `CODEX_HOME`, so it does not replace the ChatGPT login you use interactively. Save this as `codex-api-login.sh` and run it with `bash codex-api-login.sh`. Do not run it with `sh`, which may not support `pipefail`, and do not paste it into an interactive shell, where `set -e` would close the shell on the first error:

```bash
#!/usr/bin/env bash
set -euo pipefail
: "${OPENAI_API_KEY:?set OPENAI_API_KEY to an OpenAI Platform API key first}"
export CODEX_HOME="$HOME/.codex-api"
mkdir -p "$CODEX_HOME"
printenv OPENAI_API_KEY | codex login --with-api-key
codex login status
codex exec --skip-git-repo-check -m gpt-6-luna "Reply with the single word OK" </dev/null
```

I'm Lawrence Liu, the creator of Orbi. On 17 October 2026 I ran this on Linux with Codex CLI 0.163.0, with a made-up key, because I did not want to bill a real one for a test:

- With `OPENAI_API_KEY` unset or empty, the script stopped at the third line with exit code 1.
- Without the `mkdir`, Codex refused to start because the `CODEX_HOME` directory did not exist.
- With the made-up key, `codex login --with-api-key` printed "Successfully logged in", and `codex login status` reported an API-key login. Only the test request caught the bad key: it failed with `401 Unauthorized` and `invalid_api_key`, and the script exited 1.
- In my first version the last line had no `</dev/null`. Run from a pipe, `codex exec` printed "Reading additional input from stdin..." and waited until my timeout killed it.

The same request under my ChatGPT login printed `OK` and exited 0. I have not run the success path with a real API key.

For the real unattended runs:

- Set the same `CODEX_HOME` on every Codex command, including the one in your runner or crontab. The `export` in the script only lasts for that script. The API-key login then stays in effect as long as nothing signs in again or changes the login settings.
- Run from inside a Git repository. Outside one, `codex exec` stops with "Not inside a trusted directory and --skip-git-repo-check was not specified", which is why the test script passes that flag. Inside a freshly created Git repository, the check passed with the new, empty `CODEX_HOME`.
- Keep `</dev/null` on every `codex exec`, for the reason in the last test above.
- `$HOME/.codex-api` starts empty, so it does not have the approval, sandbox and other settings from your usual `~/.codex/config.toml`. Copy only the keys you need, leave out login and provider settings such as `forced_login_method`, and run the test request again. For runs that edit the repository, you can set the sandbox on the command line instead; the [Codex YOLO mode post](/blog/codex-yolo-mode/) shows what each mode allows.
- Cron starts with a much shorter `PATH` than your terminal. Set `PATH` at the top of the crontab so it includes the directory of `codex` and, if you installed Codex with npm, the directory of `node` too: the npm `codex` command is a Node script.
- If your key cannot use `gpt-6-luna`, use a model it can in the test request and in your jobs.
- The key is stored in `auth.json` inside `$HOME/.codex-api` (or your OS credential store), so treat that folder like a password.

Put together, the command for one cron job looks like this:

```bash
cd /path/to/repo && CODEX_HOME="$HOME/.codex-api" codex -a never exec -m gpt-6-luna --sandbox workspace-write "Run the tests and fix the failures." </dev/null
```

Keep the same `-m` as in your test request; without it, Codex picks its default model. With the made-up key in a fresh Git repository, this command reached the API and exited 1 with the same `401`, so it parses and runs as written. Before you hand the job to cron, try one small task that has to write a file.

Codex can also leave OpenAI billing entirely: define another provider that speaks the Responses API under `model_providers.<id>` in `config.toml` and select it with `model_provider`, or use `--oss` to run a local model through Ollama or LM Studio. [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)

### Put a hard cap on API spend

A spend alert only sends a notification, and API traffic keeps going. To stop at a monthly cap, open Organization limits in the OpenAI Platform dashboard (or Project settings → Limits), choose Edit spend limit, enter the amount, turn on "Enforce a hard limit" and save. Requests past the cap return a 429 error with `organization_spend_limit_exceeded` or `project_spend_limit_exceeded`. Enforcement is not instantaneous, so recorded spend can go slightly over. API rate limits and your prepaid balance still apply too. [OpenAI spend limits](https://developers.openai.com/api/docs/guides/spend-limits)

## Codex limits and Orbi

Orbi is an open-source runner that takes GitHub Issues through review and merge to a tagged release without someone watching it. Its agent is Pi, an open-source coding agent, not Codex CLI, so the Codex login steps above do not configure it. Self-hosted Orbi can use any OpenAI-compatible API with your own key, so its runs bill to that provider and not to a Codex plan. If you sign Pi in with your ChatGPT/Codex subscription instead, it spends the same allowance described above. The [self-hosted guide](/guides/self-hosted-coding-agent/?ref=blog-codex-usage) covers the API-key setup, and the [guide to signing Pi in with a ChatGPT/Codex subscription](/guides/codex-github-issues/?ref=blog-codex-usage) covers the other path. The [cost page](/cost/?ref=blog-codex-usage) lists what 169 Orbi deliveries, each an Issue taken to a merged PR, cost on DeepSeek, with the limits of that sample. Those are DeepSeek prices, not an estimate of OpenAI API costs.

## Related

- [Codex YOLO mode: what runs without approval](/blog/codex-yolo-mode/)
- [Compare Orbi and Codex](/compare/codex/?ref=blog-codex-usage)
- [Orbi Cloud](/cloud/?ref=blog-codex-usage)
