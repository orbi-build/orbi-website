# Issue #886 验收截图：/cost/ 首屏（n=169 / 中位 $0.082）

票面验收要求「构建产物 `/cost/` 和 `/zh/cost/` 的首屏包含 `$0.082` 和 `169`」
以及「`/cost/` 在 1440 和 390 宽度下各截一张图贴到 PR」。本目录的 4 张图取自
**这个 head 的构建产物** `public/`，用与 `src/worker.js` 相同的定价 token 替换
（`src/pricing.json`）后，本地 HTTP 服务 + headless Chromium（DPR 1）截**首屏**
（`fullPage: false`）。

**这不是部署环境的可视验收**：沙箱只有 headless Chromium（headless 只是门禁）。
`beta.orbi.build` 的带界面验收由维护者补齐。

## 图

| 文件 | 页面 | 视口 |
|---|---|---|
| `screenshots/cost-en-1440.png` | `/cost/` | 1440×900 |
| `screenshots/cost-en-390.png` | `/cost/` | 390×844 |
| `screenshots/cost-zh-1440.png` | `/zh/cost/` | 1440×900 |
| `screenshots/cost-zh-390.png` | `/zh/cost/` | 390×844 |

## 读数（同一 head，4 个组合全部）

| 页面 | 视口 | 首屏文案含 | hero 底 / 视口高 | 首屏内未替换 token | 表格溢出 | 横向溢出 | 控制台错误 |
|---|---|---|---|---|---|---|---|
| `/cost/` | 1440×900 | `$0.082`、`169`、`n=169` | 660 / 900 | 无 | 0（5 张表） | 0 | 0 |
| `/cost/` | 390×844 | 同上 | 683 / 844 | 无 | 0 | 0 | 0 |
| `/zh/cost/` | 1440×900 | `$0.082`、`169`、`n=169` | 562 / 900 | 无 | 0（5 张表） | 0 | 0 |
| `/zh/cost/` | 390×844 | 同上 | 574 / 844 | 无 | 0 | 0 | 0 |

- hero 底部四组都小于视口高度，即 `$0.082`、`169` 落在**首屏**内，不需要滚动。
- `$0.125` 的首次出现位置（`/cost/` 1440 为 y=5801，390 为 y=6949；
  `/zh/cost/` 1440 为 y=5385，390 为 y=5979）全部**晚于**「Earlier sample /
  早期样本」小节的顶部（5402 / 6506 / 5016 / 5616），即旧样本只出现在降级小节里。
- `document.fonts.status` 都是 `loaded`；无 404、无失败请求（`/cloud/e` 由本地
  服务按 Worker 的行为回 204，不进控制台错误）。

行剖面之外的判据见 `tests/homepage.smoke.mjs` 中 `assertCostPage` 的断言
（首屏含 `$0.082`/`169`、`$0.125` 必须晚于 earlier sample、中英 n 相同），
它在本 head 上以 `npm run test:browser` 通过。

## 这些图能证明什么、不能证明什么

- 能：文案与数字（首屏是 169 条样本、中位 `$0.082`）、结构（旧样本已降级到
  页面下方的小节）、几何（首屏装得下、无横向溢出、表格不溢出）。
- 不能：**这份 run 的模型读不了图片**，以上结论来自 DOM 读数与烟雾断言，不是
  人眼看图；真实字体下的观感、中文断行、以及带界面浏览器下的合成结果，
  由维护者在 `beta.orbi.build` 上补齐。

## 复现

```bash
npm run build
LD_LIBRARY_PATH=/tmp/syslibs/usr/lib FONTCONFIG_FILE=/tmp/orbi-856-fonts/fonts.conf \
  node .orbi/evidence-886.mjs          # 写 4 张图并打印上表读数（run 产物，不入库）
```

`.orbi/evidence-886.mjs` 是 run 产物，不入库；上面的读数是它的输出。
