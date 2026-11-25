---
title: CLAUDE.md 和 AGENTS.md：各家 agent 到底读哪个
date: 2026-11-25
summary: 11 个仓库实测：两个文件都在时，Claude Code 2.1.331 只读 CLAUDE.md，Codex 0.167.0 和 Pi 1.6.0 只读 AGENTS.md。附三家通用写法和几个坑。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-claude-md-vs-agents-md-card.png
mirror: claude-md-vs-agents-md
---

`AGENTS.md` 是不绑定具体工具的开放指令文件（[agents.md](https://agents.md/) 称已有超过 6 万个开源项目在用），`CLAUDE.md` 是 Claude Code 自己的指令文件。从 2.1.277 起，Claude Code 只在没有 `CLAUDE.md` 时才读 `AGENTS.md`，而 Codex 和 Pi 默认读 `AGENTS.md`，会忽略 `CLAUDE.md` 或把它排在后面。同一个仓库混用 Claude Code、Codex、Pi、Cursor、Copilot 或 OpenCode 时，这些差异很容易让不同 agent 读到不同的规则。这篇是写给这类仓库的维护者的：有九种文件布局的实测加载表、一套三家 CLI 通用的写法，还有 `CLAUDE.local.md` 陷阱和 Codex 的 32 KiB 截断。

我是 Larry 🍀 Orbi，Orbi 的创始人。Orbi 用开源编程 agent 命令行工具 Pi，把 GitHub Issue 做成合并进仓库的改动，交付和评审会话都会读目标仓库的 `AGENTS.md`，各家在读取规则上的分叉我一直很关心。

## 两个文件都在时，三家各读哪个

2026 年 11 月 25 日，我在自己的 Linux 机器上实测了 Claude Code 2.1.331、Pi 1.6.0（`@earendil-works/pi-coding-agent`）和 Codex CLI 0.167.0（`@openai/codex`）。下表是三个工具在九种文件布局下用探测 prompt 测出的加载结果，另附两条用 `-c` 参数测 Codex 回退配置的结果（参数见下文“容易踩的坑”一节）。探测 prompt（P2）和普通 prompt（P1）的定义见下一节；除非特别注明，P1 的结果和 P2 一样。

| 仓库里的文件 | Claude Code 2.1.331 | Pi 1.6.0 | Codex 0.167.0 |
|---|---|---|---|
| 无指令文件 | 无 | 无 | 无 |
| 只有 `AGENTS.md` | `AGENTS.md` | `AGENTS.md` | `AGENTS.md` |
| 只有 `CLAUDE.md` | `CLAUDE.md` | `CLAUDE.md` | 无（P2 回复 `NONE`） |
| 两个都在，内容不同 | 只读 `CLAUDE.md` | 只读 `AGENTS.md` | 只读 `AGENTS.md` |
| `CLAUDE.md` 软链接到 `AGENTS.md` | `AGENTS.md` 内容（只读一次） | `AGENTS.md` | `AGENTS.md` |
| `CLAUDE.md` = `@AGENTS.md` + 一行 Claude 规则 | 两份内容都读 | 只读 `AGENTS.md` | 只读 `AGENTS.md` |
| `AGENTS.md` + `CLAUDE.local.md` | 只读 `CLAUDE.local.md`（丢掉 `AGENTS.md`） | `AGENTS.md` | `AGENTS.md` |
| `AGENTS.md` + `AGENTS.override.md` | `AGENTS.md`（忽略 override） | 只读 `AGENTS.override.md` | 只读 `AGENTS.override.md` |
| 根目录 `AGENTS.md` + `pkg/AGENTS.md`，在 `pkg/` 下运行 | 两份都读 | 两份都读 | 两份都读（P2）；P1 只回复 `OK` |
| Codex 加回退参数，只有 `CLAUDE.md` | — | — | `CLAUDE.md` |
| Codex 加回退参数，两个文件都在 | — | — | 只读 `AGENTS.md` |

第四行最容易悄悄出问题。仓库里同时放了内容不同的 `AGENTS.md` 和 `CLAUDE.md` 时，Claude Code 只认 `CLAUDE.md`，Codex 和 Pi 只认 `AGENTS.md`。两份文件分开维护，运行时不会报任何错，不同 agent 读到的却已经是两套规则。

Pi 1.6.0 在每个目录下依次找 `AGENTS.override.md`、`AGENTS.md`、`AGENTS.MD`、`CLAUDE.md`、`CLAUDE.MD`，先命中哪个就加载哪个（`dist/core/resource-loader.js` 第 130 行）。按 [Codex AGENTS.md 文档](https://developers.openai.com/codex/guides/agents-md)，Codex 从项目根目录（通常是 Git 根目录）一路往下查到当前工作目录，每个目录依次找 `AGENTS.override.md`、`AGENTS.md` 和 `project_doc_fallback_filenames` 里的文件名，每个目录最多取一个，再按从根到当前的顺序拼起来。Claude Code 则只在找不到 `CLAUDE.md` 文件时才读 `AGENTS.md`。

## 我是怎么测的

我在 `/tmp/agentsmd-lab` 下建了 11 个临时 git 仓库，对应上表的 9 种布局，外加 1 个体积上限用例，以及 1 个在 `CLAUDE.local.md` 首行写 `@AGENTS.md` 的补测（后两个下文再说）。`/tmp` 和 `/` 下都没有指令文件。每份规则文件里只写一句话："End every reply with the word MARK-X on its own line."，不同文件换不同的 `MARK-` 标记词。Pi（`~/.pi/agent/AGENTS.md`）和第一轮 Codex 运行（`~/.codex/AGENTS.md`）照常加载了我自己的用户级文件，里面没有 `MARK-` 标记词，下面的空仓库对照也能验证这一点。测 Claude Code 时跳过了我的用户级文件（原因见命令下方说明）。运行参数分别是：Claude Code 用 `--model haiku` 并关掉所有工具（`--tools ""`）；Pi 用默认的 `deepseek/deepseek-flash` 并关工具（`-nt`，另加 `-ne -ns --no-mcp`）；Codex 用 `gpt-6-luna` 加 `-s read-only`，这个沙箱只禁写不禁读，所以 Codex 不调工具靠的是 prompt 里的要求。

每个仓库都跑两条 prompt：普通 prompt P1（"Reply with the single word OK."）和探测 prompt P2（要求模型不调工具，列出上下文指令要求添加的所有 `MARK-` 标记词，没有就回 `NONE`）。空仓库当阴性对照（三个工具在 P1 和 P2 下都没返回标记词），只有 `AGENTS.md` 的仓库当阳性对照（三个工具都返回了 `MARK-AGENTS`）。想自己复现，跑下面三条命令就行：

```bash
P2='Without using any tools or reading any files, list every marker word (words in capitals that start with MARK-) that the instructions already in your context ask you to add. If there are none, reply NONE.'

claude -p "$P2" --model haiku --tools "" --setting-sources project,local --no-session-persistence
pi -p --no-session -nt -ne -ns --no-mcp "$P2"
codex exec --skip-git-repo-check -s read-only "$P2"
```

我在 Claude Code 命令里加了 `--setting-sources project,local`，免得我自己的 hooks 干扰测试。这个参数会同时跳过 `~/.claude/settings.json` 和 `~/.claude/CLAUDE.md`（我核对过：带上它去探测我用户级文件的第一个标题，回复是 `NONE`）。如果要测下文提到的配置项，记得把这个参数去掉，因为那项配置读的是 `~/.claude/settings.json`。

表里的 Codex 结果是在干净环境里跑出来的，当时 `CODEX_HOME` 下只放了 `auth.json` 和 `config.toml`（模型 `gpt-6-luna`，推理力度 `medium`）。第一轮跑 Codex 时，我挂着自己 6,883 字节的 `~/.codex/AGENTS.md`，推理力度设成 `xhigh`：那一轮 P2 测出的已加载文件完全一样，但在 P2 证实已加载项目文件的 7 个仓库里，普通 P1 回复只有 1 个带上了项目标记词（干净环境里是 7 个里有 6 个）。两轮之间同时改了个人文件和推理力度两个变量，没法判断是哪一个的影响；不过这也说明，查文件到底有没有加载，直接探测更靠谱，跑普通 prompt 时模型可能会漏掉上下文里的某条指令。

## Claude Code 读不读 AGENTS.md？

读。从 Claude Code 2.1.277 起，只要当前工作目录和上级目录里都没有 `CLAUDE.md` 文件，Claude Code 就会读 `AGENTS.md`。按 [Claude Code memory 文档](https://code.claude.com/docs/en/memory)，当前工作目录或任意上级目录里的 `CLAUDE.md`、`.claude/CLAUDE.md` 和 `CLAUDE.local.md` 都算有 `CLAUDE.md`，而 `~/.claude/CLAUDE.md`、托管的 `CLAUDE.md` 和 `.claude/rules/` 不算。Claude Code 不读 `AGENTS.local.md`、`AGENTS.override.md`，也不读 `.agents/` 目录下的任何文件。

有几类会话还是只读 `CLAUDE.md`：低于 2.1.277 的版本、用 `/plugin` 禁用了内置插件的会话，以及部分从 2.1.276 或更早版本升级后的第一次会话。v2.1.281 之前，部分跑在 Amazon Bedrock 上或关了遥测的会话也只读 `CLAUDE.md`。碰到这些情况，要在 `CLAUDE.md` 里导入 `AGENTS.md`。

如果不想写导入、想让它直接同时读两个文件，Claude Code 文档提到 `/config` 里有 "Project instructions" 选项，四个值分别是 `claude-md-or-agents-md`（默认）、`claude-md-and-agents-md`、`claude-md` 和 `managed-only`。下面这段配置摘自文档（未实测）：

```json
{
  "pluginConfigs": {
    "cc-plugin-agents-md@builtin": {
      "options": {
        "instructionFiles": "claude-md-and-agents-md"
      }
    }
  }
}
```

v2.1.285 之前的插件 ID 是 `agents-md@builtin`。Claude Code 只从 `~/.claude/settings.json`、`--settings` 指定的文件或托管设置里读这一项，写在项目级或本地设置里会被忽略。

## 一套写法，同时照顾 Claude Code、Codex 和 Pi

把 `AGENTS.md` 当作共享项目规则的唯一源文件。

如果 Claude Code 需要几条只给它自己看的规则，建一个 `CLAUDE.md`，第一行写 `@AGENTS.md`：

```markdown
@AGENTS.md

End every reply with the word MARK-CLAUDE on its own line.
```

这个写法我实测过：Claude Code 两份内容都读到了，Pi 和 Codex 只读了 `AGENTS.md`，Claude 专属的那几行不会串到另两个工具里。按 Claude Code 文档，`@AGENTS.md` 也不会让 Claude Code 把 `AGENTS.md` 读两遍。

如果没有 Claude 专属规则，且用的是 Claude Code 2.1.277 及以上，直接不建 `CLAUDE.md` 就行（`orbi-build/orbi` 仓库里就只有 `AGENTS.md`，没有 `CLAUDE.md`）。如果要兼容只读 `CLAUDE.md` 的会话，也可以把 `CLAUDE.md` 软链接到 `AGENTS.md`：

```bash
ln -s AGENTS.md CLAUDE.md
```

三个工具都能通过软链接读到 `AGENTS.md` 的内容，Claude Code 文档也确认软链接只会读一次。但如果仓库有 Windows 开发者 clone，还是改用上面的 `@AGENTS.md` 导入：同一份文档提到，除非开了 `core.symlinks`，否则 Git 会把提交进仓库的软链接检出成普通文本文件，留下一份只有一行的 `CLAUDE.md`，反而挡住 Claude Code 自动读 `AGENTS.md`。

别建一份只在正文里写着“去读 `AGENTS.md`”的 `CLAUDE.md`。按 Claude Code 文档，这样写的话，Claude 只有在自己决定打开文件时才能看到 `AGENTS.md`，而 `CLAUDE.md` 一存在，就把 `AGENTS.md` 的自动加载关掉了。

## 容易踩的坑

在 `AGENTS.md` 旁边放一份私人的 `CLAUDE.local.md`，会让 Claude Code 漏掉 `AGENTS.md`。实测里，Claude Code 只读了 `CLAUDE.local.md`，Pi 和 Codex 照常读 `AGENTS.md`。因为 `CLAUDE.local.md` 也算 `CLAUDE.md`，一份不入库的本地笔记就能让你本机 Claude 会话里的团队 `AGENTS.md` 悄悄失效。解决办法有两个：在 `CLAUDE.local.md` 第一行加上 `@AGENTS.md`（我补测过，加上后 Claude Code 会同时读两份文件），或者在 `~/.claude/settings.json` 里配成 `claude-md-and-agents-md`（来自文档，未实测）。

放一份 `AGENTS.override.md` 会让 Pi、Codex 和 Claude Code 读到不同的文件。实测里，Pi 和 Codex 只加载了 `AGENTS.override.md`，Claude Code 直接忽略它，继续读 `AGENTS.md`。按 Pi 的 `docs/configuration.md`，`AGENTS.override.md` 只替换同一目录下的 `AGENTS.md` 或 `CLAUDE.md`，不会屏蔽 `~/.pi/agent` 或其他目录的文件；Codex 文档也是同样的按目录优先规则，还支持在 `~/.codex` 或 `CODEX_HOME` 下放 `AGENTS.override.md`。

仓库里只有 `CLAUDE.md` 时，Codex 默认不读（P2 回复 `NONE`）。想让 Codex 回退去读 `CLAUDE.md`，可以在 `~/.codex/config.toml` 里配 `project_doc_fallback_filenames`（Codex 文档举的例子是 `TEAM_GUIDE.md` 和 `.agents.md`）：

```toml
project_doc_fallback_filenames = ["CLAUDE.md"]
```

我用 Codex 的 `-c` 参数实测了这项配置：

```bash
codex exec -c 'project_doc_fallback_filenames=["CLAUDE.md"]' --skip-git-repo-check -s read-only "$P2"
```

只有 `CLAUDE.md` 的仓库里，Codex 读到了 `CLAUDE.md`；两个文件都在时，它还是只读 `AGENTS.md`。

## AGENTS.md 能写多长？

[Claude Code memory 文档](https://code.claude.com/docs/en/memory)建议单个 `CLAUDE.md` 控制在 200 行以内，不过按同一份文档，文件超过 4 MiB 时 Claude Code 才会跳过（这条没有实测）。Codex 则是合并后的指令文件总大小一到 `project_doc_max_bytes` 就停止追加，按 Codex 文档，默认上限是 32 KiB（32,768 字节）。

Orbi 自己的 `AGENTS.md` 就没守住 200 行。Orbi 的交付 prompt 会让 Pi 读目标仓库的 `AGENTS.md` 并满足里面的测试要求，评审 prompt 同样会读 `AGENTS.md`；这两类会话都开着上下文文件加载（`no_context_files = False`），只有 draft 和 suggest 辅助会话把它关掉。PR #237（针对 Issue #232，2026 年 9 月 2 日合并）之前，`orbi-build/orbi` 的 `AGENTS.md` 有 630 行。PR #237 把它砍到 129 行，压回了 200 行以内。但我没守住：2026 年 9 月 10 日涨回 154 行，2026 年 9 月 20 日涨到 248 行，2026 年 10 月 1 日到 435 行，2026 年 11 月 1 日到 439 行，到 2026 年 11 月 21 日最后一次改动时，已经是 444 行（39,565 字节）。

我拿这份 39,565 字节的文件测了下 Codex 的 32 KiB 截断：在 Orbi 的 `AGENTS.md` 开头加了一条 `MARK-HEAD` 规则，末尾加了一条 `MARK-TAIL` 规则（共 448 行，39,681 字节），然后用三个工具跑 P2。Claude Code 和 Pi 都返回了 `MARK-HEAD` 和 `MARK-TAIL`。默认配置的 Codex 跑了两次，两次都只回 `MARK-HEAD`，末尾那条规则根本没传给 Codex。把上限调大就好了：

```bash
codex exec -c project_doc_max_bytes=65536 --skip-git-repo-check -s read-only "$P2"
```

加上 `project_doc_max_bytes=65536` 后，Codex 两个标记词都回出来了。所以必须遵守的硬规则得放文件开头，合并后的指令总大小尽量压在 32 KiB 以内（或者调高 `project_doc_max_bytes`），不常用的操作说明挪去 skills 或子目录文件。

## AGENTS.md 怎么写

- 把 `AGENTS.md` 当作共享规则的唯一源文件，免得 Claude Code、Codex 和 Pi 读到不同版本。
- 要兼容 `CLAUDE.md` 时用 `@AGENTS.md` 导入或建软链接。`CLAUDE.md` 里写一句普通文字的“请读 `AGENTS.md`”不会触发导入，反而会关掉自动加载。
- 必须遵守的硬规则写在最前面：Codex 从末尾截断，靠前的规则才能留下来。
- 合并后的指令体积压在 Codex 默认的 32 KiB 以内（或调高 `project_doc_max_bytes`），行数尽量往 Claude Code 建议的 200 行靠。
- 子目录专用规则拆到嵌套的 `AGENTS.md` 里；我的嵌套测试（根目录 `AGENTS.md` 加 `pkg/AGENTS.md`，在 `pkg/` 下运行）里，P2 探测显示三个工具两份都读到了。
- 用类似 P2 的探测 prompt 查一下实际加载了什么，别以为文件放在磁盘上就一定进了上下文。

极简的 `AGENTS.md` 只需写每次改动都必须遵守的规则。下面是一份示例（不来自任何真实仓库）：

```markdown
# AGENTS.md

- Run the project test suite before finishing and report exact failing commands and exit codes.
- Do not edit generated output directories by hand; edit source files and rebuild.
- Keep changes scoped to the assigned issue and avoid unrelated refactors.
- Add a regression test for every bug fix before writing the patch.
- Never commit secrets, tokens or local `.env` files.
- Ask before changing public API contracts or database schemas.
```

## AGENTS.md 和 skills 的分工

只要没有显式关闭（比如 Pi 的 `--no-context-files` 或 `-nc` 参数），当前工作目录和上级目录里的 `AGENTS.md` 每次会话都会自动进上下文。工作目录下面的子目录文件不会：Claude Code 读到该子目录里的文件时才会加载，Codex 和 Pi 则只在你从该目录或更深目录启动会话时才加载。Skills（`SKILL.md`）是按需加载的：按 [Claude Code skills 文档](https://code.claude.com/docs/en/skills)，上下文里只留 skill 描述，完整正文等调用时再加载。Pi 的 `docs/skills.md` 也是这套做法：启动时把每个 skill 的名称、描述和路径写进 system prompt，任务匹配时模型再去读 `SKILL.md`。

每次改动都必须遵守的仓库级硬约束（比如测试门禁和生成文件的边界）写进 `AGENTS.md`；偶尔才用的流程（比如发布检查单或迁移指南）放进 `SKILL.md`，省得每次会话都占上下文，也免得把 `AGENTS.md` 撑过 32 KiB。

## 其他工具

我没测 GitHub Copilot 和 Cursor，2026 年 11 月 25 日也没重测 OpenCode。

| 工具 | 加载的指令文件 | 依据 |
|---|---|---|
| GitHub Copilot | 仓库任意位置的 `AGENTS.md`（最近目录优先）；也可改用仓库根目录下的单个 `CLAUDE.md` 或 `GEMINI.md` | [GitHub Copilot 文档](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)，未实测 |
| Cursor | 项目根目录和子目录下的 `AGENTS.md`（嵌套文件与父目录合并）；规则文档页未提及 `CLAUDE.md` | [Cursor 规则文档](https://cursor.com/docs/context/rules)，未实测 |
| OpenCode 2.2.5 | 加载了项目 `AGENTS.md`；未加载项目 `CLAUDE.md` 或 `~/.claude/CLAUDE.md` | 我在 2026 年 11 月 2 日[《OpenCode vs Claude Code》](/zh/blog/opencode-vs-claude-code/)中的实测，未重测 |

## 相关

想看这些指令文件怎么接入完整的交付流程，可以读[从 GitHub Issue 到 Release](/zh/guides/issue-to-release/?ref=blog-agents-md)。2026 年 11 月 2 日 OpenCode 加载 `AGENTS.md` 的实测见[OpenCode vs Claude Code](/zh/blog/opencode-vs-claude-code/)，Codex CLI 的行为见[OpenCode vs Codex CLI](/zh/blog/opencode-vs-codex/)，Pi 与 Claude Code 的对比见[Pi coding agent 和 Claude Code 对比](/zh/blog/pi-coding-agent-vs-claude-code/)。想了解 Orbi 怎么用 Pi 读你仓库里的 `AGENTS.md`、把 GitHub Issue 做成评审通过并合并的 PR，可以看[Orbi vs Claude Code](/zh/compare/claude-code/?ref=blog-agents-md) 和 [Orbi Cloud](/zh/cloud/?ref=blog-agents-md)。
