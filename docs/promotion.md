# Production promotion runbook (beta → main)

Beta is the default branch and serves beta.orbi.build; main serves production
(orbi.build). The two branches are permanently diverged — every promotion is a
true merge, never a fast-forward. This file records the convention that until
2026-09-13 (Issue #151) lived only in PR history (#73, #84, #86–#88) and the
workflow sources; the pre-flight checks and the anti-drift drill below were
executed for real during that promotion, and the post-deploy checks are that
promotion's acceptance items.

## The promotion

Promote a fixed beta snapshot, not the moving `beta` head. Choose the exact
beta commit that has already been deployed, create a branch at it, and open the
PR from that branch to `main`. Merge with GitHub's **Create a merge commit**
(`--no-ff`):

```
git switch -c promote/<date> <deployed-beta-sha>
gh pr create --repo orbi-build/orbi-website --base main --head promote/<date> \
  --title "晋升 beta 快照到 main：<一句话概括>" --body-file <evidence body>
```

The production workflow takes the second parent of the resulting merge commit
as the snapshot. It lists successful `deploy-beta.yml` runs, finds the first
run whose `headSha` is that snapshot or a descendant, and measures soak from
that run's deployment time. Later commits on `beta` do not change the gate.

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
3. **Smoke** — h1 comparison of the live pages against the deployed commit
   (the real-browser check was removed from this workflow on 2026-09-10);
   any failure rolls production back to the previous version automatically.

The PR never merges itself (`allow_auto_merge` is false) — a human picks the
merge moment, which is how the soak window is honored.

## Before opening the PR

- **Merge preflight** (no working-tree change):

  ```
  git fetch origin
  git merge-tree --write-tree --name-only origin/main promote/<date>
  ```

  Conflicts are listed under the tree hash; fix them on the snapshot branch first.

- **Merge preflight immediately before merging (required).** The check above is
  only a snapshot taken before the PR is opened. `main` may advance while the
  PR is waiting, including through a direct merge that touches the same files
  as the beta snapshot. Therefore, immediately before clicking **Merge**,
  fetch again and rerun the same check against the current `origin/main`:

  ```
  git fetch origin
  git merge-tree --write-tree --name-only origin/main promote/<date>
  ```

  Do not merge until this fresh result is clean. If it reports conflicts or
  reveals that the current merge would replace main-side changes, stop and
  resolve the promotion branch (or recreate the promotion PR) before merging.
  The pre-PR check cannot detect commits that land after it ran.

- **Soak reality check.** The soak gate protects real users, so it may be
  skipped only when there are none. Check active subscriptions with a
  read-only query against the control-plane database, but record only the
  conclusion in the promotion issue: `有活跃订阅，须满足 soak` or
  `无活跃订阅，可 skip_soak` — never record a count or other operating data:

  ```
  cd <orbi-cloud checkout>
  timeout 90 npx wrangler d1 execute orbi_control_plane_e2e --remote \
    --command "SELECT status, COUNT(*) AS n FROM subscriptions GROUP BY status" --json
  ```

  `subscriptions=0` → the soak wait protects nobody; merge any time and, if
  the soak job would still fail, dispatch the workflow with `skip_soak=true`
  (the documented hotfix path). Any active subscription → wait for the
  snapshot's successful beta deployment to reach `PROD_MIN_SOAK_HOURS`; commit
  author timestamps are not used.

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
