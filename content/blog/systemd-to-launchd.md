---
title: systemd to launchd: what 1,548 macOS CI runs caught
date: 2026-11-09
summary: A systemd to launchd checklist tested on hosted macOS: env files, PATH, sed, timeout, kickstart. Plus what 1,548 macOS CI runs caught and what they cost.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-systemd-to-launchd-card.png
mirror: systemd-to-launchd
---

[Orbi](https://github.com/orbi-build/orbi) is an open-source runner that takes GitHub Issues through review to merged, released changes. Until September it ran only under systemd, the Linux service manager; this post covers its move from systemd to launchd, which starts background jobs on macOS. It is for developers porting a Linux service or agent runner to macOS, or deciding whether to pay for macOS CI: you get a checklist tested on hosted macOS and eight weeks of CI data from 15 September through 8 November 2026 UTC.

I'm Larry 🍀 Orbi, the creator of Orbi. On 9 November I ran the checklist probes on a GitHub-hosted macOS 15 runner (arm64), with macOS 15.8.2 and a logged-in GUI domain, `gui/501`. This was a hosted VM. Orbi's full installer and delivery loop still have not run on a personal Mac; the README's “not yet verified on real hardware” caveat stands.

## The port that passed review

On 14 September 2026 (+08), [Issue #849](https://github.com/orbi-build/orbi/issues/849) became [PR #851](https://github.com/orbi-build/orbi/pull/851), which merged 39 minutes after opening. Nobody ran it on a Mac. Reviewing the diff against `launchctl(1)` found six defects: unexported secrets, GNU-only installer commands, a PATH missing Homebrew, an unguarded `/proc` read, a missing pre-start command, and documentation that still described only systemd. The resulting tickets, [#867](https://github.com/orbi-build/orbi/issues/867) through [#872](https://github.com/orbi-build/orbi/issues/872), opened after midnight on 15 September and closed that morning. The [published defect note](https://docs.orbi.build/notes/macos-six-defects) has the incident details.

## The systemd to launchd checklist

Compare the service behavior you need to preserve. Translating a unit file into a plist leaves shell semantics and platform assumptions to check separately.

### Export the environment file, and test a missing file

systemd's `EnvironmentFile=` supplies variables to the process it starts. launchd has no equivalent env-file directive. Sourcing the same file in a shell wrapper creates shell variables; assignments without `export` need `set -a` to reach the child.

The hosted runner's `/bin/sh` was GNU bash 3.2.57. My test file, `env`, contained the dummy assignment `OPENAI_API_KEY=sk-test-123`. These macOS probes count that variable in the environment after `exec`:

```sh
$ /bin/sh -c '. ./env; exec /usr/bin/env' | grep -c '^OPENAI_API_KEY='
0
# pipeline exit 1

$ /bin/sh -c 'set -a; . ./env; set +a; exec /usr/bin/env' | grep -c '^OPENAI_API_KEY='
1
# pipeline exit 0
```

The missing-file case needs its own test. Redirecting stderr suppresses the diagnostic, but the failed dot command aborted macOS's `/bin/sh`:

```sh
$ /bin/sh -c '. ./missing-env 2>/dev/null; echo reached-exec'
# exit 1, no output

$ /bin/sh -c '[ -r ./missing-env ] && { set -a; . ./missing-env; set +a; }; echo reached-exec'
reached-exec
# exit 0
```

The `[ -r ] &&` guard makes the file optional. Use it only when starting without the file is intended. A real LaunchAgent using this guarded `set -a` wrapper printed `OPENAI_API_KEY=sk-test-123`. On Linux, plain bash continued past the missing file while POSIX-mode bash aborted, so a plain-bash test would have hidden the failure.

### Set launchd PATH explicitly

The systemd unit already supplied a service PATH. Copying it into the plist omitted the location where Homebrew installs tools on Apple Silicon. Set launchd environment variables through the plist's `EnvironmentVariables` dictionary, including `PATH`; do not depend on your terminal's shell setup. [Homebrew documents `/opt/homebrew` as its Apple Silicon prefix](https://docs.brew.sh/Installation).

On the hosted Mac, a LaunchAgent without `EnvironmentVariables` printed:

```text
PATH=/usr/bin:/bin:/usr/sbin:/sbin
```

Inside that job, `command -v git brew gh` found only `/usr/bin/git`, although the runner had `/opt/homebrew/bin/brew`. A LaunchAgent with PATH set through `EnvironmentVariables` printed `PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`. Both test plists passed `plutil -lint`.

Orbi's current plist also puts `/opt/homebrew/bin` first, followed by its user tool directories. Parsing that template on Linux verifies its configuration; the hosted LaunchAgents show why the explicit PATH matters.

### Check commands outside the service manager

systemd never supplied GNU utilities, but the Linux installation had them. Porting the service exposed those dependencies in `install.sh`.

On the macOS runner, `timeout` was absent:

```sh
$ timeout 5 true
/bin/bash: timeout: command not found
# exit 127
```

Orbi's macOS CI uses a small Perl alarm shim. Its file contents are:

```sh
#!/bin/sh
exec perl -e 'alarm shift; exec @ARGV' "$@"
```

On macOS, it stopped the sleeping process after 1.056 seconds of real time and passed a child's failure status through:

```sh
$ ./shim/timeout 1 sleep 5
# Alarm clock; exit 142; real 0m1.056s

$ ./shim/timeout 5 sh -c 'exit 3'
# exit 3
```

GNU `timeout` returned `124` in the Linux comparison. Check what your caller expects before treating the shim's `142` as interchangeable.

That shim also fails open. On the hosted macOS runner, `./shim/timeout 5 no-such-command-xyz`, `./shim/timeout 5` (no command) and `./shim/timeout '' sleep 2` all exited `0`: Perl's `exec` returns when it cannot run the command, and the script then ends successfully. A CI step that loses a tool from PATH would pass. Orbi's macOS CI still carries this version. This one checks its input and exits non-zero when the command cannot start:

```sh
#!/bin/sh
# timeout SECONDS COMMAND [ARG...]: fail closed on bad input or a command that cannot run
case $1 in ''|*[!0-9]*) echo "timeout: seconds must be a positive integer" >&2; exit 125;; esac
[ "$1" -gt 0 ] || { echo "timeout: seconds must be a positive integer" >&2; exit 125; }
[ $# -ge 2 ] || { echo "timeout: missing command" >&2; exit 125; }
exec perl -e 'alarm shift; exec { $ARGV[0] } @ARGV or do { print STDERR "timeout: $ARGV[0]: $!\n"; exit 127 }' "$@"
```

On macOS it exited `127` for the missing command, `125` for the missing command argument and for the empty seconds value, `142` after one second on `sleep 5`, and passed `exit 3` through. Save it as an executable file named `timeout` in a directory on PATH; it is a script, not a line to paste into a terminal.

BSD sed reproduced the installer bug in [#868](https://github.com/orbi-build/orbi/issues/868):

```sh
$ sed -i 's#PLACEHOLDER#deepseek#' orbi.toml
sed: 1: "orbi.toml": invalid command code o
# exit 1; file unchanged
```

A single `sed -i -e 's#PLACEHOLDER#deepseek#' orbi.toml` exited `0` and made the replacement, but left `orbi.toml-e`: BSD sed consumed `-e` as the backup suffix. The Quickstart command in [#2074](https://github.com/orbi-build/orbi/issues/2074) had three `-e` expressions:

```sh
$ sed -i -e '/^pi_providers = /d' -e '/^pi_provider = /d' -e '/^pi_model = /d' orbi.toml && echo chain-continued
sed: -e: No such file or directory
```

The file stayed unchanged and the `&&` chain stopped. Making the suffix explicit worked on macOS:

```sh
$ sed -i.bak 's#PLACEHOLDER#deepseek#' orbi.toml && rm -f orbi.toml.bak
# exit 0; provider became "deepseek"
```

`perl -pi -e 's#PLACEHOLDER#deepseek#' orbi.toml` also made the replacement and exited successfully on macOS.

### Guard Linux process-filesystem reads

The Linux runner used `/proc/stat` to calculate boot time during idle-session recovery. That filesystem belongs to Linux; moving scheduling to launchd does not provide it.

On macOS:

```sh
$ ls /proc/stat
ls: /proc/stat: No such file or directory
# exit 1

$ sysctl -n kern.boottime
{ sec = 1794188815, usec = 0 } Mon Nov  9 01:46:55 2026
# exit 0
```

`sysctl -n kern.boottime` supplies boot time on macOS. Orbi guards the `/proc` read and skips this Linux-specific recovery logic there; it does not use that sysctl as a replacement. A Linux probe against an absent directory reproduced the unguarded `FileNotFoundError`; the guarded version returned no candidates.

### Preserve the pre-start dependency

The hosted LaunchAgent above ran its shell wrapper through `/bin/sh -c` in `ProgramArguments`. Orbi also needs a pre-start dependency: its systemd unit uses `ExecStartPre` to run `orbi sync-engine-source` before the runner. launchd has no matching plist key. Put that dependency into the shell command and join it with `&&`.

The dependency-chain probe ran on Linux: my `pre.sh` fixture printed its argument and exited with that status.

```sh
$ sh -c './pre.sh 0 && exec echo main-started'
pre: 0
main-started
# exit 0

$ sh -c './pre.sh 1 && exec echo main-started'
pre: 1
# exit 1; main did not start
```

Here is the current Orbi wrapper line printed by `plistlib`, with template values replaced by `X`:

```sh
[ -r 'X/.orbi/env' ] && { set -a; . 'X/.orbi/env'; set +a; }; 'X/.local/bin/orbi' sync-engine-source && exec 'X/.local/bin/orbi'
```

It combines optional environment loading with a required pre-start step. The semicolon allows an absent env file; the final `&&` prevents starting the runner after synchronization fails. The [plist manual's `ProgramArguments` definition](https://keith.github.io/xcode-man-pages/launchd.plist.5.html) describes an argument vector: the explicit shell interprets those operators.

### Start without killing existing work

Preserve the intended start operation when translating service-management commands. For an already loaded job, the documented command is:

```sh
launchctl kickstart "gui/$(id -u)/org.orbi.runner.1"
```

I tested both forms against a long-running LaunchAgent on the hosted runner. Plain `kickstart` exited `0`, kept PID `19120` and added no start line to the log. `kickstart -k` also exited `0`, but logged a new start with PID `19364`. That matches [`launchctl(1)`](https://keith.github.io/xcode-man-pages/launchctl.1.html): `-k` kills a running instance before restarting it. Leave it off when the instruction is to start the runner: a running instance may already be delivering an Issue.

## What 1,548 macOS CI runs caught

From 15 September through 8 November 2026 UTC, the macOS workflow recorded **1,548 runs**, including PR and main-push runs. Of its `73` failures, `56` had a Linux failure at the same commit. That comparison matches commit SHAs; it does not establish that both platforms failed for the same reason.

The remaining `17` had no recorded Linux failure at the same commit; I call these macOS-only failures. Of those, `5` occurred on the PR introducing the workflow: missing coverage tooling, a stub PATH missing `mkdir`, and temporary-path assumptions were among the setup problems. I classified the other `12` from their failed logs:

| Failure class | Runs | What the logs or fix showed |
|---|---|---|
| Wall-clock timing | 5 | Idle-recovery assertions depended on elapsed time; [#971](https://github.com/orbi-build/orbi/issues/971) records a release gate blocked by this class. |
| Release-docs timing | 3 | A released tag's documentation page was not available when checked. |
| Temporary-path assertion | 2 | pytest's `tmp_path` was under `/private/var`, outside the redaction regex. |
| Concurrent Git fetch | 1 | Git reported `commondir: Undefined error: 0`. |
| Git background maintenance lock | 1 | The `orbi suggest` feature [PR #1579](https://github.com/orbi-build/orbi/pull/1579) hit this lock in a test; its follow-up commit updated only the test snapshot. |

The temporary-path cases were fixed with platform-independent assertions in [PR #1323](https://github.com/orbi-build/orbi/pull/1323) and [PR #1723](https://github.com/orbi-build/orbi/pull/1723). The regex already covers `/Users` paths; these failures exercised pytest temporary paths under `/private/var`. The fixes changed the assertions, leaving that regex unchanged.

By my classification, none of those `12` was a defect a Mac user of the installer would have hit. Most of the gate's demonstrated value was keeping the test suite honest on macOS. The Git failures remain useful evidence about CI behavior, without establishing an installer failure.

## What it cost

The billing API recorded these macOS minutes for the `orbi` repository. The share column divides this macOS list-price cost by the organization's total Actions cost before discounts:

| Month, 2026 | macOS minutes | List-price cost | Share of org Actions cost before discounts | Net Actions charge for orbi |
|---|---|---|---|---|
| September | 3,772 | $233.86 | 67% | $0 |
| October | 4,332 | $268.58 | 68% | $0 |

`orbi` is public: its Actions charges were fully discounted in both months. [GitHub's runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing) lists macOS at $0.062 per minute and Linux at $0.006 per minute for the standard SKUs used here. On this public repository, that usage cost nothing. On a private repository, the same usage would be billed at list price beyond any included allowance.

The [paths filter in PR #1272](https://github.com/orbi-build/orbi/pull/1272) merged on 21 September at 23:31 (+08). The two periods differ in length, so compare pull-request-triggered CI runs per day:

| Period (UTC) | macOS runs | Linux runs | macOS per day | Linux per day | macOS share |
|---|---|---|---|---|---|
| 15 Sep 02:01 to 21 Sep 15:31, before the filter (6.6 days) | 269 | 273 | 41.0 | 41.6 | 99% |
| 21 Sep 15:31 to 8 Nov 13:19, after the filter (47.9 days) | 518 | 702 | 10.8 | 14.7 | 74% |

The filter skipped macOS on about a quarter of pull-request runs; `src/orbi/**` still matches most changes, and pushes to main always run macOS CI. Overall activity also dropped between the two periods, so the per-day fall is not all the filter's doing, and none of these numbers isolates its dollar savings.

## What CI could not see

Both later bugs in the Mac setup docs came from a documentation audit reading man pages. [#2074](https://github.com/orbi-build/orbi/issues/2074), opened on 3 November at 00:11 (+08), identified the Quickstart's multiple-expression `sed -i -e` command. The same portability class had appeared in the installer under #868, seven weeks earlier.

[#2109](https://github.com/orbi-build/orbi/issues/2109), opened on 3 November at 08:15 (+08), records how `launchctl kickstart -k` reached the Quickstart: [#2089](https://github.com/orbi-build/orbi/pull/2089), the fix for #2074, added it following the audit's suggested wording. Fixing one Mac documentation bug introduced another: starting the runner could kill a delivery already running.

CI found neither bug. I have now run both commands on the hosted macOS runner: the #2074 command failed as described, and `-k` restarted the running job. Commands copied from setup docs need their own portability checks.

## If you are porting a service to launchd

- Test the child process's environment, including the missing-file branch, under the shell named in your plist.
- Put the required tool directories in `EnvironmentVariables`. Check GNU-only commands with those tools absent from PATH.
- Preserve pre-start failure behavior and guard Linux-only process inspection.
- Keep parser checks, hosted LaunchAgent probes and a full installation on a personal Mac as separate evidence. Check the commands in your setup docs too.

## Timeline (+08)

| Date and time, 2026 (+08) | Event |
|---|---|
| 14 September 18:14 | macOS support requested in #849. |
| 14 September 20:41 → 21:20 | #851 opened and merged. |
| 15 September 00:06 → 00:18 | Six defect tickets opened after the diff read. |
| 15 September 08:33 | Last of those tickets closed. |
| 15 September 11:48 | macOS CI merged in [#896](https://github.com/orbi-build/orbi/pull/896). |
| 16 September 11:02 | #971 recorded a timing test blocking the release gate. |
| 21 September 23:31 | #1272 added PR paths filtering. |
| 3 November 00:11 | #2074: Quickstart sed portability. |
| 3 November 08:15 | #2109: Quickstart kickstart behavior. |
| 9 November | Checklist run on a hosted macOS 15 runner. |

## Related

[From a GitHub Issue to a release](/guides/issue-to-release/) is the loop this runner drives. [Running Claude Code unattended](/blog/run-claude-code-unattended/) covers another part of operating an agent without sitting beside it. The [macOS defect note](https://docs.orbi.build/notes/macos-six-defects) records the original port; the [Claude Code comparison](/compare/claude-code/?ref=blog-launchd) explains where Orbi fits. [Orbi Cloud](/cloud/?ref=blog-launchd) runs the Issue-to-release loop on your GitHub repositories.
