# orbi.build 官网审查报告

审查日期：2026-09-04
审查范围：`public/index.html`、`public/zh/index.html`、`public/apply.html`、`public/styles.css`、`public/demo.js`、`src/worker.js`
方法：源码通读 + Chrome 实机渲染（1440×900 桌面 / 390×844 移动）+ 生产环境接口核实 + 量化测量（对比度、溢出、grid track）

---

## 结论摘要

这是一个**设计水准明显高于平均线**的着陆页。视觉语言（工业控制台隐喻、mono 标签体系、青绿/琥珀双信号色）自洽且有辨识度；内容极其克制，用 `data-status="shipping|direction"` 和测试用例（`test_cloud_is_a_direction_not_a_shipping_claim`）在系统层面防止过度承诺——这在 AI 工具赛道里罕见且宝贵。17 项对比度测试仅 1 项轻微未达标，标题层级无跳级。

问题集中在三处，**均非审美偏好，而是可测量的功能缺陷**：

| # | 问题 | 严重度 | 性质 |
|---|---|---|---|
| P0-1 | 中文版移动端 h1 破版，30 个元素溢出视口 | 阻断 | 已量化确证 |
| P0-2 | 零 OG / Twitter Card / JSON-LD | 严重 | 传播漏斗断裂 |
| P0-3 | 移动端导航隐藏 Docs 与 GitHub 入口 | 严重 | 转化损失 |
| P1-1 | robots.txt 无实际规则、无 sitemap | 中 | SEO/AIEO |
| P1-2 | `<br>` 导致标题文本粘连 | 中 | AIEO 解析 |
| P1-3 | 英文页加载中文字体全字重 | 中 | 性能 |
| P2 | 若干一致性与技术债 | 低 | 打磨 |

---

## P0-1 · 中文版移动端破版（阻断级）

### 现象
390px 视口下中文首页 h1「变成经过审查的软件」右侧被裁切，hero 正文同样溢出。

### 根因（已确证，非推测）
`styles.css:966-967`：

```css
html[lang="zh-CN"] h1 { font-size: clamp(2.9rem, 12.2vw, 3.2rem); }
html[lang="zh-CN"] h1 span { white-space: nowrap; }
```

390px 下 `12.2vw` = 47.59px，8 个汉字需 380px+，而 `.shell` 可用宽度仅 358px。`nowrap` 阻止折行，该 span 撑开父级 grid track。

### 量化证据
| 指标 | nowrap 生效 | 移除 nowrap |
|---|---|---|
| hero grid track | **404.75px** | 358.10px |
| 溢出视口的元素数 | **30** | 1 |

（剩余 1 个为 `.map-track-long` 内的横向滚动区，`overflow-x:auto` 属预期设计。）

`.night` 的 `overflow:hidden` 把它伪装成"没有横向滚动条"，因此**桌面端测试无法发现**——这解释了它为何能进入生产。

### 修复
移除 `nowrap`，改用字号收敛 + `text-wrap: balance`，让 8 字标题自然折行。

---

## P0-2 · 社交分享元数据完全缺失（严重）

三个页面**全部为零**：`og:title`、`og:description`、`og:image`、`og:type`、`og:url`、`twitter:card`、JSON-LD。

对一个依赖开发者社区口碑传播的开源项目，这是最贵的单点损失：在 X/Twitter、Telegram、Slack、Discord、微信中分享 orbi.build，呈现的是**裸 URL，无标题、无描述、无预览图**。项目已经把"Issue #48 → PR #193 真实交付"这样的强证据做进页面，却在分享环节全部丢失。

同时缺 `Organization` / `SoftwareApplication` 结构化数据——这正是 AI 检索（AIEO）判定"这是什么产品、谁做的、什么许可证"的首选信号源。

### 修复
补全两语言页 OG/Twitter 标签、`SoftwareApplication` + `Organization` JSON-LD，并生成 OG 预览图。

---

## P0-3 · 移动端导航吞掉核心入口（严重）

`styles.css:1039`：

```css
@media (max-width: 430px) {
  .site-header nav > a:not(:last-of-type) { display: none; }
}
```

实机确认（390px）：导航仅剩「Apply」+ 语言切换。**Docs 与 GitHub 两个最关键入口在手机上完全消失**，且无汉堡菜单兜底。

对开发者产品，"去 GitHub 看看源码"往往是决策前的必经动作。移动端读者只能滚到页脚才能找到——多数人不会滚。

### 修复
430px 下保留 GitHub + Docs（隐藏次要的 Product/Direction/Roadmap 锚点），保证核心路径始终可达。

---

## P1-1 · robots.txt 无实际规则、无 sitemap

`https://orbi.build/robots.txt` 返回 200，但**内容是 Cloudflare 自动注入的默认模板**，剥离注释后**生效规则为空**，且无 `Sitemap:` 声明。仓库中不存在 `robots.txt`、`sitemap.xml`、`llms.txt`。

含义：站点对搜索引擎与 AI 爬虫**没有任何主动抓取指引**，双语 hreflang 关系也无法通过 sitemap 强化。

### 修复
新增自有 `robots.txt`（显式 allow + Sitemap 声明）、`sitemap.xml`（含 hreflang 交替链接）、`llms.txt`（AI 检索友好的结构化产品说明）。

---

## P1-2 · `<br>` 造成标题文本粘连（AIEO）

标题用 `<br>` 断行，导致 DOM 文本无空格：

- `Turn GitHub Issuesinto reviewed software`
- `A delivery graph.Not a task queue`
- `From delivering workto continuously evolving software`

爬虫与 AI 摘要读到的就是这些粘连字符串，直接影响标题解析与语义匹配质量。

### 修复
在 `<br>` 前补空格（视觉零影响，文本层恢复正确分词）。

---

## P1-3 · 英文页加载中文字体全字重（性能）

`index.html:14` 请求 `Noto+Sans+SC:wght@400;500;600;700`——四个字重的中文字体。英文页面完全用不到，中文字体子集体积远超拉丁字体。

### 修复
英文页移除 Noto Sans SC，中文页保留但削减至 400/600 两个字重。

---

## P2 · 一致性与技术债（低优先级）

| 项 | 说明 |
|---|---|
| **apply 页设计语言割裂** | 主站青绿夜色 `#06151b`，apply 页却用蓝紫 `#101724`/`#27324a` + 10px 圆角，与主站直角工业风冲突；且**无返回首页导航**，是死胡同页面 |
| **apply 页 hint 对比度 3.56** | 未达 WCAG AA 4.5（`#5f6f8f`），主站 `.stat small` 为 4.05 同样轻微未达标 |
| **未定义 CSS 变量** | `apply.html:18` 引用 `var(--font-head)`，styles.css 中不存在，靠 fallback 侥幸生效；应为 `--display` |
| **死资源** | `img/flow-en.svg`、`flow-zh.svg`、`where.svg` 共 9KB，全站零引用 |
| **schema 语义矛盾** | `migrations` 中 `email TEXT NOT NULL`，但 worker 视其为选填。**已实测确认空串可正常插入，不会导致线上故障**，仅为技术债 |
| **apply 页无 OG/noindex** | 既无分享元数据，也未声明 `noindex` |

### 已核实为"非问题"的项

以下两项在初查时可疑，实测后排除，**不应计入缺陷**：

- **`/apply` 无扩展名路由**：本地 python server 返回 404，但生产环境 Cloudflare Workers Assets 自动 `.html` 回退，实测返回 **200**。正常。
- **空 email 导致插入失败**：SQLite `NOT NULL` 允许空字符串，实测插入成功。不会造成数据丢失。

---

## 内容与传播学评估

**优势（建议保持）**

1. **诚实分层**是最强资产。`SHIPPING TODAY` 与 `IN DESIGN · NOT YET SHIPPING` 的显式区隔，配合测试用例强制执行，在 AI 赛道的浮夸叙事中形成稀缺的可信度。
2. **证据优先于修辞**。Issue #48 → PR #193 的真实截图 + 可点击链接，比任何形容词都有说服力。
3. **敌人定义清晰**。"不是另一个聊天窗口或另一个看板"精准锚定了目标读者的既有痛点。

**可改进**

1. **首屏未回答"为什么是现在"**。THE SHIFT 章节的时代论证被放在第三屏，而它其实是说服链条的第一环。
2. **中文版信息密度略高于英文版**。部分段落（如 `.map-row > p`）中文更长，在窄视口下阅读负担更重。
3. **缺少「谁在用」的社会证明**。目前全部证据来自自身仓库，早期项目可考虑补充共建者数量或 star 曲线。

---

---

## 独立审查后的订正

本报告经独立审查后，两处结论被推翻，一处重大遗漏被补上。如实记录：

### 订正 1 · P0-3 根因判断错误

原报告称"`:not(:last-of-type)` 隐藏了 Docs 和 GitHub"。现象描述正确，**根因分析错误**。

真实情况：`styles.css:139` 的 `.site-header nav > a`（特异性 0,1,2）压过 `.nav-detail`（0,1,0），
**`.nav-detail` 在 header 中始终是死代码**。因此 430px 下唯一起作用的是 `:not(:last-of-type)`，
它砍掉了 5 个链接中的 Docs 和 GitHub。

基于错误前提的首次修复导致 nav 溢出到 482px（视口 390px）——用 hero 溢出换来了 header 溢出。
该修复已回滚。

**最终由上游 `de17f24` 以完整汉堡菜单解决**：900px 断点 + `aria-expanded` + Esc 关闭 +
点击外部关闭，并直接删除了 `.nav-detail` 与 `:not(:last-of-type)` 两条规则。方案优于本报告所提。

### 订正 2 · P1-2 修复方案会破坏测试，已撤销

原报告建议在 `<br>` 前加空格，并称"视觉零影响"。**该方案不可行**。

`tests/test_landing.py:51` 的解析器已用 `" ".join(text_chunks)` 补上分隔符，
现有断言 `"Turn GitHub Issues into reviewed software"` 正是靠此通过。加空格会产生双空格，
使两个断言失败（已实测确认）。

尝试改用 `<span class="line">` + `display:block` 亦无效：该方案能保持测试通过，
但 `textContent` 仍然粘连——`display:block` 只影响渲染，不插入文本节点分隔。

**当时的结论「两者直接冲突、需产品决策」同样是错的**——把一个 bug 挂成待决策项本身就是推卸。

真相：`PageParser` 的 `" ".join(text_chunks)` 等于在每两个文本节点之间凭空插空格，
连 `<strong>` 这类内联标签的边界也照插。它看到的从来就不是浏览器 `textContent`——
既掩盖了 `<br>` 的粘连，又在别处造出并不存在的词边界。不存在需求冲突，只有一个该修的 bug。

**已修复**（提交 `fc9a541`）：解析器改为按渲染语义处理空白（块级标签与 `<br>` 产生换行，
内联标签不产生），新增 `test_parser_reads_text_the_way_a_crawler_does` 锁定语义，
其中 `glued` 用例专门防止有人把 join 改回去。解析器修好后立刻暴露 16 处真实粘连，
在 `<br>` 前补换行符修复（HTML 空白渲染时折叠，视觉零影响）。
`test_display_headings_keep_word_boundaries_for_crawlers` 通过比对 textContent 视图与
渲染视图判定，不依赖词表，可覆盖将来新增的标题。

生产实测：中英各 8 个标题的 `textContent` 全部具备正确词边界，h1 断行与视觉高度不变。

### 订正 3 · P0-1 的字号收敛属非必要

原报告建议"移除 nowrap + 收字号"。实测证明**仅移除 `nowrap` 即已足够**：
grid track 回到 358.10px，320px 下亦正常。上游方案保留 47.59px 大字号，
视觉冲击力不减。本报告建议的 13% 字号缩减是无谓的设计成本。

### 遗漏 · `/api/apply` 无任何滥用防护（本报告最大疏漏）

`src/worker.js` 在原报告审查范围内，却未发现：该端点是**无鉴权 D1 写入口**，
且无字段长度上限、无 body 大小限制、无来源校验。任意脚本可写入超大行。
严重度高于原报告列出的多个 P1/P2 项。**已修复并实测验证。**

附带发现：`/stats` 的 502 原样回显 GitHub 响应体（含限流与 token scope 文本）。已修复。

---

## 实际执行结果

**已修复并部署（生产验证通过）**

| 项 | 验证证据 |
|---|---|
| P0-1 中文移动端破版 | grid track 404.75→358.10px；溢出 30→0（滚动区外） |
| P0-2 OG / Twitter / JSON-LD | 双语各 1 份无重复；OG 图 200；JSON-LD 三节点有效 |
| P0-3 移动端导航 | 上游汉堡菜单；双语 5 链接可达，nav 贴合 390px |
| P1-1 robots / sitemap / llms.txt | 线上均 200；robots 已替换 Cloudflare 空模板 |
| 安全 · /api/apply | 30KB→413；5000 字符→截断至 120/2000；非对象→400 |
| 安全 · /stats 泄露 | 502 仅返回 `upstream unavailable` |
| A11y · 对比度 | hint 3.56→6.18；`.stat small` 4.05→5.86 |
| apply 页死胡同 | 补 logo 返回导航 |
| apply 页 `--font-head` | 改用 `--display` |
| apply 页 noindex | 避免与首页竞争同类查询 |

测试：24 项全绿（上游 21 + 新增 3 项 worker 安全测试）。

**追加修复（提交 `27162a5`，部署版本 `325e6b45`）**

| 项 | 验证证据 |
|---|---|
| P1-3 英文页加载中文字体 | 英文页全文仅语言切换链接含「中文」二字，系统 CJK 字体覆盖；线上确认只剩 3 个拉丁字体家族，链接渲染正常。中文页保持不变（4 个字重均在用） |
| 死资源 3 个 SVG | 全仓库零引用，已删除 9KB；`where.svg` 线上一度返回 200，绕开 Cloudflare 边缘缓存后确认 404 |
| P1-2 标题粘连（提交 `fc9a541`，部署 `002e3912`） | 根因是测试解析器的空白语义 bug，见订正 2；修好后暴露 16 处真实粘连并一并修复，生产实测中英各 8 个标题词边界全部正确 |

**未处理（需产品决策）**

- apply 页整体重设计以对齐主站设计语言（蓝紫 vs 青绿，圆角 vs 直角）
- 内容结构调整（THE SHIFT 前置、补充社会证明）
- schema `email NOT NULL` 语义矛盾（已实测不会导致故障，收益低于 D1 迁移风险）
