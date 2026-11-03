# Issue #887 验收截图：博文署名与作者页

每篇博文标题下方显示作者（链接到作者页）和发布日期；作者页有简介、GitHub/X 链接和该语言的全部博文。

作者页地址在 Issue #964 改为 `/about/larry-orbi/`（作者名改为 `Larry 🍀 Orbi`），
本目录 8 张图随之重拍，文件名不变。

## 图

| 文件 | 页面 | 视口 |
|---|---|---|
| `post-en-1440.png` / `post-en-390.png` | `/blog/k8e-rejected-then-merged/` | 1440×900 / 390×844 |
| `post-zh-1440.png` / `post-zh-390.png` | `/zh/blog/k8e-rejected-then-merged/` | 1440×900 / 390×844 |
| `author-en-1440.png` / `author-en-390.png` | `/about/larry-orbi/` | 1440×900 / 390×844 |
| `author-zh-1440.png` / `author-zh-390.png` | `/zh/about/larry-orbi/` | 1440×900 / 390×844 |

图片来源：本 worktree 的构建产物 `public/`，用与 Worker 的 `fetchAsset()` 同样的
目录回退（`/path/` → `/path/index.html`）的本地 HTTP 服务，headless Chromium
（DPR 1）截首屏。**不是部署环境**；`beta.orbi.build` 的带界面验收由维护者补齐。

## 读数（同一 head，8 个组合全部）

| 页面 | 视口 | HTTP | 署名 | 署名 href | 标题下方 | 点名字落点 | 横向溢出 |
|---|---|---|---|---|---|---|---|
| post en | 1440 | 200 | Larry 🍀 Orbi · 2026-09-23 | /about/larry-orbi/ | 是 | /about/larry-orbi/ | 0 |
| post en | 390 | 200 | Larry 🍀 Orbi · 2026-09-23 | /about/larry-orbi/ | 是 | /about/larry-orbi/ | 0 |
| post zh | 1440 | 200 | Larry 🍀 Orbi · 2026-09-23 | /zh/about/larry-orbi/ | 是 | /zh/about/larry-orbi/ | 0 |
| post zh | 390 | 200 | Larry 🍀 Orbi · 2026-09-23 | /zh/about/larry-orbi/ | 是 | /zh/about/larry-orbi/ | 0 |

| 页面 | 视口 | HTTP | h1 | 简介 | GitHub / X | 列出的博文 | 横向溢出 |
|---|---|---|---|---|---|---|---|
| author en | 1440 | 200 | Larry 🍀 Orbi | Creator of Orbi… | 两个都在 | 33 | 0 |
| author en | 390 | 200 | Larry 🍀 Orbi | Creator of Orbi… | 两个都在 | 33 | 0 |
| author zh | 1440 | 200 | Larry 🍀 Orbi | Orbi 创始人… | 两个都在 | 33 | 0 |
| author zh | 390 | 200 | Larry 🍀 Orbi | Orbi 创始人… | 两个都在 | 33 | 0 |

同时断言：署名行 visibility 可见、`scrollWidth <= clientWidth`（没有被裁切）、
署名右边缘不超出视口；作者页 hero 与第一条博文条目同样不裁切。中英各 33 篇 =
该语言的博文数。点署名确实落在作者页（`clickLands`），落点那页的 h1 也是 `Larry 🍀 Orbi`。

四叶草本身单独量过：8 个组合里 `🍀` 的渲染宽度是 40px，而缺失字形画成方框时是 32px，
所以图里画的是真字形，不是豆腐块。

复现命令（`.orbi/evidence-887.mjs` 是 run 产物，不入库）：

```bash
# 沙箱里 Chromium 的系统库与字体都在仓库外，按这两个环境变量跑
LD_LIBRARY_PATH=/home/orbi-orbi-build--orbi-w-9a5184e1/pwlibs/usr/lib \
FONTCONFIG_FILE=$PWD/.orbi/fonts.conf \
node .orbi/evidence-887.mjs   # 打印上面这些读数并把 8 张图写进本目录
```

## 这些图能证明什么、不能证明什么

- 能：HTTP 200、署名与作者页的结构和文案、点击署名确实落在作者页、没有横向溢出、
  四叶草是真字形（按渲染宽度与缺失字形对比）。
- 不能：真实字体下的换行与观感。沙箱里没有系统字体，Chromium 用的是
  DejaVu Sans / Noto Sans CJK 兜底（站点自托管的 Familjen Grotesk、IBM Plex Mono
  照常生效，中文回退字体不是 PingFang SC / 微软雅黑），四叶草靠临时装进沙箱的
  Noto Color Emoji 才画得出来。**图里的中文断行、字宽结论只作参考**，最终观感请在 beta 上看。
- 控制台不是全绿：本地服务没有 Worker 的 `/cloud/e` 埋点路由，那个 POST 会 404；
  页脚一排第三方徽章在沙箱里也加载不到（外部域名不可达）。两者都不是本站页面代码的问题，
  线上由 Worker 和真实网络承担。
- 本 sandbox 的 agent 读不了图（当前模型不支持图像输入），所以"用眼睛看那张图"
  这一步留给维护者；上面的读数就是它在无视觉条件下能给出的替代证据。
