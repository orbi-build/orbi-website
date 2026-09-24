---
title: DeepSeek as an unattended coding agent, per merged PR
date: 2026-09-24
summary: See how Orbi uses DeepSeek as an unattended coding agent, what each merged PR costs, why cache reads matter, and how to connect your own API key in practice.
lang: en
author: Orbi
image: /img/blog-deepseek.png
mirror: deepseek-coding-agent-cost-per-merged-pr
---

Orbi turns a GitHub Issue into a reviewed, merged PR and a tagged release. From September 22 to 24, 2026, Orbi's own repository merged 20 PRs using `deepseek-flash` for the whole loop: writing code, independent review, fixes, merge, and release. You can inspect [issue #1328](https://github.com/orbi-build/orbi/issues/1328), [issue #1332](https://github.com/orbi-build/orbi/issues/1332), and [issue #1336](https://github.com/orbi-build/orbi/issues/1336).

This is a cost report, not a model leaderboard. The unit here is one merged PR. The numbers come from the same dataset as the site's [full cost table](/cost/).

## What one merged PR cost

Across those runs, the median was **10.6M tokens** per merged PR. At DeepSeek's official prices, checked on September 24, 2026, that works out to:

- **$0.125** median and **$0.417** maximum outside peak hours.
- **$0.249** median and **$0.834** maximum during peak hours.

The figures use DeepSeek's [official pricing](https://api-docs.deepseek.com/quick_start/pricing). Peak hours are weekdays 01:00–04:00 and 06:00–10:00 UTC. For an unattended coding agent, scheduling around those windows is a practical cost control. The [auto-merge AI PR guide](/guides/auto-merge-ai-prs/) explains the delivery loop; this post puts a price on its merged-PR unit.

## Why the number stays low

Of the tokens in these runs, **97.1% were cache reads**. A cache hit costs $0.003 per one million tokens; a cache miss costs $0.15 per one million. That is **1/50** of the uncached price. Orbi's session structure repeatedly reuses the same context, so the context needed for an independent review and its fixes is not paid for as a fresh read each time.

One caveat matters: when the cache-hit rate drops below 90%, cost rises quickly. The median is useful for planning, but your own context shape and review rounds determine the result.

## Connect DeepSeek to a self-hosted Orbi

Orbi runs on Pi. Its engine can use an OpenAI-compatible API or a Codex subscription; it does **not** support Claude Code. Orbi is open source under AGPL-3.0.

The provider template in [`templates/pi-providers/deepseek.json`](https://github.com/orbi-build/orbi/blob/main/templates/pi-providers/deepseek.json) is:

```json
{
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "api": "openai-completions",
      "apiKey": "$DEEPSEEK_API_KEY",
      "models": [
        {"id": "deepseek-chat", "name": "DeepSeek Chat", "contextWindow": 131072, "maxTokens": 8192}
      ]
    }
  }
}
```

Set the key before starting the agent:

```bash
export DEEPSEEK_API_KEY="your-key"
```

Use the [provider documentation](https://github.com/orbi-build/orbi/blob/main/docs/providers.mdx) for the rest of the self-hosted setup. Never put the key in a checked-in config file.

## What to take away

Measure cost per merged PR, keep the cache-hit rate above 90%, and move unattended work outside peak hours when that fits your queue. The important unit is not a model call in isolation: it is the complete path from GitHub Issue to PR, independent review, merge, and tagged release. Orbi's own 20-PR sample makes that path inspectable, and the [cost page](/cost/) keeps the full table in one place.


## Related

Read the [cost table](/cost/), [Cloud](/cloud/), and [comparison pages](/compare/).
