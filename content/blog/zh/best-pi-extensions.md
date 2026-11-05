---
title: Pi 扩展推荐：20 个扩展的无人值守实测
date: 2026-11-05
summary: 20 个 Pi 扩展的无人值守实测：MCP、联网搜索、子代理各用哪个，哪些会改配置。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-best-pi-extensions-card.png
series: pi
mirror: best-pi-extensions
---

扩展加载成功后，模型未必拿得到工具。2026 年 11 月 5 日，我实测了 20 个热门 Pi 扩展。我先在没有终端、没有桌面会话总线的环境里启动 Pi，再接入一个永不应答的 Secret Service（钥匙串服务）重跑。这次用于提问和计划评审的两个扩展都没提供工具；一个权限扩展连 `ls -la` 都拒绝，MCP 适配器则改了配置，影响到了下次会话。

**无人值守跑 Pi，按用途先看这几个**

- 网页搜索：`pi-web-access` 或 `pi-web-search`，这两个不用搜索 key 就能用。
- 子代理：`pi-subagents`、`@tintinweb/pi-subagents` 和 `pi-ptc-subagents` 都返回了结果；`pi-subagent-manager` 需要会话目录。
- MCP 候选：`pi-mcp-extension` 或 `@fitchmultz/pi-mcp-adapter`，或者每次运行都新建 agent 目录，再用 `pi-mcp-adapter`。这次没有测试这些适配器的服务器调用。
- 任务清单：`rpiv-todo`。
- 命令拦截：`cc-safety-net`；`pi-permission-system` 要先写明确的权限配置。

下文说明这些选择的依据，你也可以用后面的脚本自行测试扩展。

## 无人值守时，我会留下哪些 Pi 扩展？

### Pi MCP 扩展

需要 MCP 时，`pi-mcp-extension` 和 `@fitchmultz/pi-mcp-adapter` 会是我的候选；也可以用 `pi-mcp-adapter`，每次运行前重建 agent 目录。这次三个扩展都没连接服务器，在留下的东西上，测到的区别只有设置文件副作用：`pi-mcp-adapter` 改了设置，另外两个没有。

### Pi 联网搜索扩展

网页搜索方面，`pi-web-access` 没有搜索 key 也能用，报告的 provider 是 "Provider: exa"；它的 README 说明，没有 key 时会通过 Exa 的 MCP 端点搜索，因此查询会发给 Exa。`pi-web-search` 也能用，它的 README 说搜索通过当前选定的模型完成。`@zeldrisho/pi-web-search` 和 `pi-wsearch` 能正常加载，但要先配好自己的搜索 key（前者用 Brave），否则只返回错误。

### Pi 子代理扩展

三个子 agent 包返回了 `PONG`，其中 Pi-subagents 那次，模型先猜了一个 agent 名称，重试后才成功。`pi-subagent-manager` 在 `--no-session` 下启动子 agent 失败，给 Pi 一个会话目录后就能用；像 Orbi 这样的运行器本来就给每个会话一个目录。

### 任务清单与命令拦截

任务清单我会保留 `rpiv-todo`，用 `cc-safety-net` 拦截命令。permission-system 要有明确配置才会用。

我没测 OAuth MCP 服务器、付费搜索 key 或长时间运行。测试环境是 Linux，没有测 Windows 和 macOS。

## Pi 扩展怎么安装和试用？

- 试用一次：`pi -e npm:<package>@<version>`，只在这次运行加载扩展；扩展写入的配置仍可能保留。
- 长期安装：`pi install npm:<package>@<version>`，用 `pi list` 查看、`pi remove` 删除；Pi 1.5.0 的 `pi --help` 有这些子命令。
- 无人值守时建议钉版本，用后文脚本先测。

### Pi 扩展和 skill 有什么区别？

Pi agent 扩展是 Pi 启动时加载的代码，可以来自本地文件、npm 包或 git 仓库。多数扩展会注册模型可以调用的工具，本文说的 Pi 插件也指这类扩展。skill 是写在 `SKILL.md` 里的指令。[生产环境那篇的第一节](/zh/blog/pi-extensions-in-production/#pi-扩展是什么-pi-从哪三个地方加载它)介绍了两者的区别，以及 Pi 怎样加载扩展。

## 20 个 Pi 扩展按用途对比

表格按用途分组，推荐依据是这次调用结果。下载量是 2026 年 11 月 5 日查询的 npm 上月包下载总量，工具一列只列出对照组之外新增的工具。我只比较了临时 HOME 和测试仓库里的文件变化，不包含 `/tmp` 或系统目录。「未观察到」不计 Pi 通常会写的 `auth.json`、`models-store.json`、npm 缓存和包的安装文件。每行结论只适用于「调用测试」列的操作，钥匙串访问和计时结果见后面的专节。

| 扩展@版本 | 无人值守结论 | 用途 | `pi -p` 新增工具 | 调用测试 | HOME 或仓库中的额外文件 | 上月下载量 | 许可证 |
|---|---|---|---|---|---|---|---|
| `pi-mcp-adapter@7.0.1` | 空服务器列表查询完成；会改写设置 | MCP | `mcp` | 列出的服务器为空 | agent 目录中的 `settings.json`、`mcp-onboarding.json` | 1,408,674 | MIT |
| `pi-mcp-extension@1.13.0` | 状态查询能用；未配置服务器 | MCP | `mcp_status`, `mcp_connect`, `mcp_list_resources`, `mcp_read_resource` | 状态返回 `[]` | 未观察到 | 823,848 | MIT |
| `@fitchmultz/pi-mcp-adapter@8.0.30` | 能用；不改设置 | MCP | `mcp_search` | 搜索返回无工具（未配置服务器） | 未观察到 | 5,684 | MIT |
| `pi-web-access@0.47.0` | 没有搜索 key 也搜到了结果 | 网页搜索 | `web_search`, `source_check`, `fetch_content`, `get_search_content` | 搜索返回 Pi 扩展目录 | 未观察到 | 1,116,299 | MIT |
| `pi-web-search@1.7.0` | 用当前选定的模型能搜到结果 | 网页搜索 | `web_search` | 搜索返回结果 | 未观察到 | 75,116 | MIT |
| `@zeldrisho/pi-web-search@0.14.5` | 需要 Brave key | 网页搜索 | `web_search` | 报错：`BRAVE_SEARCH_API_KEY is required` | 未观察到 | 1,875 | MIT |
| `pi-wsearch@0.6.0` | 需要搜索 key | 网页搜索 | `WebSearch`, `WebFetch` | 「未配置搜索引擎 key」 | 未观察到 | 1,830 | MIT |
| `pi-subagents@0.84.0` | 名称修正后能用 | 子 agent | `subagent`, `contact_supervisor`, `bg_wait`, `subagent_supervisor` | 模型猜错 agent 名称，重试后返回 `PONG` | agent 目录中 `missions/` 下的 JSON | 726,352 | MIT |
| `@tintinweb/pi-subagents@0.23.1` | 能用；会保存子会话 | 子 agent | `Agent`, `SubagentWorkflow`, `get_subagent_result`, `steer_subagent` | 返回 `PONG` | agent 目录中 `sessions/` 下的 JSONL | 47,391 | MIT |
| `pi-ptc-subagents@7.9.3` | 能用 | 子 agent | `ptc_run_code`, `ptc_workflow` | 返回 `PONG` | 未观察到 | 6,902 | Apache-2.0 |
| `pi-subagent-manager@1.6.1` | 需要会话目录 | 子 agent | `agent_types`, `agent_spawn`, `agent_wait`, `agent_steer`, `agent_status`, `agent_update`, `agent_pause`, `agent_stop`, `agent_output` | 带 `--no-session` 时启动失败（`ENOENT: mkdir ''`）；给会话目录后返回结果 | 未观察到 | 8,070 | MIT |
| `@juicesharp/rpiv-ask-user-question@2.15.0` | 没有 UI 时不启用 | 向用户提问 | 无（没有 UI 时被移除） | 模型回答 `NO-TOOL` | 未观察到 | 151,853 | MIT |
| `@plannotator/pi-extension@0.28.49` | 没有 UI 时不启用 | 计划评审 | 无（没有 UI 时被移除） | 模型回答 `NO-TOOL` | 未观察到 | 89,716 | MIT OR Apache-2.0 |
| `@juicesharp/rpiv-todo@2.15.0` | 能用 | 任务管理 | `todo` | 添加并列出 "write tests" | 未观察到 | 87,414 | MIT |
| `pi-background-tasks@2.6.10` | 能用；会留下输出 | 任务管理 | `fusion_reason`, `fusion_investigate`, `fusion_research`, `fusion_validate`, `bg_delegate`, `bg_result`, `bg_run`, `bg_run_pi_attested`, `bg_status`, `bg_logs`, `bg_kill` | 返回 `hi-from-bg` | 仓库中的 `.pi/tasks/` | 18,054 | ISC |
| `@gotgenes/pi-permission-system@42.0.0` | 需要配置 | 安全 | 无（检查 bash 调用） | Bash 审批被拒绝 | agent 目录中的权限审查日志 | 46,073 | MIT |
| `cc-safety-net@2.7.3` | 命令拦截生效 | 安全 | 无（检查 bash 调用） | 拦下 `git reset --hard` | `~/.cc-safety-net/logs/` | 114,610 | MIT |
| `context-mode@2.1.0` | 能用；会保留数据库 | 上下文 | `ctx_execute`, `ctx_batch`, `ctx_index`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_upgrade`, `ctx_purge` | 返回 `hi-from-ctx` | `~/.context-mode/projects/<hash>/context.db` | 103,931 | Elastic-2.0 |
| `pi-lens@4.4.8` | 能用；首次调用会下载工具 | 代码反馈 | `lens_diagnostics`, `symbol_search`, `effective_config`, `project_report`, `module_report`, `read_symbol`, `read_enclosing`, `pi_lens_activate_tools` | README 诊断未报问题 | `~/.pi-lens/`、下载的二进制文件 | 86,632 | MIT |
| `pi-hermes-memory@0.10.0` | 能用；会保留记忆 | 记忆 | `memory_add`, `memory_replace`, `memory_remove`, `skill_manage`, `session_search`, `memory_search` | 保存了测试用的颜色 | agent 目录中的 `MEMORY.md`、SQLite 文件 | 25,570 | MIT |

`cc-safety-net` 支持多个 coding agent，它的 npm 关键词包含 `claude-code`、`opencode` 和 `pi-package`，在 Pi 中可以作为普通扩展加载。`context-mode` 使用的 Elastic-2.0 允许查看源码，但不属于 OSI 认可的开源许可证。

## 这次 Pi 扩展怎么测

我是 Larry 🍀 Orbi，Orbi 的创始人。Pi 在 CI 或 systemd 服务里运行时，我关心模型拿到了哪些工具，扩展运行后又留下了什么。扩展版本更新很快，这些结论只适用于上表的版本和这次测试的日期。

测试环境是 Pi 1.5.0、Node v22.23.1、`/usr/bin/npm` 12.0.2 和 Linux 6.18。模型用 DeepSeek 的 `deepseek-flash`，我通过一个本地日志代理记录发给模型的工具清单。

E2 没有会话总线。我用 `env -i` 清空环境变量，用 `setsid -w` 脱离终端，stdin 接 `/dev/null`，HOME 和 agent 目录都是新建的。agent 目录存放 Pi 的配置和状态，默认在 `~/.pi/agent`，可用 `PI_CODING_AGENT_DIR` 更改位置。扩展参数是 `-ne -e npm:<pkg>@<version>`，运行时加上 `timeout 120`。这组扩展参数只加载显式指定的包。环境里有模型服务商的 key，没有额外提供搜索服务商的 key。加载测试的 prompt 是 "Reply with the single word OK."。加载后，我再要求每个扩展实际完成一次操作，每次调用测试都从已装好扩展的 E2 HOME 副本开始。

E1 多了一条私有会话总线，由下方的 `blackhole.py` 占用 `org.freedesktop.secrets`，记录每次调用但永不应答。每次 E1 运行都从对应的 E2 HOME 副本开始。20 个扩展都在 E1 和 E2 中测过，每个扩展在两种环境里提供的工具和调用测试结果都相同，所以表格中每个扩展只列一行，Secret Service 调用另放在后面的专节。E1 计时包含 1 秒的总线启动时间；同一总线下不加载扩展的 E1 对照组，在 1.2 秒时发出了首次模型请求。

不加载扩展的对照组恰好只有 `read,bash,edit,write` 四个工具。用 `busctl` 调用黑洞，5 秒后超时；另一个自写扩展在加载时读取钥匙串，3 次运行中 3 次都访问到了黑洞。

## 无人值守跑 Pi，哪些地方会出问题

### MCP 适配器改的设置会影响下次会话

即使只用一次性的 `-e`，`pi-mcp-adapter@7.0.1` 第一次加载时也写入了这份配置：

```json
{"extensions":["-builtin:mcp"]}
```

它还写了 `mcp-onboarding.json`。Pi 的 `docs/mcp.md` 第 268 行说明了扩展替代内置 MCP 的情况，并记录了用这项设置禁用内置 MCP 的方法。

为了确认这项设置的影响，我在新的 agent 目录里放了下面这份 `mcp.json`，指向本地已安装的 `@modelcontextprotocol/server-everything`：

```json
{"mcpServers":{"everything":{"command":"/var/tmp/pex/mcpsrv/node_modules/.bin/mcp-server-everything","args":["stdio"]}}}
```

`command` 里是测试机上的安装路径，照做时换成你自己装的位置。

启动时不带 `-ne`，Pi 的内置 MCP 就连接了这台服务器：模型拿到了 `codemode` 工具，Pi 也写出了 `mcp.log`。我把同一份 `mcp.json` 复制到适配器用过的 agent 目录，再次启动 Pi，仍然不带 `-ne`，也不加载适配器。这次 `codemode` 和 `mcp.log` 都没有出现，因为该目录的 `settings.json` 中仍有 `-builtin:mcp`，内置 MCP 依然被禁用。省略 `-ne` 不能恢复它。我把这份 `settings.json` 里的 `extensions` 列表清空后再跑，`codemode` 和 `mcp.log` 都回来了。这几次连接 MCP 服务器的运行只用于验证配置副作用，表格里的 MCP 调用测试没有连接任何服务器。

在服务里运行时，可以为每次会话准备独立、可写的 agent 目录，或者每次运行都重写 `settings.json`。

### 包名拼错，Pi 也可能以 0 退出

Pi 1.5.0 会打印 `Warning: Extension package "...": failed to install (...)`，然后继续运行，退出码为 0。我用 Pi 1.2.0（`/usr/bin/pi`）跑了同一条命令，退出码是 1。[Pi 更新日志](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)的 1.5.0 一节记录了这项变化，对应 [PR #11304](https://github.com/earendil-works/pi/pull/11304)。

无人值守时，拼错包名可能让运行缺少预期扩展，却不报失败，所以下方脚本会检查这条警告。如果扩展在加载时抛异常，Pi 1.5.0 仍以 1 退出。

### 提问和计划评审工具需要 UI

`rpiv-ask-user-question` 的 `reconcile.ts` 在 `!ctx.hasUI` 时移除 `ask_user_question`。Plannotator 的 `index.ts` 在同样的条件下停用工具。这次两者都顺利加载，在 `pi -p` 下却都没提供工具。要求模型调用时，它回答 `NO-TOOL`。

### 默认权限配置会拦住普通操作

没写配置时，`pi-permission-system@42.0.0` 拒绝了每一次 bash 调用尝试，连 `ls -la` 也一样：

> This 'bash' call requires approval, but no interactive UI is available.

测试要求执行 `mkdir -p scratch && rm -rf scratch && echo removed`，不加载扩展的对照组执行后输出了 `removed`。扩展在无法获得批准时会拒绝调用。无人值守时，需要配置好任务所需的权限；这次没有测试这样的配置。

`cc-safety-net@2.7.3` 没加工具，用 `BLOCKED by CC Safety Net` 和规则 `git.reset-hard` 拦下了 `git reset --hard`。不加载扩展的对照组在临时仓库里执行了这条命令，退出码为 0。扩展把日志写到了 `~/.cc-safety-net/`。

### npm 跳过了安装脚本

这套环境中的 npm 12 默认阻止安装脚本：

```text
npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:
```

三次安装各有一个包的脚本被阻止：Plannotator 的 `node-pty`、permission-system 的 `tree-sitter-bash`，以及 pi-lens 的 `@ast-grep/cli` postinstall。权限扩展仍按前文所述拒绝 bash 调用，`lens_diagnostics` 返回了 `clean=1, unavailable=0, failed=0`，重跑时还报告 `Primary LSP (marksman): confirmed clean`，所以这次测到的部分能运行。但这些包的其他部分是否缺了原生组件，无法由此判断。Plannotator 因为没有 UI 而不提供工具，这次测试也就无法说明跳过安装脚本会怎样影响它的行为。

### 状态文件不全在 agent 目录里

只改 `PI_CODING_AGENT_DIR`，有些状态文件仍会留在别处。Context-mode 写了 `~/.context-mode/projects/<hash>/context.db`。Pi-lens 写了 `~/.pi-lens/`，第一次诊断时还把 `marksman` 和 `typos-lsp` 下载到它的 `bin/` 目录。第一次用了 41.2 秒；二进制文件已经在时，同一个调用测试在 E2 用了 11.3 秒，在 E1 用了 11.8 秒。

Background-tasks 在仓库的 `.pi/tasks/` 留下了输出和元数据。Tintinweb 的子 agent 在 agent 目录里保存了会话，父会话带了 `--no-session` 也一样。Hermes-memory 在同一个 agent 目录里写了 `MEMORY.md` 和 SQLite 文件，多次运行共用这个目录就会沿用保存的记忆。

### 钥匙串测试没有复现 9 月的卡死

9 月 4 日曾发生过一次与 systemd 运行环境有关的卡死，记录见[当时的事故](/zh/blog/orbi-on-pi-coding-agent/#两次事故)和[生产环境那篇](/zh/blog/pi-extensions-in-production/#一次-d-bus-卡死-让-orbi-不再信任-pi-的默认加载)。

没有配置 MCP 服务器时，`pi-mcp-adapter@7.0.1` 无论启动还是调用 `mcp`，都没有访问永不应答的 Secret Service。我没测 OAuth 或 bearer token 存储。

我的自写扩展在加载时通过 `@napi-rs/keyring` 读取钥匙串，3 次运行中 3 次都被黑洞记录到了。首次模型请求在 3.2 秒发出，对照组是 1.2 秒。两者都包含相同的 1 秒总线启动时间，首次请求时间相差约 2 秒，之后 Pi 继续运行，没有卡死。我没查明是哪一层在约 2 秒后放弃等待；`busctl` 对同一个黑洞设置了 5 秒超时，就等满了 5 秒。

除自写测试扩展外，20 个扩展里唯一记录到的 Secret Service 调用来自 pi-lens，发生在总线启动后的 2.3 秒，当时它正在做第一次诊断和下载二进制文件。它的首次模型请求早在 1.3 秒时就已发出（E1 对照组是 1.2 秒），因此这次调用不可能拖慢启动。自写扩展在加载时访问钥匙串，会挡在首次模型请求之前；pi-lens 在工具调用期间访问，首次请求已经发出。那次运行同时还在下载这两个二进制文件，所以我没有单独测出这次调用本身的耗时。二进制文件已经在时，E1 里同一个调用测试用了 11.8 秒，黑洞没有记录到调用。

这套测试能检测 Secret Service 访问，这次没有复现之前的卡死；上面的 3 次验证用的是我的自写钥匙串扩展。将下方黑洞服务的代码原样保存为 `blackhole.py`，需要 dbus-python 和 PyGObject。如果总线上已有服务占用了 `org.freedesktop.secrets`，脚本会以 1 退出，因为正常钥匙串替它应答会让所有测试看起来都没问题：

```python
#!/usr/bin/env python3
"""A Secret Service that never answers: owns org.freedesktop.secrets on the
current session bus, logs every method call addressed to it, and never replies.
Usage: blackhole.py <logfile>"""
import sys, time
import dbus, dbus.bus, dbus.lowlevel, dbus.mainloop.glib
from gi.repository import GLib

dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
NAME = "org.freedesktop.secrets"
if bus.request_name(NAME, dbus.bus.NAME_FLAG_DO_NOT_QUEUE) != dbus.bus.REQUEST_NAME_REPLY_PRIMARY_OWNER:
    sys.exit(f"{NAME} is already owned on this bus: a real keyring is running, nothing would be tested")
me = bus.get_unique_name()
log = open(sys.argv[1], "a", buffering=1)
log.write(f"{time.time():.3f} ready {NAME} as {me}\n")


def on_message(_conn, msg):
    if msg.get_type() == 1 and msg.get_destination() in (NAME, me):
        log.write(f"{time.time():.3f} call {msg.get_interface()}.{msg.get_member()} {msg.get_path()} from {msg.get_sender()}\n")
        return dbus.lowlevel.HANDLER_RESULT_HANDLED  # swallow: no reply ever
    return dbus.lowlevel.HANDLER_RESULT_NOT_YET_HANDLED


bus.add_message_filter(on_message)
GLib.MainLoop().run()
```

下方的测试脚本会清空环境变量，默认不传入总线。设置 `KEEP_BUS=1` 才会把当前会话总线传给 Pi；把黑洞和测试脚本一起放进私有总线里启动：

```bash
dbus-run-session -- bash -c 'rm -f calls.log; python3 blackhole.py calls.log & for i in $(seq 50); do grep -q " ready " calls.log 2>/dev/null && break; sleep 0.1; done; grep -q " ready " calls.log || exit 1; KEEP_BUS=1 ./try-pi-extension.sh npm:<pkg>@<version>'
```

`calls.log` 中每条带 `call` 的行，都是一次没有得到应答的 Secret Service 请求。用我的钥匙串测试扩展运行时，日志记录了一次 `org.freedesktop.Secret.Service.OpenSession` 调用；同一条命令去掉 `KEEP_BUS=1` 后没有记录到调用，因为 Pi 看不到总线。

## 在 Orbi 里固定选中的扩展版本

用 Orbi 运行 Pi 时，在 `orbi.toml` 里写：

```toml
[[pi_extensions]]
source = "npm:pi-web-access@0.47.0"

[[pi_extensions]]
source = "npm:@tintinweb/pi-subagents@0.23.1"

[[pi_extensions]]
source = "npm:@juicesharp/rpiv-todo@2.15.0"

[[pi_extensions]]
source = "npm:cc-safety-net@2.7.3"
```

Orbi 的 `origin/main f5de8082` 中，`src/orbi/config.py` 的校验器接受了这些来源。它拒绝了 `npm:pi-web-access`、`npm:pi-web-access@latest` 和 `npm:@tintinweb/pi-subagents`，报错为 "npm source must pin a version"。

Pi 1.5.0 [更新日志](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)的 1.5.0 一节提到，`-e npm:` 指定的包如果没有固定版本，npm 包仓库里出现更新的匹配版本时会重新安装。[生产环境那篇的加载一节](/zh/blog/pi-extensions-in-production/#orbi-用-no-extensions-加白名单加载-pi-扩展)解释了 Orbi 怎样把配置中的扩展传给 Pi。

## 留下一个扩展之前，自己跑一次

把下面代码原样保存为 `try-pi-extension.sh`，再执行 `chmod +x try-pi-extension.sh`。PATH 中需要有 Pi、Node、npm、jq、setsid 和 timeout，运行前还要导出模型服务商的 key。脚本默认读取 `DEEPSEEK_API_KEY`，provider 为 `deepseek`，模型为 `deepseek-flash`。可以用 `KEYVAR` 选择其他 key 变量，通过可选参数传入 provider 和模型。请保存成脚本运行，不要直接粘贴到交互式 shell 里。

```bash
#!/usr/bin/env bash
# try-pi-extension.sh <source> [provider] [model]
# Starts Pi once the way a service would: no terminal, no desktop session bus,
# stdin closed, a throwaway HOME, only this one extension. Exits non-zero if
# Pi fails, times out, or never builds a system prompt.
set -euo pipefail
src=${1:?usage: try-pi-extension.sh npm:<package>@<version> [provider] [model]}
[ -e "$src" ] && src=$(realpath "$src")  # local file: Pi runs from another directory
provider=${2:-deepseek}
model=${3:-deepseek-flash}
keyvar=${KEYVAR:-DEEPSEEK_API_KEY}
key=${!keyvar:?export $keyvar first}
bus=()  # KEEP_BUS=1 passes the current session bus through (to test with blackhole.py)
if [ "${KEEP_BUS:-0}" = 1 ]; then
  bus=("DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:?KEEP_BUS=1 needs a session bus}")
fi
work=$(mktemp -d)
mkdir -p "$work/agent" "$work/repo"
start=$(date +%s)
set +e
(cd "$work/repo" && env -i HOME="$work" PATH="$PATH" PI_CODING_AGENT_DIR="$work/agent" "$keyvar=$key" "${bus[@]}" \
  setsid -w timeout "${TIMEOUT:-120}" pi -p --mode json --no-session \
  --provider "$provider" --model "$model" -ne -e "$src" \
  "Reply with the single word OK." < /dev/null > "$work/out.jsonl" 2> "$work/err")
rc=$?
set -e
echo "exit=$rc seconds=$(( $(date +%s) - start )) workdir=$work"
tools=$(jq -r 'select(.type=="message_start" and .message.role=="system")
  | .message.toolsAdded[]?.name' "$work/out.jsonl" 2>/dev/null | sort -u || true)
# Pi 1.5.0 skips an npm or git extension that fails to install and still exits 0.
if [ "$rc" -eq 0 ] && grep -qE 'Extension package ".*": failed to install' "$work/err"; then
  rc=3
fi
# In --mode json, a failed model request (bad key, provider down) also exits 0.
stop=$(jq -rs '[.[] | select(.type=="message_end" and .message.role=="assistant")]
  | last | .message.stopReason // "none"' "$work/out.jsonl" 2>/dev/null || echo none)
if [ "$rc" -eq 0 ] && { [ "$stop" = error ] || [ "$stop" = aborted ] || [ "$stop" = none ]; }; then
  rc=4
  jq -rs '[.[] | select(.type=="message_end" and .message.role=="assistant")]
    | last | .message.errorMessage // empty' "$work/out.jsonl" 2>/dev/null >> "$work/err" || true
fi
if [ "$rc" -ne 0 ] || [ -z "$tools" ]; then
  echo "FAILED (exit $rc: 124 timeout, 3 extension skipped, 4 model request failed); last lines of stderr:"
  tail -n 20 "$work/err"
  exit 1
fi
echo "tools the model was given:"
echo "$tools"
echo "files left behind, outside the extension's own install:"
(cd "$work" && find . -type f -not -path './agent/tmp/*' -not -path './.npm/*' \
  -not -name out.jsonl -not -name err | sort)
```

例如，导出 `DEEPSEEK_API_KEY` 后：

```text
$ ./try-pi-extension.sh npm:pi-web-access@0.47.0
exit=0 seconds=3 workdir=/tmp/tmp.9hlvXJ1bBX
tools the model was given:
bash
edit
fetch_content
get_search_content
read
source_check
web_search
write
files left behind, outside the extension's own install:
./agent/auth.json
./agent/models-store.json
```

我用最终版脚本跑过下面这些失败情况。`bad.ts` 是一个三行扩展，Pi 加载它时就抛异常：

```ts
export default function () {
  throw new Error("boom at load");
}
```

```text
$ DEEPSEEK_API_KEY=sk-invalid ./try-pi-extension.sh npm:@juicesharp/rpiv-todo@2.15.0
exit=0 seconds=1 workdir=/tmp/tmp.rRQOCMjdmz
FAILED (exit 4: 124 timeout, 3 extension skipped, 4 model request failed); last lines of stderr:
401: {"message":"Authentication Fails, Your api key: ****alid is invalid (...)","type":"authentication_error","param":null,"code":"invalid_request_error"}

$ ./try-pi-extension.sh npm:no-such-pi-extension-xyz@1.0.0
exit=0 seconds=1 workdir=/tmp/tmp.pRpGIwtQ0o
FAILED (exit 3: 124 timeout, 3 extension skipped, 4 model request failed); last lines of stderr:
Warning: Extension package "npm:no-such-pi-extension-xyz@1.0.0": failed to install (npm install no-such-pi-extension-xyz@1.0.0 --prefix /tmp/tmp.pRpGIwtQ0o/agent/tmp/extensions/npm/f35b2129 --legacy-peer-deps --no-audit --no-fund failed with code 1). Check the source and try again.

$ ./try-pi-extension.sh ./bad.ts
exit=1 seconds=0 workdir=/tmp/tmp.9PqJAU0PEu
FAILED (exit 1: 124 timeout, 3 extension skipped, 4 model request failed); last lines of stderr:
Error: Failed to load extension "/var/tmp/pex/bad.ts": Failed to load extension: boom at load
Hint: Start without extensions using "pi -ne".

$ TIMEOUT=2 ./try-pi-extension.sh npm:pi-lens@4.4.8
exit=124 seconds=2 workdir=/tmp/tmp.MZuYKgOPSZ
FAILED (exit 124: 124 timeout, 3 extension skipped, 4 model request failed); last lines of stderr:
```

脚本列出的是模型拿到的全部工具，包含 Pi 内置的四个工具；上面的表格只列新增工具。第一行的 `exit=` 是执行 Pi 命令时得到的退出状态，其中 124 来自外层的 `timeout`；`FAILED (exit` 后的数字是脚本检查后的分类，括号里的说明每次都一样，列出各分类的含义。Pi 1.5.0 在 `--mode json` 下，遇到错误 key 或不存在的包都以 0 退出，因此脚本还要自己检查最后一条 assistant 消息和安装警告。上面每种失败都会让脚本以 1 退出；缺少参数或 key 也一样，在 Pi 启动前就退出。`./bad.ts` 这样的本地路径会先转成绝对路径，因为脚本会换到临时目录里运行 Pi。

加载检查通过后，还要实际调用一次工具。提问扩展就能通过这个脚本，模型拿到的却只有对照组那四个工具。

## 相关

[Pi 专题页](/zh/guides/pi-coding-agent/)收录了整个系列。[Pi 扩展在生产环境里怎么用](/zh/blog/pi-extensions-in-production/)讲隔离和自写扩展；[Orbi 跑 Pi](/zh/blog/orbi-on-pi-coding-agent/)跟着 runner 看运行过程和事故记录。也可以浏览 [Pi 扩展目录](https://pi.dev/packages)，查看 [Orbi 与 Claude Code 对比](/zh/compare/claude-code/?ref=blog-pi-ext)或 [Orbi Cloud](/zh/cloud/?ref=blog-pi-ext)。Orbi 源码在 [orbi-build/orbi](https://github.com/orbi-build/orbi)。
