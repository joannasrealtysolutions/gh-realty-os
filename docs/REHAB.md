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

If you already had a different shape for the join table, make sure the column names above match the ones used by the API routes (`rehab_project_id`, `user_id`, `role`).

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
