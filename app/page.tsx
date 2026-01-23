"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Row = Record<string, any>;

function num(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function money2(v: any) {
  const x = Number(v);
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function money0(v: any) {
  const x = Number(v);
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function pct(v: any) {
  const x = Number(v);
  if (!Number.isFinite(x)) return "-";
  return `${(x * 100).toFixed(1)}%`;
}

const SELECTED_KEY = "ghos_dashboard_selected_property_ids_v1";

export default function DashboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // which properties are included in totals
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  async function load() {
    setLoading(true);
    setErr(null);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    const { data, error } = await supabase
      .from("v_property_tracker")
      .select("*")
      .order("address", { ascending: true });

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const nextRows = (data as any) ?? [];
    setRows(nextRows);

    // initialize selection (once) from localStorage or default to all
    setSelectedIds((prev) => {
      if (prev.size > 0) return prev;

      const raw = typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_KEY) : null;
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            const s = new Set<string>(arr.filter((x) => typeof x === "string"));
            if (s.size > 0) return s;
          }
        } catch {}
      }

      // default: select all properties so totals match the table
      return new Set(nextRows.map((r: any) => String(r.property_id)));
    });

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // persist selection
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SELECTED_KEY, JSON.stringify(Array.from(selectedIds)));
  }, [selectedIds]);

  const selectedRows = useMemo(() => {
    if (selectedIds.size === 0) return [];
    return rows.filter((r) => selectedIds.has(String(r.property_id)));
  }, [rows, selectedIds]);

  const totals = useMemo(() => {
    let initial = 0;
    let post = 0;
    let reserveBucket = 0;

    for (const r of selectedRows) {
      initial += num(r.net_cash_flow_calc);
      post += num(r.net_cash_flow_post_refi_calc);
      reserveBucket += num(r.reserve_bucket_total_calc); // from view
    }

    return { initial, post, reserveBucket, countSelected: selectedRows.length, countAll: rows.length };
  }, [rows, selectedRows]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(rows.map((r) => String(r.property_id))));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function deleteProperty(propertyId: string, address: string) {
    const ok = window.confirm(
      `Delete property:\n\n${address}\n\nThis will also attempt to delete its underwriting row, transactions, and rehab project data (best-effort). Continue?`
    );
    if (!ok) return;

    setErr(null);
    try {
      // rehab cleanup (best-effort)
      const pr = await supabase.from("rehab_projects").select("id").eq("property_id", propertyId);
      const projectIds = ((pr.data as any) ?? []).map((x: any) => x.id);

      if (projectIds.length > 0) {
        await supabase.from("rehab_tasks").delete().in("project_id", projectIds);
        await supabase.from("rehab_notes").delete().in("project_id", projectIds);
        await supabase.from("rehab_photos").delete().in("project_id", projectIds);
        await supabase.from("rehab_projects").delete().eq("property_id", propertyId);
      }

      // underwriting
      await supabase.from("property_underwriting").delete().eq("property_id", propertyId);

      // transactions (delete; if you'd rather detach, tell me)
      await supabase.from("transactions").delete().eq("property_id", propertyId);

      // property
      const del = await supabase.from("properties").delete().eq("id", propertyId);
      if (del.error) throw new Error(del.error.message);

      // update selection + reload
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(propertyId);
        return n;
      });

      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <main className="py-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-300 mt-1">Portfolio overview</p>
          <div className="mt-3">
            <a className="rounded-xl bg-white text-black px-3 py-2" href="/properties/new">
              + Add Property
            </a>
          </div>
        </div>

        <button
          className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white"
          onClick={load}
        >
          Refresh
        </button>
      </div>

      {/* Totals */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card label="Properties (selected / total)" value={`${totals.countSelected} / ${totals.countAll}`} />
        <Card label="Reserve Bucket Total (mo)" value={money2(totals.reserveBucket)} />
        <Card label="Portfolio Cashflow (mo) — Initial" value={money2(totals.initial)} />
        <Card label="Portfolio Cashflow (mo) — Post-Refi" value={money2(totals.post)} />
      </div>

      {loading && <p className="mt-6 text-slate-300">Loading...</p>}
      {err && <p className="mt-6 text-red-400">{err}</p>}

      {/* Selector */}
      {!loading && !err && (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-semibold">Totals Property Selector</h2>
              <p className="text-sm text-slate-400 mt-1">
                Choose which properties count toward the totals above. Saved on this device.
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white"
                onClick={selectAll}
              >
                Select all
              </button>
              <button
                className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white"
                onClick={clearSelection}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            {rows.map((r) => {
              const id = String(r.property_id);
              const checked = selectedIds.has(id);
              return (
                <div
                  key={id}
                  className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2 flex items-center justify-between gap-3"
                >
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => toggle(id)} />
                    <div>
                      <div className="text-slate-200 font-medium">{r.address ?? "-"}</div>
                      <div className="text-xs text-slate-400">{r.status ?? "-"}</div>
                    </div>
                  </label>

                  <div className="flex items-center gap-2">
                    <a
                      className="rounded-lg border border-slate-700 px-2 py-1 text-slate-200 hover:text-white"
                      href={`/properties/${id}`}
                    >
                      Open
                    </a>
                    <button
                      className="rounded-lg border border-red-800/60 px-2 py-1 text-red-300 hover:text-red-200"
                      onClick={() => deleteProperty(id, r.address ?? id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && <div className="text-sm text-slate-500">No properties.</div>}
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Tip: totals use only the checked properties above.
          </div>
        </section>
      )}

      {/* Table */}
      {!loading && !err && (
        <div className="mt-6 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/40">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-slate-950/40">
              <tr>
                <th className="text-left p-3">Address</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Rent</th>
                <th className="text-right p-3">Initial CF</th>
                <th className="text-right p-3">Post-Refi CF</th>
                <th className="text-right p-3">Max HELOC (B/E)</th>
                <th className="text-right p-3">Min LTV (B/E)</th>
                <th className="text-left p-3">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.property_id} className="border-t border-slate-800">
                  <td className="p-3">{r.address ?? "-"}</td>
                  <td className="p-3">{r.status ?? "-"}</td>
                  <td className="p-3 text-right">{money0(r.rent_est)}</td>
                  <td className="p-3 text-right">{money2(r.net_cash_flow_calc)}</td>
                  <td className="p-3 text-right">{money2(r.net_cash_flow_post_refi_calc)}</td>
                  <td className="p-3 text-right">{money0(r.max_heloc_budget_break_even_calc)}</td>
                  <td className="p-3 text-right">{pct(r.min_refi_ltv_break_even_calc)}</td>
                  <td className="p-3">
                    <a className="underline text-slate-200 hover:text-white" href={`/properties/${r.property_id}`}>
                      Details
                    </a>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="p-3" colSpan={8}>
                    No results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-sm text-slate-300">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
