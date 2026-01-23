#!/usr/bin/env bash
set -euo pipefail

MESSAGE="${1:-Update site}"
BRANCH="${2:-}"

echo "=== GH Realty OS Deploy (safe) ==="
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
read -r -p "Continue with commit + push? (y/n) " confirm
if [[ "$confirm" != "y" ]]; then
  echo "Aborted."
  exit 1
fi

git add .
git commit -m "$MESSAGE"
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"

echo ""
echo "✅ Pushed. Vercel will auto-deploy."
echo ""
echo "Rollback options:"
echo "  1) git revert <commit_sha> && git push"
echo "  2) Vercel -> Deployments -> Redeploy a previous deploy"
