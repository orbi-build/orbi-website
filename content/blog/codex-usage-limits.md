---
title: How to check and reset Codex usage limits
date: 2026-10-17
summary: Codex usage limits use five-hour and weekly windows set by plan. Check them on the Usage page or with /status, see when they reset, and keep runs going.
lang: en
author: Lawrence Liu
image: /img/blog-codex-usage-card.png
---

Codex usage limits are the allowance included with your ChatGPT plan, measured in a five-hour window, a weekly window, or both, depending on the plan. Your remaining balance and reset times are on the [Codex usage dashboard](https://chatgpt.com/codex/settings/usage) (Settings → Usage), and `/status` shows them inside a CLI session. When you run out, Codex lets the agent finish the turn it is on; after that you wait for the reset, use a reset or credits if your account has them, or switch the CLI to API billing.

Every OpenAI fact below links to the official page it comes from. All were retrieved on 17 October 2026, and OpenAI changes these terms often, so your own Usage page wins whenever it disagrees with this post.

## How Codex usage limits work

Codex and ChatGPT Work draw on the same allowance: OpenAI says Work inside ChatGPT "uses the same pricing, credits, and usage limits as Codex." How fast a message spends it depends on the model, the context it carries, reasoning, tool use, and whether the task runs locally or in the cloud. Cloud tasks may use more than local messages. [Codex pricing FAQ](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan)

Which windows apply depends on the plan:

| Plan | Five-hour window | What else to know |
|---|---|---|
| Plus, Business Standard | Yes | Weekly limits may also apply |
| Pro ($100, $200 or $500 a month) | None at the moment | The included allowance is still finite |
| Business Premium | None | Five times the included Work and Codex usage of a Standard seat |
| Enterprise and Edu with flexible pricing | No fixed rate limits | Usage draws on workspace credits |
| Enterprise and Edu without flexible pricing | Same per-seat limits as Plus for most features | Admins may set their own caps |

Sources: [Codex pricing FAQ](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan), [managing usage in Work and Codex](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex), [ChatGPT Business models and limits](https://help.openai.com/en/articles/12003714-chatgpt-business-models-and-limits).

OpenAI does not publish a fixed message count for any plan. Its estimate table for Plus and Business Standard gives a range per model instead: 15 to 160 local messages per five hours on GPT-6.1 Sol, and 350 to 3,000 on GPT-6 Luna. The page calls these estimates, "not fixed message limits." Fast mode spends included usage at 2.5 times the Standard rate, and Ultrafast at 8 times. [Codex pricing FAQ](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan)

## How to check your Codex usage limit

1. Open Settings → Usage, or go straight to the [usage dashboard](https://chatgpt.com/codex/settings/usage). It lists what is left in each window, your credit balance, and the reset time for each window.
2. Check that this is the account and workspace your agent uses. In a terminal, `codex login status` prints the active method, for example `Logged in using ChatGPT` or `Logged in using an API key`.
3. Inside a running CLI session, type `/status` for the active model and token usage. `/usage daily`, `/usage weekly` and `/usage cumulative` show your account's token activity, and plain `/usage` opens a menu that can also redeem an earned reset. [Slash commands](https://learn.chatgpt.com/docs/cli/slash-commands), [where to see your limits](https://learn.chatgpt.com/docs/pricing#where-can-i-see-my-current-usage-limits)
4. Note which allowance is empty: the five-hour window, the weekly window, or your credits. When both windows apply, an empty one blocks you even if the other still has room, so a refreshed five-hour window does not help while the weekly one is used up.

OpenAI suggests checking the dashboard every week or two. If usage runs higher than you expected, try a smaller model or a tighter task scope. [Codex pricing FAQ](https://learn.chatgpt.com/docs/pricing#where-can-i-see-my-current-usage-limits)

## How to reset a Codex usage limit

There is no reset button that every account has, and OpenAI support does not reset limits by hand. If you see no reset option, you have not missed a setting. [How banked Codex resets work](https://help.openai.com/en/articles/20001498-how-banked-codex-resets-work)

**Wait for the scheduled reset.** This is the normal path. Where a five-hour limit applies, the window does not start on a clock: your first Work or Codex message after the previous window ends starts the next one, so hitting the limit early in a window does not add another full five hours of waiting. The weekly window resets at the time shown on your Usage page. [Managing usage in Work and Codex](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex)

**Use a banked reset, if you have one.** Some accounts receive a banked reset as a promotion. It is saved until you use it or it expires. In Settings → Usage, look for "1 reset available" or "Full reset", check which limits it covers and when it expires, then confirm. A full banked reset refreshes the five-hour and weekly windows that apply to you and moves your weekly reset date. In the CLI, `/usage` can redeem it too. [How banked Codex resets work](https://help.openai.com/en/articles/20001498-how-banked-codex-resets-work)

**Buy an instant reset, if offered.** Eligible personal Plus and Pro accounts may see "Buy an instant reset" in the desktop app's Usage settings, or an offer after reaching the weekly limit. Reaching only the five-hour limit does not bring up that offer. A purchased reset restores the five-hour and weekly allowances that apply right away and cannot be saved for later. Your new weekly period starts with your first Work or Codex request after the reset, and the next automatic weekly reset comes seven days after that request. [Paid weekly resets](https://help.openai.com/en/articles/20001507-paid-weekly-work-and-codex-rate-limit-resets)

**Buy credits or upgrade.** Plus and Pro users can buy credits to keep working after the included allowance runs out, without changing plans. Business, Edu and Enterprise workspaces on flexible pricing buy workspace credits instead. Moving to a plan with a larger allowance, such as a higher Pro tier, is the other way. [What happens when you hit usage limits](https://learn.chatgpt.com/docs/pricing#what-happens-when-you-hit-usage-limits)

## Keep a long Codex run from stopping at the limit

If you reach a limit during an active turn, OpenAI says the agent "will be able to continue working on that turn, subject to fair use limits." The next turn needs allowance again. So a batch of tasks left running overnight tends to stop between tasks, and the rest waits for the reset. [What happens when you hit usage limits](https://learn.chatgpt.com/docs/pricing#what-happens-when-you-hit-usage-limits)

**Spend less of the allowance per task.** Switching to another model does not give back allowance you already used, because it is one shared pool. A lighter model makes what is left last longer, as the Sol and Luna ranges above show. Run routine work on it with `codex exec -m gpt-6-luna "..."`, leave Fast mode off, keep `AGENTS.md` short, and turn off MCP servers the task does not need, since each one adds context to every message. [Managing usage in Work and Codex](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex), [making limits last longer](https://learn.chatgpt.com/docs/pricing#what-can-i-do-to-make-my-usage-limits-last-longer)

**Move the run to API billing.** The CLI, IDE extension and desktop app can sign in with an OpenAI API key instead of ChatGPT. That usage is billed through your OpenAI Platform account at standard API rates and does not touch your plan's allowance. OpenAI recommends API-key sign-in for programmatic jobs such as CI. The trade-offs: Codex cloud and cloud features such as GitHub code review and Slack need ChatGPT sign-in, and the models you get are the ones your key can use. [Authentication](https://learn.chatgpt.com/docs/auth), [feature availability](https://learn.chatgpt.com/docs/pricing)

I'm Lawrence Liu, the creator of Orbi, and I tested this setup on Linux with Codex CLI 0.163.0 on 17 October 2026. Give the API login its own `CODEX_HOME` so it does not replace the ChatGPT login you use interactively. Codex refuses to start if that directory does not exist yet, so create it first:

```bash
export CODEX_HOME="$HOME/.codex-api"
mkdir -p "$CODEX_HOME"
printenv OPENAI_API_KEY | codex login --with-api-key
codex login status
codex exec --skip-git-repo-check -m gpt-6-luna "Reply with the single word OK"
```

Keep the last line. `codex login --with-api-key` printed "Successfully logged in" for a made-up key, and `codex login status` then reported it as an API-key login. Only the test request caught it: it exited 1 with `401 Unauthorized` and `invalid_api_key`. The same request under my ChatGPT login printed `OK` and exited 0. Every later command in that shell, and any job started with the same `CODEX_HOME`, uses the API key.

**Put a hard cap on API spend.** A spend alert only sends a notification, and API traffic keeps going. To stop at a monthly cap, open Organization limits (or Project settings → Limits), choose Edit spend limit, enter the amount, turn on "Enforce a hard limit" and save. Requests past the cap return a 429 error with `organization_spend_limit_exceeded` or `project_spend_limit_exceeded`. Enforcement is not instantaneous, so recorded spend can go slightly over. API rate limits and your prepaid balance still apply too. [OpenAI spend limits](https://developers.openai.com/api/docs/guides/spend-limits)

To compare what a finished task costs on different models, including retries, see the [cost table](/cost/?ref=blog-codex-usage).

## Codex limits and Orbi

Orbi is an open-source runner that takes GitHub Issues through review and merge to a tagged release without someone watching it. Self-hosted Orbi can use any OpenAI-compatible API with your own key, so its runs bill to that provider and not to a Codex plan. If you sign it in with your ChatGPT/Codex subscription instead, it spends the same allowance described above. The [self-hosted guide](/guides/self-hosted-coding-agent/?ref=blog-codex-usage) covers the API-key setup, and the [Codex guide](/guides/codex-github-issues/?ref=blog-codex-usage) covers the subscription login.

## Related

- [Codex YOLO mode: what runs without approval](/blog/codex-yolo-mode/)
- [Compare Orbi and Codex](/compare/codex/?ref=blog-codex-usage)
- [Orbi Cloud](/cloud/?ref=blog-codex-usage)
