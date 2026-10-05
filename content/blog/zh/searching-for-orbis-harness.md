---
title: 给 Orbi 找 harness（上）：我们的评审漏掉了什么
date: 2026-09-29
summary: Orbi 的评审放过了两个修复，它们各自改坏了别的东西。我们一条规则一条规则地重写 harness，在 Orbi 翻过车的 issue 和十二个它没见过的 issue 上重跑完整交付流程，得出十条结论，数据都在文里。
lang: zh
author: Orbi
image: /img/blog-harness-search.png
mirror: searching-for-orbis-harness
series: pi
---

Orbi 接一个 GitHub issue，交出一个评审过、已合并的 PR。一个 agent 写修复，另一个 agent 评审，评审不过就接着改。包在模型外面的那一层叫 harness：每个角色拿到的 prompt、加载的 skill、runner `PATH` 里的工具，还有评审怎样才算通过的规矩。

交付出错时，只看一次运行，分不清该怪模型还是 harness。我们决定不猜了，花了一个晚上加第二天上午，把 Orbi 的完整流程一遍遍重跑。先跑三个 Orbi 交付出过回归的开源 issue，再跑九个它没见过的普通 bug，最后是三个上游第一次修复就改坏过东西的 bug。prompt、skill、工具、实现模型、评审模型轮流换，每次合并的代码都交给一个 Orbi 看不到的隐藏评分器打分。

这是上篇，讲我们怎么找到这些失败，又怎么调出一个能修好它们的 harness。[下篇](/zh/blog/is-the-regression-guard-worth-its-tokens/)算的是这个 harness 值不值它的成本。结果和脚本在 [benchmark 页](/zh/benchmark/)和 [orbi-build/orbi-bench](https://github.com/orbi-build/orbi-bench)。先说结论。

## 十条结论

1. **在我们拿来调参的 issue 上，harness 对结果的影响比任何一次换模型都大。** 实现和评审都用 `deepseek-flash`，原版 harness 在三个调参 issue 上 15 次过 6 次，v13 到 v15 是 30 次过 28 次。不过这是训练集成绩，没调过参的 issue 看第 7 条。
2. **「对比修复前后」不够。** 让 agent 查回归，它只查自己本来就觉得没问题的例子。有一次它测了从没坏过的 U+0301，偏偏漏了坏掉的 U+3099。输入得用程序按整类批量生成。
3. **从修复里推出来的判据，什么也证明不了。** 一次 `gpt-5.6-sol` 的运行生成了 1200 张表，拿去和一个「参考实现」比对，而这个参考实现就是它刚写的规则。报告写着 `head wrong: 0`，回归照样交付了。
4. **参考库也会错。** `wcwidth` 0.2.14 把 👍🏽 算成 4 列。agent 信了它，就会「证明」回归是对的。至少拿两个参考实现交叉比对，写明信哪个。
5. **被剥掉的字符本身也是数据。** 密码泄漏要求密钥自己以 `\n` 结尾。agent 造输入时只把反斜杠放在密钥后面，从没放进密钥里。把这类输入点名写进规则，问题就没了。
6. **你自己写的 harness 文本也可能就是 bug。** 我们写的一个例子（「别改生成的 changelog」）对某个项目恰好是错的，把 Orbi 带偏了。仓库的规矩该由仓库自己的工具说了算。
7. **在普通 bug 上，更强的 harness 大约多花一倍的钱，我们测不出它换来了什么。** 九个没见过的 issue 上，原版、v15、v15 加 sol 评审三组都是 9/9。v15 的 token 中位数是原版的 2.0 倍，耗时 1.45 倍。
8. **agent 不会重犯人犯过的回归。** 三个上游第一次修复就改坏过东西的 bug（numpy、OpenTelemetry Collector、aiohttp）上，评分同时覆盖原 bug 和那次回归，原版 harness 计分的 4 次全过，v15 3 次全过（它一次也没跑完 numpy）。该防的是 agent 自己的习惯，而不是去对照一份「代码会怎么坏」的通用清单。
9. **需要判断力的地方，评审模型才起作用。** v13、v14 里 chainloop 的两次失败，一次是 `deepseek-flash` 评审把 `\n` 是数据还是转义判错了，另一次是碰撞问题，后来由 v15 修好。换 `sol` 评审是 4/4，可 v15 用 `deepseek-flash` 评审也是 4/4，所以这只算线索。
10. **benchmark 本身也是软件，我们的就有 bug。** 我们的评分器前后错过三次，快照有一次悄悄漏了被跟踪的文件，还有一次评审直接去翻了上游真正的修复。每个 bug 都会产出一个看着很确定、其实是错的数字。

下面逐条讲它们怎么来的，我们自己搞砸的地方也在里面。

## 为什么开始

9 月 28 日，Orbi 在三个开源项目的 fork 里各修了一个 issue：[pyinfra](https://github.com/orbi-build/pyinfra/pull/3)、[chainloop](https://github.com/orbi-build/chainloop/pull/3)、[fedify](https://github.com/orbi-build/fedify/pull/3)。三个都过了测试和 Orbi 自己的评审。往上游提之前我们手工复查了一遍，两个是错的。

chainloop 那个是密钥脱敏器。原 issue 说：JWT 后面紧跟一个转义引号时，反斜杠会跟着 JWT 一起被脱敏。Orbi 的修法是剥掉每条命中结果末尾的反斜杠。JWT 修好了，另外两处坏了：

```
输入：DB_PASSWORD=Zq8mLp2Vx9rT\n next
输出：DB_PASSWORD=[REDACTED:generic-password]\n next

输入：password: s
      Host: services.example.com
输出：pa[REDACTED][REDACTED]word: [REDACTED]
      Ho[REDACTED]t: [REDACTED]ervice[REDACTED].example.com
```

（第二例把占位符缩写了。）第一例里，检测器认定的密码是 `Zq8mLp2Vx9rT\n`，结尾是字面的反斜杠加 `n`。修复把这两个字符从命中结果里剥掉，它们就以明文留在了日志里。第二例的密钥只有一个字符，脱敏器干脆把正文里所有的 `s` 都换掉了。

pyinfra 那个是中日韩文字把结果表格挤歪了。修复把宽字符按两列算，issue 里的例子对齐了，👍🏽 和分解形式的「が」却比修之前更歪。

两个交付上，Orbi 写在 fork issue 里的评审意见全文都是 `review: pass, no findings`。评审跑了测试，核对了 issue 里的例子，例子确实过了。回归藏在没人试过的输入里。

三个修复里我们只提了一个到上游。pyinfra 的修复用 Claude Code 手工重写后，提成了 [pyinfra-dev/pyinfra#1977](https://github.com/pyinfra-dev/pyinfra/pull/1977)，并注明了 AI 的参与。chainloop 的要等我们有了信得过的修法再提。fedify 的代码没问题，可 fedify 要求贡献者先被指派 issue 才能开 PR，而维护者自己接了这张票，已经关掉。

## 怎么测

<figure class="post-media">
<img src="/img/diagrams/harness-flow-zh.svg" alt="每次运行：私有快照仓库交给真实的 Orbi runner 跑完认领、实现、开 PR、评审、合并，再由隐藏评分器打分。评分器事先校准：原始代码判失败，Orbi 当初合并的 fork PR 判失败，手工核实的正确修复判通过。" width="720" height="300">
<figcaption>评分器在任何变体开跑之前先校准。连坏 PR 都放过的评分器，测不出任何东西。</figcaption>
</figure>

每个 issue，我们都在 Orbi 当初起步的那个 commit 上推一份私有快照仓库，开同样的 issue，打上 `ai-ready`，让一个真实的 Orbi runner 去认领。runner 干的和生产上一样：认领、实现、开 PR、独立评审、修改、合并。之后隐藏评分器给合并后的代码打分，顺带跑仓库自带的 lint、类型检查和全量测试。

任何变体开跑之前，评分器都要过三关：原始代码判失败，Orbi 当初合并的 fork PR 判失败，我们手工核实过的正确修复判通过。chainloop 评分器在 fork PR 上判失败的两项，正是上面那两个输出；pyinfra 的是 👍🏽 和「が」。

一个变体就是一种 harness 和模型的组合，每次改 prompt、skill、`PATH` 里的工具、实现模型、评审模型中的一样或几样。模型有这几个：经 Pi 跑的 `deepseek-flash`、`gpt-5.6-luna`、`gpt-5.6-sol`，经 Claude Code 桥接跑的 Opus 5.5，经 zcode 桥接跑的 GLM 5.3 flash。走桥接时，实现和评审用同一个模型，agent 循环也换成桥接自己的。

变体在一台机器上三四个并行，各用各的私有仓库，看不到彼此的分支。

## 网格

<figure class="post-media">
<img src="/img/diagrams/harness-grid-zh.svg" alt="harness 版本与模型组合的网格。实现和评审都用 deepseek-flash 时，原版 6/15，v15 9/9；原版配 luna 实现、sol 评审 1/3；Opus 5.5 在 v1、v5、v11 上分别是 1/3、2/3、3/4；GLM 5.3 flash 在 v14 上 2/3；v15 配 deepseek 实现、sol 评审 4/4，只跑了 chainloop。" width="720" height="428">
<figcaption>行是 harness 版本，列是「实现 / 评审」。ds = deepseek-flash。格子里是三个仓库合计的「通过 / 运行」。</figcaption>
</figure>

网格故意留得稀疏。那一夜每一步都在挑「最便宜、又能回答眼前问题」的那次运行，没打算做全因子实验。非 deepseek 的格子大多只有 2 到 4 次，当线索看就好，`ds/ds` 那一列才是结果。

## harness 的改动起了什么作用

<figure class="post-media">
<img src="/img/diagrams/harness-trend-zh.svg" alt="实现和评审都用 deepseek-flash 时各 harness 版本的通过率：v0 6/15，v1 5/7，v4 1/3，v5 4/4，v10 1/2，v11 6/9，v13 11/12，v14 8/9，v15 9/9。" width="720" height="470">
<figcaption>全程同一个模型。浅色柱不到 5 次。</figcaption>
</figure>

<figure class="post-media">
<img src="/img/diagrams/harness-per-repo-zh.svg" alt="分仓库，原版 harness 对比 v13 到 v15：pyinfra 从 0/5 到 11/11，chainloop 从 5/6 到 10/12，fedify 从 1/4 到 7/7。" width="720" height="340">
<figcaption>pyinfra 和 fedify 变化最大。chainloop 在原版下多数时候就能过，回归只是偶尔出现，这才危险。</figcaption>
</figure>

下面每条规则，都是读完一次失败运行的会话记录后加的。版本逐个累加。

### v1：要求对比修复前后

第一次尝试最直接：让两个角色都对比修复前后的行为，写下查了什么。pyinfra 从 0/5 变成 2/3。

失败的那几次值得细看。agent 确实做了对比，只是例子是它自己挑的。有一次它拿 U+0301（拉丁字母的尖音符，旧代码本来就处理得对）去测组合字符，从头到尾没试 U+3099（日文浊音符，恰好被修复改坏）。让 agent 自己找回归，它只找得到早就料到的那些。

### v4：同一条规则做成独立 skill

我们把 v1 的规则从 prompt 挪进一个独立 skill，结果 1/3。会话记录显示 skill 确实读了。3 次运行说明不了换载体有没有坏处，至少看得出没有好处：这条规则照样允许 agent 自己挑样本。

### v5：输入用程序生成

v5 要求输入由程序按整类批量生成（文本类：ASCII、中日韩与全角、组合字符、emoji 修饰符、零宽序列、ANSI 码；语法类：转义、奇偶数个反斜杠、引号、分隔符），并把数量写进 `.orbi/regression.md`，方便评审核对。此后的运行动辄生成上千个输入：v5 有一次给脱敏器生成了 2756 个；后来一次 Opus 运行给表格生成了 119 万个字符单元，是我们见过最多的。v5 四次全过。

### v9 与 v11：判据不能是改动本身

接着一个强模型让我们看到，光生成输入还不够。下面摘自 `gpt-5.6-sol` 在 pyinfra 上一次运行自己写的回归报告：

```
The comparison uses an independent reference formatter implementing that rule
...
- inputs: 1,200
- head wrong: 0
- base wrong: 1,111
- head wrong but base right (regressions): 0
```

它说的「that rule」，就是修复刚实现的那条规则：东亚宽字符按两列算。这个「独立」的参考实现只是把修复重写了一遍，当然处处对得上。👍🏽 的回归还在。

v11 要求判据独立于补丁：现成的库、修改前行为中本来正确的部分，或者某个不变量。它还要求 agent 先列出依赖树，参考实现往往已经装在环境里。

### v11：工具进 `PATH`，以及我们自己文本里的 bug

fedify 失败怪我们自己。prompt 里有个例子：「加 changelog 片段，别改生成的 changelog」。对很多项目这是好建议，可 fedify 用 `sacho` 且开了 materialize，上游每个 commit 都同时改片段和 `CHANGES.md`。照着例子做的运行，全挂在 `sacho check` 上。

修法是不再把项目规矩写进 harness。v11 的规则是：找到仓库自带的贡献工具，跑它的检查命令，以它为准。我们还把 `sacho` 和 `deno` 放进了 runner 的 `PATH`，agent 跑不了的规则，它只能猜。fedify 从 1/4 到了 3/3。修复能不能原样提到上游也跟着变了（commit 标题合规、签名、AI 披露、没有 fork 里的 `#1` 引用）：原版 15 次里 9 次过，v11 到 v15 是 39 次全过。

### v13：被剥掉的字符也是数据

v11 下，chainloop 的回归偶尔还能漏过去。那几次运行生成的输入又多又杂，可每一个都把反斜杠放在密钥后面：`secret\`、`secret\\`、`secret\n`。没有哪个密钥自己以反斜杠加 `n` 结尾，而会泄漏的偏偏就是这种。

v13 直接点名这类输入：改动要是会剥掉或截掉某些字符，就得测本身包含或以这些字符结尾的值，并查清哪些产出方（这里是检测规则）会产出这种值。chainloop 到了 4/5。

### v14：参考实现交叉比对

agent 用上真正的参考实现后，又冒出一种新失败。pyinfra 环境里的 `wcwidth` 0.2.14 把 👍🏽 算成 4 列，应该是 2 列。agent 信了它，就会认定回归是对的、旧行为才错。同一个环境里的 `rich` 倒是算对了。

v14 要求有多个参考实现时互相比对，写明信哪个、为什么（一般信 Unicode 数据更新的那个）。8/9。

### v15：碰撞检查

单字符 `s` 的问题是另一回事。修复改了要搜索的串（一个被截短的密钥），然后把这个更短的串出现的地方全替换了。v15 加了一条：改动要是改变了要搜索或替换的文本，就得测这段文本在别处出现的情况。9/9。

### v17：产出方清单（实验）

v17 要求回归报告附一张表，列出每条可能产出风险输入的规则，评审逐行核对。agent 真去读了检测器的规则文件，把 `generic-password` 列了进去。chainloop 上 3/4，和 v15 分不出高下。

## 模型起了什么作用

换模型的结果比改 harness 难解读：每次换模型都连带换了 prompt 版本，走桥接的还换了 agent 循环。

- **原版 harness，luna 实现、sol 评审：** 1/3，漏掉的 pyinfra 回归和 `deepseek-flash` 一样。模型更强，指令没变，查的还是那几个例子。
- **v5，两个角色都用 sol：** 1/2，上面那个循环判据就出自这里。强模型很会围着自己的假设搭一套看着很有说服力的测试。
- **Opus 5.5，v1、v5、v11：** 分别是 1/3、2/3、3/4。Opus 的探针做得最深，那个 119 万单元的输入集就是它生成的。在 v14 加上交叉比对之前，它也信过一次过时的 `wcwidth`。它的桥接当时也会丢掉 skill（唯一配了 skill 的 Opus 变体 v12 因此没用上），这批运行之后才修好，所以 Opus 那几格只能按「只有 prompt」来看。
- **GLM 5.3 flash，v14：** 2/3，过了 pyinfra 和 chainloop，挂在 fedify 的 `sacho check` 上。它的桥接当时会静默丢掉 skill，是我们这次发现并修掉的；不过 prompt 里也写了同一条规则，这次失败不能算到丢 skill 头上。它还慢：每次运行中位数 68 分钟，同一个 prompt 下 `deepseek-flash` 是 23 分钟。
- **v15，deepseek 实现、sol 评审：** chainloop 上 4/4。v15 用 `deepseek-flash` 评审也是 4/4，还看不出更强的评审有帮助。耗时反而更长：chainloop 上中位数 29.5 分钟，v15 是 21 分钟。

在这批运行里，harness 对结果的影响远大于任何一次换模型。这只是这批数据的结论，不等于说模型不重要。

## 九个它从没见过的 issue

上面这些，都是在同样三个 issue 上调参、又在同样三个 issue 上打分，属于训练集成绩。规则到底能推广，还是只记住了这三个 bug，从这里看不出来。所以我们又做了一个留出集。

我们挑了九个 2026 年 8 月 10 日之后在上游合并的真实 bug 修复，Go、TypeScript、Python 各三个：`gojq`（全局模式下的空正则匹配）、`urfave/cli`（单独一个 `-` 之后的参数）、`pflag`（超宽单词之后的换行）、`magic-string`（替换串里的 `$` 模式）、`recast`（`??` 与 `||` 混用时的括号）、`cron-parser`（带步长区间的字符串化）、`python-dotenv`（单引号值里的反斜杠）、`markdown-it-py`（开启表格时文件末尾的引用块）、`pyjwt`（带填充的 Base64URL 段）。隐藏评分器用的是维护者在修复里自己写的测试，我们和 Orbi 都没碰过，校准方法相同：修复前判失败，修复后判通过。Orbi 看到的 issue 正文经过改写，去掉了链接、编号和一切修法提示。

<figure class="post-media">
<img src="/img/diagrams/harness-heldout-zh.svg" alt="九个没见过的 issue 上，原版 harness、v15、v15 加 sol 评审三组的结果，全部通过。" width="720" height="440">
<figcaption>九个 issue、三种组合，27 次全部通过。</figcaption>
</figure>

三组在留出集上全部通过。好的一面是，在三个 bug 上调出来的规则，没让 Orbi 在另外九个、三种语言的 issue 上变差。可这九个也根本用不上这些规则：它们是普通 bug，修复是局部的，agent 自己写的测试和维护者写的差不多。

<figure class="post-media">
<img src="/img/diagrams/harness-cost-zh.svg" alt="原版与 v15 每次运行的 token 和耗时中位数，分训练 issue 和留出 issue。留出 issue 上 v15 用了 580 万 token，原版 280 万；耗时 16 分钟对 11 分钟。" width="720" height="360">
<figcaption>每次运行的中位数。token 里包含缓存读取，约占 97%。</figcaption>
</figure>

而且 v15 更贵。留出集上，它每次运行的 token 中位数是 580 万，原版是 280 万；耗时 16 分钟对 11 分钟。pflag 上它写了 274 行，原版 88 行，多出来的大多是生成的回归测试。token 里约 97% 是缓存读取，在 `deepseek-flash` 上很便宜，账单没有 token 数看着那么吓人，多花的时间却是实打实的。

## 第一次真实修复就改坏过东西的 issue

九个留出 bug 对两套 harness 都不难，可当初出事，偏偏是修复改坏了别的东西。于是我们专门找这种真实案例：上游合并了一个修复，后来发现它引入了回归，又修了一次。挑出三个，每个的评分器都满足三点：第一次修复之前的代码判失败，第一次修复本身判失败，最终修复判通过。

- **numpy**：`np.linspace(np.inf, np.inf, 5)` 返回一串 NaN。上游第一次修复处理了无穷大，却改坏了 `ndarray` 的子类，astropy 的 `Quantity` 用不了了，又补了一个 PR。
- **OpenTelemetry Collector 的 Elasticsearch exporter**：所有重试共用一个 `timeout` 预算，Elasticsearch 一挂数据就被丢掉。第一次修复不再共用预算，却顺手让 `timeout` 基本失效了。
- **aiohttp**：压缩的 WebSocket 消息分片之间夹了一个 PING 或 PONG，消息就会损坏。第一次修复之后，先收到 PONG 再来的合法压缩帧会被拒收。

Orbi 只看得到原始的 bug 报告，工单里一个字都没提回归。别把正常的行为改坏，这本来就是修 bug 的分内事。

<figure class="post-media">
<img src="/img/diagrams/harness-hard-zh.svg" alt="三个容易改出回归的 bug：numpy、otel-collector、aiohttp。原版 harness 计分的 4 次全过，v15 3 次全过；v15 一次也没跑完 numpy。" width="720" height="310">
<figcaption>评分器同时测原 bug 和上游第一次修复引入的那个回归。</figcaption>
</figure>

原版 harness 计分的四次全过，v15 三次全过。v15 一次也没跑完 numpy，三次尝试都因内存被杀，所以它的 3/3 是 aiohttp 一次、OpenTelemetry Collector 两次。

我们本以为这一组能把两套 harness 分开，结果没有。原因很简单：人第一次修时犯的错，不是这个 agent 会犯的错。原版的四次运行里，没有一次重现上游第一次修复引入的那个回归。Orbi 真正交付过的回归，就是 pyinfra 和 chainloop 那两个，出自另一个习惯：只核对 issue 里的例子，别的不看。

所以回归防护该盯住 agent 自己的失败方式，而不是一份「代码会怎么坏」的通用清单。当然，只有三个样本，能说的也就这么多。

## 搭 benchmark 学到的，和跑 benchmark 一样多

我们在自己的测量里找到的 bug，比在 harness 里找到的还多。每一个都会产出一个看着很确定、其实是错的数字。

- **评分器执行了错的规则。** 我们第一版 fedify 评分器要求 `CHANGES.md` 不能动，可上游每次都改它。后来换成了项目自己的 `sacho check`。
- **评分器超出了票面。** 第一版 chainloop 评分器还要求 JWT 后面的换行必须保留。issue 从没提过这一点，于是每次运行都「没通过」一个没人要求的条件。后来拆成核心检查（不比修改前更差）和一项仅供参考的检查。
- **评分器量错了东西。** 第一版 pyinfra 评分器把 ANSI 颜色码也算进了列宽。
- **快照漏了文件。** recast 的 `.gitignore` 忽略了 `*.js`，仓库却跟踪着三个 `.js` 测试夹具。我们建快照用的 `git add -A` 会跳过被忽略的文件，agent 就在缺文件的仓库里干活，评分器也因为缺文件判失败。两次运行作废重跑，改成 `git add -A -f` 就好了。
- **答案漏出去过两次。** 一次是老的 fork PR 在上游 issue 上留下了交叉引用，一次 fedify 评审顺着找到它，当成了标准答案。另一次是 pflag 的评审直接 `gh pr view` 了上游真正的修复。那次评审发生在代码写完之后，一轮就通过，结果仍然有效；不过从那以后，所有留出集运行都套上了 `gh` 和 `git` 包装，只放行 benchmark 自己的仓库。
- **机器本身也是实验的一部分。** 一共作废了 14 次运行：2 次是上面说的 recast 快照问题，10 次因内存被杀（numpy 要从源码编译，`/tmp` 又是内存盘，被 agent 的临时文件塞满），还有 2 次撞上了被杀运行留下的同名实例。内存压力还两次杀掉了驱动 benchmark 的会话。现在我们一次只跑一两个实例，`TMPDIR` 指到磁盘上，再用一个看门狗赶在内核动手之前停掉 benchmark 进程。
- **API 额度是共享的。** 每次运行、账号下每个生产 runner 都在用同一份 GraphQL 额度。我们加了一道闸：额度低于阈值就让队列等着。我们起初把额度消耗主要算在生产 runner 的分支清理头上，认真量过才发现它每小时只用约 400 点，比最初写下的数小得多。

由此定下的规矩：评分器打任何分之前，先让它在已知坏版本上判失败、在已知好版本上判通过。结果出乎意料时，先读会话记录，再决定信不信。

## 上篇走到哪一步

头两轮下来，v15 修好了调参时碰到的所有失败，在十二个没见过的 bug 上没弄坏任何东西，成本中位数却多了差不多一倍。这样的结果没法直接上线。一个让修复成本中位数翻倍的防护，得先证明它在没见过的 bug 上真能拦住点什么，而普通留出题根本没给它出手的机会。

所以下一轮的问题更窄，也更难：碰上和 Orbi 真实失败同一类的新 bug，原版会不会翻车？能不能用更便宜的 harness 保住修复？答案在[下篇](/zh/blog/is-the-regression-guard-worth-its-tokens/)。

上篇的局限很明显。调参集只有三个 issue，留出集是九个和三个，很多格子不到 5 次。隐藏评分器也只抓得到有人事先想到要测的缺陷，哪怕这个人是上游维护者。

## 如果你也在跑 coding agent

不管用的是哪个 agent，这周就能做五件事：

1. 挑一个已经合并的 agent PR，写出你觉得它会处理错的输入，跑一下。要是真坏了，回头看看评审当时说了什么。
2. agent 写回归检查时，找出它的判据。判据要是从改动里推出来的，这个检查就是摆设。
3. 让 agent 用程序生成输入，并报告数量。评审能核对一个数字，没法核对一句「我测了边界情况」。
4. 把仓库自己的工具放进 agent 的 `PATH`，以它们的规则为准，别把项目约定写进你的 prompt。
5. 如果你也做 benchmark，每个评分器先对着已知坏版本和已知好版本校准，并且让 agent 碰不到真正的答案。

[Orbi Cloud](https://orbi.build/cloud/?ref=blog-harness-zh) 可以在你自己的 issue 上跑这里描述的流程。benchmark 在 [orbi-build/orbi-bench](https://github.com/orbi-build/orbi-bench)，可以拿去测你自己的 agent。

## 相关

继续阅读：[Claude Code 对比](/zh/compare/claude-code/) 与 [Cloud](/zh/cloud/)。
