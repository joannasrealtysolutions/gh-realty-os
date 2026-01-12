"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type TrackerRow = {
  property_id: string;
  address: string;
  status: string;
  net_cash_flow_calc: number | null;
  net_cash_flow_post_refi_calc: number | null;
};

type Tx = {
  id: string;
  date: string;
  type: "income" | "expense";
  amount: number;
  properties?: { address: string } | null;
};

const PORTFOLIO_STATUSES = new Set(["Owned", "Under Contract", "Closing", "Rented", "Rehab"]);

function money(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return Number(n).toFixed(2);
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [props, setProps] = useState<TrackerRow[]>([]);
  const [tx, setTx] = useState<Tx[]>([]);

  async function load() {
    setLoading(true);
    setErr(null);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    const pRes = await supabase
      .from("v_property_tracker")
      .select("property_id,address,status,net_cash_flow_calc,net_cash_flow_post_refi_calc");

    const tRes = await supabase
      .from("transactions")
      .select("id,date,type,amount, properties:property_id(address)")
      .order("date", { ascending: false })
      .limit(10);

    if (pRes.error) setErr(pRes.error.message);
    if (tRes.error) setErr(tRes.error.message);

    setProps((pRes.data as any) ?? []);
    setTx((tRes.data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const portfolio = useMemo(() => props.filter((p) => PORTFOLIO_STATUSES.has(p.status)), [props]);
  const leads = useMemo(() => props.filter((p) => !PORTFOLIO_STATUSES.has(p.status)), [props]);

  const portfolioMonthlyCF = useMemo(
    () => portfolio.reduce((s, p) => s + Number(p.net_cash_flow_calc || 0), 0),
    [portfolio]
  );

  const portfolioMonthlyCFPostRefi = useMemo(
    () => portfolio.reduce((s, p) => s + Number(p.net_cash_flow_post_refi_calc || 0), 0),
    [portfolio]
  );

  return (
    <main className="p-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-300 mt-1">Portfolio overview + recent activity</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <a className="rounded-xl bg-white text-black px-3 py-2" href="/properties/new">
            + New Property
          </a>
          <a className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" href="/properties">
            Properties
          </a>
          <a className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" href="/money">
            Money
          </a>
        </div>
      </div>

      {loading && <p className="mt-6 text-slate-300">Loading...</p>}
      {err && <p className="mt-6 text-red-400">{err}</p>}

      {!loading && !err && (
        <>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card label="Portfolio Properties" value={String(portfolio.length)} />
            <Card label="Leads" value={String(leads.length)} />
            <Card label="Portfolio CF (Monthly)" value={money(portfolioMonthlyCF)} />
            <Card label="Portfolio CF Post-Refi (Monthly)" value={money(portfolioMonthlyCFPostRefi)} />
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <h2 className="font-semibold">Recent Transactions</h2>
              <div className="mt-3 space-y-2 text-sm">
                {tx.length === 0 && <div className="text-slate-400">No transactions yet.</div>}
                {tx.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2">
                    <div className="text-slate-200">
                      <div className="font-medium">{t.properties?.address ?? "-"}</div>
                      <div className="text-slate-400">{t.date} • {t.type}</div>
                    </div>
                    <div className="text-slate-200">{money(t.amount)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <h2 className="font-semibold">Quick Actions</h2>
              <div className="mt-4 flex flex-col gap-2">
                <a className="rounded-xl bg-white text-black px-4 py-2" href="/properties">
                  Review Properties
                </a>
                <a className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200 hover:text-white" href="/properties/new">
                  Add New Property
                </a>
                <a className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200 hover:text-white" href="/transactions/new">
                  Add Transaction
                </a>
              </div>
            </div>
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
