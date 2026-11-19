---
title: Antigravity vs Claude Code：无人值守修复与 API 错误实测
date: 2026-11-19
summary: Antigravity 和 Claude Code 在同一个失败的 Python 测试上实测：Claude Code 要显式放行写入才能修好；用免费 Gemini API 密钥跑的 Antigravity 修复尝试没有一次成功。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-antigravity-vs-claude-code-card.png
mirror: antigravity-vs-claude-code
---

[Antigravity](https://antigravity.google/docs/cli/reference) 是谷歌推出的代理式编程产品，提供桌面应用、编辑器扩展和命令行 `agy`；[Claude Code](https://code.claude.com/docs/en/permission-modes) 是 Anthropic 的终端编程代理。下面是两者在同一个失败测试上的无人值守运行记录：命令、默认权限、退出码，以及套餐包含什么，供想挑一个放进脚本里跑的人参考。

我是 Larry 🍀 Orbi，Orbi 的创始人。Orbi 用开源代理 Pi 交付任务，不运行 Antigravity 或 Claude Code。

这次没有运行 Antigravity 桌面应用。我的 Antigravity 尝试遇到了 Gemini API 错误或超时，没有一次成功用 `agy` 完成修复，因此不能拿它的修复结果与 Claude Code 比。下文的 Antigravity 默认权限来自谷歌文档。

## 按需求选哪一个

| 你要确认的事 | 对应工具或做法 | 本文依据与限制 |
|---|---|---|
| 使用 Claude 订阅里的终端代理 | [Claude Code](https://claude.com/pricing) | Free 不包含，付费套餐包含 |
| 使用谷歌的编程产品，也要有终端 CLI | [Antigravity](https://antigravity.google/docs/cli/reference) | 账号登录和 Gemini API 密钥要分别配置，本文只测了密钥 |
| 在这份测试代码上验证过的无人值守修复 | 明确配置权限的 Claude Code | 除了 `Edit` 还要放行 `Write`（或用 `acceptEdits`），再放行测试命令 |
| 无人值守运行 Antigravity | 加上超时的 `agy` | 检查 API 是否可用及 JSON 状态（依据失败运行和谷歌文档） |
| 让脚本验收修复结果 | 两者都要检查 | 查看 diff，独立跑测试 |

## 测试环境与核心调用命令

测试日期是 2026 年 11 月 19 日，环境为 Linux、`agy 1.5.12`、Claude Code `2.1.322` 和 Python `3.14.7`。每次尝试都从同一个已提交、测试失败的版本复制一份全新工作副本。运行脚本记录命令、进程退出码、实际耗时、输出、Git 状态和 diff，然后独立运行测试。

Antigravity 使用 Gemini API 密钥和隔离的 HOME，设置文件里只有下文的模型服务商配置。Claude Code 用自己的登录态；我传入 `--safe-mode --setting-sources project`，排除个人用户设置和 hooks 的影响；测试仓库里没有项目级设置。使用 `--model sonnet` 的运行，在 JSON 的 `modelUsage` 中报告的模型是 `claude-sonnet-5-5`。

下文 Claude Code 的「默认运行」，都指这套配置下不额外指定权限模式或放行规则的运行。

两者使用的模型不同。这次只比较一个小任务上的 CLI 行为，不能据此判断模型能力高低。

### 先准备同一份失败测试

把下面的文件放进一个临时 Git 工作副本，提交测试失败的初始版本。每次尝试都从这个版本开始。

`slug.py`：

```python
def slugify(title: str) -> str:
    """Turn a post title into a URL slug."""
    return title.lower().replace(" ", "-")
```

`test_slug.py`：

```python
import unittest
from slug import slugify

class SlugTest(unittest.TestCase):
    def test_spaces(self):
        self.assertEqual(slugify("Hello World"), "hello-world")

    def test_punctuation_dropped(self):
        self.assertEqual(slugify("Antigravity vs. Claude Code!"), "antigravity-vs-claude-code")

if __name__ == "__main__":
    unittest.main()
```

空格测试能通过，标点测试会失败：函数实际返回 `antigravity-vs.-claude-code!`，预期则是 `antigravity-vs-claude-code`。

### Antigravity CLI 安装与认证

这里测的是 Gemini API 密钥路径，与 Antigravity 的 Google AI 套餐额度分开；订阅额度没有实测。

我用谷歌文档中的安装器 `curl -fsSL https://antigravity.google/cli/install.sh | bash` 安装 CLI。它把版本 1.5.12 放在 `~/.local/bin/agy`，二进制文件为 257 MB，还向 `~/.zshrc`、`~/.bashrc`、`~/.bash_profile` 和 `~/.profile` 追加了 PATH 设置。手动管理 shell 配置的人，装完要检查这些文件。

走 API 密钥这条路径时，按[谷歌认证指南](https://antigravity.google/docs/install)的要求，要把 `modelProvider` 设为 `gemini`，再导出 `GEMINI_API_KEY`；只设置环境变量不会生效。在隔离的 HOME 中，我的 `~/.gemini/antigravity-cli/settings.json` 内容如下：

```json
{"modelProvider":"gemini"}
```

运行 `agy` 前，把密钥放进环境变量：

```bash
export GEMINI_API_KEY="<your Gemini API key>"
```

我把 HOME 指向一个只放这份设置文件的单独目录，这样我自己的 Antigravity 配置影响不到运行。先建好这个目录和设置文件，再运行命令：

```bash
export AGY_HOME="$HOME/agy-home"
mkdir -p "$AGY_HOME/.gemini/antigravity-cli"
echo '{"modelProvider":"gemini"}' > "$AGY_HOME/.gemini/antigravity-cli/settings.json"
HOME="$AGY_HOME" GEMINI_API_KEY="<your Gemini API key>" timeout 480 ~/.local/bin/agy \
  -p 'Fix slugify in slug.py so every test in test_slug.py passes, then run python3 -m unittest and report the result.' \
  --model gemini-3.6-flash-low \
  --output-format json \
  --print-timeout 7m
```

`-p` 表示不进交互界面，只跑一条提示词就退出。`-low` 是 `agy models` 列出的低思考档位。我用 3.6 Flash，是因为这次运行前，直接请求它的 API 返回了 HTTP 200，而 3.8 Flash 返回 503。你要从 `agy models` 里挑一个还有额度的模型。外层 `timeout` 要比 `--print-timeout` 长：我的运行里，输出超时以退出码 3 结束，外层 `timeout` 杀掉进程则是 124。这次运行返回 Gemini API 503 错误，触发输出超时后结束，没有修复文件。

### Claude Code 使用自己的登录态

Claude Code 已经登录后，先不额外指定权限，运行：

```bash
timeout 600 claude --safe-mode --setting-sources project \
  --model sonnet --output-format json \
  -p 'Fix slugify in slug.py so every test in test_slug.py passes, then run python3 -m unittest and report the result.'
```

无论哪个代理，结束后都自己运行 `python3 -m unittest`，再检查 `git status --short` 和 `git diff`。成功修复应该只改 `slug.py`，不动 `test_slug.py`，两项测试都通过。部分运行还留下了未跟踪的 `__pycache__/` 目录。

## 无人值守时，默认权限能不能完成修复

### Claude Code：退出码为 0，写文件仍可能被拒绝

[Anthropic 权限文档](https://code.claude.com/docs/en/permission-modes)写明，从 `v2.1.302` 起，`claude -p` 不显式指定权限模式时会进入 Manual 模式。需要审批的工具调用会被拒绝，除非另有机制放行。

我的默认运行尝试用 `Write` 写入 `slug.py`，再用 `Bash` 跑测试，两次调用都被拒绝。它在回答里给出了修复方案，文件却没改，退出码为 0，JSON 还报告 `is_error: false`。独立运行测试后，原来的失败仍在。

下表使用相同的修复提示词，编号只用来区分各次尝试。表里每次运行的退出码都是 0，包括没修好的那三次。

| 权限配置 | 运行编号 | 进程结束后的结果 | 退出码 |
|---|---|---|---|
| 不指定权限模式，也不写放行规则 | `cc-e2-default` | Write 和 Bash 被拒绝，没有修复 | 0 |
| `--allowedTools Edit "Bash(python3 -m unittest:*)"` | `cc-e3-allow`, `cc-e3-allow-r2` | 请求 Write 被拒绝；未改源码，测试仍失败 | 0 |
| `--allowedTools "Edit(./**)" "Bash(python3 -m unittest:*)"` | `cc-e3c-editpath` | 修复成功，2/2 通过；JSON 未标明写入工具 | 0 |
| `--permission-mode acceptEdits --allowedTools "Bash(python3 -m unittest:*)"` | `cc-e3b-acceptedits` | 修复成功，2/2 通过 | 0 |
| `--permission-mode dontAsk --allowedTools "Read,Edit,Write,Bash(python3 -m unittest:*)"` | `cc-e3d-dontask` | 修复成功，2/2 通过 | 0 |
| `--dangerously-skip-permissions` | `cc-e4-skip` | 修复成功，2/2 通过 | 0 |

`cc-e3-allow` 和 `cc-e3-allow-r2` 两次运行中，模型都选了 `Write`，单独写一个 `Edit` 并没有授权这次调用。获准的测试命令跑在未修改的源码上。限定路径的 `Edit(./**)` 配置没有遇到权限拒绝，并完成了修复，但结果 JSON 没有说明具体是哪个工具改的文件。这几次运行证明不了起作用的是路径写法，还是模型换了工具。实际使用时，像下面的 `dontAsk` 命令那样显式放行 `Write`，或者用 `acceptEdits`。

放进 CI 时，我会用这次测过的 `dontAsk` 配置，明确列出任务需要的工具。文档中的 [`dontAsk` 模式](https://code.claude.com/docs/en/permission-modes)会拒绝其余原本需要弹出审批的调用，会话不会等人输入：

```bash
timeout 600 claude --safe-mode --setting-sources project \
  --model sonnet --output-format json \
  --permission-mode dontAsk \
  --allowedTools 'Read,Edit,Write,Bash(python3 -m unittest:*)' \
  -p 'Fix slugify in slug.py so every test in test_slug.py passes, then run python3 -m unittest and report the result.'
```

`acceptEdits` 配上单独放行的测试命令也成功了。`--dangerously-skip-permissions` 我只会留给隔离容器使用。[Claude Code 无人值守运行指南](/zh/blog/run-claude-code-unattended/)里有外围进程的配置方法。

只读诊断也出现过退出码 0、测试调用被拒绝的情况。提示词是 `List the files in this directory and tell me which unit test fails and why. Do not change any files.`，运行编号为 `cc-e1-readonly`。它没有改文件，有一次尝试用 Bash 跑测试的调用被拒绝，靠读取文件诊断出了标点处理的问题。

### Antigravity：API 失败，权限行为未能实测

修复尝试 `ag-e2-default-b2` 使用 `gemini-3.6-flash-low`，结果是 `status: "ERROR"`，附带 API 503 消息，最后报告 `finished_reason: "print_timeout"`。进程耗时 420.9 秒，退出码为 3，Git diff 为空，标点测试仍然失败。

诊断任务也遇到了 503 错误或输出超时。因此，默认模式、放行规则、计划模式和跳过权限检查，我都没有测出有效的权限行为。API 失败后文件没变，不能据此认定是权限规则拦住了写入。

[谷歌 CLI 参考文档](https://antigravity.google/docs/cli/reference)说，从 `v1.5.7` 起，支持的环境中 `agentMode` 的默认值为 `"auto"`，否则使用标准默认模式。auto 模式要求启用终端沙箱，默认会自动批准编辑，并在沙箱内运行命令。需要离开沙箱执行的命令会经过自动检查：安全、可逆的操作不用询问，不可逆的操作仍要审批。[沙箱文档](https://antigravity.google/docs/sandbox)说，Linux 使用内核命名空间实现隔离。本文无法判断这次 Linux 环境实际进入了哪种模式，也没有验证沙箱行为。

[无头运行文档](https://antigravity.google/docs/cli/headless)还写明，需要审批却无法获批的操作会被「软拒绝」：运行继续，退出码为 0，stderr 会输出权限提示。我的运行在走到这一步之前，就因 API 错误和超时结束了。

若要查配置入口，[谷歌无头运行指南](https://antigravity.google/docs/cli/headless)列出了 `permissions.allow`，例子包括 `command(git)` 和 `write_file(src/)`；`--dangerously-skip-permissions` 则会批准所有工具请求。这些我都没能实测。

## 脚本要怎么判断失败

我的 Antigravity 尝试使用免费层级的 Gemini API 密钥，很多次返回了表示需求过高的 Gemini API 503 错误。我还用同一把密钥直接通过 `curl` 请求 Gemini API，不经过 `agy`，也复现了 503。

哪怕只要一句简短回复，退出码为 0 也不能证明成功。下面这些模型可用性探测的提示词都只有 `Reply with exactly: ok`：

| Antigravity 探测模型 | 回复文本 | JSON 状态 | 进程退出码 |
|---|---|---|---|
| `gemini-3.6-flash-low` | `ok` | `ERROR`，附 API 503 | 0 |
| `gemini-3.8-flash-low` | `ok` | `ERROR`，附 API 503 | 0 |
| `gemini-4-hydrogen-low` | `ok` | `SUCCESS` | 0 |

其中 JSON 状态为 `SUCCESS` 的 `gemini-4-hydrogen-low` 那次，没有编辑文件，也没跑这份代码的测试，不能算一次成功的编程任务。两行 `ERROR` 里，同一个 JSON 结果同时带着回复 `ok` 和形如 `API error (attempt N)` 的 503 消息，状态仍是 `ERROR`。

`gemini-3.1-pro-low` 和 `gemini-4-carbon-low` 的探测第一次请求就返回了 Free Tier 额度用尽错误，看起来这把密钥在这两个模型上没有可用的免费额度。先前的尝试和探测请求耗尽了 `gemini-3.6-flash-low` 的免费额度后，修复尝试不到一秒就返回 429：这个模型的免费层级每天允许 20 次 `generate_content` 请求。这里数的是 API 请求，不是 CLI 任务。有一次 503 探测的日志记到了 `attempt 5`，说明 CLI 对那次请求至少重试了四次，所以一次失败的运行可能用掉每日额度里的好几次请求。返回 429 的那几次不到一秒就结束了。这些限制属于 Gemini API 密钥的免费层，Antigravity 自己的套餐额度我没有测。

登录和模型选择失败时，表现又不同：

| 配置 | 实际结果 | 实际耗时 | 退出码 |
|---|---|---|---|
| `agy`，未登录 | 打印 Google OAuth URL，等待后报告 `authentication failed or timed out` | 60.2s | 1 |
| `agy`，已选 Gemini 服务商但没有密钥 | 明确提示未设置 `GEMINI_API_KEY` | 0.1s | 1 |
| Claude Code，未登录 | `Not logged in · Please run /login` | 0.7s | 1 |
| Claude Code，指定未知模型 | 模型选择错误，`is_error: true` | 2.0s | 1 |

脚本调用 Antigravity 时，除了进程退出码，还要查 `.status`，并保留 stderr 里的权限提示。Claude Code 则要查 `.is_error` 和 `permission_denials`：默认运行没有 JSON 错误，却有工具调用被拒绝，测试也没修好。用我保存的 JSON 试过：第一条对失败的 `agy` 运行 `ag-e2-default-b2` 退出 1；第二条对 Claude Code 默认运行退出 1，对 `dontAsk` 那次退出 0。

```bash
jq -e '.status == "SUCCESS"' agy-result.json
jq -e '.is_error == false and (.permission_denials | length) == 0' claude-result.json
```

两者都要检查 diff，并独立跑测试，再决定是否接受改动。

任务还要有时间上限。我同时用了 Antigravity 的 `--print-timeout` 和外层 `timeout`，多次尝试在输出达到时间上限后留下部分输出，以退出码 3 结束。这个超时参数见[谷歌无头运行指南](https://antigravity.google/docs/cli/headless)。这些是失败耗时，不能用来比较编程速度。

## 模型与套餐：订阅额度和 API 密钥要分开看

我在 2026 年 11 月 19 日核对了官方套餐页。下面列出 Claude 的订阅价格，以及 Antigravity 文档里的额度和模型范围；Antigravity 套餐的美元价格没有核实。

### 哪些 Claude 套餐包含 Claude Code

| Claude 套餐 | 价格与 Claude Code 使用权限 |
|---|---|
| [Free](https://claude.com/pricing) | 不包含 Claude Code |
| [Pro](https://claude.com/pricing) | 月付每月 $20；年付折合每月 $17；包含 Claude Code |
| [Max](https://claude.com/pricing) | 每月 $100；包含 Claude Code |
| [Ultra](https://claude.com/pricing) | 每月 $200；包含 Claude Code |

这里列的是订阅价格，没有测这份测试任务实际花了多少钱。

### Antigravity 套餐与可用模型

[谷歌套餐页](https://antigravity.google/docs/plans)说，所有套餐都有基础额度，包括 Gemini 3.8 Flash 和 CLI 使用权限。Antigravity 免费套餐的额度每周刷新。Google AI Pro 和 Ultra 提高限额，每五小时刷新额度，同时仍受每周限额约束；这两档用户还可以购买 AI credits 支付超额用量。

同一页也写明，不支持用 BYOK（自带密钥）或自定义端点增加 Antigravity 的限额。本次使用的 [Gemini API 服务商设置](https://antigravity.google/docs/cli/reference)直接向 Gemini API 发请求，不能证明它能增加 Google AI 订阅的额度。可用方式以[谷歌套餐说明](https://antigravity.google/docs/plans)为准。

[谷歌模型表](https://antigravity.google/docs/models)列出的 Claude Sonnet 5.5 (thinking) 和 Claude Opus 5.5 (thinking)，适用于非试用的 Google AI Pro 订阅、Ultra 和 Enterprise。

这张表还保留着一条移除说明：我在 2026 年 11 月 19 日查看时，Claude Sonnet 4.6、Claude Opus 4.6 和 GPT-OSS-120b 仍在表里，旁边写着「将在 2026 年 11 月 18 日移除」。我没有验证移除是否已经发生。

在我的 Gemini API 密钥配置下，`agy models` 只列出了 Gemini 模型。因此，Antigravity 产品套餐表里有某个模型，不代表本文测试的 API 密钥路径也能调用它。

## 补充参照：同一测试上的 Codex

同一份 Python 测试代码，我还用 ChatGPT 登录运行了 Codex CLI `0.167.0`，模型是 `gpt-6.2-sol`。在这次测试环境里，不覆盖沙箱设置的运行报告了只读沙箱和审批策略 `never`，它和 Claude Code 默认运行一样没有改源码，但原因不同：Codex 写不了，Claude Code 是尝试写入后被拒。按谷歌文档，Antigravity 的 auto 模式会自动批准工作区编辑。

下面的命令使用该环境的默认模型，没有传入模型参数：

```bash
timeout 400 codex exec --skip-git-repo-check \
  'Fix slugify in slug.py so every test in test_slug.py passes, then run python3 -m unittest and report the result.'
```

允许写入工作区后，源码修好了：

```bash
timeout 400 codex exec -s workspace-write \
  'Fix slugify in slug.py so every test in test_slug.py passes, then run python3 -m unittest and report the result.'
```

| Codex 配置 | 运行编号 | 进程结束后的结果 | 实际耗时 / 退出码 |
|---|---|---|---|
| 在这个环境里不覆盖沙箱设置 | `cx-e2-default` | 没有改动，仍有一项测试失败 | 18.9s / 0 |
| `-s workspace-write` | `cx-e4-workspace-write` | 修复成功，两项测试通过 | 16.1s / 0 |

[OpenCode vs Codex](/zh/blog/opencode-vs-codex/)是另一组 CLI 对比；[Codex yolo mode](/zh/blog/codex-yolo-mode/)介绍了更宽的权限设置。

## Orbi 接手哪部分工作

上面的命令是在一个工作副本里运行代理。把它放进交付流程后，评审和合并仍要自己安排。

Orbi 从带有 `ai-ready` 标签的 GitHub Issue 开始，用 Pi 实现，再由独立会话评审，评审通过且 CI 全绿后合并。

在 Claude Code 里，[Orbi 插件](https://github.com/orbi-build/orbi/blob/main/integrations/claude-plugin/README.md)提供 `/orbi:ship`，把当前任务写成 Issue。在由 Orbi 交付的仓库里，它会在确认后创建带 `ai-ready` 标签的 Issue。`/orbi:status` 用来查交付状态。

这份 README 的支持列表没有 Antigravity。我没有测试 Antigravity 集成，也不能声称 Orbi skills 能在那里使用。[Orbi 对比 Claude Code](/zh/compare/claude-code/)介绍了从 Issue 到 PR 的交接方式；想让代理实时陪你写代码时，Orbi 并不适合。

## 相关

- [Cline vs Claude Code：用同一模型测试无人值守运行](/zh/blog/cline-vs-claude-code/)
- [Cursor vs Claude Code：工作方式、套餐与用量](/zh/blog/cursor-vs-claude-code/)
- [Claude Code 无人值守运行指南](/zh/blog/run-claude-code-unattended/)
- [Orbi 对比 Claude Code](/zh/compare/claude-code/)
- [Orbi Cloud](/zh/cloud/?ref=blog-ag-vs-cc)
