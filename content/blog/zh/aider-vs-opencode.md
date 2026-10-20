---
title: Aider vs OpenCode：上下文、提交和测试怎么选
date: 2026-10-20
summary: 比较 Aider 与 OpenCode 2 的文件上下文、Git 提交、测试和权限。用同一起始提交检查改动，避免自动提交后漏看代码，也别把本地 commit 当成测试通过。
lang: zh
author: Lawrence Liu
image: /img/blog-aider-vs-opencode-card.png
mirror: aider-vs-opencode
---

比较 Aider vs OpenCode 时，如果你想先选好少量文件，再按本地提交逐次查看修改，可以先试 Aider。如果找文件也是任务的一部分，希望 agent 搜索代码、修改文件、执行命令，再按配置控制工具权限，可以先试 OpenCode 2。两者都支持多种模型提供方，也都能放进脚本运行。

OpenCode 现在分 V1 和 V2 文档。本文比较的是 [OpenCode 2](https://opencode.ai/v2/docs/)，资料核对日期为 2026 年 10 月 20 日。照旧教程配置前，先看 [V2 迁移说明](https://opencode.ai/v2/docs/migrate-v1/)：两个版本使用同一个 `opencode` 命令名，安装 V2 可能替换原来的命令，配置格式也有变化。

我是 Lawrence Liu，Orbi 的创始人。Orbi 使用 Pi 编码和评审，没有把 Aider 或 OpenCode 当作引擎。下面按两者公开文档里的工作方式比较；代码质量和费用，可以用后面的试用方法在自己的任务上核对。

## Aider vs OpenCode：按工作方式选

| 你要控制的部分 | Aider | OpenCode 2 |
|---|---|---|
| 模型看到哪些文件 | 添加要修改的文件，用仓库地图补充其他代码的背景 | 让 agent 搜索并读取相关文件 |
| 本地修改记录 | 默认会自动创建 Git 提交 | 查看任务实际留下的工作区改动和提交 |
| 命令与检查 | 配置项目的 lint 和测试 | 提供测试命令，并配置工具权限 |
| 从脚本调用 | 发送非交互消息 | 使用 `opencode run` |

可以先从最影响你日常操作的那一行试起。已经知道该改哪些文件，Aider 的文件选择方式比较直接；还需要定位实现和调用方，可以试 OpenCode 的搜索与命令工具。Aider 也能帮忙找文件，这里比较的是你想怎样指挥它干活。

## 把改动需要的背景给够

Aider 可以在启动时指定要编辑的文件，也可以用 `/add` 添加。[使用文档](https://aider.chat/docs/usage.html)建议只加入相关文件；不提前选文件也能开始，让它协助定位。[仓库地图](https://aider.chat/docs/repomap.html)会补充其他文件里的部分符号和关系，帮助模型理解当前代码。地图经过筛选，并不包含每个文件的全文。

OpenCode 2 提供[搜索、读取、编辑和 shell 工具](https://opencode.ai/v2/docs/tools/)。可以让它先查一个函数的调用方，再动手修改。验收时看它有没有找到相关实现和测试；读过更多文件，本身不能证明结果更好。

无论选哪款，都要给预期行为和检查办法。比如“拒绝过期 token，保留有效 token 的现有行为，并增加回归测试”，就比“优化认证”更方便核对。再写上仓库实际使用的测试命令，以及不能修改的文件或依赖。

## 从开始时的提交检查完整改动

Aider 的 [Git 集成](https://aider.chat/docs/git.html)默认会提交它的修改。遇到原本就有未提交改动的文件，它还可能先提交已有改动；自动提交也可以关闭。OpenCode 可以通过工具运行 Git 命令，最终是留下 commit 还是未提交修改，要看任务要求和实际执行的操作。

所以，光看 `git diff` 容易漏掉已经提交的代码：agent 提交之后，这条命令可能什么也不输出。

给两款工具分别准备一个干净的仓库副本，从同一个提交开始。在各自的仓库目录里，用 Bash 运行：

```bash
git status --short
trial_base=$(git rev-parse HEAD)
```

如果 status 列出了已有改动，先准备干净的试用副本。保留这个终端。等 agent 完成后，回到同一个 Bash 会话运行：

```bash
git rev-parse --verify "${trial_base:?Record trial_base before the run}^{commit}" >/dev/null &&
git status --short &&
git diff --stat "$trial_base" -- &&
git diff "$trial_base" -- &&
git log --oneline "$trial_base"..HEAD
```

相对于 `trial_base` 的 diff 会显示已跟踪文件的最终改动，包括已提交、已暂存和尚未暂存的部分。status 还会用 `??` 列出未跟踪的新文件；它们的内容不在这个 diff 里，需要另外打开检查。log 则列出开始之后新增的提交。

这组 Git 检查方法已在隔离仓库验证过，覆盖已提交、未提交的修改和未跟踪文件。它验证的是检查方法，没有测出哪款 agent 写代码更好。

## 接受改动前核对检查结果

Aider [默认 lint 编辑过的文件，也支持配置测试](https://aider.chat/docs/usage/lint-test.html)。自动测试需要指定测试命令并开启对应设置。本地有了 commit，不能据此判断测试通过。它的 Git 文档还说明，默认提交会跳过 pre-commit hooks；`--git-commit-verify` 可以启用这些提交前检查。

OpenCode 2 要看请求的测试命令实际输出和退出状态。它的原生[权限配置](https://opencode.ai/v2/docs/permissions/)使用有序的 `permissions` 数组和 `shell` 动作。受支持的 V1 配置仍可使用，转为原生 V2 格式是可选操作。V2 的基础规则广泛允许操作，对 `.env` 读取等情况另有询问规则。shell 和项目外目录要按自己的需要设置审批；shell 命令仍使用宿主用户的权限。

agent 改完代码后，再独立跑验收检查。试用前就记下原有测试失败，才能分清哪些是新回归。指定的检查通过，只能说明这些检查的结果，不能代替全部需求的验收。

## 用同一个需求和模型试一遍

选一张结果容易核对的真实 Issue。两个仓库副本采用同一起始提交、验收标准和测试命令。两款工具都支持时，选相同的模型与提供方，并记下准确模型和推理设置。可选连接见 [Aider 模型文档](https://aider.chat/docs/llms.html)和 [OpenCode 2 模型选择](https://opencode.ai/v2/docs/models/)。相同模型仍可能收到不同的提示、上下文和工具结果，不能把结果差异全归到模型上。

每次保留最终 diff、测试输出、你补充纠正过的话，以及实际提供方的用量或账单。看哪种方式能在可接受的人工干预下交出你能验收的改动。客户端免费，也不等于推理费用相同。

需要定时运行时，Aider 支持[非交互消息调用](https://aider.chat/docs/scripting.html)，OpenCode 2 的 [`opencode run`](https://opencode.ai/v2/docs/cli/)也用于脚本和 CI。先确认配置的权限和必填输入在无人值守时会怎样处理，再安排真实任务。

如果希望交出去的是整张 GitHub Issue，包括独立评审和有条件的合并，还要单独判断交付流程。Orbi 使用 Pi 完成这部分工作；发版另提需求，按仓库规则执行。[自托管指南](/zh/guides/self-hosted-coding-agent/?ref=blog-aider-opencode)说明了这些步骤。

## 相关

更多工具可以看 [OpenCode 替代方案](/zh/blog/opencode-alternatives/?ref=blog-aider-opencode)。[Orbi 与 Claude Code 对比](/zh/compare/claude-code/?ref=blog-aider-opencode)说明了仓库交付与编码 agent 的工作方式。[Orbi Cloud](/zh/cloud/?ref=blog-aider-opencode)托管运行 Orbi 的 Issue 交付，不用在本地安装 Orbi。
