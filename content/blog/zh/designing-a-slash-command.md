---
title: 设计一条斜杠命令，顺便读了前人的两份源码 · Orbi
date: 2026-09-22
summary: 命名、语法、正则锚定、注册表形状——一条票内命令背后的四个取舍，对照 Prow 与 bors-ng 的源码逐条推导，每条带行号。 这篇文章还记录具体背景、关键取舍、可复核的运行结果，以及读者可以继续查看的源码和交付证据。
lang: zh
author: Orbi
image: /img/blog-slash-command.png
mirror: designing-a-slash-command
---

一个里程碑跑完，引擎会开一张票：这一版完了，候选是这些，下一版发哪个。然后它停下来等。

这个等待是刻意的。版本自动推进被锁掉了，因为「下一版发什么」不是发版引擎该替你做的决定。

问题出在回答方式。票里写着：请运行 `orbi milestone set v0.5.40`。那是一条 CLI 命令，
要在宿主机上执行。托管租户两样都没有——他们的沙箱跑在我们的机器上，这正是「托管」的含义。

于是引擎提了一个问题，而它的提问对象给不出它认的答案。

补这个缺口要做一条票内命令：在票里评论 `/milestone v0.5.40`，剩下的引擎自己做。
这是个很小的功能。设计花了一天，因为它里面几乎每一个选择前人都做过，并且为此付出过代价。

## 为什么不用动词

第一个争论是命名。`/advance` 是最直觉的候选，而它是错的。

**票内命令用状态名，不用祈使动词。** Prow 有 `/lgtm`、`/hold`、`/approve`，bors 有
`bors r+`，没有一个是动词。这不是文风偏好，而是由命令的语义决定的：CLI 说「做什么」，
所以用动词；票内命令说「把它设成什么」，所以用名词。`/milestone v0.5.40` 读作
「milestone 设为 v0.5.40」，和 `/hold` 同构。

还有一条属于我们自己的理由：CLI 已经叫 `orbi milestone set`。票内命令也叫 `milestone`，
文档只需要写一遍这个词。叫 `advance` 就是给一个已经有两个名字的东西起第三个名字。

也排除了 `bump version`：它读起来像在改 `pyproject.toml` 里的版本号，而那是发版流程做的事。
一个会让人预期错副作用的名字，再短也是坏名字。

最后这条值得多说一句，因为其他几个排除都是从它推出来的。**命令名是一个关于副作用的承诺。**
`/advance` 承诺"有东西往前动了"，却不说是什么——版本？进度？队列？`bump version`
承诺一次从不会发生的文件编辑。两个都短、都好读，而且错得一模一样：
**读者形成了一个实现不会兑现的预期。**

`/milestone v0.5.40` 只做一个承诺——milestone 现在是 v0.5.40——
而它做的三件事全都服务于让这句话成真。建 milestone、开 release 票、落地配置值，
读完名字之后，没有一件是意外。

## 为什么不带 @

第二个争论：`/milestone` 还是 `@orbi milestone`？

业界分成两派，分界线非常干净——**谁控制机器人的账号名**。

Prow 和 bors 用纯斜杠。它们必须这样：机器人账号名因部署而异，Kubernetes 用
`k8s-ci-robot`，OpenShift 用 `openshift-ci-robot`。把 `@名字` 写死进语法，就没法 fork。

Dependabot 和 Copilot 用 `@bot`。它们可以：全世界只有一个 Dependabot，名字全局唯一，
还能顺便蹭到 mention 通知和自动补全。

我们属于前一类。引擎开源、支持自部署。更直接的证据是：同一套引擎已经在我们自己的组织里
以两种身份运行——自举 runner 上 comment 作者是人类账号，托管沙箱里是 `orbi-build[bot]`。
两者我们当天都在自己的仓库上实测确认过。把语法绑定到名字，自部署用户第一天就用不了。

诱人的中间路线是两者都接受：`@orbi milestone` 和 `/milestone` 都匹配，谁爱用哪个用哪个。
这条也排除了，理由不是审美。**两套语法意味着两份文档、两份测试，以及两个会在有人加第三条命令时
各自漂移的东西。** mention 换来一次通知——确实有用——但代价要由之后的每一条命令、
每一个维护者永远付下去。一次通知不值得在语法里留一个永久的分叉。

## 一个正则，三个决定

行首锚定，带多行标志：

```
(?mi)^/milestone[\t ]+(\S+)[\t ]*$
```

Prow 用 Go 写成这样，bors 把评论按行切开再逐行锚定，用 Elixir。两套毫不相关的实现，
同一个选择——这通常说明这个选择是承重的。

它一次买到三样：

- 命令可以写在长评论的任意一行，所以你可以先解释再下命令
- 自动免疫 GitHub 的引用回复，因为 `>` 把斜杠挤出了行首
- 自动免疫缩进代码块，同理

它**没有**买到的是免疫围栏代码块。而这件事是我们那天读到的最有意思的东西。

<figure class="post-media">
<img src="/img/diagrams/command-pipeline.svg" alt="票内命令的解析管道：评论依次经过剥离围栏代码块、剥离引用行、排除机器人自身评论、权限检查、最后一条生效，最终产生回执。剥离围栏与权限两格被高亮，分别是 Prow 与 bors 各自漏掉的地方。" width="880" height="120">
<figcaption>六格，一个归属。Prow 给每个插件自己的正则，所以围栏修复到不了它们——它漏在 “strip fences”。bors 的权限声明是对的，却给处理函数留了第二道门——它漏在 “permission”。</figcaption>
</figure>

## Prow 至今还在的那个 bug

正则不解析 Markdown。如果你写一条评论解释 `/hold` 怎么用，并把示例放进三个反引号里，
正则看到的就是一行以 `/hold` 开头的文本，于是真的触发。

Prow 知道这件事。它有一个专门的函数 `DropCodeBlock`，在 `pkg/markdown/code_block.go`，
版权头写着 2025。于是我们查了它被用在哪：

```
$ grep -rn "DropCodeBlock" --include=*.go . | grep -v _test.go
pkg/plugins/trigger/generic-comment.go:66
pkg/markdown/code_block.go:25   （定义本身）
```

**一个调用点。五十多个插件里的一个。** 今天在 Prow 上把 `/hold` 写进围栏代码块，它照样触发。

这不是在批评 Prow 的工程师，而是正则放置位置带来的结构性后果。Prow 给每个插件自己的
正则——`pkg/plugins/hold/hold.go:41` 里就地写着 `(?mi)^/hold(\s.*)?$`。那个约定是全仓的，
但没有任何东西强制它。**当每条命令各自拥有自己的匹配逻辑时，对共享清洗函数的修复就到不了它们那里。**
修复存在，只是送不到。

所以我们的共享层自己编译正则，从声明的动词生成。命令作者提供 `verbs=("milestone",)`，
从头到尾看不到正则。他不可能漏掉锚点，也不可能跳过围栏剥离——因为我们压根没给他写这两样的机会。

## bors 的那条提权路径

同样的问题放到权限上，比较结果反过来了：bors 的设计更好，bug 更严重。

Prow 把权限交给每个插件自己管。有一个共享的 `TrustedUser(...)`，在
`pkg/plugins/trigger/trigger.go:253`，但插件得记得调用它，而且各插件口径不一致——
`lgtm.go:291` 查的是 collaborator 身份，`override.go:317` 接受仓库管理员**或** GitHub 团队
**或**顶层 OWNERS。更糟的是，帮助文本里展示的 `WhoCanUse` 字符串（`override.go:251`）
和真正做授权的代码（`override.go:326`）是两份真相，靠手工保持同步。

bors 改成声明式。`lib/web/command.ex:356` 的 `required_permission_level_cmd/1`
把每条命令映射到 `:none` / `:member` / `:reviewer`。然后 `run/1`（`command.ex:337-354`）
取一条评论里所有命令中**最严的那一级**，在执行任何一条之前检查一次。这个形状是对的。

但 `run/2` 可以被直接到达，而 `command.ex:513-516` 正是这么做的：

```elixir
def run(c, :retry) do
  {commenter, cmd} = Logging.most_recent_cmd(c.patch)
  run(%{c | commenter: commenter}, cmd)
end
```

`:retry` 只要求 `:member`（`command.ex:376`）。它**以原提交者的身份**重放一条历史命令，
而且从 `run/2` 进入，所以 `run/1` 里的那道闸门根本不运行。一个 member 可以重放一条
reviewer 的命令。

教训不是「bors 不安全」。是那道闸门本身是对的，被第二个入口废掉了。
**要么只有一条执行路径，要么闸门只是装饰。**

## 两边各抄一条

还有两个发现值得记，一正一反。

Prow 真正的好主意：`pkg/plugins/config.go:1381` 的 `ValidatePluginsUnknown`
会在帮助表里查找配置了但未注册的插件并拒绝它。这让「发布时没写文档」成为一个硬错误，
而不是 code review 里的一句提醒。我们的注册项带 `usage` 和 `description`，
绑定测试会在注册了命令却没进文档表时失败。

Prow 的缺口：`pkg/plugins/plugins.go:176` 的 `RegisterGenericCommentHandler`
是一次裸的 map 赋值。同名注册两次，后者静默覆盖前者；两个都匹配 `^/hold` 的插件会都跑，
而且 goroutine 顺序不确定。我们在导入期就对重名和动词重叠抛错。

## 注册表的形状早就有了

我们落地的形状不是为这件事发明的。journal 模块几个月前就是这样——
`src/orbi/journal.py:167` 的 `JOURNAL_EVENTS` 是一个显式的 dict，就写在模块里。
没有装饰器去发现什么，没有 entry point，没有动态导入。**注册即校验**：`event()`
碰到未注册的名字就抛错，所以打错字会立刻失败，而不是写出一个名字错了的事件。
还有一个绑定测试，把注册表与中英文档表格、exporter 的已知类型三个方向互相钉死。

所以命令注册表长得一样：

```python
@dataclass(frozen=True)
class CommandSpec:
    name: str                    # 注册表键，同时是回执标记
    verbs: tuple[str, ...]       # 共享层用它生成正则
    permission: str              # 声明式；由 dispatcher 强制
    validate: Callable[[str], str | None]   # 业务规则；None 表示接受
    apply: Callable[..., None]              # 抛 TicketCommandError
    usage: str
    description: str

TICKET_COMMANDS: dict[str, CommandSpec] = { ... }
```

共享层独占：带锚点的正则构造、围栏剥离、引用行剥离、跳过 runner 自己的评论、
权限强制、最后一条生效、回执。`milestone_command.py` 缩成一个注册者：
一个 `validate`（版本必须命中候选集）和一个 `apply`（原有的三步）。

加第二条命令就变成「改一个 dict，剩下的测试会告诉你还漏了什么」。

<figure class="post-media">
<svg viewBox="0 0 880 330" role="img" aria-label="两个注册表并排对比。仓内早已存在的 JOURNAL_EVENTS 是一个显式 dict，注册即校验：未注册的名字会抛错，绑定测试把它与中英文档表格和 exporter 三个方向钉死。新的 TICKET_COMMANDS 照搬同一形状：dispatcher 强制声明的权限，重名与动词重叠在导入期抛错，同样的绑定测试把 usage 与 description 钉在文档上。">
<title>TICKET_COMMANDS 照搬了仓内早已存在的注册表形状</title>
<g font-family="Instrument Sans, sans-serif" font-size="13" fill="#10292c">
<rect x="8" y="30" width="410" height="270" rx="8" fill="#f7f8f5" stroke="#b8c5c1"></rect>
<text x="26" y="58" font-size="14" font-weight="600">JOURNAL_EVENTS</text>
<text x="26" y="78" font-size="11.5" fill="#526566">src/orbi/journal.py:167 · 几个月前就有</text>
<text x="26" y="112">一个显式 dict，就写在模块里。</text>
<text x="26" y="134">没有装饰器、没有 entry point、没有动态导入。</text>
<text x="26" y="170" font-weight="600">注册即校验</text>
<text x="26" y="190" font-size="12">event() 碰到未注册的名字就抛错，打错字立刻</text>
<text x="26" y="208" font-size="12">失败，而不是写出一个名字错了的事件。</text>
<text x="26" y="240" font-weight="600">绑定测试三个方向钉死</text>
<text x="26" y="260" font-size="12">中文档表格 · 英文档表格 · exporter 已知类型</text>
<rect x="462" y="30" width="410" height="270" rx="8" fill="#e8eeeb" stroke="#0a6b52" stroke-width="2"></rect>
<text x="480" y="58" font-size="14" font-weight="600">TICKET_COMMANDS</text>
<text x="480" y="78" font-size="11.5" fill="#0a6b52">新的这个 · 同一形状，没有发明任何东西</text>
<text x="480" y="112">一个显式 dict，就写在模块里。</text>
<text x="480" y="134">命令作者改一个条目。</text>
<text x="480" y="170" font-weight="600">注册即校验</text>
<text x="480" y="190" font-size="12">重名或动词重叠在导入期抛错——正是 Prow</text>
<text x="480" y="208" font-size="12">不检查的那件事。</text>
<text x="480" y="240" font-weight="600">绑定测试三个方向钉死</text>
<text x="480" y="260" font-size="12">usage · description · 文档表格</text>
<line x1="424" y1="165" x2="454" y2="165" stroke="#526566" stroke-dasharray="4 3"></line>
<text x="439" y="158" text-anchor="middle" font-size="11" fill="#526566">≡</text>
</g>
<g font-family="Instrument Sans, sans-serif" font-size="12.5" fill="#526566">
<text x="8" y="322">加一条命令变成「改一个 dict，剩下的测试会告诉你还漏了什么」。</text>
</g>
</svg>
<figcaption>这个注册表不是为本功能设计的。它早就在仓里放着 journal 事件名，并且带着那个真正重要的性质：注册这个动作本身就是校验。</figcaption>
</figure>

## 一条命令，三个幂等步骤

原来的票里写着这条命令改一个配置值。那是错的，查清楚为什么错花了一次 grep。

一次完整的推进需要发生三件事，我们只有其中一件：

| 步骤 | 这次工作之前引擎的能力 |
|---|---|
| 建 milestone | **没有**。`create_milestone` 与 `milestones --method POST` 全仓零命中 |
| 开 release 票 | **没有**。只有 `arm_release_ticket`，它给**已存在**的票打标签 |
| 落地 `active_milestone` | 有——`rewrite_active_milestone_line` |

证据就摆在我们自己的仓库里：v0.5.40 的 milestone 是人工用 `gh api` 建的，
而它的 release 票压根不存在。

这件事这么久没被发现的原因更不舒服。`.github/release-ticket-template.md` 是有的，
字段规范完整。但 `grep -rn "release-ticket-template" src/ prompts/ AGENTS.md` 零命中。
**从来没有任何代码读过它。** 维护者一直用本地的客户端工具按模板填——等于给系统打了个
只装在一台机器上的补丁。**托管租户撞上的是没打补丁的原版。**

解法不是把那个本地工具内置。它依赖特定客户端，而租户用什么客户端不该由我们规定。
该内置的是能力：读仓内自己的模板、填字段、开票。

所以 `/milestone v0.5.40` 做三件事，各自独立幂等：milestone 不存在就建、
release 票不存在就开、落地配置值。跑两遍，得到一个 milestone 和一张票。

### 我们拒绝写的那个分支

落地配置值有两个去处，因为 `active_milestone` 可能来自两个地方：
仓库策略文件（`.github/orbi.toml`）或宿主自己的 config。写错地方，
这个值要么不生效，要么在错误的范围生效。

最直觉的实现是一次运行时判断：**我现在是在托管沙箱里，还是在自部署的 runner 上？**
这个分支我们拒绝写。

**没有可靠信号。** 最接近的候选 `engine_source_track` 在自举 runner 上也能设，
所以这个判断会是一个伪装成事实的启发式——而写路径上的启发式，总是朝没人测的方向失败。

更重要的是，**这个问题本身问错了。** 我们不需要知道自己跑在哪里，
我们需要知道这个值是从哪来的——而那个信息已经被读它的代码精确地知道了：
`src/orbi/repo_config.py:287-290` 的 `resolve_policy` 知道 `active_milestone`
来自仓库策略还是宿主 config，因为它就是去查的那个东西。

所以分支按**来源**而不是按**环境**走。策略来源的值写回 `.github/orbi.toml` 并 push，
宿主来源的走 `rewrite_active_milestone_line`。两条路径，一个问题，
而答案是一个事实而非一次推断。

这条可以推广：**当你发现自己要去检测所处的环境时，先查一下你真正需要的那个信息，
是不是在输入进来的时候就已经被确定了。**

每一步都是确定性的，**不调用任何模型**——输入是命令参数，变换是字符串替换，输出是写文件。
在这条路径上塞一个 LLM，等于给一个全部价值就在于可预测的操作加上不确定性。

## 我们刻意没有决定的事

这一切底下有一个真正的开放问题，我们把它写下来，而不是顺手替它做了决定。

命令现在只从一个地方读：引擎自己开的那张确认票，在空闲 tick 上，且仅当自动推进关闭时。
三个条件叠加。这个交集之外，`/命令` 永远不会被看见。

这是可能范围里最窄的，而作为第一条命令这是对的。但**它决定了哪些命令能够存在**。
`/approve` 解开人工评审闸门、`/retry` 重新排队一个 blocked 的交付、`/cancel` 停掉正在跑的、
`/model` 为单次运行覆盖模型——这些命令现在都无处落地，因为交付票是人开的，
引擎不会为它们开确认票。

把范围放宽到扫描所有 `ai-*` 票，代价是每 tick N 次额外 API 调用、每票一个游标、
以及重新设计回执如何跨多票去重。这个代价只有被一条真正需要它的命令证明才值得。

所以问题不是「哪个方案更好」，而是：**那四条命令我们到底想要哪条，有没有哪条值得一次逐 tick 扫描？**
如果暂时一条都不要，窄范围就继续。

### 为什么「暂不决定」是一个决定，不是回避

我们把它放进 discussion 而不是当场定下来，这个选择应当和其他决定受同样的审视。

抽共享层的那次重构（#1294）碰到了更宽扫描会用到的每一个部件——解析器、权限闸门、回执去重。
**顺手把范围放宽，会显得很整洁**。而「反正已经在改这块代码了」正是范围决策被顺带做掉的
最常见原因。

但看看放宽的真实代价。回执现在靠扫一张票的评论列表去重，跨多票需要完全不同的机制；
每个 tick 多 N 次 API 调用，外加分页与限流处理；可达面从「我们开的票」扩大到「每一张交付票」。
这些不是附带的——**它们是另一个功能的设计**，而且会在顺手之间被设计掉，
去服务一批还没被定义的命令。

反向的失败同样真实：现在就决定保持窄范围，并把它写进架构写得太死，
将来 `/retry` 的代价就会变高。所以 #1294 显式声明了自己的范围中立——
它只移动代码、不增加能力，也不读 discussion 的结论。

**Option B 的代价只有被一条真正需要它的命令证明才值得。** 在 `/approve`、`/retry`、
`/cancel`、`/model` 中的某一条被具体定义之前，没有任何信息能让这个选择比抛硬币更好。
把问题连同两个选项的代价一起写下来，是为了防止它被下一个打开这个文件的人顺手答掉。

## 结果

命令当天就上线了。实现是 18 个文件 +2073/-81，把共享层抽出来的后续票已经写好并排进队列。

值得留下的不是这个功能。是两个成熟系统——它们都在我们之前解决过这个问题——
各自在源码里留下一处可见的缺陷：Prow 的修复到不了调用方，bors 的闸门有第二道门。
两者是同一类错误：**一个正确的决定，被放在了可以绕过它的位置。**

我们有机会在动手之前把两边都读一遍。这才是建立在开源之上的真正奢侈，值那一天。

---

*相关票：[#1290](https://github.com/orbi-build/orbi/issues/1290)（设计）、
[#1293](https://github.com/orbi-build/orbi/pull/1293)（实现）、
[#1294](https://github.com/orbi-build/orbi/issues/1294)（抽共享层）、
[#1295](https://github.com/orbi-build/orbi/discussions/1295)（命令该从哪读）。
上文所有 Prow 与 bors 的行号均为 2026-09-22 在 HEAD 上 grep 所得，不是凭记忆。*
