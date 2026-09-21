---
title: 七步跑完，全程录下来了
date: 2026-09-21
summary: 一段 83 秒的视频，从 GitHub 登录一路到发出带 tag 的 Release，再到订阅。画面全是产品真实渲染，而第七步是开始付费交付的那一步。
lang: zh
---

上手流程现在有视频了：[Orbi Cloud: from zero to a tagged release in seven steps](https://www.youtube.com/watch?v=_OEaBwrLvvs)。83 秒，英文，带章节，卡在哪一步就跳到哪一步。

现在的 Cloud 上手流程一共七步：

1. **登录** —— 用你的 GitHub 身份。
2. **安装 Orbi GitHub App**。
3. **连接仓库** —— 仓库，以及 Orbi 从哪个 base branch 开始工作。
4. **开通运行环境**，大约一分钟。
5. **第一个 Issue** —— 打上 `ai-ready`，Orbi 开始写代码，写完提 PR。
6. **发一个版本** —— 你填版本号，Orbi 负责 bump、打 tag、发布 GitHub Release。
7. **订阅** —— 前 <code>__FREE_DELIVERIES__</code> 次交付免费；之后是每月 US$<code>__CLOUD_MONTHLY_USD__</code>，包含 <code>__INCLUDED_TOKENS__</code> tokens。额度用完只会暂停新的交付，不会删除数据，随时可以取消。

## 第七步是开始付费交付的那一步

第一到第六步是配置和交付：你把 Orbi 推断不出来的东西交给它 —— 身份、安装、仓库、运行环境、Issue 和 Release。完成 <code>__FREE_DELIVERIES__</code> 次免费交付后，第七步就是选择 Managed Cloud 计划。

发版这一步仍然需要你做决定：**版本号由你决定，Orbi 不替你递增**。runner 会改版本文件、打 tag、发布 Release，但它不选那个数字。版本号是一个声明 —— 说这次改了什么、谁该关心 —— 这是产品决策，靠计数器读一个数出来就是在假装它不是。发布范围从同名 Milestone 派生；没有同名 Milestone，发版会停在范围派生这一步，并告诉你为什么。

第五步就是打一个标签，不用离开终端：

```bash
gh issue edit <number> --add-label ai-ready
```

## 视频里是什么

每一屏都是产品真实渲染，不是效果图：登录卡片、带仓库和 base branch 两个字段的连接表单、标出你当前在第几步的进度条、带开通状态列的「绑定的仓库」表格、带版本号输入框的发版表单，以及订阅这一步。GitHub App 那一屏是真的，就是 [github.com/apps/orbi-build](https://github.com/apps/orbi-build)。

不想看视频想读文字，同一条路径在文档里：[docs.orbi.build/zh](https://docs.orbi.build/zh)。不想跑在我们的机器上、想自己跑，那是同一个产品，[可以免费自托管](https://github.com/orbi-build/orbi)。

从这里开始：[orbi.build/zh/cloud](https://orbi.build/zh/cloud/?ref=blog-seven-steps)。
