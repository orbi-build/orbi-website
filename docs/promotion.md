# Production promotion runbook (beta → main)

Beta is the default branch and serves beta.orbi.build; main serves production
(orbi.build). Every change lands on `beta` first; production is promoted by one
PR from `beta` itself to `main`. Since 2026-10-01 `main` is always an ancestor of
`beta` (main was merged back into beta once), so this PR never conflicts.

Rules that keep it that way:

- **The PR head is `beta`, nothing else.** No snapshot branches, no branches cut
  from `main` (#652 and #661 did that and left main with changes beta never had).
  CI job `promotion-source` fails any PR into `main` whose head is not this
  repository's `beta` (Issue #675; it becomes a required check once merged).
- **Merge commit only.** The `Main` ruleset allows only **Create a merge commit**:
  a squash or rebase would give main a commit beta does not have and break the
  ancestry above. PRs into `beta` may still be squashed.
- **What ships is beta's head at merge time.** Check beta.orbi.build before
  merging; anything merged into beta after that check ships too.

## The promotion

```
gh pr create --repo orbi-build/orbi-website --base main --head beta \
  --title "晋升 beta 到 main：<一句话概括>" --body-file <evidence body>
gh pr merge <n> --repo orbi-build/orbi-website --merge
```

Merging the PR does not deploy anything: production deploys are a
manual `workflow_dispatch` only (Issue #210). After the merge, dispatch it and
approve the `production` environment:

```
gh workflow run deploy-production.yml --repo orbi-build/orbi-website --ref main
```

1. **Deploy** — build, full test set, `wrangler deploy`.
2. **Smoke** — h1 comparison of the live pages against the deployed commit;
   any failure rolls production back to the previous version automatically.

The PR never merges itself (`allow_auto_merge` is false) — a human picks the
merge moment.

## After the deploy

The workflow smoke-tests the deployment, but the quota-copy acceptance is
greppable and belongs in the promotion record:

```
curl -s https://orbi.build/ | grep -c "2B tokens"    # must be 0
curl -s https://orbi.build/ | grep -o "1.2B tokens"  # must match
git show origin/main:src/pricing.json                # must carry includedTokens
```

## The anti-drift gate must be able to fail

`tests/pricing.test.js` pins `pricing.includedTokens` absolutely, so a wrong
quota cannot ship silently — but a gate that has never been seen red is not
evidence of anything (Issue #151: the gate existed only on beta while main
shipped the stale copy). Drill it on the branch about to be promoted:

```
sed -i 's/"includedTokens": 1200000000/"includedTokens": 2000000000/' src/pricing.json
timeout 300 npx vitest run tests/pricing.test.js     # must FAIL (exit 1)
git checkout -- src/pricing.json
```
