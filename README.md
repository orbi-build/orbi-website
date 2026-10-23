# orbi.build

Orbi 官网 landing page。产品定位入口，不是文档站。文档后续放 `docs.orbi.build`。

部署：Cloudflare Worker + Workers Assets（不是 Pages）。

## 本地

```bash
set -a; source ~/.cloudflare.env; set +a
npx wrangler dev
```

## 页面（Issue #106）

40 个 HTML（连同 blog/feed.xml）一律由构建产生并提交，**不要手改 `public/*.html`**：改 `site/partials/`（共享的
nav / footer / 博客文章模板片段，全站一处生效）、`site/pages/`（单页源：JSON 头里的 lang、mirror、
nav 参数 + 页面正文）或 `content/blog/*.md`（博客文章：YAML front matter + CommonMark 正文，
en 与 zh 镜像各一份），然后 `npm run build` 重新生成 `public/`。
`tests/pages.test.js` 是门禁：构建产物与 `public/` 逐字节比对，中英镜像的
nav/footer 项数、CTA 数量、语言切换目标、锚点前缀不一致会直接红。

`sitemap.xml` 是例外：它**入库**不了（Issue #1062）。每条的 `lastmod` 取该源文件最后一次
Git 提交的 UTC 日，而 squash 合并会把这些提交改写成新日期，预先提交的 XML 一落地就过期，
CI 的逐字节比对必然红。所以它由部署 checkout 现场生成：
`npm run build:sitemap`（`node scripts/build-pages.mjs --sitemap-only`，只写这一个文件，
与完整构建共用收集器、日期与 XML 渲染逻辑）。`npm test` 通过 `pretest` 跑同一条命令；
`deploy-beta.yml` 在 `npm ci` 之后显式跑一次。该文件已 gitignore，不要再提交；
手工部署前先跑一次 `npm run build:sitemap`。

关于「要不要重构为 Next.js / Hono 等框架」：评估结论是不重构，痛点对照、规模数据与
重新评估的触发条件见 [docs/why-no-framework.md](docs/why-no-framework.md)（website#139）。

## 部署

生产（production）环境使用顶层 Wrangler 配置，域名为 `orbi.build` / `www.orbi.build`：

```bash
set -a; source ~/.cloudflare.env; set +a
npx wrangler deploy
```

Beta 使用隔离的 `beta` environment、Worker `orbi-website-beta` 和已配置的域名
`beta.orbi.build`，不会修改生产路由或 DNS。域名绑定是一次性基础设施配置，日常部署只发布已绑定的 Worker/assets：

```bash
set -a; source ~/.cloudflare.env; set +a
npx wrangler deploy --env beta
```

分支流：`beta` 是开发部署分支，`main` 是生产晋升分支。

合并进 `beta` 后，独立 CI 通过即触发 `.github/workflows/deploy-beta.yml`：它自己不跑
`npm test`，而是 `npm ci` → 生成 `sitemap.xml` → landing/deployment contract tests →
部署 beta → 检查首页、`/compare/` 及英文/中文 OpenClaw 页面。Beta 使用独立的
`orbi-applications-test` D1 数据库，不会写入生产库。

生产部署只由人工 `workflow_dispatch` 触发 `.github/workflows/deploy-production.yml`
（Issue #210：合并进 `main` 不会自动触发），workflow 在 GitHub Environment
`production` 的 required reviewer 审批通过后部署生产（`orbi.build` /
`www.orbi.build`）：部署前运行完整测试，部署后对线上做 HTTP 内容 smoke（期望文案取自
部署 commit 的页面本身；真实浏览器 smoke 已于 2026-09-10 从该 workflow 移除），smoke
失败会自动 `wrangler rollback` 回部署前的生产版本并让 job 红灯。
D1 迁移不在部署路径，生产库 schema 变更仍需显式手工执行。
两个 workflow 都可在 Actions 中用 `workflow_dispatch` 手动触发。

以上自动化依赖的仓库设置（GitHub 设置，非 git 交付）：Environment `production` 配置
required reviewers；`main` 分支保护 require PR + required check。

GitHub Actions 需要配置以下 Repository 设置：

- Secret `CLOUDFLARE_API_TOKEN`：仅授予目标 Cloudflare account 的 Worker 部署权限；
- Variable `CLOUDFLARE_ACCOUNT_ID`：目标 Cloudflare account ID。

Workflow 不包含凭据；任一设置缺失都会在部署前明确失败。

自定义域名 `orbi.build` / `www.orbi.build`：

```bash
npx wrangler deploy --domains orbi.build --domains www.orbi.build
```

Worker 会把 `www.orbi.build` 301 到 `orbi.build`。

## 检查

```bash
python3 -m unittest tests.test_landing -v
```
