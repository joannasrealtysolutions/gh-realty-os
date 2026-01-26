import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey)
    : null;

type RehabPayload = {
  property_id: string;
  title: string;
  status: string;
  budget_target: number | null;
  start_date: string | null;
  target_end_date: string | null;
};

export async function POST(req: Request) {
  if (!supabaseUrl || !serviceRoleKey || !admin) {
    return NextResponse.json(
      { error: "Server missing Supabase configuration." },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }

  const token = authHeader.split(" ")[1].trim();
  if (!token) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.id) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to verify your identity." },
      { status: 401 }
    );
  }

  const body = (await req.json()) as RehabPayload;
  if (!body.property_id || !body.title) {
    return NextResponse.json({ error: "Property and title are required." }, { status: 400 });
  }

  const payload: RehabPayload = {
    property_id: body.property_id,
    title: body.title.trim(),
    status: body.status,
    budget_target:
      typeof body.budget_target === "number" && Number.isFinite(body.budget_target)
        ? body.budget_target
        : null,
    start_date: body.start_date || null,
    target_end_date: body.target_end_date || null,
  };

  const { data: insertedProject, error: projectError } = await admin
    .from("rehab_projects")
    .insert(payload)
    .select("id")
    .single();

  if (projectError || !insertedProject?.id) {
    return NextResponse.json(
      { error: projectError?.message ?? "Failed to create project." },
      { status: 500 }
    );
  }

  const { error: memberError } = await admin.from("rehab_members").insert({
    rehab_project_id: insertedProject.id,
    user_id: data.user.id,
  });

  if (memberError) {
    return NextResponse.json(
      { error: memberError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: insertedProject.id });
}
