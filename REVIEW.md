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

## 修复优先级

**立即修复（本次执行）**
1. P0-1 中文移动端破版
2. P0-2 OG / Twitter / JSON-LD
3. P0-3 移动端导航
4. P1-1 robots / sitemap / llms.txt
5. P1-2 标题空格
6. P1-3 字体加载
7. P2 中的确定项：`--font-head`、对比度、死资源、apply 页返回导航

**暂不处理（需产品决策）**
- apply 页整体重设计以对齐主站设计语言（范围较大，涉及视觉方向取舍）
- 内容结构调整（THE SHIFT 前置、社会证明补充）
- schema `email NOT NULL` 变更（需 D1 迁移，收益低于风险）
