"use client";

import { useEffect, useMemo, useState } from "react";
<<<<<<< ours
import type { PostgrestSingleResponse } from "@supabase/supabase-js";
=======
>>>>>>> theirs
import { supabase } from "../../lib/supabaseClient";

type Tx = {
  id: string;
  date: string;
  category: string;
  amount: number;
  vendor: string | null;
  description: string | null;
  cost_tag?: string | null;
  properties?: { address: string } | null;
};

function money2(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ClosingCostsPage() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [costTagAvailable, setCostTagAvailable] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    const baseSelect = "id,date,category,amount,vendor,description, properties:property_id(address)";
<<<<<<< ours
    let txRes = (await supabase
      .from("transactions")
      .select(`${baseSelect},cost_tag`)
      .order("date", { ascending: false })
      .limit(2000)) as PostgrestSingleResponse<Tx[]>;
=======
    let txRes = await supabase
      .from("transactions")
      .select(`${baseSelect},cost_tag`)
      .order("date", { ascending: false })
      .limit(2000);
>>>>>>> theirs

    if (txRes.error) {
      const msg = txRes.error.message.toLowerCase();
      if (msg.includes("cost_tag")) {
        setCostTagAvailable(false);
<<<<<<< ours
        txRes = (await supabase
          .from("transactions")
          .select(baseSelect)
          .order("date", { ascending: false })
          .limit(2000)) as PostgrestSingleResponse<Tx[]>;
=======
        txRes = await supabase.from("transactions").select(baseSelect).order("date", { ascending: false }).limit(2000);
>>>>>>> theirs
      }
    }

    if (txRes.error) {
      setErr(txRes.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((txRes.data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const closingRows = useMemo(() => {
    if (costTagAvailable) return rows.filter((r) => r.cost_tag === "closing");
    return rows.filter((r) => String(r.category || "").toLowerCase().includes("closing"));
  }, [rows, costTagAvailable]);

  const totals = useMemo(() => {
    let total = 0;
    for (const r of closingRows) total += Number(r.amount ?? 0);
    return { total, count: closingRows.length };
  }, [closingRows]);

  return (
    <main className="py-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Closing Costs</h1>
          <p className="text-sm text-slate-300 mt-1">Down payment, app fees, and closing-related transactions.</p>
        </div>

        <button className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 hover:text-white" onClick={load}>
          Refresh
        </button>
      </div>

      {!costTagAvailable && (
        <p className="mt-4 text-xs text-slate-500">
          Cost tags require a <span className="text-slate-300">cost_tag</span> column in Supabase. Filtering by category contains
          “closing” instead.
        </p>
      )}

      {loading && <p className="mt-6 text-slate-300">Loading...</p>}
      {err && <p className="mt-6 text-red-400">{err}</p>}

      {!loading && !err && (
        <>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card label="Closing Costs Total" value={`$${money2(totals.total)}`} />
            <Card label="Items" value={String(totals.count)} />
            <Card label="Average / Item" value={totals.count ? `$${money2(totals.total / totals.count)}` : "-"} />
          </div>

          <div className="mt-6 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/30">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-900 text-slate-100">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Property</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-left p-3">Vendor</th>
                  <th className="text-left p-3">Description</th>
                </tr>
              </thead>
              <tbody>
                {closingRows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800">
                    <td className="p-3">{r.date}</td>
                    <td className="p-3">{r.properties?.address ?? "-"}</td>
                    <td className="p-3">{r.category}</td>
                    <td className="p-3 text-right">{money2(r.amount)}</td>
                    <td className="p-3">{r.vendor ?? "-"}</td>
                    <td className="p-3">{r.description ?? "-"}</td>
                  </tr>
                ))}
                {closingRows.length === 0 && (
                  <tr>
                    <td className="p-3 text-slate-400" colSpan={6}>
                      No closing costs tagged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
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
