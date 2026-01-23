#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-}"

echo "=== GH Realty OS Preview (safe) ==="
echo "Working directory: $(pwd)"

git --version >/dev/null

if [[ -n "$BRANCH" ]]; then
  echo "Switching to branch: $BRANCH"
  git checkout -B "$BRANCH"
else
  echo "Current branch: $(git rev-parse --abbrev-ref HEAD)"
fi

echo "Pulling latest..."
git pull --rebase

echo ""
git status -sb
echo ""

if [[ ! -f ".env.local" ]]; then
  echo "WARNING: .env.local not found. Local dev may fail without Supabase env vars."
fi

echo ""
read -r -p "Start local dev server now? (y/n) " confirm
if [[ "$confirm" != "y" ]]; then
  echo "Preview step complete (no server started)."
  exit 0
fi

npm run dev
