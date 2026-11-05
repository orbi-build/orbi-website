---
title: Best Pi extensions for unattended runs: 15 tested
date: 2026-11-05
summary: I tested 15 popular Pi extensions with no terminal, no session bus and a keyring that never answers: which work, which go quiet, which change your config.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-best-pi-extensions-card.png
series: pi
---

Pi extensions can load successfully and still leave an unattended run without the tool you installed them for. I tested 15 popular packages on 5 November 2026, starting Pi without a terminal or desktop session bus, then repeating with a Secret Service that never answers. The asking-user and plan-review tools disappeared; a permission extension rejected even `ls -la`; an MCP adapter changed settings that affected the next session.

I'm Larry 🍀 Orbi, the creator of Orbi. For Pi running in CI or a systemd service, I want to know what reaches the model and what persists afterward. These are dated results for the versions below. Versions move fast.

An extension is code Pi loads that can register tools; a skill is a `SKILL.md` of instructions. The [production post's first section](/blog/pi-extensions-in-production/#what-pi-extensions-are-and-the-three-ways-pi-loads-them) covers that distinction and extension loading.

## How I tested Pi extensions

I used Pi 1.5.0, Node v22.23.1, `/usr/bin/npm` 12.0.2 and Linux 6.18. DeepSeek's `deepseek-flash` ran through a local logging proxy that recorded the tools sent to the model.

E2 (no session bus) used `env -i`, `setsid -w`, stdin from `/dev/null`, a fresh HOME and agent directory, `-ne -e npm:<pkg>@<version>` and `timeout 120`. The extension flags limit loading to the explicit package. The model-provider key was present; no separate search-provider key was supplied. The load prompt was "Reply with the single word OK." Each extension then got a use probe. Use probes started from copies of the installed E2 HOME.

E1 (a private bus with an unresponsive Secret Service) used `org.freedesktop.secrets` owned by the logging black hole below. It started from a copy of the corresponding E2 HOME. E1 timings include a second of bus startup.

The no-extension control exposed exactly `read,bash,edit,write`. A `busctl` call to the black hole timed out after 5 s; a homemade extension reading the keyring at load reached it in 3 of 3 runs.

## Results by job

Downloads are npm's last-month package totals, queried on 5 November 2026. Tools below are additions to the control tools. "None observed" excludes Pi's common `auth.json` and `models-store.json`, npm caches and the package installation. Verdicts cover these load and use probes.

| Extension@version | Job | License | Downloads last month | Added tools in `pi -p` | Use probe | Extra files outside install | Unattended verdict |
|---|---|---|---|---|---|---|---|
| `pi-mcp-adapter@7.0.1` | MCP | MIT | 1,408,674 | `mcp` | Listed no servers | Agent `settings.json`, `mcp-onboarding.json` | Works; rewrites settings |
| `pi-mcp-extension@1.13.0` | MCP | MIT | 823,848 | `mcp_status`, `mcp_connect`, `mcp_list_resources`, `mcp_read_resource` | Status returned `[]` | None observed | Status works; no server configured |
| `pi-web-access@0.47.0` | Web search | MIT | 1,116,299 | `web_search`, `source_check`, `fetch_content`, `get_search_content` | Search returned Pi catalog | None observed | Search worked without search key |
| `pi-web-search@1.7.0` | Web search | MIT | 75,116 | `web_search` | Search returned a result | None observed | Worked with selected model |
| `pi-subagents@0.84.0` | Subagents | MIT | 726,352 | `subagent`, `contact_supervisor`, `bg_wait`, `subagent_supervisor` | `PONG` after name retry | Agent `missions/` JSON | Worked after retry |
| `@tintinweb/pi-subagents@0.23.1` | Subagents | MIT | 47,391 | `Agent`, `SubagentWorkflow`, `get_subagent_result`, `steer_subagent` | Returned `PONG` | Agent `sessions/` JSONL | Worked; persisted child session |
| `@juicesharp/rpiv-ask-user-question@2.15.0` | Ask user | MIT | 151,853 | None | Model said `NO-TOOL` | None observed | Inactive without UI |
| `@plannotator/pi-extension@0.28.49` | Plan review | MIT OR Apache-2.0 | 89,716 | None | Model said `NO-TOOL` | None observed | Inactive without UI |
| `@juicesharp/rpiv-todo@2.15.0` | Tasks | MIT | 87,414 | `todo` | Added/listed "write tests" | None observed | Worked |
| `pi-background-tasks@2.6.10` | Tasks | ISC | 18,054 | `fusion_reason`, `fusion_investigate`, `fusion_research`, `fusion_validate`, `bg_delegate`, `bg_result`, `bg_run`, `bg_run_pi_attested`, `bg_status`, `bg_logs`, `bg_kill` | Returned `hi-from-bg` | Repository `.pi/tasks/` | Worked; leaves output |
| `@gotgenes/pi-permission-system@42.0.0` | Safety | MIT | 46,073 | None | Bash approval rejected | Agent permission-review log | Needs configuration |
| `cc-safety-net@2.7.3` | Safety | MIT | 114,610 | None | Blocked `git reset --hard` | `~/.cc-safety-net/logs/` | Guard worked |
| `context-mode@2.1.0` | Context | Elastic-2.0 | 103,931 | `ctx_execute`, `ctx_batch`, `ctx_index`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_upgrade`, `ctx_purge` | Returned `hi-from-ctx` | `~/.context-mode/projects/<hash>/context.db` | Worked; retains database |
| `pi-lens@4.4.8` | Code feedback | MIT | 86,632 | `lens_diagnostics`, `symbol_search`, `effective_config`, `project_report`, `module_report`, `read_symbol`, `read_enclosing`, `pi_lens_activate_tools` | README diagnostics clean | `~/.pi-lens/`, downloaded binaries | Worked; first call downloaded tools |
| `pi-hermes-memory@0.10.0` | Memory | MIT | 25,570 | `memory_add`, `memory_replace`, `memory_remove`, `skill_manage`, `session_search`, `memory_search` | Saved test colour | Agent `MEMORY.md`, SQLite files | Worked; retains memory |

`context-mode` uses Elastic-2.0, a source-available license outside OSI open source.

## The adapter changes the next session's MCP settings

`pi-mcp-adapter@7.0.1` wrote this on its first load, even through a one-off `-e`:

```json
{"extensions":["-builtin:mcp"]}
```

It also wrote `mcp-onboarding.json`. Pi's `docs/mcp.md`, line 268, describes an extension replacing built-in MCP and documents this setting for disabling it.

I gave a fresh agent directory an `mcp.json` pointing to `server-everything`: Pi exposed `codemode` and wrote `mcp.log`. With the same MCP configuration in the directory left by the adapter, a later session without the adapter exposed neither `codemode` nor `mcp.log`. Those follow-up sessions omitted `-ne` so built-in MCP could load.

For a service, use a separate writable agent directory per session, or rewrite `settings.json` each run.

## A misspelled package can exit successfully

Pi 1.5.0 prints `Warning: Extension package "...": failed to install (...)` and carries on with exit code 0. Pi 1.2.0 exited 1 for the same nonexistent package. The [Pi changelog](https://github.com/earendil-works/pi/blob/main/CHANGELOG.md) records the change in the 1.5.0 section, with [PR #11304](https://github.com/earendil-works/pi/pull/11304).

A typo can therefore leave an unattended run without the intended extension. The script below checks that warning. An extension that throws during loading still made Pi 1.5.0 exit 1.

## Asking the user and reviewing plans need a UI

`rpiv-ask-user-question`'s `reconcile.ts` strips `ask_user_question` when `!ctx.hasUI`. Plannotator's `index.ts` deactivates its tool under the same condition. Both loaded safely here, but neither offered its tool in `pi -p`. Asked to use them, the model answered `NO-TOOL`.

## Permission defaults can stop ordinary work

With no configuration, `pi-permission-system@42.0.0` rejected every attempted bash call, including `ls -la`:

> This 'bash' call requires approval, but no interactive UI is available.

That fails closed. An unattended session needs a configuration permitting its intended work. The no-extension control executed the requested create-and-remove command.

`cc-safety-net@2.7.3` added no tools and blocked `git reset --hard` with `BLOCKED by CC Safety Net` and rule `git.reset-hard`. The control executed it with exit 0 in the disposable repository. The extension wrote logs under `~/.cc-safety-net/`.

## npm skipped install scripts

npm 12 blocked install scripts by default in this environment:

```text
npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:
```

The affected dependencies were Plannotator's `node-pty`, permission-system's `tree-sitter-bash` and pi-lens's `@ast-grep/cli` postinstall. The permission and lens probes still ran as described. Plannotator's tool was absent without a UI, so that probe says nothing about its behavior with those scripts skipped.

## State extends beyond the agent directory

Changing `PI_CODING_AGENT_DIR` alone leaves some state elsewhere. Context-mode wrote `~/.context-mode/projects/<hash>/context.db`. Pi-lens wrote `~/.pi-lens/` and downloaded `marksman` and `typos-lsp` into its `bin/` directory on first diagnostics. That run took about 41 s total; a repeat with binaries present took about 11 s.

Background-tasks left output and metadata in the repository's `.pi/tasks/`. Tintinweb's subagent saved a session under the agent directory despite the parent's `--no-session`. Hermes-memory wrote `MEMORY.md` and SQLite files there; sharing that directory carries saved memory between runs.

## The keyring test did not reproduce the September hang

For the systemd background, see [the 4 September incident](/blog/orbi-on-pi-coding-agent/#two-incidents-that-shaped-how-we-run-pi) and [the production post](/blog/pi-extensions-in-production/#the-d-bus-hang-that-made-orbi-stop-trusting-pi-s-default-extension-loading).

With no MCP servers configured, `pi-mcp-adapter@7.0.1` made zero calls to the never-answering Secret Service at startup or during its `mcp` call. I did not exercise OAuth or bearer-token storage.

My homemade extension read `@napi-rs/keyring` at load. The black hole saw it in 3 of 3 runs. First model requests arrived at 3.2 s, against 1.2 s for the control. Both timings include the same second of bus startup; the probe added about 2 s, then execution continued. It did not hang.

Across the 15 extensions, the only recorded Secret Service call came from pi-lens during its first diagnostics and binary download. It caused no measurable delay; a repeat recorded none. The repeat used an earlier black-hole implementation, so I use its call count only, without attributing its timing to a never-answering service.

This setup detects Secret Service access. It did not reproduce the earlier hang. Save this verbatim as `blackhole.py`; it needs dbus-python and PyGObject:

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

The reader script below clears the environment, so it drops the bus by default. Set `KEEP_BUS=1` to pass the current session bus through, then start both inside a private bus:

```bash
dbus-run-session -- bash -c 'python3 blackhole.py calls.log & sleep 1; KEEP_BUS=1 ./try-pi-extension.sh npm:<pkg>@<version>'
```

Any line with `call` in `calls.log` is a Secret Service request that never got an answer. With my keyring probe, that run logged one `org.freedesktop.Secret.Service.OpenSession` call; the same command without `KEEP_BUS=1` logged none, because Pi never saw the bus.

## Test a package before keeping it

Save this verbatim as `try-pi-extension.sh`, then `chmod +x try-pi-extension.sh`. Have Pi, Node, npm, jq, setsid and timeout on PATH, and export your provider key. It defaults to `DEEPSEEK_API_KEY`, provider `deepseek` and model `deepseek-flash`; `KEYVAR` selects another key variable, with provider and model as optional arguments. Run it as a script, not pasted into an interactive shell.

```bash
#!/usr/bin/env bash
# try-pi-extension.sh <source> [provider] [model]
# Starts Pi once the way a service would: no terminal, no desktop session bus,
# stdin closed, a throwaway HOME, only this one extension. Exits non-zero if
# Pi fails, times out, or never builds a system prompt.
set -euo pipefail
src=${1:?usage: try-pi-extension.sh npm:<package>@<version> [provider] [model]}
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
if [ "$rc" -ne 0 ] || [ -z "$tools" ]; then
  echo "FAILED (exit $rc: 124 is the timeout, 3 an extension Pi skipped); last lines of stderr:"
  tail -n 20 "$work/err"
  exit 1
fi
echo "tools the model was given:"
echo "$tools"
echo "files left behind, outside the extension's own install:"
(cd "$work" && find . -type f -not -path './agent/tmp/*' -not -path './.npm/*' \
  -not -name out.jsonl -not -name err | sort)
```

For example, after exporting `DEEPSEEK_API_KEY`:

```bash
./try-pi-extension.sh npm:pi-web-access@0.47.0
```

The recorded working web-access run printed `exit=0 seconds=3`, its tools including `web_search`, and the remaining files. A later run with the current tool-list extraction printed:

```text
$ ./try-pi-extension.sh npm:pi-subagents@0.84.0
exit=0 seconds=3 workdir=/tmp/tmp.HXjsACOxYj
tools the model was given:
bash
bg_wait
contact_supervisor
edit
read
subagent
subagent_supervisor
write
files left behind, outside the extension's own install:
./agent/auth.json
./agent/models-store.json
[script exit 0]
```

These are excerpts from the final failure-path checks:

```text
$ ./try-pi-extension.sh npm:no-such-pi-extension-xyz@1.0.0
exit=0 seconds=2 workdir=/tmp/tmp.O1e5jVJOF8
FAILED (exit 3: 124 is the timeout, 3 an extension Pi skipped); last lines of stderr:
Warning: Extension package "npm:no-such-pi-extension-xyz@1.0.0": failed to install (npm install no-such-pi-extension-xyz@1.0.0 --prefix /tmp/tmp.O1e5jVJOF8/agent/tmp/extensions/npm/f35b2129 --legacy-peer-deps --no-audit --no-fund failed with code 1). Check the source and try again.
[script exit 1]

$ ./try-pi-extension.sh /var/tmp/pex/badext/bad.ts
exit=1 seconds=0 workdir=/tmp/tmp.JMtDC1nvDx
FAILED (exit 1: 124 is the timeout, 3 an extension Pi skipped); last lines of stderr:
Error: Failed to load extension "/var/tmp/pex/badext/bad.ts": Failed to load extension: boom at load
Hint: Start without extensions using "pi -ne".
[script exit 1]

$ TIMEOUT=2 ./try-pi-extension.sh npm:pi-lens@4.4.8
exit=124 seconds=2 workdir=/tmp/tmp.OvP35LCozn
FAILED (exit 124: 124 is the timeout, 3 an extension Pi skipped); last lines of stderr:
[script exit 1]
```

The initial `exit=` is Pi's process status; the `FAILED` line uses the script's adjusted status. Status 3 means Pi skipped an extension, 124 means timeout, and 1 in the throwing-extension check came from Pi. Each failure makes the wrapper exit 1. Missing arguments or a missing provider key also exit 1 before launching Pi. An empty tool list fails the wrapper even if Pi exited 0.

A successful load check still needs a use probe: the asking-user package passed this script with only the control tools.

## Which are the best Pi extensions for unattended use?

For MCP, the best Pi extensions I'd consider for unattended use are `pi-mcp-extension` to avoid settings side effects, or the adapter with an agent directory rewritten per run. The MCP probes covered status without a configured server.

For web search, `pi-web-access` worked without a search key and reported "Provider: exa". `pi-web-search` also worked; its README says it searches through the currently selected model.

Both subagent packages returned `PONG`. Pi-subagents needed a retry after the model guessed an agent name. I'd keep `rpiv-todo` for task lists, `cc-safety-net` as a command guard, and permission-system only with an explicit configuration.

I did not test OAuth MCP servers, paid search keys or long runs. These results cover Linux, with no Windows or macOS tests.

## Pin the extensions you keep in Orbi

In `orbi.toml`:

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

Orbi's validator at `origin/main f5de8082`, `src/orbi/config.py`, accepted these sources. It rejected `npm:pi-web-access`, `npm:pi-web-access@latest` and `npm:@tintinweb/pi-subagents` with "npm source must pin a version".

Pi 1.5.0's changelog, line 61, says an unpinned `-e npm:` package is reinstalled when the registry has a newer matching version. That is another reason to pin. The [production post's loading section](/blog/pi-extensions-in-production/#how-orbi-loads-pi-extensions-no-extensions-plus-a-pinned-allowlist) explains how Orbi passes the configured extensions to Pi.

## Related

The [Pi hub](/guides/pi-coding-agent/) collects the series. [Pi extensions in production](/blog/pi-extensions-in-production/) covers isolation and writing extensions; [Orbi on Pi](/blog/orbi-on-pi-coding-agent/) follows the runner and its incidents. Browse the [Pi package catalog](https://pi.dev/packages), compare [Orbi and Claude Code](/compare/claude-code/?ref=blog-pi-ext), or read about [Orbi Cloud](/cloud/?ref=blog-pi-ext). Orbi's source is [orbi-build/orbi](https://github.com/orbi-build/orbi).
