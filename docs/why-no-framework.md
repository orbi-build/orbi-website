# 官网为什么不重构为框架

结论：**不重构**。`orbi.build` 官网继续用「静态 HTML + 构建脚本 + Cloudflare Worker」的
现有方案，不迁移到 Next.js / Astro / Hono 等框架。

这是 2026-09-13 的评估结论（website#139）。运营者提出重构设想时，答案应当在代码库里，
而不是散在关闭的票和聊天记录里——将来再有人提同样的设想，先读本文，再决定要不要重开讨论。

## 1. 提出的痛点与实际状况的对照

运营者 2026-09-13 提出的重构动因是三条：改 footer/header 不方便、改全局常量不方便、
改描述不方便。逐条对照实际状况：

| 提出的痛点 | 实际状况 |
|---|---|
| 改 footer/header 不方便 | 已是共享 partial：`site/partials/nav.html` + `site/partials/footer.html`，全站 nav/footer 各只有这一份；改一处，`npm run build` 重新生成后全站生效（`scripts/build-pages.mjs` 把片段渲染进每个页面） |
| 改全局常量不方便 | 机制已存在：价格走 `src/pricing.json` + `__CLOUD_MONTHLY_USD__` 占位符（website#102），页面上每个 `$79` 都来自它，改 JSON 一处即可 |
| 改描述不方便 | 属实。页面描述没有共享机制，27 个页面源各自带 meta description 和正文文案 |

三个痛点里两个是「有机制但没用起来」，不是「没有机制」。换框架不解决「没用起来」的问题。
额度数字就是现成的反例：它当初绕过 `pricing.json` 直接硬编码在页面里（"300M tokens" /
「3 亿 token」），才有了 website#137 的 2B/300M 矛盾；价格因为走了占位符，从未出过错。
先走已有的机制，比引入一套框架便宜得多。

## 2. 规模数据（2026-09-13 核实）

| 项 | 值 | 复核命令 |
|---|---|---|
| 页面数 | 27 | `find site/pages -name '*.html' \| wc -l` |
| HTML 总行数 | 5718 | `find site/pages -name '*.html' -exec cat {} + \| wc -l` |
| 构建脚本 | `scripts/build-pages.mjs`，456 行 | `wc -l scripts/build-pages.mjs` |
| 运行时依赖 | 1 个（`@datafast/ai-crawl`） | package.json `dependencies` |

统计口径：`site/pages/` 下的页面源，不含 `site/partials/` 的两个片段（共 45 行）。

为一个五千余行的静态站引入框架，意味着增加数百个依赖和一整套新的构建/部署管线；
换来的组件化与路由能力，现有方案已经用 456 行脚本 + 两个 partial 的形态提供了。

## 3. 现有方案的一个非显然优势

价格替换发生在 **Cloudflare Worker 运行时**（`src/worker.js` 的 `assetResponse()`，
website#102），不是构建时。构建产物 `public/*.html` 里携带的是 `__CLOUD_MONTHLY_USD__`
占位符，请求经过 Worker（`wrangler.toml` 的 `assets.run_worker_first = true`）时才替换成
实际价格。这带来两点：

- 爬虫不执行 JS 也能读到正确价格：meta / og / twitter / JSON-LD head 标签里带的同样是
  占位符，服务时已被替换成 `$79`，纯静态抓取即可拿到。
- 改价格只需改 `src/pricing.json` 并部署 Worker，`public/` 资产一个字节都不变——
  无需重新构建、重新上传全站。

静态导出型框架（Next.js `output: "export"`、Astro 全静态等）在构建时把价格烤进每个页面，
上面两点都会丢：改价必须全站重新构建部署，或者价格在某些 head 标签里缺席、彼此不一致。

## 4. 重新评估的触发条件

出现以下任一条件时，应当推翻本结论、重新评估框架化。条件都不满足时，维持不重构：

1. **出现真正需要组件状态的界面。** 判断标准：某个交互需要 ≥3 个相互联动的 UI 状态，
   或需要从 API 拉取数据后渲染列表，且 `<details>`/锚点/纯 CSS 表达不了、必须常驻一段
   有状态 JS 才能工作（如可筛选的对比器、多步表单、登录后仪表盘）。
2. **需要服务端个性化渲染。** 出现按访客（登录态、地域、A/B 实验）渲染大段不同 DOM 的
   页面，`assetResponse()` 式的字符串替换不再够用。
3. **页面规模增长一个数量级。** `site/pages/` 超过 100 个页面，或「新增/修改页面」本身
   成为被反复抱怨的实际负担——连续两个迭代内因此开出 ≥3 个 issue。

明确不构成触发条件的情况：改文案麻烦（走 partial 与 pricing.json 机制）、想用某个 UI
库（内联 `<script>` 即可）、觉得「专业网站都用框架」（规模数据不支持这个直觉）。
