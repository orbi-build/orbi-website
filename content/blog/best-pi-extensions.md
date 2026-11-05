---
title: Best Pi extensions for unattended runs: 15 tested
date: 2026-11-05
summary: I ran 15 popular Pi extensions with no terminal or desktop bus, then with a keyring that never answers. Some worked; others lacked tools or changed config.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-best-pi-extensions-card.png
series: pi
mirror: best-pi-extensions
---

Pi extensions can load successfully without giving an unattended run the tools you expected. I tested 15 popular packages on 5 November 2026. I first started Pi without a terminal or desktop session bus, then repeated the tests with a Secret Service that never answers. Two extensions, one for asking the user questions and one for plan review, never offered their tools. A permission extension rejected even `ls -la`, and an MCP adapter changed settings that affected the next session.

I'm Larry 🍀 Orbi, the creator of Orbi. For Pi in CI or a systemd service, I care about which tools reach the model and what the extensions leave behind. Extension versions change quickly, so these results apply to the versions below and the date of the tests.

For unattended runs, I'd use `pi-mcp-extension` for MCP (or `pi-mcp-adapter` with a fresh agent directory per run). For web search, I'd choose `pi-web-access` or `pi-web-search`. Either subagent package worked. I'd keep `rpiv-todo` for task lists and `cc-safety-net` as a command guard, and use `pi-permission-system` only with an explicit configuration. The results below explain those choices. You can test any package yourself with the script later in the post.

Pi coding agent extensions are code that Pi loads at startup from local files, npm packages or git repositories. Most Pi agent extensions register tools the model can call. A skill contains instructions in a `SKILL.md` file. The [production post's first section](/blog/pi-extensions-in-production/#what-pi-extensions-are-and-the-three-ways-pi-loads-them) explains the distinction and how Pi loads extensions.

## How I tested the Pi coding agent extensions

I used Pi 1.5.0, Node v22.23.1, `/usr/bin/npm` 12.0.2 and Linux 6.18. DeepSeek's `deepseek-flash` ran through a local logging proxy that recorded the tools sent to the model.

For E2 (no session bus), I used `env -i`, `setsid -w`, stdin from `/dev/null`, a fresh HOME and a fresh agent directory (Pi's config and state directory, `~/.pi/agent` by default, moved with `PI_CODING_AGENT_DIR`), `-ne -e npm:<pkg>@<version>` and `timeout 120`. These extension flags load only the explicitly named package. I supplied the model-provider key without a separate search-provider key. The load prompt was "Reply with the single word OK." I then asked each extension to perform a task, starting each use probe from a copy of the installed E2 HOME.

For E1, I added a private session bus on which `blackhole.py` (listed further down) owns `org.freedesktop.secrets`, logs every call and never replies. Each E1 run started from a copy of the corresponding E2 HOME. All 15 extensions ran in both; every one got the same tools and the same probe result in E1 as in E2, so the table shows one row each and the Secret Service calls get their own section below. E1 timings include a second of bus startup, and the E1 control (no extension, same bus) took 1.2 s to its first model request.

The no-extension control exposed exactly `read,bash,edit,write`. A `busctl` call to the black hole timed out after 5 s; a homemade extension reading the keyring at load reached it in 3 of 3 runs.

## Results by job

Downloads are npm's last-month package totals, queried on 5 November 2026. The tools listed are additions to the control tools. I compared files in the throwaway HOME and the test repository; `/tmp` and system directories were outside that comparison. "None observed" excludes Pi's common `auth.json` and `models-store.json`, npm caches and the package installation. The verdicts apply to these load and use probes.

| Extension@version | Job | License | Downloads last month | Added tools in `pi -p` | Use probe | Extra files in HOME or repo | Unattended verdict |
|---|---|---|---|---|---|---|---|
| `pi-mcp-adapter@7.0.1` | MCP | MIT | 1,408,674 | `mcp` | Listed no servers | Agent `settings.json`, `mcp-onboarding.json` | Works; rewrites settings |
| `pi-mcp-extension@1.13.0` | MCP | MIT | 823,848 | `mcp_status`, `mcp_connect`, `mcp_list_resources`, `mcp_read_resource` | Status returned `[]` | None observed | Status works; no server configured |
| `pi-web-access@0.47.0` | Web search | MIT | 1,116,299 | `web_search`, `source_check`, `fetch_content`, `get_search_content` | Search returned Pi catalog | None observed | Search worked without search key |
| `pi-web-search@1.7.0` | Web search | MIT | 75,116 | `web_search` | Search returned a result | None observed | Worked with selected model |
| `pi-subagents@0.84.0` | Subagents | MIT | 726,352 | `subagent`, `contact_supervisor`, `bg_wait`, `subagent_supervisor` | `PONG` after name retry | Agent `missions/` JSON | Worked after retry |
| `@tintinweb/pi-subagents@0.23.1` | Subagents | MIT | 47,391 | `Agent`, `SubagentWorkflow`, `get_subagent_result`, `steer_subagent` | Returned `PONG` | Agent `sessions/` JSONL | Worked; persisted child session |
| `@juicesharp/rpiv-ask-user-question@2.15.0` | Ask user | MIT | 151,853 | None (removed without a UI) | Model said `NO-TOOL` | None observed | Inactive without UI |
| `@plannotator/pi-extension@0.28.49` | Plan review | MIT OR Apache-2.0 | 89,716 | None (removed without a UI) | Model said `NO-TOOL` | None observed | Inactive without UI |
| `@juicesharp/rpiv-todo@2.15.0` | Tasks | MIT | 87,414 | `todo` | Added/listed "write tests" | None observed | Worked |
| `pi-background-tasks@2.6.10` | Tasks | ISC | 18,054 | `fusion_reason`, `fusion_investigate`, `fusion_research`, `fusion_validate`, `bg_delegate`, `bg_result`, `bg_run`, `bg_run_pi_attested`, `bg_status`, `bg_logs`, `bg_kill` | Returned `hi-from-bg` | Repository `.pi/tasks/` | Worked; leaves output |
| `@gotgenes/pi-permission-system@42.0.0` | Safety | MIT | 46,073 | None (checks bash calls) | Bash approval rejected | Agent permission-review log | Needs configuration |
| `cc-safety-net@2.7.3` | Safety | MIT | 114,610 | None (checks bash calls) | Blocked `git reset --hard` | `~/.cc-safety-net/logs/` | Guard worked |
| `context-mode@2.1.0` | Context | Elastic-2.0 | 103,931 | `ctx_execute`, `ctx_batch`, `ctx_index`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_upgrade`, `ctx_purge` | Returned `hi-from-ctx` | `~/.context-mode/projects/<hash>/context.db` | Worked; retains database |
| `pi-lens@4.4.8` | Code feedback | MIT | 86,632 | `lens_diagnostics`, `symbol_search`, `effective_config`, `project_report`, `module_report`, `read_symbol`, `read_enclosing`, `pi_lens_activate_tools` | README diagnostics clean | `~/.pi-lens/`, downloaded binaries | Worked; first call downloaded tools |
| `pi-hermes-memory@0.10.0` | Memory | MIT | 25,570 | `memory_add`, `memory_replace`, `memory_remove`, `skill_manage`, `session_search`, `memory_search` | Saved test colour | Agent `MEMORY.md`, SQLite files | Worked; retains memory |

`cc-safety-net` is a guard published for several coding agents; its npm keywords include `claude-code`, `opencode` and `pi-package`, and it loads into Pi as an ordinary extension. `context-mode` uses Elastic-2.0, a source-available license outside OSI open source.

## The adapter changes the next session's MCP settings

`pi-mcp-adapter@7.0.1` wrote this on its first load, even through a one-off `-e`:

```json
{"extensions":["-builtin:mcp"]}
```

It also wrote `mcp-onboarding.json`. Pi's `docs/mcp.md`, line 268, describes an extension replacing built-in MCP and documents this setting for disabling it.

To see the effect, I put this `mcp.json` in a fresh agent directory, pointing at `@modelcontextprotocol/server-everything` (installed locally):

```json
{"mcpServers":{"everything":{"command":"/var/tmp/pex/mcpsrv/node_modules/.bin/mcp-server-everything","args":["stdio"]}}}
```

The `command` path is where I installed the server on the test machine; point it at your own copy.

Started without `-ne`, Pi's built-in MCP connected to it: the model got a `codemode` tool and Pi wrote `mcp.log`. I copied the same `mcp.json` into the agent directory the adapter had used, and started Pi again without `-ne` and without the adapter. No `codemode`, no `mcp.log`: the `-builtin:mcp` line in that directory's `settings.json` kept the built-in MCP off. Leaving out `-ne` does not bring it back. When I emptied the `extensions` list in that `settings.json` and ran again, `codemode` and `mcp.log` were back. These MCP-server runs only tested this side effect. The MCP probes in the table did not connect to any server.

For a service, use a separate writable agent directory per session, or rewrite `settings.json` each run.

## A misspelled package can exit successfully

Pi 1.5.0 prints `Warning: Extension package "...": failed to install (...)` and carries on with exit code 0. I ran the same command with Pi 1.2.0 (`/usr/bin/pi`), and it exited 1. The [Pi changelog](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md) records the change in the 1.5.0 section, with [PR #11304](https://github.com/earendil-works/pi/pull/11304).

A typo can leave an unattended run without the intended extension, so the script below checks for that warning. When an extension threw during loading, Pi 1.5.0 still exited 1.

## Asking the user and reviewing plans need a UI

`rpiv-ask-user-question`'s `reconcile.ts` strips `ask_user_question` when `!ctx.hasUI`. Plannotator's `index.ts` deactivates its tool under the same condition. Both loaded safely in these tests. Neither offered its tool in `pi -p`, and the model answered `NO-TOOL` when asked to use them.

## Permission defaults can stop ordinary work

With no configuration, `pi-permission-system@42.0.0` rejected every attempted bash call, including `ls -la`:

> This 'bash' call requires approval, but no interactive UI is available.

The probe asked for `mkdir -p scratch && rm -rf scratch && echo removed`; without the extension, the control ran it and printed `removed`. With no way to get approval, the extension says no. For unattended use it needs a configuration that allows the work; I did not test one.

`cc-safety-net@2.7.3` added no tools and blocked `git reset --hard` with `BLOCKED by CC Safety Net` and rule `git.reset-hard`. Without the extension, the control ran it in the throwaway repository and it exited 0. The extension wrote logs under `~/.cc-safety-net/`.

## npm skipped install scripts

npm 12 blocked install scripts by default in this environment:

```text
npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:
```

Each install blocked one package, so three installs: Plannotator's `node-pty` and permission-system's `tree-sitter-bash`, along with the postinstall for pi-lens's `@ast-grep/cli`. The permission probe still rejected bash as described, and `lens_diagnostics` reported `clean=1, unavailable=0, failed=0` (and `Primary LSP (marksman): confirmed clean` on a repeat), so the parts I probed ran. I can't tell from this whether anything else in those packages lost a native piece. Plannotator's tool was absent without a UI, so that probe could not show how skipping those scripts affected its behavior.

## State extends beyond the agent directory

Some state stays outside the agent directory even if you change `PI_CODING_AGENT_DIR`. Context-mode wrote `~/.context-mode/projects/<hash>/context.db`. Pi-lens wrote `~/.pi-lens/`; on its first diagnostics call, it downloaded `marksman` and `typos-lsp` into its `bin/` directory. That first run took 41.2 s. With the binaries already present, the same probe took 11.3 s (E2) and 11.8 s (E1).

Background-tasks left output and metadata in the repository's `.pi/tasks/`. Tintinweb's subagent saved a session under the agent directory despite the parent's `--no-session`. Hermes-memory wrote `MEMORY.md` and SQLite files there; sharing that directory carries saved memory between runs.

## The keyring test did not reproduce the September hang

For the systemd background, see [the 4 September incident](/blog/orbi-on-pi-coding-agent/#two-incidents-that-shaped-how-we-run-pi) and [the production post](/blog/pi-extensions-in-production/#the-d-bus-hang-that-made-orbi-stop-trusting-pi-s-default-extension-loading).

With no MCP servers configured, `pi-mcp-adapter@7.0.1` made zero calls to the never-answering Secret Service at startup or during its `mcp` call. I did not exercise OAuth or bearer-token storage.

My homemade extension read the keyring through `@napi-rs/keyring` at load, and the black hole recorded it in 3 of 3 runs. First model requests arrived at 3.2 s, compared with 1.2 s for the control. Both timings include the same second of bus startup. The probe added about 2 s, then Pi carried on; it did not hang. I did not find which layer gives up after about 2 s; `busctl`, with its timeout set to 5 s, waited the full 5 s on the same black hole.

Apart from my probe, the only Secret Service call among the 15 extensions came from pi-lens, 2.3 s after the bus was up, during its first diagnostics and binary download. That was after its first model request had already gone out at 1.3 s (the E1 control: 1.2 s), so it could not delay startup. A call made at load time, like my probe's, sits in front of the first request; one made during a tool call does not. The first run also downloaded those two binaries, so I did not measure what the call itself cost. With the binaries already present, the same probe in E1 took 11.8 s and the black hole recorded no call.

This setup detects Secret Service access; it did not reproduce the earlier hang. Save the code verbatim as `blackhole.py`. It needs dbus-python and PyGObject. It exits 1 if something already owns `org.freedesktop.secrets` on the bus, because a real keyring answering in its place would make every test look clean:

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

The test script below clears the environment and drops the bus by default. Set `KEEP_BUS=1` to pass the current session bus through, then start the black hole and the test script inside a private bus:

```bash
dbus-run-session -- bash -c 'rm -f calls.log; python3 blackhole.py calls.log & for i in $(seq 50); do grep -q " ready " calls.log 2>/dev/null && break; sleep 0.1; done; grep -q " ready " calls.log || exit 1; KEEP_BUS=1 ./try-pi-extension.sh npm:<pkg>@<version>'
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

For example, after exporting `DEEPSEEK_API_KEY`:

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

These are the failure paths I ran with the final script. `bad.ts` is a three-line extension that throws when Pi loads it:

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

The list the script prints is every tool the model got, Pi's four built-ins included; the table above lists only the additions. The first `exit=` is the status of the timeout-wrapped Pi run (124 when `timeout` killed it); the number after `FAILED (exit` is the script's classification, and the text in parentheses is the same legend every time. In `--mode json`, Pi 1.5.0 exited 0 both for the bad key and for the missing package, which is why the script checks the last assistant message and the install warning itself. Every failure makes the script exit 1, and so do a missing argument or a missing key, before Pi starts. A local path such as `./bad.ts` is turned into an absolute path first, because the script runs Pi from a scratch directory.

After the load check, test an actual tool call. The asking-user package passed this script even though the model received only the control tools.

## Which are the best Pi extensions for unattended use?

For MCP, the best Pi extensions I'd consider for unattended use are `pi-mcp-extension` or the adapter with an agent directory rewritten per run. I didn't connect either to a server, so the only difference I measured in what they leave behind is the settings side effect, and `pi-mcp-extension` had none.

For web search, `pi-web-access` worked without a search key and reported "Provider: exa"; its README says that with no keys it searches through Exa's MCP endpoint, so your queries go to Exa. `pi-web-search` also worked; its README says it searches through the currently selected model.

Both subagent packages returned `PONG`, though Pi-subagents needed a retry after the model guessed an agent name. I'd keep `rpiv-todo` for task lists and use `cc-safety-net` as a command guard. I'd use permission-system only with an explicit configuration.

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

Pi 1.5.0's changelog says an unpinned `-e npm:` package is reinstalled when the registry has a newer matching version. The [production post's loading section](/blog/pi-extensions-in-production/#how-orbi-loads-pi-extensions-no-extensions-plus-a-pinned-allowlist) explains how Orbi passes the configured extensions to Pi.

## Related

The [Pi hub](/guides/pi-coding-agent/) collects the series. [Pi extensions in production](/blog/pi-extensions-in-production/) covers isolation and writing extensions; [Orbi on Pi](/blog/orbi-on-pi-coding-agent/) follows the runner and its incidents. Browse the [Pi package catalog](https://pi.dev/packages), compare [Orbi and Claude Code](/compare/claude-code/?ref=blog-pi-ext), or read about [Orbi Cloud](/cloud/?ref=blog-pi-ext). Orbi's source is [orbi-build/orbi](https://github.com/orbi-build/orbi).
