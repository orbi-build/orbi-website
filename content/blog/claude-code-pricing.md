---
title: Claude Code pricing: Pro, Max and API billing
date: 2026-10-18
summary: Compare Claude Code pricing for Pro, Max and API access. Check shared limits, extra usage, API credit exclusions and which account pays before you upgrade.
lang: en
author: Lawrence Liu
image: /img/blog-claude-code-pricing-card.png
mirror: claude-code-pricing
---

Claude Code pricing for a monthly subscription starts at $20 through Claude Pro, or you can pay separately for API usage. Max costs $100 or $200 a month and raises the subscription allowance. Before choosing a plan, check which account your Claude Code session uses: an API key can make the same command consume paid API credits instead of your subscription.

Prices and billing rules below were checked against Anthropic's official documentation on 18 October 2026. Dollar amounts are USD web subscription prices before tax; mobile checkout prices can differ.

## Claude Code pricing by plan

| Access | Base price | What it gives you | What to check before paying |
|---|---|---|---|
| Claude Pro | $20/month, or $200/year | Claude Code and Claude apps within the plan's allowance | Both draw from shared usage limits |
| Claude Max 5x | $100/month | 5x Pro's usage capacity per session | Still subject to session and weekly limits |
| Claude Max 20x | $200/month | 20x Pro's usage capacity per session | Higher capacity does not mean unlimited use |
| Claude Console / API | Usage-based | Claude Code billed at API rates | Model, tokens, caching and account spend controls affect cost |

The [Max plan guide](https://support.claude.com/en/articles/11049741-what-is-the-max-plan) lists both Max tiers. Anthropic's [pricing page](https://claude.com/pricing) includes Claude Code in Pro and Max, but not Free. Team and Enterprise have separate seat and usage arrangements; use their current terms rather than multiplying an individual plan's price by your team size.

For an individual developer starting with Claude Code, Pro is the lowest paid subscription tier. A Max plan becomes a useful purchase when a lower tier repeatedly interrupts work you need to finish. The 5x and 20x labels describe allowance relative to Pro; they do not promise that every repository yields five or twenty times as many completed tasks.

## Subscription usage, paid extra usage and API billing

| Billing path | Where usage goes | Where to inspect it |
|---|---|---|
| Pro or Max login, within included usage | Your subscription allowance | Claude settings and Claude Code's `/usage` |
| Subscription with paid extra usage enabled | Separately funded usage credits after included limits | Claude usage and billing settings |
| Claude Console authentication or an API key | Your API organization's paid balance or invoiced usage | Claude Console usage and billing |

Paid extra usage extends a subscription after its included limits are reached. A Console API key uses API billing from the first request. Check these settings separately before assuming a session stays inside the subscription price.

Anthropic documents [paid usage credits](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans) separately from [Console API billing](https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage). Check auto-reload and spending controls in the account that funds the work. A plan upgrade does not, by itself, disable an API organization's auto-reload.

### Can Max's monthly API credits pay for Claude Code?

No. Max 5x includes $100/month and Max 20x includes $200/month in claimable API credits, but Anthropic explicitly excludes Claude Code and extra usage in the Claude apps from that benefit.

To claim the credits, an eligible subscriber links a Claude Console organization. New subscribers become eligible after seven days. Credits expire at the end of their billing cycle and do not roll over. They can fund eligible API applications and agents in that organization, subject to the [subscriber-credit rules](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers).

For a Max 5x subscriber, the $100 subscription charge and the $100 API-credit benefit therefore have different purposes. Do not subtract the API credit from a projected Claude Code bill or treat it as another $100 of Claude Code overage.

## Check your account before a long run

In Claude Code, run `/status` to inspect the account and `/usage` to inspect subscription usage. The [authentication reference](https://code.claude.com/docs/en/authentication) explains how subscription and Console access differ.

Also check the shell that will launch the job. This command reports only whether relevant environment variables exist; it never prints their values:

```bash
python3 - <<'PY'
import os
for name in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN",
             "ANTHROPIC_BASE_URL", "CLAUDE_CODE_OAUTH_TOKEN"):
    print(f"{name}: {'set' if os.environ.get(name) else 'unset'}")
PY
```

This is a diagnostic, not proof of the final billing route: settings and credential helpers can also affect authentication. Anthropic specifically warns that an `ANTHROPIC_API_KEY` environment variable can make Claude Code use API billing instead of the Pro or Max allowance. Its [subscription setup guide](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan) covers that case and account switching.

A remote shell, cron job or CI runner may inherit different credentials from your interactive terminal. Check the actual job environment before starting unattended work. The [headless guide](/blog/run-claude-code-unattended/) shows how to preserve the run's result and detect denied tools; a successful exit code alone does not prove the requested change happened.

### Does `/cost` show what I owe?

The [command reference](https://code.claude.com/docs/en/commands) lists `/cost` as an alias for `/usage`. That screen shows subscription limits and activity as well as a Session block with token-cost estimates. Anthropic's [cost documentation](https://code.claude.com/docs/en/costs) says the Session dollar figure is aimed at API users; it is not an additional subscription invoice. For API usage, reconcile the run with Console billing; for a subscription, inspect the remaining allowance and any enabled paid extra usage.

When judging cost, keep the diff, test result and billing route together. If a run leaves a failing test, include the work needed to retry and review it.

## Choose Pro, Max or API from your own usage

Start with the smallest tier that supports your ordinary work. Record a representative week: which limit stopped you, how often it stopped a necessary task, and how much separately paid usage you consumed. Pro and Max have both five-hour session limits and weekly limits shared across Claude and Claude Code, so a busy day in the Claude app can affect the coding session too.

Use that record to make the next decision:

- Occasional interruptions with no deadline: wait for the reset before buying more capacity.
- A short, unusual burst: compare a deliberately capped extra-usage budget with the price of an upgrade.
- Repeated interruptions during ordinary work: evaluate the next Max tier against the same workload.
- An application or runner that needs API authentication: budget the API organization separately, including its eligible credits and spending controls.

At monthly web prices, Pro to Max 5x adds $80 to the base charge; Max 5x to Max 20x adds $100. Those differences give you a budget comparison, not an equivalence in tokens. For example, $20 Pro plus $80 in separately paid usage totals $100, the same base price as Max 5x. You still need to check whether Max's allowance covers when and how you work. Annual Pro billing changes that comparison.

## When your budget is for delivered Issues

I'm Lawrence Liu, the creator of Orbi. Orbi runs the Pi coding agent and takes GitHub Issues through implementation, a separate review session, merge checks and release workflows. Orbi Cloud uses DeepSeek by default and does not consume your Claude Code subscription allowance. Its [cost page](/cost/?ref=blog-cc-pricing) measures a different agent and workflow, so those figures cannot predict your Claude Code bill.

## Related

If you are choosing an interactive coding tool, compare the account and usage rules above. For a direct workflow comparison, read [Cursor vs Claude Code](/blog/cursor-vs-claude-code/). If your requirement is unattended Issue delivery, [Orbi vs Claude Code](/compare/claude-code/) explains the boundary, and [Orbi Cloud](/cloud/?ref=blog-cc-pricing) provides the hosted runner.
