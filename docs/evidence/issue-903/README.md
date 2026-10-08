# Issue #903 验收截图：中文首页 `/zh/` 首屏文案改顺

票面验收第 3 项要求「`/zh/` 在 1440 和 390 宽度下各截一张首屏图贴到 PR」。
本目录两张图取自**这个 head 的构建产物** `public/`，用一个目录回退与 Worker
`fetchAsset()` 相同的本地 HTTP 服务（`/path/` → `/path/index.html`），
headless Chromium（DPR 1）截**首屏**；`__FREE_DELIVERIES__` 按 `src/worker.js`
的方式用 `pricing.freeDeliveries` 在服务时替换，hero 数字卡取本地
`/stats` fixture。

**这不是部署环境的可视验收**：沙箱只有 headless Chromium（headless 只是门禁）。
`beta.orbi.build` 的带界面浏览器验收由维护者补齐（见根 AGENTS.md「验收用带界面的
浏览器打已部署的环境，headless 只是门禁」）。

## 图

| 文件 | 页面 | 视口 | 首屏内容 |
|---|---|---|---|
| `home-zh-1440.png` | `/zh/` | 1440×900 | H1 + 导语 + 「免费试用 Orbi Cloud →」+ 小字 |
| `home-zh-390.png` | `/zh/` | 390×844 | 同上（单列） |

## 改动前后（同一取景）

| 位置 | 改前 | 改后 |
|---|---|---|
| `.hero-lede` | 开源的 AI agent，把你的 GitHub Issue 一路做到发版。用 Orbi Cloud 跑，或者跑在你自己的机器上。 | 开源的 AI 编程 agent，接过 GitHub Issue，一直做到合并发版。可以交给 Orbi Cloud 托管，也可以部署在自己的机器上。 |
| `.hero-cta-note-first` | 免费 `3` 次，不用绑卡 | 前 `3` 次交付免费，不用绑卡 |
| `data-cta="hero-github"` | 或者从 GitHub 自己部署 | 源码在 GitHub |

按钮「免费试用 Orbi Cloud →」、`href="/zh/cloud/login"`、`data-cta="cloud-start"`
与 `hero-github` 的 href 均未变；英文首页 `public/index.html` 未改动。

## 读数（同一 head，两个视口）

| 视口 | HTTP | 导语行数（range 行盒 / 像素墨迹带） | 按钮文字行数 | 小字（渲染后） | 小字墨迹带 | 横向溢出 |
|---|---|---|---|---|---|---|
| 1440×900 | 200 | 2 / 2 | 1 | `前 3 次交付免费，不用绑卡 · 源码在 GitHub` | 1 | 0 |
| 390×844 | 200 | 3 / 3 | 1 | 同上 | 2 | 0 |

- 行数不是 `textContent` 断言，而是**像素行带**：把 `.hero-lede` 的截图区域画到
  canvas 上，逐行统计墨迹（与背景色差 > 90 的像素），相邻墨迹行合并成带。
  与 `Range.getClientRects().length` 的读数一致 —— 导语桌面 2 行、手机 3 行，
  与票面「桌面上导语两行，手机上三行」的样稿一致。
- 小字在 1440 是 1 带、在 390 是 2 带：`@media (max-width: 760px)` 把首段与
  「源码在 GitHub」各置一块、隐藏分隔点，这是 #704 起的既有样式，本次未改。
- 无横向溢出（`scrollWidth - innerWidth = 0`），导语/小字无裁切。
- 控制台唯一报错是本地 `127.0.0.1` 源下 `cloudflareinsights.com/cdn-cgi/rum`
  的 CORS 拦截 —— 第三方统计脚本在本地跑的常态，不是页面错误
  （首页 smoke 另有第三方请求守卫）。
- 沙箱里 `LD_LIBRARY_PATH=/tmp/browser-libs/usr/lib` +
  `FONTCONFIG_FILE=.orbi/fonts.conf` 提供 Chromium 依赖与字体；中文回退到
  WenQuanYi Zen Hei（`fc-match -s "sans-serif:lang=zh-cn"`），不是豆腐块，
  但也不是实际访客的 PingFang SC / 微软雅黑 —— **中文断行的观感结论仍以维护者
  在真实浏览器里的验收为准**。

## 与票面的一处口径（未私自选边）

票面验收第 1 项写「构建产物 `/zh/` 首屏的这三处文案 … `__FREE_DELIVERIES__`
已经替换成数字」。构建产物 `public/zh/index.html` **按设计保留 token**
（`src/worker.js` 在服务时替换，Issue #102），访客读到的页面是 `3`。
所以这一项按**渲染后的页面**验收（上表小字列），并由
`tests/homepage.smoke.mjs` 断言渲染后的整条小字；beta 部署工作流里的
`BASE_URL=https://beta.orbi.build npm run test:browser` 会对真实部署环境再断言一次。

复现命令（`.orbi/evidence-903.mjs` 是 run 产物，不入库）：

```bash
npm run build
LD_LIBRARY_PATH=/tmp/browser-libs/usr/lib FONTCONFIG_FILE=.orbi/fonts.conf \
  node .orbi/evidence-903.mjs   # 写两张图并打印上面的读数
```
