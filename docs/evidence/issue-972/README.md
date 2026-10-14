# Issue #972 证据：/compare/codex/ 选择区与结尾的 Orbi Cloud 免费试用入口

改动只有这两页、每页两处，自托管入口原样保留：

| 页面 | 位置 | 新增 Cloud CTA | 保留的自托管入口 |
|---|---|---|---|
| `/compare/codex/` | 选择区 Orbi 卡片 | `data-cta="codex-choice-cloud"` → `/cloud/login`，`Try Orbi Cloud free →` | `https://docs.orbi.build`，`Self-host Orbi ↗`（`button-outline`） |
| `/compare/codex/` | 结尾 `cta-row` | `data-cta="codex-closing-cloud"` → `/cloud/login`，`Try Orbi Cloud free →` | `https://docs.orbi.build`，`Self-host Orbi ↗`（原 `button-dark`） |
| `/zh/compare/codex/` | 选择区 Orbi 卡片 | `data-cta="codex-choice-cloud"` → `/zh/cloud/login`，`免费试用 Orbi Cloud →` | `https://docs.orbi.build/zh`，`自托管 Orbi ↗` |
| `/zh/compare/codex/` | 结尾 `cta-row` | `data-cta="codex-closing-cloud"` → `/zh/cloud/login`，`免费试用 Orbi Cloud →` | `https://docs.orbi.build/zh`，`自托管 Orbi ↗` |

选择区新增说明：EN「Orbi Cloud runs this GitHub delivery workflow for you;
self-hosting keeps the runner on your own infrastructure.」/ ZH「Orbi Cloud
托管运行这套 GitHub 交付流程；自托管则把 Runner 留在你自己的基础设施上。」
标题、H1、meta description、alternatives 区块与 URL 未动；登录链接不带查询参数
（Issue #273）。所有按钮复用现有 `cta-row` 与 `button` 组件，没有新增 CSS。

## 读数（`npm run build` 产物 + headless Chromium）

| 页面 | 视口 | 横向溢出 | Cloud 按钮 | 自托管按钮 | Cloud 填充 | 字形像素 |
|---|---|---|---|---|---|---|
| /compare/codex/ | 1440×900 | 0 | 189×48，未被遮挡、未裁切 | 155×48 | `rgb(255,176,0)` = `--signal`，覆盖 87.5% | 845 |
| /compare/codex/ | 390×844 | 0 | 304×48（整行宽） | 304×48 | 同上，91.5% | 960 |
| /zh/compare/codex/ | 1440×900 | 0 | 197×48 | 137×48 | 同上，84.9% | 1076 |
| /zh/compare/codex/ | 390×844 | 0 | 304×48（整行宽） | 304×48 | 同上，89.5% | 1183 |

- 「未被遮挡」= `document.elementFromPoint`（按钮中心）命中按钮自身或其子节点；
  「未裁切」= 按钮 box 完全落在视口内；同行两个按钮的矩形不相交。
- 填充色与字形像素读的是按钮自己的截图：色值必须是设计系统 token，
  字形像素非零。DOM 里有、渲染成空白框的按钮会在这里红，`textContent` 断言不会。
- 结尾自托管按钮（`button-dark`）填充 `rgb(16,41,44)` = `--ink`，同样有字形像素。

## 键盘与遥测

- 从页首 Tab 到 `codex-choice-cloud` / `codex-closing-cloud`（最多 300 次，
  找不到即失败）后按 Enter：登录请求被本地 stub 拦截，路径是 `/cloud/login` /
  `/zh/cloud/login`，查询串为空，不触发真实 OAuth。四种组合各测两个 CTA。
- 同一批点击里 `POST /cloud/e` 被拦截，载荷 `kind=cta_click`、`detail` 等于
  对应的 `data-cta`、`path` 等于当前页面路径。
- 失败路径：把 `/cloud/e` 拦成 abort（模拟遥测端点不可用）后，Enter 依旧跳到
  `/cloud/login` / `/zh/cloud/login` —— 遥测非阻断。

## 门禁（沙箱内本地跑）

| 命令 | 结果 |
|---|---|
| `timeout 120 npm run build` | 104 页，exit 0 |
| `timeout 300 npm test` | 30 文件 568 用例通过 |
| `timeout 600 npm run test:ui` | 11 文件 91 用例通过（含本票新增的 `tests/compare-cloud-cta.test.js`） |
| `timeout 300 python3 -m unittest tests.test_landing -v` | 121 用例 OK |
| `timeout 300 npm run test:browser` | exit 0 |

契约测试：`tests/compare-codex-cloud-cta.test.js`（源码与产物两处都钉
href / 文案 / `data-cta` / 说明 / 保留的自托管地址 / 未改动的标题与 H1）。

## 复现命令

```bash
npm run build
LD_LIBRARY_PATH=/tmp/browser-libs/usr/lib FONTCONFIG_FILE=/tmp/orbi-856-fonts/fonts.conf \
  TMPDIR=$PWD/.orbi/tmp npx vitest run --project=browser tests/compare-cloud-cta.test.js
# 生成下面这些截图与读数（.orbi/evidence-972.mjs 是 run 产物，不入库）
LD_LIBRARY_PATH=/tmp/browser-libs/usr/lib FONTCONFIG_FILE=/tmp/orbi-856-fonts/fonts.conf \
  TMPDIR=$PWD/.orbi/tmp node .orbi/evidence-972.mjs
```

截图：`compare-codex-{en,zh}-{1440,390}.png` 整页，
`…-choice.png` / `…-closing.png` 是两处改动区域。

## 这些证据不能证明什么

- **没有用人眼看图。** 本次会话的模型不支持图片输入（`read` 一张 PNG 只返回
  「Current model does not support images」），所以上面的一切都来自几何读数与
  像素统计，不是「看截图确认结构、间距」。图已入库，**请维护者按 AGENTS 的
  验收节在 beta 用带界面的真实浏览器过一遍**（桌面/手机、中英文、键盘、同源登录跳转）。
- headless 是门禁不是验收：这里的中文回退字体是 `/tmp/orbi-856-fonts` 提供的
  Noto Sans CJK，不是访客机器上的 PingFang SC / 微软雅黑，**中文断行观感以
  真实浏览器为准**。按钮宽度那一列只说明没有溢出和裁切。
- 生产的晋升与 Environment approval 不在沙箱范围；`/cloud/login` 的真实同源
  302 跳转也由维护者在部署环境验证（本地是 stub 拦截）。
