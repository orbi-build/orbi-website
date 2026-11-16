---
title: OpenCode vs Cursor：命令行、价格与无人值守运行
date: 2026-11-16
summary: OpenCode 和 Cursor 在无头命令行运行、凭据、价格上的对照，附真实命令输出，以及两家 GitHub App 在公开仓库开出的 PR 数量。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-opencode-vs-cursor-card.png
mirror: opencode-vs-cursor
---

OpenCode vs Cursor 这个选择，一边是开源的终端编程 agent，一边是订阅制产品。[OpenCode 由 anomalyco 开源，采用 MIT 许可](https://github.com/anomalyco/opencode)，[模型由你自己接](https://opencode.ai/docs/providers/)；[Cursor 是订阅制产品](https://cursor.com/help/account-and-billing/pricing)，有 AI 编辑器、[云端 agent](https://cursor.com/docs/cloud-agent) 和[叫 `agent` 的命令行](https://cursor.com/docs/cli/overview)。这篇写给要把任务放进脚本、cron 或 CI 无人值守执行的开发者和团队负责人，关注的是无头运行（不开交互界面，直接在脚本里跑）。下面有两个命令行在密钥缺失或写错时的输出和退出码，有 OpenCode 跑四个小任务的结果，有两家截至 2026 年 11 月 16 日的价格，还有两家 GitHub App 在公开仓库开出的 PR（pull request，合并请求）数量。凭据是先遇到的区别：OpenCode 没有密钥也用免费模型跑了，Cursor 则停了下来。测试机器上没有 Cursor 账号，我没有注册，也没有付费，所以没有做登录后的 Cursor 运行；下文登录后的行为都引自 Cursor 文档。

我是 Larry 🍀 Orbi，Orbi 的创始人。Orbi 用另一个开源终端 agent Pi，把 GitHub Issue 推进到实现、独立评审和合并。它与 Cursor 的云端 agent 部分存在竞争关系，读「Orbi 能接哪部分工作」一节时，请把这层关系算进去。

## OpenCode 和 Cursor 的区别一览

这张 OpenCode 和 Cursor 对比表里，Cursor 一栏的能力来自它的文档，我没有登录实测。Free/Plus 的价格说的是套餐，我没有验证这两档能否使用 CLI。

| | OpenCode | Cursor |
|---|---|---|
| 是什么 | [终端编程 agent](https://opencode.ai/docs/cli/) | [编辑器、云端 agent](https://cursor.com/docs/cloud-agent)、[CLI](https://cursor.com/docs/cli/overview) |
| 许可 / 源码 | [MIT，开源](https://github.com/anomalyco/opencode) | [订阅制产品](https://cursor.com/help/account-and-billing/pricing) |
| agent 在哪运行 | [自己的机器](https://opencode.ai/docs/cli/)或 [CI runner](https://opencode.ai/v1/docs/github/) | 编辑器和 CLI 在自己的机器上；[请求经过 Cursor](https://cursor.com/help/models-and-usage/api-keys)，[CLI 需要访问它的 API](https://cursor.com/docs/cli/github-actions)；[云端 agent 在 Cursor 云端运行](https://cursor.com/docs/cloud-agent) |
| 模型 | [自己接入的 provider](https://opencode.ai/docs/providers/)、[免费模型](https://opencode.ai/docs/console/models/)，可选 [Go](https://opencode.ai/docs/console/go/)/[Console](https://opencode.ai/docs/console/) | [套餐包含 Grok、Composer；Premium 起可用第三方模型，按 API 标价计费](https://cursor.com/help/account-and-billing/pricing)；[可在编辑器设置中填自己的密钥](https://cursor.com/help/models-and-usage/api-keys) |
| 无头运行命令 | [`opencode run "..."`](https://opencode.ai/docs/cli/) | [`agent -p "..."`](https://cursor.com/docs/cli/headless) |
| 脚本用的凭据 | [provider 密钥](https://opencode.ai/docs/providers/)，如 `DEEPSEEK_API_KEY`；我的测试里免费模型不需要密钥 | [`CURSOR_API_KEY`](https://cursor.com/docs/cli/reference/authentication) |
| 没有凭据时 | 用免费模型，退出码 0：[我的测试](#凭据缺失或错误时会发生什么) | `Authentication required`，退出码 1：[我的测试](#凭据缺失或错误时会发生什么) |
| 最低费用的运行方式 | [$0 免费模型](https://opencode.ai/docs/console/models/)，或[自备密钥，向 provider 付费](https://opencode.ai/docs/providers/)；可选 [Go，每月 $10](https://opencode.ai/docs/console/go/) | [Free $0，用量有限；Plus 每月 $8；云端 agent 和第三方模型从每月 $30 的 Premium 开始](https://cursor.com/help/account-and-billing/pricing) |
| GitHub 入口 | [`/opencode` 或 `/oc`，在自己的 Actions runner 上运行；仅见于 V1 文档](https://opencode.ai/v1/docs/github/) | [在 PR 或 Issue 上写 `@cursor` 启动云端 agent](https://cursor.com/docs/cloud-agent) |

用 OpenCode，模型和机器由你自己准备。用 Cursor，你买的是套餐，云端 agent 的机器也包含在内。

## OpenCode vs Cursor CLI：无头运行

### 安装和运行命令

下面是 [Cursor 的安装和 print mode 命令](https://cursor.com/docs/cli/overview)，以及 [OpenCode V2 的安装包](https://opencode.ai/docs/)和[运行命令](https://opencode.ai/docs/cli/)。npm 在本地安装，调用 `opencode` 前，要把对应的 `node_modules/.bin` 目录加入 `PATH`。

```bash
curl https://cursor.com/install -fsS | bash
agent -p "Reply with exactly: hi"

npm install @opencode/cli
opencode run --standalone "Reply with exactly: hi"
```

我在 2026 年 11 月 16 日把两者分别装进干净的 Linux HOME：Cursor CLI 是 `2026.11.13-eacade1`，OpenCode 是 `2.3.0`。我最初误装了 `opencode-ai`，拿到的是 `1.19.5`；[旧安装包安装的是 OpenCode 1](https://opencode.ai/docs/)。下文所有 OpenCode 结果都用 V2，加了 [`--standalone`](https://opencode.ai/docs/cli/)，运行结束后不留下共享后台服务。

Cursor 安装器把 `agent` 和 `cursor-agent` 放在 `~/.local/bin`。它的 [GitHub Actions 示例](https://cursor.com/docs/cli/github-actions)却把 `$HOME/.cursor/bin` 加入 `PATH`。我没有在 GitHub runner 上测试，使用时要先检查自己的 runner 上哪个目录存在。

### 凭据缺失或错误时会发生什么

两张表的提示词都是 `Reply with exactly: hi`。长行用 `…` 收尾。Cursor 没有已登录的会话，错误密钥设为 `CURSOR_API_KEY=key_bad`。

| 情况 | 命令 | 输出 | 退出码 |
|---|---|---|---|
| 没有凭据 | `agent -p "Reply with exactly: hi"` | `Error: Authentication required. …` | 1 |
| 没有凭据，加 force | `agent -p --force "Reply with exactly: hi"` | `Error: Authentication required. …` | 1 |
| `CURSOR_API_KEY` 错误 | `agent -p "Reply with exactly: hi"` | `⚠ Warning: The provided API key is invalid.` | 1 |
| 没有凭据 | `agent status` | `Not logged in` | 0 |
| `CURSOR_API_KEY` 错误 | `agent status` | `Not logged in` | 0 |
| 没有凭据 | `agent models` | `Error: Authentication required. …` | 1 |

OpenCode 表的「命令」列只列额外参数，插在下面命令的提示词之前。有密钥的情况提供了 `DEEPSEEK_API_KEY`，错误密钥是 `sk-bad`。每种情况都用全新的 HOME。

```bash
opencode run --standalone "Reply with exactly: hi"
```

| 情况 | 命令 | 输出 | 退出码 |
|---|---|---|---|
| 没有凭据，不指定模型 | 不加额外参数 | `> build · big-pickle`; `hi` | 0 |
| 有密钥，不指定模型 | 不加额外参数 | `> build · iceman-free`; `hi` | 0 |
| 有密钥，固定模型 | `-m deepseek/deepseek-flash` | `> build · deepseek-flash`; `hi` | 0 |
| 密钥错误，固定模型 | `-m deepseek/deepseek-flash` | `Error: Authentication Fails, Your api key: ****-bad is invalid …` | 1 |
| 没有密钥，固定模型 | `-m deepseek/deepseek-flash` | `Error: Model unavailable: deepseek/deepseek-flash` | 1 |
| 配置指定 `deepseek/deepseek-flash`，没有密钥 | 不加额外参数 | `> build · big-pickle`; `hi` | 0 |
| 禁用免费模型，没有凭据 | 不加额外参数 | `Error: No model is available for session …` | 1 |
| 禁用免费模型，有密钥，不指定模型 | 不加额外参数 | `> build · deepseek-flash`; `hi` | 0 |

Cursor 的运行直接失败。没登录和密钥错误时，`agent status` 都返回 0，不能拿它给 CI 预先检查身份验证。没有凭据时，`agent models` 返回 1；我没能用有效凭据测试它。

OpenCode 没有密钥也能运行。即使提供了我的 DeepSeek 密钥，仍要固定模型或禁用免费模型，它才会选 DeepSeek。不指定模型的几种情况各重复了三次，每种情况选出的模型都没变。OpenCode 的[模型文档](https://opencode.ai/docs/models/)把回退行为写为 “falls back to the newest available supported model”。只在配置里写默认模型还不够，缺少它的密钥时仍会回退。

这些免费模型的数据条款不同。[模型页](https://opencode.ai/docs/console/models/)写着，Big Pickle 在免费期间收集的数据可能用于改进模型；Iceman Free 的数据会保留并用于改进模型。CI 中的 secret 一旦缺失，代码就可能发给适用另一套数据条款的模型，运行仍然报成功。

我会禁用免费模型，并固定模型：

```bash
export OPENCODE_DISABLE_FREE_MODELS=1
opencode run --standalone -m deepseek/deepseek-flash "your prompt"
```

[`OPENCODE_DISABLE_FREE_MODELS=1` 会隐藏免费模型](https://opencode.ai/docs/models/)。两行都加上后，缺少密钥和 `DEEPSEEK_API_KEY` 为空时，都报 `Error: Model unavailable: deepseek/deepseek-flash`，退出码 1；密钥错误时报 provider 的 `Authentication Fails` 错误，退出码 1；真实密钥则用 `deepseek-flash` 运行，退出码 0。把我用的 `deepseek/deepseek-flash` 换成你自己的模型。

### 无头运行不询问就能做什么

没有配置文件，也不加 `--auto` 时，OpenCode 在项目内创建了文件、用 shell 命令向项目外写入，还用 `curl` 请求了 `https://example.com`，返回 HTTP 200。这些探测都用 `-m deepseek/deepseek-flash` 固定了模型。三项的退出码都是 0，没有询问，也没有拒绝操作。这符合[默认权限](https://opencode.ai/docs/permissions/#defaults)：每个 agent 都从基础规则 `{ "action": "*", "resource": "*", "effect": "allow" }` 开始，只有读取 `.env` 文件时设为 `ask`；文档还说，读取和编辑项目外的文件会 “proceed without a prompt”。所以默认策略放行了这三项探测；`.env` 读取规则和各 agent 内置的规则仍然适用。要限制其他操作，得自己加权限规则。

为了限制 shell 命令，我在 `~/.config/opencode/opencode.jsonc` 加了这条规则：

```jsonc
{
  "permissions": [
    { "action": "shell", "resource": "*", "effect": "ask" }
  ]
}
```

项目外写入的探测随后报告：`This non-interactive run cannot ask the user for permission, so the request was rejected. Continue without this action.` 文件没有生成，退出码却是 0。加 `--auto` 后就放行了。把 `"effect"` 改为 `"deny"`，加不加 `--auto` 都会拦住 shell 命令，符合[这个参数保留显式 deny 规则的说明](https://opencode.ai/docs/permissions/)。

用 ask 规则跑下一节的第一个编程任务（修复单文件 bug）时，OpenCode 改了文件，但它调用 `python3 -m unittest` 时被拒绝了。我事后自己跑测试，通过了。

Cursor 登录后的这些行为，我没有实测。[Cursor 文档说](https://cursor.com/docs/cli/headless)，print mode 不加 `--force` 也能编辑工作区文件；项目外写入、未经批准的 MCP 工具和网页抓取会被拒绝。shell 命令如果既不在允许列表里，也不能在已启用的沙箱里运行，同样会被拒绝。文档说，`--force`/`--yolo` 会放行所有操作，但 [`permissions.deny`](https://cursor.com/docs/cli/reference/permissions) 和团队策略拦截的操作除外。[团队管理员可以禁用无头模式](https://cursor.com/docs/cli/headless)，由客户端执行这项限制。

用哪款工具，都别把退出码 0 当成每一步都执行过的证明；脚本还得检查测试和 diff。

## 用免费模型和自备密钥在 OpenCode 上跑四个小任务

我沿用了 [OpenCode vs Codex](/zh/blog/opencode-vs-codex/) 的四个小型 Python 仓库：修复单文件 bug、实现一个函数、跨文件找 bug，以及修复多个 bug 并接受额外的隐藏检查。每个模型在每个任务上各跑三次，每次都重新克隆仓库，用干净的 HOME。通过的条件是事后仓库测试通过、测试文件没改，任务 4 还得通过隐藏检查。

两个模型我都固定了：一个是用我自己密钥的 `deepseek/deepseek-flash`，另一个是无凭据探测中选出的免费模型 `opencode/big-pickle`。中位数按指标分别取，一行不对应某一次运行。

| 任务 | 模型 | 通过 | 步数中位数 | 耗时中位数 | OpenCode 报告的费用中位数 |
|---|---|---|---|---|---|
| 1：单文件 bug | `deepseek/deepseek-flash` | 3/3 | 5 | 6.6s | $0.00109 |
| 1：单文件 bug | `opencode/big-pickle` | 3/3 | 3 | 17.4s | $0.00000 |
| 2：实现函数 | `deepseek/deepseek-flash` | 3/3 | 5 | 6.1s | $0.00111 |
| 2：实现函数 | `opencode/big-pickle` | 3/3 | 5 | 20.2s | $0.00000 |
| 3：跨文件 | `deepseek/deepseek-flash` | 3/3 | 5 | 7.3s | $0.00132 |
| 3：跨文件 | `opencode/big-pickle` | 3/3 | 5 | 32.4s | $0.00000 |
| 4：隐藏检查 | `deepseek/deepseek-flash` | 3/3 | 5 | 13.2s | $0.00241 |
| 4：隐藏检查 | `opencode/big-pickle` | 3/3 | 5 | 34.5s | $0.00000 |

DeepSeek 跑了 12 次，12 次通过，报告的总费用是 $0.01686，耗时中位数 7.1s。Big Pickle 跑了 12 次，12 次通过，报告的总费用是 $0.00000，耗时中位数 20.1s。

这些任务太小，还不足以区分模型或工具的能力。费用是把 OpenCode 事件流中各步的 `cost` 字段相加，并非我的 DeepSeek 账单。免费指不收钱，仍适用上文的数据条款；[Big Pickle 的免费期是 “for a limited time”](https://opencode.ai/docs/console/models/)。任务 4 用 DeepSeek 跑第二次时，我在运行中改了 runner，把那次运行弄坏了，随后重跑了一次，表里用的是重跑结果。我没有 Cursor 账号，所以没有用 Cursor CLI 跑这些任务。

## OpenCode 和 Cursor 的价格

下面是 2026 年 11 月 16 日的月付价格。[Cursor 现在并入 The X Subscription（一份订阅同时包含 Grok、Cursor 和 X），旧的 Pro、Pro+ 套餐已不接受新客户](https://cursor.com/help/account-and-billing/pricing)。

| Cursor 套餐 | 月费 | 使用权限 |
|---|---|---|
| [Free](https://cursor.com/help/account-and-billing/pricing) | $0 | 用量有限；仅限 Cursor 模型 |
| [Plus](https://cursor.com/help/account-and-billing/pricing) | $8 | Cursor 自家模型（Grok、Composer），运行设置固定；不含云端 agent、Bugbot、Origin 和第三方模型 |
| [Premium](https://cursor.com/help/account-and-billing/pricing) | $30 | 含云端 agent、Bugbot、Origin 和第三方模型；第三方模型按 API 标价从预付额度中另扣 |
| [Super](https://cursor.com/help/account-and-billing/pricing) | $100 | 更高用量 |
| [Ultra](https://cursor.com/help/account-and-billing/pricing) | $200 | 更高用量 |
| [Teams](https://cursor.com/help/account-and-billing/pricing) | 每席位 $30/$100/$200 | 用量随席位档位变化 |

| OpenCode 选项 | 价格 | 付的是什么钱 |
|---|---|---|
| [CLI](https://github.com/anomalyco/opencode) | 免费，MIT | 模型用量另付费 |
| [免费模型](https://opencode.ai/docs/console/models/) | $0 | 有免费期；数据条款各不相同 |
| [自备 provider 密钥](https://opencode.ai/docs/providers/) | provider 账单 | 我的 12 次 DeepSeek 任务报告了 $0.01686 |
| [Go / Go Plus / Go Teams](https://opencode.ai/docs/console/go/) | $10/月 / $40/月 / $20/成员/月 | 指定的开放模型；有每月美元额度上限 |
| [Console](https://opencode.ai/docs/console/models/) | 按 token 用量付费 | 例子见下文 |

[Console 的 Claude Opus 5.5 一行](https://opencode.ai/docs/console/models/)列出的每百万 token 价格是：输入 $4.00、输出 $20.00、缓存读取 $0.20、缓存写入 $5.00。[Go](https://opencode.ai/docs/console/go/) 和 [Console](https://opencode.ai/docs/console/) 都是可选服务，这两个付费服务我都没测。

[Cursor 的自备密钥文档](https://cursor.com/help/models-and-usage/api-keys)只介绍编辑器设置和聊天模型；Tab 用内置模型。文档说，模型用量由你的 provider 收费，请求仍经过 Cursor 的服务器。在 Premium、Super 和 Ultra 上，自备密钥的请求既不消耗套餐用量，也不消耗预付额度；在 Teams/Enterprise 上，即使用自己的密钥，符合条件的第三方模型仍收取每百万 token $0.25 的 Cursor Token Rate。我没找到文档明确说自备密钥是否适用于 CLI。CLI 帮助列有 `bedrock`，说明是 `Configure AWS Bedrock usage for CLI`，我没有测试。

我会分别看 Cursor 的席位价格和 OpenCode 的模型账单。哪边花费少，取决于 token 用量。我没有 Cursor 用量数据，不判断哪款产品更便宜。

## 两家 GitHub App 在公开仓库开出的 PR

OpenCode 的 [V1 GitHub 集成](https://opencode.ai/v1/docs/github/)在收到 `/opencode` 或 `/oc` 后，用你的模型密钥在你的 Actions runner 上运行。它的 App 开出的 PR，作者是 `opencode-agent[bot]`。文档里的 `use_github_token: true` 模式不需要安装 App，所以这些 PR 没计入 App 数量；在终端里做完工作后由你自己开的 PR 也没计入。V2 文档索引没有 GitHub 页面，CLI `2.3.0` 也没有 `github` 子命令。我没有在 V2 上测试这项集成。Cursor 的[云端 agent](https://cursor.com/docs/cloud-agent)开出的 PR，在这次观察中作者是 `cursor[bot]`。

我在 2026 年 11 月 16 日统计了 2026 年 11 月 2 日至 8 日 UTC 创建的公开 PR。数字反映查询时的状态，之后可能变化。两行不能拿来比较合并率。

| 作者 | 开出 | 已合并 | 关闭未合并 | 仍开着 | 当前标为草稿 | 仓库数 |
|---|---|---|---|---|---|---|
| `opencode-agent[bot]` | 167 | 119 | 24 | 24 | 3 | 32 |
| `cursor[bot]` | 4,758 | 928 | 440 | 3,390 | 3,601 | 750 |

两组的规模不同：一组是 32 个仓库中的 167 个 PR，另一组是 750 个仓库中的 4,758 个。仓库归谁也要算进去：10 月，这个 App 开出的 3,435 个 PR 中，2,709 个在发布 OpenCode 的 anomalyco 组织里，其中 2,357 个在 `anomalyco/models.dev`。排除 anomalyco，10 月开出 726 个，已合并 530 个。11 月这一周的 167 个中，anomalyco 占了 37 个。

「当前标为草稿」与状态列有重叠：Cursor 的 3,601 条带草稿标记的记录中，363 个关闭未合并，36 个已合并。我没有查明已合并记录为什么仍带标记，也没有查明创建时的默认状态。全部 4,758 个中，19.5% 已合并；没有草稿标记的 1,157 个中，892 个（77.1%）已合并。这些数字说明不了哪个 agent 的代码更常被接受。[Devin vs Cursor](/zh/blog/devin-vs-cursor/) 在 10 月数据中也看到了同样的差距：全部 `cursor[bot]` PR 中，19.2% 已合并；没有草稿标记的那部分，73.0% 已合并。创建窗口和观察日期不同，留给这些 PR 的后续处理时间也不同。

我还读了 `merged_by` 字段。OpenCode App 的全部 119 个已合并 PR 中，87 个由用户账号合并，32 个由 bot 合并，后者包括 `github-actions[bot]` 合并的 28 个和 `opencode-agent[bot]` 合并的 4 个。我从 Cursor 已合并的 PR 中随机抽了 150 个，101 个由用户合并，49 个由 bot 合并，其中 43 个由 `cursor[bot]` 合并。这个字段不说明是谁请求了合并。

我把这些数字看作公开使用的证据：一小批仓库把 OpenCode 接进 Actions，另一批规模更大的仓库在用 Cursor，PR 大多是草稿。私有仓库和其他 PR 作者都不在统计里。

要统计自己的仓库：

```bash
gh api -X GET search/issues \
  -f q='is:pr repo:OWNER/REPO author:app/cursor is:merged created:2026-11-02..2026-11-08' \
  -q .total_count
```

把 `OWNER/REPO`、App slug（`cursor` 或 `opencode-agent`）和日期换掉；去掉 `is:merged` 就查总数。需要先登录 GitHub CLI。我的测试在有匹配结果的仓库返回了 17 个已合并 PR；没有匹配结果时打印 0，退出码 0。仓库或 App 不存在时，报 `gh: Validation Failed (HTTP 422)`，退出码 1。搜索 API 每分钟允许 30 次请求。[更完整的脚本](/zh/blog/devin-vs-cursor/#自己统计一遍)还会统计其他状态。

## OpenCode 和 Cursor 哪个好用，我按这几条选

- 要带补全功能、按订阅付费的[编辑器](https://cursor.com/help/account-and-billing/pricing)，选 Cursor。我没有上手比较过编辑器。
- 要自己选 [provider](https://opencode.ai/docs/providers/)、在自己的[机器或 CI runner](https://opencode.ai/v1/docs/github/) 上跑，或者[读源码](https://github.com/anomalyco/opencode)，选 OpenCode。
- 要无人值守地跑 Cursor，提供 [`CURSOR_API_KEY`](https://cursor.com/docs/cli/reference/authentication)，并确保[能访问 Cursor 的 API](https://cursor.com/docs/cli/github-actions)。[云端 agent 和第三方模型从 Premium 开始提供](https://cursor.com/help/account-and-billing/pricing)。
- 要无人值守地跑 OpenCode，用 `-m` 固定模型，设置 `OPENCODE_DISABLE_FREE_MODELS=1`，加权限规则，再自己验证结果。
- 买席位前，我会在自己仓库的副本上，让两者用一周处理同样的真实任务票，再统计合并了哪些。

## Orbi 能接哪部分工作

Orbi 不评审也不合并 OpenCode 或 Cursor 开出的 PR。它从打了 `ai-ready` 标签的 GitHub Issue 开始：先实现，再由独立会话评审，修复发现的问题，评审通过且 CI 全绿后合并。需要人工批准时，它会停下来。发版由人发起。

Orbi 没有编辑器，也没有终端聊天，唯一的任务入口是 GitHub Issue。它的引擎是 [Pi，和 OpenCode 一样是开源终端 agent](/zh/blog/pi-coding-agent-vs-opencode/)。[Orbi 对比 Cursor](/zh/compare/cursor/) 写了交接方式。想在编辑器或终端里和 agent 一起写代码，就不用考虑 Orbi。

## 相关

- [OpenCode vs Codex CLI：同一模型，无人值守实测](/zh/blog/opencode-vs-codex/)
- [Devin vs Cursor：它们开出的 PR 后来怎么样了](/zh/blog/devin-vs-cursor/)
- [Cursor 替代品怎么选：编辑器、后台 agent 与合并发版](/zh/blog/cursor-alternatives/)
- [Orbi 对比 Cursor](/zh/compare/cursor/)
- [Orbi Cloud](/zh/cloud/?ref=blog-oc-vs-cursor)
