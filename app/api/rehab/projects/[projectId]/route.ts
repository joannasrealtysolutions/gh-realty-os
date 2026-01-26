import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey)
    : null;

async function getSessionUser(req: Request) {
  if (!admin) return { error: "Supabase admin client not configured." };

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Missing authorization token." };
  }

  const token = authHeader.split(" ")[1].trim();
  if (!token) {
    return { error: "Missing authorization token." };
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.id) {
    return { error: error?.message ?? "Unable to verify your identity." };
  }

  return { userId: data.user.id };
}

async function ensureProjectAccess(projectId: string, userId: string) {
  if (!admin) return { error: "Supabase admin client not configured." };

  const { data, error } = await admin
    .from("rehab_members")
    .select("rehab_project_id")
    .eq("rehab_project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "You are not a member of this project." };
  return { ok: true };
}

export async function PATCH(
  req: Request,
  { params }: { params: { projectId?: string } }
) {
  if (!admin) {
    return NextResponse.json({ error: "Server missing Supabase configuration." }, { status: 500 });
  }

  const projectId = params?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
  }

  const auth = await getSessionUser(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const access = await ensureProjectAccess(projectId, auth.userId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  const body = (await req.json()) as {
    title?: string;
    status?: string;
    budget_target?: number | null;
    start_date?: string | null;
    target_end_date?: string | null;
  };

  const payload: Record<string, unknown> = {};
  if (body.title !== undefined) payload.title = body.title.trim();
  if (body.status !== undefined) payload.status = body.status;
  if (body.budget_target !== undefined) payload.budget_target = body.budget_target;
  if (body.start_date !== undefined) payload.start_date = body.start_date;
  if (body.target_end_date !== undefined) payload.target_end_date = body.target_end_date;

  if (!Object.keys(payload).length) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("rehab_projects")
    .update(payload)
    .eq("id", projectId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, project: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: { projectId?: string } }
) {
  if (!admin) {
    return NextResponse.json({ error: "Server missing Supabase configuration." }, { status: 500 });
  }

  const projectId = params?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
  }

  const auth = await getSessionUser(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const access = await ensureProjectAccess(projectId, auth.userId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  const cleanupTables = ["rehab_photos", "rehab_notes", "rehab_tasks"];
  for (const table of cleanupTables) {
    const { error } = await admin.from(table).delete().eq("project_id", projectId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { error: membersError } = await admin
    .from("rehab_members")
    .delete()
    .eq("rehab_project_id", projectId);
  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  const { error: projectError } = await admin.from("rehab_projects").delete().eq("id", projectId);
  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
