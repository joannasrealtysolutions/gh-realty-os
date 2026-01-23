# Deploy workflow (repeatable + reversible)

This repo is connected to Vercel. **Only git pushes trigger a live deploy.**

## 1) Local preview (optional)
```bash
npm run dev
```

If you see `supabaseUrl is required`, add a `.env.local` file with:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## 2) Safe deploy script (recommended)

### Windows PowerShell
```powershell
scripts\deploy.ps1 -Message "Describe the change"
```

### macOS/Linux (bash)
```bash
./scripts/deploy.sh "Describe the change"
```

Both scripts:
- pull latest changes
- show status
- ask for confirmation
- commit + push
- print rollback options

## 3) Preview-only script (no push)

### Windows PowerShell
```powershell
scripts\preview.ps1
```

### macOS/Linux (bash)
```bash
./scripts/preview.sh
```

The preview script:
- pulls latest changes
- shows git status
- optionally starts `npm run dev`

## 4) Rollback options
### Git revert
```bash
git revert <commit_sha>
git push
```

### Vercel rollback
Open Vercel -> Deployments -> pick a previous deploy -> **Redeploy**

## 5) VS Code tasks (one click)
Open the Command Palette -> **Tasks: Run Task** and choose:
- Deploy (safe)
- Preview (safe)
- Revert last deploy (safe)
