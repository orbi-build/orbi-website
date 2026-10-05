---
title: Orbi 跑在 Pi 上：我们在 Pi 编程 agent 外面搭了什么
date: 2026-10-05
summary: 跟着一张真实的 GitHub issue，看 Orbi 为它起了哪几个 Pi 会话、每一步发生了什么、花了多少，以及 Pi 留给用户自己搭的那一层，我们放在了哪里。
lang: zh
author: Orbi
image: /img/blog-orbi-on-pi-card.png
mirror: orbi-on-pi-coding-agent
---

Orbi 里写代码的活，全部交给 [Pi 编程 agent](https://pi.dev) 来干。Orbi 用命令行调 Pi，一张 issue 里每个角色单独起一个会话；会话以外的事归 Orbi 的 runner 管，比如挑哪张 issue 做、让实现和评审分开、决定什么能合并、定时调度、卡住了怎么救。Pi 是 Earendil 做的开源项目，MIT 协议（[earendil-works/pi](https://github.com/earendil-works/pi)）。先说清楚：Orbi 不是 Pi 官方的东西。

我是 Lawrence Liu，Orbi 是我在维护。它干的事很简单：你给 GitHub issue 打上 `ai-ready`，它还你一个评审过、已经合并的 PR；再开一张发版票，它把合进去的改动发成带 tag 的版本。9 月 16 日到 10 月 5 日上午 11 点（北京时间），Orbi Cloud 的托管 runner 合并了 365 个 PR。334 个在 Orbi 自己的三个仓库里（orbi、orbi-cloud、orbi-website），Orbi 的开发本来就是交给 Orbi 自己做的；11 个在我们组织下面别人项目的 fork 和一个测试仓库里；剩下 20 个在别人的 9 个仓库里。这 365 次，干活的都是 Pi。

这是 Orbi 和 Pi 系列的第一篇。我不想空讲架构，所以先带你看一张真实的 issue，看 Orbi 为它起了哪几个 Pi 会话、中间出了什么岔子，然后再说命令行、全部交付的数据，以及 Pi 留给用户自己搭的那部分，我们是怎么搭的。

## 一张 issue 从头到尾

挑的是 [orbi#1554](https://github.com/orbi-build/orbi/issues/1554)，巧的是它讲的就是 Pi。Orbi 每次 run 会往 worktree 里写一份专用的 Pi `models.json`，以前它会把 `$VAR` 形式的 API key 引用先解析掉，把真 key 明文写进去。代码注释给的理由是 Pi 0.84.3 不会展开这种引用。我后来翻了 Pi 0.84.3 的文档，人家写得明明白白，`apiKey` 支持 `$ENV_VAR` 和 `${ENV_VAR}`。也就是说，我们一直在绕一个根本不存在的限制，还为此把 key 写到了磁盘上。修起来倒简单，引用原样保留，让 Pi 自己去展开。那天我是半夜开的票，打完 `ai-ready` 就睡了。

<figure class="post-media">
<img src="/img/diagrams/orbi-pi-flow-zh.svg" alt="一张 issue 怎么经过 Orbi 和 Pi，分三条泳道。GitHub：打 ai-ready 标签、CI 检查、最后标成 ai-merged。Orbi runner：认领并从冻结的 base 建 worktree，推送、开 PR，合并闸门检查 CI、评审结论，以及 base 是否最新。Pi 会话：实现会话（plan.md、改代码、测试、commit）和评审会话（审、修、输出 REVIEW_VERDICT）。一条红色虚线表示 CI 红了就起一个新的评审会话来修；闸门不过则进入 ai-blocked，由人决定下一步。" width="1050" height="470">
</figure>

第二天起来，issue 上的时间线是这样的（北京时间）：

| 时间 | 发生了什么 |
|---|---|
| 03:21 | 开票，打上 `ai-ready`。 |
| 03:31 | runner 认领，起了第一个 Pi 会话（run `598a0fb3`）。 |
| 03:42 | 实现会话提交了修复：`fix(pi): keep apiKey env-var references verbatim in per-run models.json`。 |
| 03:43 | runner 推送，开了 [PR #1555](https://github.com/orbi-build/orbi/pull/1555)。 |
| 03:47、04:08 | CI 挂了两次，失败指纹一样，挂在一个文档测试上，这个测试在 `main` 上也是红的。两次 runner 都新起了一个评审会话，它先看 CI 日志再动手修（第二次 CI 跑的，就是它推上去的文档提交）。 |
| 04:22 | 评审会话在交付闸门前停了：PR 上挂的那项检查，在 `main` 上同样挂着（闸门点名的是 `macos-compatibility`），合进去也解决不了。issue 被标成 `ai-blocked`。 |
| 12:06 | 另一张票 [orbi#1552](https://github.com/orbi-build/orbi/issues/1552) 把 `main` 上那个文档测试修好了，那张票也是 Orbi 自己交付的。 |
| 13:39 | 我把 #1554 放回队列。 |
| 13:42 | 分支接上了新的 `main`。 |
| 13:58 | 评审通过，一条意见都没有，runner 合了 PR。 |

跑的过程中，Orbi 会在 issue 上留一条进度评论，一直改。角色那一栏是 runner 自己填的，别的基本都是从 Pi 的会话文件里读出来的，比如 Pi 上次有输出是几点、会话 id、在哪个阶段。截图里的 `phase: codemode`，是 runner 最后看到的工具阶段，也就是 Pi 1.0 的 Codemode：模型先写一小段脚本，一次把好几个工具调用串起来。

<figure class="post-media">
<img src="/img/blog-orbi-on-pi-progress.webp" alt="Orbi 在 orbi#1554 上的进度评论（英文界面）：PR #1555 已合并，review_rounds=1；role: review；测试 4034 个通过、11 个跳过，用时 7 分 38 秒；展开的 Run details 里有 run_id 598a0fb3、phase codemode、已用 16 分 57 秒、分支名和 Pi 会话 id。" width="1200" height="731">
<figcaption>orbi#1554 上的进度评论，2026 年 10 月 5 日截图。</figcaption>
</figure>

04:22 被拦下那次，闸门没有硬往里合，留了这么一条，把球踢给人：

<figure class="post-media">
<img src="/img/blog-orbi-on-pi-blocked.webp" alt="Orbi 在 orbi#1554 上的卡住评论（英文界面）：Orbi blocked，等待人来决定。原因：PR #1555 的独立评审失败，交付闸门发现 main 在 macos-compatibility 检查上已经是红的，要求先修 main。" width="1200" height="331">
<figcaption>翻译一下就是：PR 没毛病，是要合进去的那个 base 先红了。</figcaption>
</figure>

这一张票前后起了 4 个 Pi 会话，1 个实现，3 个评审。按 Orbi Cloud 的用量记录，Pi 一共跑了 51 分钟，发了 164 次模型请求，输出 10.8 万 token，缓存读取 841 万 token，用的都是 `deepseek-flash`。04:22 到 13:39 那九个多小时，Pi 其实没在干活，是 issue 在等我睡醒。

## Orbi 怎么调用 Pi

Orbi 起的每个 Pi 会话，都是一个 `pi --print` 进程。把提示词正文拿掉，命令长这样（见 [`src/orbi/pi_command.py`](https://github.com/orbi-build/orbi/blob/main/src/orbi/pi_command.py)）：

```text
pi [--no-tools] [--no-extensions [--extension <白名单里的扩展>]] \
   [--skill <路径> ...] \
   [--provider <p>] [--model <m>] [--thinking <级别>] \
   --print --session-dir <本次 run 的目录> \
   --system-prompt <角色提示词> <issue 上下文>
```

会话分三种。实现会话带工具，加载交付用的那套 skill，用实现模型；它动代码之前先写一份 `.orbi/plan.md`，里面有目标、看过的上下文、仓库层面的决定、要做的任务和验证命令，然后才在 worktree 里改代码、跑测试，最后停在一次 commit 上。

评审会话是对着 PR 另起的。Orbi 不会给它传 `tdd-dev` 和 `review-fix-loop` 这两个 skill，因为评审只需要把这份 diff 审完、有问题就修，用不着再走一遍交付。评审可以单独配一个模型（`review_pi_provider`、`review_pi_model`），结束时必须吐出一行 `REVIEW_VERDICT {...}` JSON，Orbi 靠解析它来判断结果。

还有一种是答复会话，只在 issue 上回个话，什么都不改。它带 `--no-tools`，Orbi 也不给它传扩展参数，它输出什么，Orbi 就往 issue 上贴什么。

`--session-dir` 的作用比我当初想的大。每个 run 有自己的目录，Pi 把会话写成 JSONL 放在里面，每条消息、每个工具结果各占一行。Orbi 一边读这个文件，一边更新 issue 上的进度（[orbi#24](https://github.com/orbi-build/orbi/issues/24)）；run 失败了，就把最后 20 条记录附到失败评论里。下面这 4 条，就是 #1554 的评审会话被拦时附上去的那 20 条里的几条：

```text
2026-10-04T20:13:35.691Z message role=assistant content=thinking,toolCall:codemode
2026-10-04T20:13:35.899Z message role=toolResult tool=codemode content=text,text
2026-10-04T20:13:37.044Z message role=assistant content=toolCall:codemode
2026-10-04T20:13:37.175Z message role=toolResult tool=codemode content=text,text
```

在 Orbi Cloud 上，真正的 `pi` 外面还套着一层很薄的包装。每个会话结束，它会把这些文件重读一遍，算出 token 用量。Cloud 上每次交付显示的用量就是这么来的，每月有没有用到套餐上限，也是拿它来算。

## 186 次交付，Pi 会话花了多少

到 10 月 5 日下午 2 点（北京时间），用量记录里一共有 186 次交付，模型都是 `deepseek-flash`，加起来 399 个 Pi 会话、24,285 次模型请求。按每次交付算：

| | 中位数 | 90 分位 |
|---|---|---|
| Pi 运行时间 | 35 分钟 | 89 分钟 |
| 模型请求 | 107 次 | 238 次 |
| 输出 token | 69,502 | 188,228 |
| 未命中缓存的输入 token | 133,413 | 318,496 |
| 缓存读取 token | 676 万 | 1,920 万 |

最后一行我第一次看到时愣了一下。中位数那次交付，输入 token 里有 97.7% 是缓存读取。想想也对：Pi 会话每一轮都要把系统提示词、issue、读过的文件这一大坨重新带上，前后几乎不变，provider 大部分直接从缓存里给。[一次合并交付在 Pi + DeepSeek 上要花多少钱](/zh/blog/deepseek-coding-agent-cost-per-merged-pr/)，很大程度就看这一点。

## 为什么一直用 Pi

Orbi 8 月份第一批提交里就已经在调 Pi 了，当时没做什么正经的选型对比。现在回头看，我们没换掉它，主要是两个原因。

第一个是模型可以自己带。Pi 自带一长串 provider，另外还认一个按它 `models.json` 格式写的 provider 文件，Orbi 用这个文件就能接上任何 OpenAI 兼容的端点（[orbi#157](https://github.com/orbi-build/orbi/issues/157)）。我不想让 Orbi 绑死在某一家模型上，这一点在 [orbi#305](https://github.com/orbi-build/orbi/issues/305) 里也写过。之前做 harness 测评，`deepseek-flash`、`gpt-5.6-luna`、`gpt-5.6-sol` 跑的就是同一个 runner、同一条 Pi 命令。

第二个原因，Orbi 要传给 Pi 的东西，一条 `pi --print` 就全装下了。那轮测评里我们也试过别的 agent，用 Claude Code 跑 Opus 5.5，用 zcode 跑 GLM 5.3 flash。为了把它们接进来，得各写一层桥，把 Pi 的这条命令翻译成对方能懂的参数。结果两层桥都悄悄把 skill 弄丢了，查了一阵才发现、修好（详见 harness 系列[第一篇](/zh/blog/searching-for-orbis-harness/)）。用 Pi 不需要这层翻译，自然也就不会在这上面丢东西。

## Pi 留给用户的那一层，Orbi 放在哪

Pi 很坦白地说了自己核心里不做哪些事。除了 MCP（现在已经内置了），它首页上列了五样：子 agent、权限弹窗、plan 模式、待办、后台 bash。每样后面都附了建议，让你用扩展、第三方包、容器、写文件或者 tmux 自己补（我 2026 年 10 月 5 日看的版本）。Orbi 没往 Pi 里加这些功能，它是站在交付这一层，在 runner 里各做了一件对应的事。

<figure class="post-media">
<img src="/img/diagrams/orbi-pi-layers-zh.svg" alt="左右两个面板。Pi（每个会话里面）：调你配置的模型，工具（包括 Pi 1.0 的 Codemode），skill，会话写成 JSONL，白名单里的扩展。Orbi runner（会话外面）：任务队列是打了 ai-ready 的 GitHub Issues，每张 issue 一个 base 冻结的 worktree，按角色起会话，合并闸门检查 CI、评审结论和 base 是否最新，每 5 分钟调度并停掉卡住的会话，从会话文件里算 token 用量。中间：一个方向是每个角色一条 pi --print，另一个方向是会话文件、commit 和评审结论。" width="960" height="380">
</figure>

| Pi 核心里没有的 | Pi 建议的补法 | Orbi 的做法，以及边界 |
|---|---|---|
| 权限弹窗 | 放进容器跑，或者用扩展做确认流程 | 每张 issue 一个独立的 git worktree，从 base 分支冻结的 commit 建出来。实现会话停在 commit，由 runner 推送、开 PR，再由 runner 合并评审通过的那个 head（如果 base 分支在这期间有了新提交、又能无冲突合并，runner 会先把 base 合进来，仓库配了 CI 的话等新 head 的 CI 通过再合，不会重新评审）。这管的是什么能合并，管不到一次工具调用能碰什么。后者 Pi 自己的[安全文档](https://pi.dev/docs/latest/security)建议靠容器和沙箱。在 Orbi Cloud 上，每个租户的 runner 是一个独立的系统用户，有自己的资源配额，这比 Pi 推荐的容器边界要窄。 |
| 子 agent | 用 tmux 起多个 Pi，或用扩展、第三方包 | runner 按角色起独立的 Pi 会话：实现、评审、答复，各自单独一个会话。它们不是会话内部的子 agent。 |
| plan 模式 | 把计划写进文件，或用扩展、第三方包 | 实现会话动代码之前先写 `.orbi/plan.md`。会话的上下文被压缩之后，就靠它接上。 |
| 待办 | 写 `TODO.md`，或者用扩展自己做 | 会话之间，GitHub Issues 就是任务队列，`ai-ready` 标签是入口。会话内部，agent 仍然没有待办工具。 |
| 后台 bash | tmux | 在 Orbi 里，agent 同样没有后台 bash。在后台跑的是 runner：systemd 定时器（macOS 上是 launchd）每 5 分钟跑一次，长时间没有输出的会话会被发现并终止（[orbi#94](https://github.com/orbi-build/orbi/issues/94)）。 |

另外，日志、issue 评论和 PR 上都挂着同一个 `run_id`，出了事一查就能串起来。Orbi 自己搞不定的失败，就把 issue 标成 `ai-blocked`，交给人拿主意，#1554 凌晨那次就是这样。

### 为什么放在 Pi 外面，不做成扩展

上面这些，大部分其实都能写成 Pi 扩展。我们没这么干，有几个考虑。

最重要的一点：合不合并，不该由被审的那个会话自己说了算。要是合并闸门是装在实现会话里的扩展，它跑不跑，就看这个会话的配置。在 Orbi 里，Pi 会话只交出 commit 和评审结论，合不合由 runner 决定。这里我也得承认一个边界：评审会话发现问题会自己动手修、推到任务分支，修完说没问题的还是它自己，所以评审和它自己的修改并不完全独立。它做不了的是合并这一步。评审的提示词里写着不许合并，真正合并的是 runner，用的是 `gh pr merge --match-head-commit`。说到底这是分工，算不上权限隔离，评审会话手里有工具，跟 runner 在同一个环境里跑。

再一点，无人值守的会话得从一个确定的状态开始。下面第一个事故讲的就是这个。

还有就是将来换 agent 方便。worktree、评审、合并闸门都在 runner 这边，测评时 Claude Code 和 zcode 那两层桥，过的就是跟 Pi 一模一样的几道关。真有一天要换 agent，这些关卡原地不动。

10 月 1 日，Earendil 和 Pi 社区发了 Pi 1.0，顺带发了 [Pi Durable](https://earendil.com/posts/pi-durable/)。这是一个独立的、还在实验阶段的 TypeScript 框架，拿来写长时间运行的 agent 应用，有后台任务、基于 checkpoint 的崩溃恢复，还有能在上面搭审批流程的 hook。我觉得它不太会改变上面这套分工：Durable 关心的是一次运行能不能活下来、断了能不能接上，Orbi 的闸门关心的是这次运行交出来的东西能不能合，后者我们还是希望放在 agent 进程外面。另外 Orbi 是用 Python 写的、通过命令行调 Pi，Durable 我们还没认真评估过。

我们并不认为 Pi 该把这些塞进核心。正是因为它核心小，我们用一条命令就能把它驱动起来。

## 两次事故，改变了我们跑 Pi 的方式

先说一个插件的事。9 月 4 日晚上，run 开始莫名其妙地卡住，而且卡在 Pi 发出第一个模型请求之前。那晚一个接一个，z.ai 上有，Gemini 上也有，每个都干等 15 分钟，等空转检测把它杀掉，再把 issue 标成 `ai-blocked`。去看卡住的 `pi` 进程，人还活着，就是不动弹，两分半钟只用了 2 秒 CPU；没有任何连到模型 API 的 TCP 连接，唯一一个 socket 连的是当前用户的 D-Bus；会话目录是空的，Pi 连会话文件都没来得及建。更怪的是，同样的配置在 shell 里手动跑，20 多次全部成功，只有 systemd 用户服务拉起来的才会卡。最后查出来是一个用户级的 Pi 包，`pi-mcp-adapter`。它一启动就去 D-Bus 上初始化系统钥匙串，而在 systemd 环境里，这个调用有时候就是不返回。把它从 `~/.pi/agent/settings.json` 里拿掉，同一个 run 15 秒就拿到了第一个模型响应（[排查过程见 orbi#311](https://github.com/orbi-build/orbi/issues/311)）。后来的根治办法是交付会话干脆不继承用户装的插件：实现和评审会话都带 `--no-extensions` 启动，只加载 Orbi 配置里写明的扩展（[orbi#249](https://github.com/orbi-build/orbi/issues/249)）。

另一次是 runner 跑错了模型。9 月 20 日我们新配了一个 runner，本意是让它通过 Pi 用 GPT。配置文件里写了仓库，偏偏漏了 `pi_provider` 和 `pi_model`，Orbi 也就没传 `--provider` 和 `--model`，Pi 于是用了账号 settings 里的 `defaultModel`。日志里打出来的是 `provider=LLAMA_INTRANET model=qwen3.8:27b`，一个本地模型，可我们一直当它是 GPT runner。整个过程一个错都没报，这才是最要命的。现在每个 runner 的配置里都会把 provider 和模型写死（没写，`orbi doctor` 会报「未配置」）；到底跑的是哪个模型，看日志里启动那一行，不再看了配置就想当然。

## 如果你也想无人值守地跑 Pi

下面这几条是我们在 runner 上踩坑踩出来的，只说 Pi 特有的。通用的那部分，比如谁认领任务、谁评审、谁合并、谁发版，我在[无人值守地跑 Claude Code](/zh/blog/run-claude-code-unattended/) 里写过，换成 Pi 也一样。

- 每个 run 给一个单独的 `--session-dir`。agent 到底做了什么，只有它记得全，token 用量也在里面，出了事看最后几条，比什么报错都管用。
- 从 `--no-extensions` 开始，要什么扩展再明确加上。不然你自己账号下装的东西，会被一起带进一个没人盯着的 run。注意这个参数也会把 Pi 的内置扩展关掉，包括 MCP，要用的话加回 `-e builtin:mcp`。
- skill 按角色分开，还得防着自动发现。评审会话要是加载了实现那套流程 skill，它就会跑去「交付」，忘了自己是来评审的。`--skill` 是在 Pi 从用户目录、项目目录自动发现的那些 skill 之外再加；想让某个角色看不到某个 skill，还得加 `--no-skills`，或者保证 skill 目录是干净的。
- provider 和模型直接写在命令行上。不写，Pi 就用 settings 里的 `defaultModel`，无人值守的 runner 根本不会发现。
- 盯着那些很久没输出的会话。卡住的会话不会退出，上游也就永远收不到报错。别光看进程还在不在，要看会话文件上次变大是什么时候。
- 想绕开 Pi 的某个限制之前，先翻翻你用的那个版本的文档。我们就为一个 Pi 文档里根本没有的 `models.json` 限制写了绕行代码，还因此把 API key 写到了磁盘上，#1554 就是这么来的。

## 系列接下来写什么

下一篇打算写为什么每张 issue 都要在自己的 worktree 里单独起 Pi 会话，再往后写 Orbi 加载了哪些 Pi skill、为什么是这些。harness 测评已经写了[第一篇](/zh/blog/searching-for-orbis-harness/)和[第二篇](/zh/blog/is-the-regression-guard-worth-its-tokens/)，想看数据的可以先看那两篇。

Orbi 的代码在 [orbi-build/orbi](https://github.com/orbi-build/orbi)。[Orbi Cloud](https://orbi.build/zh/cloud/?ref=blog-pi) 跑的是同一个 runner、同样的 Pi 会话，接上你自己的仓库就能用。

## 相关

看看[和 Claude Code 的对比](/zh/compare/claude-code/)和 [Cloud](/zh/cloud/)。
