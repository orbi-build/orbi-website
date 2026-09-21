---
title: 六步跑完，全程录下来了
date: 2026-09-21
summary: 一段 66 秒的视频，从 GitHub 登录一路到发出带 tag 的 Release。画面全是产品真实渲染，而第六步是引擎不替你做的那一步。
lang: zh
author: Orbi
image: /img/blog-watch-six-steps.png
video_name: Orbi Cloud setup from zero to a tagged release
video_description: A 66-second walkthrough of the Orbi Cloud setup from GitHub sign-in to a tagged release.
video_thumbnail: /img/blog-watch-six-steps.png
video_upload_date: 2026-09-21
video_duration: PT1M6S
video_embed_url: https://www.youtube.com/embed/4rOzCMwiXhI
---

上手流程现在有视频了：[Orbi Cloud: from zero to a tagged release in six steps](https://www.youtube.com/watch?v=4rOzCMwiXhI)。66 秒，英文，带章节，卡在哪一步就跳到哪一步。

<figure class="post-media"><iframe src="https://www.youtube.com/embed/4rOzCMwiXhI" title="Orbi Cloud 从零到带 tag 的 Release" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe><figcaption>观看完整的 Orbi Cloud 上手流程。</figcaption></figure>

### 六个画面

<figure class="post-media"><img src="/img/step-1-sign-in.png" alt="Orbi Cloud 登录页面" loading="lazy"><figcaption>第 1 步：Orbi Cloud 登录页面。</figcaption></figure>

<figure class="post-media"><img src="/img/step-2-install-app.png" alt="GitHub App 安装页面" loading="lazy"><figcaption>第 2 步：GitHub App 安装页面。</figcaption></figure>

<figure class="post-media"><img src="/img/step-3-connect-repo.png" alt="连接仓库表单" loading="lazy"><figcaption>第 3 步：连接仓库表单。</figcaption></figure>

<figure class="post-media"><img src="/img/step-4-provision.png" alt="开通运行环境状态" loading="lazy"><figcaption>第 4 步：开通运行环境状态。</figcaption></figure>

<figure class="post-media"><img src="/img/step-5-first-issue.png" alt="第一个 Issue 的状态页面" loading="lazy"><figcaption>第 5 步：第一个 Issue 的状态页面。</figcaption></figure>

<figure class="post-media"><img src="/img/step-6-release.png" alt="填写版本号的发版表单" loading="lazy"><figcaption>第 6 步：填写版本号的发版表单。</figcaption></figure>


六步就是状态页上数的那六步：

1. **登录** —— 用你的 GitHub 身份。
2. **安装 Orbi GitHub App**。
3. **连接仓库** —— 仓库，以及 Orbi 从哪个 base branch 开始工作。
4. **开通运行环境**，大约一分钟。
5. **第一个 Issue** —— 打上 `ai-ready`，Orbi 开始写代码，写完提 PR。
6. **发一个版本** —— 你填版本号，Orbi 负责 bump、打 tag、发布 GitHub Release。

## 第六步是个决定，不是个按钮

第一到第五步都是配置：你把 Orbi 推断不出来的东西交给它 —— 身份、安装、仓库、运行环境。到第五步，它开始自己干活。

第六步不一样，视频里明说了：**版本号由你决定，Orbi 不替你递增**。runner 会改版本文件、打 tag、发布 Release，但它不选那个数字。版本号是一个声明 —— 说这次改了什么、谁该关心 —— 这是产品决策，靠计数器读一个数出来就是在假装它不是。发布范围从同名 Milestone 派生；没有同名 Milestone，发版会停在范围派生这一步，并告诉你为什么。

这也是为什么这一步会出现在开通进度条上。一个悄悄替你打 tag 的引擎，演示起来更轻松，运维起来更糟糕。

第五步就是打一个标签，不用离开终端：

```bash
gh issue edit <number> --add-label ai-ready
```

## 视频里是什么

每一屏都是产品真实渲染，不是效果图：登录卡片、带仓库和 base branch 两个字段的连接表单、标出你当前在第几步的进度条、带开通状态列的「绑定的仓库」表格、带版本号输入框的发版表单。GitHub App 那一屏是真的，就是 [github.com/apps/orbi-build](https://github.com/apps/orbi-build)。

不想看视频想读文字，同一条路径在文档里：[docs.orbi.build/zh](https://docs.orbi.build/zh)。不想跑在我们的机器上、想自己跑，那是同一个产品，[开源且可自托管](https://github.com/orbi-build/orbi)。

从这里开始：[orbi.build/zh/cloud](https://orbi.build/zh/cloud/?ref=blog-six-steps)。
