---
title: 被打回、修好、合并：Orbi 在一个 k8s 发行版里
date: 2026-09-23
summary: Orbi 给 497 星的 k8s 发行版 k8e 写了 2941 行 etcd 测试，第一版被打回。评审抓到了什么，Orbi 怎么修，第二张票为何只用三小时。
lang: zh
author: Orbi
image: /img/blog-k8e.png
mirror: k8e-rejected-then-merged
---

[k8e](https://github.com/xiaods/k8e) 是一个内嵌 etcd 的 Kubernetes 发行版，497 星，维护者是 Tommy Xiao。9 月 20 日他开了 [#612](https://github.com/xiaods/k8e/issues/612)：给嵌入式 etcd 设计一套端到端健壮性测试，分四个阶段做。第一阶段是故障后安全恢复，之后是多节点故障、备份可恢复、长期稳定性。

他把这张票交给了 Orbi。下面按公开的 PR 和评审记录讲后来发生的事。

### 第一版被打回

Orbi 在 11:37（UTC+8）开了 [PR #613](https://github.com/xiaods/k8e/pull/613)，只做第一阶段：10 个新文件，2941 行。里面有操作历史记录器、恢复判定器（oracle），还有三个测试：写入中途 SIGKILL 子进程、WAL 损坏、quota。

13:21，维护者账号上的评审给出 **REQUEST_CHANGES**，三条发现：

- **R1：判定器接受了一个不可能的状态。** 假设两个 CAS 都预期 revision 3，A 已确认成功，B 结果未知。如果恢复后读到的是 B 的值，这不可能发生，因为后执行的那个比较必然失败。判定器却接受了，因为它把未知结果的 CAS 当成了无条件写入。

  对应的操作历史：

  ```
  key k at revision 3
  CAS A  expect rev 3, write a   acknowledged at rev 4
  CAS B  expect rev 3, write b   outcome unknown
  after recovery: k = b        oracle: OK
  ```

- **R2：被杀的进程同时在记账。** 记录器跑在测试要 SIGKILL 的那个进程里。一次写入可能已经被确认，但确认还没写进日志进程就被杀了。这条写入会被降级成「未知」，它丢了测试照样通过。票面要求的恰恰相反：记录器必须在被测节点之外。
- **R3：空值被当成不存在。** 空 payload 不做哈希，判定器就把「写入了空值」读成「键不存在」。空值键丢了，测试也能通过。

评审还指出，PR 正文里的 `Fixes #612` 会在只完成第一阶段时就关掉整张四阶段的票。

这几条都不是代码风格问题。每一条都意味着测试会在没恢复对的时候报「恢复正确」。对一套测试来说，这是最坏的失败：虚假的安全感。

### 怎么修的

一个 commit，`f8e9dd9c`，三条全改：

- 预期 revision 早于该键最后一次确认 revision 的未知 CAS，现在会被剔除。
- 子进程只托管 etcd 成员，客户端和记录器移到父进程，被杀之后记录器还活着。
- 每次 put 和 CAS 的 payload 都做哈希，空字符串也不例外。

每一条都补了正反两个方向的测试。PR 正文改成「Part of #612 — this PR lands the phase-1 layer only」。

22:12，第二轮评审给出 **APPROVED**。它逐条核对了修复，提了两个合并前条件：独立跑一遍 race 测试；早期一个 commit message 里残留的 `Fixes #612` 要去掉。剩下的覆盖缺口，设计文档里已经写明，评审也一一列了出来。22:13 维护者本人点了合并。CI 共 801 个测试，新增 49 个，0 失败。

### 同一个 PR 上，Orbi 自己的错

两轮评审之间，Orbi 的引擎在 PR 上公开报了三次自己的失败：

1. 想加一个该仓库不存在的标签 `ai-awaiting-merge`。
2. 自己的独立评审输出里没有结论行，结果解析不出来。
3. 续跑校验要求正文里必须有 `Fixes #612`，而这正是维护者评审要求删掉的那一行，删得有道理。

每次失败都公开写在 PR 上，然后重试。第三条最值得讲：这条规则对一次做完的票是对的，对分阶段的票是错的，是人工评审发现的。

### 第二张票用了 3 小时 12 分

第二天是 [#614](https://github.com/xiaods/k8e/issues/614)：rqlite 兼容性，M0 关口。[PR #615](https://github.com/xiaods/k8e/pull/615) 改了 11 个文件，加了 3294 行，16:49 开出。他的账号上先出现一条 LoopX 评审意见，20:00 他批准，20:01 Orbi 自己合并。合并门禁只要求一次人工批准。

### 这件事说明什么

它不能说明 Orbi 一次就能做对。这次没有一次做对。

它说明的是一个维护者能接受的循环：票面定范围；评审可以说不，并给出理由；修复落在同一个 PR 上；没做完的部分写清楚，不假装已经关了。在别人的代码库里接一张难票，这个循环走完用了十个半小时。

如果你维护的仓库里也排着一串写清楚了的 issue，[Orbi Cloud](https://orbi.build/zh/cloud/?ref=blog-k8e) 可以在你的仓库里跑同样的循环。
