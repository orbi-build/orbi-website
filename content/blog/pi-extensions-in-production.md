---
title: Pi extensions in production: isolate, then write one
date: 2026-10-30
summary: How Orbi runs Pi extensions unattended: --no-extensions plus a pinned allowlist, the D-Bus hang that forced it, and two extensions we wrote ourselves.
lang: en
author: Lawrence Liu
image: /img/blog-pi-extensions-card.png
series: pi
---

Pi extensions are TypeScript modules that the [Pi coding agent](https://pi.dev) loads at startup: each one exports a function that receives the extension API, and with it the module can register tools the model may call, add commands, and subscribe to session events. Pi finds them on its own in `~/.pi/agent/extensions/` and in a project's `.pi/extensions/`, loads whatever `pi install` has added to `settings.json`, and takes explicit paths with `-e`. On a laptop, that is convenient. In a service that runs Pi with nobody watching, every one of those discovery paths is a way for code you did not choose to end up inside the session.

I'm Lawrence Liu, the creator of Orbi. Orbi runs Pi unattended: it takes a GitHub issue, starts Pi to write the change, starts another Pi to review it, and merges when the review and CI pass. The [Pi hub](/guides/pi-coding-agent/) describes the runner around those sessions and [the first post of this series](/blog/orbi-on-pi-coding-agent/) walks one issue through them. This post is about the extension part only: how Orbi loads Pi extensions, what went wrong before it did it this way, and two extensions we ended up writing ourselves. The commands and config below are what runs today, on Pi 1.2.0.

## What Pi extensions are, and the three ways Pi loads them

An extension is one file. The smallest one that does something looks like this, taken from Pi's [extension documentation](https://pi.dev/docs/latest/extensions):

```ts
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });
  pi.registerTool({ /* name, description, parameters, execute */ });
  pi.registerCommand("hello", { /* ... */ });
}
```

Pi loads extensions from three places, and the distinction matters for everything that follows:

1. **Discovery.** Any `*.ts` or `*.js` under `~/.pi/agent/extensions/` (global) or `.pi/extensions/` (project-local) loads automatically.
2. **Settings.** `pi install <source>` records an npm or git package in `~/.pi/agent/settings.json`, and Pi loads it on every start. `pi list` shows what is installed.
3. **Explicit paths.** `pi -e ./review.ts` loads one file for this process only. The docs call this the way to test an extension quickly.

Then there is the switch that turns the first two off. From `pi --help` in 1.2.0:

```
--extension, -e <path>   Load an extension file or builtin:<name> (can be used multiple times)
--no-extensions, -ne     Disable extension discovery and built-in extensions (explicit -e paths still work)
--no-builtin-tools, -nbt Disable built-in tools by default but keep extension/custom tools enabled
```

`--no-extensions` disables discovery, the settings packages, and Pi's own built-in extensions such as MCP support. Explicit `-e` paths still load. So `pi -ne -e builtin:mcp` is a session with exactly one extension, MCP, and nothing else; the same shape with your own file gives you a session that has exactly the tools you wrote. That combination is the whole basis of what Orbi does.

## The D-Bus hang that made Orbi stop trusting discovery

Orbi's runner on my machine is a systemd user service. In early September 2026 a run stopped before it did anything: the Pi process was alive, but minutes went by with no session file and no request to the model. The diagnosis that ended up in Orbi's [operations guide](https://docs.orbi.build/operations) was four commands:

```bash
# 1. The process is alive but idle
ps -o pid,stat,etime,cmd -p "$PID"
# 2. No TCP connection to the model API: the request was never sent
ss -tnp | grep "$PID"                    # empty
# 3. The only socket is D-Bus
ls -l /proc/"$PID"/fd | grep socket      # unix socket -> /run/user/1000/bus
# 4. The session file was never created
ls -la <task worktree>/.pi-session/      # empty
```

The runner's Pi had loaded the packages declared in my own `~/.pi/agent/settings.json`, one of which was `pi-mcp-adapter`. That plugin initializes `@napi-rs/keyring` at startup, which makes a Secret Service call over D-Bus. Inside a `systemd --user` service that call occasionally never returns, and node sits in `poll_schedule_timeout` before the first model request goes out. Nothing in the run had asked for MCP. The plugin was there because I had installed it for interactive use, and discovery handed it to the unattended session too.

Removing the package from `settings.json` fixed that run: the same issue resumed and reached its first model response in 15 seconds. The permanent fix was [Issue #249](https://github.com/orbi-build/orbi/issues/249), merged on 8 September: Orbi declares the extensions a run may have and starts every Pi with `--no-extensions`. Whatever the OS user has installed for themselves stays out of the runner's sessions.

## How Orbi loads Pi extensions: `--no-extensions` plus a pinned allowlist

The config side is one repeatable table in `orbi.toml`:

```toml
[[pi_extensions]]
source = "npm:some-extension@1.4.2"   # npm sources must pin a version
enabled = true                         # default
[pi_extensions.env]
SOME_TOKEN = "$SOME_TOKEN"             # injected only into this Pi child

[[pi_extensions]]
source = "git:github.com/org/repo@v1"  # git sources must pin a ref with @

[[pi_extensions]]
source = "extensions/local-check.ts"   # relative to the config file; must exist
```

Orbi validates this at config load (`src/orbi/config.py`): an npm source without a concrete semver, a git source without a ref, a local path that does not exist, or the same source twice, and the config is rejected before any run starts. The point of the pins is that the implementer and the reviewer, which are separate Pi processes, cannot drift to different versions of the same extension.

The command side is a few lines in `src/orbi/pi_command.py`:

```python
def _pi_extension_args(config: RunnerConfig) -> list[str]:
    """Return the isolated extension flags for every Pi role."""
    args = ["--no-extensions"]
    for extension in config.pi_extensions:
        if extension["enabled"]:
            args.extend(("--extension", extension["source"]))
    return args
```

Every role gets `--no-extensions` first, then one `--extension` per enabled entry. The order is what makes the allowlist work: `--no-extensions` denies discovery, settings, and built-ins, and the explicit paths that follow are the only extensions the session can have. An empty `pi_extensions` list means a Pi with no extensions at all, which is Orbi's default.

Three Pi sessions in Orbi deliberately differ from that default, and each one is a different answer to "what should this session be able to do":

| Session | Extension flags | Why |
|---|---|---|
| implementer, reviewer, and the `ticket` role that writes comments | `--no-extensions` + the configured `--extension` entries | the allowlist above |
| the repository-summary session of `orbi suggest` | `--no-extensions` and nothing else, with `--tools read,ls,find --no-skills --no-context-files` | it only reads; it does not need even the configured extensions |
| the clarification gate (`clarify_thin_tickets = true` in `.github/orbi.toml`) | `--no-builtin-tools --no-extensions --extension <clarify_verdict.ts>` | exactly one tool, shipped with the engine; nothing else callable |

The first row was not always complete. Until 5 October the `ticket` role was started with no extension flags at all, so a user's installed extensions could load into the sessions that write issue comments. [Issue #1558](https://github.com/orbi-build/orbi/issues/1558) fixed it in v0.6.2, and the Pi hub's note about that gap is out of date as of this post. Skills are the other half of the same picture, and there the isolation is still partial: Orbi passes its own `--skill` entries but does not pass `--no-skills`, so skills the OS user installed can load in every role.

## Writing a Pi extension so the model can answer in exactly one way

If you want to write a Pi extension and are not sure what for, the clarification gate is the one I would point to first, because it solves a problem that has nothing to do with MCP or tooling: getting a structured answer out of a model reliably.

The gate runs before Orbi starts a delivery. One Pi session reads the issue and judges it on three checks (does it state an observable result, an acceptance condition, and a single outcome), and if the issue is thin, the gate proposes a fix: split it into these tickets, or add these acceptance lines. The first version asked the model for JSON in free text and parsed stdout. On the beta that silently dropped every proposal: the model put `kind` and `items` at the top level next to `missing`, the parser read only `suggestion`, and the stop comment never showed a proposal ([Issue #1955](https://github.com/orbi-build/orbi/issues/1955)).

The fix was to stop parsing text. The engine now ships `src/orbi/extensions/clarify_verdict.ts`, an extension that registers one tool. The parts that matter:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { writeFileSync } from "node:fs";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "clarify_verdict",
    description: "Report the clarification verdict for this ticket.",
    parameters: Type.Object({
      missing: Type.Array(Type.Union([
        Type.Literal("observable_result"),
        Type.Literal("acceptance_condition"),
        Type.Literal("single_outcome"),
      ])),
      // ...the proposal shape: a split with its items, or acceptance lines
    }),
    async execute(_toolCallId, args) {
      writeFileSync(process.env.ORBI_CLARIFY_OUT!, JSON.stringify(args));
      return { content: [{ type: "text", text: "recorded" }], terminate: true };
    },
  });
}
```

Three things do the work. `parameters` is a TypeBox schema, and Pi validates the model's arguments against it before `execute` runs, so a top-level `kind`, an unknown check id, or a split with one item never reaches the file. `execute` writes the validated arguments to the path the engine put in `ORBI_CLARIFY_OUT`, so the engine reads a file instead of stdout. And `terminate: true` ends the run on the tool call, so there is no follow-up turn to pay for. The session is started with `--no-builtin-tools --no-extensions --extension <that file>`: built-in tools off, discovery off, one extension on. The model can answer in exactly one way, and an unusable answer (no file, or a file the schema would not allow) is treated like an unavailable model: the gate fails open and the delivery proceeds. The whole file is 138 lines including comments, and it shipped in v0.7.21 on 28 October.

Pi aliases `typebox` to its own pinned copy when it loads an extension, so a file like this needs no `package.json` of its own. To try the shape yourself: write the file, run `pi -ne -e ./verdict.ts -nbt -p "..."` with a prompt that tells the model to call the tool, and read the output file. If the file is missing, the model did not call the tool; if Pi refused the call, the arguments did not match the schema.

## An extension as the only write path: Orbi Cloud's draft tool

The second extension is in Orbi Cloud, which hosts the same runner and adds a page where you describe a change in a conversation and Orbi drafts the issue for you. That drafting run is a Pi session in the tenant's sandbox, started with `pi -e <draft extension>` and `--tools read,grep,find,ls,write_draft,ask_user_question`. The extension registers the two tools at the end of that list, and they are the only ways the model can produce output:

- `write_draft` takes the complete draft and its issue title and writes them to fixed files. There is no general write or edit tool in the session, so the model cannot touch the repository and cannot leave its reasoning in the draft. A second, read-only pass that checks the draft against the repository loads the same extension with only `write_draft` enabled, and uses it as the hand-back channel.
- `ask_user_question` is for the case where the request is underspecified. The model asks one to four questions, each with two to four options, the recommended option first. The questions are written to a file next to the draft and the round ends there. When the person answers on the page, the next round resumes the same Pi session with that one message, so there is no resident process and no timeout. In `pi -p` (non-interactive) mode the tool withdraws itself, because there is nobody at a terminal to answer.

The tool's name and parameter shape came from a community extension, `@juicesharp/rpiv-ask-user-question`, which does the same thing interactively. We did not take it as a dependency: its terminal UI is exactly the part an unattended run cannot use. Copying a tool's contract from an extension you cannot run as-is turned out to be the most useful way to read the extension catalog.

## What to copy

If you run Pi without a person at the keyboard, the short version of this post is three habits:

1. Start every unattended Pi with `--no-extensions`, then add back exactly the files you mean to load with `-e`. Keep the list in config, pin package versions, and reject the config when a pin is missing.
2. When you need a structured answer from the model, give it one tool with a schema and `terminate: true`, write the result to a file, and treat anything else as no answer. Do not parse stdout.
3. When the model must produce an artifact, make the extension tool the only write path and leave the general write tools out of `--tools`.

And one thing we have not finished: skills do not get the `--no-extensions` treatment yet, so an OS user's skills can still load into Orbi's sessions. That is the next isolation gap to close.

## Related

This is the fourth post in Orbi's Pi series. The [Pi hub](/guides/pi-coding-agent/) has the full runner, the [first post](/blog/orbi-on-pi-coding-agent/) follows one issue through four Pi sessions, and the [harness comparison](/blog/pi-agent-harness/) kills three unattended Pi setups mid-task. Orbi is open source: [orbi-build/orbi](https://github.com/orbi-build/orbi). If you would rather not run the runner yourself, read the [OpenHands comparison](/compare/openhands/) and [Cloud](/cloud/).
