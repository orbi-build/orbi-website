# Beta Cloud endpoint context

This document is the source of truth for the website beta-to-Cloud API boundary. It records beta only; production endpoints and DNS are outside its scope.

## Verified beta routing

- Cloud beta login: `https://beta.orbi.build/api/login`
- Cloud beta health check: `https://beta.orbi.build/api/healthz`
- Requests to `https://beta.orbi.build/api/*` are served by the Cloud routing service.
- The website beta page is served from the same beta hostname. Its page links and browser requests use the Cloud beta API paths above; `/api/*` is not a website-page or asset path.

Do not infer a Cloud hostname from a repository name, an environment name, or a hostname pattern. Use the endpoint above only when the beta Cloud API is the target. No other Cloud hostname is established by this document.

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
