#!/bin/bash
# 同步 main 到 HuggingFace Space（无历史推送，排除 HF 禁止的二进制文件）
# 用法: bash scripts/sync-space.sh

set -e

REMOTES=("space" "space-show")
SOURCE_BRANCH="main"
TEMP_BRANCH="__space-sync-tmp"

# HF 不允许的二进制文件模式
EXCLUDE_PATTERNS=(
  "public/readme-images/*.png"
)

# 确保在 main 分支且工作目录干净
current=$(git branch --show-current)
if [ "$current" != "$SOURCE_BRANCH" ]; then
  echo "Error: 请先切换到 $SOURCE_BRANCH 分支"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: 工作目录不干净，请先 commit 或 stash"
  exit 1
fi

# 创建 orphan 分支（无历史快照）
git checkout --orphan "$TEMP_BRANCH"

# 添加当前工作树快照（orphan 分支不会自动 stage）
git add -A

# 排除 HF 禁止的二进制文件
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
  git rm -rf --cached --ignore-unmatch $pattern 2>/dev/null || true
done

git commit -m "Sync from main: $(git log $SOURCE_BRANCH -1 --format='%h %s')"

# 推送到所有 space remote
for remote in "${REMOTES[@]}"; do
  echo "Pushing to $remote..."
  if git push "$remote" "$TEMP_BRANCH:main" --force; then
    echo "  ✓ $remote 推送成功"
  else
    echo "  ✗ $remote 推送失败"
  fi
done

# 清理：回到 main，删除临时分支
git checkout -f "$SOURCE_BRANCH"
git branch -D "$TEMP_BRANCH"

echo "Done!"
