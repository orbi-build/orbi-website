---
title: systemd 到 launchd：1,548 次 macOS CI 查出了什么
date: 2026-11-09
summary: 在托管 macOS 上实测环境文件、PATH、sed、timeout 和 kickstart；1,548 次 macOS CI 查出的是测试套件问题，没有安装器缺陷，另算了费用。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-systemd-to-launchd-card.png
mirror: systemd-to-launchd
---

如果你正在把 Linux 服务或 agent 执行器迁到 macOS，或考虑要不要付费跑 macOS CI，这里有一份清单（除注明的几项外都在托管 macOS 上实测过），以及 2026 年 9 月 15 日至 11 月 8 日（UTC）八周的 CI 数据可供参考。[Orbi](https://github.com/orbi-build/orbi) 是一个开源执行器，把 GitHub Issue 送进评审流程，直到改动合并、发版。9 月之前，它只在 Linux 服务管理器 systemd 下运行。本文讲它迁到 launchd 的过程；launchd 是 macOS 用来启动后台任务的服务管理器。

我是 Larry 🍀 Orbi，Orbi 的创始人。11 月 9 日，我在 GitHub 托管的 macOS 15 运行器上跑了清单里的探测。它的架构是 arm64，系统是 macOS 15.8.2，图形界面域 `gui/501` 已登录。这是一台托管虚拟机。Orbi 的完整安装器和交付循环至今还没有在个人 Mac 上跑过，README 里「尚未在真实硬件上验证」的说明仍然成立。

## 通过评审的那次迁移

2026 年 9 月 14 日（+08），[Issue #849](https://github.com/orbi-build/orbi/issues/849) 变成了 [PR #851](https://github.com/orbi-build/orbi/pull/851)，PR 创建后 39 分钟就合并了。当时没有人在 Mac 上跑过它。对照 `launchctl(1)` 读 diff，查出了六个缺陷：密钥没有导出、安装命令只适用于 GNU 工具、PATH 缺少 Homebrew、读取 `/proc` 没有保护、缺了启动前的命令，以及文档仍然只写 systemd。由此开的 [#867](https://github.com/orbi-build/orbi/issues/867) 到 [#872](https://github.com/orbi-build/orbi/issues/872)，都在 9 月 15 日零点后创建，当天早上关闭。[已发布的缺陷记录](https://docs.orbi.build/notes/macos-six-defects)详细记下了这次事件。

## systemd 到 launchd 的迁移清单

先逐项检查服务要保留哪些行为。把 unit 文件翻成 plist 之后，还得单独检查 shell 语义和对平台的假设。

### 导出环境文件里的变量，也测文件不存在的情况

systemd 的 `EnvironmentFile=` 会把变量传给它启动的进程。launchd 没有对应的环境文件指令。在 shell 包装脚本里加载同一个文件，得到的是 shell 变量。如果赋值语句没写 `export`，就需要用 `set -a` 把变量传给子进程。

这台托管运行器的 `/bin/sh` 是 GNU bash 3.2.57。测试文件 `env` 里只有一条假密钥赋值：`OPENAI_API_KEY=sk-test-123`。下面这些 macOS 探测统计的是 `exec` 之后环境里有没有这个变量：

```sh
$ /bin/sh -c '. ./env; exec /usr/bin/env' | grep -c '^OPENAI_API_KEY='
0
# pipeline exit 1

$ /bin/sh -c 'set -a; . ./env; set +a; exec /usr/bin/env' | grep -c '^OPENAI_API_KEY='
1
# pipeline exit 0
```

也要单独测文件不存在的情况。重定向 stderr 能隐藏报错，但点命令失败后，macOS 的 `/bin/sh` 仍会退出：

```sh
$ /bin/sh -c '. ./missing-env 2>/dev/null; echo reached-exec'
# exit 1, no output

$ /bin/sh -c '[ -r ./missing-env ] && { set -a; . ./missing-env; set +a; }; echo reached-exec'
reached-exec
# exit 0
```

`[ -r ] &&` 这层检查让文件变成可选项，只有服务本来就允许缺少这个文件时才这样写。一个实际运行的 LaunchAgent 用这个带检查的 `set -a` 包装脚本，打印出了 `OPENAI_API_KEY=sk-test-123`。Linux 上，普通 bash 在文件缺失后继续执行，POSIX 模式的 bash 则会退出。只用普通 bash 测，就会漏掉这个问题。

### 显式设置 launchd 的 PATH

Orbi 原来的 systemd unit 已经配置了服务的 PATH，复制进 plist 时却漏掉了 Apple Silicon 上 Homebrew 安装工具的目录。launchd 的环境变量，包括 `PATH`，都要通过 plist 的 `EnvironmentVariables` 字典设置，不能依赖终端里的 shell 配置。[Homebrew 文档明确写了 Apple Silicon 的安装前缀是 `/opt/homebrew`](https://docs.brew.sh/Installation)。

在这台托管 Mac 上，没有设置 `EnvironmentVariables` 的 LaunchAgent 打印出：

```text
PATH=/usr/bin:/bin:/usr/sbin:/sbin
```

在这个任务里，运行 `command -v git brew gh` 只找到了 `/usr/bin/git`，尽管运行器上有 `/opt/homebrew/bin/brew`。另一个 LaunchAgent 通过 `EnvironmentVariables` 设置 PATH 后，打印出 `PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`。两个测试 plist 都通过了 `plutil -lint`。

Orbi 目前的 plist 也把 `/opt/homebrew/bin` 放在最前面，后面是用户的工具目录。在 Linux 上解析模板，只能验证配置本身。托管环境里实际运行的 LaunchAgent 则说明了为什么必须显式设置 PATH。

### 检查服务管理器之外的命令

原来的 Linux 安装环境里有 GNU 工具，systemd 本身并不提供它们。迁移服务时，才发现 `install.sh` 依赖这些工具。

macOS 运行器上没有 `timeout`：

```sh
$ timeout 5 true
/bin/bash: timeout: command not found
# exit 127
```

Orbi 的 macOS CI 用下面这段简短的 Perl alarm 脚本来替代：

```sh
#!/bin/sh
exec perl -e 'alarm shift; exec @ARGV' "$@"
```

在 macOS 上，它在实际经过 1.056 秒后终止了睡眠进程，也能原样传递子进程的失败状态：

```sh
$ ./shim/timeout 1 sleep 5
# Alarm clock; exit 142; real 0m1.056s

$ ./shim/timeout 5 sh -c 'exit 3'
# exit 3
```

Linux 对照测试里，GNU `timeout` 返回的是 `124`。先检查调用方期待什么退出码，再决定能不能用替代脚本的 `142` 代替。

这个替代脚本在命令跑不起来时，也可能报成功。在托管 macOS 运行器上，`./shim/timeout 5 no-such-command-xyz`、`./shim/timeout 5`（没给命令）和 `./shim/timeout '' sleep 2` 都以 `0` 退出。前两例是 Perl 的 `exec` 无法执行命令时会返回，脚本随后正常结束；第三例的秒数为空，相当于 `alarm 0`，根本没有超时，`sleep` 照常跑完。这样一来，CI 步骤即使因为 PATH 变化找不到工具，也会错误地通过。Orbi 的 macOS CI 至今还在用这个版本。请改抄下面这个版本：它会检查输入，并在命令无法启动时以非零状态退出：

```sh
#!/bin/sh
# timeout SECONDS COMMAND [ARG...]: fail closed on bad input or a command that cannot run
case $1 in ''|*[!0-9]*) echo "timeout: seconds must be a positive integer" >&2; exit 125;; esac
[ "$1" -gt 0 ] || { echo "timeout: seconds must be a positive integer" >&2; exit 125; }
[ $# -ge 2 ] || { echo "timeout: missing command" >&2; exit 125; }
exec perl -e 'alarm shift; exec { $ARGV[0] } @ARGV or do { print STDERR "timeout: $ARGV[0]: $!\n"; exit 127 }' "$@"
```

在 macOS 上，命令不存在时它返回 `127`，缺少命令参数或秒数为空时返回 `125`。运行 `sleep 5` 时，它在一秒后返回 `142`，也能原样传递子进程的 `exit 3`。把脚本存到 PATH 中的某个目录，命名为 `timeout`，并设为可执行文件。不要把整份脚本当作一行命令直接粘进终端。

BSD sed 复现了 [#868](https://github.com/orbi-build/orbi/issues/868) 里的安装器缺陷：

```sh
$ sed -i 's#PLACEHOLDER#deepseek#' orbi.toml
sed: 1: "orbi.toml": invalid command code o
# exit 1; file unchanged
```

只用一个表达式时，`sed -i -e 's#PLACEHOLDER#deepseek#' orbi.toml` 返回 `0`，替换也成功了，却留下了 `orbi.toml-e`。BSD sed 把 `-e` 当成了备份文件后缀。[#2074](https://github.com/orbi-build/orbi/issues/2074) 中的 Quickstart 命令有三个 `-e` 表达式：

```sh
$ sed -i -e '/^pi_providers = /d' -e '/^pi_provider = /d' -e '/^pi_model = /d' orbi.toml && echo chain-continued
sed: -e: No such file or directory
```

BSD sed 把第一个 `-e` 当成备份后缀、把第一个表达式当成脚本，再把下一个 `-e` 当成文件名，报告找不到这个文件；`orbi.toml` 没有改变，`&&` 后面的命令也没执行。在 macOS 上，明确写出备份后缀就能工作：

```sh
$ sed -i.bak 's#PLACEHOLDER#deepseek#' orbi.toml && rm -f orbi.toml.bak
# exit 0; provider became "deepseek"
```

`perl -pi -e 's#PLACEHOLDER#deepseek#' orbi.toml` 在 macOS 上也完成了替换，并成功退出。

### 保护对 Linux 进程文件系统的读取

Linux 执行器在恢复空闲会话时，用 Linux 进程文件系统里的 `/proc/stat` 计算开机时间。把调度交给 launchd，并不会让 macOS 也有这个文件系统。

在 macOS 上：

```sh
$ ls /proc/stat
ls: /proc/stat: No such file or directory
# exit 1

$ sysctl -n kern.boottime
{ sec = 1794188815, usec = 0 } Mon Nov  9 01:46:55 2026
# exit 0
```

`sysctl -n kern.boottime` 能提供 macOS 的开机时间。Orbi 在读取 `/proc` 前加了检查，在 macOS 上跳过这段 Linux 专用的恢复逻辑，没有改用 sysctl。在 Linux 上用一个不存在的目录测试，复现了未加保护时的 `FileNotFoundError`。加了保护的版本则没有返回空闲会话恢复候选项。

### 保留启动前的依赖步骤

前面的托管 LaunchAgent 在 `ProgramArguments` 里通过 `/bin/sh -c` 执行 shell 包装脚本。Orbi 启动前还要完成一个步骤：systemd unit 用 `ExecStartPre` 在执行器启动前运行 `orbi sync-engine-source`。launchd 没有对应的 plist 键，需要把这个步骤写进 shell 命令，再用 `&&` 接上执行器命令。

这一项是在 Linux 上跑的，不是 macOS：`&&` 是普通的 POSIX shell 语法，前面那个同样用了 `&&` 的守卫包装脚本已经在 macOS 的 LaunchAgent 里跑过。测试脚本 `pre.sh` 打印传入的参数，再用这个值作为退出状态。

```sh
$ sh -c './pre.sh 0 && exec echo main-started'
pre: 0
main-started
# exit 0

$ sh -c './pre.sh 1 && exec echo main-started'
pre: 1
# exit 1; main did not start
```

用 `plistlib` 打印 Orbi 当前的包装命令，把模板里的值都替换成 `X`，得到：

```sh
[ -r 'X/.orbi/env' ] && { set -a; . 'X/.orbi/env'; set +a; }; 'X/.local/bin/orbi' sync-engine-source && exec 'X/.local/bin/orbi'
```

环境文件可以缺失，启动前步骤则必须成功。分号允许在环境文件缺失时继续执行，最后的 `&&` 保证同步失败时不会启动执行器。[plist 手册对 `ProgramArguments` 的定义](https://keith.github.io/xcode-man-pages/launchd.plist.5.html)是参数向量，因此需要显式调用 shell 来解释这些运算符。

### 启动时别终止正在做的工作

迁移服务管理命令时，也要保留原本的启动行为。对于已经加载的任务，文档里的命令是：

```sh
launchctl kickstart "gui/$(id -u)/org.orbi.runner.1"
```

我在托管运行器上，对一个持续运行的 LaunchAgent 测了两种写法。普通 `kickstart` 以 `0` 退出，PID 仍为 `19120`，日志里没有新增启动记录。`kickstart -k` 也以 `0` 退出，但日志里出现了 PID 为 `19364` 的新启动记录。这与 [`launchctl(1)`](https://keith.github.io/xcode-man-pages/launchctl.1.html) 一致：`-k` 会先终止正在运行的实例，再重新启动。指令只是启动执行器时，就别加它。已经运行的实例可能正在交付一张 Issue。`gui/<uid>` 域属于该用户的图形登录会话，所以 Orbi 的 README 把 launchd 图形会话列为 macOS 的前置条件。

## 1,548 次 macOS CI 查出了什么

2026 年 9 月 15 日至 11 月 8 日（UTC），macOS 工作流共记录了 1,548 次运行，包括 PR 和向 main 推送触发的运行。其中 `73` 次失败，`56` 次在同一提交上也有 Linux 失败记录。这些记录按提交 SHA 匹配，不能据此认定两个平台的失败原因相同。

剩下 `17` 次在同一提交上没有 Linux 失败记录，我把它们称为「仅 macOS 失败」。其中 `5` 次发生在引入这个工作流的 PR 上，搭建时遇到了缺少覆盖率工具、测试桩的 PATH 里没有 `mkdir`，以及对临时路径的假设等问题。我按失败日志给其余 `12` 次分类：

| 失败类别 | 运行次数 | 日志或修复说明了什么 |
|---|---|---|
| 依赖实际经过的时间 | 5 | 空闲恢复的断言依赖实际耗时；[#971](https://github.com/orbi-build/orbi/issues/971) 记录了这类问题挡住发版门禁的情况。 |
| 发版文档的可用时机 | 3 | 检查时，已发布标签对应的文档页还不可用。 |
| 临时路径断言 | 2 | pytest 的 `tmp_path` 位于 `/private/var`，不在脱敏正则的匹配范围内。 |
| 并发 Git fetch | 1 | Git 报错 `commondir: Undefined error: 0`。 |
| Git 后台维护锁 | 1 | `orbi suggest` 功能的 [PR #1579](https://github.com/orbi-build/orbi/pull/1579) 在测试里碰到了这把锁；后续提交只更新了测试快照。 |

临时路径问题在 [PR #1323](https://github.com/orbi-build/orbi/pull/1323) 和 [PR #1723](https://github.com/orbi-build/orbi/pull/1723) 中改用与平台无关的断言后解决了。原来的正则已经覆盖 `/Users` 路径，这两次失败测到的却是 `/private/var` 下的 pytest 临时路径。修复改了断言，没有改正则。

按我的分类，这 `12` 次里没有一次是 Mac 用户使用安装器时会遇到的缺陷。这些失败记录体现出的门禁价值，主要是找出测试套件在 macOS 上的问题。Git 的失败仍然能说明 CI 环境中的行为，但不能据此认定安装器也会失败。

## 花了多少

计费 API 按月记录了 `orbi` 仓库的 macOS 分钟数。费用表的时段与前面的 CI 统计窗口不同，「占比」是 macOS 标价费用除以组织折扣前的 Actions 总费用：

| 月份（2026 年） | macOS 分钟数 | 标价费用 | 占组织折扣前 Actions 费用的比例 | orbi 的 Actions 实付 |
|---|---|---|---|---|
| 9 月 | 3,772 | $233.86 | 67% | $0 |
| 10 月 | 4,332 | $268.58 | 68% | $0 |

`orbi` 是公开仓库，这两个月的 Actions 费用都全额减免了。按[GitHub 的运行器定价](https://docs.github.com/en/billing/reference/actions-runner-pricing)，这里使用的标准 SKU 中，macOS 每分钟 $0.062，Linux 每分钟 $0.006。这个公开仓库的这些用量没有产生费用。私有仓库的同等用量，超出所含额度的部分就要按标价付费。

[PR #1272 里的路径过滤](https://github.com/orbi-build/orbi/pull/1272)在 9 月 21 日 23:31（+08）合并。前后两个时段长短不同，所以下表比较的是每天由拉取请求触发的 CI 运行次数。下表 macOS 一列合计 787 次拉取请求运行（269 + 518），加上向 main 推送触发的 761 次，才是 1,548 次：

| 时段（UTC） | macOS 运行次数 | Linux 运行次数 | macOS 每天 | Linux 每天 | macOS / Linux 运行次数比 |
|---|---|---|---|---|---|
| 9 月 15 日 02:01 至 9 月 21 日 15:31，过滤前（6.6 天） | 269 | 273 | 41.0 | 41.6 | 99% |
| 9 月 21 日 15:31 至 11 月 8 日 13:19，过滤后（47.9 天） | 518 | 702 | 10.8 | 14.7 | 74% |

过滤启用后，约四分之一的拉取请求 CI 运行跳过了 macOS。`src/orbi/**` 仍然会匹配大部分改动，向 main 推送则始终跑 macOS CI。两个时段之间，整体开发活动也减少了，每天运行次数的下降不能全归因于过滤规则。这些数字也没能单独量出它节省了多少费用。

## CI 没看见什么

后来 Mac 安装文档里的两个缺陷，都由文档审计对照手册页查出。[#2074](https://github.com/orbi-build/orbi/issues/2074) 在 11 月 3 日 00:11（+08）创建，指出 Quickstart 里带多个表达式的 `sed -i -e` 命令有问题。同一类可移植性缺陷，七周前已经在安装器的 #868 里出现过。

11 月 3 日 08:15（+08）创建的 [#2109](https://github.com/orbi-build/orbi/issues/2109)，记录了 Quickstart 加入 `launchctl kickstart -k` 的经过：修复 #2074 的 [#2089](https://github.com/orbi-build/orbi/pull/2089) 采纳了审计建议的写法。修复这个 Mac 文档缺陷时，又引入了另一个：启动执行器可能终止正在运行的交付。

CI 没有发现这两个缺陷。我现在已经在托管 macOS 运行器上跑过这两条命令，#2074 里的命令按描述失败了，`-k` 也重启了正在运行的任务。当前的 Quickstart 两处都已改正，用的是 `sed -i.bak` 和不带 `-k` 的 `kickstart`。安装文档里供人复制的命令，也需要单独检查可移植性。

## 迁移服务到 launchd 时要测什么

- 用 plist 里指定的 shell，检查子进程的环境，也测环境文件缺失的分支。
- 把必需的工具目录放进 `EnvironmentVariables`。检查 GNU 专用命令时，先确保 PATH 里没有这些 GNU 工具。
- 保留启动前步骤失败时的行为，并为只适用于 Linux 的进程检查加上执行条件。
- 解析器检查、托管环境里的 LaunchAgent 探测、在个人 Mac 上完整安装，提供的是不同的验证证据，要分开看。安装文档里的命令也要测。

## 时间线（+08）

| 日期与时间，2026 年（+08） | 事件 |
|---|---|
| 9 月 14 日 18:14 | #849 提出 macOS 支持需求。 |
| 9 月 14 日 20:41 → 21:20 | #851 创建并合并。 |
| 9 月 15 日 00:06 → 00:18 | 读完 diff 后，创建六张缺陷票。 |
| 9 月 15 日 08:33 | 这些票中的最后一张关闭。 |
| 9 月 15 日 11:48 | macOS CI 在 [#896](https://github.com/orbi-build/orbi/pull/896) 中合并。 |
| 9 月 16 日 11:02 | #971 记录了计时测试挡住发版门禁。 |
| 9 月 21 日 23:31 | #1272 加入 PR 路径过滤。 |
| 11 月 3 日 00:11 | #2074：Quickstart sed 可移植性问题。 |
| 11 月 3 日 08:15 | #2109：Quickstart kickstart 行为问题。 |
| 11 月 9 日 | 在托管 macOS 15 运行器上实测迁移清单。 |

## 相关

[从 GitHub Issue 到发版](/zh/guides/issue-to-release/)介绍这个执行器驱动的交付循环。[让 Claude Code 无人值守运行](/zh/blog/run-claude-code-unattended/)讨论 agent 的无人值守运行。[macOS 缺陷记录](https://docs.orbi.build/notes/macos-six-defects)记下了最初的迁移，[Claude Code 对比页](/zh/compare/claude-code/?ref=blog-launchd)解释了 Orbi 适合用在哪里。[Orbi Cloud](/zh/cloud/?ref=blog-launchd) 在你的 GitHub 仓库运行从 Issue 到发版的循环。
