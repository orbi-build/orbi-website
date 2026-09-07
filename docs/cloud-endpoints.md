# Cloud endpoint context

This is the single source of truth for the website-to-Cloud login handoff. A
hostname is not a Cloud endpoint merely because it contains `orbi.build`.

## Verified endpoint status

| Boundary | Login endpoint | Status | Owner |
| --- | --- | --- | --- |
| Website beta | `https://beta.orbi.build/api/login` is the website deployment host configured in `wrangler.toml`; do not treat the website host as an independently verified Cloud host | **conflicted; do not use as a website fallback** | `orbi-build/orbi-website` |
| Cloud beta | `https://beta.orbi.build/api/login` | **verified 2026-09-07** | `orbi-build/orbi-cloud` |
| Cloud production | **No verified endpoint is deployed or recorded** | **blocked; do not invent one** | `orbi-build/orbi-cloud` |
| Cloud e2e | A `workers.dev` URL from the Cloud e2e deployment | **test-only; not a beta or production endpoint** | `orbi-build/orbi-cloud` |

The shared `beta.orbi.build` hostname is a deployment/configuration conflict,
not evidence that the website beta and Cloud beta are separate environments.
Resolve that conflict in the owning deployment repositories before adding a
new hostname or production value here.

`cloud.orbi.build` is explicitly **not** an endpoint: DNS does not resolve.
The website's `orbi.build/api/login` is also not a Cloud endpoint: it returned
404 during the verification below.

## HTTP evidence

Verification was performed with real requests on 2026-09-07. OAuth state,
PKCE values, cookies, and client details are intentionally omitted.

```text
$ curl -sS -o /dev/null -D - --max-redirs 0 https://beta.orbi.build/api/login
HTTP/2 302
location: https://github.com/login/oauth/authorize?...redacted...
```

The 302 location is a GitHub OAuth authorize URL and its redacted `redirect_uri`
was `https://beta.orbi.build/auth/callback`; this proves the current beta route
is the Cloud OAuth handoff, not a guessed `/login` path. The request must not be
followed in automated verification because it starts an interactive OAuth flow.

Negative checks from the same verification:

```text
https://cloud.orbi.build/api/login  -> curl DNS error (host not found)
https://orbi.build/api/login         -> HTTP/2 404
```

There is no production curl evidence because Cloud's production URL is not
recorded/deployed. This is a blocker, not permission to substitute the website
production host, the beta host, or an e2e `workers.dev` URL.

## Change procedure

When Cloud owner/repository deploys or renames an endpoint, it must first prove
DNS and `/api/login` OAuth redirect behavior with a real request, then update
this document and the owning Cloud deployment configuration. Review and update
this website repository's `wrangler.toml` handoff value together with that
change. Keep website beta, Cloud beta, Cloud production, and e2e values separate.

Agents must not guess, create, or replace Cloud subdomains. Stop and report a
blocker whenever a verified value is absent.
