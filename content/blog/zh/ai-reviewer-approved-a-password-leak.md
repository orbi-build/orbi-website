---
title: 我们的 AI 评审放过了一个密码泄漏
date: 2026-09-29
summary: Orbi 的独立评审给两个开源修复都判了通过，而这两个修复都引入了回归。我们围绕程序生成的输入和独立判据重写了 harness，然后把这几张票重跑了 96 次。
lang: zh
author: Orbi
image: /img/blog-reviewer-leak.png
mirror: ai-reviewer-approved-a-password-leak
---

9 月 28 日，Orbi 在三个开源项目的 fork 里各修了一个 issue：[pyinfra](https://github.com/orbi-build/pyinfra/pull/3)、[chainloop](https://github.com/orbi-build/chainloop/pull/3)、[fedify](https://github.com/orbi-build/fedify/pull/3)。三个 PR 都过了测试，也过了 Orbi 自己的独立评审，都在 fork 里合并了。往上游提之前我们手工复查了一遍，结果有两个是错的。

chainloop 那个是密钥脱敏器。原 issue 说的是：JWT 后面紧跟一个转义引号时，反斜杠会跟着 JWT 一起被脱敏掉。Orbi 的修法是把每条命中结果末尾的反斜杠剥掉。JWT 的问题确实修好了。可换两个输入跑一下合并后的代码，结果是这样（第二例把占位符缩写成了 `[REDACTED]`）：

```
输入：DB_PASSWORD=Zq8mLp2Vx9rT\n next
输出：DB_PASSWORD=[REDACTED:generic-password]\n next

输入：password: s
      Host: services.example.com
输出：pa[REDACTED][REDACTED]word: [REDACTED]
      Ho[REDACTED]t: [REDACTED]ervice[REDACTED].example.com
```

第一例里，检测器认定的密码是 `Zq8mLp2Vx9rT\n`，结尾是字面的反斜杠加 `n`。修复把这两个字符从命中结果里剥掉了，它们就明文留在了输出里。第二例的密钥只有一个字符，日志里所有的 `s` 都被替换了。Orbi 在这个 PR 上的评审意见，全文是 `review: pass, no findings`。

pyinfra 的问题也是一个路数。原 issue 是中日韩文字把结果表格挤歪了。修复把宽字符按两列算，issue 里的例子对齐了，可 👍🏽 和分解形式的「が」反而比修之前更歪。评审同样是 `pass, no findings`。

评审并没有偷懒。两个 PR 它都跑了测试，也核对了 issue 里的例子。例子能过，因为问题从来不在例子上，回归藏在没人想到去试的输入里。

### 我们怎么测 harness

光说「我们改进了 prompt」没什么分量，得有数字。所以我们搭了一套会失败的 benchmark。

三个 issue，每个都在 Orbi 当初起步的那个 commit 上做一份私有快照仓库。真实的 Orbi runner 在上面跑完整个流程：认领、写修复、开 PR、独立评审、合并。然后由一个 Orbi 看不到的隐藏评分器给合并结果打分。

每个评分器用之前都先校准：原始代码必须判失败，Orbi 当初合并的那个带回归的 fork PR 必须判失败，我们手工核实过的正确修复必须判通过。连坏 PR 都放过的评分器，测不出任何东西。chainloop 评分器判失败的两项，就是上面那两个输出。

每个变体在前一个的基础上改一两处（prompt、skill、工具链、实现模型或评审模型），一夜之间并行跑，总共 96 次。

### harness 改了什么

每条规则都来自读失败那次运行的会话记录，不是从最佳实践清单里抄的。

1. **输入要用程序生成。** 第一版只是要求 agent 对比修复前后的行为。pyinfra 从 0/5 变成 2/3，剩下的失败是因为 agent 挑的例子本来就没问题：它测了 U+0301，这个字符从来没坏过，却没测 U+3099。下一版要求用程序按整类字符批量生成输入，并把数量写进 `.orbi/regression.md`。之后的运行，脱敏器最多生成了 2756 个输入，表格那边最多 119 万个字符单元。
2. **判据不能是改动本身。** 有一次强模型拿自己刚实现的规则去算「期望输出」，等于拿修复跟自己比，差异当然是零。现在 prompt 要求判据独立于补丁：参考库、修改前的行为，或者某个不变量。
3. **参考实现要交叉比对。** pyinfra 环境里的 `wcwidth` 0.2.14 把 👍🏽 算成 4 列。信了它的 agent 会「证明」那个回归是对的。`rich` 算得对。现在有多个参考实现时，agent 要互相比对，并写明信哪个、为什么。
4. **要剥掉的字符本身也是数据。** 密码泄漏只在密钥自己以 `\` 或 `\n` 结尾时出现。agent 造输入时总把反斜杠放在密钥后面，从不放进密钥里。现在 prompt 点名了这类输入，并要求列出哪些产出方（这里是检测规则）会产出这种值。
5. **碰撞检查。** 修复如果改动了要搜索或替换的文本，就要测这段文本在别处出现的情况。那个单字符 `s` 就是这么来的。
6. **贡献规矩以仓库自己的工具为准。** 我们自己写的 harness 里有个例子：「加 changelog 片段，别改生成的 changelog」。fedify 用 `sacho` 且开了 materialize，上游每个 commit 两个文件都会改，是我们这个例子把 Orbi 带偏了。现在的规则是跑仓库自带的检查（这里是 `sacho check`），并把这个工具放进 runner 的 `PATH`。

### 结果

每格是「通过次数 / 运行次数」，只看代码是否正确（隐藏评分器、仓库自带检查、全量测试）。除非该行另有说明，实现模型都是 `deepseek-flash`。

```
pyinfra  chainloop  fedify   变体
0/5      5/6        1/4      v0 原版 harness
2/3      2/2        1/2      v1 对比修复前后（手挑样本）
0/1      1/1        0/1      v2 原版 harness，luna + sol
0/1      1/1        0/1      v4 v1 做成独立 skill
2/2      1/1        1/1      v5 生成输入 + 参考实现
0/1      1/1        0/1      v7 v1 的 prompt，Opus 5.5
1/1      1/1        0/1      v8 v5 的 prompt，Opus 5.5
0/1      1/1        –        v9 v5 的 prompt，sol + sol
0/1      –          1/1      v10 v5 + 贡献 skill（旧措辞）
2/3      1/3        3/3      v11 独立判据 + 工具进 PATH
1/2      1/1        1/1      v12 v11 的 prompt，Opus 5.5
4/4      4/5        3/3      v13 + 剥掉的字符也是数据
4/4      2/3        2/2      v14 + 参考实现交叉比对
3/3      4/4        2/2      v15 + 碰撞检查
1/1      1/1        0/1      v16 v14 的 prompt，GLM 5.3 flash
–        3/4        –        v17 v15 + 产出方清单
–        4/4        –        v18 v15，deepseek 实现、sol 评审
```

同一个便宜模型，原版 harness 15 次过了 6 次，v13 到 v15 30 次过了 28 次：pyinfra 11/11，chainloop 10/12，fedify 7/7。两个仓库在原版 harness 下的失败方式不一样：pyinfra 的回归 5 次全都复现了，chainloop 的泄漏 6 次里只出现 1 次。这种低频回归，评审最容易放过去。

### 这些数字说明不了什么

在这批数据里，换更强的模型没能救回原版 prompt。可 pyinfra 上 luna + sol（v2）和 Opus 5.5（v7）各只跑了 1 次，而且 v7 用的是 v1 的 prompt，不是原版。凭这点次数说不了「模型不重要」，chainloop 也说明模型是有用的。v13 到 v15 里 chainloop 的两次失败，都是便宜模型做评审时把 `\n` 是数据还是转义判错了。换成 `gpt-5.6-sol` 做评审、代码仍由 `deepseek-flash` 写，chainloop 4/4；chainloop 上所有强模型评审的运行合计 7/7。安全敏感的代码，我们的做法是便宜模型写、强模型审。

prompt 也是在这三个 issue 上调出来的，又在同样三个 issue 上测。还没有留出集，所以 28/30 是训练集上的分数。下一步是拿 v15 去跑它没见过的 issue，评分器按同样的方法校准。

fedify 的情况也跟我们一开始想的不一样。Orbi 当初那份代码其实是合规的，出问题的是流程：首次贡献要先认领 issue，bug 修复要提到维护分支。现在评分器会跑 `sacho check`，贡献 skill 也要求 agent 动手之前先读 `CONTRIBUTING.md` 和 AI 政策。

发现这些回归之后，提到上游的 pyinfra PR 是用 Claude Code 手工重写的，目前还开着；chainloop 和 fedify 的还没提。Orbi 当初的 fork PR 都还公开着，缺陷就是上面写的那些。

### 放在哪

prompt 改动、两个独立 skill（`orbi-regression-guard` 和 `orbi-upstream-contribution`），以及整套 benchmark（建实例、隐藏评分器、打分脚本）都在 Orbi 的 [`harness/regression-guard`](https://github.com/orbi-build/orbi/tree/harness/regression-guard) 分支上，还不是默认配置。它会让每次交付更慢、用更多 token，生成输入和跑参考实现都要花钱。

这次学到的主要不是「评审要更严」。真正改变数字的，是逼 agent 去测它自己没挑过的输入，拿一个不是它写的答案去比。模型在边缘上有用，但查什么、怎么查，是 harness 定的。

如果你在无人值守地跑 coding agent，这周可以试一件事：挑一个已经合并的 agent PR，写出你觉得它会处理错的那个输入，看看你的评审能不能拦住。[Orbi Cloud](https://orbi.build/cloud/?ref=blog-harness-zh) 可以在你自己的 issue 上跑这套流程。

## 相关

继续阅读：[Claude Code 对比](/zh/compare/claude-code/) 与 [Cloud](/zh/cloud/)。
