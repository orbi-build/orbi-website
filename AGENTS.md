# AGENTS.md

Development contract for `orbi-build/orbi-website` — the orbi.build landing site
(Cloudflare Worker + Workers Assets, not Pages; not the docs site, which lives at
`docs.orbi.build`). This file is self-contained: every rule an agent must obey to
deliver a change here is stated below, not referenced away.

**Documentation is not the source of truth — and neither is the code.** This file,
the README and everything under `docs/` describe what the code is meant to do; the
code, and the deployed behavior it produces, describe only what it currently does,
which may itself be the bug. Treating either one as automatically correct turns a
defect into a specification.

So when a document and the code disagree, the required action is to **raise it**,
not to pick a side: say which document, which file and line, what the code actually
does, and what the document claims — in the Issue or PR, or as its own Issue.
A human decides which side is wrong. Never silently follow one and leave the
contradiction in place for the next delivery to rediscover.

## 公开仓库：不写经营数据

本仓库公开可见。Issue、PR、commit 和页面中不得写入以下经营或内部信息：

- 订阅数与营收；
- 租户与客户名单（公开证据页已展示且获同意的除外）；
- 访客与漏斗数据；
- 生产库表结构与内部主机地址；
- 机器人判定规则（ASN、UA 列表）。

需要公开记录判断时，只记录结论，不记录上述数据的具体值。

## No Issue in hand? File one — do not edit

**This repository is delivered by Orbi.** Changes come from a ticket that a
delivery agent executes. They do not come from whoever happens to walk in.

Check this before you touch anything:

| What you have | What to do |
|---|---|
| An Issue assigned to you | Deliver it; carry on to `Read first` |
| "X looks bad" / "X is broken" / "change X" from a person | **File an Issue, then stop** |
| A problem you spotted yourself | **Ask the maintainer first** — file only after they agree (exception below) |

**New Issues need the maintainer's approval, in every orbi-build repository.**
Before filing, send the maintainer the repository, the problem and the smallest
fix, and wait for a yes. The only exception is a bug you reproduced yourself
while testing and are 100% sure of: file it, then tell the maintainer. Never
file "preventive" tickets for incidents that might recur or for theoretical
risks (new probes, gates, self-healing layers, retry budgets, dashboards). One
maintainer with no paying users: fix what a user actually hit, the smallest way.

**Growth is one test for how a feature behaves.** Prefer the option that gets a new user to a first result fastest, with no dead ends.

The test is **whether this repo is on Orbi**, not how small the change is or
whether you know how to make it. Being able to make it is not a reason to.

**"It's only a doc" is the hole to close.** What you may edit directly is plain
prose only: `.md` files, the README, this file, ticket bodies and comments.
**Everything else is a ticket**, including:

- HTML, CSS and templates (`site/partials/*.html`, `public/styles.css`) — that is code
- The copy table and i18n strings in `scripts/build-pages.mjs` — that is code
- Build scripts, CI config, tests — that is code
- "It's one line of CSS", "just layout", "while I'm here" — still code

**What the person filing should bring**: measurements. Rendered dimensions,
`getBoundingClientRect()` readings, the root cause down to a file and line, a
script that reproduces it. That saves the delivery agent from measuring it
again and gives the acceptance criteria something to check against. How to
write the ticket itself: see "开票的人：票面只能写沙箱里拿得到的东西" below.

**Once it is filed, stop.** After `ai-ready` goes on, that ticket belongs to the
delivery agent. Pushing your own fix leaves it with a base that has nothing left
to change, and the delivery ends with
`the agent delivered no commit on the task branch` — the ticket reads as failed
when the work was simply done by the wrong party.

## Read first

- Read the GitHub Issue (body and comments) first. Then, in priority order: this
  file, the files you will change plus their callers, and the related tests.
- `README.md`, build files and history are read only when the task is actually
  about them. A normal Issue never requires a full repository scan.

## Pages are built, not hand-edited

`public/` is half generated and half hand-written. Knowing which half a file
belongs to decides where you edit it.

**Generated (never edit in `public/`):** every `*.html` under `public/`.
`npm run build` (`node scripts/build-pages.mjs`) writes them from:

- `site/pages/**/index.html` — one source per page: a `<!--orbi:page ... -->` JSON
  header (`lang`, `mirror`, `output`, `layout`, nav params, `standalone`) followed
  by the page body with `<!--@nav-->` and `<!--@footer-->` markers.
- `content/blog/<slug>.md` (+ `content/blog/zh/<slug>.md`) — one Markdown file
  per blog post (Issue #212): YAML front matter (`title`, `date`, `summary`,
  `lang`, `author`, `image`, all six required; optional `mirror`; posts with a
  video provide all six `video_*` fields) plus a CommonMark body. Blog bodies
  may use only `<figure>`, `<figcaption>`, `<img>` (with a non-empty
  `alt`) and responsive `<iframe>` media tags; other raw HTML, JSON headers and
  nav/footer markers are forbidden. The build renders the body with marked into
  `site/partials/post.html` (the shared nav/footer included), derives the `/blog/`
  and `/zh/blog/` indexes from the post list,
  and writes `/blog/feed.xml` (RSS 2.0, English posts). Pairing (Issue #214):
  a `mirror: <slug>` field names the post's counterpart in the other language
  directory; without it, a same-slug file there pairs by default; with
  neither, the post publishes single-language and its language switcher
  points at the other language's blog index. A post missing a front-matter
  field, a `mirror:` naming a file that does not exist, or a `mirror:` the
  named file does not name back, fails the build naming both files.
- `site/partials/nav.html`, `site/partials/footer.html` and
  `site/partials/post.html` — the shared navigation, footer and post template,
  rendered into every page that needs them.
- `site/llms.txt` — the hand-written llms.txt prose (every section except its
  Blog post list). The build replaces the `<!--@llms-blog-->` marker with the
  Blog section's post list, generated from `content/blog/**` one entry per
  post per language, newest first (Issue #215). A source without the marker
  fails the build.

The build also writes `sitemap.xml`, `blog/feed.xml` and `llms.txt` into
`public/`; all are generated files like the HTML, never hand-edited.

**Hand-written (edit directly in `public/`):** `styles.css`, `demo.js`,
`install.sh`, `robots.txt`, `favicon.svg`, `logo-mark.svg`,
`logo-mark-on-dark.svg`, and everything under `public/img/`.
These are outside the build and have no source under `site/`.

Editing a generated page in `public/` fails three ways: the next build overwrites
it; `tests/pages.test.js` compares the build output against `public/` byte-for-byte
and goes red; and a hand-edited nav or footer silently drifts one page away from
every other page. Always edit the source under `site/`, then run `npm run build` and
commit the regenerated `public/` output together with the source change.

`scripts/build-pages.mjs --out <dir>` renders to any directory, which is how you
inspect output without touching `public/`.

## UI 改动

改页面样式、布局或组件前，先读 [orbi-build/orbi-design-system README](https://raw.githubusercontent.com/orbi-build/orbi-design-system/main/README.md)，再读要改的组件 `components/<Name>/README.md`。

- 颜色、间距、圆角和字体必须取自设计系统的 [`tokens.json`](https://raw.githubusercontent.com/orbi-build/orbi-design-system/main/tokens.json)；官网夜间区块使用 `dark` 主题，纸色区块使用 `paper*` 系列 token。不自创颜色、圆角或组件样式。
- 设计系统缺少所需内容时，先在 [`orbi-build/orbi-design-system`](https://github.com/orbi-build/orbi-design-system) 补齐，再在本仓使用。
- 如果设计系统与现有页面不一致，保持现有页面行为，并在 PR 说明中写出差异。
- 不要把设计系统文件复制进本仓。

## Build gates

`npm test` (vitest) is the gate; run it before every delivery. What it pins:

- `tests/pages.test.js` — the build output equals the committed `public/` exactly
  (same file set, byte-for-byte); no page ships with an unfilled `<!--@nav-->`,
  `<!--@footer-->` or `{{SLOT}}` marker; every EN page has a mutual ZH mirror
  under `zh/` and vice versa; nav, footer and CTA link counts stay equal across
  each mirror pair.
- `tests/pricing.test.js` — `src/pricing.json` `includedTokens` is pinned
  absolutely, so a wrong quota cannot ship silently.
- `tests/worker.test.js`, `tests/llms.test.js`, `tests/homepage.smoke.test.js` —
  Worker routing, `llms.txt`, and the homepage contract.

A ZH page is not optional: adding an EN page without its `zh/` mirror fails the
mirror gate. Add both, and keep nav/footer/CTA counts identical between them.

## Cloud API boundary

Internal CTAs to the Cloud login handoff do not carry `ref`; preserve channel attribution already held by the visitor.

Before changing a website-to-Cloud handoff, read
[docs/cloud-endpoints.md](docs/cloud-endpoints.md). It records **beta only**, and it
is a log of external facts as measured on a given date, not a standing guarantee:
re-verify against the live endpoints before relying on a value, and when the two
disagree, raise it — the live behavior may have moved, or the document may have
been wrong to begin with.

- `beta.orbi.build` is shared with the cloud control-plane Worker, which owns
  `/api*`, `/auth*`, `/login*`, `/app*`, `/connect*`, `/checkout*`, `/stripe*`.
  A website route defined under any of those prefixes never runs — cloud
  intercepts it. The website owns no path under `/api/`.
- Website endpoints live outside those prefixes: `POST /cloud/apply` (writes to
  the website's own D1) and `GET /cloud/login` (302 to `CLOUD_LOGIN_URL`).
- Never guess, create, or replace a Cloud hostname — not from a repository name,
  an environment name, or a hostname pattern. If the document carries no verified
  value for what you need, stop and report the blocker. Update the document only
  after a real endpoint check establishes the new value.

## Continuous deployment: no versions, no releases, no milestones

This repository ships continuously — that is the delivery model, not an
omission. There is no version number to bump, no tagged release, and **no
milestone to assign**.

- `package.json` carries `1.0.0` and stays there. It is not a version anyone
  reads; nothing derives from it.
- The repository has never cut a GitHub release and will not.
- The runner config for this repo (`zcode-website`) has **no
  `active_milestone`**, so the claim scans ignore milestones entirely: an
  Issue with `ai-ready` is claimable whether or not it carries one.
- The `v0.5.1` milestone that exists is a leftover default bucket holding
  30 closed Issues spanning the whole history of the repo. It marks nothing.
  Do not add Issues to it, and do not read its name as "the version we are
  working toward" — there is no such thing here.

What replaces a release here is the promotion below: `beta` is live for
anyone to look at, and a human merges `beta → main` when a change should
reach production. That merge is the only "shipping" event, and it is not a
version.

The `orbi-build/orbi` repository works differently — it versions,
releases, and gates claims on `active_milestone`. Do not carry those
habits over.

## Branch flow and deployment

`beta` is the development and default branch (serves `beta.orbi.build`); `main` is
the production promotion branch (serves `orbi.build` / `www.orbi.build`). The two
are permanently diverged — every promotion is a true merge, never a fast-forward.

- Merging into `beta` runs `.github/workflows/deploy-beta.yml`: `npm test` plus the
  landing/deployment contract tests, then the beta deploy, then checks of the
  homepage, `/compare/` and the EN/ZH OpenClaw pages. Beta uses its own D1
  (`orbi-applications-test`) and never writes the production database.
- Production deployment is a manual `workflow_dispatch` of
  `.github/workflows/deploy-production.yml`; merging into `main` does not
  trigger it (Issue #210). The workflow runs required-reviewer approval on the
  `production` GitHub Environment, the full test
  set, `wrangler deploy`, then an HTTP content smoke (the real-browser smoke was
  removed from this workflow on 2026-09-10). A smoke failure triggers an
  automatic `wrangler rollback` to the previous production version and reds the
  job.
- D1 migrations are not in the deploy path; a production schema change is an
  explicit manual step.
- Local deploys load credentials from `~/.cloudflare.env`, never from the repo:
  `set -a; source ~/.cloudflare.env; set +a` then `npx wrangler dev` /
  `npx wrangler deploy [--env beta]`. Never commit or print a Cloudflare token.

## Promotion to production (beta → main)

Promote a fixed, already-deployed beta snapshot; never open the production PR
from the moving `beta` head. Create a branch at the exact beta commit that is to
ship (for example `promote/<date>`), then open one PR from that snapshot branch
to `main` and merge it with GitHub's **Create a merge commit** (`--no-ff`). The
PR never auto-merges: a human picks the merge moment.

```
git switch -c promote/<date> <deployed-beta-sha>
gh pr create --repo orbi-build/orbi-website --base main --head promote/<date> \
  --title "晋升 beta 快照到 main：<一句话概括>" --body-file <evidence body>
```

Before opening the PR:

- **Merge preflight**, no working-tree change:
  `git fetch origin && git merge-tree --write-tree --name-only origin/main promote/<date>`.
  Conflicts are listed under the tree hash; fix them on the snapshot branch first.
- **Drill the anti-drift gate.** A gate that has never been seen red is not
  evidence of anything (Issue #151: the pricing gate existed only on `beta` while
  `main` shipped stale copy). On the branch about to be promoted:
  `sed -i 's/"includedTokens": 300000000/"includedTokens": 2000000000/' src/pricing.json`,
  then `timeout 300 npx vitest run tests/pricing.test.js` **must fail (exit 1)**,
  then `git checkout -- src/pricing.json`.

The full runbook, including the post-deploy acceptance greps, is
[docs/promotion.md](docs/promotion.md).

## Development

- TDD: write a failing test first, then the smallest implementation, then refactor.
- Implement the smallest complete change the Issue's acceptance criteria require —
  no speculative feature, no no-benefit abstraction, no extra framework layer, no
  fallback, no scope expansion. 如无必要勿增实体.
- The no-framework decision (no Next.js, no Hono) stands; the evaluation, the size
  data and the conditions that would reopen it are in
  [docs/why-no-framework.md](docs/why-no-framework.md) (website#139). Do not
  introduce a framework as part of an unrelated Issue.
- Wrap any blocking shell command (tests, builds, network waits, browser runs) in
  `timeout <seconds> ...`; a timeout is the signal that the path needs a fix, never
  ignorable noise.
- Never pipe a test, build or smoke command through `tail`, `head`, `grep` or any
  other filter: a pipeline exits with the last command's status, so the real
  failure is lost. Redirect to a file and keep the exit code.
- Fail fast with the concrete command, exit code, stdout and stderr; never swallow
  an error or add a silent fallback.
- UI work drives a running site in a browser: real interaction, an assert on the
  changed flow, console and network error checks, and a screenshot. Headless in the
  sandbox is a **gate** (it proves nothing broke), **not the acceptance verdict** —
  see "验收必须用浏览器看页面" below.
- Preserve unrelated user changes; commit only task-owned paths.

## 验收必须用浏览器看页面，不是查字符串

新功能和回归验证都一样：**打开真实页面，截图，然后用眼睛看那张图**。

grep 页面 HTML 里有没有某个 href、某个 class、某个文案，**不算验证**。这类检查
对以下情况永远是绿的：

- 元素在，但渲染成了空白框 / 溢出 / 被遮住
- 链接对，但指向的资源是过期的旧版本
- 文案对，但在手机宽度下被挤断或截断

实测过的翻车（2026-09-21）：`/cloud/` 的 `cloud-onboarding.mp4` 用 grep 查
`src=` 完全正确，截图一看是**过期的六步版**（1:06，片头写 Six steps），
而现行母片是 83 秒的七步版。字符串检查没有任何一条会红。

所以：

- 每个改动的页面，桌面 1440 与手机 390 各截一张，**中英文都要**
- 截完必须读那张图，确认结构、间距、有没有空白块或截断
- 涉及媒体资源（视频、图片、字体）时，确认**内容**是对的版本，不只是路径对

### 图片验收：`naturalWidth !== 0` 什么都证明不了

它只证明文件能解码。糊的、变形的、带着视频角标的图，它照样绿。
**每张图四条都要过：**

| 查什么 | 怎么查 | 通过线 |
|---|---|---|
| 清晰度 | `naturalWidth >= rect.width * devicePixelRatio` | 倍率 ≥ 1.0 |
| 变形 | 原图宽高比 vs 显示宽高比 | 相差 < 0.02 |
| 同组统一 | 同组各图原图比例两两比较 | 全部相等 |
| **图里是什么** | **下载原图，Read 它，看** | 无视频角标 / 水印 / 黑边 / 错内容 |

最后一条没有自动判据。跳过它等于没验收这张图（翻车实例见 #356）。
- 改了布局的 PR，对照改动前的截图看
- 截图里任何「看起来怪」的地方先当缺陷查清；不许写「可能是截图截断」翻篇

`npm test` 与浏览器 smoke 是门禁，不是验收。它们证明没坏，不证明做对了。

### 验收用带界面的浏览器打已部署的环境，headless 只是门禁

**这一节约束 e2e 验收方，不是沙箱里的交付方。** 交付方的门禁是 CI + headless。
**不要把本节要求抄进票面的交付方验收项**，沙箱做不到；那部分写「由维护者补齐」。

| | 跑什么 | 证明什么 |
|---|---|---|
| **门禁**（交付方在沙箱里做） | headless Playwright、本地 build 产物 | 没坏、断言成立、能红 |
| **验收**（谁最终放行谁做） | **带界面的浏览器 + 已部署的环境 URL** | 用户看到的确实是对的 |

**打哪个环境由改动所处阶段决定，不是默认生产：**

| 阶段 | 验收目标 |
|---|---|
| 合并到 `beta` 之后 | `beta.orbi.build`（**绝大多数情况是这个**） |
| 晋升到 `main` / 生产发布之后 | `orbi.build` |

验收 beta 的改动却跑去打生产，测到的是上一个版本，等于没测。
生产上默认零操作，没有明确要求不要往生产点。

**headless 跑绿 ≠ 验收通过**，它与用户的浏览器在这些地方不同：

- **字体**：headless 用容器里装了什么就用什么。中文回退字体一换字宽就变，
  「标题断几行」「列宽够不够」这类结论直接失真。
- **编解码**：headless Chromium 默认不带 H.264/AAC 等专有编解码，视频相关行为测不准。
- **autoplay 策略**：Chrome 看 Media Engagement Index；真实浏览器有历史，headless
  每次都是零 engagement 的全新 profile，同一段代码两边结论可能相反。
- **登录态**：需要会话的页面 headless 打不开。绕开登录去渲染本地 HTML = 绕开验收。
- **渲染**：headless 默认软件渲染，合成与动画行为可能不同。

**判据不是用哪个工具**（各 agent 手上的浏览器工具不同），**而是满足三条**：
有界面、有完整字体与编解码、有真实登录态。

**以下都不算 e2e，写进报告也不构成结论**：headless 的截图与读数；`file://` 打开本地
渲染的 HTML；本地 dev server；打错环境。

问自己一句：**用户打开浏览器访问这个环境，会看到这个吗？**
不是斩钉截铁的"是"，就不是 e2e。

## 开票前先问：这会不会是有意的？

看到不理解的现象，先查它是不是产品决策、是不是第三方的既定行为、是不是工具本身的
局限，再判它是缺陷。**查不出依据就问人，别自己认定是 bug 就开票** —— 假票让交付方
做不该做的改动，烧掉评审轮次。

## gh 列表查询一律带全量参数

`gh api <列表端点>`、`gh issue list`、`gh pr list` 默认只回第一页。
**空结果不报错** —— 查询成功、退出码 0、没有警告，于是「这一页里没有」
被当成「不存在」。

- `gh api` 加 `--paginate`
- `gh issue list` / `gh pr list` 加 `--limit 200 --state all`
- 查版本用 `gh release list --limit 10`

只想看样本就明说是样本，不要拿它下「不存在」的结论。

## 发布票会自己等里程碑清空，不要手动干预

里程碑里只要还有其它 open Issue，发布票**不会被认领** —— 引擎跳过它并记
`release_milestone_incomplete`，票保持 `ai-ready`，这是可恢复的等待，不是故障。

所以想让一张票赶上某个版本，**只需把它加进那个里程碑并打 `ai-ready`**。
不要去停 timer、摘发布票的标签、清 worktree —— 那些只会制造孤儿状态，
还得再收拾一遍。

唯一的例外是发布已经过了门禁（票面出现 `release gates passed` / `scope verified`）：
那时范围已锁定，新加的票赶不上这一版，该进下一个里程碑。

## 开票的人：票面只能写沙箱里拿得到的东西

**这一节约束的是开 Issue 的那一方，不是交付方。** 交付跑在一个 **worktree 沙箱**里，
不是开票那个人的机器。票面里写了沙箱拿不到的东西，交付必然空转到 `ai-blocked`，
烧掉几轮评审——**这是开票方的缺陷，不是交付方的**。

沙箱里**没有**：宿主机的家目录文件（`~/Videos/...`、`~/Downloads/...`、
`/home/<someone>/...`）、部署凭据（`.env.e2e`、`~/.cloudflare.env`）、
GitHub App 私钥、生产数据库写权限、真实的第三方账号。

所以票写完，逐条问：**沙箱里的 agent 拿什么做这一步？**

- 答得上来 → 保留，并把命令原样写进票面
- 答不上来 → 划给维护者，标注「由维护者补齐，不属于交付方验收范围」，
  **并且自己先把证据拿到、贴到票或 PR 上**

**引用外部素材时，开票方要先在 runner 主机上实跑一遍取素材的命令**，把验证过的
命令与产物参数写进票面。没跑过就写上去的命令等于没写。

实测过的翻车（2026-09-21，Issue #325 连挂两轮）：票面写母片在
`~/Videos/orbi-onboarding-pipeline/out/...`，那是**宿主机**路径；沙箱里没有，
agent 出了 plan 就再没提交任何东西，HEAD 停在 frozen base，run 被判 `ai-blocked`。
票面同时给了 YouTube 兜底，但没写怎么取——沙箱里默认的取法也是失败的（见下）。
两轮都挂在同一个地方，票面从头到尾没被改过。

## 交付方：路径不存在时不要空转

动手前先跑一次存在性检查，不要假设票面给的路径可用：

```bash
ls -la <票面给的路径> || echo "MISSING — 用兜底来源，或在 Issue 里说明"
```

**拿不到源文件时，不许静默跑完一个空 run。** 要么用票面给的兜底来源（YouTube 链接、
仓库内文件、公开 URL），要么在 Issue 留言说清缺什么、试过什么、需要维护者补什么，
然后停。零 commit 的 run 对任何人都没有价值。

### 从 YouTube 取素材：沙箱没有 JS runtime

沙箱里 `uvx` 与 `ffmpeg` 都有，`yt-dlp` 用 `uvx yt-dlp` 跑。但**没有 JS runtime**，
YouTube 因此只吐 m3u8，`-f best[height<=720]` 这类选择器会直接报
`Requested format is not available`。要显式指定走 https 的 dash 格式：

```bash
uvx yt-dlp --list-formats '<url>'          # 先看有哪些走 https 的格式
uvx yt-dlp -f '136+140' --merge-output-format mp4 -o master.mp4 '<url>'
# 136 = 720p h264 video-only，140 = m4a audio；两者都走 https，不需要 JS runtime
```

取完必须验参数，不要假定拿对了：

```bash
ffprobe -v error -show_entries format=duration,size \
  -show_entries stream=codec_name,width,height -of default=nw=1 master.mp4
```

## 别覆盖浏览器默认值

`line-height`、`font-size` 的相对行为、表单控件外观、焦点环 —— 这些默认值是
几十年跨语言、跨字体、跨设备的排版经验。写死一个数字覆盖它，等于用一个场景下
试出来的值否定所有其它场景。

翻车形态：`h1 { line-height: 0.9 }` 让英文大标题看着紧凑，中文字形填满 em box，
直接行行重叠（#366）。补救时再加一条规则救中文，又多一处要维护的例外。

**先用默认值。** 确实要改时，把作用域收到那一个元素上，并说明为什么默认值不够。

## Copy

- Every user-facing string exists in both EN and ZH; the mirror gate enforces the
  page pair, but matching copy is yours to write.
- Claims about capability, pricing or quota must be verifiable against the repo
  (`src/pricing.json`) or a real measurement. Do not ship a number you have not
  checked — the stale `2B tokens` copy shipped to production exactly this way.

## Git

- Work on a task feature branch off `beta`; deliver through exactly one PR.
- Do not push `beta` or `main` directly, and never force-push a shared branch.
- **One exception: prose-only docs may be pushed straight to `beta`** — this file,
  the README, and `.md`/`.mdx` bodies under `docs/`. They ship no artifact and
  change no runtime behavior, so a PR only delays a rule by one round.
  **Prose only**: anything touching `site/**`, `public/**`, `scripts/**`, tests or
  CI config goes back to a feature branch and a PR, even for a single line.
  Before pushing, `git fetch` and rebase onto the current `origin/beta` — keep the
  history linear, no merge commit.
- The PR description must contain `Fixes #<issue-number>` so GitHub closes the
  Issue on merge. The keyword works in the PR body and commit messages, never in
  the PR title.
