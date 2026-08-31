# orbi.build

Orbi 官网 landing page。产品定位入口，不是文档站。文档后续放 `docs.orbi.build`。

部署：Cloudflare Pages，绑定 `orbi.build`。

## 本地

打开 `public/index.html`，或：

```bash
npx wrangler pages dev public
```

## Cloudflare Pages

Dashboard 连接这个仓库：

- Production branch: `main`
- Build command: 空
- Output directory: `public`

自定义域名：`orbi.build`（以及可选 `www.orbi.build` → `orbi.build`）。

或用 CLI（先 `set -a; source ~/.cloudflare.env; set +a`）：

```bash
npx wrangler pages project create orbi-www --production-branch main
npx wrangler pages deploy public --project-name orbi-www
```
