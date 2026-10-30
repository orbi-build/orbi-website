---
title: Pi 扩展在生产环境里怎么用：隔离加载，两个自写扩展
date: 2026-10-30
summary: Orbi 无人值守跑 Pi 时怎么处理扩展：--no-extensions 加一份钉死版本的白名单，一次 D-Bus 卡死逼出来的做法，以及我们自己写的两个扩展。
lang: zh
author: Lawrence Liu
image: /img/blog-pi-extensions-card.png
series: pi
---

Pi 扩展（extension）是 [Pi 编程 agent](https://pi.dev) 启动时加载的 TypeScript（或 JavaScript）模块：每个扩展导出一个函数，拿到扩展 API，就能注册模型可以调用的工具、加命令、订阅会话事件。Pi 找扩展有好几条路，在自己的笔记本上每一条都方便。在一个没人盯着的服务里，其中两条自动的路也可能把你没选过的代码带进会话。

我是 Lawrence Liu，Orbi 的创始人。Orbi 无人值守地跑 Pi：接一张 GitHub Issue，起一个 Pi 写改动，再起另一个 Pi 评审，评审和 CI 都过了才合并。[Pi 专题页](/zh/guides/pi-coding-agent/)讲的是这些会话外面那层 runner（Orbi 里负责领票、起 Pi、合并的那个常驻程序），[系列第一篇](/zh/blog/orbi-on-pi-coding-agent/)跟着一张 Issue 走完全程。这一篇只讲 Pi 扩展：Orbi 怎么加载，改成这样之前出过什么事，以及我们自己最后写了哪两个扩展。下面的命令和配置就是今天在跑的，Pi 版本 1.2.0；文中的 Orbi 版本号都是开源引擎的发布版本。

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

工具和命令也在这个函数里注册（`pi.registerTool`、`pi.registerCommand`），完整的工具例子在后面。扩展也可以是一个带 `index.ts` 的目录，或者一个在 `package.json` 里声明入口的包。

Pi 从三个地方加载扩展，后面说的一切都建立在这三者的区别上：

1. **自动发现。** `~/.pi/agent/extensions/`（全局）和 `.pi/extensions/`（项目内）下的 `*.ts`、`*.js` 文件、带 `index.ts` 的目录、带清单的包，都会自动加载。只找一层深。项目内的扩展，要等你在 Pi 第一次打开这个项目时回答「信任」之后才会加载。
2. **设置文件。** `pi install <来源>` 把一个 npm 或 git 包记进 `~/.pi/agent/settings.json`，以后每次启动都加载。`pi list` 看装了什么。
3. **显式路径。** `pi -e ./review.ts` 只给这一个进程加载这一个文件。文档说这是快速试扩展的办法。

除了这三条你自己的扩展来源，Pi 还自带内置扩展（比如 MCP 支持），不另说明就会加载。关掉自动加载的开关，`pi --help`（1.2.0）里是这样写的：

```
--extension, -e <path>   Load an extension file or builtin:<name> (can be used multiple times)
--no-extensions, -ne     Disable extension discovery and built-in extensions (explicit -e paths still work)
--no-builtin-tools, -nbt Disable built-in tools by default but keep extension/custom tools enabled
```

`--no-extensions` 关掉自动发现、`settings.json` 里的包，以及 Pi 自带的内置扩展（比如 MCP 支持）；[命令行文档](https://pi.dev/docs/latest/cli)的原话是关掉「discovered, configured, and built-in extensions」。显式的 `-e` 照样加载，内置扩展也可以用 `-e builtin:<名字>` 单独点名：`pi -ne -e builtin:mcp` 就是一个只有 MCP 这一个扩展的会话，把那个文件换成你自己的，就是只有你那个扩展的会话。要注意这个开关不管内置工具：`read`、`bash`、`edit`、`write` 还在。关内置工具是另一个开关 `--no-builtin-tools`，下面的澄清门禁两个都用。

## 一次 D-Bus 卡死，让 Orbi 不再信任 Pi 的默认加载

我机器上的 Orbi runner 是一个 systemd 用户服务。2026 年 9 月 4 日，一次运行什么都没做就停住了：Pi 进程活着，几分钟过去没有会话文件，也没有发给模型的请求。完整的记录和诊断脚本在[第一篇的事故一节](/zh/blog/orbi-on-pi-coding-agent/#two-incidents-that-shaped-how-we-run-pi)，这里只说要紧的。

runner 的 Pi 加载了我自己 `~/.pi/agent/settings.json` 里声明的包，其中一个是 `pi-mcp-adapter`。这个插件启动时初始化 `@napi-rs/keyring`，后者会通过 D-Bus 调一次 Secret Service。在 `systemd --user` 的服务上下文里，这个调用会卡住（我们遇到一次；同样的配置手动启动每次都正常），node 就在第一个模型请求发出之前一直等着。这次运行里没有任何东西要用 MCP。插件在那儿，是因为我交互使用时装了它，Pi 的默认加载（会读 `settings.json`）又把它交给了无人值守的会话。把它从 `settings.json` 里拿掉，那次运行就好了：同一张 Issue 重新跑，15 秒内写出了会话文件、拿到了第一个模型响应。

我们知道的只有这一次，但一次就够了：跑 runner 的那个用户账号（在我机器上就是我）为交互使用装的一个包，停掉了一次无人值守的运行，而 Orbi 的配置里没有任何一行说它可以进来。针对它的修法是 [Issue #249](https://github.com/orbi-build/orbi/issues/249)，9 月 7 日（UTC）合并：Orbi 自己声明一次运行可以有哪些扩展，实现者和评审者两个会话都带 `--no-extensions` 启动。第三个角色 `ticket`（写 Issue 评论的那个会话）晚了一个月才补上，见下面的表。

## Orbi 用 `--no-extensions` 加白名单加载 Pi 扩展

Orbi 的 runner 读自己的配置文件 `orbi.toml`（后面出现的 `.github/orbi.toml` 是另一个文件，放在仓库里的 GitHub 侧设置）。扩展清单是里面一张可重复的表：

```toml
[[pi_extensions]]
source = "npm:some-extension@1.4.2"   # npm 来源必须钉死版本号
enabled = true                         # 默认值
[pi_extensions.env]
SOME_EXTENSION_MODE = "unattended"     # 字面值，只注入这一个 Pi 子进程

[[pi_extensions]]
source = "git:github.com/org/repo@v1"  # git 来源必须在 @ 后面给 ref

[[pi_extensions]]
source = "extensions/local-check.ts"   # 相对配置文件的路径，必须存在
```

Orbi 在加载配置时校验（`src/orbi/config.py`）：npm 来源没有具体版本号、git 来源没有 ref、本地路径不存在、同一个来源写了两次、两条记录给同一个 `env` 名字设了不同的值，任何一条都会在运行开始前拒绝整份配置。启动 Pi 时，启用条目的 `env` 表合并进那一个 Pi 进程的环境（`src/orbi/pi_session.py` 里的 `pi_extension_env`），从不写进日志。

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

实现者、评审者、`ticket` 角色，以及 `orbi suggest` 里写建议的那个会话，拿到 `--no-extensions`，再按启用的条目各加一个 `--extension`。白名单靠的是这两样合在一起：`--no-extensions` 拒掉自动发现、设置文件和内置扩展，显式给出的条目就是会话能有的全部扩展。`-e` 接的不只是路径：帮助文本写的是「文件或 `builtin:<名字>`」，但在 Pi 1.2.0 上 `pi -ne -e npm:<包>@<版本>` 会真的去 npm 仓库取包（写错名字会收到 npm 自己的 404），`-e git:<主机>/<owner>/<repo>@<ref>` 会去克隆，Orbi 配置里的 `npm:`、`git:` 来源就是这样原样交给 Pi 的。`pi_extensions` 为空，Pi 就一个扩展都没有，这是 Orbi 的默认。

不过不是每个 Orbi 会话都用这份清单。下面是三种形状，每一种都是对「这个会话该能做什么」的不同回答：

| 会话 | 扩展参数 | 为什么 |
|---|---|---|
| 实现者、评审者、写评论的 `ticket` 角色，以及 `orbi suggest` 里写建议的那个会话 | `--no-extensions` + 配置里的各条 `--extension`（`orbi suggest` 那个会话另加 `--no-skills`） | 上面的白名单 |
| `orbi suggest`（读仓库、提任务建议的命令）的仓库摘要会话 | `--no-extensions`，不带任何 `--extension`；其他参数是 `--tools read,ls,find --no-skills --no-context-files` | 它只读，连配置里的扩展都不需要 |
| 澄清门禁（仓库的 `.github/orbi.toml` 里 `clarify_thin_tickets = true`） | `--no-builtin-tools --no-extensions --extension <clarify_verdict.ts>` | 只有一个工具，随引擎一起发布；别的都调不到 |

第一行不是一直这么完整。2026 年 10 月 5 日之前，`ticket` 角色启动时完全不带扩展参数，用户装的扩展可以加载进写 Issue 评论的会话。[Issue #1558](https://github.com/orbi-build/orbi/issues/1558) 当天在 Orbi v0.6.2 修了。skill 是同一件事的另一半。skill 是 Pi 加载进提示词的一份 Markdown 指令文件，Pi 找 skill 的方式和找扩展一样。那边的隔离还不完整：实现者、评审者和 `ticket` 角色拿到 Orbi 自己的 `--skill`，但没有 `--no-skills`，所以系统用户装的 skill 可能加载进去。只有 `orbi suggest` 传了 `--no-skills`，它的两个会话（写建议的那个和写仓库摘要的那个）都传。下面的澄清门禁是一个 `ticket` 会话，扩展参数不同（单独那一个 `--extension`，而不是配置里的清单），skill 的设置和 `ticket` 角色一样。

## 用一个扩展工具拿结构化裁决

如果你想写一个 Pi 扩展又不知道拿来干什么，我最先会指给你看的是澄清门禁，因为它解决的问题和 MCP、工具链都没关系：怎么稳定地从模型那里拿到一个结构化的答案。

门禁在 Orbi 开始交付之前跑。一个 Pi 会话把 Issue 正文当提示词读进来，按三条检查判断：有没有写清可观察的结果、验收条件，是不是单一结果。票面太薄时，Orbi 停下这次尝试，把 Issue 的标签换成 `ai-needs-detail`，并留一条评论（下文叫它拦票评论），列出缺什么；模型能提出修法时，评论里还会给出来：拆成这几张票，或者补上这几行验收。到 Orbi v0.7.20 为止，门禁让模型用自由文本回 JSON，引擎解析 stdout。在 Orbi Cloud 的测试环境上，门禁把提议全丢了：模型把 `kind` 和 `items` 放在顶层、和 `missing` 并列，解析器只读 `suggestion`，拦票评论里从来没出现过提议；同一段提示词发给 DeepSeek 三次，三次都返回了可用的拆分方案，只是放错了层级（[Issue #1955](https://github.com/orbi-build/orbi/issues/1955)）。

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

起作用的有三处。`parameters` 是一个每一层都带 `additionalProperties: false` 的 TypeBox schema，Pi 在跑 `execute` 之前就按它校验模型给的参数，所以顶层的 `kind`、不认识的检查 id、（完整文件里）只有一项的 split，都到不了文件。`execute` 把校验过的参数写到引擎放在 `ORBI_CLARIFY_OUT` 里的那个路径，引擎读文件，不读 stdout。`terminate: true` 让这次运行在工具调用上就结束，不再为下一轮付钱。会话用 `--no-builtin-tools --no-extensions --extension <这个文件>` 启动：内置工具关、自动发现关、只开这一个扩展。

schema 防的是畸形的裁决，不是缺失的裁决。一次调用被 schema 拒掉只是那一次失败，模型可以再试。整轮结束仍然没有文件（模型用散文回答，或者一次都没通过校验），引擎才把这当成模型不可用来处理：门禁放行，交付不经过这道检查就开始。薄票于是像门禁出现之前那样照常进来；不再发生的，是提议被悄悄丢掉。

Pi 加载扩展时会把 `typebox` 指向它自己钉死的那份，所以这样的文件不需要自己的 `package.json`。想自己试一下这个形状，把上面的代码存成 `verdict.ts`，然后：

```bash
out="$(mktemp -d)/verdict.json"   # 每次用新路径，免得读到上一次的结果
ORBI_CLARIFY_OUT="$out" \
  pi -ne -e ./verdict.ts -nbt \
  -p 'Call clarify_verdict once with {"missing":[]}.'
cat "$out"
```

几种出错长得不一样。没文件也没报错：模型根本没调工具。Pi 报参数校验错误：参数不合 schema。工具抛异常：`ORBI_CLARIFY_OUT` 没设，或者那个路径写不了。

## Orbi Cloud 起草 Issue 用的扩展

第二个扩展在 Orbi Cloud 里。Cloud 托管同一套 runner，另外加了一个页面：你用对话说想改什么，Orbi 替你起草 Issue。那次起草是租户沙箱（Cloud 给每个账号分配的一台独立 Linux 用户环境）里的一个 Pi 会话，用 `--no-extensions -e <起草扩展>` 和 `--tools read,grep,find,ls,write_draft,ask_user_question` 启动，白名单那条规矩在这里也成立。`--tools` 本身也是白名单：它替换掉 Pi 默认启用的那组工具，所以这个会话里 `bash`、`edit`、`write` 都调不到。扩展注册的就是列表末尾那两个工具：

- `write_draft` 接收完整的草稿和它的 Issue 标题，写到固定的文件里。页面只认这些文件是草稿，所以模型打在屏幕上的东西永远不会变成草稿。这套工具里没有通用的 write、edit，会话改不了仓库里的文件。之后另起一个 Pi 会话，拿用户的原话和草稿当输入文本，对照检查；它加载同一个扩展，但工具只有 `write_draft`，检查完的草稿也从这条路交回来。
- `ask_user_question` 用在需求说得不够清楚的时候。模型问一到四个问题，每个两到四个选项，推荐项放第一个。问题写到草稿旁边的一个文件里，这一轮就此结束。这次起草会话存成文件，起草运行用 `--session-dir` 和 `--session-id` 指定它；用户在页面上答了，下一轮在同一个会话文件上重新起 Pi，带上那一条消息，所以没有常驻进程，也没有超时。

工具的名字和参数形状来自一个社区扩展 `@juicesharp/rpiv-ask-user-question`，它是在终端里问问题的。我们没有把它当依赖：在 `pi -p`（Orbi 一直用的非交互模式）下，那个包会把工具整个撤掉，因为终端前没有人回答。我们只借了它的工具名和参数形状，自己写了一个。

## 自己写 Pi 扩展时可以照抄的

如果你跑 Pi 时键盘前没有人，这篇的短版是三个习惯：

1. 每个无人值守的 Pi 都用 `--no-extensions` 启动，再用 `-e` 把你确实要的那几个扩展加回来。清单写在配置里，npm 钉版本号、git 钉 commit SHA，缺了钉子就拒绝整份配置；记住对 git 来源，Orbi 的校验只查「有没有写 ref」，不查它会不会动。
2. 要从模型拿结构化答案时，给它一个带 schema、带 `terminate: true` 的工具，结果写进文件，其他一律当没有回答。不要解析 stdout。
3. 模型必须产出一份东西时，让扩展里的那个工具成为唯一的写入口，通用的写工具别放进 `--tools`。

我们这边还有一个口子没堵：skill 还没有同样的待遇，跑 runner 的那个用户账号装的 skill，除了 `orbi suggest` 的两个会话，仍然可能加载进 Orbi 的每一个会话。

## 相关

这是 Orbi Pi 系列的第四篇。[Pi 专题页](/zh/guides/pi-coding-agent/)有完整的 runner，[第一篇](/zh/blog/orbi-on-pi-coding-agent/)跟着一张 Issue 走过 Orbi 为它起的每一个 Pi 会话，[harness 对比](/zh/blog/pi-agent-harness/)把三种无人值守的 Pi 在任务中途停掉，比较各自恢复成什么样。Orbi 开源：[orbi-build/orbi](https://github.com/orbi-build/orbi)。不想自己跑 runner 的，看 [OpenHands 对比](/zh/compare/openhands/)和 [Cloud](/zh/cloud/)。
