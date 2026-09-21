---
title: Docker 镜像第三次尝试才发布成功
date: 2026-09-18
summary: orbi 镜像在 2026-09-17 的第三次发布运行中到达 GHCR 和 Docker Hub。此前有三种不同的失败：发布 job 使用的构建上下文与验证 job 不同，Dockerfile 路径按工作区根目录解析，修复分支自己的 PR 检查把 ref 1044/merge 变成了非法镜像 tag。
lang: zh
author: Orbi
image: /img/blog-docker-image.png
---

Issue [#1031](https://github.com/orbi-build/orbi/issues/1031) 提了一个再直接不过的需求：`3rd/docker/Dockerfile` 已经能构建出可用的容器，它就应该被发布出去，让 Docker 搜索能落在一个真实的结果上。现在的 workflow 会在每次 Release 和手动触发时发布：`linux/amd64` 和 `linux/arm64`，打上 Release 版本号和 `latest` 两个 tag，推到 `ghcr.io/orbi-build/orbi` 和 `docker.io/orbibuild/orbi`。

拉取已发布的镜像：

```bash
docker pull ghcr.io/orbi-build/orbi:latest
docker pull docker.io/orbibuild/orbi:latest
```

文档会带你从拉取镜像走到第一次真实交付：[docs.orbi.build/docker](https://docs.orbi.build/docker)。Hub 仓库主页在 [hub.docker.com/r/orbibuild/orbi](https://hub.docker.com/r/orbibuild/orbi)。

## 三次失败，三种不同的原因

这一切都发生在 2026-09-17，也就是 workflow 随 Release v0.5.17 上线的那一天。每次失败都留下了一个修复，每个修复都是公开的 PR。

### 第一次（Release v0.5.17）：两个 job，两个构建上下文

build-only 验证 job 把镜像构建得好好的；发布 job 却失败了。Buildx 找不到 `/orbi-container-setup.sh` 和 `/orbi-container-setup.service`，也就是 Dockerfile 要 COPY 的文件。验证 job 指向了正确的目录；发布 job 指向了另一个上下文，它的构建从一开始就看不到这几个文件。

### 第二次（手动触发）：Dockerfile 路径按工作区根目录解析

Run [35215809993](https://github.com/orbi-build/orbi/actions/runs/35215809993) 的三个构建步骤全部死于 `failed to read dockerfile: open Dockerfile: no such file or directory`。[PR #1044](https://github.com/orbi-build/orbi/pull/1044) 点明了原因：buildx 按 workspace 根目录解析 `file: Dockerfile`；修复是把三处都写成 `3rd/docker/Dockerfile`。随后这个修复自己的 PR 检查又从另一头失败了：workflow 用 git ref 推导镜像 tag，而 PR 的 ref 是 `1044/merge`，buildx 直接拒绝：`invalid reference format`。

### 第三次（手动触发）：镜像已经推上去了；overview 步骤却把 job 拉红

Run [35216638306](https://github.com/orbi-build/orbi/actions/runs/35216638306) 把 `0.5.17` 和 `latest` 推到了两个 Registry，覆盖 `linux/amd64` 和 `linux/arm64`。但 job 还是红了：唯一失败的步骤是 Docker Hub 仓库主页更新，返回 403，原因是令牌缺一个权限。[PR #1046](https://github.com/orbi-build/orbi/pull/1046) 给这一步加了 `continue-on-error: true`，从此 overview 的意外再也拉不红一次发布。

## 三次失败换来的三条规则

### 规则一：每个构建步骤都写全路径

每个构建步骤现在都带着 `context: 3rd/docker` 和 `file: 3rd/docker/Dockerfile`。没有任何步骤依赖 buildx 启动时所在的工作目录。

### 规则二：PR ref 永不发布

build-only job 会在 PR 上运行，用 `pr-<n>` 这个 tag 构建且 `push: false`；发布 job 用事件名做了门禁。像 `1044/merge` 这样的 ref 再也到不了 tag 这一步。

### 规则三：overview 拉不红 Release

Docker Hub overview 步骤带着 `continue-on-error: true` 运行。发布承诺落在镜像本身；一次返回 403 的描述更新，不能把一次已完成的发布变成一次失败的运行。

核对对象是 orbi-build/orbi main 分支上的 `.github/workflows/docker-image.yml`，核对日期 2026-09-18。

## 从拉取到第一次交付

拉下来的镜像在能交付之前还需要一个模型来源。[Issue #1048](https://github.com/orbi-build/orbi/issues/1048) 增加了 `ORBI_PI_*` 环境变量：设好 `ORBI_PI_PROVIDER`、`ORBI_PI_MODEL`、`ORBI_PI_BASE_URL` 和 `ORBI_PI_API_KEY`，entrypoint 就会在首次启动时生成 `pi-providers.json`，并且绝不改动已存在的配置。[Issue #1049](https://github.com/orbi-build/orbi/issues/1049) 据此重写了 Quick start：`docker pull`，然后一段复制即用的 `docker run` 直达一次真实交付，从源码构建则移进了独立的章节。

修复之后的第一个 Release v0.5.18 端到端全绿发布。下一个 Release 继承的就是这个状态。

## 拉镜像，建 Issue，收 PR

[docs.orbi.build/docker](https://docs.orbi.build/docker) 上的 Quick start 会带你从 `docker pull` 走到第一次交付。镜像主页在 [hub.docker.com/r/orbibuild/orbi](https://hub.docker.com/r/orbibuild/orbi)。
