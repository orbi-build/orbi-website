# Production promotion runbook (beta → main)

Beta is the default branch and serves beta.orbi.build; main serves production
(orbi.build). The two branches are permanently diverged — every promotion is a
true merge, never a fast-forward. This file records the convention that until
2026-09-13 (Issue #151) lived only in PR history (#73, #84, #86–#88) and the
workflow sources; the pre-flight checks and the anti-drift drill below were
executed for real during that promotion, and the post-deploy checks are that
promotion's acceptance items.

## The promotion

One PR, head `beta`, base `main`, merged with GitHub's **Create a merge
commit** (that is the `--no-ff` merge):

```
gh pr create --repo orbi-build/orbi-website --base main --head beta \
  --title "晋升 beta 到 main：<一句话概括>" --body-file <evidence body>
```

Merging it does not deploy anything: production deploys are a manual
`workflow_dispatch` only (Issue #210 — the push-triggered run was always a
redundant twin of the dispatch). After the merge, a human dispatches the
workflow:

```
gh workflow run deploy-production.yml --repo orbi-build/orbi-website --ref main
```

1. **Soak gate** — beta commits newer than the last successful production
   deploy must have spent `PROD_MIN_SOAK_HOURS` (repo variable, default 4) on
   origin/beta. A failed soak blocks the deploy without paging anyone.
2. **Deploy** — build, full test set, `wrangler deploy`.
3. **Smoke** — h1 comparison of the live pages against the deployed commit,
   then a real-browser check; any failure rolls production back to the
   previous version automatically.

The PR never merges itself (`allow_auto_merge` is false) — a human picks the
merge moment, which is how the soak window is honored.

## Before opening the PR

- **Merge preflight** (no working-tree change):

  ```
  git fetch origin
  git merge-tree --write-tree --name-only origin/main origin/beta
  ```

  Conflicts are listed under the tree hash; fix them on beta first.

- **Soak reality check.** The soak gate protects real users, so it may be
  skipped only when there are none. Count active subscriptions with a
  read-only query against the control-plane database (record the value in
  the promotion issue either way — never assume it):

  ```
  cd <orbi-cloud checkout>
  timeout 90 npx wrangler d1 execute orbi_control_plane_e2e --remote \
    --command "SELECT status, COUNT(*) AS n FROM subscriptions GROUP BY status" --json
  ```

  `subscriptions=0` → the soak wait protects nobody; merge any time and, if
  the soak job would still fail on commit age, dispatch the workflow with
  `skip_soak=true` (the documented hotfix path). Any active subscription →
  merge only once the newest beta commit is at least `PROD_MIN_SOAK_HOURS`
  old:

  ```
  git log -1 --format=%cI origin/beta   # compare against now, in UTC
  ```

- **Before-state on production** (the promotion must move these):

  ```
  curl -s https://orbi.build/ | grep -c "2B tokens"     # known-stale copy
  ```

## After the deploy

The workflow smoke-tests the deployment, but the quota-copy acceptance is
greppable and belongs in the promotion record:

```
curl -s https://orbi.build/ | grep -c "2B tokens"    # must be 0
curl -s https://orbi.build/ | grep -o "300M tokens"  # must match
git show origin/main:src/pricing.json                # must carry includedTokens
```

## The anti-drift gate must be able to fail

`tests/pricing.test.js` pins `pricing.includedTokens` absolutely, so a wrong
quota cannot ship silently — but a gate that has never been seen red is not
evidence of anything (Issue #151: the gate existed only on beta while main
shipped the stale copy). Drill it on the branch about to be promoted:

```
sed -i 's/"includedTokens": 300000000/"includedTokens": 2000000000/' src/pricing.json
timeout 300 npx vitest run tests/pricing.test.js     # must FAIL (exit 1)
git checkout -- src/pricing.json
```
