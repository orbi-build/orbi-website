---
title: Orbi 为什么又改回开源：从 Apache 到 AGPL-3.0
date: 2026-09-24
summary: Orbi 从 Apache-2.0 换到 SUL，v0.5.44 起又改为 AGPL-3.0，也可选 SUL。这篇讲每次换许可证的原因和对用户的影响。
lang: zh
author: Orbi
image: /img/blog-agpl.png
mirror: orbi-is-open-source-again
---

9 月 24 日发布的 [v0.5.44](https://github.com/orbi-build/orbi/releases/tag/v0.5.44) 起，Orbi 的许可证是 **AGPL-3.0 或 Sustainable Use License（SUL）v1.0，二选一**。两种许可下自托管都免费。GitHub 上仓库的许可证现在显示为 AGPL-3.0。

一个月里换了两次许可证，下面把经过和每一步的理由都写清楚。

### 时间线

| 日期 | 许可证 | 出处 |
|---|---|---|
| 8 月 26 日 | Apache-2.0 | [#81](https://github.com/orbi-build/orbi/issues/81) 加入 LICENSE 文件 |
| 9 月 4 日 | Sustainable Use License v1.0 | 提交 [365c5bc](https://github.com/orbi-build/orbi/commit/365c5bc) |
| 9 月 24 日 | AGPL-3.0 或 SUL v1.0 | [#1332](https://github.com/orbi-build/orbi/issues/1332)，随 v0.5.44 发布 |

### 9 月 4 日为什么离开 Apache

Apache-2.0 允许任何人拿代码去卖托管服务。Orbi 的 runner 本来就是跑在用户自己机器上的，SUL 的边界正好划在同一个地方：自己用免费，拿去当服务转售要另外签协议。n8n 用的就是这个许可证，我们照搬了原文，限制条款和专利条款一字没改。

时机也有关系。当时仓库才十天，版权持有人只有一个，换许可证只要一个人点头。那次提交还在 `CONTRIBUTING.md` 里加了一条重新授权条款：贡献者同意维护者以后可以换许可证发布他们的代码，**前提是新许可证必须继续允许免费自托管**。

### SUL 的代价

SUL 不是 OSI 认可的许可证，所以 Orbi 不能说自己是开源软件。这件事的影响比我们预想的大。

有几个很对口的列表只收开源项目。[kyrolabs/awesome-agents](https://github.com/kyrolabs/awesome-agents/blob/main/CONTRIBUTING.md) 写明投稿必须开源；[Awesome-AI-Agents](https://github.com/Jenqyang/Awesome-AI-Agents/blob/main/CONTRIBUTING.md) 写明源码公开类许可证通常会被拒。其他地方也一样，每次介绍 Orbi 都得补一句：源码公开，自托管免费，但不是 OSI 定义的开源。

### 为什么选 AGPL，为什么还留着 SUL

AGPL-3.0 是 OSI 认可的开源许可证。它有一条网络条款：如果你改了 Orbi，再把它作为服务提供给别人，就要按同样的许可证公开你的修改。它并不禁止别人拿没改过的 Orbi 去做托管服务。SUL 禁止这件事，这层保护我们放弃了。

Elastic 在 2024 年走过同一条路，在原有许可证之外[加上了 AGPL](https://www.elastic.co/blog/elasticsearch-is-open-source-again)。我们保留 SUL 作为另一个选项，是因为有些公司明文禁止使用 AGPL 代码，他们仍然可以按 SUL 用 Orbi。

这次能换，靠的就是上面那条重新授权条款，它的前提条件也照样成立：两种许可下自托管都免费。到目前为止唯一的外部贡献者，是在这条条款加入之后才开始贡献的。

### 对你有什么影响

- **自托管**：没有变化。两种许可下都免费，模型和仓库都用你自己的。
- **介绍 Orbi**：现在可以说它是开源的，也可以投到只收 OSI 许可证项目的地方。
- **把 Orbi 作为服务提供给别人**：按 AGPL-3.0 可以，前提是公开你的修改。SUL 不允许这样做，除非另外签协议。
- **Orbi Cloud**：不变，仍然是我们运营的收费托管版。

包的元数据用一条 SPDX 表达式同时声明两种许可，摘自 `pyproject.toml`：

```toml
license = "AGPL-3.0-only OR LicenseRef-Sustainable-Use-1.0"
license-files = ["LICENSE", "docs/licenses/sustainable-use-license.md"]
```

许可证文件都在仓库里：[`LICENSE`](https://github.com/orbi-build/orbi/blob/main/LICENSE) 是未经改动的 GNU AGPL-3.0 原文，[`docs/licenses/sustainable-use-license.md`](https://github.com/orbi-build/orbi/blob/main/docs/licenses/sustainable-use-license.md) 是 SUL 全文，并附有两种许可怎么选的简短说明。

## 相关

继续阅读：[OpenHands 对比](/zh/compare/openhands/) 与 [Cloud](/zh/cloud/)。
