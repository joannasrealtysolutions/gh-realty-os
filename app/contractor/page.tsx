"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Project = {
  id: string;
  property_id: string;
  title: string;
  status: string;
  budget_target: number | null;
  start_date: string | null;
  target_end_date: string | null;
};

export default function ContractorHomePage() {
  const [rows, setRows] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    const { data: s } = await supabase.auth.getSession();
    if (!s.session) {
      window.location.href = "/login";
      return;
    }

    // RLS ensures contractor only sees their assigned rehab_projects
    const { data, error } = await supabase
      .from("rehab_projects")
      .select("id,property_id,title,status,budget_target,start_date,target_end_date")
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows((data as Project[]) ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <main className="py-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Contractor Portal</h1>
          <p className="text-sm text-slate-300 mt-1">Your assigned rehab projects</p>
        </div>

        <button
          className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 hover:text-white"
          onClick={load}
        >
          Refresh
        </button>
      </div>

      {loading && <p className="mt-6 text-slate-300">Loading...</p>}
      {err && <p className="mt-6 text-red-400">{err}</p>}

      {!loading && !err && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((p) => (
            <a
              key={p.id}
              href={`/contractor/project/${p.id}`}
              className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5 hover:bg-slate-900/50"
            >
              <div className="text-lg font-semibold text-slate-100">{p.title}</div>
              <div className="mt-2 text-sm text-slate-300">
                Status: <span className="text-slate-100">{p.status}</span>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Project ID: {p.id} • Property ID: {p.property_id}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Start: {p.start_date ?? "-"} • Target end: {p.target_end_date ?? "-"}
              </div>
            </a>
          ))}

          {rows.length === 0 && (
            <div className="text-sm text-slate-400">
              No projects assigned yet. (Owner needs to add you to rehab_members.)
            </div>
          )}
        </div>
      )}
    </main>
  );
}
