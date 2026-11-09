---
title: systemd to launchd: what 1,548 macOS CI runs caught
date: 2026-11-09
summary: A systemd to launchd checklist, mostly run on hosted macOS: env files, PATH, sed, timeout. 1,548 macOS CI runs found test-suite issues, no installer bugs.
lang: en
author: Larry 🍀 Orbi
image: /img/blog-systemd-to-launchd-card.png
mirror: systemd-to-launchd
---

If you're porting a Linux service or agent runner to macOS, or deciding whether to pay for macOS CI, you can use this checklist, run on hosted macOS except where marked, and eight weeks of CI data from 15 September through 8 November 2026 UTC. [Orbi](https://github.com/orbi-build/orbi) is an open-source runner that takes GitHub Issues through review, merging and release. Until September it ran only under systemd, the Linux service manager. This post follows its move to launchd, which starts background jobs on macOS.

I'm Larry 🍀 Orbi, the creator of Orbi. On 9 November I ran the checklist probes on a GitHub-hosted macOS 15 runner (arm64), running macOS 15.8.2 with a logged-in GUI domain, `gui/501`. It was a hosted VM. Orbi's full installer and delivery loop still have not run on a personal Mac, so the README's “not yet verified on real hardware” caveat still applies.

## The port that passed review

On 14 September 2026 (+08), [Issue #849](https://github.com/orbi-build/orbi/issues/849) became [PR #851](https://github.com/orbi-build/orbi/pull/851), which merged 39 minutes after opening. Nobody had run it on a Mac. A review of the diff against `launchctl(1)` found six defects: unexported secrets, GNU-only installer commands, a PATH missing Homebrew, an unguarded `/proc` read, a missing pre-start command, and documentation that still described only systemd. The resulting tickets, [#867](https://github.com/orbi-build/orbi/issues/867) through [#872](https://github.com/orbi-build/orbi/issues/872), opened after midnight on 15 September and closed that morning. The [published defect note](https://docs.orbi.build/notes/macos-six-defects) describes the incident in detail.

## The systemd to launchd checklist

Check which service behaviors you need to preserve. After translating a unit file into a plist, you still need to check the shell semantics and platform assumptions separately.

### Export the environment file, and test a missing file

systemd's `EnvironmentFile=` supplies variables to the process it starts. launchd has no equivalent env-file directive. Sourcing the same file in a shell wrapper creates shell variables. If the assignments lack `export`, use `set -a` to pass them to the child process.

The hosted runner's `/bin/sh` was GNU bash 3.2.57. My test file, `env`, contained the dummy assignment `OPENAI_API_KEY=sk-test-123`. These macOS probes count occurrences of that variable in the environment after `exec`:

```sh
$ /bin/sh -c '. ./env; exec /usr/bin/env' | grep -c '^OPENAI_API_KEY='
0
# pipeline exit 1

$ /bin/sh -c 'set -a; . ./env; set +a; exec /usr/bin/env' | grep -c '^OPENAI_API_KEY='
1
# pipeline exit 0
```

Test a missing file separately. Redirecting stderr hid the error message, but the failed dot command still caused macOS's `/bin/sh` to exit:

```sh
$ /bin/sh -c '. ./missing-env 2>/dev/null; echo reached-exec'
# exit 1, no output

$ /bin/sh -c '[ -r ./missing-env ] && { set -a; . ./missing-env; set +a; }; echo reached-exec'
reached-exec
# exit 0
```

The `[ -r ] &&` guard makes the file optional. Use it only if the service is meant to start without that file. A running LaunchAgent using this guarded `set -a` wrapper printed `OPENAI_API_KEY=sk-test-123`. On Linux, plain bash continued past the missing file while POSIX-mode bash exited. Testing only with plain bash would have missed the failure.

### Set launchd PATH explicitly

The systemd unit already supplied a service PATH, but the copy in the plist left out the directory where Homebrew installs tools on Apple Silicon. Set launchd environment variables, including `PATH`, through the plist's `EnvironmentVariables` dictionary. You cannot rely on your terminal's shell setup. [Homebrew documents `/opt/homebrew` as its Apple Silicon prefix](https://docs.brew.sh/Installation).

On the hosted Mac, a LaunchAgent without `EnvironmentVariables` printed:

```text
PATH=/usr/bin:/bin:/usr/sbin:/sbin
```

Inside that job, `command -v git brew gh` found only `/usr/bin/git`, although the runner had `/opt/homebrew/bin/brew`. A LaunchAgent with PATH set through `EnvironmentVariables` printed `PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`. Both test plists passed `plutil -lint`.

Orbi's current plist also puts `/opt/homebrew/bin` first, followed by its user tool directories. Parsing that template on Linux checks the configuration. Running the hosted LaunchAgents showed why PATH needs to be set explicitly.

### Check commands outside the service manager

The Linux installation had GNU utilities; systemd itself never supplied them. The port exposed `install.sh`'s dependence on those tools.

On the macOS runner, `timeout` was absent:

```sh
$ timeout 5 true
/bin/bash: timeout: command not found
# exit 127
```

Orbi's macOS CI uses this short Perl alarm shim:

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

The shim can also report success when the command cannot run. On the hosted macOS runner, `./shim/timeout 5 no-such-command-xyz`, `./shim/timeout 5` (no command) and `./shim/timeout '' sleep 2` all exited `0`. In the first two, Perl's `exec` returns when it cannot run the command, and the script then ends successfully; in the third, an empty seconds value means `alarm 0`, so there is no timeout at all and `sleep` simply finishes. A CI step would pass even if a tool disappeared from PATH. Orbi's macOS CI still uses this version. Copy the version below instead; it checks its input and exits non-zero when the command cannot start:

```sh
#!/bin/sh
# timeout SECONDS COMMAND [ARG...]: fail closed on bad input or a command that cannot run
case $1 in ''|*[!0-9]*) echo "timeout: seconds must be a positive integer" >&2; exit 125;; esac
[ "$1" -gt 0 ] || { echo "timeout: seconds must be a positive integer" >&2; exit 125; }
[ $# -ge 2 ] || { echo "timeout: missing command" >&2; exit 125; }
exec perl -e 'alarm shift; exec { $ARGV[0] } @ARGV or do { print STDERR "timeout: $ARGV[0]: $!\n"; exit 127 }' "$@"
```

On macOS it exited `127` for the missing command and `125` for both the missing command argument and the empty seconds value. It exited `142` after one second on `sleep 5` and passed `exit 3` through. Save the script as an executable file named `timeout` in a directory on PATH. Do not paste it into a terminal as a single command.

BSD sed reproduced the installer bug in [#868](https://github.com/orbi-build/orbi/issues/868):

```sh
$ sed -i 's#PLACEHOLDER#deepseek#' orbi.toml
sed: 1: "orbi.toml": invalid command code o
# exit 1; file unchanged
```

With one expression, `sed -i -e 's#PLACEHOLDER#deepseek#' orbi.toml` exited `0` and made the replacement, but left `orbi.toml-e` behind. BSD sed treated `-e` as the backup suffix. The Quickstart command in [#2074](https://github.com/orbi-build/orbi/issues/2074) had three `-e` expressions:

```sh
$ sed -i -e '/^pi_providers = /d' -e '/^pi_provider = /d' -e '/^pi_model = /d' orbi.toml && echo chain-continued
sed: -e: No such file or directory
```

BSD sed took the first `-e` as the backup suffix and the first expression as the script, then read the next `-e` as a file name. It reported that file missing, left `orbi.toml` unchanged, and the commands after `&&` did not run. Specifying the backup suffix explicitly worked on macOS:

```sh
$ sed -i.bak 's#PLACEHOLDER#deepseek#' orbi.toml && rm -f orbi.toml.bak
# exit 0; provider became "deepseek"
```

`perl -pi -e 's#PLACEHOLDER#deepseek#' orbi.toml` also made the replacement and exited successfully on macOS.

### Guard Linux process-filesystem reads

The Linux runner used `/proc/stat` to calculate boot time during idle-session recovery. That file belongs to Linux's process filesystem. Moving scheduling to launchd does not make the filesystem available on macOS.

On macOS:

```sh
$ ls /proc/stat
ls: /proc/stat: No such file or directory
# exit 1

$ sysctl -n kern.boottime
{ sec = 1794188815, usec = 0 } Mon Nov  9 01:46:55 2026
# exit 0
```

`sysctl -n kern.boottime` supplies boot time on macOS. Orbi checks before reading `/proc` and skips this Linux-specific recovery logic on macOS, without using sysctl as a replacement. A Linux probe against an absent directory reproduced the unguarded `FileNotFoundError`. The guarded version returned no idle-session recovery candidates.

### Preserve the pre-start dependency

The hosted LaunchAgent above ran its shell wrapper through `/bin/sh -c` in `ProgramArguments`. Orbi also needs a step to succeed before the runner starts: its systemd unit uses `ExecStartPre` to run `orbi sync-engine-source`. launchd has no matching plist key. Put that step in the shell command and use `&&` to connect it to the runner command.

This probe ran on Linux, not macOS; `&&` is plain POSIX shell, and the guarded wrapper above, which also uses `&&`, did run inside a macOS LaunchAgent. My `pre.sh` fixture printed its argument and exited with that status.

```sh
$ sh -c './pre.sh 0 && exec echo main-started'
pre: 0
main-started
# exit 0

$ sh -c './pre.sh 1 && exec echo main-started'
pre: 1
# exit 1; main did not start
```

Orbi's current wrapper command, printed by `plistlib` with template values replaced by `X`, is:

```sh
[ -r 'X/.orbi/env' ] && { set -a; . 'X/.orbi/env'; set +a; }; 'X/.local/bin/orbi' sync-engine-source && exec 'X/.local/bin/orbi'
```

The environment file is optional; the pre-start step must succeed. The semicolon lets execution continue without the env file, while the final `&&` prevents the runner from starting if synchronization fails. The [plist manual's `ProgramArguments` definition](https://keith.github.io/xcode-man-pages/launchd.plist.5.html) describes an argument vector. An explicitly invoked shell is needed to interpret those operators.

### Start without killing existing work

When translating service-management commands, keep the intended startup behavior. A job has to be loaded before it can be started; on the hosted runner I loaded each test agent with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<label>.plist` (Orbi's `orbi setup` does this step for its runner). For an already loaded job, the documented command is:

```sh
launchctl kickstart "gui/$(id -u)/org.orbi.runner.1"
```

I tested both forms against a long-running LaunchAgent on the hosted runner. Plain `kickstart` exited `0`, kept PID `19120` and added no start line to the log. `kickstart -k` also exited `0`, but logged a new start with PID `19364`. That matches [`launchctl(1)`](https://keith.github.io/xcode-man-pages/launchctl.1.html): `-k` kills a running instance before restarting it. Leave it off when the instruction is to start the runner. An instance that is already running may be delivering an Issue. The `gui/<uid>` domain belongs to that user's GUI login session, which is why Orbi's README lists a launchd GUI session as the macOS prerequisite.

## What 1,548 macOS CI runs caught

From 15 September through 8 November 2026 UTC, the macOS workflow recorded 1,548 runs, including PR runs and runs triggered by pushes to main. Of its `73` failures, `56` had a Linux failure at the same commit. The comparison uses commit SHAs, which does not establish that both platforms failed for the same reason.

The remaining `17` had no recorded Linux failure at the same commit. I call these macOS-only failures. Of those, `5` occurred on the PR introducing the workflow, with setup problems including missing coverage tooling, a stub PATH missing `mkdir`, and temporary-path assumptions. I grouped the other `12` by what their failure logs showed:

| Failure class | Runs | What the logs or fix showed |
|---|---|---|
| Wall-clock timing | 5 | Idle-recovery assertions depended on elapsed time; [#971](https://github.com/orbi-build/orbi/issues/971) records a release gate blocked by this class. |
| Release-docs timing | 3 | A released tag's documentation page was not available when checked. |
| Temporary-path assertion | 2 | pytest's `tmp_path` was under `/private/var`, outside the redaction regex. |
| Concurrent Git fetch | 1 | Git reported `commondir: Undefined error: 0`. |
| Git background maintenance lock | 1 | The `orbi suggest` feature [PR #1579](https://github.com/orbi-build/orbi/pull/1579) hit this lock in a test; its follow-up commit updated only the test snapshot. |

The temporary-path cases were fixed with platform-independent assertions in [PR #1323](https://github.com/orbi-build/orbi/pull/1323) and [PR #1723](https://github.com/orbi-build/orbi/pull/1723). The regex already covers `/Users` paths; these failures exercised pytest temporary paths under `/private/var`. The fixes changed the assertions, leaving that regex unchanged.

By my classification, none of those `12` was a defect a Mac user of the installer would have hit. The gate's demonstrated value was mainly in exposing problems in the test suite on macOS. The Git failures still tell us about CI behavior, but they do not establish that the installer would fail.

## What it cost

The billing API recorded the following macOS minutes for the `orbi` repository. The share column is the macOS list-price cost divided by the organization's total Actions cost before discounts:

| Month, 2026 | macOS minutes | List-price cost | Share of org Actions cost before discounts | Net Actions charge for orbi |
|---|---|---|---|---|
| September | 3,772 | $233.86 | 67% | $0 |
| October | 4,332 | $268.58 | 68% | $0 |

`orbi` is a public repository, and its Actions charges were fully discounted in both months. [GitHub's runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing) lists macOS at $0.062 per minute and Linux at $0.006 per minute for the standard SKUs used here. This usage cost the public repository nothing. A private repository would pay list price for the same usage beyond any included allowance.

The [paths filter in PR #1272](https://github.com/orbi-build/orbi/pull/1272) merged on 21 September at 23:31 (+08). The two periods differ in length, so compare pull-request-triggered CI runs per day. The macOS column adds up to 787 pull-request runs (269 + 518); the 761 push-to-main runs bring the macOS total to 1,548. The final column shows macOS runs as a share of Linux runs:

| Period (UTC) | macOS runs | Linux runs | macOS per day | Linux per day | macOS share |
|---|---|---|---|---|---|
| 15 Sep 02:01 to 21 Sep 15:31, before the filter (6.6 days) | 269 | 273 | 41.0 | 41.6 | 99% |
| 21 Sep 15:31 to 8 Nov 13:19, after the filter (47.9 days) | 518 | 702 | 10.8 | 14.7 | 74% |

With the filter, about a quarter of pull-request runs skipped macOS. `src/orbi/**` still matches most changes, and pushes to main always run macOS CI. Overall activity also dropped between the two periods, so the filter cannot account for the whole decline in daily runs. These numbers do not isolate how much money it saved.

## What CI could not see

A documentation audit against the man pages found both later bugs in the Mac setup docs. [#2074](https://github.com/orbi-build/orbi/issues/2074), opened on 3 November at 00:11 (+08), identified a problem with the Quickstart's multiple-expression `sed -i -e` command. The same kind of portability bug had appeared in the installer under #868, seven weeks earlier.

[#2109](https://github.com/orbi-build/orbi/issues/2109), opened on 3 November at 08:15 (+08), records how `launchctl kickstart -k` reached the Quickstart: [#2089](https://github.com/orbi-build/orbi/pull/2089), the fix for #2074, added it following the audit's suggested wording. Fixing one Mac documentation bug introduced another: starting the runner could kill a delivery already running.

CI found neither bug. I have now run both commands on the hosted macOS runner. The #2074 command failed as described, and `-k` restarted the running job. Both are fixed in the current Quickstart, which uses `sed -i.bak` and `kickstart` without `-k`. Commands that users copy from setup docs need their own portability checks.

## If you are porting a service to launchd

- Test the child process's environment, including the missing-file branch, under the shell named in your plist.
- Put the required tool directories in `EnvironmentVariables`. Check GNU-only commands with those tools absent from PATH.
- Preserve pre-start failure behavior and guard Linux-only process inspection.
- Treat parser checks, hosted LaunchAgent probes and a full installation on a personal Mac as different kinds of evidence. Check the commands in your setup docs too.

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

[From a GitHub Issue to a release](/guides/issue-to-release/) describes the loop this runner drives. [Running Claude Code unattended](/blog/run-claude-code-unattended/) covers another part of running an agent without sitting beside it. The [macOS defect note](https://docs.orbi.build/notes/macos-six-defects) records the original port, and the [Claude Code comparison](/compare/claude-code/?ref=blog-launchd) explains where Orbi fits. [Orbi Cloud](/cloud/?ref=blog-launchd) runs the Issue-to-release loop on your GitHub repositories.
