---
title: Codex YOLO mode 会放开什么权限
date: 2026-10-16
summary: Codex YOLO mode 会跳过审批和本地沙箱。本文用 Linux 实测说明它能执行哪些操作、workspace-write 的区别，以及旧 full-auto 命令该怎样迁移。
lang: zh
author: Lawrence Liu
image: /img/blog-codex-yolo-card.png
mirror: codex-yolo-mode
table_layout: comparison
---

Codex YOLO mode 指的是 `--yolo`，它是 `--dangerously-bypass-approvals-and-sandbox` 的别名。开启后，Codex 不再询问审批，也不再使用自身的本地沙箱。运行它的环境必须另有隔离，例如一次性虚拟机或限制过权限的 CI runner。只想让 agent 自动修改仓库、保留沙箱，可以先用 `codex -a never exec --sandbox workspace-write`。

我是 Lawrence Liu，[Orbi](https://github.com/orbi-build/orbi) 的创始人。2026 年 10 月 16 日，我在 Linux 上用 Codex CLI 0.159.3 实测了这几种配置。Orbi 的 Codex 接入使用 Pi provider，不运行 Codex CLI；本文命令供直接使用 CLI 的开发者参考。

## 怎样启动 Codex YOLO mode

在已经做好外层隔离的一次性运行环境中执行：

```bash
codex exec --yolo "Run the tests and fix the failures."
```

完整参数的含义相同：

```bash
codex exec --dangerously-bypass-approvals-and-sandbox \
  "Run the tests and fix the failures."
```

[OpenAI 的 CLI 文档](https://learn.chatgpt.com/docs/cli/reference) 定义了这两个写法，并要求运行环境有外部防护。新建一个 Git worktree 不提供操作系统层面的隔离：agent 仍以你的系统用户身份运行。

虚拟机或容器内部可读的文件和凭据，进程依然能够访问。本次实验的外层环境隐藏了真实 home 目录和其他进程，只暴露假的可写测试目录，没有 GPU 设备。模型请求和本地测试服务仍需要网络。

## 实测 Codex YOLO mode 能执行什么

<figure class="post-media">
<img src="/img/blog-codex-yolo-boundaries-zh.webp" alt="外层测试环境包含 Codex 和假的测试目录。YOLO 去掉 Codex 内层沙箱，外层环境仍然保留。" width="1800" height="1530" loading="lazy">
<figcaption>Codex YOLO mode 去掉内层边界。外层环境保留了网络访问，本次实验未验证网络隔离。</figcaption>
</figure>

我让 agent 在三种配置下各运行一次相同的 Python 探针：向仓库内写文件、向仓库外同级目录写一个无害文件，再请求本机 loopback HTTP 服务。同级目录放在 home 下的 cache 中，避开工作区和系统临时目录。用 `/tmp` 做越界目标容易测错，因为工作区权限可能包含临时目录。

每次配置都用新的外层沙箱，挂载和网络规则相同。`--ignore-user-config` 与独立 CLI home 排除日常配置的影响。登录认证临时复制进去，运行后删除；组织管理的要求仍可能限制实际权限。

下面的结果来自独立检查文件和 HTTP 请求记录。每种 CLI 配置只有一次固定探针运行，模型为 `gpt-6.1-sol`，推理档位 low：

| 执行方式 | 仓库内文件 | 仓库外同级文件 | Loopback HTTP 请求 |
|---|---|---|---|
| 直接运行 Python，对照组 | 写入成功 | 写入成功 | 收到请求 |
| `codex exec --sandbox read-only`，审批 `never` | 拦截 | 拦截 | 拦截 |
| `codex exec --sandbox workspace-write`，审批 `never` | 写入成功 | 拦截 | 拦截 |
| `codex exec --yolo` | 写入成功 | 写入成功 | 收到请求 |

三次 CLI 运行都实际执行了探针。写入被拦截时返回只读文件系统错误，网络被拦截时返回 “Operation not permitted”。我还通过 Codex 内置的 `:read-only`、`:workspace` 权限配置直接运行了探针，边界结果相同。

这组实验只记录当前 Linux 环境里的三项操作，没有测试恶意仓库、沙箱逃逸或自动审批 reviewer 的判断。[实验记录与探针](https://github.com/orbi-build/orbi-website/blob/beta/docs/blog/codex-yolo-mode-lab.md)提供了环境说明和复现步骤。

## 保留 workspace-write，也能无人交互运行

如果依赖已经准备好，任务只需要在允许的工作区内改文件：

```bash
codex -a never exec --sandbox workspace-write \
  "Fix the failing tests. Run the relevant checks and report what changed."
```

`exec` 不启动交互式终端界面。`workspace-write` 规定文件系统边界，`-a never` 禁止请求审批，因此越出当前权限的命令不能在运行中申请提权。任务需要下载依赖或访问其他目录时，可能无法完成；这些访问条件要在启动前准备好。

我还让每种配置各做一次普通任务：创建内容为 `print('workspace ok')` 的 `greeting.py`，然后运行它。workspace-write 完成了，没有用到 Codex YOLO mode；YOLO 也完成了。read-only 下，agent 表示无法创建文件，没有调用工具。普通任务加上固定探针，共六次 CLI 调用。

六次 CLI 退出码全是 0，包括没有创建目标文件的 read-only 普通任务。流水线进入下一步前，还要检查目标文件和项目测试结果；正常退出本身不能证明任务达到了验收标准。

## Codex full auto 命令现在还能用吗

旧教程常见这样的命令：

```bash
codex exec --full-auto "fix the failing tests"
```

在我测试的版本中，参数解析就会失败，任务还没有开始：

```text
$ codex --version
codex-cli 0.159.3

$ codex exec --full-auto --help
error: unexpected argument '--full-auto' found
# exit code: 2
```

OpenAI 当前的[非交互运行文档](https://learn.chatgpt.com/docs/non-interactive-mode)说明，`--full-auto` 已不再支持。需要修改仓库的脚本应明确使用 `--sandbox workspace-write`；需要自动审批 review 时，可用 `--approve-for-me`。一些搜索结果仍显示旧的兼容参数示例。实际是否可用，要核对安装版本的参数解析结果。

迁移 Codex full auto 脚本时，先确定任务需要什么权限。直接替换成 `--yolo` 会同时取消本地沙箱，权限变化大于“允许修改仓库”。

## 需要审批时，让自动 reviewer 判断

官方还提供了这个预设：

```bash
codex exec --approve-for-me \
  "Fix the failing tests and run the relevant checks."
```

它组合了 workspace-write、on-request 审批和自动 reviewer。CLI 文档列明它与显式 sandbox 参数、YOLO 冲突，应单独使用。

[Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review)检查符合条件、需要审批的操作。沙箱已经允许的命令不会经过这道 review；获批的提权请求可以跨出通常的边界。请求被拒绝后，agent 必须改用风险实质上更低的方案；找不到这样的方案时，应停下来询问用户。账户和组织策略也可能限制这个模式。

我只确认了 0.159.3 接受该参数，没有在这组实验里测试 reviewer 的决策。审批 review 与代码 review 的职责也不同：一个命令获准执行，并不能证明它生成的补丁正确、可以合并。

## Orbi 怎样无人值守运行，又怎样决定合并

我做 Orbi，是想让编码任务一路完成 PR、评审和合并。在 GitHub Issue 中写清验收标准，加上 `ai-ready`，runner 就在单独的 worktree 中启动 Pi，推送任务分支、创建 PR。

<figure class="post-media">
<img src="/img/blog-codex-yolo-orbi-flow-zh.webp" alt="Orbi 正常交付路径：ai-ready Issue、Pi worktree、PR、独立评审会话和仓库检查，最后合并。Cloud 的发版按钮单独代建发版 Issue，再经门禁、打 tag、发布 GitHub Release。" width="1800" height="2010" loading="lazy">
<figcaption>另一个 Pi 会话评审 PR。发版由用户在 Cloud 单独发起。</figcaption>
</figure>

runner 核对评审结论，拒绝审稿后被外部改动的 PR head。基础分支前进且能无冲突合入时，它可以吸收更新、检查新的 head，无需再开评审会话。检查未完成时等待，失败时阻止合并。测试能覆盖什么，取决于仓库定义了哪些检查。

worktree 隔开检出目录，不能限制进程权限。自托管时，运行账户、凭据和网络访问要据此配置；评审管不到执行时已经读取的文件或发出的请求。

### 在 Cloud 发版

1. 登录状态页，打开项目的“版本”区。只连了一个项目时，在页面底部展开“用量与设置 → 版本”。
2. 在当前版本行点击“创建 Release 任务”。Cloud 会代建 GitHub 发版 Issue、加好标签，Orbi 执行门禁后打 tag、发布 GitHub Release。

<figure class="post-media">
<img src="/img/blog-codex-yolo-release-proof.webp" alt="已发布的 GitHub v0.5.60 发版记录，列出发版 Issue 1522 和已关闭的范围票 1518、1519。" width="1944" height="1824" loading="lazy">
<figcaption>2026 年 10 月 16 日截取的已发布记录局部。对应的发版 Issue #1522 由 Cloud 创建。</figcaption>
</figure>

原始记录：[v0.5.60 Release](https://github.com/orbi-build/orbi/releases/tag/v0.5.60)、[由 Cloud 创建的 Issue #1522](https://github.com/orbi-build/orbi/issues/1522)。

自托管 Orbi 可通过 Pi 的 `openai-codex` provider 使用 Codex OAuth，步骤见 [Codex 集成指南](/zh/guides/codex-github-issues/?ref=blog-codex-yolo)。使用托管流程则[把仓库连到 Orbi Cloud](/zh/cloud/?ref=blog-codex-yolo)。Cloud 使用自己的模型配置，不继承本机 Codex 登录或 Codex YOLO mode 权限；上面的 CLI 参数也不是 Orbi 设置。

## 相关

- [Claude Code YOLO 模式与权限边界](/zh/blog/claude-code-yolo-mode/)
- [Claude Code sandbox 的文件和网络实测](/zh/blog/claude-code-sandbox/)
- [对比 Codex 交付方式](/zh/compare/codex/?ref=blog-codex-yolo)
- [使用 Orbi Cloud](/zh/cloud/?ref=blog-codex-yolo)
