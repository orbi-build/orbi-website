---
title: Pi 扩展推荐：15 个扩展的无人值守实测
date: 2026-11-05
summary: 实测 15 个热门 Pi 扩展：没有终端和桌面总线，再接入永不应答的钥匙串，看看哪些能用、哪些没动静、哪些改配置。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-best-pi-extensions-card.png
series: pi
mirror: best-pi-extensions
---

我是 Larry 🍀 Orbi，Orbi 的创始人。2026 年 11 月 5 日，我实测了 15 个热门 Pi 扩展：先在没有终端、没有桌面会话总线的环境里启动 Pi，再接入一个永不应答的 Secret Service（钥匙串服务）重跑。扩展加载成功，模型却未必拿得到工具：提问和计划评审工具消失了，一个权限扩展连 `ls -la` 都拒绝，另一个 MCP 适配器改了配置，影响到了下次会话。

Pi 在 CI 或 systemd 服务里运行时，我关心的是模型到底拿到了哪些工具，以及运行后留下了什么。本文的结论只对应下表的版本和这次测试日期，扩展版本更新很快。

如果你来找 Pi 扩展推荐，想知道无人值守时哪些值得装，按这次测试，我会这样选：MCP 用 `pi-mcp-extension`，或给每次运行新建 agent 目录后用 `pi-mcp-adapter`；网页搜索用 `pi-web-access` 或 `pi-web-search`；两个子 agent 包都能用。任务清单我会选 `rpiv-todo`，命令拦截用 `cc-safety-net`，`pi-permission-system` 则要先写明确的权限配置。其中 MCP 只测了没有配置服务器时的状态查询。下面展开这些选择的依据，并给出可自行测试扩展的脚本。

Pi agent 扩展是 Pi 启动时加载的代码，来源可以是本地文件、npm 包或 git 仓库，多数会注册模型可以调用的工具。本文说的 Pi 插件也指这类扩展。skill 则是一份写在 `SKILL.md` 里的指令。[生产环境那篇的第一节](/zh/blog/pi-extensions-in-production/#pi-扩展是什么-pi-从哪三个地方加载它)介绍了两者的区别和扩展加载方式。

## 这次 Pi 扩展怎么测

环境是 Pi 1.5.0、Node v22.23.1、`/usr/bin/npm` 12.0.2 和 Linux 6.18。模型用 DeepSeek 的 `deepseek-flash`，请求经过一个本地日志代理，记录发给模型的工具清单。

E2 是没有会话总线的环境：用 `env -i` 清空环境变量，`setsid -w` 脱离终端，stdin 接 `/dev/null`，HOME 和 agent 目录都是新建的；扩展参数为 `-ne -e npm:<pkg>@<version>`，外面套 `timeout 120`。这组扩展参数只加载显式指定的包。环境里有模型服务商的 key，没有额外提供搜索服务商的 key。加载测试的 prompt 是 "Reply with the single word OK."。之后再要求每个扩展实际完成一次操作；这些调用测试都从已装好扩展的 E2 HOME 副本开始。

E1 则多了一条私有会话总线，由下方的黑洞脚本占用 `org.freedesktop.secrets`：它记录请求，但永不应答。E1 从对应的 E2 HOME 副本开始，计时包含 1 秒的总线启动时间。

不加载扩展的对照组恰好只有 `read,bash,edit,write` 四个工具。用 `busctl` 调用黑洞，5 秒后超时；另一个自写扩展在加载时读取钥匙串，3 次运行中 3 次都访问到了黑洞。

## 按用途看 15 个扩展的结果

表格按用途分组，下载量一列是 2026 年 11 月 5 日查询的 npm 上月包下载总量，推荐依据是这次调用结果。表里的工具都是相对对照组新增的工具。文件变化只比较临时 HOME 和测试仓库，不包含 `/tmp` 或系统目录。「未观察到」不计 Pi 通常会写的 `auth.json`、`models-store.json`、npm 缓存和包的安装文件。每行结论只对应「调用测试」列的操作；钥匙串访问和计时结果在后面的专节说明。

| 扩展@版本 | 用途 | 许可证 | 上月下载量 | `pi -p` 新增工具 | 调用测试 | HOME 或仓库中的额外文件 | 无人值守结论 |
|---|---|---|---|---|---|---|---|
| `pi-mcp-adapter@7.0.1` | MCP | MIT | 1,408,674 | `mcp` | 列出的服务器为空 | agent 目录中的 `settings.json`、`mcp-onboarding.json` | 空服务器列表查询完成；会改写设置 |
| `pi-mcp-extension@1.13.0` | MCP | MIT | 823,848 | `mcp_status`, `mcp_connect`, `mcp_list_resources`, `mcp_read_resource` | 状态返回 `[]` | 未观察到 | 状态查询能用；未配置服务器 |
| `pi-web-access@0.47.0` | 网页搜索 | MIT | 1,116,299 | `web_search`, `source_check`, `fetch_content`, `get_search_content` | 搜索返回 Pi 扩展目录 | 未观察到 | 没有搜索 key 也搜到了结果 |
| `pi-web-search@1.7.0` | 网页搜索 | MIT | 75,116 | `web_search` | 搜索返回结果 | 未观察到 | 用当前选定的模型能搜到结果 |
| `pi-subagents@0.84.0` | 子 agent | MIT | 726,352 | `subagent`, `contact_supervisor`, `bg_wait`, `subagent_supervisor` | 模型猜错 agent 名称，重试后返回 `PONG` | agent 目录中 `missions/` 下的 JSON | 名称修正后能用 |
| `@tintinweb/pi-subagents@0.23.1` | 子 agent | MIT | 47,391 | `Agent`, `SubagentWorkflow`, `get_subagent_result`, `steer_subagent` | 返回 `PONG` | agent 目录中 `sessions/` 下的 JSONL | 能用；会保存子会话 |
| `@juicesharp/rpiv-ask-user-question@2.15.0` | 向用户提问 | MIT | 151,853 | 无 | 模型回答 `NO-TOOL` | 未观察到 | 没有 UI 时不启用 |
| `@plannotator/pi-extension@0.28.49` | 计划评审 | MIT OR Apache-2.0 | 89,716 | 无 | 模型回答 `NO-TOOL` | 未观察到 | 没有 UI 时不启用 |
| `@juicesharp/rpiv-todo@2.15.0` | 任务管理 | MIT | 87,414 | `todo` | 添加并列出 "write tests" | 未观察到 | 能用 |
| `pi-background-tasks@2.6.10` | 任务管理 | ISC | 18,054 | `fusion_reason`, `fusion_investigate`, `fusion_research`, `fusion_validate`, `bg_delegate`, `bg_result`, `bg_run`, `bg_run_pi_attested`, `bg_status`, `bg_logs`, `bg_kill` | 返回 `hi-from-bg` | 仓库中的 `.pi/tasks/` | 能用；会留下输出 |
| `@gotgenes/pi-permission-system@42.0.0` | 安全 | MIT | 46,073 | 无 | Bash 审批被拒绝 | agent 目录中的权限审查日志 | 需要配置 |
| `cc-safety-net@2.7.3` | 安全 | MIT | 114,610 | 无 | 拦下 `git reset --hard` | `~/.cc-safety-net/logs/` | 命令拦截生效 |
| `context-mode@2.1.0` | 上下文 | Elastic-2.0 | 103,931 | `ctx_execute`, `ctx_batch`, `ctx_index`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_upgrade`, `ctx_purge` | 返回 `hi-from-ctx` | `~/.context-mode/projects/<hash>/context.db` | 能用；会保留数据库 |
| `pi-lens@4.4.8` | 代码反馈 | MIT | 86,632 | `lens_diagnostics`, `symbol_search`, `effective_config`, `project_report`, `module_report`, `read_symbol`, `read_enclosing`, `pi_lens_activate_tools` | README 诊断未报问题 | `~/.pi-lens/`、下载的二进制文件 | 能用；首次调用会下载工具 |
| `pi-hermes-memory@0.10.0` | 记忆 | MIT | 25,570 | `memory_add`, `memory_replace`, `memory_remove`, `skill_manage`, `session_search`, `memory_search` | 保存了测试用的颜色 | agent 目录中的 `MEMORY.md`、SQLite 文件 | 能用；会保留记忆 |

`context-mode` 使用的 Elastic-2.0 允许查看源码，但不属于 OSI 认可的开源许可证。

## MCP 适配器改的设置会影响下次会话

`pi-mcp-adapter@7.0.1` 第一次加载就写入了下面这份配置，即使用的只是一次性的 `-e`：

```json
{"extensions":["-builtin:mcp"]}
```

它还写了 `mcp-onboarding.json`。Pi 的 `docs/mcp.md` 第 268 行说明了扩展替代内置 MCP 的情况，并记录了用这项设置禁用内置 MCP 的方法。

我用 `server-everything` 作测试服务器，在一个新 agent 目录里放了指向它的 `mcp.json`，观察 Pi 是否提供 `codemode` 工具、是否写出 `mcp.log`：两者都出现了。把同一份 MCP 配置放进适配器留下的目录，之后不加载适配器再启动会话，`codemode` 和 `mcp.log` 都没有出现。后续这些会话都没带 `-ne`，允许内置 MCP 加载。

服务里可以为每次会话准备独立、可写的 agent 目录，或者每次运行都重写 `settings.json`。

## 包名拼错，Pi 也可能以 0 退出

Pi 1.5.0 会打印 `Warning: Extension package "...": failed to install (...)`，然后继续运行，退出码为 0。同一个不存在的包，Pi 1.2.0 会以 1 退出。[Pi 更新日志](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)的 1.5.0 一节记录了这项变化，对应 [PR #11304](https://github.com/earendil-works/pi/pull/11304)。

这意味着无人值守时，拼错包名可能让运行缺少预期扩展，却不报失败。下方脚本会检查这条警告。扩展在加载时抛异常的情况另算，Pi 1.5.0 仍以 1 退出。

## 提问和计划评审工具需要 UI

`rpiv-ask-user-question` 的 `reconcile.ts` 在 `!ctx.hasUI` 时移除 `ask_user_question`。Plannotator 的 `index.ts` 在同样的条件下停用工具。这次两者都顺利加载，但在 `pi -p` 下都没提供工具；要求模型调用时，它回答 `NO-TOOL`。

## 默认权限配置会拦住普通操作

没写配置时，`pi-permission-system@42.0.0` 拒绝了每一次 bash 调用尝试，连 `ls -la` 也一样：

> This 'bash' call requires approval, but no interactive UI is available.

它在无法获得批准时默认拒绝操作。要无人值守使用它，需要先按任务所需的操作配置权限；这次没写配置，测到的就是拒绝执行。不加载扩展的对照组执行了要求的创建再删除命令。

`cc-safety-net@2.7.3` 没加工具，用 `BLOCKED by CC Safety Net` 和规则 `git.reset-hard` 拦下了 `git reset --hard`。对照组在临时仓库里执行了这条命令，退出码为 0。扩展把日志写到了 `~/.cc-safety-net/`。

## npm 跳过了安装脚本

这套环境中的 npm 12 默认阻止安装脚本：

```text
npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:
```

受影响的依赖包括 Plannotator 的 `node-pty`、permission-system 的 `tree-sitter-bash`，以及 pi-lens 的 `@ast-grep/cli` postinstall。权限扩展的拒绝操作和 lens 的 README 诊断仍得到了前面所述的结果，不能由此推断其他功能是否受影响。Plannotator 因为没有 UI 而不提供工具，所以这次测试无法说明跳过安装脚本会怎样影响它的行为。

## 状态文件不全在 agent 目录里

只改 `PI_CODING_AGENT_DIR`，仍会在别处留下状态。Context-mode 写了 `~/.context-mode/projects/<hash>/context.db`。Pi-lens 写了 `~/.pi-lens/`，第一次诊断时又把 `marksman` 和 `typos-lsp` 下载到它的 `bin/` 目录。那次总共约 41 秒；二进制文件已经在时，重跑约 11 秒。

Background-tasks 在仓库的 `.pi/tasks/` 留下了输出和元数据。Tintinweb 的子 agent 在 agent 目录里保存了会话，即使父会话带了 `--no-session`。Hermes-memory 在那里写了 `MEMORY.md` 和 SQLite 文件；多次运行共用这个目录，就会沿用保存的记忆。

## 钥匙串测试没有复现 9 月的卡死

9 月 4 日曾发生过一次与 systemd 运行环境有关的卡死，记录见[当时的事故](/zh/blog/orbi-on-pi-coding-agent/#两次事故)和[生产环境那篇](/zh/blog/pi-extensions-in-production/#一次-d-bus-卡死-让-orbi-不再信任-pi-的默认加载)。

没有配置 MCP 服务器时，`pi-mcp-adapter@7.0.1` 无论启动还是调用 `mcp`，都没有访问永不应答的 Secret Service。我没测 OAuth 或 bearer token 存储。

我的自写扩展在加载时读取 `@napi-rs/keyring`，3 次运行中 3 次都被黑洞记录到了。首次模型请求出现在 3.2 秒，对照组是 1.2 秒。两者都包含相同的 1 秒总线启动时间；首次请求时间相差约 2 秒，之后继续运行，没有卡死。

15 个扩展里，唯一记录到的 Secret Service 调用来自 pi-lens，发生在第一次诊断和下载二进制文件期间。它的首次模型请求在 1.3 秒发出，对照组是 1.2 秒；但 41 秒总耗时主要花在两次二进制下载上，所以我没有单独测出那次调用本身的耗时。二进制文件已经在时重跑，没有记录到调用；不过那次用的是会返回错误的早期黑洞版本，因此我只采用它的调用次数。

这套装置能检测 Secret Service 访问，这次没有复现之前的卡死。上面的 3 次验证用的是我的自写钥匙串扩展；下面给出记录请求的黑洞服务。代码原样保存为 `blackhole.py`，需要 dbus-python 和 PyGObject：

```python
#!/usr/bin/env python3
"""A Secret Service that never answers: owns org.freedesktop.secrets on the
current session bus, logs every method call addressed to it, and never replies.
Usage: blackhole.py <logfile>"""
import sys, time
import dbus, dbus.lowlevel, dbus.mainloop.glib
from gi.repository import GLib

dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
NAME = "org.freedesktop.secrets"
bus.request_name(NAME)
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
dbus-run-session -- bash -c 'python3 blackhole.py calls.log & sleep 1; KEEP_BUS=1 ./try-pi-extension.sh npm:<pkg>@<version>'
```

`calls.log` 中每条带 `call` 的行，都是一次没有得到应答的 Secret Service 请求。用我的钥匙串测试扩展运行时，日志记录了一次 `org.freedesktop.Secret.Service.OpenSession` 调用；同一条命令去掉 `KEEP_BUS=1` 后没有记录到调用，因为 Pi 看不到总线。

## 留下一个扩展之前，自己跑一次

把下面代码原样保存为 `try-pi-extension.sh`，再执行 `chmod +x try-pi-extension.sh`。PATH 中需要有 Pi、Node、npm、jq、setsid 和 timeout，并且已经导出模型服务商的 key。默认读取 `DEEPSEEK_API_KEY`，provider 为 `deepseek`，模型为 `deepseek-flash`；用 `KEYVAR` 选择其他 key 变量，provider 和模型可通过可选参数传入。保存成脚本运行，不要直接粘贴到交互式 shell 里。

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

下面这些失败情况，我都用最终版脚本跑过。`bad.ts` 是一个三行扩展，Pi 加载它时就抛异常：

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

第一行的 `exit=` 是执行 Pi 命令时得到的退出状态，其中 124 来自外层的 `timeout`；`FAILED` 里是脚本检查后的分类。Pi 1.5.0 在 `--mode json` 下，遇到错误 key 或不存在的包都以 0 退出，因此脚本还要自己检查最后一条 assistant 消息和安装警告。上面每种失败都会让脚本以 1 退出；缺少参数或 key 也一样，在 Pi 启动前就退出。`./bad.ts` 这样的本地路径会先转成绝对路径，因为脚本会换到临时目录里运行 Pi。

加载检查通过后，还要实际调用一次工具：提问扩展能通过这个脚本，但模型拿到的只有对照组那四个工具。

## 无人值守时，哪些 Pi 扩展算「必装」？

我的必装清单按用途选。需要 MCP 时，单看这次测到的设置文件副作用，我会先试 `pi-mcp-extension`；也可以用适配器，但每次运行都准备新的 agent 目录。这里的 MCP 测试只覆盖没有配置服务器时的状态查询。

网页搜索方面，`pi-web-access` 没有搜索 key 也能用，报告的 provider 是 "Provider: exa"。`pi-web-search` 也能用，它的 README 说搜索通过当前选定的模型完成。

两个子 agent 包都返回了 `PONG`。Pi-subagents 那次，模型先猜了一个 agent 名称，重试后才成功。任务清单我会保留 `rpiv-todo`，命令拦截用 `cc-safety-net`，permission-system 只在有明确配置时使用。

我没测 OAuth MCP 服务器、付费搜索 key 或长时间运行。测试环境是 Linux，没有测 Windows 和 macOS。

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

Pi 1.5.0 [更新日志](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md) 1.5.0 一节说，`-e npm:` 指定的包如果没有固定版本，npm 包仓库里出现更新的匹配版本时会重新安装。这也是固定版本的一个理由。[生产环境那篇的加载一节](/zh/blog/pi-extensions-in-production/#orbi-用-no-extensions-加白名单加载-pi-扩展)解释了 Orbi 怎样把配置中的扩展传给 Pi。

## 相关

[Pi 专题页](/zh/guides/pi-coding-agent/)收录了整个系列。[Pi 扩展在生产环境里怎么用](/zh/blog/pi-extensions-in-production/)讲隔离和自写扩展；[Orbi 跑 Pi](/zh/blog/orbi-on-pi-coding-agent/)跟着 runner 看运行过程和事故记录。也可以浏览 [Pi 扩展目录](https://pi.dev/packages)，查看 [Orbi 与 Claude Code 对比](/zh/compare/claude-code/?ref=blog-pi-ext)或 [Orbi Cloud](/zh/cloud/?ref=blog-pi-ext)。Orbi 源码在 [orbi-build/orbi](https://github.com/orbi-build/orbi)。
