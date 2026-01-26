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

**PowerShell note:** run scripts from the repo root with the dot-slash prefix:
```powershell
.\scripts\preview.ps1
```
If you see “not recognized,” confirm you are in the repo root:
```powershell
Get-Location
dir scripts
```

## 2) Safe deploy script (recommended)

### Windows PowerShell
```powershell
.\scripts\deploy.ps1 -Message "Describe the change"
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
.\scripts\preview.ps1
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
Open Vercel → Deployments → pick a previous deploy → **Redeploy**

## 5) VS Code tasks (one click)
Open the Command Palette → **Tasks: Run Task** and choose:
- Deploy (safe)
- Preview (safe)
- Revert last deploy (safe)

## 6) If you hit merge conflicts (step-by-step)
1. Open the file shown by `git status` and search for conflict markers:
   - `<<<<<<<`
   - `=======`
   - `>>>>>>>`
2. Keep the intended lines, delete the markers, then save the file.
3. Repeat for each conflicted file, then run:
   ```bash
   git add <file1> <file2>
   git status
   ```
4. When all conflicts are resolved:
   ```bash
   git commit -m "Resolve merge conflicts"
   ```

## 7) Supabase setup needed for new Money/Closing Costs features
Add the environment variables locally (see step 1) and in Vercel.

Run this once in the Supabase SQL editor to add the optional tag:
```sql
ALTER TABLE transactions ADD COLUMN cost_tag text;
```

Create the storage buckets referenced by the app (Supabase → Storage):
- `receipts`
- `rehab-photos`

Supply the service-role key as `SUPABASE_SERVICE_ROLE_KEY` (server-only) so the `/api/rehab/projects` route can insert rehab projects while row-level security is enabled.

## 8) Vercel build error: "Property 'id' does not exist on type '{ user: User; }'"
If Vercel fails during `next build` with:
```
Property 'id' does not exist on type '{ user: User; }'
```
it usually means the route is using the wrong shape for `admin.auth.getUser(...)`.

**Fix in your route file** (example: `app/api/rehab/projects/route.ts`):
```ts
const { data, error } = await admin.auth.getUser(token);
if (error || !data.user?.id) {
  return NextResponse.json({ error: "Unable to verify your identity." }, { status: 401 });
}
```

If your code currently does this:
```ts
const { data: user } = await admin.auth.getUser(token);
if (!user?.id) { ... }
```
change it to use `data.user?.id` instead, because `data` is `{ user }`, not the user itself.
