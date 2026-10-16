---
title: Codex YOLO mode: what runs without approval
date: 2026-10-16
summary: Codex YOLO mode skips approvals and the local sandbox. Linux tests show what runs, how workspace-write differs, and what replaces the old full-auto flag.
lang: en
author: Lawrence Liu
image: /img/blog-codex-yolo-card.png
mirror: codex-yolo-mode
table_layout: comparison
---

Codex YOLO mode is `--yolo`, an alias for `--dangerously-bypass-approvals-and-sandbox`. It skips approval prompts and removes Codex's local sandbox. Use it inside an environment that supplies its own isolation, such as a disposable VM or a restricted CI runner. For unattended repository edits that should keep a sandbox, start with `codex -a never exec --sandbox workspace-write`.

I'm Lawrence Liu, the creator of [Orbi](https://github.com/orbi-build/orbi). I tested these choices on Linux with Codex CLI 0.159.3 on 16 October 2026. Orbi uses Pi's Codex provider; it does not run Codex CLI. The commands below are for people running the CLI themselves.

## How to start Codex YOLO mode

Inside your disposable, externally isolated runner:

```bash
codex exec --yolo "Run the tests and fix the failures."
```

The longer spelling has the same documented meaning:

```bash
codex exec --dangerously-bypass-approvals-and-sandbox \
  "Run the tests and fix the failures."
```

[OpenAI's CLI reference](https://learn.chatgpt.com/docs/cli/reference) defines both spellings. It also limits this mode to an externally hardened environment. A temporary Git worktree does not provide that boundary: the agent still runs as your operating-system user.

A process inside a VM or container can still access the files and credentials readable there. In my experiment, the outer environment hid my real home directory and other processes, exposed only fake writable fixtures, and provided no GPU devices. It retained network access for the model service and the local test listener, so this was not a network-isolation test.

## What Codex YOLO mode allowed in the experiment

I asked the agent to run the same Python probe under three configurations. It tried to write a file inside the repository, write a harmless sibling file outside it, and contact a loopback HTTP server. The outside directory was under the home cache, beyond the workspace and system temporary directories; `/tmp` would be a poor boundary test because workspace permissions can include temporary directories.

Each CLI configuration ran in a fresh outer sandbox with the same mount and network rules. I used `--ignore-user-config` and an isolated CLI home so my normal settings could not silently enable host access. Existing authentication was available only to that temporary CLI environment and was removed afterward. Managed requirements can still constrain effective permissions.

I checked the files and listener requests independently of the agent's answer. There was one fixed-probe run per CLI configuration, using `gpt-6.1-sol` at low reasoning effort:

| Execution | Workspace file | Sibling file outside workspace | Loopback HTTP request |
|---|---|---|---|
| Direct Python control | Written | Written | Received |
| `codex exec --sandbox read-only`, approvals `never` | Blocked | Blocked | Blocked |
| `codex exec --sandbox workspace-write`, approvals `never` | Written | Blocked | Blocked |
| `codex exec --yolo` | Written | Written | Received |

The fixed probe actually executed in all three CLI runs. Denied writes returned a read-only filesystem error; denied connections returned “Operation not permitted.” I also ran the probe directly through Codex's built-in `:read-only` and `:workspace` permission profiles and got the same boundary results.

The control confirmed that the fake files were writable and the listener was reachable. Under Codex YOLO mode, the sibling write and HTTP request succeeded within the outer environment. Under workspace-write, the repository write succeeded while the other two operations stopped at the inner sandbox.

This small matrix measures those operations on this Linux setup. It does not establish a general escape-proof boundary, test hostile repositories, or measure the automatic approval reviewer's decisions. The [experiment notes and probe](https://github.com/orbi-build/orbi-website/blob/beta/docs/blog/codex-yolo-mode-lab.md) describe the setup and reproduction steps.

## Run unattended while keeping workspace-write

For a job whose dependencies are already prepared and whose edits should stay within its allowed workspace:

```bash
codex -a never exec --sandbox workspace-write \
  "Fix the failing tests. Run the relevant checks and report what changed."
```

`exec` runs without the interactive terminal UI. `workspace-write` sets the filesystem boundary. `-a never` prevents approval requests, so a command outside the allowed permissions cannot obtain an escalation during the run. Dependency downloads or access to another directory may therefore leave the task incomplete. Prepare the required access before starting it.

I checked ordinary behavior separately with this request: create `greeting.py` containing `print('workspace ok')`, then run it. Workspace-write completed it without Codex YOLO mode, creating the file and printing the message; the YOLO run also completed it. Under read-only, the agent said it could not create the file and made no tool call. That was one ordinary-task run per configuration, separate from the fixed probes.

All six CLI runs exited 0, including the read-only task that never created its requested file. A successful CLI exit is not sufficient evidence that a coding task met its acceptance criteria. Check the expected files and run the project's tests before the next pipeline step uses the result.

## What happened to Codex full auto mode?

Older tutorials use this command:

```bash
codex exec --full-auto "fix the failing tests"
```

On the version I tested, even this parameter check fails before a task starts:

```text
$ codex --version
codex-cli 0.159.3

$ codex exec --full-auto --help
error: unexpected argument '--full-auto' found
# exit code: 2
```

OpenAI's current [non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode) says `--full-auto` is no longer supported. For scripts that need repository edits, it directs users to explicit `--sandbox workspace-write`, or to `--approve-for-me` for automatic approval review. Some search results still show an older compatibility example. Check the installed CLI to find out which behavior applies to your version.

When migrating a Codex full auto script, choose its required permissions explicitly. Replacing the removed flag with `--yolo` would also remove the local sandbox, which is a broader change than allowing repository edits.

## Automatic approval review is another choice

The documented middle option is:

```bash
codex exec --approve-for-me \
  "Fix the failing tests and run the relevant checks."
```

This preset uses workspace-write, on-request approvals and an automatic reviewer for eligible approval requests. The CLI reference lists conflicts with an explicit sandbox flag and with YOLO. Use the preset on its own.

[Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review) evaluates an action that needs approval. Commands already permitted inside the sandbox run without that review; approved escalations can cross the normal boundary. After a denial, the agent must find a materially safer alternative or stop and ask the user. Account and organization policy can constrain this mode.

I confirmed that 0.159.3 accepts the parameter. I did not test reviewer decisions in this matrix. Approval review also has a different job from reviewing a patch: permission to execute a command does not prove the resulting code is correct or ready to merge.

## Where Orbi fits after a CLI task

Codex YOLO mode answers which commands may run without prompting. A recurring delivery workflow also needs a queue, acceptance checks and responsibility for the resulting pull request.

I build Orbi to handle that workflow. Its Codex provider uses Pi's integration, so these CLI flags are not Orbi settings. The [Codex integration guide](/guides/codex-github-issues/?ref=blog-codex-yolo) shows the separate GitHub Issue workflow. For the CLI task above, keep the workspace sandbox when it meets the job's requirements; use an external isolation boundary when the job requires full bypass.

## Related

- [Claude Code YOLO mode and permission boundaries](/blog/claude-code-yolo-mode/)
- [Claude Code sandbox: filesystem and network checks](/blog/claude-code-sandbox/)
- [Compare Codex delivery workflows](/compare/codex/?ref=blog-codex-yolo)
- [Try Orbi Cloud](/cloud/?ref=blog-codex-yolo)
