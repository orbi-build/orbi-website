# orbi.build

Orbi 官网 landing page。产品定位入口，不是文档站。文档后续放 `docs.orbi.build`。

部署：Cloudflare Worker + Workers Assets（不是 Pages）。

## 本地

```bash
set -a; source ~/.cloudflare.env; set +a
npx wrangler dev
```

## 部署

生产（production）环境使用顶层 Wrangler 配置，域名为 `orbi.build` / `www.orbi.build`，Cloud 注册入口为 `https://cloud.orbi.build/api/login`：

```bash
set -a; source ~/.cloudflare.env; set +a
npx wrangler deploy
```

Beta 使用隔离的 `beta` environment、Worker `orbi-website-beta` 和已配置的域名
`beta.orbi.build`；Cloud 注册入口为 `https://beta.orbi.build/api/login`，不会修改生产路由或 DNS。域名绑定是一次性基础设施配置，日常部署只发布已绑定的 Worker/assets：

```bash
set -a; source ~/.cloudflare.env; set +a
npx wrangler deploy --env beta
```

合并到 `main` 后，`.github/workflows/deploy-beta.yml` 会先运行 `npm test` 和
landing/deployment contract tests，再部署 beta，并检查首页、`/compare/` 及英文/中文
OpenClaw 页面。Beta 使用独立的 `orbi-applications-test` D1 数据库，不会写入生产库。
也可以在
Actions 中使用 `workflow_dispatch` 手动触发。

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
