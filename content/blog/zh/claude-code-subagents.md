---
title: Claude Code subagents 怎么配、什么时候用
date: 2026-10-17
summary: Claude Code subagents 在各自独立的上下文里处理委派任务。配一个专注的代码评审 subagent，给它清楚的输入，再判断什么时候该委派出去。
lang: zh
author: Lawrence Liu
image: /img/blog-cc-subagents-card.png
mirror: claude-code-subagents
---

Claude Code subagents 是专门化的助手，在各自独立的上下文窗口里处理委派的任务，再把结果交回主会话。第一次配，我建议先配一个评审 subagent：任务范围窄，产出一份你能对着代码核对的报告。

下面的配置和用法我对照 Anthropic 官方的 [subagent 文档](https://code.claude.com/docs/en/sub-agents)和[最佳实践](https://code.claude.com/docs/en/best-practices#create-custom-subagents)核过（2026-10-17）。

## 给项目配一个 Claude Code subagent

把下面这段存成仓库里的 `.claude/agents/change-reviewer.md`。这个目录把 agent 的作用域限定在当前项目；放 `~/.claude/agents/` 则对你所有项目可用。加好之后在项目里**新开一个 Claude Code 会话**，它会在会话开始时读到这个新 agent。

```markdown
---
name: change-reviewer
description: Review supplied changed files for behavioral bugs and missing tests.
tools: Read, Grep, Glob
model: sonnet
---

读给你的需求、改动文件清单和 diff。
按需读受影响的代码和它的调用方。
用 diff 把这次改动和原有行为区分开。

每条发现返回：
- 文件和行号。
- 触发问题的输入或动作。
- 预期行为 vs 实际行为。
- 一个能暴露它的测试。

证据不足时如实说明不确定。
没有可执行的发现时，说清你检查了什么。
不要改文件。要跑的测试，交给主会话跑。
```

YAML 里 `name` 和 `description` 是必填。Markdown 正文是这个 agent 的 system prompt。这里 `tools` 把它的权限限制在文件检查，`model` 请求用 Sonnet（调用时仍可以覆盖模型）。Claude 靠 description 判断要不要把任务委派给它。[字段说明见官方 frontmatter 参考](https://code.claude.com/docs/en/sub-agents#frontmatter-reference)。

description 写短，把评审流程放正文。写成「帮忙写代码」这种，主 agent 就没什么理由在某个具体任务上挑中这个评审 subagent。

确认 agent 加载成功：在项目里开一个会话，输入 `@` 从列表里选 `change-reviewer`，再发请求。如果列表里没有它，检查文件是不是在 `.claude/agents/` 下，然后重开会话。任务跑起来时，transcript 里会有一条带 agent 名字的委派记录——这就是你确认 subagent 真的跑了、而不是主会话自己顺手答了的方式。

## 给评审 subagent 一份完整的任务

让主会话先收集好 diff，然后给它一个这样的请求，把方括号里的输入填上：

```text
用 change-reviewer subagent 评审这次改动。

需求：[粘贴预期的、用户能看到的行为]
改动文件：[粘贴文件路径]
Diff：[粘贴这些文件的 patch]
约束：[粘贴兼容性要求或仓库规则]

检查改动后的行为是否满足需求。
按你 instructions 里的格式返回可执行的发现。
列出主会话该跑的测试。不要改文件。
```

对这里用的普通 subagent，[启动时加载的上下文](https://code.claude.com/docs/en/sub-agents#what-loads-at-startup)不含主会话的历史；Claude 自己准备任务消息。所以需求、路径、diff 要显式给全。Claude Code 也支持继承会话的 fork，这个例子用的是普通 subagent。

举个例子：某次改动要拒绝空表单提交。那就把这条需求、处理函数的路径、相关的校验测试都给它。只说「评审一下这次改动」，评审 subagent 就得自己猜什么才算正确行为。

这个 agent 没有 Bash 工具，所以让主会话去跑它建议的测试。看它的报告时，核对每条发现有没有指出一个触发输入和代码里的位置。「改进一下校验」太泛、没法执行；「某处接受了空值、是哪个处理函数接受的、缺了哪个断言」才是你能去验证的东西。

## 什么时候该用独立上下文

Anthropic 的[调研建议](https://code.claude.com/docs/en/best-practices#use-subagents-for-investigation)推荐用 subagent 读大量文件、返回一份摘要，中间的探索过程留在独立上下文里。它的最佳实践也建议实现之后做一次验证。

一次有用的仓库查找，是问一个具体问题，比如找出已有的那个校验某表单字段的函数。让它返回这个函数的位置、它的调用方、以及新调用方要遵守的约束。主会话拿这个答案就够用，不用看每一条搜索结果。

一次聚焦的评审是另一个有用的边界。给评审 subagent 一个需求和一组固定的改动文件。在报告回来之前，先别动这些文件；报告回来后，让主会话对着那一版逐条核对发现，再去改。

依赖当前讨论进度的小改动，留在主会话里做。委派之前，先试着把任务和预期的返回写出来。如果这两样你都说不清，先把任务收窄。把一个说不清的请求拆给好几个 agent，只会留下好几份都说不清的任务。

这个评审 subagent 和主会话共用工作目录；它的独立上下文并不会冻结文件。要独立的 Git 工作目录，Claude Code 支持 [`isolation: worktree`](https://code.claude.com/docs/en/sub-agents#frontmatter-reference)，上面的例子没有用它。

## Orbi 里的独立评审

我是 Lawrence Liu，Orbi 的创始人。上面那个评审 subagent 把报告交回主会话，由你来处理。当你想让一张 Issue 自己走完实现、评审、合并，你需要的就不是单次委派的任务，而是一个 runner——这和本文配的只读评审 subagent 是两种需求。Orbi 用编排 Pi 进程来做这件事：上面那个 agent 文件属于 Claude Code，Orbi 不跑它。一个值得点明的区别：Orbi 的评审会话可以修代码，而这里的 Claude Code 评审 subagent 被限制在只读工具。

Orbi Cloud 里每张 Issue 的交付跑在一个独立的 git worktree 和一个实现会话里，评审在另一个单独的 Pi 会话里跑，runner 看评审结论、CI 结果和 PR 状态，再决定合不合并。[Pi 架构指南](/zh/guides/pi-coding-agent/?ref=blog-cc-subagents)讲清楚了这些闸门，[Issue 到发版指南](/zh/guides/issue-to-release/?ref=blog-cc-subagents)把这条线从实现、评审一直走到合并和发版。

## 相关

- [把 Orbi 和别的编码工作流对比](/zh/compare/claude-code/?ref=blog-cc-subagents)
- [用 Cloud 跑 Orbi 的交付流程](/zh/cloud/)
