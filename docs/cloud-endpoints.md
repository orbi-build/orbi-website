# Beta Cloud endpoint context

This document is the source of truth for the website beta-to-Cloud API boundary. It records beta only; production endpoints and DNS are outside its scope.

## Ownership on the shared beta hostname

`beta.orbi.build` is shared by two Workers: this website (`beta.orbi.build/*`) and the cloud control plane. The cloud Worker owns seven route prefixes on that hostname (orbi-cloud `wrangler.toml [env.e2e].routes`, pinned by its own route test; orbi-cloud discussion 120 §2 C2):

`/api*`, `/auth*`, `/login*`, `/app*`, `/connect*`, `/checkout*`, `/stripe*`

**The website owns no path under `/api/` — or under any of the prefixes above.** A website route defined there never runs on the shared hostname: the cloud Worker intercepts it. Measured live on 2026-09-09 (ownership read from the `x-orbi-worker` response header):

```text
POST https://beta.orbi.build/api/apply       → 404  x-orbi-worker: orbi-cloud-control-plane-e2e
POST https://beta.orbi.build/apply/submit    → 404  x-orbi-worker: orbi-cloud-control-plane-e2e  (/app* owns it)
GET  https://beta.orbi.build/apply           → 404  x-orbi-worker: orbi-cloud-control-plane-e2e  (/app* owns it)
GET  https://beta.orbi.build/cloud/login     → website (no x-orbi-worker)
```

(The `/apply` page gap on beta is caused by cloud's `/app*` prefix and closes when cloud shrinks its routes to `beta.orbi.build/api*` per discussion 120 §2 C2 recommendation 3; production `orbi.build` serves `/apply` itself.)

Website endpoints therefore live outside those prefixes:

- Application submit: `POST /cloud/apply` — answered by this website's Worker, writing to its own D1.
- Cloud login handoff: `GET /cloud/login` — answered by this website's Worker with a 302 to `CLOUD_LOGIN_URL`.

## Cloud entry configuration

The Cloud login URL is configured per environment in `wrangler.toml` as `CLOUD_LOGIN_URL`; the Worker adds no route of its own beyond the `/cloud/login` handoff. The verified beta value:

- Cloud beta login: `https://beta.orbi.build/api/login`
- Cloud beta health check: `https://beta.orbi.build/api/healthz`

Do not infer a Cloud hostname from a repository name, an environment name, or a hostname pattern. Use the endpoints above only when the beta Cloud API is the target. No other Cloud hostname is established by this document.

## HTTP verification

These real requests were run on 2026-09-07 with redirects disabled for login. OAuth state, PKCE values, cookies, client identifiers, and other OAuth parameters are redacted.

```text
$ curl -sS -o /dev/null -D - --max-redirs 0 https://beta.orbi.build/api/login
HTTP/2 302
location: https://github.com/login/oauth/authorize?...redacted...

$ curl -sS -D - https://beta.orbi.build/api/healthz
HTTP/2 200
content-type: application/json

{"ok":true}
```

The login response is a GitHub OAuth redirect. Do not follow it during automated endpoint checks because it starts an interactive sign-in flow. The health response confirms the beta API route is reachable.

This document does not verify or define any production endpoint. Update it only after a real beta endpoint check establishes a replacement or additional beta value.
