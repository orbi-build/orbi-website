---
title: 给 Orbi 找 harness（下）：回归防护值不值它的 token
date: 2026-09-30
summary: 八个 Orbi 没见过的 bug，issue 都只给一个窄例子，原版 harness 三次里挂一次。我们试了五种 harness，想保住修复，又不让每次交付的成本翻倍。这篇讲哪些管用、哪些不管用，以及最后为什么选了最简单的那个。
lang: zh
author: Orbi
image: /img/blog-harness-part2.png
mirror: is-the-regression-guard-worth-its-tokens
---

[上篇](/zh/blog/searching-for-orbis-harness/)结束时，我们手上有一个 harness：调参时碰到的失败它全修好了，可在其他 bug 上成本中位数多了差不多一倍，还测不出任何收益。这样的防护像一份保险。要问的有两件事：它保的风险，在没见过的 bug 上会不会真的出现；这份保险能不能便宜点。

下篇用另外八个 bug 和三种新的 harness 设计来回答。跑法和上篇一样：私有快照，真实的 Orbi runner 跑完整流程，隐藏评分器事先校准，修复前判失败、已知正确的修复判通过。实现和评审全程用 `deepseek-flash`。脚本、任务和结果都在 [orbi-build/orbi-bench](https://github.com/orbi-build/orbi-bench)。

## 六条结论

1. **没见过的 bug 上也会翻车。** 八个 issue 只给窄例子的 bug 上，原版 harness 12 次挂了 4 次。`dateparser` 和 `picomatch` 各是 3 次挂 2 次，挂的正是 issue 没展示的情况。
2. **常开防护能修好。** 同样八个 bug，10 次过 9 次。唯一没过的那次在 `dateparser` 上，挂了维护者 2 个测试，原版在这题上没过的几次挂 4 到 5 个。不过这 2 个里有一个是新问题：那次修复改动了 Python 的全局 `calendar` 模块。
3. **按需触发保住了大部分收益，但不是全部。** 只在改动涉及文本处理时开防护，三个原始失败全过，八个窄例子 bug 过了 7 个（常开版是 10 次过 9 次）。漏掉的是 `picomatch`：两个门控版本（v19 和 v19b）都挂了，常开版两次都过。
4. **按需触发也几乎没省钱。** 九个普通 bug 里有八个触发了门控，按需触发每次用 5.2 百万 token，常开版 5.8 百万，只少约 10%；原版是 2.8 百万。为了省 10% 加一个分类器，还多出一种出错的可能，不划算。
5. **另两种省钱的设计不管用，评审也从没说过「不」。** 只加强评审，三个原始失败只过 1 个：评审 prompt 里写全了回归排查，两个回归它照样放过。先把工单写细，过 2 个。全部 183 次运行里，被隐藏评分器判失败的 38 次，次次都通过了 Orbi 的评审。
6. **所以我们放弃门控。** 最后选了更简单的做法：常开防护加一个按仓库的开关，默认关，bug 多属这几类的仓库（解析器、格式化器、脱敏、各种转义）自己打开。没有分类器，也就不存在分类判错。另外，我们叫停 71 秒后 Orbi 还是把门控版合了进去，已在发版前 revert。

## 八个和 Orbi 翻车同类的新 bug

上篇结束时，除了三个调参 issue，各套 harness 在别处看起来都差不多。可那三次失败有个普通留出题没有的共同点：issue 只给了一个例子，正确的修法却得顾及它周围的一整类输入。所以我们专门去找这类 bug。

八个真实修复，都在 2026 年 8 月 10 日之后合并，都是纯 Python、Go 或 JavaScript 的小库：`loguru`（负时间戳）、`dateparser`（周数格式）、`gocsv`（补零的整数）、`goja`（正则里类转义后跟连字符）、`doublestar`（`{}` 里的字符类）、`picomatch`（取反的方括号）、`markdown-it`（链接里的 IPv6 主机）、`marked`（链接地址里的实体）。每道题维护者的测试都比 issue 的例子覆盖得宽。我们验证过：只照例子写的修法，例子能过，维护者的测试过不了。Orbi 看到的工单只保留 issue 原有的例子。

<figure class="post-media">
<img src="/img/diagrams/harness-narrow-zh.svg" alt="八个 issue 只给窄例子的 bug。原版 harness 12 次过 8 次，dateparser 和 picomatch 各挂 2 次；常开防护 10 次过 9 次；按需触发 8 次过 7 次。" width="720" height="410">
<figcaption>各套 harness 拉开差距的地方。dateparser 和 picomatch 在原版上各跑了 3 次。</figcaption>
</figure>

原版就栽在这里，而且是在没见过的 bug 上。`dateparser` 的 issue 只给了两种周数格式，维护者的测试还覆盖了第 00 周落到上一年，以及不完整的格式；原版三次里有两次修好了那两种格式，却把第 00 周和不完整格式都漏了。`picomatch` 的 issue 给的是 `[!abc]`，测试还覆盖了没闭合的 `[!]` 和 `literalBrackets` 选项，三次里两次漏掉。

常开防护 10 次过 9 次。没过的那次 `dateparser` 挂了 2 个测试（原版没过的几次挂 4 到 5 个），其中一个是它自己引入的回归：改动了 Python 的全局 `calendar` 模块。按需触发 8 次过 7 次，`picomatch` 挂了一次。样本都小，一次运行就能让一格翻过来，但方向和那三次原始失败一致：修法要覆盖的比例子多时，得按整类生成输入才找得到缺口。

## 五种 harness 对上 Orbi 交付过的失败

常开防护修好了这些失败，却让其他修复的成本中位数翻了差不多一倍。于是我们在三个 Orbi 原本做错的 issue 上又试了三种更省的设计，实现和评审都用 `deepseek-flash`：

- **只加强评审（v21）**：实现用原版 prompt（外加贡献 skill 和 `PATH` 里的仓库工具），回归排查只放在评审里。3 个过 1 个。评审 prompt 里写全了回归排查，它在 `chainloop` 上判了 `pass, no findings`，在 `pyinfra` 上自己修了一个问题就放行，两个回归（密码泄漏和 👍🏽 错位）原样交付。
- **先充实工单（v20）**：runner 开工之前，先让便宜模型在临时副本里复现 bug，往 issue 里追加一段分析：bug 在哪、修法必须覆盖哪几类输入（带具体例子）、哪些行为不能变、设计要点。之后跑原版 harness。3 个过 2 个，`pyinfra` 仍然交付了 👍🏽 和「が」的回归。
- **按需触发（v19）**：回归防护内容不变，只在改动涉及文本或字节的解析、转义、截断、切分、测量、匹配、替换、编码或脱敏时启用；其他改动只要针对性测试加现有测试。3 个全过。

<figure class="post-media">
<img src="/img/diagrams/harness-variants-zh.svg" alt="五种 harness 在三个 Orbi 做错过的 issue 上：原版 15 次过 6 次，只加强评审 3 次过 1 次，先充实工单 3 次过 2 次，按需触发 3 次全过，常开防护 9 次全过；柱下标注每次运行的 token 中位数。" width="720" height="400">
<figcaption>浅色柱不到 5 次。柱下是每次运行 token 中位数（百万）。</figcaption>
</figure>

门控省下的比预想的少。九个普通 bug，按需触发 9 次全过，每次中位数 5.2 百万 token；原版 2.8 百万，常开防护 5.8 百万。原因是这些普通 bug 大多也碰文本处理（正则、参数解析、换行），九个里有八个触发了门控。

## 分题组看成本

通过率只是一半。每次运行的 token 大头是缓存读取（约 97%），随 agent 的对话轮数增长。harness 要求的检查越多，跑一个 bug 通常就越贵。

| 题组 | 原版 | 常开防护（v15） | 按需触发（v19） |
|---|---|---|---|
| 3 个 Orbi 做错过的（调参集） | 6/15 · 5.7M | 9/9 · 13.4M | 3/3 · 10.8M |
| 8 个窄例子 bug（没见过） | 8/12 · 3.6M | 9/10 · 8.3M | 7/8 · 5.2M |
| 9 个普通 bug（没见过） | 9/9 · 2.8M | 9/9 · 5.8M | 9/9 · 5.2M |
| 3 个容易改出回归的 bug（没见过） | 4/4 · 7.1M | 3/3 · 13.9M（没有 numpy） | 没跑 |

格子里是「通过 / 运行 · 每次运行 token 中位数（百万）」。耗时中位数走势相同：普通 bug 上 11、16、15 分钟，窄例子 bug 上 12.5、19、17.5 分钟。

<figure class="post-media">
<img src="/img/diagrams/harness-tradeoff-zh.svg" alt="原版、常开防护、按需触发三种 harness 在调参 issue、窄例子 bug、普通 bug 上的通过率和每次运行 token 中位数。" width="720" height="450">
<figcaption>柱高是通过率，标注是每次运行 token 中位数（百万）。</figcaption>
</figure>

这张表按行读。防护有用的题（前两行），两种带防护的 harness 把通过率从 15 次过 6 次、12 次过 8 次，提到了 8 次过 7 次到 9 次全过之间。防护没用的题（后两行），原版本来就全过，加什么防护都是白花钱。门控关着时，按需触发比常开便宜；门控打开时，两者差不多。

## 独立审查怎么说，以及后来发生了什么

我们本打算把按需触发设成 Orbi 的默认，为此开了一张票 [orbi#1501](https://github.com/orbi-build/orbi/issues/1501)，Orbi 也开了 PR。随后维护者问我们凭什么确定这是对的，我们就停了下来：给票打上 `ai-blocked`，拿上面的数据请一个独立审查方专挑这个决定的毛病。审查方的结论是别设成默认，理由四条。

- **要上线的版本不是测过的版本。** 门控原本要求实现方把判断写进 PR 正文。可 PR 正文是 Orbi 的 runner 写的，不是 agent 写的，那一行从没出现过，评审也就无从核对。我们把判断挪进了评审本来就会读的 `.orbi/plan.md`。这个修正（v19b）本身又是一次改动，当时还没跑过 benchmark。
- **成本落在每个人头上。** 大多数 Orbi 用户的 bug 更像普通题组：原版就能过，防护只添成本。
- **评审规则太严会适得其反。** 把「该做却写了不需要」算成 Major，可能多出评审轮次，每多一轮都要多花 token 和时间。
- **benchmark 不该放进产品。** 我们第一版 PR 把约 3000 行 benchmark 脚本塞进了 Orbi 自己的仓库。它们现在在 [orbi-build/orbi-bench](https://github.com/orbi-build/orbi-bench)。

然后我们发现，打上 `ai-blocked` 71 秒后，Orbi 还是把 PR 合了。runner 合并前会重新检查基线分支、能否合并、评审过的提交和 CI，唯独不重读 issue 的标签，评审途中加的暂停就这样被忽略了。我们在任何版本发布之前 revert 了这次合并（[orbi#1503](https://github.com/orbi-build/orbi/pull/1503)），并为 runner 的这个 bug 开了票（[orbi#1504](https://github.com/orbi-build/orbi/issues/1504)）。教训和整个研究是同一个，只是换到了流程这一层：只在开头跑一次的检查，到最后就不作数了。

## 门控版差在哪

审查之后我们跑了 v19b，也就是把门控判断写到评审读得到的地方的那一版。三个原始失败和 `dateparser` 都过了，`picomatch` 没过。

读这几次运行，能看出问题出在防护本身。门控的判断是合理的：`pyinfra` 的表格宽度、`chainloop` 的脱敏、`dateparser` 的格式、`picomatch` 的 glob 解析都判「需要」，`fedify` 的 mock setter 只是改调用关系，判「不需要」。`picomatch` 上，两次按需触发的运行（v19 和 v19b）都跑了防护，也都漏了同样两种情况：没闭合的 `[!]` 和 `literalBrackets` 选项。v19 那次拿 Python 的 `fnmatch` 和 bash 当独立参照，它们实现的是 POSIX glob，压根没有 picomatch 的这些选项。常开防护过了的那两次，是自己把这些选项列了出来：报告里分别提到 4 次和 12 次，按需触发那两次一次都没提。让 agent 去找独立参照的那条规则，这回把它引向了一个表达不了关键输入的参照。

## 我们接下来做什么

这次改动已经 revert，成果保留在分支和 benchmark 仓库里。接下来按顺序做：

1. 把常开防护（v15）做成按仓库的开关，默认关，不加门控。文本处理是风险所在的仓库（解析器、格式化器、脱敏、各种转义）自己打开。
2. 在打开开关的仓库上，统计真实交付里它多花了多少 token、时间和评审轮次。
3. 查清防护为什么漏掉 `picomatch` 那类输入：会改变解析方式的选项，和没闭合的语法。现在的 prompt 没点名这两类，agent 选的参照也得能表达它们。
4. 在其他实现模型和评审模型上跑留出集。这里所有没见过的 bug 都由 `deepseek-flash` 写修复，所以还没法推荐模型组合。

模型会变，合适的 harness 也会跟着变。以后的每次研究都会放到 [benchmark 页](/zh/benchmark/)，数据进 benchmark 仓库，下一次从这次的数字接着往下做。

## 局限

八个窄例子 bug 是小样本，多数格子只有 1 到 3 次，一次运行就能让一格变动三分之一甚至更多。留出结果只用了一个实现模型。窄例子 bug 本来就是按「只照例子修会挂」挑出来的，恰好是防护针对的那类，它们的失败率不能当成 Orbi 所有 bug 的失败率。隐藏评分器也只抓得到维护者写了测试的缺陷。

## 相关

继续阅读：[Claude Code 对比](/zh/compare/claude-code/) 与 [Cloud](/zh/cloud/)。
