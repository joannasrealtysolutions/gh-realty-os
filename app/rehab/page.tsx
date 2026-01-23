"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Row = {
  id: string;
  property_id: string;
  title: string;
  status: string;
  budget_target: number | null;
  properties?: { address: string } | null;
};

const COMPLETED_STATUSES = new Set(["Completed", "Closed", "Done"]);

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RehabPage() {
  const [rows, setRows] = useState<Row[]>([]);
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

    const { data, error } = await supabase
      .from("rehab_projects")
      .select("id,property_id,title,status,budget_target, properties:property_id(address)")
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows((data as any) ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const activeRows = rows.filter((r) => !COMPLETED_STATUSES.has(r.status));
  const completedRows = rows.filter((r) => COMPLETED_STATUSES.has(r.status));

  return (
    <main className="py-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Rehab Portal</h1>
          <p className="text-sm text-slate-300 mt-1">Tasks • notes • photos (contractor-safe)</p>
          <div className="mt-2 text-xs text-slate-400">Active: {activeRows.length} • Completed: {completedRows.length}</div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <a
            className="rounded-xl bg-white text-black px-3 py-2 text-sm"
            href="/rehab/new"
          >
            + New Rehab Project
          </a>
          <button className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 hover:text-white" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {loading && <p className="mt-6 text-slate-300">Loading...</p>}
      {err && <p className="mt-6 text-red-400">{err}</p>}

      {!loading && !err && (
        <div className="mt-6 space-y-6">
          <Section title="Active Projects" rows={activeRows} />
          <Section title="Completed Projects" rows={completedRows} />
          {rows.length === 0 && (
            <p className="text-sm text-slate-300">
              No rehab projects yet. Create one by inserting into rehab_projects and adding yourself to rehab_members (I’ll automate this next).
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-auto">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        <span className="text-xs text-slate-400">{rows.length}</span>
      </div>
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-slate-900 text-slate-100">
          <tr>
            <th className="text-left p-3">Property</th>
            <th className="text-left p-3">Project</th>
            <th className="text-left p-3">Status</th>
            <th className="text-right p-3">Budget Target</th>
            <th className="text-left p-3">Open</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/60">
              <td className="p-3 text-slate-200">{r.properties?.address ?? "-"}</td>
              <td className="p-3 text-slate-200">{r.title}</td>
              <td className="p-3 text-slate-200">{r.status}</td>
              <td className="p-3 text-right text-slate-200">{r.budget_target != null ? `$${money(Number(r.budget_target))}` : "-"}</td>
              <td className="p-3">
                <a className="underline text-slate-200 hover:text-white" href={`/rehab/${r.property_id}`}>
                  Open
                </a>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="p-3 text-slate-400" colSpan={5}>
                None.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
