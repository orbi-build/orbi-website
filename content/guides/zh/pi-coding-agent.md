---
title: Orbi 怎么搭在 Pi coding agent 上
summary: Orbi 把打了标签的 GitHub issue 做成已合并的 PR，代码由 Pi coding agent 来写。这页是 Pi 系列的目录，也讲 Orbi 怎么启动 Pi、怎么评审和合并。
lang: zh
mirror: pi-coding-agent
published: 2026-10-05
updated: 2026-11-10
---

Pi coding agent 是一个在命令行里运行的开源编程助手。如果你在评估 Pi，或者想让它无人值守地跑，这页讲 Orbi 怎么启动 Pi 会话、在外面补了哪些东西（角色、评审轮次、合并闸门、标签、静默会话的处理），并附生产数字。Orbi 是一个开源 runner：你给 GitHub issue 打上 `ai-ready` 标签，它把这张 issue 做成评审过、合并了的 PR；另开一张发版 issue，就能把合并的工作打包成带 tag 的 release。可以装在自己机器上跑，也可以用托管版 Orbi Cloud。整条流水线里写代码的那一步，全部交给 [Pi coding agent](https://pi.dev)。Pi 官网管自己叫「a minimal agent harness」，由 Earendil 开发，MIT 许可（[earendil-works/pi](https://github.com/earendil-works/pi)）。Orbi 不是 Pi 官方项目。

截至 2026 年 11 月 10 日（UTC+8），我们查的那台 Orbi Cloud 沙箱主机上装的是 Pi 1.5.0；npm 上最新的是 11 月 10 日 07:45（UTC+8）发布的 1.5.1。下文的生产统计跨过了多个 Pi 版本，不属于某一个版本。想自己安装、运行 Pi，见[《Pi agent harness》](/zh/blog/pi-agent-harness/)的安装一节，那里的步骤用 Pi 1.5.0 测过。

## 系列文章

第一次读，从 10 月 5 日的[《Pi + DeepSeek Flash 写的 169 个已合并 PR》](/zh/blog/orbi-on-pi-coding-agent/)读起。

<!--@series:pi-->

169 个 PR 那篇的标题讲的是成本，正文还跟着一张真实 issue，把 Orbi 起的每个 Pi 会话走了一遍，也讲了为什么一直用 Pi 和两次事故。10 月 6 日那篇用同一个 kill -9 测试比了三种跑 Pi 的方式：`pi --print`、通过 Vercel AI SDK 的适配器调 Pi、在 Cloudflare 上通过 Agents SDK 的 `PiHarness` 跑 Pi Durable。「给 Orbi 找 harness」上下两篇是更早的测评，标题里的 harness 指 Orbi 套在模型外面的提示词和评审规则，不是 Pi 这类 agent 工具；本页其他地方说的 harness 都和 Pi 官网一样，指 Pi。两篇讲我们怎么改这些规则、怎么比较不同模型，测评数据不在下文的生产数字里。

## 先说清这页用的几个词

- **交付**：一张 issue 做到 PR 合并。文字答复和没有 commit 的 ops 票不走这条 PR 流程，见下文。
- **会话**：为一个角色起的一个 Pi coding agent 进程。大多数交付用两个会话，一个写代码，一个评审。发现问题后需要再起一轮评审，或者卡住的会话被重启，会话数就会变多。
- **运行（run）**：一次交付的一次尝试，有 8 位的 `run_id` 和自己的 worktree。runner 结束了一个卡住的会话，下一个会话仍在同一次运行、同一个 worktree 里接着做。同一张 issue 被重新认领（比如还没有 PR 时，有人把它从 `ai-blocked` 改回 `ai-ready`），才算新的一次运行，换新的 `run_id`，但分支不变。
- **tick**：runner 的一次扫描。runner 以多个实例运行，每个槽位（见下）一个实例，各有自己的 systemd timer（macOS 上是 launchd），每 5 分钟触发一次 tick。每次 tick 只把一个交付往前推一步，按四档顺序找活：先找 PR 已开、等着评审或修复的交付，再找之前被打断的（续跑条件：只在没有其他槽位在忙时），然后认领新的 `ai-ready` issue；前三档都没有，才重试 `ai-awaiting-merge` 的交付。Pi 会话在启动它的那次 tick 里一直跑，直到自己结束，或者长时间静默后被 runner 结束（见下文）。
- **槽位**：runner 能同时做的一张 issue 就是一个槽位，槽位数目是固定的。之所以需要槽位，是因为一次 tick 可能跟着它的会话跑上一个小时；同一个实例上一次 tick 没跑完时，它的 timer 不会再起新 tick，所以 tick 只在不同槽位之间重叠，后来的 tick 不会去动会话还在跑的 issue。CI 还没跑完这类 runner 管不了的事，不在 tick 里干等，留给下一次 tick 再看。

## 生产上的数字

Orbi Cloud 会记录交付用到的 Pi 会话。从上次统计的截止点 2026 年 10 月 5 日 15:36，到 11 月 10 日 00:00（均为 UTC+8），有 Cloud 用量记录、对应 PR 已合并的 issue 共 947 张。统计窗口按 Cloud 记录的 PR 合并时间划定。这 947 次交付中，853 次在 Orbi 自己的三个仓库（`orbi`、`orbi-cloud`、`orbi-website`），14 次在 `orbi-build` 下另外三个仓库（fork 和测试仓库），80 次在其他 GitHub 账号下的 15 个仓库。

这 947 次交付一共记录了 2,271 个 Pi 会话，平均每次 2.40 个，中位数是 2。其中 713 次（75.3%）正好记了两个会话，通常是一个写代码、一个评审并给出 `pass` 的形态（评审可以自己修掉问题再给 `pass`，见下文「评审轮次」）；不过记录只数会话，不含角色和评审结论，不能据此确认每次都是一写一审。另有 23 次只记了一个会话，记录里看不出原因；其余 211 次记了三个或更多。会话最多的单次交付记了 61 个，它只让平均数高了约 0.06，去掉它平均数是 2.34。Cloud 对每张 issue 只保留最近一次交付的用量，后续交付会覆盖之前的会话数，因此这些数字可能少算了实际做过的工作。

模型字段里，946 次交付记的是 `deepseek-flash`，1 次记的是 `gemini-3.5-flash-lite`。这个字段只取每次交付中第一个带模型记录的会话，不能据此判断评审会话用了哪个模型。

本页 10 月 5 日的旧快照统计的是 9 月 21 日到 10 月 5 日：170 次交付、375 个会话，85% 正好两个会话。这 170 次里有 169 次有 token 数，所以成本那篇算的是 169 个。重新采集时，采集时间会刷新，旧记录也会被覆盖。如今的记录已无法按当时的口径复现那份快照，两段统计不能直接比较。截至 10 月 5 日的成本分析，见[《Pi + DeepSeek Flash 写的 169 个已合并 PR》](/zh/blog/orbi-on-pi-coding-agent/)。

## 为什么 Orbi 一直用 Pi coding agent

Pi 让 Orbi 可以通过一份 `models.json` 格式的 provider 列表自己选模型；Orbi 交给会话的东西，系统提示词、skill、provider 和 model、工具开关、会话记录目录，Pi 都有原生参数对应，中间不需要转接层。Orbi 的 runner 只会发 Pi 的参数，所以我们试另外两个 coding agent 命令行工具（Claude Code 和 zcode）时，给它们各写了一个小转接层来翻译参数。结果我们写的两个转接层都在翻译参数时把 `--skill` 列表弄丢了，那些会话一直没带 Orbi 的 skill 在跑，过了一阵才发现。毛病出在转接层，不在那两个工具；用 Pi 就不需要这一层。更完整的回答在 169 个 PR 那篇博文的[「为什么一直用 Pi」](/zh/blog/orbi-on-pi-coding-agent/#为什么一直用-pi)一节。

## Orbi 怎么启动 Pi coding agent

交付中的每个会话都是一个非交互的 `pi --print` 进程。每次运行在 worktree 里有一个会话目录 `.pi-session/`（和 `.orbi/` 一样被 git 排除，不算未提交的改动），这次运行里的每个 Pi 进程各在里面写一个自己的 JSONL 文件（`ticket` 会话改用临时目录）。runner 的实时进度和失败报告读的都是这些文件。系统提示词和任务上下文（`task-context.md`）写成 `.pi-session/` 里的文件，命令行用 `--system-prompt <file>` 和 `@<file>` 传入路径，避免参数太长导致 Pi 无法启动。命令在 [`pi_command.py`](https://github.com/orbi-build/orbi/blob/main/src/orbi/pi_command.py) 里拼。交付用三个角色，其中 `ticket` 有两种用途：

| 角色 | 什么时候起 | 工具 | 产出 |
|---|---|---|---|
| `implement` | `ai-ready` 的 issue；或者同时带 `ai-ready` 和 `ai-ops-only` 的 issue（查日志这类运维活），换成运维提示词 | 开 | 写进 `.orbi/plan.md` 的计划、代码改动和测试，停在一个本地 commit 上，从不 push（ops 活的产出是贴在 issue 上的证据，常常没有 commit） |
| `review` | PR 上的每一轮评审 | 开 | 对发现的问题直接修、push 到任务分支，最后输出一行 `REVIEW_VERDICT` JSON，写明它修完之后停在哪个 commit |
| `ticket`（用文字答复） | 同时打了 `ai-ready` 和 `ai-content-only` 的 issue，这类 issue 要的是一段文字答复 | 关（`--no-tools`） | Orbi 贴到 issue 上的那段文字 |
| `ticket`（澄清） | 开了 `clarify_thin_tickets` 时，在认领前判断新 issue 写得够不够详细 | 只开引擎自己的判定工具（`--no-builtin-tools`） | 通过工具给出判定；暂不认领的 issue 加上 `ai-needs-detail` |

`implement` 和 `review` 会话带 `--no-extensions` 启动。在 Pi 里，这个参数同时关掉扩展的自动发现和 Pi 的内置扩展（比如 MCP 和 Pi 执行代码的工具模式 Codemode），所以某个角色要用的扩展，都得通过 Orbi 配置里的 `pi_extensions` 以 `--extension` 加回来，Orbi Cloud 就是这样加回 Codemode 的。处理 `ai-content-only` 的 `ticket` 会话用 `--no-tools` 关闭工具，从 v0.6.2 起（[Issue #1558](https://github.com/orbi-build/orbi/issues/1558)，2026 年 10 月 5 日）也带同样的 `--no-extensions` 和配置的 `--extension` 参数；在那之前它启动时完全不带扩展相关的参数，runner 所在系统用户装的扩展可能加载进去。

澄清闸门关掉 Pi 的内建工具和扩展发现，只加载引擎自带的一个扩展 `clarify_verdict.ts`，用它的判定工具回答，配置里的扩展一个都不加载。被它拦下的 issue 会加上 `ai-needs-detail`，暂停评论里附有建议：`/orbi split` 把拆分建议变成子 issue，`/orbi amend` 把建议的验收条件补进 issue 并重新排队。Orbi 怎么加载、怎么写扩展，见[扩展那篇](/zh/blog/pi-extensions-in-production/)。交付角色也能加载用户自己的 skill：Orbi 用 `--skill` 加上自己的 skill，但不给这些角色传 `--no-skills`。

第四个角色 `suggest` 不在 runner 的交付流程里，只供 `orbi suggest` 和 `orbi draft` 使用。

模型在 runner 的 `orbi.toml` 里选；仓库自己的 `.github/orbi.toml` 不能设模型相关的键。一个最小的配置如下，评审的两个键可以指向另一个模型，这里用的是同一个：

```toml
pi_providers = ".orbi/pi-providers.json"   # 相对这份配置文件所在目录；Pi models.json 格式
pi_provider = "deepseek"
pi_model = "deepseek-flash"
review_pi_provider = "deepseek"            # 可选，不写就回退到 pi_provider
review_pi_model = "deepseek-flash"         # 可选，不写就回退到 pi_model
```

现成的 provider 文件在 [`templates/pi-providers`](https://github.com/orbi-build/orbi/tree/main/templates/pi-providers)。设了 `pi_provider` 和 `pi_model` 的话，每个交付角色解析出的 provider 和 model 会以 `--provider`、`--model` 写在它的命令上（评审先用 `review_` 开头的键，没设的键逐个回退）；不设的话，Pi 会悄悄退回用户设置里的默认模型（见下文那次事故）。没有 `pi_providers` 文件时，这两个键指定的必须是 Pi 自己能解析的模型（Pi 内置的 provider，或者用户 `~/.pi/agent/models.json` 里定义的）。`orbi doctor` 在 provider 文件、`pi_provider`、`pi_model` 都设好、API 密钥也能解析时，会打印配置的 provider 和 model。没有 provider 文件时，它会把模型报成未配置，尽管 Pi 自己能解析的模型照样能跑。

## Orbi 在 Pi harness 外面补的几层

一个 Pi 进程只知道自己这个会话。哪张 issue 该起会话、会话留下的 commit 怎么处理、会话没声音了怎么办，都由 runner 决定。

### 认领 issue

tick 手上没有已开的 PR 或被打断的运行要接着做时，才按优先级扫描 `ai-ready` 的 issue：先是带 `p0` 标签的，再是 `bug`，最后是其余的，每组都按创建时间从早到晚排。已经在跑的、已经带着 `ai-pr-opened` 或 `ai-fix-needed` 的（它们的 PR 由第一档接手）、标着 `ai-blocked` 的、还挂着未关闭「blocked by」关系的 issue 都跳过。设了 `active_milestone`（仓库的 `.github/orbi.toml` 里，或者 runner 自己的配置里作为兜底）时，只扫这个里程碑；这个里程碑关闭后，手上没有别的活要接着做的 tick 会切到版本号更高的下一个开放里程碑（设了 `auto_next_milestone = false` 时改为发一条提醒、等你来改）；没有这样的里程碑，就去掉过滤，重新扫全部 `ai-ready`。一个 runner 可以同时做好几张 issue，靠认领锁和按槽位的锁保证同一张不会被拿两次。

认领下来的 issue 会得到一个 git worktree，分支名是 `orbi/<owner>-<repo>-issue-<N>`。第一次认领时，分支从 base 分支当时的 commit 切出来。分支名里不带 run id，所以同一张 issue 再被认领时，会拉下已有的分支接着做，原来的 PR 还开着就继续用它。细节见[工作流文档](https://docs.orbi.build/zh/workflow)。

### 从 commit 到 PR

`implement` 会话停在 commit 上，剩下的事 runner 来做，按这个顺序：

1. 检查产出。这一步只看会话自己退出的情况（被 runner 结束的会话见下文「会话没声音了」）。对普通的 `ai-ready` issue（不是下文的 ops 票）：如果会话留下了未提交的改动（不管有没有 commit），issue 保持 `ai-in-progress`，之后某次 tick（按上文的续跑条件）接着做同一次运行；如果工作区是干净的、HEAD 仍等于本次运行开始时记下的 base 分支 commit，issue 直接进 `ai-blocked`。HEAD 前进了、但文件树和当时的 base 相同（比如只做了空提交），也一样。复用的分支即使带着之前的 commit，只要文件树和当时的 base 不同，就不会这样进 `ai-blocked`。
2. 合 base。如果 base 分支上有新东西，先合进任务分支；如果这一步有冲突，就撤销它，先不带 base 的新 commit 继续，冲突留给第一个评审会话去解。
3. push。普通 push（不 force），再确认远端分支确实指向刚 push 的 commit，免得 push 悄悄失败了还接着开 PR。
4. 开 PR，正文写上 `Fixes #N` 和 `run_id`。

### 评审轮次

评审总是在新起的 Pi 会话里做，所以 `implement` 写的代码由一个没写过它的会话来查。评审可以直接修：Blocker 和 Major 级的问题在同一个会话里改掉，重跑测试，push 到任务分支。它给出的结论描述的是修完之后的 PR：

- `pass`：不剩 Blocker 和 Major。
- `findings`：还有评审在本会话里没能修好并验证的问题。issue 进 `ai-fix-needed`，下一次 tick 开新一轮评审，同样是新会话，接着修、接着审。`implement` 不会再跑。
- `blocked_on_human_decision`：评审发现了只有人才能拍板的事。

评审预算是五轮，数的是轮次，不是会话数。五轮用完，或者结论是 `blocked_on_human_decision`，issue 进 `ai-blocked`；这两种情况要由人把它改回 `ai-fix-needed`。只有用完了的预算才会重新回到五轮；因 `blocked_on_human_decision` 停下的，剩几轮接着用几轮。PR 和不断前进的 base 分支冲突时，下一个评审会话负责合 base、解冲突，这类轮次算在另一份预算里，也是五轮；这份预算只在用完的评审预算被人恢复时，随之一起恢复到五轮。另有两种 `ai-blocked` 会自动恢复：base 上失败的检查转绿，以及 GitHub App 获准读取检查结果，见下文「合并闸门」。

runner 的 `orbi.toml` 里开了 `human_review_gate`（默认关闭）时，Orbi 会在 issue 上贴一份验收清单；清单里有机器验不了的项目，评审就在起任何 Pi 会话之前停下，等人加上 `ai-human-review`；等待不消耗评审轮次。


### 合并闸门

合并前，runner 用一次调用读齐 PR 的状态、能否合并、head commit 和 CI 结果，避免拿新旧混杂的数据做判断。合并用的是 `gh pr merge --match-head-commit <sha>`，中间有人 push 过，GitHub 会拒绝这次合并。正常情况下，这个 sha 是最近一次评审结论里写的 commit；每个评审会话都会写明自己最后停在哪个 commit。`pass` 会记下这个 head 和 issue 正文的哈希，供后续 tick 使用；当前 tick 刚 push 的 head，绝不在同一次 tick 里合并。

`ai-awaiting-merge` 之后的重试不再起 Pi 评审，直接锁定 PR 当前的 head，重跑合并闸门。闸门会遇到这几种情况：

- **检查还在跑。** runner 不等。检查转绿后，只要 head 和 issue 正文哈希仍与记下的 `pass` 一致，后续 tick 就直接合并，不会因为等过 CI 再起一次评审。head 没变、但 issue 正文改了，就要重新评审。
- **base 分支前进了。** PR 还能干净合并时，runner 把 base 合进来、push，把新 head 写入评审记录，这次合并一律延后。之后某次 tick，只要这个 head 的检查转绿、head 和 issue 正文都没变，就可以直接合并。
- **只在 PR 上挂了的检查。** issue 进 `ai-fix-needed`，由下一轮评审去修，计入同一份五轮预算，哪怕之前的结论是 `pass`。
- **base 分支上同名的检查也挂着。** runner 把它当成 base 原有的故障，issue 进 `ai-blocked`，先修 base。它是按检查名比对的，所以这并不能证明 PR 本身没问题。评论里会提示用 `/orbi fix-base`，可以为每个失败的检查开一张带 `ai-ready` 和 `p0` 的修复 issue。每次 tick 都会重查 base，检查转绿后，issue 自动从 `ai-blocked` 回到 `ai-fix-needed`，继续往合并走。七天还没恢复，runner 发一条提醒，然后停止轮询。
- **分支保护规则要求维护者介入。** issue 进 `ai-awaiting-merge`。之后只有 tick 没有待评审、续跑或新认领的工作时才重试。所以维护者处理完之后，要等第一个空闲 tick 才能合并。

GitHub App 没有读取检查结果的权限，也会让 issue 阻塞；权限获批、App 能读到检查结果后，同样会自动恢复。

更多见 [CI 门禁](/zh/guides/ci-gates/)和[自动合并 AI PR](/zh/guides/auto-merge-ai-prs/)。

### ops 票和发版

打了 `ai-ops-only` 的 issue 起的是带 shell 的 `implement` 会话，只是换成运维提示词，适合「查一下这个报错在日志里出现了几次，把查询和结果贴回来」这类活。会话自己把证据作为评论贴到 issue 上。没产生 commit、工作区也干净，runner 就关掉 issue，不开 PR；有 commit 就照常走 PR 流程。

发版不经过 Pi：打了 `ai-release` 的 issue 走一套固定流程，改版本号、打 tag、发布 GitHub Release（见[从 Issue 到 Release](/zh/guides/issue-to-release/)）。

### 标签一览

有三个标签和 `ai-ready` 一起打，决定走哪条路：`ai-content-only` 换成 `ticket` 角色，`ai-ops-only` 仍用 `implement` 但换成运维提示词，`ai-release` 不经过 Pi。下面这些标签记录交付状态，或者标出需要人处理的事（评审通过、在等检查时，issue 保持原来的 `ai-pr-opened` 或 `ai-fix-needed`）：

| 标签 | 含义 |
|---|---|
| `ai-ready` | 队列标签：单独挂着时表示等认领；认领后也会保留，所以正在交付的 issue 会同时带着它和 `ai-in-progress`、`ai-pr-opened` 或 `ai-fix-needed` |
| `ai-in-progress` | 已认领，有运行在做 |
| `ai-pr-opened` | PR 已开，在等检查或评审 |
| `ai-fix-needed` | 评审、CI、base 冲突或评审会话失败留下了问题，下一次 tick 开新一轮评审。之后评审通过、只在等检查的 issue 也会一直挂着它（见合并闸门） |
| `ai-awaiting-merge` | 评审通过，但分支保护要维护者介入 |
| `ai-needs-detail` | 被澄清闸门拦下；用 `/orbi split` 或 `/orbi amend` 执行它的建议 |
| `ai-merged` | 做完了 |
| `ai-blocked` | 需要人处理；两种情况会自动恢复：base 上失败的检查转绿，或 GitHub App 权限获批后能读取检查结果 |

### 进度评论和 run_id

会话运行时，runner 每 15 秒读一次它的 JSONL 文件，更新 issue 上同一条评论：现在在哪个阶段、最后做了什么、最近一次测试结果。有变化就立即更新，没变化时大约每 30 秒刷新一次已用时间。运行彻底失败时，失败评论会附上会话的最后 20 条记录，只保留时间戳、记录类型、发送方、工具名和内容块的种类，不带消息正文；另外附上 Pi 的 stdout、stderr 和测试日志尾部，每段最多 4,000 个字符，本机路径都会去掉。整条评论超过 20,000 个字符时，各段上限就按每次 500 个字符缩减，直到放得下。

`run_id` 是这次运行每一行日志的前缀，也出现在进度评论、PR 正文和失败记录里，拿它去搜日志、搜 GitHub，找到的都是同一次运行。

### 会话没声音了

Pi 会话卡住时不会退出，runner 收不到任何报错，所以它盯的是会话文件还在不在增长，并分两种情况处理：卡在工具上，和在等模型。

**卡在工具上。** 静默 5 分钟时 runner 记一条告警。大约 10 分钟时，找出告警之前就已启动、到现在还没退出的 Pi 子进程，比如一直不退出的测试或 dev server，给它们发 SIGTERM。这样那次工具调用会失败，模型拿到一个能处理的报错。还活着的子进程，在下一次轮询（大约 15 秒后）发 SIGKILL。套着自己 `timeout` 命令在跑的进程不动，等到它自己的期限，从 runner 发现它起最多一小时。如果杀掉子进程后会话还是没动静，或者根本没有子进程可杀（卡住的是 Pi 自己），runner 继续计时，这条静默看门狗在静默大约 60 分钟时结束这个 Pi 会话，但有效的 `timeout` 等待期间不会。等待期间静默时间照样累计，runner 只是暂不结束会话，所以等待一结束，已经过了这个点的会话很快就会被结束。

**在等模型。** 最后一条记录是工具结果、Pi 在等模型的下一个回复时，走单独的计时器：默认 30 分钟没有回应就结束会话。连的是 llama.cpp 服务时，runner 还可以探测它的 `/slots` 接口，这个接口会报告服务是否在处理请求；如果 llama.cpp 服务自己的所有 slot（不是上面说的 runner 槽位）连续约一分钟都是空闲，说明请求被吞了，会话就在那时结束。Pi 自己也有空闲超时（见下一节），单个请求静默 300 秒就结束。之后 Pi 默认还可能把失败的请求重试最多三次（`retry.maxRetries`）。没设 `pi_providers` 时，Orbi 不会清理用户设置里的 `httpIdleTimeoutMs: 0`（等于关掉这个超时）；受信任项目的 `.pi/settings.json` 也可能写了 `0`。这两种情况下，这个超时是关掉的。30 分钟的计时器只管最后一条记录还是工具结果时的静默。重试一旦留下一条 assistant 错误记录，之后的静默就交给上一段那条静默看门狗，约 60 分钟结束会话。

接下来怎么走，看角色。`implement` 会话卡住，issue 保持 `ai-in-progress`；之后某次 tick，等没有其他槽位在忙时（就是上面说的续跑条件），在同一个 worktree、同一个 `run_id` 下起一个新会话，并告诉它接着之前的工作做，而不是从头来。同样的失败重复出现，会更新 issue 上同一条恢复评论；连续三次之后，runner 再加一条健康告警。它不会封住 issue，也不会停止续跑，这条告警就是提醒人来接手的信号。`review` 会话卡住，issue 进 `ai-fix-needed`；评审连续三次出现同样的失败，issue 进 `ai-blocked`。

## agent 目录和模型

`orbi.toml` 里设了 `pi_providers` 时，每次运行在 worktree 下得到一个自己的 Pi agent 目录 `.orbi/pi-agent/`（`ticket` 会话的放在它的临时目录里），通过 `PI_CODING_AGENT_DIR` 交给 Pi，每次启动会话前按这个会话的角色重写一遍。`.orbi/` 写在 worktree 本地的 git exclude 文件里，会话里普通的 `git add` 不会把它带进提交。这个目录以跑 runner 的那个系统用户的 `~/.pi/agent` 为底生成：

- `models.json`：把这个用户的 providers 和 Orbi 的配置合在一起，同一个 id 以配置为准。
- `settings.json`：以这个用户的设置为底。给这个角色配了 provider 和 model，`defaultProvider`、`defaultModel`（会话启动时用的模型）和 `enabledModels`（切换模型时 Pi 轮流使用的列表）都锁成这一个模型；没配的话，只从 `enabledModels` 里去掉合并后的 `models.json` 里没有的模型。设置里如果有 `httpIdleTimeoutMs: 0`，Orbi 会删掉它：设成 0 等于关掉 Pi 对模型请求的空闲超时，第一个响应迟迟不来的请求会一直等下去；删掉以后用 Pi 默认的 300 秒。这些都是用户级设置：如果 Pi 信任这个项目，仓库自己的 `.pi/settings.json` 会叠加在上面、可以覆盖它们，不过命令行上的 `--provider` 和 `--model` 仍然优先。
- `auth.json`：软链接到这个用户自己的文件。

扩展由会话参数控制加载。这个目录仍然决定交付角色加载哪些用户 skill：Orbi 不给这些角色传 `--no-skills`，这个用户 `~/.pi/agent` 下（设了 `pi_providers` 时是生成目录下）的 skill 会加载进去；各角色的参数表见[扩展那篇](/zh/blog/pi-extensions-in-production/)。

没设 `pi_providers` 时，Pi 直接用这个用户的 `~/.pi/agent`，`enabledModels` 锁定和 `httpIdleTimeoutMs` 的清理这两条都不生效；`--no-extensions`、命令行上的 `--provider` 和 `--model`（配了的话），以及上文的静默看门狗都不受影响。见 [providers](https://docs.orbi.build/zh/providers) 和 [configuration](https://docs.orbi.build/zh/configuration)。

## 这些规则是怎么来的

这页里的 `--no-extensions` 来自一次事故：跑 runner 的那个系统用户在 `~/.pi/agent` 里装过一个 Pi 包，包里带的扩展让部分运行在启动时卡死。另一次事故之后，我们自己运营的每台 Orbi runner 都显式设好 `pi_provider` 和 `pi_model`，并用 `orbi doctor` 检查：有一台没设这两项的 runner，曾经悄悄回退到本地模型，什么都没报错。两件事的经过见 169 个 PR 那篇博文的[「两次事故」](/zh/blog/orbi-on-pi-coding-agent/#两次事故)一节。

## 试一试

Orbi 在 [orbi-build/orbi](https://github.com/orbi-build/orbi) 开源：装好 runner，指向你的仓库和你的模型就能跑。[Orbi Cloud](/zh/cloud/?ref=seo-pi-coding-agent) 替你跑同一套 runner、同样的 Pi 会话。和自己手动驱动 coding agent 比有什么不同，见 [Orbi 与 Claude Code 对比](/zh/compare/claude-code/)。

## 更新记录

- 2026-11-10：换成新时间窗口的生产数字，Cloud 主机上的 Pi 版本更新为 1.5.0；修正延后合并时不再复审的路径、`ai-blocked` 自动恢复、澄清闸门，以及提示词改用文件路径传参的说明。
- 2026-10-06：系列文章列表挪到页首，加了从哪篇读起的提示；模型费用写成 8 到 16 美分的区间，只算记下来的 token（成本数字现在放在 169 个 PR 那篇）。
- 2026-10-05：第一版。Orbi Cloud runner 上的 Pi 版本是 1.0.0。
