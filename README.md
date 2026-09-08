# orbi.build

Orbi 官网 landing page。产品定位入口，不是文档站。文档后续放 `docs.orbi.build`。

部署：Cloudflare Worker + Workers Assets（不是 Pages）。

## 本地

```bash
set -a; source ~/.cloudflare.env; set +a
npx wrangler dev
```

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

合并进 `beta` 后，`.github/workflows/deploy-beta.yml` 会先运行 `npm test` 和
landing/deployment contract tests，再部署 beta，并检查首页、`/compare/` 及英文/中文
OpenClaw 页面。Beta 使用独立的 `orbi-applications-test` D1 数据库，不会写入生产库。

合并进 `main` 后，`.github/workflows/deploy-production.yml` 在 GitHub Environment
`production` 的 required reviewer 审批通过后自动部署生产（`orbi.build` /
`www.orbi.build`）：部署前运行完整测试，部署后对线上做 HTTP 内容 smoke（期望文案取自
部署 commit 的页面本身）与真实浏览器 smoke，任一 smoke 失败会自动 `wrangler rollback`
回部署前的生产版本并让 job 红灯。D1 迁移不在部署路径，生产库 schema 变更仍需显式手工执行。
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
