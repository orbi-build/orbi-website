---
title: Orbi 怎么在生产里隔离加载 Pi 扩展和技能，又自己写了哪两个扩展
date: 2026-10-30
updated: 2026-11-17
summary: Orbi 无人值守跑 Pi 时怎么加载扩展和技能（skills）：扩展白名单、Pi 去哪找技能、怎么按会话关掉，以及我们自己写的两个扩展。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-pi-extensions-card.png
series: pi
---

Pi 扩展（extension）是 [Pi 编程 agent](https://pi.dev) 启动时加载的 TypeScript（或 JavaScript）模块：每个扩展导出一个函数，拿到扩展 API，就能注册模型可以调用的工具、加命令、订阅会话事件。Pi 找扩展有好几条路，在自己的笔记本上每一条都方便。在一个没人盯着的服务里，其中两条自动的路也可能把你没选过的代码带进会话。

我是 Larry 🍀 Orbi，Orbi 的创始人。Orbi 无人值守地跑 Pi：接一张 GitHub Issue，起一个 Pi 写改动，再起另一个 Pi 评审，评审和 CI 都过了才合并。[Pi 专题页](/zh/guides/pi-coding-agent/)讲的是这些会话外面那层 runner（Orbi 里负责领票、起 Pi、合并的那个常驻程序），[系列第一篇](/zh/blog/orbi-on-pi-coding-agent/)跟着一张 Issue 走完全程。这一篇讲 Pi 扩展：Orbi 怎么加载，改成这样之前出过什么事，以及我们自己最后写了哪两个扩展。另有一节讲 [Pi agent skills（技能）](#pi-agent-skills-技能-pi-去哪找-怎么关掉)，说清目录、安装和显式加载。下面的扩展命令和配置就是今天在 Pi 1.2.0 上跑的；技能一节在 Pi 1.5.2 上实测，主要的查找用例也在 1.2.0 上跑过一遍。文中的 Orbi 版本号都是开源引擎的发布版本。

## Pi 扩展是什么，Pi 从哪三个地方加载它

最简单的 Pi 扩展就是一个文件。下面这个来自 Pi 的[扩展文档](https://pi.dev/docs/latest/extensions)，能加载，只做一件事：

```ts
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });
}
```

工具和命令也在这个函数里注册（`pi.registerTool`、`pi.registerCommand`），完整的工具例子在后面。扩展也可以是一个带 `index.ts` 或 `index.js` 的目录，或者一个在 `package.json` 里声明入口的包。

Pi 从三个地方加载扩展：

1. **自动发现。** `~/.pi/agent/extensions/`（全局）和 `.pi/extensions/`（项目内）下的 `*.ts`、`*.js` 文件、带 `index.ts` 或 `index.js` 的目录、带清单的包，都会自动加载。只找一层深。项目内的扩展，要等你在 Pi 第一次打开这个项目时回答「信任」之后才会加载。
2. **设置文件。** `pi install <来源>` 把一个 npm 或 git 包记进 `~/.pi/agent/settings.json`，以后每次启动都加载。`pi list` 看装了什么。
3. **显式路径。** `pi -e ./review.ts` 只给这一个进程加载这一个文件。文档说这是快速试扩展的办法。

除了这三条你自己的扩展来源，Pi 还自带内置扩展（比如 MCP 支持），不另说明就会加载。关掉自动加载的开关，从 `pi --help`（1.2.0）里摘出这三行：

```text
--extension, -e <path>   Load an extension file or builtin:<name> (can be used multiple times)
--no-extensions, -ne     Disable extension discovery and built-in extensions (explicit -e paths still work)
--no-builtin-tools, -nbt Disable built-in tools by default but keep extension/custom tools enabled
```

`--no-extensions` 关掉自动发现、`settings.json` 里的包，以及 Pi 自带的内置扩展；[命令行文档](https://pi.dev/docs/latest/cli)的原话是关掉「discovered, configured, and built-in extensions」。显式的 `-e` 照样加载，内置扩展也可以用 `-e builtin:<名字>` 单独点名：`pi -ne -e builtin:mcp` 就是一个只有 MCP 这一个扩展的会话，把 `builtin:mcp` 换成你自己的扩展文件，就是只有你那个扩展的会话。要注意这个开关不管内置工具。默认开着的四个（`read`、`bash`、`edit`、`write`）还在；`ls`、`find`、`grep` 也是内置工具，只是默认不开，下面几处 `--tools` 清单里的名字就是从这儿来的。关内置工具是另一个开关 `--no-builtin-tools`，下面的澄清门禁两个都用。

## 一次 D-Bus 卡死，让 Orbi 不再信任 Pi 的默认加载

我机器上的 Orbi runner 是一个 systemd 用户服务。2026 年 9 月 4 日，一次运行什么都没做就停住了：Pi 进程活着，几分钟过去没有会话文件，也没有发给模型的请求。完整的记录和诊断脚本在[第一篇的事故一节](/zh/blog/orbi-on-pi-coding-agent/#两次事故)，这里只说要紧的。

runner 的 Pi 加载了我自己 `~/.pi/agent/settings.json` 里声明的包，其中一个是 `pi-mcp-adapter`。这个插件启动时初始化 `@napi-rs/keyring`，后者会通过 D-Bus 调一次 Secret Service。在 `systemd --user` 的服务上下文里，这个调用会卡住（那天晚上好几次运行都卡在这里；同样的配置手动启动每次都正常），node 就在第一个模型请求发出之前一直等着。这次运行里没有任何东西要用 MCP。插件在那儿，是因为我交互使用时装了它，Pi 的默认加载（会读 `settings.json`）又把它交给了无人值守的会话。把它从 `settings.json` 里拿掉，那次运行就好了：同一个运行重跑，15 秒内写出了会话文件、拿到了第一个模型响应。

那个包是我为交互使用装的，装在 runner 也在用的同一个用户账号下；Orbi 的配置里没有任何一行允许它进来。针对它的修法是 [Issue #249](https://github.com/orbi-build/orbi/issues/249)，9 月 7 日（UTC）合并：Orbi 自己声明一次运行可以有哪些扩展，实现者和评审者两个会话都带 `--no-extensions` 启动。第三个角色 `ticket`（写 Issue 评论的那个会话）晚了一个月才补上，见下面的表。

## Orbi 用 `--no-extensions` 加白名单加载 Pi 扩展

Orbi 的 runner 读自己的配置文件 `orbi.toml`（后面出现的 `.github/orbi.toml` 是另一个文件，放在仓库里的 GitHub 侧设置）。扩展清单是里面一张可重复的表：

```toml
[[pi_extensions]]
source = "npm:some-extension@1.4.2"
enabled = true
[pi_extensions.env]
SOME_EXTENSION_MODE = "unattended"

[[pi_extensions]]
source = "git:github.com/org/repo@v1"

[[pi_extensions]]
source = "extensions/local-check.ts"
```

`enabled` 默认是 true。Orbi 在加载配置时校验（`src/orbi/config.py`）：npm 来源没有具体版本号、git 来源 `@` 后面没有东西、本地路径不存在、同一个来源写了两次、两条记录给同一个 `env` 名字设了不同的值，任何一条都会在运行开始前拒绝整份配置。启动 Pi 时，启用条目的 `env` 表合并进那一个 Pi 进程的环境（`src/orbi/pi_session.py` 里的 `pi_extension_env`），从不写进日志。git 那条检查只看字符串：SSH 形式的 `git:git@host:org/repo` 能过，所以 git 来源要写成 `git:<主机>/<owner>/<repo>@<ref>`。

有两个边界要知道。`env` 的值是字面值：写 `"$SOME_TOKEN"`，传给 Pi 的就是这个字符串本身，不会展开，所以扩展要用的秘密应该由扩展自己从服务的环境里读，不要写在这里。另外 git 的 ref 可以是会动的 tag 或分支；如果你要实现者和评审者（两个独立的 Pi 进程）跑的扩展代码一个字节都不差，就钉 commit SHA，或者把同一个仓库修订版里的文件原样带上。

命令这边是 `src/orbi/pi_command.py` 里的几行：

```python
def _pi_extension_args(config: RunnerConfig) -> list[str]:
    """Return the isolated extension flags for every Pi role."""
    args = ["--no-extensions"]
    for extension in config.pi_extensions:
        if extension["enabled"]:
            args.extend(("--extension", extension["source"]))
    return args
```

实现者、评审者、`ticket` 角色，以及 `orbi suggest` 里写建议的那个会话，拿到 `--no-extensions`，再按启用的条目各加一个 `--extension`。白名单靠的是这两样合在一起：`--no-extensions` 拒掉自动发现、设置文件和内置扩展，显式给出的条目就是会话能有的全部扩展。`-e` 接的不只是路径：帮助文本写的是「文件或 `builtin:<名字>`」，但在 Pi 1.2.0 上 `pi -ne -e npm:<包>@<版本>` 会真的去 npm 仓库取包（写错名字会收到 npm 自己的 404），`-e` 接 `git:<主机>/<owner>/<repo>@<ref>` 会去克隆，Orbi 配置里的 `npm:`、`git:` 来源就是这样原样交给 Pi 的。`pi_extensions` 为空，Pi 就一个扩展都没有，这是 Orbi 的默认。

不过不是每个 Orbi 会话都用这份清单。不同会话的扩展参数不一样，一共三种：

| 会话 | 扩展参数 | 为什么 |
|---|---|---|
| 实现者、评审者、写评论的 `ticket` 角色，以及 `orbi suggest` 里写建议的那个会话 | `--no-extensions` + 配置里的各条 `--extension`（`orbi suggest` 那个会话另加 `--no-skills`） | 上面的白名单 |
| `orbi suggest`（读仓库、提任务建议的命令）的仓库摘要会话 | `--no-extensions`，不带任何 `--extension`；其他参数是 `--tools read,ls,find --no-skills --no-context-files` | 它只读，连配置里的扩展都不需要 |
| 澄清门禁（仓库的 `.github/orbi.toml` 里 `clarify_thin_tickets = true`） | `--no-builtin-tools --no-extensions --extension <clarify_verdict.ts>` | 只有一个工具，随引擎一起发布；别的都调不到 |

第一行不是一直这么完整。2026 年 10 月 5 日之前，`ticket` 角色启动时完全不带扩展参数，用户装的扩展可以加载进写 Issue 评论的会话。[Issue #1558](https://github.com/orbi-build/orbi/issues/1558) 当天在 Orbi v0.6.2 修了。技能有自己的查找规则和工具要求，见[下一节](#pi-agent-skills-技能-pi-去哪找-怎么关掉)。

## Pi agent skills（技能）：Pi 去哪找、怎么关掉

一个技能就是一个带 `SKILL.md` 的目录。文件开头的 front matter 写 `name` 和 `description`，后面是指令。Pi 把名称、描述和文件路径放进系统提示词，任务匹配时，模型再读文件。

我用本地服务代替模型 API，记录 Pi 发出的第一个请求，每个用例都用一个临时 `HOME`。测的是 Pi 1.5.2（当时 npm 上的当前版本）和 1.2.0。两个版本都跑过的用例，结果相同。下面记录的都是 Pi 实际发出的系统提示词里出现了什么。

### Pi 去哪找

| 位置 | 什么时候加载 | 说明 |
|---|---|---|
| `~/.pi/agent/skills/` | 用户级，始终查找 | 递归查找：放在两层子目录里的 `SKILL.md` 也加载了。 |
| `~/.agents/skills/` | 用户级，始终查找 | Agent Skills 的目录，按 `HOME` 解析。 |
| `.pi/skills/` | 项目受信任时 | 只找工作目录：从 `app/` 启动时，加载的是 `app/.pi/skills/`，不是仓库根目录下的 `.pi/skills/`。 |
| `.agents/skills/` | 项目受信任时 | 从工作目录逐级往上找，到 git 仓库根目录为止，不再往上；不在 git 仓库里时，一直找到文件系统根目录。 |
| `~/.pi/agent/settings.json` → `"skills"` | 已配置时 | 文件或目录的路径数组；实测绝对路径能加载。 |
| 已安装的包 | 已安装，且提供技能时 | 包里的 `skills/` 目录，或 `package.json` 的 `"pi"` 清单里声明的技能。 |

打印模式（`pi -p`）、JSON 和 RPC 模式都不会弹出信任提示。项目技能默认跳过，除非传了 `--approve`（`-a`）、已有保存的 `/trust` 决定，或在 `settings.json` 里设了 `"defaultProjectTrust": "always"`。实测传 `--approve` 或改这个设置都能加载；两者都不加时，没有项目技能加载。

安装时，可以把路径列进 `~/.pi/agent/settings.json` 的 `"skills"` 数组，也可以用 `pi install <source>` 安装 npm 包、git 来源或本地路径。安装会把来源记进同一个文件的 `"packages"`。一个含有 `skills/pack-skill/SKILL.md` 的本地包，运行下面这条后就能加载：

```bash
pi install ./my-skill-pack
```

Pi 技能文档指向的技能合集 `badlogic/pi-skills` 有个坑。我测的提交是 `90bb51c`，它的八个技能目录直接放在仓库顶层，没有 `skills/`，也没有 `package.json`。`pi list` 只能证明装上了，不能证明模型收到了技能：

```bash
pi install git:github.com/badlogic/pi-skills   # 安装成功，pi list 也列出来了，但一个技能都没加载
git clone https://github.com/badlogic/pi-skills ~/.pi/agent/skills/pi-skills   # 8 个技能都加载
```

它的 README 推荐的就是上面这个克隆位置；项目内则用 `.pi/skills/pi-skills`。

`pi --help` 里的两行原文：

```text
--skill <path>                 Load a skill file or directory (can be used multiple times)
--no-skills, -ns               Disable skills discovery and loading
```

实测加上 `--no-skills`，两个用户目录、受信任的项目目录、设置里的条目和已安装包的技能，都从提示词里消失了。显式给出的 `--skill` 路径仍然有效；不加 `--no-skills` 时，它们会和自动找到的技能一起加载。技能重名时只留一份，我测到留下的是 `~/.pi/agent/skills/` 里的那份；缺少描述的技能则被排除。这两种情况在 `pi -p` 的输出里都没有提示。Pi 文档说重名会警告，但我在打印模式里没看到。

这不是 Orbi 的命令，但无人值守时我会用这种形状，而且实测过：

```bash
pi -p --no-skills --skill ./skills/tdd-dev --skill ./skills/code-review/SKILL.md "..."
```

对应的测试显式传了两个技能，一个给目录，一个给 `SKILL.md` 路径。两个用户目录里也都装了技能，最后只有显式指定的这两个进了提示词。

只有会话带 `read` 或 `bash` 时，Pi 才把技能清单放进系统提示词。实测用 `--no-tools`、`--no-builtin-tools` 或 `--tools ls`，即使传了 `--skill` 也没有清单；用 `--tools bash` 则有。但技能不只从清单这条路进来。提示词以 `/skill:<name>` 开头时，Pi 会自己读那个技能文件，把全文贴进用户消息。我传了 `--no-tools --skill ./extra/tdd`，提示词用 `/skill:tdd add a test`，发出的请求里仍然带着整份 `SKILL.md` 正文。这条路有两个限制，我都测过：`/skill:` 只展开 Pi 已经加载的技能，加了 `--no-skills` 后，只放在 `~/.agents/skills/` 里的技能就进不来；而且只有提示词正文本身以它开头才生效。用 `@文件` 传进去的提示词会被 Pi 包进一个 `<file>` 标签，一个以 `/skill:usr` 开头的文件没有被展开。

`PI_CODING_AGENT_DIR` 可以改 Pi 的 agent 目录。我把它指向空目录后，`~/.pi/agent/skills/` 就不再加载了；`~/.agents/skills/` 仍按 `HOME` 加载。

### Orbi 怎么给每个会话传技能

我读的是 v0.7.45 之后、`b5bf8d00` 这次提交的 Orbi 源码，包括 [Pi 命令构造器](https://github.com/orbi-build/orbi/blob/b5bf8d00/src/orbi/pi_command.py)。`orbi draft` 从 v0.7.32 加入，把一句话变成 Issue。下表里「配置的技能」指 `orbi.toml` 中 `skills` 列出的路径。「用户技能」包括始终会找的 `~/.agents/skills/`，以及 `orbi.toml` 没有设置 `pi_providers` 文件时的 `~/.pi/agent/skills/`，还包括 Pi 设置里 `"skills"` 列出的条目和已安装包提供的技能。

设置 `pi_providers` 后，`PI_CODING_AGENT_DIR` 会指向每次运行各自的目录：

```text
<worktree>/.orbi/pi-agent/
```

Orbi 根据用户自己的设置生成这个目录下的 `settings.json`。设置里的技能和包的技能能不能继续从这里加载，我没有测过。

Orbi 不传 `--approve`，所以仓库自带的技能只在两种情况下加载：runner 账号的 Pi 设置里写了 `"defaultProjectTrust": "always"`；或者没设 `pi_providers`、并且保存过 `/trust` 决定（这些决定存在 agent 目录里，设了 `pi_providers` 就换成了每次运行的新目录）。表里的「排除」只是不传 `orbi.toml` 里的那条路径；用户目录里有同名技能的话，照样会加载。

| 会话 | 工具 | 技能参数 | 模型能看到什么 |
|---|---|---|---|
| 实现者 | 默认的 `read`、`bash`、`edit`、`write` | 每个配置路径各传一个 `--skill`，排除 `review-fix-loop`；不传 `--no-skills` | 配置的技能、用户技能和受信任项目的技能 |
| 评审者 | 同样的默认工具 | 同上，另排除 `tdd-dev` | 排除后的配置技能、用户技能和受信任项目的技能 |
| 写评论的 `ticket` 角色 | `--no-tools` | 传配置里的 `--skill`，排除 `review-fix-loop`；不传 `--no-skills` | 没有 |
| 澄清门禁 | `--no-builtin-tools`，一个扩展 | 与 `ticket` 相同 | 没有 |
| `orbi suggest`：写建议 | `read`、`grep`、`find`、`ls` | `--no-skills`，用一个 `--skill` 加载 `suggest-ai-ready-issues` | 只有这个技能 |
| `orbi suggest`：仓库摘要 | `read`、`ls`、`find` | `--no-skills`，不传 `--skill` | 没有 |
| `orbi draft`：起草 | `read`、`grep`、`find`、`ls`、`write_draft`、`ask_user`、`reply` | `--no-skills`，不传 `--skill` | 没有 |
| `orbi draft`：校对 | `--no-tools` | `--no-skills`，不传 `--skill` | 没有 |

还没隔离完整的是实现者和评审者，用户技能仍能进这两个会话。本文旧版说 `ticket` 角色也可能拿到已安装的技能。Pi 确实会找到它们，但这个角色带 `--no-tools`，Pi 不会把技能列进提示词；Orbi 又把每条提示词都用 `@文件` 传给 Pi，开头不会是 `/skill:`。澄清门禁也因此看不到技能。

## 用一个扩展工具拿结构化裁决

如果你想写一个 Pi 扩展又不知道拿来干什么，我最先会指给你看的是澄清门禁，因为它解决的问题和 MCP、工具链都没关系：怎么稳定地从模型那里拿到一个结构化的答案。

仓库开了它（`clarify_thin_tickets = true`）以后，门禁在 Orbi 开始交付之前跑。一个 Pi 会话把 Issue 正文当提示词读进来，按三条检查判断：有没有写清可观察的结果、验收条件，是不是单一结果。票面太薄时，Orbi 停下这次尝试，把 Issue 的标签换成 `ai-needs-detail`，并留一条评论（下文叫它拦票评论），列出缺什么；模型能提出修法时，评论里还会给出来：拆成这几张票，或者补上这几行验收。到 Orbi v0.7.20 为止，门禁让模型用自由文本回 JSON，引擎解析 stdout。在 Orbi Cloud 的测试环境上，门禁把提议全丢了：模型把 `kind` 和 `items` 放在顶层、和 `missing` 并列，解析器只读 `suggestion`，拦票评论里从来没出现过提议；同一段提示词发给 DeepSeek 三次，三次都返回了可用的拆分方案，只是放错了层级（[Issue #1955](https://github.com/orbi-build/orbi/issues/1955)）。

修法是不再解析文本。从 Orbi v0.7.21（10 月 28 日）起，引擎自带 `src/orbi/extensions/clarify_verdict.ts`，一个只注册一个工具的扩展。下面是删节版：去掉了 `split` 那一种提议形状、导出的常量和注释，描述也缩短了；[完整文件](https://github.com/orbi-build/orbi/blob/main/src/orbi/extensions/clarify_verdict.ts) 138 行：

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { writeFileSync } from "node:fs";

const parameters = Type.Object(
  {
    missing: Type.Array(
      Type.Union([
        Type.Literal("observable_result"),
        Type.Literal("acceptance_condition"),
        Type.Literal("single_outcome"),
      ]),
      { description: "The failed checks; empty when all three checks pass" },
    ),
    suggestion: Type.Optional(
      Type.Object(
        {
          kind: Type.Literal("criteria"),
          items: Type.Array(Type.String(), { minItems: 1 }),
          // "split" 那一种（kind: "split"，至少两项）这里略去
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "clarify_verdict",
    label: "Clarify verdict",
    description: "Return the ticket-gate verdict. Call this exactly once.",
    parameters,
    async execute(_toolCallId: string, args: object) {
      const out = process.env.ORBI_CLARIFY_OUT;
      if (!out) throw new Error("ORBI_CLARIFY_OUT is not set");
      writeFileSync(out, JSON.stringify(args), "utf8");
      return {
        content: [{ type: "text" as const, text: "Verdict recorded." }],
        details: undefined,
        terminate: true,
      };
    },
  });
}
```

起作用的有三处。`parameters` 是一个每一层都带 `additionalProperties: false` 的 TypeBox schema，Pi 在跑 `execute` 之前就按它校验模型给的参数，所以顶层的 `kind`、不认识的检查 id、（完整文件里）只有一项的 split，都到不了文件。`execute` 把校验过的参数写到引擎放在 `ORBI_CLARIFY_OUT` 里的那个路径，引擎读文件，不读 stdout。`terminate: true` 让这次运行在这次调用之后就结束，不再为下一轮付钱；Pi 只在这一轮的每个工具调用都返回了它时才这样做，一次有效裁决和一次失败的调用混在同一轮里，运行还会继续。会话用 `--no-builtin-tools --no-extensions --extension <这个文件>` 启动：内置工具关、自动发现关、只开这一个扩展。

schema 防的是畸形的裁决，不是缺失的裁决。一次调用被 schema 拒掉只是那一次失败，模型可以再试。整轮结束仍然没有文件（模型用散文回答，或者一次都没通过校验），引擎才把这当成模型不可用来处理：门禁放行，交付不经过这道检查就开始。薄票于是像门禁出现之前那样照常进来；区别在于提议不会再无声无息地丢掉：引擎读到的每条提议仍要过一道检查（比如空行会被拒掉），丢掉时会把原因写进日志。

Pi 加载扩展时会把 `typebox` 指向它自己钉死的那份，所以这样的文件不需要自己的 `package.json`。想自己试一下这个形状，把上面的代码存成 `verdict.ts`，然后：

```bash
out="$(mktemp -d)/verdict.json"   # 每次用新路径，免得读到上一次的结果
ORBI_CLARIFY_OUT="$out" \
  pi -ne -e ./verdict.ts -nbt \
  -p 'Call clarify_verdict once with {"missing":[]}.'
cat "$out"
```

几种出错长得不一样。Pi 没报错、`cat` 说文件不存在：模型根本没调工具。Pi 报参数校验错误：参数不合 schema。工具抛异常：`ORBI_CLARIFY_OUT` 没设，或者那个路径写不了。

## 起草 Issue 的扩展

第二个扩展用来起草 Issue。Orbi Cloud 托管同一套 runner，有个页面让你用对话说想改什么，由 Orbi 起草 Issue。从 Orbi v0.7.32 起，起草由引擎里的 `orbi draft` 负责，Cloud 在租户沙箱里调用它。每轮先启动一个起草用的 Pi 会话，引擎拼出的命令是这个形状：

```bash
pi --tools read,grep,find,ls,write_draft,ask_user,reply \
   --no-skills --no-context-files \
   --no-extensions --extension <draft_tools.ts> \
   --print --session-dir <dir> --system-prompt <file> @<context file>
# 之后几轮加 --continue，沿用同一个 --session-dir
```

白名单那条规矩在这里也成立。`--tools` 本身也是白名单：它替换掉 Pi 默认启用的那组工具，所以这个会话里 `bash`、`edit`、`write` 都调不到。扩展 [`draft_tools.ts`](https://github.com/orbi-build/orbi/blob/b5bf8d00/src/orbi/extensions/draft_tools.ts) 注册列表末尾的三个工具。每个工具都把校验过的参数写进 `ORBI_DRAFT_OUT` 指定的文件，再用 `terminate: true` 结束运行，和澄清门禁一样：

- `write_draft` 接收一句说明要改什么的 `reply`，以及起草的各张 Issue。每张都有标题和正文。还有一个可选的 `after`：填同一份草稿里排在前面某张 Issue 的序号（从 1 数起），建票时这张会被记为被那张阻塞（blocked by）。引擎只认那个文件是草稿，模型打在屏幕上的内容不会变成草稿。会话没有通用的写入或编辑工具，也就改不了仓库文件。
- `ask_user` 用在请求没说清要做什么的时候。模型给一句 `reply`，再问最多三个问题。每题可以带两到四个选项，合理的默认项在标签末尾加 `(Recommended)`。有推荐项，引擎就自己选，然后继续同一个会话；一轮最多启动三个起草会话，超过就算这一轮失败。只有没有推荐项的问题才会结束这一轮，等用户回答。用户在页面上答了，下一轮就在同一个会话目录上用 `--continue` 启动 Pi。对话能接上，两轮之间不需要常驻进程。
- `reply` 用在不要求改代码的请求上，比如「只评审一下，告诉我结果」。它只回复，不起草 Issue。

草稿出来后还有两个检查环节。先另起一个独立的 Pi 会话做校对（fidelity pass），把请求和草稿作为文本交给它，检查草稿是否恰好表达了用户的要求。它可以改标题和正文，不能改 Issue 的数量或顺序。这个会话带 `--no-tools --no-skills --no-extensions`，把答案写到 stdout。这里能用 stdout，是因为这一步可选：回答为空或不可用，就保留起草者的版本。然后引擎跑澄清门禁的那道检查，也就是领票时判定 Issue 的同一个函数。没过的草稿退回起草会话，用 `--continue` 再走一轮，只退回一次。

早期放在 Cloud 侧的版本把提问工具叫 `ask_user_question`，名字来自社区扩展 `@juicesharp/rpiv-ask-user-question`，后者在终端里问问题。我们没有依赖那个包：在 `pi -p`（Orbi 一直用的非交互模式）下，它会把工具整个撤掉，因为终端前没有人回答。

## 自己写 Pi 扩展时可以照抄的

无人值守地跑 Pi，可以照这四条做：

1. 每个无人值守的 Pi 都用 `--no-extensions` 启动，再用 `-e` 把你确实要的那几个扩展加回来。清单写在配置里，npm 钉版本号；git 至少写 `@ref`（tag、分支都能过校验），要两个会话跑的代码一字不差再钉 commit SHA；缺了钉子就拒绝整份配置；记住对 git 来源，Orbi 的校验只查「`@` 后面有没有东西」，不查那个 ref 会不会动。
2. 要从模型拿结构化答案时，给它一个带 schema、带 `terminate: true` 的工具，结果写进文件，其他一律当没有回答。不要解析 stdout。
3. 模型必须产出一份东西时，让扩展里的那个工具成为唯一的写入口，通用的写工具别放进 `--tools`。
4. 无人值守的 Pi 用 `--no-skills` 启动，再用 `--skill` 逐个加回技能。会话没有 `read` 或 `bash` 时，系统提示词里不会有技能清单，但以 `/skill:<name>` 开头的提示词仍会带进已加载技能的全文，所以不可信的文本要用 `@文件` 传，别直接当提示词。

在 Orbi 里，实现者和评审者是仍然开着技能自动发现的两个会话；每个会话具体能看到什么，见技能一节的表。

## 相关

这是 Orbi Pi 系列最新的一篇。[Pi 专题页](/zh/guides/pi-coding-agent/)有完整的 runner，[第一篇](/zh/blog/orbi-on-pi-coding-agent/)跟着一张 Issue 走过 Orbi 为它起的每一个 Pi 会话，[harness 对比](/zh/blog/pi-agent-harness/)把三种无人值守的 Pi 在任务中途停掉，比较各自恢复成什么样。Orbi 开源：[orbi-build/orbi](https://github.com/orbi-build/orbi)。不想自己跑 runner 的，看 [OpenHands 对比](/zh/compare/openhands/)和 [Cloud](/zh/cloud/)。
