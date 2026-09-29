---
title: 给 Orbi 找 harness：prompt 和模型的组合，跑了 96 次
date: 2026-09-29
summary: 我们在三个开源 issue 上把 Orbi 的完整交付流程跑了 96 次，把 harness 版本和实现模型、评审模型交叉组合，每次结果都由一个校准过的隐藏评分器打分。
lang: zh
author: Orbi
image: /img/blog-harness-search.png
mirror: searching-for-orbis-harness
---

Orbi 由两部分套在一起。一部分是 harness：prompt、skill、runner `PATH` 里的工具，还有「一个 agent 写修复、另一个 agent 评审」这套流程。另一部分是跑在里面的模型。交付出了错，只看一次运行，分不清是哪一半的问题。所以我们把 harness 版本和模型交叉起来，在同样三个 issue 上把完整流程跑了 96 次，想找出 Orbi 该用哪个组合。

### 为什么现在做

9 月 28 日，Orbi 在三个开源项目的 fork 里各修了一个 issue：[pyinfra](https://github.com/orbi-build/pyinfra/pull/3)、[chainloop](https://github.com/orbi-build/chainloop/pull/3)、[fedify](https://github.com/orbi-build/fedify/pull/3)。三个都过了测试，也过了 Orbi 自己的评审。往上游提之前我们手工复查，有两个是错的。

chainloop 那个是密钥脱敏器，修完之后会漏出半截密码：

```
输入：DB_PASSWORD=Zq8mLp2Vx9rT\n next
输出：DB_PASSWORD=[REDACTED:generic-password]\n next
```

检测器认定的密码是 `Zq8mLp2Vx9rT\n`，结尾是字面的反斜杠加 `n`。修复把这两个字符从命中结果里剥掉了，它们就留在了日志里。换成只有一个字符的密钥 `s`，正文里所有的 `s` 都会被替换。pyinfra 的修复让 issue 里那个中日韩文字的例子对齐了，👍🏽 和分解形式的「が」却比修之前更歪。两个 PR 上，Orbi 的评审意见都是 `review: pass, no findings`。

评审跑了测试，也核对了 issue 里的例子，例子是过的。回归藏在没人试过的输入里。

### 怎么测

每个 issue 都在 Orbi 当初起步的那个 commit 上做一份私有快照仓库。真实的 Orbi runner 在上面跑完整流程：认领、写修复、开 PR、评审、合并。然后由一个 Orbi 看不到的隐藏评分器给合并后的代码打分，同时跑仓库自带的检查和全量测试。

评分器用之前先校准：原始代码必须判失败，Orbi 当初合并的 fork PR 必须判失败，我们手工核实过的正确修复必须判通过。chainloop 评分器在那个 fork PR 上判失败的两项，就是密码尾巴和单字符密钥。

<figure class="post-media">
<img src="/img/diagrams/harness-flow-zh.svg" alt="每次运行：私有快照仓库交给真实的 Orbi runner 跑完认领、实现、开 PR、评审、合并，再由隐藏评分器打分。评分器事先校准：原始代码判失败，Orbi 当初合并的 fork PR 判失败，手工核实的正确修复判通过。" width="720" height="300">
<figcaption>评分器在任何变体开跑之前先校准。连坏 PR 都放过的评分器，测不出任何东西。</figcaption>
</figure>

各个变体改的是 prompt、skill、`PATH` 里的工具、实现模型、评审模型，或者其中几样。模型有这几个：经 Pi 跑的 `deepseek-flash`、`gpt-5.6-luna`、`gpt-5.6-sol`，经 Claude Code 桥接跑的 Opus 5.5，经 zcode 桥接跑的 GLM 5.3 flash。两个桥接列里，实现和评审是同一个模型，agent 循环也换成了桥接那一侧的，不是 Pi。

### 网格

行是 harness 版本，除非另有说明，每一行都在上一行的基础上改。列是模型组合，写成「实现 / 评审」。格子里是三个仓库合计的「通过次数 / 运行次数」。

<figure class="post-media">
<img src="/img/diagrams/harness-grid-zh.svg" alt="harness 版本与模型组合的网格。实现和评审都用 deepseek-flash 时，原版 6/15，v15 9/9；原版配 luna 实现、sol 评审 1/3；Opus 5.5 在 v1、v5、v11 上分别是 1/3、2/3、3/4；GLM 5.3 flash 在 v14 上 2/3；v15 配 deepseek 实现、sol 评审 4/4，只跑了 chainloop。" width="720" height="428">
<figcaption>行是 harness 版本，列是「实现 / 评审」。ds = deepseek-flash。非 deepseek 的格子大多只有 2 到 4 次。</figcaption>
</figure>

这张网格是稀疏的。我们每次只补当时要回答的那几格，没做全因子实验。非 deepseek 的格子大多只有 2 到 4 次。

### harness 的改动起了什么作用

模型固定在 `deepseek-flash`，harness 从 6/15 到了 v13–v15 合计 28/30。每条规则都来自读失败那次运行的会话记录：

<figure class="post-media">
<img src="/img/diagrams/harness-trend-zh.svg" alt="实现和评审都用 deepseek-flash 时各 harness 版本的通过率：v0 6/15，v1 5/7，v4 1/3，v5 4/4，v10 1/2，v11 6/9，v13 11/12，v14 8/9，v15 9/9。" width="720" height="470">
<figcaption>全程同一个模型。浅色柱不到 5 次。</figcaption>
</figure>

<figure class="post-media">
<img src="/img/diagrams/harness-per-repo-zh.svg" alt="分仓库，原版 harness 对比 v13 到 v15：pyinfra 从 0/5 到 11/11，chainloop 从 5/6 到 10/12，fedify 从 1/4 到 7/7。" width="720" height="340">
<figcaption>pyinfra 和 fedify 变化最大。chainloop 在原版下本来就多数能过，它的回归是低频的。</figcaption>
</figure>

1. **输入要用程序生成。** v1 要求 agent 对比修复前后，它挑的例子本来就没问题：测了从来没坏过的 U+0301，没测 U+3099。从 v5 起，输入由程序按整类字符批量生成，脱敏器最多生成了 2756 个输入，表格那边最多 119 万个字符单元。
2. **判据不能是改动本身。** 有一次 `sol` 拿自己刚实现的规则去算「期望输出」，差异是零。v11 要求判据独立于补丁。
3. **被剥掉的字符也是数据。** 密码泄漏只在密钥自己以 `\` 或 `\n` 结尾时出现，agent 造输入时只会把反斜杠放在密钥后面。v13 点名了这类输入。
4. **参考实现要交叉比对。** `wcwidth` 0.2.14 把 👍🏽 算成 4 列，`rich` 算成 2 列。信了 `wcwidth` 的 agent 会「证明」那个回归是对的。v14 要求 agent 比对多个参考实现，写明信哪个。
5. **碰撞检查。** 修复改了要搜索或替换的文本，就要测这段文本在别处出现的情况。单字符 `s` 就是这么抓到的，在 v15 加入。
6. **贡献规矩以仓库自己的工具为准。** 我们自己的 prompt 里有个例子，说别改生成的 changelog。fedify 的 `sacho` 配置每个 commit 都会改它，是这个例子把 Orbi 带偏了。从 v11 起，agent 跑仓库自带的检查（`sacho check`），工具也放进了 runner 的 `PATH`。

v1 的规则做成独立 skill（v4）是 1/3，写在 prompt 里是 5/7。会话记录显示 skill 确实被读了，3 次也说明不了载体有没有影响。不管哪种载体，这条规则都还允许 agent 自己挑样本，那才是真问题。

### 模型起了什么作用

模型这边更难读，因为每次换模型都同时换了 prompt 版本，Opus 和 GLM 还换了 agent 循环。

- 原版 harness 下，`luna` 实现、`sol` 评审是 1/3，漏掉的 pyinfra 回归和 `deepseek-flash` 一样。
- Opus 5.5 的探针做得最深，v12 里生成了 119 万个字符单元。可同样是 v11 的 prompt，它 3/4，deepseek 6/9，次数太少，分不出谁强。
- GLM 5.3 flash 在 v14 上过了 pyinfra 和 chainloop，fedify 挂在 `sacho check` 上。它的桥接当时会把贡献 skill 静默丢掉（现在已修），但 prompt 里也写了同一条规则，所以这次失败不能算到丢 skill 头上。
- 唯一一组干净的评审模型对照，是 v15 把评审从 `deepseek-flash` 换成 `sol`，只跑了 chainloop：4/4 对 4/4。v13、v14 里 chainloop 的两次失败，都是 deepseek 评审把 `\n` 是数据还是转义判错了，所以才想试 sol，但眼下的数据还分不出两个评审的高下。

在这 96 次里，harness 改动对数字的影响远大于我们做过的任何一次换模型。这句话只对这批数据成立，不等于说模型不重要。

### 现在到哪了

目前领先的是 v15，实现和评审都用 `deepseek-flash`：三个仓库合计 9/9。v13 接近，11/12。v5 跑的 4 次全过了，但次数太少，不能当依据。下一步是让 `sol` 做评审，在三个仓库上都跑一遍。

局限有三条，而且都是实打实的。harness 是在这三个 issue 上调出来的，又在同样三个 issue 上打分，还没有留出集，9/9 是训练集上的成绩。网格是稀疏的。评分器也只能抓到我们事先知道要查的缺陷。下一轮是拿 v15 去跑它没见过的 issue，评分器按同样的方法校准。

发现这些回归之后，提到上游的 pyinfra PR 是用 Claude Code 手工重写的，目前还开着；chainloop 和 fedify 的还没提。

### 放在哪

prompt 改动、两个独立 skill（`orbi-regression-guard` 和 `orbi-upstream-contribution`），还有 benchmark 本身，都在 Orbi 的 [`harness/regression-guard`](https://github.com/orbi-build/orbi/tree/harness/regression-guard) 分支上。benchmark 在 `bench/oss-upstream/` 下，包括建实例、隐藏评分器、打分和汇总。这些还不是默认配置：生成输入、跑参考实现，会让每次交付更慢，token 也用得更多。

如果你在跑 coding agent，这周可以试一件事：挑一个已经合并的 agent PR，写出你觉得它会处理错的那个输入，看看你的评审拦不拦得住。[Orbi Cloud](https://orbi.build/cloud/?ref=blog-harness-zh) 可以在你自己的 issue 上跑这套流程。

## 相关

继续阅读：[Claude Code 对比](/zh/compare/claude-code/) 与 [Cloud](/zh/cloud/)。
