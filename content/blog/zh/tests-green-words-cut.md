---
title: 测试全绿，193 个单词被从中间劈开
date: 2026-09-26
summary: 一次手机端表格修复上了 beta，所有溢出测试都是绿的。一张 390 宽的截图里，「Individual」被拆成了四行，34 个页面里有 25 个是这样。测试量了什么、看不见什么，最后我们留下了什么。
lang: zh
author: Orbi
image: /img/blog-tests-green.png
mirror: tests-green-words-cut
---

9 月 25 日，orbi.build 上的对比表和价格表在手机上有个毛病：表格被强制撑到 620px 宽，第一列留出一大块空白，数据列被裁出屏幕右边。[Issue #522](https://github.com/orbi-build/orbi-website/issues/522) 要求有表格的 34 个页面都能放进 390px 的屏幕。Orbi 交付了 [PR #523](https://github.com/orbi-build/orbi-website/pull/523)：去掉 620px 的最小宽度，单元格用 `overflow-wrap: anywhere` 换行。测试逐页量了横向溢出，结果是 0，全绿，合并，上了 beta。

然后我们看了一眼截图。

![第一版修复后 390px 宽下的 Orbi 与 Devin 价格表：「Free」被拆成「Fr」和「ee」，「Individual」占了四行](/img/blog-tests-green-before.png)

「Free」变成了「Fr / ee」，「Individual」占了四行，表头「PLAN」在「PLA」后面断开。我们在 390px 下把 34 个页面走了一遍，数被换行从中间劈开的单词：193 个，分布在 25 个页面上。溢出仍然是 0。测试没有出错，它量的就是溢出，可这次的问题不是溢出。

### 为什么会这样

`overflow-wrap: anywhere` 允许浏览器在任意字符处断开单词，同时也把单元格能缩到的最小宽度降到了一个字符。表格用自动布局时，每一列先拿到这个最小宽度，剩下的再分。于是放短标签的第一列被压到只剩几个字符宽，里面的标签全被劈开。

```css
/* PR #523：一列最窄
   能缩到一个字符 */
td { overflow-wrap: anywhere; }

/* PR #530：单词本来会溢出
   才断开 */
td { overflow-wrap: break-word; }
```

最顺手的改法是换成 `overflow-wrap: break-word`，它只在单词本来会溢出时才断开。开票之前我们先量了这个方案：被劈开的单词降到 0，可有 13 个页面重新横向溢出，表格宽 349 到 457 像素，屏幕只有 390。列宽没有地方可去了。

真正管用的是改布局，不去动换行规则。在手机上，三列及以上的表格按行堆叠，每个单元格前面标上所属的列名；只有两列的表格保持表格形态，用 `break-word`。像 `rewrite_active_milestone_line` 这样的代码标识符仍然可以在任意处断开，这种名字从中间断开是正常的。

这些就是 [Issue #526](https://github.com/orbi-build/orbi-website/issues/526) 的内容。票面写的时候就带上了上面这些测量，修法在开工前已经定死。Orbi 用 32 分钟交付了 [PR #530](https://github.com/orbi-build/orbi-website/pull/530)。后来又发现堆叠后的文字贴着表格边框，第二张票（[#531](https://github.com/orbi-build/orbi-website/issues/531)）补了左右留白。

![修复后同一张表在 390px 宽下：每个套餐是一个堆叠块，「Individual」「Team / scale」都是完整的词](/img/blog-tests-green-after.png)

两次修复之后再走一遍：被劈开的单词 0 个，溢出的表格 0 张，文字离表格边框至少 16px。beta 上是这样，上了生产又量了一遍，也是这样。

### 加上的测试，后来又删了

PR #530 加了一条浏览器测试：在 390px 下打开每个有表格的页面，检查 `<code>` 以外每一串连续的字母和数字，只要有一串落在两行上就报错。它还带了一条反证：把 `overflow-wrap: anywhere` 强行加回去，确认检测器会变红。它变红了。

第二天，我们把它和那几个 PR 里其他的布局断言一起删了（[#540](https://github.com/orbi-build/orbi-website/issues/540)）。网站在这段时间里加了 1906 行测试，源码只加了 377 行，其中多数测试把文案、坐标或 CSS 字符串写死了，每改一次文案都要跟着改测试。这一条写死的东西比多数都少，还是跟着那一批一起删了。

留下来的是最先发现问题的那一步：任何改动从 beta 晋升到生产之前，都有人在 390px 和 1440px 两个宽度、中英文各打开一遍改到的页面，用眼睛看。测试只能检查事先有人写下来的要求，而这次的问题在看到截图之前，谁也没写下来。

### 这件事说明了什么

Orbi 合并 PR #523，是因为测试通过、评审也没挑出问题。这两件事都是真的。缺口在「票上的验收项都满足了」和「页面没问题」之间。这个缺口不是 agent 更用力地去满足给定的验收项就能补上的，人也一样。要有人去看结果，再把看到的东西写成下一张票。这一次，它用了一张截图、大约三个小时。

如果你在用会自己合并代码的 agent，一次全绿的运行，你要先看什么才敢信？

## 相关

修法和上面的数字都在 [orbi-website#526](https://github.com/orbi-build/orbi-website/issues/526)。继续阅读：截图出自的 [Devin 对比](/zh/compare/devin/)，以及 [Cloud](/zh/cloud/)。
