# Issue #887 验收截图：博文署名与作者页

每篇博文标题下方显示作者（链接到作者页）和发布日期；作者页有简介、GitHub/X 链接和该语言的全部博文。

## 图

| 文件 | 页面 | 视口 |
|---|---|---|
| `post-en-1440.png` / `post-en-390.png` | `/blog/k8e-rejected-then-merged/` | 1440×900 / 390×844 |
| `post-zh-1440.png` / `post-zh-390.png` | `/zh/blog/k8e-rejected-then-merged/` | 1440×900 / 390×844 |
| `author-en-1440.png` / `author-en-390.png` | `/about/lawrence-liu/` | 1440×900 / 390×844 |
| `author-zh-1440.png` / `author-zh-390.png` | `/zh/about/lawrence-liu/` | 1440×900 / 390×844 |

图片来源：本 worktree 的构建产物 `public/`，用与 Worker 的 `fetchAsset()` 同样的
目录回退（`/path/` → `/path/index.html`）的本地 HTTP 服务，headless Chromium
（DPR 1）截首屏。**不是部署环境**；`beta.orbi.build` 的带界面验收由维护者补齐。

## 读数（同一 head，8 个组合全部）

| 页面 | 视口 | HTTP | 署名 | 署名 href | 标题下方 | 点名字落点 | 横向溢出 |
|---|---|---|---|---|---|---|---|
| post en | 1440 | 200 | Lawrence Liu · 2026-09-23 | /about/lawrence-liu/ | 是 | /about/lawrence-liu/ | 0 |
| post en | 390 | 200 | Lawrence Liu · 2026-09-23 | /about/lawrence-liu/ | 是 | /about/lawrence-liu/ | 0 |
| post zh | 1440 | 200 | Lawrence Liu · 2026-09-23 | /zh/about/lawrence-liu/ | 是 | /zh/about/lawrence-liu/ | 0 |
| post zh | 390 | 200 | Lawrence Liu · 2026-09-23 | /zh/about/lawrence-liu/ | 是 | /zh/about/lawrence-liu/ | 0 |

| 页面 | 视口 | HTTP | h1 | 简介 | GitHub / X | 列出的博文 | 横向溢出 |
|---|---|---|---|---|---|---|---|
| author en | 1440 | 200 | Lawrence Liu | Maintains Orbi… | 两个都在 | 15 | 0 |
| author en | 390 | 200 | Lawrence Liu | Maintains Orbi… | 两个都在 | 15 | 0 |
| author zh | 1440 | 200 | Lawrence Liu | 维护 Orbi… | 两个都在 | 15 | 0 |
| author zh | 390 | 200 | Lawrence Liu | 维护 Orbi… | 两个都在 | 15 | 0 |

同时断言：署名行 visibility 可见、`scrollWidth <= clientWidth`（没有被裁切）、
署名右边缘不超出视口；作者页 hero 与第一条博文条目同样不裁切；控制台没有错误、
没有第三方请求漏到网络。中英各 15 篇 = 该语言的博文数。

复现命令（`.orbi/evidence-887.mjs` 是 run 产物，不入库）：

```bash
node .orbi/evidence-887.mjs   # 打印上面这些读数并把 8 张图写进本目录
```

## 这些图能证明什么、不能证明什么

- 能：HTTP 200、署名与作者页的结构和文案、点击署名确实落在作者页、没有横向溢出。
- 不能：真实字体下的换行与观感。沙箱里没有系统字体，Chromium 用的是
  DejaVu Sans / WenQuanYi Zen Hei 兜底（站点自托管的 Familjen Grotesk、IBM Plex Mono
  照常生效，中文回退字体不是 PingFang SC / 微软雅黑）。**图里的中文断行、字宽
  结论只作参考**，最终观感请在 beta 上看。
- 本 sandbox 的 agent 读不了图（当前模型不支持图像输入），所以"用眼睛看那张图"
  这一步留给维护者；上面的读数就是它在无视觉条件下能给出的替代证据。
