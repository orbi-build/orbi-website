---
title: Codex 额度怎么查、何时重置、用完了怎么办
date: 2026-10-17
updated: 2026-11-23
summary: Codex 用量限制按套餐分 5 小时窗口和每周窗口。在 Usage 页面和 /status 查剩余额度，弄清额度何时重置，长时间无人值守跑 Codex 时也不被额度卡住。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-codex-usage-card.png
mirror: codex-usage-limits
---

Codex 用量限制，指 ChatGPT 套餐里包含的 Codex 额度。大多数套餐用 5 小时窗口、每周窗口或两者同时计量。剩余额度和重置时间在 [Codex 用量页面](https://chatgpt.com/codex/settings/usage)（Settings → Usage）里看，CLI 会话里输入 `/status` 也能看到剩余额度。如果一轮任务进行到一半撞上限额，Codex 会让 agent 继续这一轮的工作，但要受公平使用限制约束。之后有几条路：等重置；账户有可用的重置或 credits 就用掉；或者把 CLI 换成 API 按量计费。

下文每条 OpenAI 的说法都附了官方页面链接。大部分抓取于 2026 年 10 月 17 日；2026 年 12 月的额度调整、credits 和套餐到期两节，是 2026 年 11 月 23 日核对的。OpenAI 经常调整这些规则，和你自己的 Usage 页面对不上时，以 Usage 页面为准。

## Codex 用量限制怎么算

如果你也用 ChatGPT Work（ChatGPT 里一个独立功能，不是普通聊天），它和 Codex 花的是同一份额度，价格、credits 和用量限制都一样。一条消息花掉多少额度，取决于模型、携带的上下文、推理量、工具调用，以及任务在本地还是云端运行；云端任务可能比本地消息耗得多。[Codex 定价 FAQ](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan)

适用哪些窗口，看套餐：

| 套餐 | 5 小时窗口 | 其他说明 |
|---|---|---|
| Plus、Business Standard | 有 | 可能还有每周限制 |
| Pro（每月 100、200 或 500 美元三档） | 目前没有 | 额度仍然有上限，也可能有每周限制 |
| Business Premium | 没有 | 包含的 Work 和 Codex 用量是 Standard 席位的 5 倍；每周限制看 Usage 页面 |
| 采用弹性计费的 Enterprise、Edu | 没有固定速率限制 | 用量从工作区 credits 里扣 |
| 未采用弹性计费的 Enterprise、Edu | 大多数功能同 Plus | 单席位限制与 Plus 相同，具体问工作区管理员 |

Free 和 Go 用户也能在桌面应用里用 GPT-6 Luna 跑 Codex（逐步开放），额度同样看 Usage 页面。出处：[Codex 定价 FAQ](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan)、[Work 与 Codex 用量管理](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex)、[ChatGPT Business 模型与限制](https://help.openai.com/en/articles/12003714-chatgpt-business-models-and-limits)、[ChatGPT Business FAQ](https://help.openai.com/en/articles/8542115-chatgpt-business-general-faq)。

OpenAI 没有给任何套餐公布固定的消息条数，只给了 Plus 和 Business Standard 按模型分的估算范围：GPT-6.1 Sol 每 5 小时 15 到 160 条本地消息，GPT-6 Luna 每 5 小时 350 到 3,000 条。页面写明这些只是估算，不是固定的消息上限。Fast 模式消耗包含额度的速度是标准速度的 2.5 倍，Ultrafast 是 8 倍。[Codex 定价 FAQ](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan)

2026 年 12 月起规则会变。OpenAI 说，Plus、Pro、Business 套餐的额度将由 ChatGPT 和 Codex 共用，按 token 计量：在 ChatGPT 里跑重活和在 Codex 里跑任务，扣的是同一份余额。Instant 聊天不扣这份额度。届时 Settings → Usage 会显示合并后的剩余额度和重置时间；用完之后的出路不变：等重置、升级套餐，或者买 credits。[ChatGPT 与 Codex 用量限制说明](https://help.openai.com/en/articles/20001625-understanding-chatgpt-and-codex-usage-limits)

## 怎么查 Codex 剩余额度

1. 打开 Settings → Usage，或者直接进[用量页面](https://chatgpt.com/codex/settings/usage)，看还剩多少、每个限制什么时候重置。
2. 确认你看的是 agent 实际使用的那个账户和工作区。ChatGPT 网页版的个人菜单会显示当前账户和工作区。终端里的 `codex login status` 只告诉你登录方式，输出 `Logged in using ChatGPT` 或 `Logged in using an API key`，查不到账户和额度。CLI 用的是在它的 `CODEX_HOME`（Codex 存放登录信息和配置的目录，默认 `~/.codex`）下最后一次 `codex login` 登录的账户，记不清是哪个，就重新登录一次。[认证说明](https://learn.chatgpt.com/docs/auth)
3. 在运行中的 CLI 会话里，`/status` 会显示剩余额度，以及当前模型和 token 用量。`/usage daily`、`/usage weekly`、`/usage cumulative` 显示的是账户已经用掉多少 token，和剩余额度不是一回事。直接输入 `/usage` 会打开一个菜单，里面也可以兑换可用的重置。[斜杠命令](https://learn.chatgpt.com/docs/cli/slash-commands)、[在哪里看当前额度](https://learn.chatgpt.com/docs/pricing#where-can-i-see-my-current-usage-limits)
4. 记下用完的是哪一份：5 小时窗口、每周窗口，还是 credits。两个窗口同时适用时，任何一个用完都会挡住你。所以每周额度用完后，5 小时窗口刷新了也没用。

OpenAI 建议每一两周看一次用量页面。用量比预想的高，可以换小一点的模型，或者把任务范围收窄。[Codex 定价 FAQ](https://learn.chatgpt.com/docs/pricing#where-can-i-see-my-current-usage-limits)

## Codex 额度怎么重置

所有限制都会按计划自动重置。下面几种办法能让你提前恢复，但不是每个账户都有。OpenAI 客服也不会额外送你重置。如果 Settings → Usage 里没有可用的重置，先刷新页面，确认登录的是对的账户和工作区。促销活动说你应该有重置、页面上却一直不显示，就联系客服核查。[banked reset 说明](https://help.openai.com/en/articles/20001498-how-banked-codex-resets-work)

### 等计划中的重置

有 5 小时限制的套餐，窗口不是按固定钟点开始的。上一个窗口结束后，你发出的第一条 Work 或 Codex 消息开启下一个窗口，5 小时后这个窗口结束。比如窗口开始 1 小时就撞上限，你要等的是这个窗口剩下的大约 4 小时，准确时间看 Usage 页面。每周窗口按 Usage 页面上显示的时间重置。[Work 与 Codex 用量管理](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex)

### 有 banked reset 就用掉

部分账户会通过促销活动得到 banked reset，存在账户里，直到用掉或过期。在 Settings → Usage 里找「1 reset available」或「Full reset」，先看它覆盖哪些限制、什么时候过期，再确认使用。完整的 banked reset 会刷新你适用的 5 小时窗口和每周窗口，并改变每周重置的日期，新日期看 Usage 页面。CLI 里也可以用 `/usage` 兑换可用的重置。[banked reset 说明](https://help.openai.com/en/articles/20001498-how-banked-codex-resets-work)

### 有购买选项就买即时重置

符合条件的个人 Plus、Pro 账户，可能在桌面应用的 Usage 设置里看到「Buy an instant reset」，或者在撞上每周限制后看到购买提示。只撞到 5 小时限制不会出现这个提示。买下的重置会立刻恢复你适用的 5 小时和每周额度，不能存着以后用。OpenAI 的说法是，它把你正常的每周额度提前给你，不是另外加一份：你马上拿到新一周的额度。新的一周从重置后的第一条 Work 或 Codex 请求开始计算，下一次自动的每周重置在那条请求的 7 天后。[付费每周重置](https://help.openai.com/en/articles/20001507-paid-weekly-work-and-codex-rate-limit-resets)

### 买 credits 或升级套餐

Plus 和 Pro 用户可以买 credits，在包含额度用完后继续用，不必换套餐（一份 credits 能用多久，见下文 [Codex credits 能用多久](#codex-credits-能用多久)）；采用弹性计费的 Business、Edu、Enterprise 工作区则购买工作区 credits（[撞上限额后会怎样](https://learn.chatgpt.com/docs/pricing#what-happens-when-you-hit-usage-limits)）。另一条路是换额度更大的套餐，各档对比见 [Pro 套餐说明](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-plans)。

### 看看有没有 Luna Reserve

OpenAI 选定的部分个人 Plus、Pro 账户有 Luna Reserve：常规额度用完后，还有一份单独计限的额度，可以继续用 Luna 模型。常规额度用完时，留意用量提示里有没有 Luna Reserve 的通知或月亮图标；没有出现，你的账户多半不在范围内。[Luna Reserve](https://help.openai.com/en/articles/20001499-luna-reserve-in-codex-and-chatgpt-work)

## Codex credits 能用多久

Usage 页面上那个 credits 数字，和套餐自带的 5 小时、每周额度是两份账。Codex 先扣套餐额度，扣完了才动 credits。买 credits、看余额和最近的消耗，都在 ChatGPT 的 Settings → Usage，或 Codex 应用的 Usage & Billing 里。[个人套餐的 credits 说明](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans)

一条消息花多少 credits 没有固定数，OpenAI 按模型、按每百万 token 计价，新输入、缓存命中的输入、输出三种 token 分开算。标准速度下的几行：[Token 费率](https://learn.chatgpt.com/docs/pricing)

| 模型 | 输入 | 缓存输入 | 输出 |
|---|---|---|---|
| GPT-6.2 Astra | 200 | 10 | 1,000 |
| GPT-6.1 Sol | 50 | 2.5 | 250 |
| GPT-6 Luna | 2.5 | 0.25 | 12.5 |

*单位：每百万 token 的 credits，标准速度。*

所以「几万 credits 能用多久」要先算一个任务花多少。举个例子：一个任务发出 5 万新输入 token、15 万缓存输入 token，拿回 1 万输出 token。用 GPT-6.1 Sol，是 2.5 + 0.375 + 2.5，约 5.4 credits；同一个任务换成 GPT-6 Luna，约 0.29 credits。用 credits 付费时，Fast 模式在这几个模型上扣得翻倍（扣套餐额度时是前面说的 2.5 倍）；Ultrafast（GPT-6.1 Sol 有，Luna 没有）扣得更多。按这个例子算，1000 credits 在 GPT-6.1 Sol 上大约够 186 个这样的任务，在 GPT-6 Luna 上大约 3,480 个。至于 1000 credits 要花多少钱，OpenAI 没公布统一单价，价格和折扣看套餐，结账页付款前会显示。你的任务和例子不会一样，最靠谱的办法是在 Usage 页面看最近几个任务实际花了多少，用余额去除。

买之前先知道四件事：

- **会过期**：credits 自购买起 12 个月过期，没用完不结转；2026 年 11 月 13 日之后在日本购买的，180 天过期。
- **不退款**：除非法律或合同要求，或属于计费错误这类少数例外。
- **余额可能变负**：任务开始时余额是正的，跑的过程中其他任务也在扣，结束时可能扣到负数；下次购买先补上负数部分。
- **不是 API 额度**：它不能付 API key 的费用，也和礼品卡充值的美元钱包是两份钱。

同一账户的 credits 在 Codex、ChatGPT Work、Word、Excel、PowerPoint 之间通用。在 ChatGPT 里存一句「用 credits 前先问我」不会多出一道确认：套餐额度用完后，已有的 credits 会被直接扣用。如果还打开了自动充值，余额低于你设的下限时会自动再买。[个人套餐的 credits 说明](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans)

## 套餐到期或退订后，额度怎么办

正常退订后，付费功能可以用到当前计费周期结束；如果 OpenAI 退还了最后那笔费用，它对应的权益通常会提前结束。退订要回到当初订阅的地方：网页版在 Settings → Billing，App Store 或 Google Play 订阅的去商店里退。[取消 ChatGPT 订阅](https://help.openai.com/en/articles/7232927-canceling-your-chatgpt-subscription)

到期前，在 Settings → Usage 把三份余额各看一眼，它们的规则不一样：

- **套餐自带额度**：跟着套餐走。OpenAI 没提过可以结转，按到期就没了来打算。
- **买的 credits**：照旧是购买后 12 个月过期。OpenAI 给 Free 和 Go 用户的说明里写着，即使不能买，仍可能查看和使用已有的 credits 余额，可见余额有可能比套餐活得久。以你自己的 Usage 页面为准，别想当然。
- **banked reset**：Settings → Usage 里每个重置旁边写着过期时间，那就是兑换截止时间。过期的重置 OpenAI 不补、不延期。[banked reset 说明](https://help.openai.com/en/articles/20001498-how-banked-codex-resets-work)

## 长时间跑 Codex，怎样不被额度卡住

开头说过，一轮任务进行中撞上限额，agent 可以继续这一轮的工作，但下一轮又需要额度。排在后面的任务会怎样，取决于调用 Codex 的脚本或 runner。ChatGPT 额度用完时 `codex exec` 返回什么，我没有实测过，所以让脚本遇到任何非零退出码就停下、去看 Usage 页面。也别只看退出码：开始下一个任务前，先检查上一个任务有没有产出该有的东西，比如一次提交或一个输出文件。[撞上限额后会怎样](https://learn.chatgpt.com/docs/pricing#what-happens-when-you-hit-usage-limits)

### 每个任务少花点额度

额度是同一个池子，换模型不会把已经用掉的额度还回来（上文的 Luna Reserve 是另一份额度，不是退还）。换轻一些的模型能让剩下的额度撑得更久，前面 Sol 和 Luna 的估算范围差得很远。日常任务可以在 Git 仓库里用 `codex exec -m gpt-6-luna "..." </dev/null` 跑（原因见下面 API 一节）；别开 Fast 模式；`AGENTS.md` 写短一点；任务用不到的 MCP server 关掉，每个 MCP server 都会往每条消息里加上下文。[Work 与 Codex 用量管理](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex)、[让额度撑得更久](https://learn.chatgpt.com/docs/pricing#what-can-i-do-to-make-my-usage-limits-last-longer)

### 把任务挪到 API 按量计费

CLI、IDE 插件和桌面应用都可以用 OpenAI API key 登录，不用 ChatGPT 账户。这部分用量通过你的 OpenAI Platform 账户按标准 API 价格计费，不占套餐额度。OpenAI 建议 CI 这类程序化任务用 API key 登录。代价是：Codex cloud 以及 GitHub 代码审查、Slack 集成等云端功能都需要 ChatGPT 登录；能用哪些模型，取决于你的 key 有哪些模型权限。[认证说明](https://learn.chatgpt.com/docs/auth)、[功能对照](https://learn.chatgpt.com/docs/pricing)

先在 [OpenAI Platform 后台](https://platform.openai.com/api-keys)创建 API key，在当前 shell 里用 `export` 设成环境变量 `OPENAI_API_KEY`（值从密钥管理工具读取；或者先运行 `read -rs OPENAI_API_KEY && export OPENAI_API_KEY`，再粘贴 key 并回车，key 不会显示在屏幕上，也不进 shell 历史）。不加 `export`，脚本读不到它。然后给 API 登录单独一个 `CODEX_HOME`，免得覆盖你平时交互用的 ChatGPT 登录。下面这段存成 `codex-api-login.sh`，用 `bash codex-api-login.sh` 运行。别用 `sh` 运行，它可能不支持 `pipefail`；也不要粘贴进交互式终端，脚本里的 `set -e` 一遇到错误就会把那个终端关掉。

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

我是 Larry 🍀 Orbi，Orbi 的创始人。2026 年 10 月 17 日，我在 Linux 上用 Codex CLI 0.163.0 跑了这段脚本。为了不在测试上花真钱，我用的是一个编造的 key：

- `OPENAI_API_KEY` 没设置或为空时，脚本停在第三行，退出码 1。
- 去掉 `mkdir` 那一行，Codex 会因为 `CODEX_HOME` 目录不存在而拒绝启动。
- 用编造的 key 时，`codex login --with-api-key` 照样打印「Successfully logged in」，`codex login status` 也显示是 API key 登录。只有最后那条测试请求发现了 key 是假的：返回 `401 Unauthorized` 和 `invalid_api_key`，脚本退出码 1。
- 我第一版脚本的最后一行没有 `</dev/null`。从管道里运行时，`codex exec` 打印「Reading additional input from stdin...」后一直等，直到被我设的超时杀掉。

同一条请求在我的 ChatGPT 登录下输出 `OK`，退出码 0。我没有用真实 API key 跑过成功的情况。

真正无人值守跑的时候，逐条检查：

- 每一条 Codex 命令都要设同一个 `CODEX_HOME`，包括 runner 或 crontab 里的。脚本里的 `export` 只在那个脚本里有效。只要中间没有重新登录、也没改登录相关的设置，API key 登录就一直有效。
- 在 Git 仓库里运行。在仓库之外，`codex exec` 会报「Not inside a trusted directory and --skip-git-repo-check was not specified」并退出，测试脚本加 `--skip-git-repo-check` 就是这个原因。我在一个新建的 Git 仓库里用全新的空 `CODEX_HOME` 试过，这项检查能通过。
- 每条 `codex exec` 都带 `</dev/null`，原因见上面最后一条测试。
- `$HOME/.codex-api` 一开始是空的，平时 `~/.codex/config.toml` 里的审批、沙箱等设置都不在里面。只把需要的那几项抄过去，登录和 provider 相关的设置（比如 `forced_login_method`）不要带上，抄完再跑一次测试请求。要改仓库文件的任务，也可以在命令行上指定沙箱，各模式能做什么见 [Codex YOLO mode 那篇](/zh/blog/codex-yolo-mode/)。
- cron 启动时的 `PATH` 比终端里短得多。在 crontab 顶部设好 `PATH`，要包含 `codex` 所在的目录；如果 Codex 是用 npm 装的，还要包含 `node` 所在的目录，因为 npm 装的 `codex` 命令是一个 Node 脚本。
- 如果你的 key 用不了 `gpt-6-luna`，测试请求和正式任务都换成它能用的模型。
- key 存在 `$HOME/.codex-api` 的 `auth.json` 里（或系统的凭据存储里），这个目录要像密码一样保管。

合起来，一条 cron 任务的命令是这样：

```bash
cd /path/to/repo && CODEX_HOME="$HOME/.codex-api" codex -a never exec -m gpt-6-luna --sandbox workspace-write "Run the tests and fix the failures." </dev/null
```

`-m` 要和测试请求保持一致；不加的话，Codex 用的是它的默认模型。我用编造的 key 在一个新建的 Git 仓库里跑过这条命令，它连到了 API，同样以 `401` 退出、退出码 1，说明命令本身能照原样运行。交给 cron 之前，先用一个必须写文件的小任务试一次。

Codex 也可以完全不走 OpenAI 计费：在 `config.toml` 的 `model_providers.<id>` 下定义另一个支持 Responses API 的服务商，再用 `model_provider` 选中它；或者用 `--oss` 通过 Ollama 或 LM Studio 跑本地模型。[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)

### 给 API 花费设硬上限

花费提醒（spend alert）只发通知，API 请求照常进行。要在月度上限处停下，在 OpenAI Platform 后台打开 Organization limits（或 Project settings → Limits），点 Edit spend limit，填金额，打开「Enforce a hard limit」，保存。超过上限的请求会返回 429 错误，错误码是 `organization_spend_limit_exceeded` 或 `project_spend_limit_exceeded`。上限不是即时生效的，记录的花费可能略超一点。API 的速率限制和预付余额也照样适用。[OpenAI 花费上限](https://developers.openai.com/api/docs/guides/spend-limits)

## Codex 额度和 Orbi

Orbi 是一个开源 runner，把 GitHub Issue 一路做到审查、合并、打 tag 发版，中间不需要人盯着。它的 agent 是开源编程 agent Pi，不是 Codex CLI，所以上面的 Codex 登录步骤不会配置到 Orbi。自托管 Orbi 可以用任何 OpenAI 兼容 API 和你自己的 key，花费记在那个服务商账上，不占 Codex 套餐额度。如果你让 Pi 用 ChatGPT/Codex 订阅登录，它花的就是上面说的同一份额度。API key 的配置见[自托管指南](/zh/guides/self-hosted-coding-agent/?ref=blog-codex-usage)，让 Pi 用 ChatGPT/Codex 订阅登录的步骤见 [Codex 指南](/zh/guides/codex-github-issues/?ref=blog-codex-usage)。[成本页](/zh/cost/?ref=blog-codex-usage)列出了 169 次 Orbi 交付（每次把一个 Issue 做到 PR 合并）在 DeepSeek 上的花费，也写明了这份样本的局限。那是 DeepSeek 的价格，不能拿来估 OpenAI API 的花费。

## 相关

- [Codex YOLO mode 会放开什么权限](/zh/blog/codex-yolo-mode/)
- [对比 Orbi 和 Codex](/zh/compare/codex/?ref=blog-codex-usage)
- [Orbi Cloud](/zh/cloud/?ref=blog-codex-usage)
