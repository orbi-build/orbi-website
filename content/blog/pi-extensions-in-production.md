---
title: Pi extensions in production: isolate, then write one
date: 2026-10-30
updated: 2026-11-17
summary: How Orbi runs Pi extensions and Pi agent skills unattended: a --no-extensions allowlist, where Pi looks for skills, and the flags that limit each session.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-pi-extensions-card.png
series: pi
---

Pi extensions are TypeScript (or JavaScript) modules that the [Pi coding agent](https://pi.dev) loads at startup: each one exports a function that receives the extension API, and with it the module can register tools the model may call, add commands, and subscribe to session events. Pi finds extensions in several ways, and on a laptop every one of them is convenient. In a service that runs Pi with nobody watching, the two automatic ones are also a way for code you did not choose to end up inside the session.

I'm Larry 🍀 Orbi, the creator of Orbi. Orbi runs Pi unattended: it takes a GitHub issue, starts Pi to write the change, starts another Pi to review it, and merges when the review and CI pass. The [Pi hub](/guides/pi-coding-agent/) describes the runner around those sessions and [the first post of this series](/blog/orbi-on-pi-coding-agent/) walks one issue through them. This post covers how Orbi loads Pi extensions, what went wrong before it did it this way, and two extensions we ended up writing ourselves. One section covers [Pi agent skills](#pi-agent-skills-where-pi-finds-them-and-how-to-turn-them-off): directories, installation and explicit loading. The extension commands below, and the shape of the config, are what runs today on Pi 1.2.0; I tested the skills section on Pi 1.5.2 and ran the main discovery cases on 1.2.0 as well. The Orbi version numbers are the open-source engine's releases.

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

Tools and commands are registered from the same function (`pi.registerTool`, `pi.registerCommand`); a complete tool appears further down. An extension can also be a directory with an `index.ts` or `index.js`, or a package whose `package.json` declares its entry points.

Pi loads extensions from three places:

1. **Discovery.** A `*.ts` or `*.js` file, a directory with `index.ts` or `index.js`, or a package under `~/.pi/agent/extensions/` (global) or `.pi/extensions/` (project-local) loads automatically. Discovery goes one level deep. Project-local extensions load only after you have answered Pi's one-time prompt to trust that project.
2. **Settings.** `pi install <source>` records an npm or git package in `~/.pi/agent/settings.json`, and Pi loads it on every start. `pi list` shows what is installed.
3. **Explicit paths.** `pi -e ./review.ts` loads one file for this process only. The docs call this the way to test an extension quickly.

Besides those three sources of your own extensions, Pi ships built-in ones, such as MCP support, that load unless told otherwise. Then there is the switch that turns the automatic loading off. Three lines excerpted from `pi --help` in 1.2.0:

```text
--extension, -e <path>   Load an extension file or builtin:<name> (can be used multiple times)
--no-extensions, -ne     Disable extension discovery and built-in extensions (explicit -e paths still work)
--no-builtin-tools, -nbt Disable built-in tools by default but keep extension/custom tools enabled
```

`--no-extensions` disables discovery, the packages in `settings.json`, and Pi's own built-in extensions such as MCP support (the [CLI reference](https://pi.dev/docs/latest/cli) spells it out as "discovered, configured, and built-in extensions"). Explicit `-e` paths still load, and a built-in can be named that way too: `pi -ne -e builtin:mcp` is a session whose only extension is MCP, and the same shape with your own file is a session whose only extension is yours. That flag leaves Pi's built-in tools alone. The four on by default (`read`, `bash`, `edit`, `write`) are still there, and `ls`, `find` and `grep` are built in too, off by default, which is where the `--tools` lists below get those names. Turning those off is a separate switch, `--no-builtin-tools`, and the clarification gate below uses both.

## The D-Bus hang that made Orbi stop trusting Pi's default extension loading

Orbi's runner on my machine is a systemd user service. On 4 September 2026 a run stopped before it did anything: the Pi process was alive, but minutes went by with no session file and no request to the model. The full write-up, with the diagnosis script, is in [the first post's incident section](/blog/orbi-on-pi-coding-agent/#two-incidents-that-shaped-how-we-run-pi); the short version is what matters here.

The runner's Pi had loaded the packages declared in my own `~/.pi/agent/settings.json`, one of which was `pi-mcp-adapter`. That plugin initializes `@napi-rs/keyring` at startup, which makes a Secret Service call over D-Bus. Inside a `systemd --user` service that call can hang (it did, in several runs that evening; the same setup started by hand worked every time), and node waits on it before the first model request goes out. Nothing in the run had asked for MCP. The plugin was there because I had installed it for interactive use, and Pi's default loading, which reads `settings.json`, handed it to the unattended session too. Removing it from `settings.json` fixed that run: restarted, the same run got its session file and its first model response within 15 seconds.

Nothing in Orbi's config had allowed that package in. The fix for that, [Issue #249](https://github.com/orbi-build/orbi/issues/249), merged on 7 September (UTC): Orbi declares the extensions a run may have, and starts the implementer and the reviewer with `--no-extensions`. The third role, `ticket`, the session that writes issue comments, followed a month later; that story is in the table below.

## How Orbi loads Pi extensions: `--no-extensions` plus a pinned allowlist

Orbi's runner reads its own config file, `orbi.toml` (the `.github/orbi.toml` that appears later is a different file, a repository's settings on GitHub). The list of Pi extensions is one repeatable table in it:

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

`enabled` defaults to true. Orbi validates this at config load (`src/orbi/config.py`): an npm source without a concrete version, a git source with nothing after an `@`, a local path that does not exist, the same source twice, or two entries setting the same `env` name to different values, and the config is rejected before any run starts. At launch, the `env` tables of the enabled entries are merged into the environment of that Pi process only (`pi_extension_env` in `src/orbi/pi_session.py`); they are never logged. The git check is textual: the SSH form `git:git@host:org/repo` passes it, so write git sources as `git:<host>/<owner>/<repo>@<ref>`.

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

The implementer, the reviewer, the `ticket` role, and the suggestion-writing session of `orbi suggest` get `--no-extensions` and one `--extension` per enabled entry. The combination is what makes the allowlist work: `--no-extensions` denies discovery, settings, and built-ins, and the explicit entries are the only extensions the session can have. `-e` takes more than a path: the help text says "file or `builtin:<name>`", but on Pi 1.2.0 `pi -ne -e npm:<package>@<version>` fetches the package from the npm registry (a wrong name fails with npm's own 404) and `-e` with `git:<host>/<owner>/<repo>@<ref>` clones it, which is how Orbi's `npm:` and `git:` sources reach Pi unchanged. An empty `pi_extensions` list means a Pi with no extensions at all, which is Orbi's default.

Not every Orbi session uses that list, though. These are the three shapes, and each is a different answer to "what should this session be able to do":

| Session | Extension flags | Why |
|---|---|---|
| implementer, reviewer, the `ticket` role that writes comments, and the suggestion-writing session of `orbi suggest` | `--no-extensions` + the configured `--extension` entries (the `orbi suggest` session adds `--no-skills`) | the allowlist above |
| the repository-summary session of `orbi suggest` (the command that reads a repository and proposes tasks) | `--no-extensions` with no `--extension` at all; its other flags are `--tools read,ls,find --no-skills --no-context-files` | it only reads; it does not need even the configured extensions |
| the clarification gate (`clarify_thin_tickets = true` in the repository's `.github/orbi.toml`) | `--no-builtin-tools --no-extensions --extension <clarify_verdict.ts>` | exactly one tool, shipped with the engine; nothing else callable |

The first row was not always complete. Until 5 October the `ticket` role was started with no extension flags at all, so a user's installed extensions could load into the sessions that write issue comments. [Issue #1558](https://github.com/orbi-build/orbi/issues/1558) fixed it in Orbi v0.6.2 that day. Skills have their own discovery rules and tool requirements, covered in the next section.

## Pi agent skills: where Pi finds them, and how to turn them off

Pi coding agent skills follow the [Agent Skills](https://agentskills.io/specification) format. A skill is a directory with a `SKILL.md`: front matter gives its `name` and `description`, followed by instructions; Pi puts the name, description and file path into the system prompt, and the model reads the file when a task matches.

I used a local stand-in for the model API to record Pi's first request, with a throwaway `HOME` per case. I tested Pi 1.5.2 (the current npm release) and 1.2.0; cases run on both gave the same results. Every result below is what showed up in the system prompt Pi actually sent.

### Where Pi looks

| Location | Loads when | Notes |
|---|---|---|
| `~/.pi/agent/skills/` | Always, at user level | Recursive: a `SKILL.md` two directories down loaded. |
| `~/.agents/skills/` | Always, at user level | The Agent Skills location, resolved from `HOME`. |
| `.pi/skills/` | Project trusted | Only in the working directory: from `app/`, Pi loaded `app/.pi/skills/`, not the repository root's `.pi/skills/`. |
| `.agents/skills/` | Project trusted | Working directory and each parent up to the git repository root, nothing above it; outside a git repository Pi keeps walking up to the filesystem root. |
| `~/.pi/agent/settings.json` → `"skills"` | Configured | Array of files or directories; an absolute path loaded. |
| Installed packages | Installed and exposing skills | A `skills/` directory, or skills declared in `package.json`'s `"pi"` manifest. |

Print mode (`pi -p`), JSON and RPC modes have no trust prompt. Project skills are skipped unless you pass `--approve` (`-a`), have a saved `/trust` decision, or set `"defaultProjectTrust": "always"` in `settings.json`. Tests with either override loaded them; without either, none loaded.

For installation, list paths in the `"skills"` array of `~/.pi/agent/settings.json`, or use `pi install <source>` with npm, git or a local path. Installation records the source under `"packages"` in that file. A local package containing `skills/pack-skill/SKILL.md` loaded after:

```bash
pi install ./my-skill-pack
```

There is a catch with [`badlogic/pi-skills`](https://github.com/badlogic/pi-skills), the collection [Pi's skills documentation](https://pi.dev/docs/latest/skills) points to. At tested commit `90bb51c`, its eight skill directories sit at the repository top level, with no `skills/` or `package.json`. `pi list` confirms installation, not what reached the model:

```bash
pi install git:github.com/badlogic/pi-skills   # succeeds, pi list shows it, loads 0 skills
git clone https://github.com/badlogic/pi-skills ~/.pi/agent/skills/pi-skills   # 8 skills load
```

Its README recommends that clone location, or `.pi/skills/pi-skills` for a project.

Two lines from `pi --help`:

```text
--skill <path>                 Load a skill file or directory (can be used multiple times)
--no-skills, -ns               Disable skills discovery and loading
```

`--no-skills` removed both user directories, trusted project directories, settings entries and installed packages from the prompt. Explicit `--skill` paths still work with it; without it, they add to discovery. A duplicate name kept one copy (`~/.pi/agent/skills/` won in my test); a missing description excluded the skill. Neither printed anything in `pi -p` output; Pi's docs say a collision produces a warning, and I did not see one in print mode.

This is not an Orbi command, but it is the shape I would use unattended, and I tested it:

```bash
pi -p --no-skills --skill ./skills/tdd-dev --skill ./skills/code-review/SKILL.md "..."
```

The test behind it passed two explicit skills, one as a directory and one as a `SKILL.md` path, with skills installed in both user directories: only the two explicit ones reached the prompt.

Pi only lists skills in the system prompt when the session has `read` or `bash`. Tests with `--no-tools`, `--no-builtin-tools` or `--tools ls` got no skill list even with `--skill`; `--tools bash` got it. That list is not the only way in, though: a prompt that starts with `/skill:<name>` makes Pi read that skill's file itself and paste its text into the user message. With `--no-tools --skill ./extra/tdd` and the prompt `/skill:tdd add a test`, the request carried the whole `SKILL.md` body. Two limits, both tested: `/skill:` only expands a skill Pi has loaded, so under `--no-skills` a skill that sits only in `~/.agents/skills/` stayed out; and it only works when the prompt text itself starts with it. A prompt passed as `@file` arrives wrapped in a `<file>` tag, and a file starting with `/skill:usr` was not expanded.

`PI_CODING_AGENT_DIR` moves Pi's agent directory: pointing it at an empty directory stopped `~/.pi/agent/skills/` loading. `~/.agents/skills/` still loaded from `HOME`.

### How Orbi passes skills to each session

I read Orbi's source at `b5bf8d00`, after v0.7.45, including the [Pi command builder](https://github.com/orbi-build/orbi/blob/b5bf8d00/src/orbi/pi_command.py). `orbi draft`, introduced in v0.7.32, turns a sentence into issues. Configured skills means the `skills` paths in `orbi.toml`. User skills means `~/.agents/skills/` always, plus `~/.pi/agent/skills/` when `orbi.toml` sets no `pi_providers` file, plus whatever the Pi settings list under `"skills"` and the skills of installed packages. Setting `pi_providers` redirects `PI_CODING_AGENT_DIR` to the per-run directory below; Orbi builds that directory's `settings.json` from the user's own, and I did not test whether settings and package skills still load from there:

```text
<worktree>/.orbi/pi-agent/
```

Orbi does not pass `--approve`, so a repository's own skills load only if the runner account's Pi settings set `"defaultProjectTrust": "always"`, or, without `pi_providers`, if a `/trust` decision is saved (Pi keeps those in the agent directory, which `pi_providers` replaces). The exclusions in the table only drop paths from `orbi.toml`; a skill with the same name in a user directory still loads.

| Session | Tools | Skill flags | What the model sees |
|---|---|---|---|
| Implementer | Default `read`, `bash`, `edit`, `write` | One `--skill` per configured path except `review-fix-loop`; no `--no-skills` | Configured, user and trusted project skills |
| Reviewer | Same defaults | Same, also excluding `tdd-dev` | Configured skills after exclusions, user and trusted project skills |
| Comment-writing `ticket` role | `--no-tools` | Configured `--skill` entries except `review-fix-loop`; no `--no-skills` | None |
| Clarification gate | `--no-builtin-tools`, one extension | Same skill flags as `ticket` | None |
| `orbi suggest`: suggestions | `read`, `grep`, `find`, `ls` | `--no-skills`, one `--skill` for `suggest-ai-ready-issues` | Only that skill |
| `orbi suggest`: repository summary | `read`, `ls`, `find` | `--no-skills`, no `--skill` | None |
| `orbi draft`: drafting | `read`, `grep`, `find`, `ls`, `write_draft`, `ask_user`, `reply` | `--no-skills`, no `--skill` | None |
| `orbi draft`: fidelity pass | `--no-tools` | `--no-skills`, no `--skill` | None |

The remaining isolation gap is the implementer and reviewer: user skills can still reach them. An earlier version of this post said the ticket role could pick up installed skills. Pi does find them, but the role runs with `--no-tools`, so Pi never lists them in its prompt, and Orbi passes every prompt as an `@file`, so it never starts with `/skill:`. The clarification gate sees none for the same reason.

## Writing a Pi extension with one accepted output channel

If you want to write a Pi extension and are not sure what for, the clarification gate is the one I would point to first, because it solves a problem that has nothing to do with MCP or tooling: getting a structured answer out of a model reliably.

When a repository turns it on (`clarify_thin_tickets = true`), the gate runs before Orbi starts a delivery. One Pi session gets the issue text as its prompt and judges it on three checks (does it state an observable result, an acceptance condition, and a single outcome). If the issue is thin, Orbi stops the attempt, swaps the issue's label to `ai-needs-detail`, and leaves a comment (the stop comment) that lists what is missing and, when the model can propose one, a fix: split it into these tickets, or add these acceptance lines. Through Orbi v0.7.20 the gate asked the model for JSON in free text and parsed stdout. On Orbi Cloud's beta environment the gate dropped every proposal: the model put `kind` and `items` at the top level next to `missing`, the parser read only `suggestion`, and no stop comment ever showed a proposal; the same prompt sent three times to DeepSeek returned a usable split every time, at the wrong level ([Issue #1955](https://github.com/orbi-build/orbi/issues/1955)).

The fix was to stop parsing text. Since Orbi v0.7.21 (28 October) the engine ships `src/orbi/extensions/clarify_verdict.ts`, an extension that registers one tool. Below is an abridged version: the `split` proposal shape, the exported constants and the comments are cut, and the description is shortened. The [full file](https://github.com/orbi-build/orbi/blob/main/src/orbi/extensions/clarify_verdict.ts) is 138 lines:

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

`parameters` is a TypeBox schema with `additionalProperties: false` at every level, and Pi validates the model's arguments against it before `execute` runs, so a top-level `kind`, an unknown check id, or (in the full file) a split with one item never reaches the file. `execute` writes the validated arguments to the path the engine put in `ORBI_CLARIFY_OUT`, so the engine reads a file instead of stdout. And `terminate: true` ends the run after that call, so there is no follow-up turn to pay for; Pi honours it when every tool call in the turn returned it, so a turn that mixes one valid verdict with a failed call still continues. The session is started with `--no-builtin-tools --no-extensions --extension <that file>`: built-in tools off, discovery off, one extension on.

What the schema protects against is a malformed verdict, not a missing one. A rejected call only fails that call; the model may try again. If the run ends with no file, because the model answered in prose or never got a call past the schema, the engine treats that exactly as it treats a model that is down: the gate fails open and the delivery starts without the check. A thin issue then goes through as it did before the gate existed; what no longer happens is a proposal lost without a trace: the engine still checks each proposal it reads (an empty line is rejected, for example) and logs the reason when it drops one.

Pi aliases `typebox` to its own pinned copy when it loads an extension, so a file like this needs no `package.json` of its own. To try the shape yourself, save the code above as `verdict.ts` and run:

```bash
out="$(mktemp -d)/verdict.json"   # a fresh path each run, so you never read a previous result
ORBI_CLARIFY_OUT="$out" \
  pi -ne -e ./verdict.ts -nbt \
  -p 'Call clarify_verdict once with {"missing":[]}.'
cat "$out"
```

The failures look different from each other. Pi reports no error and `cat` says the file does not exist: the model never called the tool. Pi reports a validation error on the call: the arguments did not match the schema. The tool throws: `ORBI_CLARIFY_OUT` was not set or not writable.

## A Pi extension as the only write path: Orbi's draft tool

Our second extension drafts issues. Orbi Cloud, which hosts the same runner, has a page where you describe a change in a conversation and Orbi drafts the issue for you. Since Orbi v0.7.32 that drafting runs in the engine as `orbi draft`, which Cloud calls in the tenant's sandbox. A round starts a drafting Pi session, and the command the engine builds for it has this shape:

```bash
pi --tools read,grep,find,ls,write_draft,ask_user,reply \
   --no-skills --no-context-files \
   --no-extensions --extension <draft_tools.ts> \
   --print --session-dir <dir> --system-prompt <file> @<context file>
# later rounds add --continue and reuse the same --session-dir
```

so the allowlist rule holds here too. `--tools` is itself an allowlist: it replaces Pi's default tool selection, so `bash`, `edit` and `write` are not callable in this session. The extension, [`draft_tools.ts`](https://github.com/orbi-build/orbi/blob/b5bf8d00/src/orbi/extensions/draft_tools.ts), registers the last three tools on that list, and each one writes its validated arguments to the file named in `ORBI_DRAFT_OUT` and ends the run with `terminate: true`, the same pattern as the clarification gate:

- `write_draft` takes a one-sentence `reply` saying what will change, and the drafted issues, each a title, a body and optionally `after`, the 1-based position of an earlier issue in the same draft; when the issues are created, that one is recorded as blocked by the earlier one. That file is the only thing the engine accepts as a draft, so whatever the model prints to the screen never becomes one, and with no general write or edit tool the session cannot change files in the repository.
- `ask_user` is for the case where the request does not say what to build. The model sends a one-sentence `reply` and up to three questions; a question can carry two to four options, and the reasonable default's label ends with `(Recommended)`. The engine takes a recommended option itself and starts Pi again on the same session with `--continue`; after three such drafting runs in one round it gives up and the round fails; only questions without one end the round and wait for the person. When the person answers on the page, the next round starts Pi with `--continue` on the same session directory, so the conversation carries over without a resident process.
- `reply` is for a request that asks for no code change ("just review it and tell me"): the answer is a reply and no issue is drafted.

Two checks follow a draft. A second, independent Pi session, the fidelity pass, gets the request and the draft as text and checks that the draft asks for exactly what the person asked, and may reword titles and bodies (never the number of issues or their order); it runs with `--no-tools --no-skills --no-extensions` and answers in stdout, which is safe here only because it is optional: an empty or unusable answer keeps the drafter's version. Then the engine runs the clarification gate's check, the same function that judges an issue at claim time; a draft that fails goes back to the drafting session exactly once, as one more `--continue` turn.

An earlier Cloud-side version of this tool named its question tool `ask_user_question`, after a community extension, `@juicesharp/rpiv-ask-user-question`, which asks the questions in the terminal. We did not take that package as a dependency: in `pi -p`, the non-interactive mode Orbi always uses, it withdraws its tool entirely, because there is nobody at a terminal to answer.

## What to copy for your own Pi extensions

If you run Pi without a person at the keyboard, the short version of this post is four habits:

1. Start every unattended Pi with `--no-extensions`, then add back exactly the extensions you mean to load with `-e`. Keep the list in config, pin npm packages to a version and git sources to a commit SHA, and reject the config when a pin is missing. Orbi's own check accepts any git `@ref`, including a branch that moves.
2. When you need a structured answer from the model, give it one tool with a schema and `terminate: true`, write the result to a file, and treat anything else as no answer. Do not parse stdout.
3. When the model must produce an artifact, make the extension tool the only write path and leave the general write tools out of `--tools`.
4. Start unattended Pi with `--no-skills`, then add each skill with `--skill`. A session without `read` or `bash` gets no skill list in its system prompt, but a prompt starting with `/skill:<name>` still pulls a loaded skill's text in, so pass untrusted text as an `@file` rather than as the prompt itself.

In Orbi, the implementer and the reviewer are the two sessions where skill discovery is still on; the table in the skills section lists what each session sees.

## Related

This is the latest post in Orbi's Pi series. The [Pi hub](/guides/pi-coding-agent/) has the full runner, the [first post](/blog/orbi-on-pi-coding-agent/) follows one issue through every Pi session Orbi started for it, and the [harness comparison](/blog/pi-agent-harness/) stops three unattended Pi setups mid-task and compares what comes back. Orbi is open source: [orbi-build/orbi](https://github.com/orbi-build/orbi). If you would rather not run the runner yourself, read the [OpenHands comparison](/compare/openhands/) and [Cloud](/cloud/).
