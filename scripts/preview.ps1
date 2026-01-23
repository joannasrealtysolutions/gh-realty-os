param(
  [string]$Branch = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=== GH Realty OS Preview (safe) ==="
Write-Host "Working directory:" (Get-Location)

git --version | Out-Null

if ([string]::IsNullOrWhiteSpace($Branch)) {
  $current = git rev-parse --abbrev-ref HEAD
  Write-Host "Current branch:" $current
} else {
  Write-Host "Switching to branch:" $Branch
  git checkout -B $Branch
}

Write-Host "Pulling latest..."
git pull --rebase

Write-Host ""
git status -sb
Write-Host ""

if (-not (Test-Path ".env.local")) {
  Write-Host "WARNING: .env.local not found. Local dev may fail without Supabase env vars." -ForegroundColor Yellow
}

Write-Host ""
$confirm = Read-Host "Start local dev server now? (y/n)"
if ($confirm -ne "y") {
  Write-Host "Preview step complete (no server started)."
  exit 0
}

npm run dev
