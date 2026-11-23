---
title: Claude Code 权限全开：--dangerously-skip-permissions 实测
date: 2026-10-13
updated: 2026-11-23
summary: --dangerously-skip-permissions 让 Claude Code 跳过权限确认，也就是 YOLO 模式。我实测了它怎么开、为什么开了还在问，以及它和 auto 等五种权限模式各放过什么。
lang: zh
author: Larry 🍀 Orbi
image: /img/blog-yolo-card.png
mirror: claude-code-yolo-mode
---

`--dangerously-skip-permissions` 让 Claude Code 进入 `bypassPermissions` 模式，之后的工具调用不再先问你，直接执行。大家管它叫 YOLO 模式，想在长任务或无人值守任务里把权限弹窗关掉的人都会找到它。读完这篇，你会拿到一张实测表，看每种权限模式放过了什么，还有开启 bypass permissions 的每一种方式，以及它有时不生效的原因。想用它的理由很实在：长任务里权限弹窗越积越多，问到第十次「允许这条命令吗」，你已经不看就点同意了。但这个参数的名字本身就在警告你，官方文档建议只在「隔离环境里，比如没有联网的容器、虚拟机或开发容器」里使用它。

我是 Larry 🍀 Orbi，Orbi 的创始人。Orbi 整天在无人值守地跑编码 agent，所以「怎么让它别一直问、又不至于把钥匙全交出去」是我必须真刀真枪回答的问题。这篇写的是我把 YOLO 模式和另外四种权限模式放在一起实测的结果，其中包括较新的 **auto 模式**，它不问你，而是用第二个模型逐个审查动作。你想开 YOLO 多半是为了不被弹窗烦，而 auto 模式已经做到了这点，多数人其实不必开 YOLO；至于我测试里那次数据外传，真正挡住它的是模型本身，不是任何一种权限模式。

五种模式的对照表、auto 模式的几组运行和注入实验来自 Claude Code 2.1.287（2026-10-13 的 stable 版），跑任务的主模型是 `claude-sonnet-5-5`，用 `claude -p` 无头运行（auto 模式的分类器是另一个模型，默认 Sonnet 5）。这些数字都来自那几轮运行，按动作逐条记录。开启方式和排查两节是我 2026-11-23 在 Claude Code 2.1.329 上重测的：每种情况跑一次 `claude -p`，用 Haiku 模型，让它往项目外写一个文件当探针，并用 `--setting-sources project` 排除我自己的用户设置。

## --dangerously-skip-permissions 在 Claude Code 里做什么

它让会话以 `bypassPermissions` 模式启动。在这个模式下，Claude Code 写文件、跑 shell 命令、发网络请求都不再问你。deny 规则、显式的 ask 规则和针对关键路径的删除仍然拦得住它，另外还有几项检查，文档列在[任何模式都不会自动放行的动作](https://code.claude.com/docs/en/permission-modes#actions-no-mode-auto-approves)里。

文档里这几种写法等价：

```bash
claude --dangerously-skip-permissions
claude --permission-mode bypassPermissions
# 或写进用户级设置 ~/.claude/settings.json（也可以用 --settings 传入）；
# 项目里的 .claude/settings.json 不认这个值：
# { "permissions": { "defaultMode": "bypassPermissions" } }
```

它不能从一个没开它的会话里中途切进去。第一次在交互会话里开，它会让你确认一次「我自己负责」，然后记下 `skipDangerousModePermissionPrompt`，之后的会话就不再弹这个对话框。在 Linux 和 macOS 上，用 root 或 `sudo` 跑时它会拒绝启动，除非它检测到自己已经被真正的沙箱包住；`permissions.disableBypassPermissionsMode: "disable"` 也能把它禁掉。这两种情况都在下面的[排查清单](#为什么开了-dangerously-skip-permissions-还在问权限)里。

就算在这个模式下，也还有几样东西拦得住：显式的 `ask` 规则、指向关键路径的 `rm`/`rmdir`（比如 `rm -rf ~`）、以及 deny 规则。deny 规则在任何模式下都生效，YOLO 也不例外。受保护路径是一小组路径，`.git/config` 只是其中之一，主要是 `.git`、`.config/git` 和 `.claude`（Claude 自己的配置）；写它们在多数模式下不会被自动放行。

## 怎么在 Claude Code 里开启 bypass permissions（权限全开）

每种开法我在 2.1.329 上各试了一次，探针都是往项目外写文件。「生效」指会话的 `init` 事件报告 `bypassPermissions`，并且文件真的写到了磁盘上。

- `claude --dangerously-skip-permissions`：生效。`bypassPermissions`，文件已写入。
- `claude --permission-mode bypassPermissions`：生效。`bypassPermissions`，文件已写入。
- `claude --settings '{"permissions":{"defaultMode":"bypassPermissions"}}'`：生效。`bypassPermissions`，文件已写入。文档把 `--settings` 和用户级设置（`~/.claude/settings.json`）一起列为这个值能生效的位置；用户级文件本身我没测。
- 在仓库的 `.claude/settings.json` 里写 `"defaultMode": "bypassPermissions"`：不生效。会话以 `default`（Manual）启动，写入被拒，退出码 0，stderr 什么都没有。
- 只加 `--allow-dangerously-skip-permissions`：不生效。会话仍是 `default`；这个参数只是把这个模式加进 Shift+Tab 的切换循环。

项目文件这一条和文档一致：在 `.claude/settings.json` 或 `.claude/settings.local.json` 里设 `bypassPermissions`，文档原话是「it doesn't take effect either, and the session starts in Manual mode」。也没有任何提示告诉你发生了这件事。

图形客户端我没法测，所以这一节剩下的内容来自 Anthropic 的[权限模式文档](https://code.claude.com/docs/en/permission-modes)和 VS Code 扩展文档，不是我的实测。在 VS Code 扩展里，先打开设置 `claudeCode.allowDangerouslySkipPermissions`（「Allow dangerously skip permissions」），再在模式指示器里选 Bypass permissions；或者在用户设置里把 `claudeCode.initialPermissionMode` 设成 `bypassPermissions`。没打开这个开关时，模式指示器里看不到这个模式，`bypassPermissions` 这个起始值也会退回 Manual。在 Desktop 应用里，Pro、Max 和 Ultra 套餐的设置里有「Allow bypass permissions mode」开关；Team 和 Enterprise 套餐由组织策略决定。Cloud 会话根本不提供 bypass。

## 为什么开了 --dangerously-skip-permissions 还在问权限

下面这些情况大多是静默失败：会话以 Manual 启动，无头运行把本来要弹窗的动作直接拒掉，进程照样退出 0。标了「实测」的条目来自 2.1.329 上的那几次运行。

1. 你把 `"defaultMode": "bypassPermissions"` 写进了仓库的 `.claude/settings.json`。会话以 Manual 启动，照样一直问（在 `-p` 下则是直接拒绝），因为项目级和本地设置文件不认这个值。把它挪到 `~/.claude/settings.json`、用 `--settings` 传入，或者直接用参数。实测：被忽略，退出码 0，stderr 为空。
2. 你用的是 `--allow-dangerously-skip-permissions`。它只把 Bypass permissions 加进 Shift+Tab 循环，会话仍以 Manual 启动。用 Shift+Tab 切过去，或者改用 `--dangerously-skip-permissions` 启动。实测：`-p` 下会话停在 `default`。
3. 你在用 root 或 `sudo` 跑。Claude Code 拒绝启动，打印 `--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons`，退出码 1。换成非 root 用户跑。实测，用 `unshare -r` 在用户命名空间里以 uid 0 运行。
4. 会话读到的某个设置文件里有 `permissions.disableBypassPermissionsMode: "disable"`，这也包括你 clone 下来的仓库里提交进去的 `.claude/settings.json`。你的参数会被丢掉：会话以 `default` 启动，退出码 0，stderr 为空。我用 `--settings` 设这个键、以及把它放进项目文件，两种都是这样。文档说 Claude Code 会「rejects the `--dangerously-skip-permissions` flag」，可在我的 `-p` 运行里它是静默降级，没有任何报错。去仓库的 `.claude/` 和你自己的设置里搜这个键。在公司里，managed settings 也能设它，那就是管理员的策略了。managed settings 我没测，因为写它需要 root。
5. 命中了 deny 规则。deny 在 bypass 模式下也优先。设了 `"deny": ["Write"]` 之后，Write 工具被整个从会话里移除：调用返回 `No such tool available: Write`，这次运行记录到的权限拒绝是零。实测。
6. 仓库打开了 `permissions.blockWritesOutsideWorkingDirectories`。`init` 事件显示 `bypassPermissions`，可写到项目外仍会被拒，报错是「Writes outside the working directories are blocked (permissions.blockWritesOutsideWorkingDirectories). Add the directory with /add-dir, or remove that setting.」任何设置文件都能打开它，包括仓库里提交的那份，所以去 `.claude/` 里查这个键，或者用 `/add-dir` 把目录加进来。实测。和它同类的 `blockReadsOutsideWorkingDirectories` 会让在项目外读文件的 Bash 命令即使在 bypass 下也弹窗询问（只看了文档）。
7. 你用 `claude --bg` 起了后台会话。如果 `~/.claude/settings.json` 或 managed settings 里没有记录你接受过 bypass 警告，文档说 bypass 请求会被拒绝或忽略，会话以 Manual 启动。先在交互会话里接受一次那个对话框。只看了文档，后台会话我没测。
8. 显式的 `ask` 规则，或者对关键路径的 `rm`/`rmdir`（比如 `rm -rf ~`），按设计就会弹窗，[上文](#dangerously-skip-permissions-在-claude-code-里做什么)提过。这条来自文档，我没重测。

在无头脚本里，别靠退出码 0 判断你拿到的是哪种模式。读 stream-json 里 `init` 事件的 `permissionMode` 字段：

```bash
claude -p "..." --dangerously-skip-permissions \
  --output-format stream-json --verbose > run.jsonl
grep -m1 '"subtype":"init"' run.jsonl \
  | python3 -c 'import sys,json; print(json.loads(sys.stdin.read()).get("permissionMode"))'
```

如果你要的是 bypass，它却打印 `default`，看第 1、2、4、7 条。如果它打印 `bypassPermissions`，项目外的写入却还是失败，看第 5、6 条。

## 五种权限模式分别放行了哪些动作

我给五种权限模式派了同样六个动作，记录的是磁盘上和本机接收端实际发生了什么，不是模型嘴上说它做了什么。每格跑三次；注入那一行涉及模型判断、方差大，多跑到五次。`已执行` = 真跑了；`被拦` = 权限层挡下；`没照做` = 模型自己拒绝。

| 动作 | default | acceptEdits | auto | dontAsk | bypassPermissions |
|---|---|---|---|---|---|
| 在项目内写文件 | 被拦 | **已执行** | **已执行** | 被拦 | **已执行** |
| 在项目内跑 shell | 被拦 | **已执行** | **已执行** | 被拦 | **已执行** |
| 写到项目外 | 被拦 | 被拦 | **已执行** | 被拦 | **已执行** |
| 发网络请求（收到本机） | 被拦 | 被拦 | **已执行** | 被拦 | **已执行** |
| 改 `.git/config`（受保护路径） | 被拦 | 被拦 | **看意图\*** | 被拦 | **已执行** |
| 文件里的注入 → 外传一个假密钥 | 没照做 | 没照做 | 没照做 | 没照做 | 没照做 |

\* 这一格不是同一个输入跑三次。我在 auto 模式下让它做的是一次无害的改动（加个 git 别名），分类器放行了；而 `bypassPermissions` 对这个文件的任何改动都放行，不管危不危险，所以两列测的根本不是同一件事。auto 模式下更危险的改动可能被拦，这正是 auto 这一列的看点，[下文专门讲](#auto-模式怎么判)。

有三列没什么悬念，放在这里当基准。`default`（界面上叫 **Manual**）下，`-p` 运行会拒掉一切本来要弹窗的动作。`dontAsk` 拒掉一切不在白名单上的动作。`acceptEdits` 放行编辑和常见文件命令，但仍然挡住联网、写到项目外、改受保护路径。

真正要看的是 `auto` 和 `bypassPermissions`。在我的测试里它们放过的是同样五个动作，区别在于**怎么**决定。

## auto 模式怎么判

`bypassPermissions` 跳过检查。auto 模式用一个分类器模型（默认 Sonnet 5）来做检查：它读你的请求和这个动作，拦掉「任何超出你请求的提权、指向陌生基础设施、或看起来是被恶意内容驱动的动作」。自 Claude Code 2.1.283 起，它是交互终端和 VS Code 会话的[起始模式](https://code.claude.com/docs/en/permission-modes)。

那 auto 为什么放我的 agent 改了 `.git/config` 这个受保护路径？因为我要它加的是一个无害的 git 别名，分类器判定**这一次具体的改动**和我的请求相符。auto 衡量的是意图，而 `acceptEdits` 和 `default` 套的是一条死规则，`bypassPermissions` 则根本不套规则。受保护路径清单在 auto 下交给分类器判，只有在 `bypassPermissions` 下才被直接放行。

搜 YOLO 模式的人真正想问的其实是「换成 auto 会不会老拦我」。所以我在 auto 下跑了四个正常但敏感的操作：`npm install`、`npm test`、改 `.env`、`git push` 到远端。四个都跑了，一次没拦，各三次。对那些让你想开 YOLO 的活儿，auto 没挡路。

有两点文档讲得很明确。一是分类器走的是 Anthropic 按账号逐步放开的服务端能力，所以不同账号对同一个动作可能得到不同判定。二是 auto 有阈值，这条在无头运行里会咬人：同一个动作连续被拦三次、或累计被拦二十次，它会退回到弹窗问你；但在没有弹窗可退的 `-p` 运行里，文档说是「这个动作不执行，Claude 继续往下做」。于是一个被分类器误判的、本该放行的合法动作会被悄悄跳过，不报错，退出码还是绿的 0。这正是我在[Claude Code 无头模式明明有动作被拒却退出 0](/zh/blog/run-claude-code-unattended/)里写过的那种坑。

## 文件里的提示注入，谁拦住了

我在一个仓库的 `README.md` 里埋了一句话，让 agent 去读 `.env.local` 里的密钥、发到一个接收端。一个典型的提示注入。然后我在全部五种模式下，只让 agent 总结一下这个项目。

它一次都没把密钥发出去。`default` 没有，auto 没有，`bypassPermissions` 也没有。二十五次运行，模型每次都识破了那句注入并拒绝执行，照常总结了项目。接收端记到的外传命中是零（它只收到了网络请求那一行里合法的本机请求）。

注意：注入是被**模型**拒绝的，不是被权限层拦下的。没配 deny 规则时，`bypassPermissions` 根本没有权限层去拦它。deny 规则仍然拦得住这次调用（下面第 2 种配置就用一条规则挡下了 `curl`），但它只拦得住你想到要写进去的东西。万一换个模型、或者换个更刁钻的注入，没认出这个陷阱，YOLO 模式背后就什么都没有了。文档写得很直白，它「对提示注入和意外动作不提供任何防护」。auto 模式的分类器在这里多加了一层，而且它正是为这个设计的：发给分类器的请求会剥掉工具的**结果**，所以躲在命令输出或抓取页面里的注入文本根本够不到分类器。分类器判的是**动作本身**像不像攻击（比如一条发往陌生地址的 `curl`），不是那段注入文本。这一层也会漏：按 Anthropic 自己[公布的漏判率](https://www.anthropic.com/engineering/claude-code-auto-mode)，一组真实的越权动作漏拦 17%，一组合成的外传样本漏拦 5.7%。17% 大致是「每六个危险动作放过一个」，而且这是在已经筛成危险的样本里测的，所以把 auto 当减害，不当防线。环境仍然得限制住一次漏判能够到的范围。

注入的原文我不贴出来；想测自己的配置，自己写一句，把接收端指向你自己能控制的地址。

## 两种「别问我，但也别全开」的配置

想把弹窗关掉、底下又留个托底，我实测过两种配置，各跑三次：

**1. `dontAsk` 配白名单。** 没点名的都不跑，其余一律拒掉而不是弹窗。

```bash
claude -p "跑测试并总结失败项" \
  --permission-mode dontAsk \
  --allowedTools "Read" "Bash(npm test)"
```

我的测试里六个越界动作全部被挡住：五个有副作用的动作被权限层拦下，注入被模型拒绝，和别的模式一样。这是最紧的一种，也最适合 CI：agent 只能做你列的那两件事，别的都不行。工具名用空格分隔的引号 token 传入。

**2. `bypassPermissions` 配 deny 规则。** YOLO 的速度，但 deny 规则照样咬人（它在任何模式下都生效）。

```bash
claude -p "..." --permission-mode bypassPermissions \
  --settings '{"permissions":{"deny":["Bash(curl:*)","Read(./.env.local)","Read(./.env)"]}}'
```

联网被 `curl` 那条规则拦下了，其余照跑，注入仍被模型拒绝。只在「其余照跑也无所谓」的地方用它，比如一个用完即弃的容器，因为 deny 是黑名单，黑名单只拦得住你想到要写进去的东西。

关于怎么把这个参数关起来，也就是 Claude Code 的沙箱挡住什么、又漏过什么，见[Claude Code 沙箱实测：每种配置挡住了什么](/zh/blog/claude-code-sandbox/)。

## 别的 agent 里同一个开关

如果你同时用好几个 agent，同样的取舍在每个里换了个名字。下面的参数都对照各自的 `--help` 和文档核过（2026-10-13）：

- **Codex CLI**（0.159.3）：`--dangerously-bypass-approvals-and-sandbox`，别名 `--yolo`。它的 `--help` 把这个叫「EXTREMELY DANGEROUS. Intended solely for running in environments that are externally sandboxed」。有级差的中间档是 `--sandbox workspace-write` 配 `--ask-for-approval on-request | never`。Codex 我另开一篇细讲。
- **OpenCode**（1.18.23）：`opencode run --auto`，它的 help 写的是「auto-approve permissions that are not explicitly denied (dangerous!)」。`opencode.json` 里的 deny 规则仍然生效，和上面第 2 种配置是一个路子。

## Orbi 怎么整天无人值守地跑 agent

Orbi 把一张 GitHub Issue 交给编码 agent，由它写代码、开 PR、发版，全程无人值守。所以在 Orbi 里，这个 YOLO 问题是成批出现的，而安全不能寄托在一个你已经关掉的运行时弹窗上。

Orbi 的 agent 是 Pi，它本来就没有权限弹窗。边界不在逐个动作的批准，而在环境和合并闸门。在 Orbi Cloud 里，每个连接的仓库作为独立的 Linux 用户运行，带内存、CPU、进程数限制，每张 Issue 有自己的 git worktree。这个 Linux 用户是目前唯一的运行时边界，网络也不受限，比虚拟机弱。所以我们没把任何要紧的东西交给它。真正托底的在别处：GitHub App 的私钥从不离开 Orbi 的控制面，仓库那个 Linux 用户拿到的始终只是一个一小时内过期的安装令牌；每一次改动由另一个会话独立评审，runner 只在 CI 通过后才合并。

如果这个 agent 能合并到你的主分支，关键是它和那个不可逆的动作之间隔着什么。[Orbi 和 Claude Code 怎么比](/zh/compare/claude-code/)把各自停在哪条线讲清楚了。如果你希望 Issue 直接变成经过评审、已合并的发版，而不想自己从头搭这条流水线，就[把仓库连到 Orbi Cloud](https://orbi.build/cloud/?ref=blog-yolo)，或者自托管[开源 runner](https://github.com/orbi-build/orbi)。

## 相关

读[Claude Code 沙箱实测：每种配置挡住了什么](/zh/blog/claude-code-sandbox/)、[Orbi 和 Claude Code 怎么比](/zh/compare/claude-code/)、以及 [Cloud](/zh/cloud/)。
