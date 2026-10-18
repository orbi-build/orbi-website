---
title: Claude Code 价格：Pro、Max 和 API 怎么付费
date: 2026-10-18
summary: Claude Code 月付订阅从 Pro 的 20 美元起。分清订阅额度、额外用量、API 账单和 Max 附赠额度，再决定是否升级。
lang: zh
author: Lawrence Liu
image: /img/blog-claude-code-pricing-card.png
mirror: claude-code-pricing
---

Claude Code 价格按月付订阅看，从 Pro 的每月 20 美元起；也可以通过 API 按量付费。Max 每月 100 或 200 美元，提高的是订阅用量额度。选套餐之前，先确认当前会话用了哪个账号：同一条命令，设了 API key 就可能走 API 账单，不再消耗订阅内含额度。

本文的价格与计费规则于 2026 年 10 月 18 日核对官方文档。金额均为美元、网页订阅税前价格；手机应用内的结账价格可能不同。

## Claude Code 价格和套餐怎么选

| 付费方式 | 基础价格 | 能拿到什么 | 付钱前要确认什么 |
|---|---|---|---|
| Claude Pro | 每月 20 美元，或每年 200 美元 | 在套餐额度内使用 Claude Code 和 Claude 应用 | 聊天和编程共用用量限制 |
| Claude Max 5x | 每月 100 美元 | 每个会话用量周期有 Pro 的 5 倍容量 | 仍有会话和每周限制 |
| Claude Max 20x | 每月 200 美元 | 每个会话用量周期有 Pro 的 20 倍容量 | 额度提高不等于无限使用 |
| Claude Console / API | 按用量计费 | Claude Code 按 API 费率使用模型 | 模型、token、缓存和账号支出设置都会影响费用 |

[Max 套餐说明](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)列出两个档位；[官方价格页](https://claude.com/pricing)确认 Pro 和 Max 包含 Claude Code，Free 不包含。Team 和 Enterprise 的席位、用量安排另外计算，不能直接拿个人套餐单价乘人数。

个人开发者刚开始用 Claude Code，Pro 是最低的付费订阅档。低一档的额度经常打断必须完成的工作时，再评估 Max。5x 和 20x 描述的是相对 Pro 的容量，不保证每个仓库都能多完成五倍或二十倍任务。

## 订阅额度、额外用量和 API 账单是三条路径

| 当前用法 | 用量记在哪里 | 去哪里查 |
|---|---|---|
| 用 Pro 或 Max 登录，尚在内含额度内 | 订阅额度 | Claude 设置、Claude Code 的 `/usage` |
| 开启了付费额外用量，内含额度已用完 | 单独购买的 usage credits | Claude 的用量与账单设置 |
| 用 Console 账号或 API key 认证 | API 组织的付费余额或约定账单 | Claude Console 的用量与账单页 |

额外用量是在订阅额度用完后继续付费；Console API key 则从请求开始就走 API 计费。两处设置要分别查，不能只看到自己订了 Max，就认定这次运行不会产生额外费用。

官方将[订阅的付费用量额度](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans)和 [Console API 计费](https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage)分开说明。去实际支付这次用量的账号里检查自动充值和支出限制。升级订阅不会替你关闭 API 组织的自动充值。

### Max 附送的每月 API credits 能付 Claude Code 吗？

不能。Max 5x 可以领取每月 100 美元 API credits，Max 20x 可以领取每月 200 美元，但官方明确排除了 Claude Code，也排除了 Claude 应用的额外用量。

符合条件的订阅者需要关联一个 Claude Console 组织。新订阅者要等七天才能领取；未用完的额度在本账期结束时过期，不累计到下一期。它可以支付该组织内符合条件的 API 应用和 agent，范围见[订阅附赠 API 额度规则](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers)。

所以，Max 5x 的 100 美元月费，与附赠的 100 美元 API credits，用途不同。估算 Claude Code 支出时，不能把后者直接从账单里减掉，也不能把它当成另有 100 美元 Claude Code 超额额度。

## 长任务启动前，先确认谁在付费

在 Claude Code 中运行 `/status` 看账号，运行 `/usage` 看订阅用量。[认证文档](https://code.claude.com/docs/en/authentication)说明了订阅和 Console 访问的区别。

还要检查真正启动任务的 shell。下面只显示变量有没有设置，不打印变量值：

```bash
python3 - <<'PY'
import os
for name in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN",
             "ANTHROPIC_BASE_URL", "CLAUDE_CODE_OAUTH_TOKEN"):
    print(f"{name}: {'set' if os.environ.get(name) else 'unset'}")
PY
```

这个检查只能帮助排查，不能单独证明最终计费路径；配置文件、凭据辅助程序也可能影响认证。官方特别提醒，环境变量里设置了 `ANTHROPIC_API_KEY` 时，Claude Code 可能改走 API 计费，不使用 Pro 或 Max 内含额度。[订阅接入说明](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)也写了如何切换账号。

远程 shell、cron 或 CI 的环境，可能和你平时打开的终端不同。无人值守任务开始前，查实际作业环境。[headless 运行指南](/zh/blog/run-claude-code-unattended/)还说明了怎样留存结果、识别工具被拒；退出码成功不保证需求已经完成。

### `/cost` 显示的是应付账单吗？

[命令表](https://code.claude.com/docs/en/commands)把 `/cost` 列为 `/usage` 的别名。同一个界面既显示订阅限制和活动统计，也有 Session 区域的 token 成本估算。[成本文档](https://code.claude.com/docs/en/costs)说，Session 的美元数主要面向 API 用户，不是额外开给订阅用户的账单。

API 用户去 Console 对账；订阅用户检查剩余额度，以及是否开启了付费额外用量。把代码 diff、测试结果和计费路径一起留下来。一次运行看起来便宜，却没修好问题，重试和评审的时间也要算。

## 用自己的工作记录判断是否升级

先用能支持日常工作的最低档，记一个有代表性的星期：哪条限制拦住了你、是否耽误必须完成的任务、单独付了多少用量费用。Pro 和 Max 都有五小时会话限制和每周限制，Claude 应用与 Claude Code 共用，所以当天大量聊天也会影响编程额度。

拿这份记录做判断：

- 偶尔被拦、没有截止时间：先等额度恢复。
- 临时集中处理一批任务：比较设有明确上限的额外用量预算与升级差价。
- 正常工作反复被打断：用同样的工作负载评估下一档 Max。
- 应用或 runner 必须使用 API 认证：单独核算 API 组织的预算、可用额度和支出限制。

按网页月付价格，Pro 升 Max 5x，基础月费增加 80 美元；Max 5x 升 Max 20x，增加 100 美元。这能做预算比较，不能换算成相同 token 数。例如，20 美元 Pro 加 80 美元单独付费用量，总额是 100 美元，和 Max 5x 的基础月费相同；但仍要确认 Max 的额度是否适合你工作集中的时段和任务。年付 Pro 的比较要另算。

## 如果你核算的是 Issue 交付成本

我是 Lawrence Liu，Orbi 的创始人。Orbi 使用编程 agent Pi，把 GitHub Issue 交给实现会话，再经过独立评审、合并检查与发版流程。Orbi Cloud 默认使用 DeepSeek，不消耗 Claude Code 订阅额度。[Orbi 成本页](/zh/cost/?ref=blog-cc-pricing)统计的是另一种 agent 和交付流程，不能拿它预测 Claude Code 账单。

## 相关

日常交互式编程工具的选择，可以继续看 [Cursor 与 Claude Code 对比](/zh/blog/cursor-vs-claude-code/)。如果需求是让 Issue 无人值守交付，[Orbi 与 Claude Code 的边界](/zh/compare/claude-code/)说明了各自负责到哪里，[Orbi Cloud](/zh/cloud/?ref=blog-cc-pricing)提供托管的 runner。
