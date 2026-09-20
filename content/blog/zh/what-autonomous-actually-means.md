---
title: 会对自己说不的 AI 编码 agent
date: 2026-09-20
summary: 大部分自称无人值守的 agent 停在开出 PR 那一步。真正难的不是让模型写代码，是让另一个模型读完这份 diff 之后拒绝它。这里是一次真实交付，评审拦了两轮，commit 和 release 都能点开看。
lang: zh
---

搜「AI 编码 agent」会搜到一堆能自动开 PR 的工具。那一步早就不难了。

没人给你看的是拒绝：有个东西读完 diff，说这个不能发。

我想讲一次真的发生了这件事的交付。写代码那部分好演，拒绝不好演。

## 这次交付

[Issue #1018](https://github.com/orbi-build/orbi/issues/1018) 是我们自己发版代码里的一个真实缺陷：
有个改动把文档同步挪到了打 tag 之前，于是开出三个窗口，让「已发布的 tag」可能没有对应的文档页。

这张票打上 `ai-ready`。没有别的配置。

Orbi 认领它，在隔离的 worktree 里干活，基于一个记录下来的 base commit 开出
[PR #1023](https://github.com/orbi-build/orbi/pull/1023)。到这里为止，每个 agent 都能做。

然后另一个会话，全新的上下文、完全不记得自己写过这些代码，去读那份 diff。

## 拒绝

第一轮回来一条 Major。不是风格建议：

> **Location:** `src/orbi/release.py:2377`
>
> **Note:** 如果 `publish_release` 在 tag 推上去之后失败，`rollback_release_docs`
> 会删掉文档 commit，却把远端的 tag 留在那里。CI 于是可能看到一个没有文档页的
> 已发布 tag，违反验收项。

修 bug 的那个改动，在更窄的窗口里把 bug 又造了一遍。评审点出了文件、行号、成因，
以及正确的修法长什么样。

Orbi 读了这条 finding，补上恢复路径，再跑一遍。第二轮又回来了，这次是覆盖率：
新分支没有测试。再来三个 commit。

一共九个 commit，+427/-43，从 Issue 到合并三小时零两分钟。然后是
[v0.5.17](https://github.com/orbi-build/orbi/releases/tag/v0.5.17)，
生成的 release notes 里列着这张 Issue 和这个 PR。

这段时间里没有人做过任何决定。

## 截图说不出来的那部分

我们用这次运行[剪了个视频](https://youtu.be/Et6gBSaXqqA)，有一处必须在画面上标注，否则帧本身会骗人。

runner 是拿我自己的 GitHub 账号发东西的。它用我的 token，所以它的 commit 署我的名，
它的评审意见也署我的名、配我的头像。屏幕上，拦下 PR #1023 的那条评审显示在
`xqliu` 名下，徽章写着 `Collaborator` 和 `Author`。

第一次看到的人会把这读成「一个开发者在审自己的 PR」—— 恰恰是这整件事要反驳的东西。
而那条评论正下方，坐着一条 `github-actions` 的评论，带着 `Bot` 徽章。
同一屏先教会你「机器人长这样」，再给你看一条不是机器人的评审。

我没法让 GitHub 显示成别的样子。我能做的是把它说出来：那是第二个模型，
跑在独立的会话里，不记得自己写过被它拒掉的那些代码。

## 闸门能拦住交付之后，变的是什么

一个能写代码、能开 PR 的 agent，只是把活挪给了人。总得有人去读、去判断、去合。
agent 干的是打字那部分。

把闸门做成真的，多半是管道活。verdict 必须绑定到某个具体 commit，
否则后来的推送会绕过一个为更早的 commit 出具的判断。finding 也必须具体到
**一个全新的、不记得原始工作的会话能据此动手** —— 只会说「还没完成」的检查，
会让下一个会话去猜。

更难的部分是，它得被允许直接把整次交付判死。我最近在和几个做类似闸门的维护者对账，
他们说的是同一件事：大家都把检查留成 advisory，因为会拦的检查拖慢迭代速度。

我觉得这件事的关键是谁在等，而不是检查对不对。拦一个人的 PR，当场花掉那个人的时间，
他能感觉到。拦一个 agent 的 PR，不花任何人的时间 —— agent 读完 finding 自己再跑一遍，
凌晨三点，所有人都在睡觉。

## 自己试

整条流水线是一个容器。systemd 在里面当 PID 1，那几行 cgroup 挂载就是为了这个：

```bash
docker run -d --name orbi \
  --stop-signal SIGRTMIN+3 \
  --tmpfs /run --tmpfs /tmp \
  --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
  -v orbi-deploy:/orbi \
  -v orbi-work:/work \
  -e GH_TOKEN="github_pat_xxx" \
  -e ORBI_SOURCE_REPO="OWNER/REPO" \
  -e ORBI_PI_PROVIDER=deepseek \
  -e ORBI_PI_MODEL=deepseek-chat \
  -e ORBI_PI_BASE_URL=https://api.deepseek.com \
  -e ORBI_PI_API_KEY="sk-xxx" \
  ghcr.io/orbi-build/orbi:latest
```

引擎就是那四个变量指向的模型。给一张 Issue 打上 `ai-ready`，下一次 tick 就会认领它。
评审跑在独立的会话里，对的是冻结的 head；那个会话不放行，就不会合并。
完整步骤见 [docs.orbi.build/docker](https://docs.orbi.build/docker)。

## 账本

这套东西跑在它自己的仓库上。到今天为止，27 天：`orbi/` 分支合并了 334 个 PR，
发布了 51 个打了 tag 的 release。

每一个都是能点开的链接，包括那些拦下了东西的评审，以及之后补上的 commit。

Orbi 开源，可自托管：[github.com/orbi-build/orbi](https://github.com/orbi-build/orbi)。
