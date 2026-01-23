param(
  [string]$Commit = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=== GH Realty OS Revert (safe) ==="
Write-Host "Working directory:" (Get-Location)

git --version | Out-Null

if ([string]::IsNullOrWhiteSpace($Commit)) {
  $Commit = git rev-parse HEAD
}

Write-Host "Will revert commit:" $Commit
git show --stat $Commit

Write-Host ""
$confirm = Read-Host "Proceed with revert + push? (y/n)"
if ($confirm -ne "y") {
  Write-Host "Aborted."
  exit 1
}

git revert $Commit
git push

Write-Host ""
Write-Host "✅ Reverted and pushed. Vercel will auto-deploy."
