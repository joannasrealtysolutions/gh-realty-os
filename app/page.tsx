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

export default function DashboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
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
      .from("v_property_tracker")
      .select("*")
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

  const totals = useMemo(() => {
    let initial = 0;
    let post = 0;
    for (const r of rows) {
      initial += num(r.net_cash_flow_calc);
      post += num(r.net_cash_flow_post_refi_calc);
    }
    return { initial, post, count: rows.length };
  }, [rows]);

  return (
    <main className="py-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-300 mt-1">Portfolio overview</p>
        </div>

        <button className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card label="Properties" value={String(totals.count)} />
        <Card label="Portfolio Cashflow (mo) — Initial" value={money2(totals.initial)} />
        <Card label="Portfolio Cashflow (mo) — Post-Refi" value={money2(totals.post)} />
      </div>

      {loading && <p className="mt-6 text-slate-300">Loading...</p>}
      {err && <p className="mt-6 text-red-400">{err}</p>}

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
