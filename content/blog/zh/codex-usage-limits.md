---
title: Codex 额度怎么查、何时重置、用完了怎么办
date: 2026-10-17
summary: Codex 用量限制按套餐分 5 小时窗口和每周窗口。在 Usage 页面和 /status 查剩余额度，弄清额度何时重置，长时间无人值守跑 Codex 时也不被额度卡住。
lang: zh
author: Lawrence Liu
image: /img/blog-codex-usage-card.png
mirror: codex-usage-limits
---

Codex 用量限制，指 ChatGPT 套餐里包含的 Codex 额度。大多数套餐用 5 小时窗口、每周窗口或两者同时计量。剩余额度和重置时间在 [Codex 用量页面](https://chatgpt.com/codex/settings/usage)（Settings → Usage）里看，CLI 会话里输入 `/status` 也能看到剩余额度。如果一轮任务进行到一半撞上限额，Codex 会让 agent 把这一轮做完，但要受公平使用限制约束。之后有几条路：等重置；账户有可用的重置或 credits 就用掉；或者把 CLI 换成 API 按量计费。

下文每条 OpenAI 的说法都附了官方页面链接，抓取日期都是 2026 年 10 月 17 日。OpenAI 经常调整这些规则，和你自己的 Usage 页面对不上时，以 Usage 页面为准。

## Codex 用量限制怎么算

Codex 和 ChatGPT Work 共用同一份额度。OpenAI 的原话是，ChatGPT 里的 Work 与 Codex 使用相同的价格、credits 和用量限制。一条消息花掉多少额度，取决于模型、携带的上下文、推理量、工具调用，以及任务在本地还是云端运行；云端任务可能比本地消息耗得多。[Codex 定价 FAQ](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan)

适用哪些窗口，看套餐：

| 套餐 | 5 小时窗口 | 其他说明 |
|---|---|---|
| Plus、Business Standard | 有 | 可能还有每周限制 |
| Pro（每月 100、200 或 500 美元三档） | 目前没有 | 包含的额度仍然有上限 |
| Business Premium | 没有 | 包含的 Work 和 Codex 用量是 Standard 席位的 5 倍 |
| 采用弹性计费的 Enterprise、Edu | 没有固定速率限制 | 用量从工作区 credits 里扣 |
| 未采用弹性计费的 Enterprise、Edu | 大多数功能与 Plus 的单席位限制相同 | 具体问工作区管理员 |

Free 和 Go 用户也能在桌面应用里用 GPT-6 Luna 跑 Codex（逐步开放），额度同样看 Usage 页面。出处：[Codex 定价 FAQ](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan)、[Work 与 Codex 用量管理](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex)、[ChatGPT Business 模型与限制](https://help.openai.com/en/articles/12003714-chatgpt-business-models-and-limits)、[ChatGPT Business FAQ](https://help.openai.com/en/articles/8542115-chatgpt-business-general-faq)。

OpenAI 没有给任何套餐公布固定的消息条数，只给了 Plus 和 Business Standard 按模型分的估算范围：GPT-6.1 Sol 每 5 小时 15 到 160 条本地消息，GPT-6 Luna 每 5 小时 350 到 3,000 条。页面写明这些只是估算，不是固定的消息上限。Fast 模式消耗包含额度的速度是 Standard 的 2.5 倍，Ultrafast 是 8 倍。[Codex 定价 FAQ](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan)

## 怎么查 Codex 剩余额度

1. 打开 Settings → Usage，或者直接进[用量页面](https://chatgpt.com/codex/settings/usage)，看还剩多少、每个限制什么时候重置。
2. 确认你看的是 agent 实际使用的那个账户和工作区。ChatGPT 网页版的个人菜单会显示当前账户和工作区。终端里的 `codex login status` 只告诉你登录方式，输出 `Logged in using ChatGPT` 或 `Logged in using an API key`，查不到账户和额度。CLI 用的是在它的 `CODEX_HOME` 下最后一次 `codex login` 登录的账户，记不清是哪个，就重新登录一次。[认证说明](https://learn.chatgpt.com/docs/auth)
3. 在运行中的 CLI 会话里，`/status` 会显示剩余额度，以及当前模型和 token 用量。`/usage daily`、`/usage weekly`、`/usage cumulative` 显示的是账户已经用掉多少 token，和剩余额度不是一回事。直接输入 `/usage` 会打开一个菜单，里面也可以兑换可用的重置。[斜杠命令](https://learn.chatgpt.com/docs/cli/slash-commands)、[在哪里看当前额度](https://learn.chatgpt.com/docs/pricing#where-can-i-see-my-current-usage-limits)
4. 记下用完的是哪一份：5 小时窗口、每周窗口，还是 credits。两个窗口同时适用时，任何一个用完都会挡住你。所以每周额度用完后，5 小时窗口刷新了也没用。

OpenAI 建议每一两周看一次用量页面。用量比预想的高，可以换小一点的模型，或者把任务范围收窄。[Codex 定价 FAQ](https://learn.chatgpt.com/docs/pricing#where-can-i-see-my-current-usage-limits)

## Codex 额度怎么重置

不是每个账户都有重置选项，OpenAI 客服也不会手动帮你重置。如果找不到重置选项，先确认登录的是对的账户和工作区；确认无误，就只能等计划中的重置。[banked reset 说明](https://help.openai.com/en/articles/20001498-how-banked-codex-resets-work)

### 等计划中的重置

有 5 小时限制的套餐，窗口不是按固定钟点开始的：上一个窗口结束后，你发出的第一条 Work 或 Codex 消息开启下一个窗口。所以在窗口前半段就撞上限，也不会再从头多等 5 小时。每周窗口按 Usage 页面上显示的时间重置。[Work 与 Codex 用量管理](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex)

### 有 banked reset 就用掉

部分账户会通过促销活动得到 banked reset，存在账户里，直到用掉或过期。在 Settings → Usage 里找「1 reset available」或「Full reset」，先看它覆盖哪些限制、什么时候过期，再确认使用。完整的 banked reset 会刷新你适用的 5 小时窗口和每周窗口，并改变每周重置的日期。CLI 里也可以用 `/usage` 兑换可用的重置。[banked reset 说明](https://help.openai.com/en/articles/20001498-how-banked-codex-resets-work)

### 有购买选项就买即时重置

符合条件的个人 Plus、Pro 账户，可能在桌面应用的 Usage 设置里看到「Buy an instant reset」，或者在撞上每周限制后看到购买提示。只撞到 5 小时限制不会出现这个提示。买下的重置会立刻恢复你适用的 5 小时和每周额度，不能存着以后用。它是把下一周的额度提前给你，不会额外多给一份。新的一周从重置后的第一条 Work 或 Codex 请求开始计算，下一次自动的每周重置在那条请求的 7 天后。[付费每周重置](https://help.openai.com/en/articles/20001507-paid-weekly-work-and-codex-rate-limit-resets)

### 买 credits 或升级套餐

Plus 和 Pro 用户可以买 credits，在包含额度用完后继续用，不必换套餐；采用弹性计费的 Business、Edu、Enterprise 工作区则购买工作区 credits（[撞上限额后会怎样](https://learn.chatgpt.com/docs/pricing#what-happens-when-you-hit-usage-limits)）。另一条路是换额度更大的套餐，各档对比见 [Pro 套餐说明](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-plans)。

### 看看有没有 Luna Reserve

部分被选中的个人 Plus、Pro 账户有 Luna Reserve：常规额度用完后，还有一份单独计限的额度，可以继续用 Luna 模型。常规额度用完时，留意用量提示里有没有 Luna Reserve 的通知或月亮图标；没有出现，你的账户多半不在范围内。[Luna Reserve](https://help.openai.com/en/articles/20001499-luna-reserve-in-codex-and-chatgpt-work)

## 长时间跑 Codex，怎样不被额度卡住

开头说过，一轮任务进行中撞上限额，agent 可以把这一轮做完，但下一轮又需要额度。排在后面的任务会怎样，取决于调用 Codex 的脚本或 runner，所以要让它检查每次运行的退出码，不要默认下一个任务已经跑通。[撞上限额后会怎样](https://learn.chatgpt.com/docs/pricing#what-happens-when-you-hit-usage-limits)

### 每个任务少花点额度

额度是同一个池子，换模型不会把已经用掉的额度还回来（上文的 Luna Reserve 是另一份额度，不是退还）。换轻一些的模型能让剩下的额度撑得更久，前面 Sol 和 Luna 的估算范围差得很远。日常任务可以用 `codex exec -m gpt-6-luna "..."` 跑；别开 Fast 模式；`AGENTS.md` 写短一点；任务用不到的 MCP server 关掉，每个 MCP server 都会往每条消息里加上下文。[Work 与 Codex 用量管理](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex)、[让额度撑得更久](https://learn.chatgpt.com/docs/pricing#what-can-i-do-to-make-my-usage-limits-last-longer)

### 把任务挪到 API 按量计费

CLI、IDE 插件和桌面应用都可以用 OpenAI API key 登录，不用 ChatGPT 账户。这部分用量通过你的 OpenAI Platform 账户按标准 API 价格计费，不占套餐额度。OpenAI 建议 CI 这类程序化任务用 API key 登录。代价是：Codex cloud 以及 GitHub 代码审查、Slack 集成等云端功能都需要 ChatGPT 登录；能用哪些模型，取决于你的 key 有哪些模型权限。[认证说明](https://learn.chatgpt.com/docs/auth)、[功能对照](https://learn.chatgpt.com/docs/pricing)

先在 [OpenAI Platform 后台](https://platform.openai.com/api-keys)创建 API key，放进环境变量 `OPENAI_API_KEY`（从密钥管理工具读取，别直接敲进 shell 历史）。然后给 API 登录单独一个 `CODEX_HOME`，免得覆盖你平时交互用的 ChatGPT 登录。下面这段要存成 bash 脚本再运行，不要粘贴进交互式终端：脚本里的 `set -e` 一遇到错误就会把那个终端关掉。

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

我是 Lawrence Liu，Orbi 的创始人。2026 年 10 月 17 日，我在 Linux 上用 Codex CLI 0.163.0 跑了这段脚本。为了不在测试上花真钱，我用的是一个编造的 key：

- `OPENAI_API_KEY` 没设置或为空时，脚本停在第三行，退出码 1。
- 去掉 `mkdir` 那一行，Codex 会因为 `CODEX_HOME` 目录不存在而拒绝启动。
- 用编造的 key 时，`codex login --with-api-key` 照样打印「Successfully logged in」，`codex login status` 也显示是 API key 登录。只有最后那条测试请求发现了 key 是假的：返回 `401 Unauthorized` 和 `invalid_api_key`，脚本退出码 1。
- 我第一版脚本的最后一行没有 `</dev/null`。从管道里运行时，`codex exec` 打印「Reading additional input from stdin...」后一直等，直到被我设的超时杀掉。

同一条请求在我的 ChatGPT 登录下输出 `OK`，退出码 0。我没有用真实 API key 跑过成功的情况。

之后使用同一个 `CODEX_HOME` 的 Codex 命令都会走 API key，前提是中间没有重新登录、也没改登录相关的设置。这个目录一开始是空的。如果你的任务依赖 `~/.codex/config.toml` 里的设置，只把需要的那几项抄过去，登录和 provider 相关的设置（比如 `forced_login_method`）不要带上，抄完再跑一次测试请求。

Codex 也可以完全不走 OpenAI 计费：在 `config.toml` 的 `model_providers.<id>` 下定义另一个支持 Responses API 的服务商，再用 `model_provider` 选中它；或者用 `--oss` 通过 Ollama 或 LM Studio 跑本地模型。[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)

### 给 API 花费设硬上限

花费提醒（spend alert）只发通知，API 请求照常进行。要在月度上限处停下，打开 Organization limits（或 Project settings → Limits），点 Edit spend limit，填金额，打开「Enforce a hard limit」，保存。超过上限的请求会返回 429 错误，错误码是 `organization_spend_limit_exceeded` 或 `project_spend_limit_exceeded`。上限不是即时生效的，记录的花费可能略超一点。API 的速率限制和预付余额也照样适用。[OpenAI 花费上限](https://developers.openai.com/api/docs/guides/spend-limits)

想看按 token 计费的模型实际花多少钱，可以参考 Orbi 的[成本页](/zh/cost/?ref=blog-codex-usage)：那里列出了 169 次合并交付在 DeepSeek 上的花费，也写明了这份样本的局限。

## Codex 额度和 Orbi

Orbi 是一个开源 runner，把 GitHub Issue 一路做到审查、合并、打 tag 发版，中间不需要人盯着。它的 agent 是 Pi，不是 Codex CLI，所以上面的 Codex 登录步骤不会配置到 Orbi。自托管 Orbi 可以用任何 OpenAI 兼容 API 和你自己的 key，花费记在那个服务商账上，不占 Codex 套餐额度。如果你让 Pi 用 ChatGPT/Codex 订阅登录，它花的就是上面说的同一份额度。API key 的配置见[自托管指南](/zh/guides/self-hosted-coding-agent/?ref=blog-codex-usage)，订阅登录见 [Codex 指南](/zh/guides/codex-github-issues/?ref=blog-codex-usage)。

## 相关

- [Codex YOLO mode 会放开什么权限](/zh/blog/codex-yolo-mode/)
- [对比 Orbi 和 Codex](/zh/compare/codex/?ref=blog-codex-usage)
- [Orbi Cloud](/zh/cloud/?ref=blog-codex-usage)
