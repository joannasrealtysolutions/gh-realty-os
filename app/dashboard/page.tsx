"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type TrackerRow = {
  property_id: string;
  address: string;
  status: string;
  net_cash_flow_calc: number | null;
  net_cash_flow_post_refi_calc: number | null;
  reserve_bucket_total_calc?: number | null; // comes from v_property_tracker
};

type Tx = {
  id: string;
  date: string;
  type: "income" | "expense";
  amount: number;
  properties?: { address: string }[] | null;
};

const PORTFOLIO_STATUSES = new Set(["Owned", "Under Contract", "Closing", "Rented", "Rehab"]);

function money(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return Number(n).toFixed(2);
}

const SELECTED_KEY = "ghos_dashboard_selected_property_ids_v1";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [props, setProps] = useState<TrackerRow[]>([]);
  const [tx, setTx] = useState<Tx[]>([]);

  // property selection for totals
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

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
      .select("property_id,address,status,net_cash_flow_calc,net_cash_flow_post_refi_calc,reserve_bucket_total_calc");

    const tRes = await supabase
      .from("transactions")
      .select("id,date,type,amount, properties:property_id(address)")
      .order("date", { ascending: false })
      .limit(10);

    if (pRes.error) setErr(pRes.error.message);
    if (tRes.error) setErr(tRes.error.message);

    const nextProps = ((pRes.data as TrackerRow[]) ?? []);
    setProps(nextProps);
    setTx((tRes.data as Tx[]) ?? []);
    setLoading(false);

    // initialize selection if empty
    setSelectedIds((prev) => {
      // if already have selection, keep it
      if (prev.size > 0) return prev;

      // try localStorage
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_KEY) : null;
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            const s = new Set<string>(arr.filter((x) => typeof x === "string"));
            // if saved selection no longer exists, fall back
            if (s.size > 0) return s;
          }
        } catch {}
      }

      // default: select portfolio statuses (or all if none)
      const portfolioIds = nextProps.filter((p) => PORTFOLIO_STATUSES.has(p.status)).map((p) => p.property_id);
      if (portfolioIds.length > 0) return new Set(portfolioIds);
      return new Set(nextProps.map((p) => p.property_id));
    });
  }

  useEffect(() => {
    load();
  }, []);

  // persist selection
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SELECTED_KEY, JSON.stringify(Array.from(selectedIds)));
  }, [selectedIds]);

  const portfolio = useMemo(() => props.filter((p) => PORTFOLIO_STATUSES.has(p.status)), [props]);
  const leads = useMemo(() => props.filter((p) => !PORTFOLIO_STATUSES.has(p.status)), [props]);

  const selectedProps = useMemo(
    () => props.filter((p) => selectedIds.has(p.property_id)),
    [props, selectedIds]
  );

  const portfolioMonthlyCF = useMemo(
    () => selectedProps.reduce((s, p) => s + Number(p.net_cash_flow_calc || 0), 0),
    [selectedProps]
  );

  const portfolioMonthlyCFPostRefi = useMemo(
    () => selectedProps.reduce((s, p) => s + Number(p.net_cash_flow_post_refi_calc || 0), 0),
    [selectedProps]
  );

  const portfolioReserveBucketTotal = useMemo(
    () => selectedProps.reduce((s, p) => s + Number(p.reserve_bucket_total_calc || 0), 0),
    [selectedProps]
  );

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(props.map((p) => p.property_id)));
  }

  function selectPortfolioOnly() {
    setSelectedIds(new Set(props.filter((p) => PORTFOLIO_STATUSES.has(p.status)).map((p) => p.property_id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function deleteProperty(propertyId: string, address: string) {
    const ok = window.confirm(
      `Delete property:\n\n${address}\n\nThis may also delete related underwriting / rehab / transactions depending on your DB constraints. Continue?`
    );
    if (!ok) return;

    setErr(null);
    try {
      // Best-effort child cleanup (safe even if cascades exist)
      // 1) rehab projects (and their children) by property_id
      const pr = await supabase.from("rehab_projects").select("id").eq("property_id", propertyId);
      const projectIds = ((pr.data as { id: string }[]) ?? []).map((x) => x.id);

      if (projectIds.length > 0) {
        // children tables (if your FK is cascade you can ignore; deletes will just no-op)
        await supabase.from("rehab_tasks").delete().in("project_id", projectIds);
        await supabase.from("rehab_notes").delete().in("project_id", projectIds);
        await supabase.from("rehab_photos").delete().in("project_id", projectIds);
        await supabase.from("rehab_projects").delete().eq("property_id", propertyId);
      }

      // 2) underwriting
      await supabase.from("property_underwriting").delete().eq("property_id", propertyId);

      // 3) transactions (either delete or detach; here we delete to match your request)
      await supabase.from("transactions").delete().eq("property_id", propertyId);

      // 4) property
      const del = await supabase.from("properties").delete().eq("id", propertyId);
      if (del.error) throw new Error(del.error.message);

      // update selection + reload
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(propertyId);
        return n;
      });

      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
    }
  }

  return (
    <main className="p-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-300 mt-1">Portfolio overview + recent activity</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link className="rounded-xl bg-white text-black px-3 py-2" href="/properties/new">
            + New Property
          </Link>
          <Link className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" href="/properties">
            Properties
          </Link>
          <Link className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" href="/money">
            Money
          </Link>
          <button
            className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white"
            onClick={load}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <p className="mt-6 text-slate-300">Loading...</p>}
      {err && <p className="mt-6 text-red-400">{err}</p>}

      {!loading && !err && (
        <>
          {/* Totals */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card label="Portfolio Properties" value={String(portfolio.length)} />
            <Card label="Leads" value={String(leads.length)} />
            <Card label="Reserve Bucket Total (Monthly)" value={money(portfolioReserveBucketTotal)} />
            <Card label="Portfolio CF (Monthly)" value={money(portfolioMonthlyCF)} />
            <Card label="Portfolio CF Post-Refi (Monthly)" value={money(portfolioMonthlyCFPostRefi)} />
          </div>

          {/* Selector */}
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-semibold">Totals Property Selector</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Choose which properties are included in the totals above. Saved on this device.
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white"
                  onClick={selectPortfolioOnly}
                >
                  Portfolio only
                </button>
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
              {props
                .slice()
                .sort((a, b) => (a.address || "").localeCompare(b.address || ""))
                .map((p) => {
                  const checked = selectedIds.has(p.property_id);
                  return (
                    <div
                      key={p.property_id}
                      className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(p.property_id)}
                        />
                        <div>
                          <div className="text-slate-200 font-medium">{p.address ?? "-"}</div>
                          <div className="text-xs text-slate-400">{p.status ?? "-"}</div>
                        </div>
                      </label>

                      <div className="flex items-center gap-2">
                        <Link className="rounded-lg border border-slate-700 px-2 py-1 text-slate-200 hover:text-white" href={`/properties/${p.property_id}`}>
                          Open
                        </Link>
                        <button
                          className="rounded-lg border border-red-800/60 px-2 py-1 text-red-300 hover:text-red-200"
                          onClick={() => deleteProperty(p.property_id, p.address)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Included in totals: <span className="text-slate-300">{selectedIds.size}</span> / {props.length}
            </div>
          </div>

          {/* Bottom panels */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <h2 className="font-semibold">Recent Transactions</h2>
              <div className="mt-3 space-y-2 text-sm">
                {tx.length === 0 && <div className="text-slate-400">No transactions yet.</div>}
                {tx.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2">
                    <div className="text-slate-200">
                      <div className="font-medium">{t.properties?.[0]?.address ?? "-"}</div>
                      <div className="text-slate-400">
                        {t.date} • {t.type}
                      </div>
                    </div>
                    <div className="text-slate-200">{money(t.amount)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <h2 className="font-semibold">Quick Actions</h2>
              <div className="mt-4 flex flex-col gap-2">
                <Link className="rounded-xl bg-white text-black px-4 py-2" href="/properties">
                  Review Properties
                </Link>
                <Link className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200 hover:text-white" href="/properties/new">
                  Add New Property
                </Link>
                <Link className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200 hover:text-white" href="/transactions/new">
                  Add Transaction
                </Link>
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
