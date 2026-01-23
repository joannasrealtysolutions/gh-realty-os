#!/usr/bin/env bash
set -euo pipefail

COMMIT="${1:-}"

echo "=== GH Realty OS Revert (safe) ==="
echo "Working directory: $(pwd)"

git --version >/dev/null

if [[ -z "$COMMIT" ]]; then
  COMMIT="$(git rev-parse HEAD)"
fi

echo "Will revert commit: $COMMIT"
git show --stat "$COMMIT"

echo ""
read -r -p "Proceed with revert + push? (y/n) " confirm
if [[ "$confirm" != "y" ]]; then
  echo "Aborted."
  exit 1
fi

git revert "$COMMIT"
git push

echo ""
echo "✅ Reverted and pushed. Vercel will auto-deploy."
