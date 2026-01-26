# Rehab automation

This repo ships a rehab experience that now manages contractor access automatically. These notes walk through the Supabase pieces that must be in place so the UI can assign members without hitting the SQL editor every time.

## 1) Rehab members table

Run this in the Supabase SQL editor (or via your migration workflow) so the app can record which Supabase users are tied to each rehab project. The `route.ts` API routes rely on the `rehab_project_id` <-> `user_id` link.

```sql
CREATE TABLE IF NOT EXISTS rehab_members (
  id uuid GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rehab_project_id uuid NOT NULL REFERENCES rehab_projects(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL DEFAULT 'contractor',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rehab_project_id, user_id)
);
```

If your schema already added a legacy `project_id` column (from earlier versions of this guide), keep it around until the dependent RLS policies are updated to use `rehab_project_id`. Once each policy switches to `rehab_project_id` you can drop the column with:

```sql
ALTER TABLE rehab_members DROP COLUMN IF EXISTS project_id CASCADE;
```

Updating the policies usually means replacing every `rehab_members.project_id` reference with `rehab_members.rehab_project_id` so the `rehab_projects`, `rehab_tasks`, `rehab_notes`, and `rehab_photos` policies continue working before you remove the column. Alternatively, keep both columns for now and insert values into `project_id` as well (see `app/api/rehab/projects/route.ts`).

## 2) Automatic member creation

When a project is created through `/api/rehab/projects`, the server now inserts the creator as an `owner` member to this table (see `app/api/rehab/projects/route.ts`). That ensures owners can manage their own projects without extra manual SQL.

## 3) Invite contractors from the UI

Owners can now invite contractors on the rehab detail page (`/rehab/[propertyId]`). The page calls `POST /api/rehab/members` with the project ID and contractor email. The new service-route under `app/api/rehab/members/route.ts` validates the caller is already a member of the project, looks up the invited user, and inserts a row in `rehab_members`.

You can also fetch the assigned members via `GET /api/rehab/members?project_id=<project-id>`; the client calls that endpoint to render the “Project team” widget.

## 4) RLS reminders

Your Supabase policies should gate access to `rehab_projects`, `rehab_tasks`, `rehab_notes`, and `rehab_photos` with a check similar to:

```sql
EXISTS (
  SELECT 1 FROM rehab_members rm
  WHERE rm.rehab_project_id = rehab_projects.id
    AND rm.user_id = auth.uid()
)
```

This ensures contractors can only see projects they are members of.
## 5) Edit / Delete from the site

The rehab detail page now ships controls to edit the project metadata (title, status, budget, start/target dates) and to delete it entirely without touching Supabase:

1. Update any field in the “Project details” card and click **Save project**. That calls `PATCH /api/rehab/projects/{projectId}`, which verifies your membership and applies the changes via the service role key.
2. Use **Delete project** to remove the rehab plus all related tasks/notes/photos/members. The API runs with your session token, validates membership, and cascades deletes under the hood before removing the row from `rehab_projects`.

These routes depend on the `rehab_members` table, so make sure the SQL from step 1 is in place and the service-role env var is configured locally and in Vercel.
