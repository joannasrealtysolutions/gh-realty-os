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

  if (error) {
    return { error: error.message };
  }

  if (!data) {
    return { error: "You are not a member of this rehab project." };
  }

  return { ok: true };
}

async function resolveUserId(options: { userId?: string; email?: string }) {
  if (!admin) return { error: "Supabase admin client not configured." };
  if (options.userId) return { userId: options.userId };
  if (!options.email) return { error: "Email or user ID is required." };

  const { data, error } = await admin
    .from("auth.users")
    .select("id,email")
    .eq("email", options.email)
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data?.id) return { error: "No user found for that email." };
  return { userId: data.id };
}

async function fetchMembers(projectId: string) {
  const { data, error } = await admin!
    .from("rehab_members")
    .select("rehab_project_id,user_id,role")
    .eq("rehab_project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const members = await Promise.all(
    (data ?? []).map(async (member) => {
      try {
        const { data: userData } = await admin!.auth.getUser(member.user_id);
        return {
          user_id: member.user_id,
          email: userData?.email ?? null,
          role: member.role ?? null,
        };
      } catch {
        return {
          user_id: member.user_id,
          email: null,
          role: member.role ?? null,
        };
      }
    })
  );

  return members;
}

export async function GET(req: Request) {
  if (!admin) {
    return NextResponse.json({ error: "Server missing Supabase configuration." }, { status: 500 });
  }

  const auth = await getSessionUser(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required." }, { status: 400 });
  }

  const access = await ensureProjectAccess(projectId, auth.userId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  try {
    const members = await fetchMembers(projectId);
    return NextResponse.json({ members });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!admin) {
    return NextResponse.json({ error: "Server missing Supabase configuration." }, { status: 500 });
  }

  const auth = await getSessionUser(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const body = (await req.json()) as {
    project_id?: string;
    user_id?: string;
    email?: string;
    role?: string;
  };

  const projectId = body.project_id ?? body.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required." }, { status: 400 });
  }

  const access = await ensureProjectAccess(projectId, auth.userId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  const target = await resolveUserId({ userId: body.user_id, email: body.email?.toLowerCase() });
  if ("error" in target) {
    return NextResponse.json({ error: target.error }, { status: 404 });
  }

  const { data: existing, error: dupError } = await admin
    .from("rehab_members")
    .select("id")
    .eq("rehab_project_id", projectId)
    .eq("user_id", target.userId)
    .maybeSingle();

  if (dupError) {
    return NextResponse.json({ error: dupError.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ error: "User is already a member of this project." }, { status: 409 });
  }

  const { error: insertError } = await admin.from("rehab_members").insert({
    rehab_project_id: projectId,
    user_id: target.userId,
    role: body.role ?? "contractor",
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
