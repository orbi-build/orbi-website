---
title: 给 Orbi 找 harness：一百多次 benchmark 教会我们的事
date: 2026-09-29
summary: 我们把 Orbi 的完整交付流程重跑了一百多次，把 prompt 版本和实现模型、评审模型交叉组合，既跑 Orbi 翻过车的 issue，也跑它从没见过的 issue。这里是十条结论和背后的数据。
lang: zh
author: Orbi
image: /img/blog-harness-search.png
mirror: searching-for-orbis-harness
---

Orbi 把一个 GitHub issue 变成一个评审过、合并掉的 PR。一个 agent 写修复，另一个 agent 评审，评审不过就接着改。模型外面包着的那一层就是 harness：每个角色拿到的 prompt、旁边加载的 skill、runner `PATH` 里的工具，以及评审什么时候才算通过的规矩。

交付出了错，只看一次运行分不清是哪一半的问题，是模型还是 harness。所以我们不猜了。一个晚上加第二天上午，把 Orbi 的完整流程一遍遍重跑：先跑三个 Orbi 交付出过回归的开源 issue，再跑九个它从没见过的 issue，最后跑 三 个特意挑的 issue，它们在真实世界里的第一次修复就改坏过东西。prompt、skill、工具、实现模型、评审模型轮流换，每次合并的结果都交给一个 Orbi 看不到的隐藏评分器打分。

这是长版本。只看结果、局限和复跑脚本，可以去 [benchmark 页](/zh/benchmark/)。先给短版本。

## 十条结论

1. **在我们拿来调参的 issue 上，harness 对结果的影响比任何一次换模型都大。** 实现和评审都用 `deepseek-flash`，原版 harness 在三个调参 issue 上 15 次过 6 次，v13 到 v15 是 30 次过 28 次。这是训练集成绩，没调过参的 issue 上是什么情况，看第 7 条。同一条规则，只要还允许 agent 自己挑测试输入，就不起作用。
2. **「对比修复前后」不够。** 让 agent 查回归，它只会查自己本来就相信没问题的例子。有一次它测了从来没坏过的 U+0301，偏偏没测坏掉的 U+3099。输入得由程序按整类批量生成。
3. **从修复里推出来的判据，什么也证明不了。** 一次 `gpt-5.6-sol` 的运行生成了 1200 张表，拿去和一个「参考实现」比对，而这个参考实现就是它刚写的规则。报告写着 `head wrong: 0`，回归照样交付了。
4. **参考库也会错。** `wcwidth` 0.2.14 把 👍🏽 算成 4 列。信了它的 agent 会「证明」回归是对的。至少拿两个参考实现交叉比对，并写明信哪个。
5. **被剥掉的字符本身也是数据。** 密码泄漏要求密钥自己以 `\n` 结尾。agent 造输入时只会把反斜杠放在密钥后面，从不放进密钥里。把这类输入点名写进规则，问题就解决了。
6. **你自己写的 harness 文本也可能就是 bug。** 我们写的一个例子（「别改生成的 changelog」）对某个项目是错的，把 Orbi 带偏了。仓库的规矩应该来自仓库自己的工具。
7. **在普通 bug 上，更强的 harness 要花大约两倍的钱，却换不来我们能测到的收益。** 九个没见过的 issue 上，原版、v15、v15 加 sol 评审三组都是 9/9。v15 的 token 中位数是原版的 2.0 倍，耗时 1.45 倍。
8. **agent 不会重犯人犯过的回归。** 三个上游第一次修复就改坏过东西的 bug（numpy、OpenTelemetry Collector、aiohttp）上，评分同时覆盖原 bug 和那次回归，原版 harness 4 次全过，v15 3 次全过。要防的是 agent 自己的习惯，不是一份「代码会怎么坏」的通用清单。
9. **需要判断力的地方，评审模型才起作用。** v13、v14 里 chainloop 的两次失败，都是 `deepseek-flash` 评审把 `\n` 是数据还是转义判错了。换 `sol` 评审是 4/4，但 v15 用 `deepseek-flash` 评审也是 4/4，所以这只是线索，还不是结论。
10. **benchmark 本身也是软件，我们的就有 bug。** 我们的评分器前后错过三次，有一次快照悄悄漏了被跟踪的文件，还有一次评审直接去查了上游真正的修复。每一个都会产出一个看起来很确定、实际是错的数字。

下面是每一条是怎么来的，包括我们自己搞砸的部分。

## 为什么开始

9 月 28 日，Orbi 在三个开源项目的 fork 里各修了一个 issue：[pyinfra](https://github.com/orbi-build/pyinfra/pull/3)、[chainloop](https://github.com/orbi-build/chainloop/pull/3)、[fedify](https://github.com/orbi-build/fedify/pull/3)。三个都过了测试，也过了 Orbi 自己的评审。往上游提之前我们手工复查，有两个是错的。

chainloop 那个是密钥脱敏器。原 issue 说：JWT 后面紧跟一个转义引号时，反斜杠会跟着 JWT 一起被脱敏。Orbi 的修法是把每条命中结果末尾的反斜杠剥掉。JWT 的问题修好了，另外两处却坏了：

```
输入：DB_PASSWORD=Zq8mLp2Vx9rT\n next
输出：DB_PASSWORD=[REDACTED:generic-password]\n next

输入：password: s
      Host: services.example.com
输出：pa[REDACTED][REDACTED]word: [REDACTED]
      Ho[REDACTED]t: [REDACTED]ervice[REDACTED].example.com
```

（第二例把占位符缩写了。）第一例里，检测器认定的密码是 `Zq8mLp2Vx9rT\n`，结尾是字面的反斜杠加 `n`。修复把这两个字符从命中结果里剥掉了，它们就明文留在了日志里。第二例的密钥只有一个字符，脱敏器把正文里所有的 `s` 都换掉了。

pyinfra 那个是中日韩文字把结果表格挤歪了。修复把宽字符按两列算，issue 里的例子对齐了，可 👍🏽 和分解形式的「が」反而比修之前更歪。

两个 PR 上，Orbi 的评审意见全文都是 `review: pass, no findings`。评审跑了测试，也核对了 issue 里的例子，例子是过的。回归藏在没人试过的输入里。

## 怎么测

<figure class="post-media">
<img src="/img/diagrams/harness-flow-zh.svg" alt="每次运行：私有快照仓库交给真实的 Orbi runner 跑完认领、实现、开 PR、评审、合并，再由隐藏评分器打分。评分器事先校准：原始代码判失败，Orbi 当初合并的 fork PR 判失败，手工核实的正确修复判通过。" width="720" height="300">
<figcaption>评分器在任何变体开跑之前先校准。连坏 PR 都放过的评分器，测不出任何东西。</figcaption>
</figure>

每个 issue 都在 Orbi 当初起步的那个 commit 上推一份私有快照仓库，在里面开同样的 issue、打上 `ai-ready`，再让一个真实的 Orbi runner 去认领。runner 做的就是它在生产上做的事：认领、实现、开 PR、独立评审、修改、合并。然后隐藏评分器给合并后的代码打分，同时跑仓库自带的 lint、类型检查和全量测试。

任何变体开跑之前，评分器都要过三关：原始代码判失败，Orbi 当初合并的 fork PR 判失败，我们手工核实过的正确修复判通过。chainloop 评分器在 fork PR 上判失败的两项，正是上面那两个输出；pyinfra 的是 👍🏽 和「が」。

一个变体就是一种 harness 和模型的组合。我们改过 prompt、skill、`PATH` 里的工具、实现模型、评审模型，或者其中几样。模型有这几个：经 Pi 跑的 `deepseek-flash`、`gpt-5.6-luna`、`gpt-5.6-sol`，经 Claude Code 桥接跑的 Opus 5.5，经 zcode 桥接跑的 GLM 5.3 flash。两个桥接里，实现和评审是同一个模型，agent 循环也换成了桥接自己的。

变体在一台机器上三四个并行跑，每个用自己的私有仓库，互相看不到对方的分支。

## 网格

<figure class="post-media">
<img src="/img/diagrams/harness-grid-zh.svg" alt="harness 版本与模型组合的网格。实现和评审都用 deepseek-flash 时，原版 6/15，v15 9/9；原版配 luna 实现、sol 评审 1/3；Opus 5.5 在 v1、v5、v11 上分别是 1/3、2/3、3/4；GLM 5.3 flash 在 v14 上 2/3；v15 配 deepseek 实现、sol 评审 4/4，只跑了 chainloop。" width="720" height="428">
<figcaption>行是 harness 版本，列是「实现 / 评审」。ds = deepseek-flash。格子里是三个仓库合计的「通过 / 运行」。</figcaption>
</figure>

网格是故意留稀疏的。那一夜每一步的判断都是「哪一次运行最便宜、又能回答眼前这个问题」，不是做全因子实验。非 deepseek 的格子大多只有 2 到 4 次。其他列当线索看，`ds/ds` 那一列才是结果。

## harness 的改动起了什么作用

<figure class="post-media">
<img src="/img/diagrams/harness-trend-zh.svg" alt="实现和评审都用 deepseek-flash 时各 harness 版本的通过率：v0 6/15，v1 5/7，v4 1/3，v5 4/4，v10 1/2，v11 6/9，v13 11/12，v14 8/9，v15 9/9。" width="720" height="470">
<figcaption>全程同一个模型。浅色柱不到 5 次。</figcaption>
</figure>

<figure class="post-media">
<img src="/img/diagrams/harness-per-repo-zh.svg" alt="分仓库，原版 harness 对比 v13 到 v15：pyinfra 从 0/5 到 11/11，chainloop 从 5/6 到 10/12，fedify 从 1/4 到 7/7。" width="720" height="340">
<figcaption>pyinfra 和 fedify 变化最大。chainloop 在原版下本来就多数能过，它的回归是低频的，危险恰恰在这里。</figcaption>
</figure>

下面每条规则都来自读一次失败运行的会话记录。版本是累加的。

### v1：要求对比修复前后

第一次尝试是最直接的：让两个角色都对比修复前后的行为，并写下查了什么。pyinfra 从 0/5 变成 2/3。

失败的那几次很有意思。agent 确实做了对比，用的是它自己挑的例子。有一次它拿 U+0301（拉丁字母的尖音符，旧代码本来就处理得对）去测组合字符，从头到尾没试 U+3099（日文的浊音符，修复恰好改坏了它）。让 agent 找回归，找到的只会是它本来就预料到的回归。

### v4：同一条规则做成独立 skill

我们把 v1 的规则从 prompt 挪进一个独立 skill，结果 1/3。会话记录显示 skill 确实被读了，3 次也说明不了换载体有没有坏处。能说明的是换载体没有好处：这条规则仍然允许 agent 自己挑样本。

### v5：输入用程序生成

v5 要求输入由程序按整类批量生成（文本类：ASCII、中日韩与全角、组合字符、emoji 修饰符、零宽序列、ANSI 码；语法类：转义、奇偶数个反斜杠、引号、分隔符），并把数量写进 `.orbi/regression.md`，好让评审能核对。之后的运行动辄生成上千个输入，最多的一次脱敏器 2756 个，表格那边 119 万个字符单元。v5 四次全过。

### v9 与 v11：判据不能是改动本身

接着一个强模型让我们看到，光生成输入还不够。下面摘自一次 `gpt-5.6-sol` 在 pyinfra 上自己写的回归报告：

```
The comparison uses an independent reference formatter implementing that rule
...
- inputs: 1,200
- head wrong: 0
- base wrong: 1,111
- head wrong but base right (regressions): 0
```

它说的「that rule」，就是修复刚实现的那条规则：东亚宽字符按两列算。所谓「独立」的参考实现，不过是把修复又写了一遍，当然全都对得上。👍🏽 的回归还在。

v11 要求判据独立于补丁：现成的库、修改前行为中本来正确的部分，或者某个不变量。它还要求 agent 先列出依赖树，因为参考实现往往已经装在环境里了。

### v11：工具进 `PATH`，以及我们自己文本里的 bug

fedify 失败的原因出在我们身上。我们的 prompt 里有个例子：「加 changelog 片段，别改生成的 changelog」。这对很多项目是好建议。可 fedify 用 `sacho` 并开了 materialize，上游每个 commit 都会同时改片段和 `CHANGES.md`。照着我们例子做的运行，全都挂在 `sacho check` 上。

修法是不再把项目规矩写进 harness。v11 的规则是：找到仓库自带的贡献工具，跑它的检查命令，以它为准。我们也把 `sacho` 和 `deno` 放进了 runner 的 `PATH`，agent 执行不了的规则，它就只能猜。fedify 从 1/4 到了 3/3。

### v13：被剥掉的字符也是数据

v11 下，chainloop 的回归有时还能活下来。读那几次运行，生成的输入又多又杂，可每一个都把反斜杠放在密钥后面：`secret\`、`secret\\`、`secret\n`。没有一个密钥自己的最后两个字符就是反斜杠和 `n`，而会泄漏的偏偏是这种输入。

v13 直接点名了这类输入：改动如果会剥掉或截掉某些字符，就要测本身包含或以这些字符结尾的值，并问清楚哪些产出方（这里是检测规则）会产出这种值。chainloop 到了 4/5。

### v14：参考实现交叉比对

agent 开始用真正的参考实现之后，又冒出一种新失败。pyinfra 环境里的 `wcwidth` 0.2.14 把 👍🏽 算成 4 列，不是 2 列。信了它的 agent 会得出结论：回归是对的，旧行为才是错的。同一个环境里装着的 `rich` 算得对。

v14 要求有多个参考实现时互相比对，写明信哪个、为什么（一般信 Unicode 数据更新的那个）。8/9。

### v15：碰撞检查

单字符 `s` 那个问题是另一种机制。修复改了要搜索的串（一个被截短的密钥），然后把所有出现这个更短的串的地方都替换了。v15 加了一条：改动如果改变了要搜索或替换的文本，就要测这段文本在别处出现的情况。9/9。

### v17：产出方清单（实验）

v17 要求回归报告里有一张表，逐条列出每个可能产出风险输入的规则，评审逐行核对。agent 确实去读了检测器的规则文件，把 `generic-password` 列了进去。chainloop 上 3/4，和 v15 分不出高下。

## 模型起了什么作用

换模型比改 harness 难读，因为每次换模型都同时换了 prompt 版本，走桥接的还换了 agent 循环。

- **原版 harness，luna 实现、sol 评审：** 1/3，漏掉的 pyinfra 回归和 `deepseek-flash` 一样。更强的模型拿着同样的指令，查的还是同样那几个例子。
- **v5，两个角色都用 sol：** 1/2，上面那个循环判据就出自这里。强模型特别擅长围绕自己的假设，搭起一套很有说服力的测试。
- **Opus 5.5，v1、v5、v11：** 分别是 1/3、2/3、3/4。Opus 的探针做得最深，那个 119 万单元的输入集就是它生成的。在 v14 加上交叉比对之前，它也信过一次过时的 `wcwidth`。
- **GLM 5.3 flash，v14：** 2/3，过了 pyinfra 和 chainloop，挂在 fedify 的 `sacho check` 上。它的桥接当时会把 skill 静默丢掉，这是我们这次发现并修掉的；但 prompt 里也写了同一条规则，所以这次失败不能算到丢 skill 头上。它也慢：每次运行中位数 68 分钟，差不多的 harness 下 `deepseek-flash` 约 20 分钟。
- **v15，deepseek 实现、sol 评审：** chainloop 上 4/4。v15 用 `deepseek-flash` 评审也是 4/4，所以还说明不了更强的评审有帮助。耗时也更长：中位数 31 分钟，对比 20 分钟。

在这批运行里，harness 对结果的影响远大于任何一次换模型。这句话只对这批数据成立，不等于说模型不重要。

## 九个它从没见过的 issue

上面的一切，都是在同样三个 issue 上调、又在同样三个 issue 上打分，属于训练集成绩，说明不了这些规则是真的能推广，还是只记住了三个 bug。所以我们又做了一个留出集。

我们挑了九个 2026 年 8 月 10 日之后在上游合并的真实 bug 修复，Go、TypeScript、Python 各三个：`gojq`（全局模式下的空正则匹配）、`urfave/cli`（单独一个 `-` 之后的参数）、`pflag`（超宽单词之后的换行）、`magic-string`（替换串里的 `$` 模式）、`recast`（`??` 与 `||` 混用时的括号）、`cron-parser`（带步长区间的字符串化）、`python-dotenv`（单引号值里的反斜杠）、`markdown-it-py`（开启表格时文件末尾的引用块）、`pyjwt`（带填充的 Base64URL 段）。每个的隐藏评分器都是维护者在修复里自己写的测试，我们和 Orbi 都没碰过，校准方法相同：修复前判失败，修复后判通过。Orbi 看到的 issue 正文是改写过的，去掉了链接、编号和任何修法提示。

<figure class="post-media">
<img src="/img/diagrams/harness-heldout-zh.svg" alt="九个没见过的 issue 上，原版 harness、v15、v15 加 sol 评审三组的结果，全部通过。" width="720" height="440">
<figcaption>九个 issue、三种组合，27 次全部通过。</figcaption>
</figure>

三组在留出集上全部通过。这既是好消息，也是警告。好消息是：在三个 bug 上调出来的规则，没有让 Orbi 在另外九个、三种语言的 issue 上变差。警告是：这九个根本用不上这些规则。它们是普通 bug，修复是局部的，agent 自己写的测试和维护者写的测试差不多。

<figure class="post-media">
<img src="/img/diagrams/harness-cost-zh.svg" alt="原版与 v15 每次运行的 token 和耗时中位数，分训练 issue 和留出 issue。留出 issue 上 v15 用了 580 万 token，原版 280 万；耗时 16 分钟对 11 分钟。" width="720" height="360">
<figcaption>每次运行的中位数。token 里包含缓存读取，约占 97%。</figcaption>
</figure>

而且更贵。留出集上，v15 每次运行的 token 中位数是 580 万，原版是 280 万；耗时 16 分钟对 11 分钟。pflag 上它写了 274 行，原版 88 行，多出来的大多是生成的回归测试。所有 token 里约 97% 是缓存读取，在 `deepseek-flash` 上很便宜，所以账单没有 token 数看起来那么吓人。时间是实打实多出来的。

## 第一次真实修复就改坏过东西的 issue

九个留出 bug 对两套 harness 都不难。可当初出事，恰恰是一个修复改坏了别的东西。所以我们专门去找这种真实案例：上游合并了一个修复，后来发现它引入了回归，又修了一次。挑出来三个，每个的评分器都满足三点：第一次修复之前的代码判失败，第一次修复本身判失败，最终修复判通过。

- **numpy**：`np.linspace(np.inf, np.inf, 5)` 返回一串 NaN。上游第一次修复处理了无穷大，却改坏了 `ndarray` 的子类，astropy 的 `Quantity` 用不了了，又补了一个 PR。
- **OpenTelemetry Collector 的 Elasticsearch exporter**：所有重试共用一个 `timeout` 预算，Elasticsearch 一挂数据就被丢掉。第一次修复不再共用预算，却顺手让 `timeout` 基本失效了。
- **aiohttp**：压缩的 WebSocket 消息分片之间夹了一个 PING 或 PONG，消息就会损坏。第一次修复之后，先收到 PONG 再来的合法压缩帧会被拒收。

Orbi 只看得到原始的 bug 报告，工单里一个字都没提回归。不改坏本来就正常的行为，本来就是活的一部分。

<figure class="post-media">
<img src="/img/diagrams/harness-hard-zh.svg" alt="三个容易改出回归的 bug：numpy、otel-collector、aiohttp。原版 harness 4 次全过，v15 3 次全过；numpy 的一次 v15 因内存不足被停掉，未计分。" width="720" height="310">
<figcaption>评分器同时测原 bug 和上游第一次修复引入的那个回归。</figcaption>
</figure>

原版 harness 四次全过，v15 跑完的三次也全过。numpy 有一次 v15 运行在编译 numpy 源码时被我们的内存看门狗停掉，未计分。

我们本以为这一组能把两套 harness 分开，结果没有。原因值得直说：人第一次修时引入的回归，并不是这个 agent 会引入的回归。原版的四次运行里，没有一次重现人第一次修时引入的那个回归。Orbi 真正交付过的回归，也就是 pyinfra 和 chainloop 那两个，来自另一个习惯：只核对 issue 里的例子，别的都不看。

这改变了回归防护该对准的方向。它应该盯的是 agent 自己的失败方式，而不是一份「代码会怎么坏」的通用清单。三个样本，能说的也就到这里。

## 搭 benchmark 学到的，和跑 benchmark 一样多

我们在自己的测量里找到的 bug，比在 harness 里找到的还多。每一个都会产出一个看起来很确定、实际是错的数字。

- **评分器执行了错的规则。** 我们第一版 fedify 评分器要求 `CHANGES.md` 不能动，可上游每次都改它。后来换成了项目自己的 `sacho check`。
- **评分器超出了票面。** 第一版 chainloop 评分器还要求 JWT 后面的换行必须保留。issue 从没要求过这一点，于是每次运行都「没通过」一个没人提过的要求。后来拆成核心检查（不比修改前更差）和一项仅供参考的检查。
- **评分器量错了东西。** 第一版 pyinfra 评分器把 ANSI 颜色码也算进了列宽。
- **快照漏了文件。** recast 的 `.gitignore` 忽略了 `*.js`，仓库却跟踪着三个 `.js` 测试夹具。我们建快照用的是 `git add -A`，会跳过被忽略的文件，于是 agent 在一个缺文件的仓库里干活，评分器也因为缺文件判失败。两次运行都作废重跑，改成 `git add -A -f` 就好了。
- **答案漏出去过两次。** 一次是老的 fork PR 在上游 issue 上留下了交叉引用，一次 fedify 评审顺着找到它，当成了标准答案。另一次是 pflag 的评审直接 `gh pr view` 了上游真正的修复。那一次评审发生在代码写完之后，一轮就通过，结果仍然有效；但从那以后，所有留出集运行都套上了 `gh` 和 `git` 包装，只放行 benchmark 自己的仓库。
- **API 额度是共享的。** 每次运行、账号下每个生产 runner 都在用同一份 GraphQL 额度。我们加了一道闸：额度低于阈值就让队列等着。我们一开始把额度消耗主要算到了生产 runner 的分支清理头上，认真量过之后，它每小时只用约 400 点，比我们最初写下的数小得多。

从这里得出的规矩：评分器打任何分之前，先让它在已知坏版本上判失败、在已知好版本上判通过。看到出乎意料的结果，先读会话记录再信。

## 我们打算怎么用

prompt 改动、两个独立 skill（`orbi-regression-guard` 和 `orbi-upstream-contribution`），以及整套 benchmark，都在 Orbi 的 [`harness/regression-guard`](https://github.com/orbi-build/orbi/tree/harness/regression-guard) 分支上，benchmark 在 `bench/oss-upstream/` 下：建实例、隐藏评分器、打分、汇总。它们还不是 Orbi 的默认配置。

留出集的结果改变了默认配置该是什么样。每个 issue 都跑全套回归防护，会让普通修复的成本翻倍，去防一类大多数 issue 根本不属于的改动。数据指向的做法是只在有风险的地方启用：解析、转义、截断、测量或替换文本的改动，以及改动了别的代码依赖的行为。这是上线之前要在同样的留出集和回归集上测的下一件事。

局限是实打实的。训练集只有三个 issue，留出集九个、回归集 三 个。很多格子不到 5 次。隐藏评分器也只能抓到有人事先知道要测的缺陷，哪怕这个人是上游维护者。

## 如果你也在跑 coding agent

不管你用的是哪个 agent，这周可以做五件事：

1. 挑一个已经合并的 agent PR，写出你觉得它会处理错的那个输入，跑一下。要是坏了，回头看看你的评审当时说了什么。
2. agent 写回归检查时，找到它的判据。判据要是从改动里推出来的，这个检查就只是摆设。
3. 让 agent 用程序生成输入，并报告数量。评审能核对一个数字，核对不了一句「我测了边界情况」。
4. 把仓库自己的工具放进 agent 的 `PATH`，以它们的规则为准，别把项目约定写进你的 prompt。
5. 如果你也做 benchmark，每个评分器先对着已知坏版本和已知好版本校准，并且让 agent 碰不到真正的答案。

[Orbi Cloud](https://orbi.build/cloud/?ref=blog-harness-zh) 可以在你自己的 issue 上跑这里描述的流程；benchmark 也在 GitHub 上，可以拿去测你自己的 agent。

## 相关

继续阅读：[Claude Code 对比](/zh/compare/claude-code/) 与 [Cloud](/zh/cloud/)。
