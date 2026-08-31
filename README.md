# orbi.build

Orbi 官网 landing page。产品定位入口，不是文档站。文档后续放 `docs.orbi.build`。

部署：Cloudflare Worker + Workers Assets（不是 Pages）。

## 本地

```bash
set -a; source ~/.cloudflare.env; set +a
npx wrangler dev
```

## 部署

```bash
set -a; source ~/.cloudflare.env; set +a
npx wrangler deploy
```

自定义域名 `orbi.build` / `www.orbi.build`：

```bash
npx wrangler deploy --domains orbi.build --domains www.orbi.build
```

Worker 会把 `www.orbi.build` 301 到 `orbi.build`。
