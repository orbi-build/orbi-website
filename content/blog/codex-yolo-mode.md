---
title: Codex YOLO mode: what runs without approval
date: 2026-10-16
summary: Codex YOLO mode skips approvals and the local sandbox. Linux tests show what it allows; the guide also explains Codex auto mode and the full-auto removal.
lang: en
author: Lawrence Liu
image: /img/blog-codex-yolo-card.png
mirror: codex-yolo-mode
---

Codex YOLO mode is `--yolo`, an alias for `--dangerously-bypass-approvals-and-sandbox`. It skips approval prompts and removes Codex's local sandbox. Use it inside an environment that supplies its own isolation, such as a disposable VM or a restricted CI runner. For unattended repository edits that should keep a sandbox, start with `codex -a never exec --sandbox workspace-write "<task>"`. Codex auto mode is a different preset that still stops for approval prompts; it is [explained below](#codex-auto-mode-and-what-happened-to-full-auto).

I'm Lawrence Liu, the creator of [Orbi](https://github.com/orbi-build/orbi). I tested these choices on Linux with Codex CLI 0.159.3 on 16 October 2026. Orbi runs the Pi coding agent, and its Codex integration uses Pi's `openai-codex` provider rather than Codex CLI. The commands below are for people running the CLI themselves.

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

A VM or container still exposes the files and credentials readable inside it. My outer test environment hid the real home directory and other processes, exposed fake writable fixtures, and had no GPU devices. Network access stayed on for the model and test listener.

## What Codex YOLO mode allowed in the experiment

<figure class="post-media">
<img src="/img/blog-codex-yolo-boundaries-en.webp" alt="The outer test environment contains Codex and fake fixtures. YOLO removes Codex's inner sandbox; the outer environment remains." width="1800" height="1530" loading="lazy">
<figcaption>Codex YOLO mode removes the inner boundary. The outer environment retained network access; this experiment did not test network isolation.</figcaption>
</figure>

I asked the agent to run the same Python probe under three configurations: write inside the repository, write a harmless sibling file outside it, and contact a loopback HTTP server. The sibling directory was under the home cache, beyond the workspace and system temporary directories. `/tmp` is a poor boundary test because workspace permissions can include temporary directories.

Each configuration ran in a fresh outer sandbox with the same mount and network rules. `--ignore-user-config` and an isolated CLI home excluded my normal settings. Authentication was copied into the temporary environment and removed afterward. Managed requirements can still constrain effective permissions.

I checked the files and listener requests independently of the agent's answer. There was one fixed-probe run per CLI configuration, using `gpt-6.1-sol` at low reasoning effort:

| Execution | Workspace file | Sibling file outside workspace | Loopback HTTP request |
|---|---|---|---|
| Direct Python control | Written | Written | Received |
| `codex exec --sandbox read-only`, approvals `never` | Blocked | Blocked | Blocked |
| `codex exec --sandbox workspace-write`, approvals `never` | Written | Blocked | Blocked |
| `codex exec --yolo` | Written | Written | Received |

The fixed probe actually executed in all three CLI runs. Denied writes returned a read-only filesystem error; denied connections returned “Operation not permitted.” I also ran the probe directly through Codex's built-in `:read-only` and `:workspace` permission profiles and got the same boundary results.

This small matrix measures those operations on this Linux setup. It does not establish a general escape-proof boundary, test hostile repositories, or measure the automatic approval reviewer's decisions. The [experiment notes and probe](https://github.com/orbi-build/orbi-website/blob/beta/docs/blog/codex-yolo-mode-lab.md) describe the setup and reproduction steps.

## Run unattended while keeping workspace-write

For a job whose dependencies are already prepared and whose edits should stay within its allowed workspace:

```bash
codex -a never exec --sandbox workspace-write \
  "Fix the failing tests. Run the relevant checks and report what changed."
```

`exec` runs without the interactive terminal UI. `workspace-write` sets the filesystem boundary. `-a never` prevents approval requests, so a command outside the allowed permissions cannot obtain an escalation during the run. Dependency downloads or access to another directory may therefore leave the task incomplete. Prepare the required access before starting it.

I also asked each configuration to create `greeting.py` containing `print('workspace ok')`, then run it. Workspace-write completed it without Codex YOLO mode; YOLO also completed it. Under read-only, the agent said it could not create the file and made no tool call. These three ordinary-task runs were separate from the fixed probes.

All six CLI runs exited 0, including the read-only task that never created its file. Before the next pipeline step, check the expected files and project tests; a successful CLI exit alone does not prove the task met its acceptance criteria.

## Codex auto mode, and what happened to full auto

Codex auto mode is the preset OpenAI's docs call **Auto**. The [approvals and security guide](https://learn.chatgpt.com/docs/agent-approvals-security) defines it as the `workspace-write` sandbox with `on-request` approvals. Codex reads, edits and runs commands inside the workspace without asking. With the default network setting, it asks before editing files outside the workspace or running commands that need network access. When Codex starts in a version-controlled folder, it recommends Auto as the default; it may stay read-only until you trust the folder. Mid-session, `/permissions` switches presets, for example from Auto to Read Only. Auto needs someone at the terminal to answer those prompts, so an unattended run should use the workspace-write command from the previous section. To choose Auto explicitly:

```bash
codex --sandbox workspace-write --ask-for-approval on-request
```

Older tutorials use a shortcut instead:

```bash
codex exec --full-auto "fix the failing tests"
```

In Codex CLI 0.100.0, the interactive [`codex --full-auto`](https://github.com/openai/codex/blob/rust-v0.100.0/codex-rs/tui/src/cli.rs#L79) was a shortcut for `-a on-request` plus `--sandbox workspace-write`, the same pair as Auto. Under `codex exec`, `--full-auto` set only the sandbox, and approvals stayed at exec's [default of never](https://github.com/openai/codex/blob/rust-v0.100.0/codex-rs/exec/src/lib.rs#L246). The old exec shortcut therefore behaved like `codex -a never exec --sandbox workspace-write`. On the version I tested, the flag now fails the parameter check before a task starts:

```text
$ codex --version
codex-cli 0.159.3

$ codex exec --full-auto --help
error: unexpected argument '--full-auto' found
# exit code: 2
```

Codex CLI 0.163.0 printed the same error when I repeated the check on 17 October 2026, and interactive `codex --full-auto --help` failed the same way. OpenAI's current [non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode) says `--full-auto` is no longer supported. For scripts that need repository edits, it directs users to explicit `--sandbox workspace-write`, or to `--approve-for-me` on its own for automatic approval review (that preset already includes workspace-write, so don't add `--sandbox`). Some search results describe an older transition: [Codex CLI 0.130.0](https://github.com/openai/codex/blob/rust-v0.130.0/codex-rs/exec/src/cli.rs#L99) still accepted `--full-auto` with a deprecation warning. Check the installed CLI to find out which behavior applies to your version.

OpenAI's [table of common combinations](https://learn.chatgpt.com/docs/agent-approvals-security#common-sandbox-and-approval-combinations) puts these modes side by side; the `--approve-for-me` shortcut is from the [CLI reference](https://learn.chatgpt.com/docs/cli/reference):

| Name in OpenAI's guide | Flags | Codex sandbox | Approval requests go to |
|---|---|---|---|
| Auto | None in a trusted version-controlled folder; otherwise `--sandbox workspace-write --ask-for-approval on-request` | workspace-write | You |
| Auto-review | `--approve-for-me` (alias `--not-so-yolo`) | workspace-write | A reviewer agent, for eligible requests |
| Dangerous full access | `--yolo` | None | Nobody; there are no prompts |

When migrating a Codex full auto script, choose its required permissions explicitly. For a script that only needs repository edits, replace `codex exec --full-auto "..."` with `codex -a never exec --sandbox workspace-write "..."`. Replacing the removed flag with `--yolo` would also remove the local sandbox, which is a broader change than allowing repository edits.

## Automatic approval review is another choice

The documented middle option is:

```bash
codex exec --approve-for-me \
  "Fix the failing tests and run the relevant checks."
```

This preset uses workspace-write, on-request approvals and an automatic reviewer for eligible approval requests. The CLI reference lists conflicts with an explicit sandbox flag and with YOLO. Use the preset on its own.

[Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review) evaluates an action that needs approval. Commands already permitted inside the sandbox run without that review; approved escalations can cross the normal boundary. After a denial, the agent must find a materially safer alternative or stop and ask the user. Account and organization policy can constrain this mode.

I confirmed that 0.159.3 accepts the parameter. I did not test reviewer decisions in this matrix. Approval review also has a different job from reviewing a patch: permission to execute a command does not prove the resulting code is correct or ready to merge.

## How Orbi runs unattended and gates a merge

I built Orbi to take a coding task through a PR, review and merge. Write the acceptance criteria in a GitHub Issue and add `ai-ready`; the runner starts Pi in a separate worktree, pushes the task branch and opens a PR.

<figure class="post-media">
<img src="/img/blog-codex-yolo-orbi-flow-en.webp" alt="Orbi's successful delivery path: ai-ready Issue, Pi in a worktree, PR, fresh review and repository checks, then merge. Separately, a Cloud release button creates a release Issue leading through gates to a tag and GitHub Release." width="1800" height="2010" loading="lazy">
<figcaption>A fresh Pi session reviews the PR. Release starts with a separate action in Cloud.</figcaption>
</figure>

The runner checks that review's verdict and rejects externally changed PR heads. It can absorb a conflict-free base update and check the new head without another review session. Pending checks defer merge; failed checks block it. Test coverage depends on the checks your repository defines.

A worktree separates checkouts, not process permissions. When self-hosting, configure the runner's OS account, credentials and network access accordingly. Review cannot undo permissions already used during execution.

### Release from Cloud

1. Sign in to the status page and open **Versions** for your repository. With only one connected repository, expand **Usage and settings → Versions** at the bottom.
2. Click **Create release task** on the current version's row. Cloud creates the GitHub release Issue and its labels; Orbi runs the gates and publishes the tag and GitHub Release.

<figure class="post-media">
<img src="/img/blog-codex-yolo-release-proof.webp" alt="Published GitHub release notes for v0.5.60 identify release Issue 1522 and closed scope Issues 1518 and 1519." width="1944" height="1824" loading="lazy">
<figcaption>Published release notes, captured on 16 October 2026. Release Issue #1522 was created from Cloud.</figcaption>
</figure>

Source: [v0.5.60 release](https://github.com/orbi-build/orbi/releases/tag/v0.5.60) and [Cloud-created Issue #1522](https://github.com/orbi-build/orbi/issues/1522).

Self-hosted Orbi supports Codex OAuth through Pi's `openai-codex` provider; follow the [Codex integration guide](/guides/codex-github-issues/?ref=blog-codex-yolo). For managed delivery, [connect your repository to Orbi Cloud](/cloud/?ref=blog-codex-yolo). Cloud uses its own model configuration, not your local Codex login or Codex YOLO mode permissions. The CLI flags above are not Orbi settings.

## Related

- [Claude Code YOLO mode and permission boundaries](/blog/claude-code-yolo-mode/)
- [Claude Code sandbox: filesystem and network checks](/blog/claude-code-sandbox/)
- [Compare Codex delivery workflows](/compare/codex/?ref=blog-codex-yolo)
- [Try Orbi Cloud](/cloud/?ref=blog-codex-yolo)
