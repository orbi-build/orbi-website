# Issue #899 验收截图：首页首屏（导语 / Orbi Cloud 按钮 / 小字自托管文字链）

票面验收第 4 项要求「中英首页在 1440 和 390 宽度下各截一张首屏图贴到 PR」。
本目录的 4 张图取自**这个 head 的构建产物** `public/`，用与 Worker 的
`fetchAsset()` 相同的目录回退（`/path/` → `/path/index.html`）的本地 HTTP
服务，headless Chromium（DPR 1）截**首屏**；`__FREE_DELIVERIES__` 按
`src/worker.js:569` 的方式用 `pricing.freeDeliveries` 替换，hero proof bar
的数字取 `beta.orbi.build/stats` 的真实响应。

**这不是部署环境的可视验收**：沙箱只有 headless Chromium（headless 只是门禁）。
`beta.orbi.build` 的带界面验收由维护者补齐。

## 图

| 文件 | 页面 | 视口 |
|---|---|---|
| `home-en-1440.png` / `home-en-390.png` | `/` | 1440×900 / 390×844 |
| `home-zh-1440.png` / `home-zh-390.png` | `/zh/` | 1440×900 / 390×844 |

## 读数（同一 head，4 个组合全部）

| 页面 | 视口 | HTTP | 导语 | 导语行数 | 按钮文字 | 按钮文字行数 | 小字（渲染后） | 小字行数 | `.hero-copy` 底 / 视口高 | 横向溢出 |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 1440×900 | 200 | An open-source AI agent … your own machine. | 2 | Try Orbi Cloud free → | 1 | 3 deliveries free, no credit card · or self-host it from GitHub | 1 | 631 / 900 | 0 |
| `/` | 390×844 | 200 | 同上 | 3 | Try Orbi Cloud free → | 1 | 同上 | 2 | 388 / 844 | 0 |
| `/zh/` | 1440×900 | 200 | 开源的 AI agent … 跑在你自己的机器上。 | 2 | 免费试用 Orbi Cloud → | 1 | 免费 3 次，不用绑卡 · 或者从 GitHub 自己部署 | 1 | 625 / 900 | 0 |
| `/zh/` | 390×844 | 200 | 同上 | 2 | 免费试用 Orbi Cloud → | 1 | 同上 | 2 | 363 / 844 | 0 |

- 行数不是 `textContent` 断言，而是**像素行带**：截图区域内逐行统计墨迹
  （与背景色差 > 90 的像素），相邻墨迹行合并成带。EN 导语桌面 2 带 / 手机 3 带，
  按钮文字在所有宽度都是 1 带（标签带高 19–20px，是一条），小字在 1440 是
  1 带、在 390 是 2 带（`@media (max-width: 760px)` 把首段与末段各置一块，分隔点
  隐藏，这是 #704 起的既有样式，未改动）。
- 按钮文字在 390 不折行：标签带 `x 81→276`（EN）、`76→280`（ZH），宽 358 的按钮内
  一条横向带，无第二带；`tests/homepage.smoke.mjs` 在 390/360 用
  `Range.getClientRects().length` 断言 1 行。
- `hero-github`：`href=https://github.com/orbi-build/orbi`、`data-cta=hero-github`、
  `cursor: pointer`、`text-decoration: underline`（浏览器默认下划线，行剖面里
  文字带下方 y=15 有一条贯穿全宽 0→160 的实线）、颜色 `rgb(145,170,164)` 与
  小字同色。点击已被全局 `[data-cta]` 监听上报为 `cta_click`，
  `hero-github` 通过 `src/worker.js:76` 的 `ENGAGEMENT_DETAIL` 校验。
- 「Orbi only sees the repos you pick」「只授权你选的仓库」：四个组合的 hero 里
  都不出现（`/cloud/` 页保持原样）。
- 无横向溢出（`scrollWidth - clientWidth = 0` on 导语/按钮/小字），无裁切。
- 控制台只有 `cloudflareinsights.com/cdn-cgi/rum` 的 CORS 报错 —— 本地
  `127.0.0.1` 源下第三方统计脚本被拦，是本地跑的常态，不是页面错误
  （`tests/homepage.smoke.mjs` 另有第三方请求守卫）。

## 这些图能证明什么、不能证明什么

- 能：文案、结构、几何（行数、按钮是否折行、首屏是否装得下）、链接的 href 与
  可点击外观、被删掉的那句确实不在首屏。
- 不能：真实字体下的观感与中文断行。沙箱没有系统中文字体，Chromium 走
  FreeType 兜底（站点自托管的 Familjen Grotesk / IBM Plex Mono 照常生效，
  中文回退不是 PingFang SC / 微软雅黑），**中文断行结论只作参考**。

复现命令（`.orbi/evidence-899.mjs`、`.orbi/ink-899.mjs` 是 run 产物，不入库）：

```bash
npm run build
LD_LIBRARY_PATH=/tmp/browser-libs/usr/lib FONTCONFIG_FILE=.orbi/fonts.conf \
  node .orbi/evidence-899.mjs   # 写 4 张图并打印上面这些读数
```

## 与票面的一处出入（已按下述方式核对，未私自选边）

票面验收第 1 项写「构建产物里 … `__FREE_DELIVERIES__` 已经替换成数字」，
而票面文案又要求「继续用现有的 token，不要写死成 3」。两者不可能同时成立：
构建产物 `public/*.html` **按设计保留 token**（`src/worker.js:569` 在服务时替换，
Issue #102），访客读到的页面显示 `3`。所以验收看的是**渲染后的页面**，
由 `tests/homepage.smoke.mjs` 断言，并在 beta 部署工作流里以
`BASE_URL=https://beta.orbi.build npm run test:browser` 对真实部署环境再断言一次。
