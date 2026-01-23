param(
  [string]$Message = "Update site",
  [string]$Branch = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=== GH Realty OS Deploy (safe) ==="
Write-Host "Working directory:" (Get-Location)

# Ensure git exists
git --version | Out-Null

# Optional branch creation
if ([string]::IsNullOrWhiteSpace($Branch)) {
  $current = git rev-parse --abbrev-ref HEAD
  Write-Host "Current branch:" $current
} else {
  Write-Host "Switching to branch:" $Branch
  git checkout -B $Branch
}

# Pull latest before changes
Write-Host "Pulling latest..."
git pull --rebase

# Show status and confirm
Write-Host ""
git status -sb
Write-Host ""

if (-not (Test-Path ".env.local")) {
  Write-Host "WARNING: .env.local not found. Local dev may fail without Supabase env vars." -ForegroundColor Yellow
}

Write-Host ""
$confirm = Read-Host "Continue with commit + push? (y/n)"
if ($confirm -ne "y") {
  Write-Host "Aborted."
  exit 1
}

git add .
git commit -m $Message
git push -u origin (git rev-parse --abbrev-ref HEAD)

Write-Host ""
Write-Host "✅ Pushed. Vercel will auto-deploy."
Write-Host ""
Write-Host "Rollback options:"
Write-Host "  1) git revert <commit_sha> && git push"
Write-Host "  2) Vercel -> Deployments -> Redeploy a previous deploy"
