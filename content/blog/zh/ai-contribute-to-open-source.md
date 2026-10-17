---
title: AI 能不能给开源项目提 PR？
date: 2026-10-17
summary: 我让 Orbi 修了 brig、LLMVault、pyinfra 三个项目的 issue，维护者把三个 PR 都合并了。pyinfra 那次 agent 初版有个 emoji 对齐的回归，我提交上游前复核时发现并重做了修复。这个过程也写进了 PR。
lang: zh
author: Lawrence Liu
image: /img/blog-oss-contributions-card.png
mirror: ai-contribute-to-open-source
---

我让一个 AI 编程 agent 去修三个开源项目里的 issue，这些项目都不归我们管，我把它写的修复提了上去，三个维护者都合并了。这篇把每条都链到它是怎么做出来的记录，你可以自己核，不用听我一面之词。这三条就是我们到目前为止用这种方式提给上游的全部，不是从一长串里挑出来的。其中一条里有个 bug 是 agent 的评审漏掉的，我发现后重写了修复，后面会讲到。

我是 Lawrence Liu，Orbi 的创始人（[Orbi](https://orbi.build/?ref=blog-ai-oss)）。在你自己的仓库里，Orbi 把 GitHub Issue 做成可合并的 PR：一个 agent（我们叫它 Pi）读 Issue、在沙箱里写改动，另一个 Pi 会话评审这次改动、而且拿不到写代码那次的上下文，CI 跑完，runner 在这几道都通过时合并。别人的仓库不一样，因为我不能让 agent 直接往里写。所以 Orbi 读的是上游已经报出来的 issue，在一个我们自己控制的 fork 里把改动做好，我复核之后才用我本人的账号向上游提 PR，正文里写明是 AI agent 写的。

## 合了什么

| 项目 | 星数 | issue | 修了什么 | 合并 |
|---|---|---|---|---|
| [brig](https://github.com/brig-sh/brig) | 232 | [#357](https://github.com/brig-sh/brig/issues/357) | 顶层命令不认 `--help`、`-h` | [PR #402](https://github.com/brig-sh/brig/pull/402) |
| [LLMVault](https://github.com/CyberSunil/LLMVault) | 340 | [#28](https://github.com/CyberSunil/LLMVault/issues/28) | Flask 调试模式默认开着 | [PR #39](https://github.com/CyberSunil/LLMVault/pull/39) |
| [pyinfra](https://github.com/pyinfra-dev/pyinfra) | 6,039 | [#1438](https://github.com/pyinfra-dev/pyinfra/issues/1438) | 结果表被 CJK 字符挤错位 | [PR #1977](https://github.com/pyinfra-dev/pyinfra/pull/1977) |

三条都对应已有的 issue。下面每个项目那一节还会链到 fork 里的交付记录，agent 的初版就在那里。

## brig：维护者用自己的 AI 评审过这个 help 修复

brig 是在 microVM 沙箱里跑编程 agent 的工具，维护者自己也用一个 AI agent 做 PR 评审。它的 [issue #357](https://github.com/brig-sh/brig/issues/357) 说 `brig run --help` 和其它顶层命令会拒绝 help 标志、报错退出，而 `brig help <命令>` 打印的是全局文案、不是那个命令自己的。Orbi 先在 fork 里修（[orbi-build/brig#3](https://github.com/orbi-build/brig/pull/3)）：每个顶层命令现在都用自己的用法回应 `--help`、`-h` 和 `brig help <命令>`，各命令的用法文案都从同一张表读取，三种写法输出一致。brig 的命令形如 `brig run <agent> ...`，agent 名之前的 flag 归 brig、之后的归 agent。所以 `brig run --help` 现在打印 brig 自己的用法，而 `brig run claude --help` 里的 `--help` 仍会透传给 claude。

我用这个 fork 分支开了 [PR #402](https://github.com/brig-sh/brig/pull/402)，正文直说了：Orbi 写的，我复核的。维护者 Alexandros Sapranidis 用自己的 AI 评审（`@claude-fleet review`）跑了一轮，评审对着测试核了 help 拦截逻辑，只挑出几个无关紧要的小点，通过了。

接下来是任何贡献都有的常规来回。维护者让我变基到 main，变基时冒出来一个 `brig plan` 命令（我们 fork 之后才进 main 的），我就也给它补上 `--help`。维护者再让我把这个新提交的信息改得符合项目的提交规范，我照做了。然后合并，附一句「thank @xqliu for the contribution and your patience here」（谢谢贡献和耐心）。

## LLMVault：维护者没让改就合并的安全修复

[LLMVault](https://github.com/CyberSunil/LLMVault) 是一个故意留着漏洞的 LLM 安全训练平台。平台要教的漏洞在应用代码里，这个问题却出在运行方式上。它自己的 [issue #28](https://github.com/CyberSunil/LLMVault/issues/28) 指出 `app.run(debug=True)` 是写死的，这会打开 Werkzeug 的交互式调试器。把这个调试器暴露出去，会给运行这个平台的人带来代码执行风险，而这不是平台本该教的训练内容。

Orbi 的修复（[orbi-build/LLMVault#3](https://github.com/orbi-build/LLMVault/pull/3)）改成从 `LLMVAULT_DEBUG` 变量读调试模式，默认关，只有值是 `1` 或 `true` 才开。Docker 镜像跑的是 gunicorn，本来就没开调试器，所以只有 `python app.py` 这条路径变了。agent 用变量不设、设成 `0`、`1`、`true` 四种情况各跑了一遍验证。我开了 [PR #39](https://github.com/CyberSunil/LLMVault/pull/39)、正文里也写明了是 AI agent 写的，维护者没让我改任何东西就合了。

## pyinfra：自动评审漏掉的 emoji 宽度问题

pyinfra 把 Python 变成在服务器上跑的 shell 命令。它的 [issue #1438](https://github.com/pyinfra-dev/pyinfra/issues/1438) 说 CJK 字符会把结果表的列挤错位：这类字符在终端里占两格，但代码用 `len()` 量宽度，于是一个中文操作名会把后面每一列都往右推。

Orbi 的初版（在我们 fork 里，[orbi-build/pyinfra#3](https://github.com/orbi-build/pyinfra/pull/3)）用一个手写的循环、按每个字符的 East Asian Width 量宽度。它修好了 issue 报的 CJK 问题，却顺手引入了一个 issue 没提过的新问题：emoji。👍🏽 里，基础 emoji 和那个肤色修饰符的 East Asian Width 都是「宽」，于是循环把这一对算成了四格，而终端只画两格。`len()` 对一个宽 CJK 字符是少算的，可对这个 emoji，它数出来的码点数又恰好等于终端画的两格，所以这些行在循环动手之前本来是对齐的，是新代码把它们弄坏的。Orbi 的 Pi 评审会话，也就是你自己仓库里评审改动的那一道，审过这一版，放行了。

我在把这次 fork 改动提到上游之前复核它，发现了这个回归。我用 Claude Code 重做，改成用 `rich.cells.cell_len` 量宽度，然后自己复核并测试了最终的 diff。（Orbi 自己的 agent 是 Pi；Claude Code 是我这次返工时用的工具。）`cell_len` 只有在较新的 rich 里才给肤色修饰符零宽度，所以我把 pyinfra 依赖的 rich 最低版本设为 13.7.1，第一个修好这点的版本。我跑了 pyinfra 自己的测试套件，又用 `pyinfra @local exec` 把 issue 给的例子复跑了一遍，确认表格对齐了。然后我开了 [PR #1977](https://github.com/pyinfra-dev/pyinfra/pull/1977)，正文把这整个过程都写了：AI agent 写了初版，一轮复核发现它把 emoji 行弄得更糟，我重做并测试了最终的 diff。维护者合了。

我把这次失误照写进了上游 PR，这样维护者能拿到和我们自己评审一样的信息去判断这个 diff。我不知道这份坦白有没有起作用，但他至少看得清自己合的是什么、路上出过什么岔子。

## AI 要怎么才能给开源做贡献

对 AI 写的 pull request，常见的反对是：那是噪音，看着像那么回事、其实在浪费维护者时间的 diff。这三条在到上游之前都过了一个人。每个维护者为什么接受，我说不准；但 pyinfra 这条，要是没有那道人工复核，它就是噪音：Pi 评审会话放过了那个回归，是我自己复核时才抓住的。

这道人工复核是这几次贡献特有的，因为仓库不是我的。在你自己的仓库里，Orbi 跑的是同一道 Pi 评审会话，默认是自动合并、不等你点头：评审、CI 和 PR 检查都过了，runner 就合。这一切都发生在你自己的 PR 上，评审发现一出来你就能看到；如果你想让某个改动必须由人签字才合，Orbi 有一道可以打开的 [AI 人工复核闸门](/zh/guides/auto-merge-ai-prs/?ref=blog-ai-oss)。[Issue 到发版指南](/zh/guides/issue-to-release/?ref=blog-ai-oss)把这条线从头走到尾，[Pi 架构指南](/zh/guides/pi-coding-agent/?ref=blog-ai-oss)讲清楚这些闸门。

## 相关

- [Orbi 和 Devin 怎么比](/zh/compare/devin/?ref=blog-ai-oss)
- [用 Cloud 在你自己的仓库里跑这套流程](/zh/cloud/)
