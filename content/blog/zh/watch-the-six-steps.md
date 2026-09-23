---
title: Orbi Cloud 七步上手流程，83 秒看完
date: 2026-09-21
summary: 83 秒视频记录 Orbi Cloud 从 GitHub 登录到带 tag 的 Release 和订阅。最后一步进入 Cloud 的付费交付流程。
lang: zh
author: Orbi
image: /img/blog-watch-six-steps.png
video_name: Orbi Cloud setup from zero to a tagged release in seven steps
video_description: An 83-second walkthrough of the seven-step Orbi Cloud setup from GitHub sign-in through subscription.
video_thumbnail: /img/blog-watch-six-steps.png
video_upload_date: 2026-09-21
video_duration: PT1M23S
video_embed_url: https://www.youtube.com/embed/_OEaBwrLvvs
---

Orbi Cloud 的上手流程拍成了视频：[Orbi Cloud: from zero to a tagged release in seven steps](https://www.youtube.com/watch?v=_OEaBwrLvvs)。全长 83 秒，英文配章节，卡在哪一步可以直接跳过去。

<figure class="post-media"><iframe src="https://www.youtube.com/embed/_OEaBwrLvvs" title="Orbi Cloud 七步上手流程：从登录到订阅" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe><figcaption>观看完整的七步 Orbi Cloud 上手流程。</figcaption></figure>

### 七步流程里的七个关键画面

<figure class="post-media">
<img src="/img/step-1-sign-in.png" alt="Orbi Cloud 登录页面" width="2560" height="1440" srcset="/img/step-1-sign-in.png 1x, /img/step-1-sign-in-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw" loading="eager">
<figcaption>第 1 步：Orbi Cloud 登录页面。</figcaption>
</figure>

<figure class="post-media">
<img src="/img/step-2-install-app.png" alt="GitHub App 安装页面" width="2560" height="1440" srcset="/img/step-2-install-app.png 1x, /img/step-2-install-app-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw" loading="eager">
<figcaption>第 2 步：GitHub App 安装页面。</figcaption>
</figure>

<figure class="post-media">
<img src="/img/step-3-connect-repo.png" alt="连接仓库表单" width="2560" height="1440" srcset="/img/step-3-connect-repo.png 1x, /img/step-3-connect-repo-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw">
<figcaption>第 3 步：连接仓库表单。</figcaption>
</figure>

<figure class="post-media">
<img src="/img/step-4-provision.png" alt="开通运行环境状态" width="2560" height="1440" srcset="/img/step-4-provision.png 1x, /img/step-4-provision-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw">
<figcaption>第 4 步：开通运行环境状态。</figcaption>
</figure>

<figure class="post-media">
<img src="/img/step-5-first-issue.png" alt="第一个 Issue 的状态页面" width="2560" height="1440" srcset="/img/step-5-first-issue.png 1x, /img/step-5-first-issue-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw">
<figcaption>第 5 步：第一个 Issue 的状态页面。</figcaption>
</figure>

<figure class="post-media">
<img src="/img/step-6-release.png" alt="填写版本号的发版表单" width="2560" height="1440" srcset="/img/step-6-release.png 1x, /img/step-6-release-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw">
<figcaption>第 6 步：填写版本号的发版表单。</figcaption>
</figure>

<figure class="post-media">
<img src="/img/step-7-subscribe.png" alt="Managed Cloud 订阅页面" width="2560" height="1440" srcset="/img/step-7-subscribe.png 1x, /img/step-7-subscribe-2x.png 2x" sizes="(min-width: 900px) 784px, 100vw">
<figcaption>第 7 步：Managed Cloud 订阅页面。</figcaption>
</figure>

现在的 Cloud 上手流程一共七步：

1. **登录**，用你的 GitHub 身份。
2. **安装 Orbi GitHub App**。
3. **连接仓库**，选择仓库，以及 Orbi 从哪个 base branch 开始工作。
4. **开通运行环境**，大约一分钟。
5. **第一个 Issue**，打上 `ai-ready`，Orbi 开始写代码，写完提 PR。
6. **发一个版本**，你填版本号，Orbi 负责 bump、打 tag、发布 GitHub Release。
7. **订阅**，前 `__FREE_DELIVERIES__` 次交付免费；之后是每月 US$`__CLOUD_MONTHLY_USD__`，包含 `__INCLUDED_TOKENS__` tokens。额度用完只会暂停新的交付，不会删除数据，随时可以取消。

## 第七步是开始付费交付的那一步

第一到第六步是配置和交付：你把 Orbi 推断不出来的东西交给它：身份、安装、仓库、运行环境、Issue 和 Release。完成 `__FREE_DELIVERIES__` 次免费交付后，第七步就是选择 Managed Cloud 计划。

发版这一步仍然需要你做决定：**版本号由你决定，Orbi 不替你递增**。runner 会改版本文件、打 tag、发布 Release，但它不选那个数字。版本号是一个声明，说这次改了什么、谁该关心。这是产品决策，靠计数器读一个数出来就是在假装它不是。发布范围从同名 Milestone 派生；没有同名 Milestone，发版会停在范围派生这一步，并告诉你为什么。

第五步就是打一个标签，不用离开终端：

```bash
gh issue edit <number> --add-label ai-ready
```

## 视频里是什么

每一屏都是产品真实渲染，不是效果图：登录卡片、带仓库和 base branch 两个字段的连接表单、标出你当前在第几步的进度条、带开通状态列的「绑定的仓库」表格、带版本号输入框的发版表单，以及订阅这一步。GitHub App 那一屏是真的，就是 [github.com/apps/orbi-build](https://github.com/apps/orbi-build)。

不想看视频想读文字，同一条路径在文档里：[docs.orbi.build/zh](https://docs.orbi.build/zh)。不想跑在我们的机器上、想自己跑，那是同一个产品，[可以免费自托管](https://github.com/orbi-build/orbi)。

从这里开始：[orbi.build/zh/cloud](https://orbi.build/zh/cloud/?ref=blog-seven-steps)。


## 相关

继续阅读：[Google Jules 对比](/zh/compare/jules/) 与 [Cloud](/zh/cloud/)。
