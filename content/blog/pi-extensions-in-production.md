---
title: Pi extensions in production: isolate, then write one
date: 2026-10-30
summary: How Orbi runs Pi extensions unattended: --no-extensions plus a pinned allowlist, the D-Bus hang that forced it, and two extensions we wrote ourselves.
lang: en
author: Lawrence Liu
image: /img/blog-pi-extensions-card.png
series: pi
---

Pi extensions are TypeScript modules that the [Pi coding agent](https://pi.dev) loads at startup: each one exports a function that receives the extension API, and with it the module can register tools the model may call, add commands, and subscribe to session events. Pi has several ways of finding them, and on a laptop every one of them is convenient. In a service that runs Pi with nobody watching, every one of them is also a way for code you did not choose to end up inside the session.

I'm Lawrence Liu, the creator of Orbi. Orbi runs Pi unattended: it takes a GitHub issue, starts Pi to write the change, starts another Pi to review it, and merges when the review and CI pass. The [Pi hub](/guides/pi-coding-agent/) describes the runner around those sessions and [the first post of this series](/blog/orbi-on-pi-coding-agent/) walks one issue through them. This post is about Pi extensions only: how Orbi loads them, what went wrong before it did it this way, and two extensions we ended up writing ourselves. The commands and config below are what runs today, on Pi 1.2.0; the Orbi version numbers are the open-source engine's releases.

## What Pi extensions are, and the three ways Pi loads them

The simplest Pi extension is one file. This one, from Pi's [extension documentation](https://pi.dev/docs/latest/extensions), loads and does one thing:

```ts
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });
}
```

Tools and commands are registered from the same function (`pi.registerTool`, `pi.registerCommand`); a complete tool appears further down. An extension can also be a directory with an `index.ts`, or a package whose `package.json` declares its entry points.

Pi loads extensions from three places, and the distinction matters for everything that follows:

1. **Discovery.** A `*.ts` or `*.js` file, a directory with `index.ts`, or a package under `~/.pi/agent/extensions/` (global) or `.pi/extensions/` (project-local) loads automatically. Discovery goes one level deep. Project-local extensions load only after you have answered Pi's one-time prompt to trust that project.
2. **Settings.** `pi install <source>` records an npm or git package in `~/.pi/agent/settings.json`, and Pi loads it on every start. `pi list` shows what is installed.
3. **Explicit paths.** `pi -e ./review.ts` loads one file for this process only. The docs call this the way to test an extension quickly.

Then there is the switch that turns the first two off. From `pi --help` in 1.2.0:

```
--extension, -e <path>   Load an extension file or builtin:<name> (can be used multiple times)
--no-extensions, -ne     Disable extension discovery and built-in extensions (explicit -e paths still work)
--no-builtin-tools, -nbt Disable built-in tools by default but keep extension/custom tools enabled
```

`--no-extensions` disables discovery, the settings packages, and Pi's own built-in extensions such as MCP support. Explicit `-e` paths still load, and a built-in can be named that way too: `pi -ne -e builtin:mcp` is a session whose only extension is MCP, and the same shape with your own file is a session whose only extension is yours. Note what that flag does not do: Pi's built-in tools (`read`, `bash`, `edit`, `write`) are still there. Turning those off is a separate switch, `--no-builtin-tools`, and the clarification gate below uses both.

## The D-Bus hang that made Orbi stop trusting Pi extension discovery

Orbi's runner on my machine is a systemd user service. On 4 September 2026 a run stopped before it did anything: the Pi process was alive, but minutes went by with no session file and no request to the model. The full write-up, with the diagnosis script, is in [the first post's incident section](/blog/orbi-on-pi-coding-agent/#two-incidents-that-shaped-how-we-run-pi); the short version is what matters here.

The runner's Pi had loaded the packages declared in my own `~/.pi/agent/settings.json`, one of which was `pi-mcp-adapter`. That plugin initializes `@napi-rs/keyring` at startup, which makes a Secret Service call over D-Bus. Inside a `systemd --user` service that call occasionally never returns, and node waits on it before the first model request goes out. Nothing in the run had asked for MCP. The plugin was there because I had installed it for interactive use, and discovery handed it to the unattended session too. Removing it from `settings.json` fixed that run: restarted, the same issue got its session file and its first model response within 15 seconds.

It happened once that we know of, and once was enough: a package the OS user installed for themselves had stopped an unattended run, and nothing in Orbi's config said it was allowed in. The fix for that, [Issue #249](https://github.com/orbi-build/orbi/issues/249), merged on 7 September (UTC): Orbi declares the extensions a run may have, and starts the implementer and the reviewer with `--no-extensions`. The third role, `ticket`, followed a month later; that story is in the table below.

## How Orbi loads Pi extensions: `--no-extensions` plus a pinned allowlist

Orbi's runner reads its own config file, `orbi.toml` (the `.github/orbi.toml` that appears later is a different file, a repository's settings on GitHub). The extension list is one repeatable table in it:

```toml
[[pi_extensions]]
source = "npm:some-extension@1.4.2"   # npm sources must pin a version
enabled = true                         # default
[pi_extensions.env]
SOME_EXTENSION_MODE = "unattended"     # a literal, set only in this Pi child

[[pi_extensions]]
source = "git:github.com/org/repo@v1"  # git sources must name a ref after @

[[pi_extensions]]
source = "extensions/local-check.ts"   # relative to the config file; must exist
```

Orbi validates this at config load (`src/orbi/config.py`): an npm source without a concrete version, a git source without a ref, a local path that does not exist, the same source twice, or two entries setting the same `env` name to different values, and the config is rejected before any run starts. At launch, the `env` tables of the enabled entries are merged into the environment of that Pi process only (`pi_extension_env` in `src/orbi/pi_session.py`); they are never logged.

Two limits of that validation are worth knowing. The `env` values are literals: `"$SOME_TOKEN"` is passed to Pi literally, not expanded, so a secret the extension needs should be read by the extension from the service's own environment, not written here. And a git ref can be a tag or a branch that moves; if you need the implementer and the reviewer, which are separate Pi processes, to run byte-identical extension code, pin a commit SHA or ship an unchanged file from the same repository revision.

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

Every role gets `--no-extensions` and one `--extension` per enabled entry. The combination is what makes the allowlist work: `--no-extensions` denies discovery, settings, and built-ins, and the explicit paths are the only extensions the session can have. An empty `pi_extensions` list means a Pi with no extensions at all, which is Orbi's default.

Three kinds of Pi session in Orbi differ from that default, and each is a different answer to "what should this session be able to do":

| Session | Extension flags | Why |
|---|---|---|
| implementer, reviewer, and the `ticket` role that writes comments | `--no-extensions` + the configured `--extension` entries | the allowlist above |
| the repository-summary session of `orbi suggest` | `--no-extensions` and nothing else, with `--tools read,ls,find --no-skills --no-context-files` | it only reads; it does not need even the configured extensions |
| the clarification gate (`clarify_thin_tickets = true` in the repository's `.github/orbi.toml`) | `--no-builtin-tools --no-extensions --extension <clarify_verdict.ts>` | exactly one tool, shipped with the engine; nothing else callable |

The first row was not always complete. Until 5 October the `ticket` role was started with no extension flags at all, so a user's installed extensions could load into the sessions that write issue comments. [Issue #1558](https://github.com/orbi-build/orbi/issues/1558) fixed it in Orbi v0.6.2 that day. Skills are the other half of the same picture. A skill is a Markdown file of instructions Pi loads into the prompt, and Pi discovers skills the same way it discovers extensions. There the isolation is still partial: the implementer, the reviewer, and the `ticket` role get Orbi's own `--skill` entries but not `--no-skills`, so skills the OS user installed can load into them. Only the `orbi suggest` sessions pass `--no-skills`.

## Writing a Pi extension with one accepted output channel

If you want to write a Pi extension and are not sure what for, the clarification gate is the one I would point to first, because it solves a problem that has nothing to do with MCP or tooling: getting a structured answer out of a model reliably.

The gate runs before Orbi starts a delivery. One Pi session reads the issue and judges it on three checks (does it state an observable result, an acceptance condition, and a single outcome). If the issue is thin, Orbi stops the attempt, swaps the issue's label to `ai-needs-detail`, and leaves a comment (the stop comment) that lists what is missing and, when the model can propose one, a fix: split it into these tickets, or add these acceptance lines. Through Orbi v0.7.20 the gate asked the model for JSON in free text and parsed stdout. On the beta that dropped every proposal: the model put `kind` and `items` at the top level next to `missing`, the parser read only `suggestion`, and no stop comment ever showed a proposal; the same prompt sent three times to DeepSeek returned a usable split every time, at the wrong level ([Issue #1955](https://github.com/orbi-build/orbi/issues/1955)).

The fix was to stop parsing text. Since Orbi v0.7.21 (28 October) the engine ships `src/orbi/extensions/clarify_verdict.ts`, an extension that registers one tool. Below is a 48-line abridged version: the `split` proposal shape, the exported constants and the comments are cut, and the description is shortened. The [full file](https://github.com/orbi-build/orbi/blob/main/src/orbi/extensions/clarify_verdict.ts) is 138 lines:

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
          // the "split" variant (kind: "split", at least two items) is omitted here
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

Three parts do the work. `parameters` is a TypeBox schema with `additionalProperties: false` at every level, and Pi validates the model's arguments against it before `execute` runs, so a top-level `kind`, an unknown check id, or (in the full file) a split with one item never reaches the file. `execute` writes the validated arguments to the path the engine put in `ORBI_CLARIFY_OUT`, so the engine reads a file instead of stdout. And `terminate: true` ends the run on the tool call, so there is no follow-up turn to pay for. The session is started with `--no-builtin-tools --no-extensions --extension <that file>`: built-in tools off, discovery off, one extension on.

What the schema protects against is a malformed verdict, not a missing one. If the model answers in prose, or calls the tool with arguments the schema rejects, there is no file, and the engine treats that exactly as it treats a model that is down: the gate fails open and the delivery starts without the check. A thin issue then goes through as it did before the gate existed; what no longer happens is a proposal silently lost.

Pi aliases `typebox` to its own pinned copy when it loads an extension, so a file like this needs no `package.json` of its own. To try the shape yourself:

```bash
out="$(mktemp -d)/verdict.json"   # a fresh path each run, so you never read a previous result
ORBI_CLARIFY_OUT="$out" \
  pi -ne -e ./verdict.ts -nbt \
  -p 'Call clarify_verdict once with {"missing":[]}.'
cat "$out"
```

The failures look different from each other. No file and no error: the model never called the tool. Pi reports a validation error on the call: the arguments did not match the schema. The tool throws: `ORBI_CLARIFY_OUT` was not set or not writable.

## A Pi extension as the only write path: Orbi Cloud's draft tool

The second extension is in Orbi Cloud, which hosts the same runner and adds a page where you describe a change in a conversation and Orbi drafts the issue for you. That drafting run is a Pi session in the tenant's sandbox, started with `--no-extensions -e <draft extension>` and `--tools read,grep,find,ls,write_draft,ask_user_question`, so the allowlist rule holds here too. The extension registers the two tools at the end of that list:

- `write_draft` takes the complete draft and its issue title and writes them to fixed files. Those files are the only thing the page accepts as a draft, so whatever the model prints to the screen never becomes one. With that tool set the session has no general write or edit tool, so it cannot change files in the repository. A second, separate Pi session then checks the draft against what the person asked for, with the request and the draft as its input text; it loads the same extension with `write_draft` as its only tool and hands the checked draft back through it.
- `ask_user_question` is for the case where the request is underspecified. The model asks one to four questions, each with two to four options, the recommended option first. The questions are written to a file next to the draft and the round ends there. Pi keeps every session in a file, and the run names that file with `--session-dir` and `--session-id`; when the person answers on the page, the next round starts Pi on the same session file with that one message, so there is no resident process and no timeout.

The tool's name and parameter shape came from a community extension, `@juicesharp/rpiv-ask-user-question`, which asks the questions in the terminal. We did not take it as a dependency: in `pi -p`, the non-interactive mode Orbi always uses, that package withdraws its tool entirely, because there is nobody at a terminal to answer. We copied its name and parameter shape and wrote our own.

## What to copy for your own Pi extensions

If you run Pi without a person at the keyboard, the short version of this post is three habits:

1. Start every unattended Pi with `--no-extensions`, then add back exactly the extensions you mean to load with `-e`. Keep the list in config, pin versions, and reject the config when a pin is missing.
2. When you need a structured answer from the model, give it one tool with a schema and `terminate: true`, write the result to a file, and treat anything else as no answer. Do not parse stdout.
3. When the model must produce an artifact, make the extension tool the only write path and leave the general write tools out of `--tools`.

One gap is still open on our side: skills do not get the same treatment yet, so an OS user's skills can still load into Orbi's implementer, reviewer, and `ticket` sessions.

## Related

This is the fourth post in Orbi's Pi series. The [Pi hub](/guides/pi-coding-agent/) has the full runner, the [first post](/blog/orbi-on-pi-coding-agent/) follows one issue through every Pi session Orbi started for it, and the [harness comparison](/blog/pi-agent-harness/) stops three unattended Pi setups mid-task and compares what comes back. Orbi is open source: [orbi-build/orbi](https://github.com/orbi-build/orbi). If you would rather not run the runner yourself, read the [OpenHands comparison](/compare/openhands/) and [Cloud](/cloud/).
