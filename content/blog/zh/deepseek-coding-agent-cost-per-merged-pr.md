---
title: 用 DeepSeek 当无人值守的编程智能体：每合并一个 PR 花多少钱
date: 2026-09-24
summary: 看 Orbi 如何用 DeepSeek 无人值守地完成编程、独立评审、修复、合并和发版，以及每个合并 PR 的成本、缓存命中率和接入方法，附配置。
lang: zh
author: Orbi
image: /img/blog-deepseek.png
mirror: deepseek-coding-agent-cost-per-merged-pr
---

Orbi 把 GitHub Issue 交付成经过独立评审、已合并的 PR，再打 tag 发 Release。2026 年 9 月 22 日到 24 日，Orbi 自己的仓库有 20 个 PR 全部用 `deepseek-flash` 跑完了整条链路：写代码、独立评审、修复、合并和发版。你可以查看 [#1328](https://github.com/orbi-build/orbi/issues/1328)、[#1332](https://github.com/orbi-build/orbi/issues/1332) 和 [#1336](https://github.com/orbi-build/orbi/issues/1336) 的公开记录。

这不是模型能力排行，而是一份成本记录。这里把**每个合并 PR**作为计量单位；完整数据见 [成本表](/zh/cost/)。

## 每个合并 PR 花多少钱

这些运行的 token 中位数是 **10.6M**。按 DeepSeek 官方价格（2026 年 9 月 24 日核对）计算：

- 非高峰时段中位数 **$0.125**，最高 **$0.417**。
- 高峰时段中位数 **$0.249**，最高 **$0.834**。

价格依据 [DeepSeek 官方价目表](https://api-docs.deepseek.com/quick_start/pricing)。高峰价格翻倍，时段是工作日 UTC 01:00–04:00 和 06:00–10:00。无人值守任务如果能避开这两个时间段，就能少付一部分钱。[自动合并 AI PR 指南](/zh/guides/auto-merge-ai-prs/)讲的是流程，这篇只给这条合并 PR 的流程标上价格。

## 便宜的原因：大多数 token 是缓存读

这些运行里 **97.1% 是缓存读**。缓存命中每 100 万 token 收 $0.003，未命中则是 $0.15，也就是 **1/50**。Orbi 的会话结构会反复复用同一段上下文，所以独立评审和后续修复不必每次都把相同内容当成全新的输入来读。

有一个门槛值得盯住：缓存命中率低于九成后，成本会上升得很快。中位数适合做预算起点，但你的上下文长度和评审轮数才决定实际账单。

## 自托管 Orbi 怎么接 DeepSeek

Orbi 跑在 Pi 上，模型可以接 OpenAI 兼容 API 或 Codex 订阅，**不支持 Claude Code**。Orbi 以 AGPL-3.0 开源。

模板 [`templates/pi-providers/deepseek.json`](https://github.com/orbi-build/orbi/blob/main/templates/pi-providers/deepseek.json) 里的 provider 块是：

```json
{
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "api": "openai-completions",
      "apiKey": "$DEEPSEEK_API_KEY",
      "models": [
        {"id": "deepseek-flash", "name": "DeepSeek Flash", "contextWindow": 131072, "maxTokens": 16384}
      ]
    }
  }
}
```

启动 agent 前设置环境变量：

```bash
export DEEPSEEK_API_KEY="your-key"
```

剩下的自托管步骤看 [provider 文档](https://github.com/orbi-build/orbi/blob/main/docs/providers.mdx)。不要把 key 写进会提交到仓库的配置文件。

## 可以带走的两个判断

第一，记账时用每个合并 PR，而不是只看一次模型调用；第二，把缓存命中率保持在九成以上，并在队列允许时避开高峰。无人值守编程智能体的完整成本路径，是 GitHub Issue → PR → 独立评审 → 合并 → 打 tag 发 Release。Orbi 自己的这 20 个 PR 都留有公开记录，完整表格在[成本页](/zh/cost/)。


## 相关

继续阅读：[成本表](/zh/cost/)、[Cloud](/zh/cloud/)和[自动合并 AI PR 指南](/zh/guides/auto-merge-ai-prs/)。
