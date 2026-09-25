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

Merging the PR does not deploy anything: production deploys are a
manual `workflow_dispatch` only (Issue #210 — the push-triggered run was always
a redundant twin of the dispatch). After the merge, a human dispatches the
workflow:

```
gh workflow run deploy-production.yml --repo orbi-build/orbi-website --ref main
```

1. **Deploy** — build, full test set, `wrangler deploy`.
2. **Smoke** — h1 comparison of the live pages against the deployed commit
   (the real-browser check was removed from this workflow on 2026-09-10);
   any failure rolls production back to the previous version automatically.

The PR never merges itself (`allow_auto_merge` is false) — a human picks the
merge moment.

## Before opening the PR

- **Merge preflight** (no working-tree change):

  ```
  git fetch origin
  git merge-tree --write-tree --name-only origin/main promote/<date>
  ```

  Conflicts are listed under the tree hash; fix them on the snapshot branch first.

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
