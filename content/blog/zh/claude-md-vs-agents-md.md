---
title: CLAUDE.md 和 AGENTS.md：各家 agent 到底读哪个
date: 2026-11-25
summary: 在 11 个仓库里实测 Claude Code 2.1.331、Codex 0.167.0 和 Pi 1.6.0：两个文件同时存在时，Claude Code 只读 CLAUDE.md，另两个只读 AGENTS.md。附三家通用的写法和几个容易踩的坑。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-claude-md-vs-agents-md-card.png
mirror: claude-md-vs-agents-md
---

聊 CLAUDE.md 和 AGENTS.md 区别，先说定位和加载结果：`AGENTS.md` 是不绑定某家工具的开放指令文件（[agents.md](https://agents.md/) 称已有超过 6 万个开源项目在使用），`CLAUDE.md` 是 Claude Code 自己的指令文件；至于 Claude Code 读不读 AGENTS.md，从 2.1.277 起它只在没有 `CLAUDE.md` 时才读 `AGENTS.md`，而 Codex 和 Pi 默认读 `AGENTS.md`，会忽略 `CLAUDE.md` 或把它排在后面。这篇文章写给仓库同时给多个编程 agent 用的开发者，比如在同一个项目里混用 Claude Code、Codex、Pi、Cursor、Copilot 或 OpenCode。读完你能拿到九种文件布局的实测加载表、一套三家 CLI 通用的配置写法，以及 `CLAUDE.local.md` 陷阱和 Codex 的 32 KiB 截断上限。

我是 Larry 🍀 Orbi，Orbi 的创始人。Orbi 运行开源编程 agent 命令行工具 Pi，把 GitHub Issue 交付成合并进仓库的改动，交付和评审会话都会读目标仓库的 `AGENTS.md`，这也是我在意这套规则分叉的原因。

## CLAUDE.md 和 AGENTS.md 区别：各家到底读哪个

2026 年 11 月 25 日，我在自己的 Linux 机器上实测了 Claude Code 2.1.331、Pi 1.6.0（`@earendil-works/pi-coding-agent`）和 Codex CLI 0.167.0（`@openai/codex`）。下表记录了每个工具在九种文件布局下对上下文直接探测（P2）的加载结果，另附两条用 `-c` 参数测 Codex 回退配置的结果（参数见下文“容易踩的坑”一节）；除非单独注明，普通 prompt（P1）的结果与 P2 一致。

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

第四行是最容易悄悄出问题的场景。仓库里同时放了内容不同的 `AGENTS.md` 和 `CLAUDE.md` 时，Claude Code 只按 `CLAUDE.md` 办事，Codex 和 Pi 只按 `AGENTS.md` 办事。分开维护两份文件，就会在没有任何报错的情况下给不同 agent 喂进不同规则。

各家 CLI 的查找顺序解释了表里每一列的结果。Pi 1.6.0 在每个目录下依次查找 `AGENTS.override.md`、`AGENTS.md`、`AGENTS.MD`、`CLAUDE.md`、`CLAUDE.MD`，加载第一个命中的文件（`dist/core/resource-loader.js` 第 130 行）。按 [Codex AGENTS.md 文档](https://developers.openai.com/codex/guides/agents-md)，Codex 从项目根目录（通常是 Git 根目录）一路向下查到当前工作目录，每个目录依次找 `AGENTS.override.md`、`AGENTS.md` 和 `project_doc_fallback_filenames` 里的文件名，每个目录最多取一个，按从根目录向下的顺序拼起来。Claude Code 则只在没有 `CLAUDE.md` 文件时才用 `AGENTS.md`。

## 我是怎么测的

我在 `/tmp/agentsmd-lab` 下建了 11 个临时 git 仓库，涵盖上表的 9 种布局、1 个体积上限用例和 1 个 `CLAUDE.local.md` 补测（后两个下文会展开）。`/tmp` 和 `/` 下都没有指令文件。每份规则文件里只写了一句话："End every reply with the word MARK-X on its own line."，不同文件用不同的 `MARK-` 标记词。我自己的用户级文件对 Pi（`~/.pi/agent/AGENTS.md`）以及第一轮 Codex 运行（`~/.codex/AGENTS.md`）照常加载，里面都没有 `MARK-` 标记词，下面的空仓库对照也能证实这一点。Claude Code 测试跳过了我的用户级文件（原因见命令下方的说明）。Claude Code 跑 `--model haiku` 并关闭所有工具（`--tools ""`）；Pi 跑默认的 `deepseek/deepseek-flash` 并关闭工具（`-nt`，另加 `-ne -ns --no-mcp`）；Codex 跑 `gpt-6-luna` 加 `-s read-only`，该沙箱只禁写不禁读，所以对 Codex 来说，不调工具依赖 prompt 里的要求。

每个仓库都跑两条 prompt：普通 prompt P1（"Reply with the single word OK."）和探测 prompt P2（要求模型在不调用工具的前提下，列出上下文里已有指令要求添加的所有 `MARK-` 标记词，没有就回复 `NONE`）。空仓库作阴性对照（三个工具在 P1 和 P2 下都没有返回标记词），只有 `AGENTS.md` 的仓库作阳性对照（三个工具都返回了 `MARK-AGENTS`）。想自己复现这次探测，可以跑下面三条命令：

```bash
P2='Without using any tools or reading any files, list every marker word (words in capitals that start with MARK-) that the instructions already in your context ask you to add. If there are none, reply NONE.'

claude -p "$P2" --model haiku --tools "" --setting-sources project,local --no-session-persistence
pi -p --no-session -nt -ne -ns --no-mcp "$P2"
codex exec --skip-git-repo-check -s read-only "$P2"
```

我在 Claude Code 命令里加了 `--setting-sources project,local`，好让我自己的 hooks 不干扰测试。这个参数会同时跳过 `~/.claude/settings.json` 和 `~/.claude/CLAUDE.md`（我核对过，带上它之后，探测我用户级文件第一个标题的 prompt 回复了 `NONE`）。如果要验证下文提到的配置项，记得去掉这个参数，因为那项配置是从 `~/.claude/settings.json` 读取的。

表里的 Codex 结果来自一轮干净环境的运行，当时 `CODEX_HOME` 下只放了 `auth.json` 和 `config.toml`（模型 `gpt-6-luna`，推理力度 `medium`）。第一轮跑 Codex 时，我挂着自己 6,883 字节的 `~/.codex/AGENTS.md`，推理力度是 `xhigh`：那轮 P2 测出的已加载文件完全相同，但在 P2 证明已加载项目文件的 7 个仓库里，普通 P1 回复只有 1 个带上了项目标记词（干净运行里是 7 个里有 6 个）。两轮之间同时变了个人文件和推理力度两个变量，没法归因到其中哪一个；不过这足以说明，想验证文件到底有没有加载，直接探测更可靠，因为模型在面对普通 prompt 时可能会忽略上下文里的某条指令。

## Claude Code 读不读 AGENTS.md？

读。从 Claude Code 2.1.277 起，只要当前工作目录和上级目录都没有 `CLAUDE.md` 文件，Claude Code 就会读 `AGENTS.md`。按 [Claude Code memory 文档](https://code.claude.com/docs/en/memory)，当前工作目录或任意上级目录里的 `CLAUDE.md`、`.claude/CLAUDE.md` 和 `CLAUDE.local.md` 都算作存在 `CLAUDE.md`，而 `~/.claude/CLAUDE.md`、托管的 `CLAUDE.md` 和 `.claude/rules/` 不算。Claude Code 不读 `AGENTS.local.md`、`AGENTS.override.md`，也不读 `.agents/` 目录下的任何文件。

部分会话仍然只读 `CLAUDE.md`：低于 2.1.277 的版本、用 `/plugin` 禁用了内置插件的会话，以及部分从 2.1.276 或更早版本升级后的第一次会话。v2.1.281 之前，部分跑在 Amazon Bedrock 上或关闭了遥测的会话也只读 `CLAUDE.md`。遇到这些会话，要在 `CLAUDE.md` 里导入 `AGENTS.md`。

如果不想写导入、希望直接同时读取两个文件，Claude Code 文档在 `/config` 里提供了 "Project instructions" 选项，四个值分别是 `claude-md-or-agents-md`（默认）、`claude-md-and-agents-md`、`claude-md` 和 `managed-only`。以下配置摘自文档（未实测）：

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

我实测过这个写法：Claude Code 两份内容都读到了，Pi 和 Codex 只读了 `AGENTS.md`，Claude 专属的那几行不会流到另两个工具里。按 Claude Code 文档，`@AGENTS.md` 不会导致 Claude Code 把 `AGENTS.md` 读两遍。

如果没有 Claude 专属规则，用 Claude Code 2.1.277 及以上时可以直接不放 `CLAUDE.md`（`orbi-build/orbi` 仓库本身就只有 `AGENTS.md`，没有 `CLAUDE.md`）；也可以建一个从 `CLAUDE.md` 指向 `AGENTS.md` 的软链接，让只读 `CLAUDE.md` 的会话一样能拿到规则：

```bash
ln -s AGENTS.md CLAUDE.md
```

三个工具都通过软链接加载了 `AGENTS.md` 的内容，Claude Code 文档也确认软链接只会被读取一次。如果仓库有 Windows 开发者 clone，改用上面的 `@AGENTS.md` 导入：同一份文档指出，除非开启了 `core.symlinks`，否则 Git 会把提交进仓库的软链接检出成普通文本文件，最后留下一份只有一行的 `CLAUDE.md`，反而挡住了 Claude Code 自动读取 `AGENTS.md`。

不要写一份只在正文里口头写着“去读 `AGENTS.md`”的 `CLAUDE.md`。按 Claude Code 文档，那种写法下 Claude 只有在自己决定打开文件时才看得到 `AGENTS.md`，而 `CLAUDE.md` 的存在已经关掉了 `AGENTS.md` 的自动加载。

## 容易踩的坑

在 `AGENTS.md` 旁边加一份私人的 `CLAUDE.local.md`，会让 Claude Code 丢掉 `AGENTS.md`。实测里，Claude Code 只加载了 `CLAUDE.local.md`，Pi 和 Codex 仍读 `AGENTS.md`。因为 `CLAUDE.local.md` 也算作 `CLAUDE.md`，一份没入库的本地笔记就会悄悄关掉你本机 Claude 会话里的团队 `AGENTS.md`。解决办法是在 `CLAUDE.local.md` 第一行写 `@AGENTS.md`（我补测过，加上后 Claude Code 同时加载了两份文件），或者在 `~/.claude/settings.json` 里配成 `claude-md-and-agents-md`（来自文档，未实测）。

加一份 `AGENTS.override.md` 会把 Pi、Codex 和 Claude Code 拆成两边。实测中，Pi 和 Codex 只加载了 `AGENTS.override.md`，Claude Code 忽略了它、继续读 `AGENTS.md`。按 Pi 的 `docs/configuration.md`，`AGENTS.override.md` 只替换同一目录下的 `AGENTS.md` 或 `CLAUDE.md`，不会屏蔽 `~/.pi/agent` 或其他目录的文件；Codex 文档说明了同样的按目录优先规则，还支持在 `~/.codex` 或 `CODEX_HOME` 下放 `AGENTS.override.md`。

Codex 默认会忽略只有 `CLAUDE.md` 的仓库（P2 回复 `NONE`）。要让 Codex 回退读取 `CLAUDE.md`，可以在 `~/.codex/config.toml` 里设置 `project_doc_fallback_filenames`（Codex 文档举的例子是 `TEAM_GUIDE.md` 和 `.agents.md`）：

```toml
project_doc_fallback_filenames = ["CLAUDE.md"]
```

我用 Codex 的 `-c` 参数实测了这项配置：

```bash
codex exec -c 'project_doc_fallback_filenames=["CLAUDE.md"]' --skip-git-repo-check -s read-only "$P2"
```

在只有 `CLAUDE.md` 的仓库里，Codex 加载了 `CLAUDE.md`；两个文件同时存在时，它依然只加载 `AGENTS.md`。

## AGENTS.md 能写多长？

[Claude Code memory 文档](https://code.claude.com/docs/en/memory)建议单个 `CLAUDE.md` 控制在 200 行以内，不过 Claude Code 只有在文件超过 4 MiB 时才会跳过。Codex 在合并后的指令文件总大小达到 `project_doc_max_bytes` 时就会停止追加，按 Codex 文档默认上限是 32 KiB（32,768 字节）。

我自己的仓库就能看出这份文件涨过上限有多快。Orbi 的交付 prompt 会指示 Pi 读取目标仓库的 `AGENTS.md` 并满足其中的测试要求，评审 prompt 同样会读 `AGENTS.md`；两类会话都开着上下文文件加载（`no_context_files = False`），只有 draft 和 suggest 辅助会话把它关掉。在 PR #237（为 Issue #232 于 2026 年 9 月 2 日合并）之前，`orbi-build/orbi` 的 `AGENTS.md` 有 630 行。PR #237 把它砍到 129 行，压进 200 行以内。但我没守住这个长度：2026 年 9 月 10 日涨回 154 行，2026 年 9 月 20 日涨到 248 行，2026 年 10 月 1 日到 435 行，2026 年 11 月 1 日到 439 行，到 2026 年 11 月 21 日最后一次改动时已经变成 444 行（39,565 字节）。

为了拿这份 39,565 字节的文件测 Codex 的 32 KiB 截断，我在 Orbi 的 `AGENTS.md` 开头加了一条 `MARK-HEAD` 规则、末尾加了一条 `MARK-TAIL` 规则（总共 448 行，39,681 字节），然后用三个工具跑 P2。Claude Code 和 Pi 都返回了 `MARK-HEAD` 和 `MARK-TAIL`。默认配置的 Codex 跑了两次，两次都只返回 `MARK-HEAD`，末尾那条规则根本没传给 Codex。把上限调大后问题消失：

```bash
codex exec -c project_doc_max_bytes=65536 --skip-git-repo-check -s read-only "$P2"
```

带上 `project_doc_max_bytes=65536` 后，Codex 两个标记词都返回了。必须遵守的硬规则要放在文件开头，合并后的指令总大小尽量控制在 32 KiB 以内（或者调高 `project_doc_max_bytes`），不常用的操作说明挪进 skills 或子目录文件。

## AGENTS.md 怎么写

- 把 `AGENTS.md` 当作共享规则的唯一源文件，避免 Claude Code、Codex 和 Pi 读到不同版本。
- 需要兼容 `CLAUDE.md` 时用 `@AGENTS.md` 导入（或建软链接），别在 `CLAUDE.md` 里用自然语言写“请读 `AGENTS.md`”，因为普通文字不会触发导入，而 `CLAUDE.md` 的存在已经关掉了 `AGENTS.md` 的直接加载。
- 不可妥协的硬规则写在最前面：Codex 从末尾截断，靠前的规则能留下来。
- 合并后的指令体积压在 Codex 默认的 32 KiB 以内（或调高 `project_doc_max_bytes`），行数尽量向 Claude Code 建议的 200 行靠拢。
- 子目录专用规则拆进嵌套的 `AGENTS.md`；在我的嵌套测试里（根目录 `AGENTS.md` 加 `pkg/AGENTS.md`，在 `pkg/` 下运行），三个工具两份都加载了。
- 用类似 P2 的探测 prompt 查清楚实际加载了什么，别以为文件放在磁盘上就一定进了上下文。

下面是一份示意布局（不来自任何真实仓库），极简的 `AGENTS.md` 只需要写每次改动都必须遵守的规则：

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

只要没有显式关闭（例如 Pi 的 `--no-context-files` 或 `-nc` 参数），当前工作目录和上级目录里的 `AGENTS.md` 每次会话都会自动进上下文。工作目录以下的子目录文件不会：Claude Code 会在读取该子目录的文件时再加载，Codex 和 Pi 则只在你从该目录或更深目录启动会话时才加载。Skills（`SKILL.md`）按需加载：按 [Claude Code skills 文档](https://code.claude.com/docs/en/skills)，skill 描述留在上下文里，完整正文只有被调用时才加载。Pi 的 `docs/skills.md` 文档也是同一套方式：启动时把每个 skill 的名称、描述和路径写入 system prompt，等任务匹配时模型再去读 `SKILL.md`。

每次改动都必须遵守的仓库级硬约束（比如测试门禁和生成文件的边界）放进 `AGENTS.md`；偶尔才用到的流程（比如发布检查单或迁移指南）放到 `SKILL.md` 里，免得每次会话都占上下文，也避免把 `AGENTS.md` 撑过 32 KiB。

## 其他工具

我没有测 GitHub Copilot 和 Cursor，2026 年 11 月 25 日也没有重测 OpenCode。

| 工具 | 加载的指令文件 | 依据 |
|---|---|---|
| GitHub Copilot | 仓库任意位置的 `AGENTS.md`（最近目录优先）；也可改用仓库根目录下的单个 `CLAUDE.md` 或 `GEMINI.md` | [GitHub Copilot 文档](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)，未实测 |
| Cursor | 项目根目录和子目录下的 `AGENTS.md`（嵌套文件与父目录合并）；规则文档页未提及 `CLAUDE.md` | [Cursor 规则文档](https://cursor.com/docs/context/rules)，未实测 |
| OpenCode 2.2.5 | 加载了项目 `AGENTS.md`；未加载项目 `CLAUDE.md` 或 `~/.claude/CLAUDE.md` | 我在 2026 年 11 月 2 日[《OpenCode vs Claude Code》](/zh/blog/opencode-vs-claude-code/)中的实测，未重测 |

## 相关

想看这些指令文件接入怎样的交付闭环，可以读[从 GitHub Issue 到 Release](/zh/guides/issue-to-release/?ref=blog-agents-md)。2026 年 11 月 2 日 OpenCode 加载 `AGENTS.md` 的实测见[OpenCode vs Claude Code](/zh/blog/opencode-vs-claude-code/)，Codex CLI 的行为见[OpenCode vs Codex CLI](/zh/blog/opencode-vs-codex/)，Pi 与 Claude Code 的对比见[Pi coding agent 和 Claude Code 对比](/zh/blog/pi-coding-agent-vs-claude-code/)。关于 Orbi 如何运行 Pi 并读取你仓库里的 `AGENTS.md`，把 GitHub Issue 做成经过评审并合并的 PR，可以看[Orbi vs Claude Code](/zh/compare/claude-code/?ref=blog-agents-md) 和 [Orbi Cloud](/zh/cloud/?ref=blog-agents-md)。
