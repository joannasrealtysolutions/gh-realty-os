"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type P = { id: string; address: string; status: string };

const STATUS_ORDER = [
  "Owned",
  "Rented",
  "Rehab",
  "Under Contract",
  "Closing",
  "Offer Pending",
  "Analyzing",
  "Lead",
  "Dead",
];

export default function PropertiesPage() {
  const [rows, setRows] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    const { data, error } = await supabase
      .from("properties")
      .select("id,address,status")
      .order("address", { ascending: true });

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

  const grouped = useMemo(() => {
    const m = new Map<string, P[]>();
    for (const s of STATUS_ORDER) m.set(s, []);
    for (const r of rows) {
      const key = m.has(r.status) ? r.status : "Lead";
      m.get(key)!.push(r);
    }
    return m;
  }, [rows]);

  return (
    <main className="py-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Properties</h1>
          <p className="text-sm text-slate-300 mt-1">Grouped by status</p>
        </div>

        <button className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" onClick={load}>
          Refresh
        </button>
      </div>

      {loading && <p className="mt-6 text-slate-300">Loading...</p>}
      {err && <p className="mt-6 text-red-400">{err}</p>}

      {!loading && !err && (
        <div className="mt-8 space-y-6">
          {STATUS_ORDER.map((status) => {
            const items = grouped.get(status) ?? [];
            return (
              <section key={status} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{status}</h2>
                  <span className="text-sm text-slate-400">{items.length}</span>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map((p) => (
                    <a
                      key={p.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 hover:bg-slate-900/60"
                      href={`/properties/${p.id}`}
                    >
                      <div className="font-medium">{p.address}</div>
                      <div className="text-sm text-slate-400 mt-1">{p.status}</div>
                    </a>
                  ))}

                  {items.length === 0 && <div className="text-sm text-slate-500">No properties.</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
