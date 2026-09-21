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

The sibling repositories work differently — `orbi-build/orbi` and
`orbi-build/orbi-cloud` both version, release, and gate claims on
`active_milestone`. Do not carry their habits over.

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
  trigger it (Issue #210). The workflow runs the soak gate,
  required-reviewer approval on the `production` GitHub Environment, the full test
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

One PR, head `beta`, base `main`, merged with GitHub's **Create a merge commit**
(the `--no-ff` merge). The PR never auto-merges: a human picks the merge moment,
which is how the soak window is honored.

```
gh pr create --repo orbi-build/orbi-website --base main --head beta \
  --title "晋升 beta 到 main：<一句话概括>" --body-file <evidence body>
```

Before opening the PR:

- **Merge preflight**, no working-tree change:
  `git fetch origin && git merge-tree --write-tree --name-only origin/main origin/beta`.
  Conflicts are listed under the tree hash; fix them on `beta` first.
- **Soak reality check.** The soak gate (`PROD_MIN_SOAK_HOURS`, repo variable,
  default 4) protects real users, so it may be skipped only when there are none.
  Count active subscriptions read-only against the control-plane database and
  record the value in the promotion issue either way — never assume it:
  `timeout 90 npx wrangler d1 execute orbi_control_plane_e2e --remote --command "SELECT status, COUNT(*) AS n FROM subscriptions GROUP BY status" --json`
  (run from an orbi-cloud checkout). `subscriptions=0` means the wait protects
  nobody: merge any time and, if the soak job would still fail on commit age,
  dispatch the workflow with `skip_soak=true` (the documented hotfix path —
  it skips the soak, never the approval). Any active subscription means merging
  only once the newest `beta` commit is at least `PROD_MIN_SOAK_HOURS` old
  (`git log -1 --format=%cI origin/beta`, compared against now in UTC).
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
- UI work drives the real running site with Playwright: real interaction, an assert
  on the changed flow, console and network error checks, and a screenshot.
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
- 改了布局的 PR，对照改动前的截图看
- 截图里任何「看起来怪」的地方先当缺陷查清；不许写「可能是截图截断」翻篇

`npm test` 与浏览器 smoke 是门禁，不是验收。它们证明没坏，不证明做对了。

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

## Copy

- Every user-facing string exists in both EN and ZH; the mirror gate enforces the
  page pair, but matching copy is yours to write.
- Claims about capability, pricing or quota must be verifiable against the repo
  (`src/pricing.json`) or a real measurement. Do not ship a number you have not
  checked — the stale `2B tokens` copy shipped to production exactly this way.

## Git

- Work on a task feature branch off `beta`; deliver through exactly one PR.
- Do not push `beta` or `main` directly, and never force-push a shared branch.
- The PR description must contain `Fixes #<issue-number>` so GitHub closes the
  Issue on merge. The keyword works in the PR body and commit messages, never in
  the PR title.
