# Issue #907 验收截图：`/compare/github-copilot-coding-agent/` 补 GitHub Copilot alternatives 一节

票面验收最后一项要求「页面在 1440 和 390 宽度下各截一张图贴到 PR」。交付的 head
（`898ec2f1`）没有把截图贴到 PR #910，评审第 1 轮补齐：图取自**评审 head 的构建产物**
`public/`（`npm run build`，与 `tests/pages.test.js` 比对的同一份字节），
用一个目录回退与 Worker `fetchAsset()` 相同的本地 HTTP 服务
（`/path/` → `/path/index.html`），headless Chromium（DPR 1，视口 1440×900 / 390×844），
第三方请求按 `tests/browser-network.mjs` 的守卫在浏览器内拦截。

**这不是部署环境的可视验收**：沙箱只有 headless Chromium（headless 只是门禁），
本模型也无法直接读图。`beta.orbi.build` 的带界面浏览器验收由维护者补齐
（见根 AGENTS.md「验收必须用浏览器看页面」「验收用带界面的浏览器打已部署的环境」）。

## 图

| 文件 | 页面 | 视口 | 内容 |
|---|---|---|---|
| `compare-github-copilot-coding-agent-en-1440.png` | `/compare/github-copilot-coding-agent/` | 1440×900 | 整页 |
| `compare-github-copilot-coding-agent-en-390.png` | 同上 | 390×844 | 整页 |
| `compare-github-copilot-coding-agent-en-1440-section.png` | 同上 | 1440×900 | `#github-copilot-alternatives` 一节 |
| `compare-github-copilot-coding-agent-en-390-section.png` | 同上 | 390×844 | 同一节（单列） |
| `compare-index-en-1440-copilot-row.png` | `/compare/` | 1440×900 | 新增链接所在的 Copilot 那一行 |
| `compare-index-en-390-copilot-row.png` | `/compare/` | 390×844 | 同一行（stack 版式） |

## 读数（同一 head，两个视口）

| 读数 | 1440 | 390 |
|---|---|---|
| `<title>` | `GitHub Copilot alternatives: Orbi vs Copilot cloud agent`（56 字符） | 同左 |
| `<h1>` | `Orbi vs GitHub Copilot cloud agent`（未变） | 同左 |
| 小节 `<h2 id="github-copilot-alternatives">` | 可见，文字 `GitHub Copilot alternatives` | 可见，同左 |
| 表格行 / 工具 | 4 行：Cursor、Windsurf (now Devin Desktop)、Cline、Tabnine | 同左 |
| 小节内链接 | 4 条竞品来源 + `/compare/claude-code/`、`/compare/codex/`、`/compare/openhands/` + PR #880 + `/evidence/` | 同左 |
| Sources 条目 | 7 条（原有 3 + 新增 4，均带核实日期） | 同左 |
| 表格单元格裁切（`scrollHeight - clientHeight > 1`） | 0 个 | 0 个 |
| 表格单元格横向裁切 | 0 个 | 0 个 |
| 文档横向溢出 | 0 | 0 |
| 小节高度 | 1267px | 2072px |

- `/compare/` 行头链接：`a[href="/compare/github-copilot-coding-agent/#github-copilot-alternatives"]`
  在该页恰好 1 条，文字 `GitHub Copilot alternatives`；点它跳转后
  `location.hash` 为该锚点，`<h2>` 落在视口顶部（`getBoundingClientRect().top ≈ 0`，
  导航不是 fixed/sticky，不会被遮住）。
- 非空白判据（拿不到人眼读图时的替代）：6 张图都能解码，画布按**主色**为底的墨迹覆盖率
  为 5.1%–13.1%（整页 1440 = 10.9%、390 = 13.1%；小节 1440 = 5.1%、390 = 9.7%；
  `/compare/` 行 1440 = 8.6%、390 = 6.3%），与文字页一致，不是空白页。
- 页面/控制台错误：无。唯一 404 是本地静态服务答不了的 Worker 路由 `/cloud/e`（两视口各一次），
  与本次改动无关。
- 字体：`FONTCONFIG_PATH=/tmp/orbi-856-fonts`，英文回退字体不是访客的字体，
  断行观感仍以维护者在真实浏览器里的验收为准。

## 复现

`.orbi/evidence-907.mjs` 与 `.orbi/inkcheck2.mjs` 是 run 产物，不入库。

```bash
npm run build
LD_LIBRARY_PATH=/tmp/syslibs/usr/lib FONTCONFIG_PATH=/tmp/orbi-856-fonts \
  node .orbi/evidence-907.mjs      # 写 6 张图并打印上面的读数
LD_LIBRARY_PATH=/tmp/syslibs/usr/lib FONTCONFIG_PATH=/tmp/orbi-856-fonts \
  node .orbi/inkcheck2.mjs         # 打印每张图的尺寸与墨迹覆盖率
```
