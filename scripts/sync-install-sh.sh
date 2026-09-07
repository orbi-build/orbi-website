#!/usr/bin/env bash
# 把 orbi 主仓库根目录的 install.sh 同步为本站 public/install.sh。
#
# 唯一来源是 https://github.com/orbi-build/orbi 的 main 分支，本站副本必须与它
# 逐字节一致（首页一行 curl 命令下载的就是这份文件）。CI 每次都会拉取该源文件
# 与 public/install.sh 做 diff（.github/workflows/ci.yml），两处漂移直接红灯：
# orbi 仓库改了 install.sh 之后，跑一次本脚本再提交即可。
#
# 用法: scripts/sync-install-sh.sh [orbi checkout 路径]
#   不带参数: 从 raw.githubusercontent.com 拉取 main 最新版；
#   带路径:   从本地 orbi checkout 复制（须与 origin/main 一致，CI 会校验）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/public/install.sh"
SOURCE_URL="https://raw.githubusercontent.com/orbi-build/orbi/main/install.sh"

if [[ $# -gt 0 ]]; then
  cp "$1/install.sh" "$DEST"
  echo "synced public/install.sh from $1/install.sh"
else
  timeout 120 curl --fail --silent --show-error --location "$SOURCE_URL" -o "$DEST"
  echo "synced public/install.sh from $SOURCE_URL"
fi
