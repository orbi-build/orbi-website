#!/usr/bin/env bash
# orbi.build 报名漏斗日报。
#
# 数据来自 Cloudflare Web Analytics（beacon，非 HTTP 日志）：按国家过滤
# HTTP 日志会把真人一起滤掉，这里读的是真实页面浏览。
#
# 用法: scripts/funnel.sh [起始日期 YYYY-MM-DD，默认昨天]
set -euo pipefail

ACCOUNT=9d4b74d3dc4247dfcd4b3ca77869cbdf
SITE_TAG=71754cde64b843be9938388d2a635fba
SINCE="${1:-$(date -u -d yesterday +%Y-%m-%d)}T00:00:00Z"

# shellcheck disable=SC1090
set -a; source ~/.cloudflare.env; set +a

query() {
  curl -sS -X POST "https://api.cloudflare.com/client/v4/graphql" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$1"
}

PAGEVIEWS=$(query "{\"query\":\"query { viewer { accounts(filter: {accountTag: \\\"$ACCOUNT\\\"}) { rumPageloadEventsAdaptiveGroups(limit: 50, filter: {siteTag: \\\"$SITE_TAG\\\", datetime_geq: \\\"$SINCE\\\"}, orderBy: [count_DESC]) { count dimensions { refererHost requestPath } } } } }\"}")

echo "=== orbi.build 漏斗（自 ${SINCE%T*}）==="
echo "$PAGEVIEWS" | python3 -c '
import sys, json
from collections import defaultdict

data = json.load(sys.stdin)
if data.get("errors"):
    print("查询失败:", json.dumps(data["errors"])[:200]); sys.exit(1)

rows = data["data"]["viewer"]["accounts"][0]["rumPageloadEventsAdaptiveGroups"]
by_path = defaultdict(int)
by_ref = defaultdict(int)
for r in rows:
    d = r["dimensions"]
    path = d.get("requestPath", "?")
    by_path[path] += r["count"]
    # Only outside traffic tells us where people come from.
    if d.get("refererHost") not in ("orbi.build", "www.orbi.build"):
        by_ref[d.get("refererHost") or "(直接访问)"] += r["count"]

home = by_path.get("/", 0) + by_path.get("/zh/", 0)
apply_views = by_path.get("/apply", 0)

print(f"  首页浏览   {home}")
print(f"  报名页浏览 {apply_views}", end="")
print(f"   （首页→报名 {apply_views/home*100:.0f}%）" if home else "")
print("  外部来源:")
for k, v in sorted(by_ref.items(), key=lambda x: -x[1])[:6]:
    print(f"    {v:>4}  {k}")
'

# Submissions are the number that matters; read them from D1, not analytics.
TOTAL=$(wrangler d1 execute orbi-applications --remote --json \
  --command "SELECT COUNT(*) AS n FROM applications;" 2>/dev/null \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["results"][0]["n"])')
echo "  报名提交总数 $TOTAL"

echo "  最近提交:"
wrangler d1 execute orbi-applications --remote --json \
  --command "SELECT tg, substr(scenario,1,46) AS s, created_at FROM applications ORDER BY id DESC LIMIT 3;" 2>/dev/null \
  | python3 -c '
import sys, json
for r in json.load(sys.stdin)[0]["results"]:
    print("    %s  %s  %s" % (r["created_at"], r["tg"], r["s"]))
'

