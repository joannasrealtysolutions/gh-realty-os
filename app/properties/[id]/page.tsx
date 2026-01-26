"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type TrackerRow = {
  property_id: string;
  address: string;
  status: string;
  square_footage: number | null;

  list_price: number | null;
  market_price_per_sf: number | null;
  upgrade_premium: number | null;
  adjustment_factor: number | null;
  purchase_price_actual: number | null;
  rehab_cost_est: number | null;
  heloc_balance_est: number | null;
  rent_est: number | null;
  utilities_est: number | null;
  admin_monthly_est: number | null;

  closing_costs_pct: number | null;
  down_payment_pct: number | null;
  piti_factor: number | null;
  vacancy_pct: number | null;
  reserves_pct: number | null;
  maintenance_pct: number | null;
  heloc_interest_pct: number | null;
  heloc_fee_pct: number | null;
  refi_ltv: number | null;
  refi_cost_pct: number | null;

  offer_80pct_of_list: number | null;
  arv_market_based_calc: number | null;
  arv_cost_based_calc: number | null;
  max_purchase_price_calc: number | null;

  down_payment_calc: number | null;
  closing_costs_calc: number | null;
  loan_amount_calc: number | null;
  estimated_piti_calc: number | null;

  vacancy_calc: number | null;
  reserves_calc: number | null;
  maintenance_calc: number | null;
  reserve_bucket_total_calc: number | null;

  heloc_payment_calc: number | null;

  net_cash_flow_calc: number | null;
  annual_net_cash_flow_calc: number | null;

  refi_amount_calc: number | null;
  refi_costs_calc: number | null;
  refi_net_proceeds_after_loan_calc: number | null;
  heloc_remaining_after_refi_calc: number | null;
  cash_to_you_after_refi_and_heloc_calc: number | null;
  total_cash_invested_calc: number | null;
  cash_left_in_deal_after_refi_calc: number | null;

  carrying_cost_2mo_vacancy_calc: number | null;
  max_heloc_budget_break_even_calc: number | null;
  min_refi_ltv_break_even_calc: number | null;

  refi_piti_calc: number | null;
  net_cash_flow_post_refi_calc: number | null;
  annual_net_cash_flow_post_refi_calc: number | null;
};

const PORTFOLIO_STATUSES = new Set(["Owned", "Under Contract", "Closing", "Rented", "Rehab"]);

function money0(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function money2(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return `${(Number(n) * 100).toFixed(1)}%`;
}

export default function PropertyDetailPage() {
  const params = useParams();
  const id = String(params.id || "");

  const [row, setRow] = useState<TrackerRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
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
      .eq("property_id", id)
      .single();

    if (error) {
      setErr(error.message);
      setRow(null);
    } else {
      setRow((data as TrackerRow) ?? null);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [id, load]);

  const isPortfolio = useMemo(() => (row ? PORTFOLIO_STATUSES.has(row.status) : false), [row]);

  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{row?.address ?? "Property"}</h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Badge text={row?.status ?? "-"} tone={isPortfolio ? "good" : "neutral"} />
            <span className="text-sm text-slate-400">ID: {id}</span>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" onClick={load}>
            Refresh
          </button>
          <Link className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" href="/properties">
            Back
          </Link>
          <Link className="rounded-xl bg-white text-black px-3 py-2" href={`/properties/${id}/edit`}>
            Edit Inputs
          </Link>
        </div>
      </div>

      {loading && <p className="mt-6 text-slate-300">Loading...</p>}
      {err && <p className="mt-6 text-red-400">{err}</p>}

      {!loading && !err && row && (
        <>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card label="Rent (mo)" value={money0(row.rent_est)} />
            <Card label="Initial Cashflow (mo)" value={money2(row.net_cash_flow_calc)} />
            <Card label="Post-Refi Cashflow (mo)" value={money2(row.net_cash_flow_post_refi_calc)} />
            <Card label="Cash Left in Deal (post-refi)" value={money0(row.cash_left_in_deal_after_refi_calc)} />
          </div>

          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold">Inputs Snapshot</h2>
                <p className="text-sm text-slate-400 mt-1">Quick view only — edit on the Edit page.</p>
              </div>
              <Link className="underline text-slate-200 hover:text-white" href={`/properties/${id}/edit`}>
                Edit →
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <Info label="Sq Ft" value={row.square_footage ?? "-"} />
              <Info label="List Price" value={money0(row.list_price)} />
              <Info label="Purchase Price (used)" value={money0(row.purchase_price_actual)} />

              <Info label="Rehab (est)" value={money0(row.rehab_cost_est)} />
              <Info label="HELOC Balance (est)" value={money0(row.heloc_balance_est)} />
              <Info label="ARV $/SqFt" value={money2(row.market_price_per_sf)} />

              <Info label="Adjustment Factor" value={pct(row.adjustment_factor)} />
              <Info label="Upgrade Premium" value={money0(row.upgrade_premium)} />
              <Info label="Refi LTV" value={pct(row.refi_ltv)} />

              <Info label="Vacancy %" value={pct(row.vacancy_pct)} />
              <Info label="Reserves %" value={pct(row.reserves_pct)} />
              <Info label="Maintenance %" value={pct(row.maintenance_pct)} />
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold">Monthly Reserves Bucket</h2>
            <p className="text-sm text-slate-400 mt-1">Based on rent × percentages.</p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Panel title="Reserve Components (monthly $)">
                <KeyRow label="Vacancy ($)" value={money2(row.vacancy_calc)} explain={<Explain text={`vacancy_calc = rent_est × vacancy_pct`} />} />
                <KeyRow label="Reserves ($)" value={money2(row.reserves_calc)} explain={<Explain text={`reserves_calc = rent_est × reserves_pct`} />} />
                <KeyRow label="Maintenance ($)" value={money2(row.maintenance_calc)} explain={<Explain text={`maintenance_calc = rent_est × maintenance_pct`} />} />
                <Divider />
                <KeyRow label="TOTAL Reserve Bucket ($)" value={money2(row.reserve_bucket_total_calc)} explain={<Explain text={`total = vacancy + reserves + maintenance`} />} />
              </Panel>

              <Panel title="Notes">
                <p className="text-sm text-slate-300">
                  This bucket is separate from PITI, utilities, admin, and HELOC payments.
                </p>
              </Panel>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-semibold">Initial Deal Outputs</h2>
            <p className="text-sm text-slate-400 mt-1">Based on purchase + HELOC + assumptions</p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Panel title="Underwriting Targets">
                <KeyRow label="Offer (80% of list)" value={money0(row.offer_80pct_of_list)} explain={<Explain text={`list_price × 0.80`} />} />
                <KeyRow label="Max Purchase Price (calc)" value={money0(row.max_purchase_price_calc)} explain={<Explain text={`(ARV_market × 0.75) − rehab`} />} />
                <KeyRow label="ARV (Market Based)" value={money0(row.arv_market_based_calc)} explain={<Explain text={`(sqft × market_psf) × (1 + adjustment)`} />} />
                <KeyRow label="ARV (Cost Based)" value={money0(row.arv_cost_based_calc)} explain={<Explain text={`purchase + rehab + upgrade_premium`} />} />
              </Panel>

              <Panel title="Financing + Monthly Expenses">
                <KeyRow label="Down Payment" value={money0(row.down_payment_calc)} explain={<Explain text={`purchase × down%`} />} />
                <KeyRow label="Closing Costs" value={money0(row.closing_costs_calc)} explain={<Explain text={`purchase × closing%`} />} />
                <KeyRow label="Loan Amount" value={money0(row.loan_amount_calc)} explain={<Explain text={`purchase − down`} />} />
                <KeyRow label="PITI (est / mo)" value={money2(row.estimated_piti_calc)} explain={<Explain text={`loan × piti_factor`} />} />
                <KeyRow
                  label="HELOC Payment (est / mo)"
                  value={money2(row.heloc_payment_calc)}
                  explain={<Explain text={`heloc_balance × ((heloc_interest_pct + heloc_fee_pct) / 12)`} />}
                />
              </Panel>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Panel title="Operating Costs (monthly)">
                <KeyRow label="Vacancy" value={money2(row.vacancy_calc)} explain={<Explain text={`vacancy_calc = rent_est × vacancy_pct`} />} />
                <KeyRow label="Reserves" value={money2(row.reserves_calc)} explain={<Explain text={`reserves_calc = rent_est × reserves_pct`} />} />
                <KeyRow label="Maintenance" value={money2(row.maintenance_calc)} explain={<Explain text={`maintenance_calc = rent_est × maintenance_pct`} />} />
                <KeyRow label="Utilities (est)" value={money2(row.utilities_est)} explain={<Explain text={`utilities_est = input`} />} />
                <KeyRow label="Admin (est)" value={money2(row.admin_monthly_est)} explain={<Explain text={`admin_monthly_est = input`} />} />
              </Panel>

              <Panel title="Cashflow">
                <KeyRow label="Net Cashflow (mo)" value={money2(row.net_cash_flow_calc)} explain={<Explain text={`rent − (PITI + reserves + utilities + admin + heloc)`} />} />
                <KeyRow label="Net Cashflow (yr)" value={money2(row.annual_net_cash_flow_calc)} explain={<Explain text={`monthly × 12`} />} />
              </Panel>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-semibold">Rehab / HELOC Break-Even</h2>
            <p className="text-sm text-slate-400 mt-1">Max rehab/HELOC budget + minimum LTV to break even.</p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Panel title="Break-Even Metrics">
                <KeyRow label="2-Month Vacancy Carrying Cost" value={money0(row.carrying_cost_2mo_vacancy_calc)} explain={<Explain text={`2 × (PITI + utilities + admin)`} />} />
                <KeyRow
                  label="Max Rehab/HELOC Budget (break-even)"
                  value={money0(row.max_heloc_budget_break_even_calc)}
                  explain={
                    <Explain text={`Calculated in v_property_tracker using ARV, refi costs, loan payoff, HELOC balance, and carrying costs.`} />
                  }
                />
                <Divider />
                <KeyRow
                  label="Min Refi LTV Required (break-even)"
                  value={pct(row.min_refi_ltv_break_even_calc)}
                  explain={<Explain text={`Calculated in v_property_tracker using ARV, loan payoff, rehab budget, and refi costs.`} />}
                />
              </Panel>

              <Panel title="Interpretation">
                <p className="text-sm text-slate-300">
                  Max HELOC budget = your rehab cap to come out even after refi under assumptions.
                  Min LTV = how much refi leverage you need for break-even (if &gt; 100%, assumptions don’t allow break-even).
                </p>
              </Panel>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-semibold">Refi Summary</h2>
            <p className="text-sm text-slate-400 mt-1">Based on ARV (market) × Refi LTV and refi costs %.</p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Panel title="Refi Proceeds + Payoffs">
                <KeyRow label="Refi Amount" value={money0(row.refi_amount_calc)} explain={<Explain text={`refi_amount = ARV (market) × refi_ltv`} />} />
                <KeyRow label="Refi Costs" value={money0(row.refi_costs_calc)} explain={<Explain text={`refi_costs = refi_amount × refi_cost_pct`} />} />
                <KeyRow
                  label="Net Proceeds after paying off initial loan"
                  value={money0(row.refi_net_proceeds_after_loan_calc)}
                  explain={<Explain text={`refi_amount − loan payoff − refi_costs`} />}
                />
              </Panel>

              <Panel title="HELOC + Cash Returned">
                <KeyRow
                  label="HELOC Remaining after refi"
                  value={money0(row.heloc_remaining_after_refi_calc)}
                  explain={<Explain text={`Calculated in v_property_tracker using HELOC balance and refi proceeds.`} />}
                />
                <KeyRow
                  label="Cash to You after refi + HELOC payoff"
                  value={money0(row.cash_to_you_after_refi_and_heloc_calc)}
                  explain={<Explain text={`Refi proceeds minus loan payoff, HELOC payoff, and refi costs.`} />}
                />
                <Divider />
                <KeyRow label="Total Cash Invested (all-in)" value={money0(row.total_cash_invested_calc)} explain={<Explain text={`Excludes HELOC-funded rehab`} />} />
                <KeyRow
                  label="Cash Left in Deal (post-refi)"
                  value={money0(row.cash_left_in_deal_after_refi_calc)}
                  explain={<Explain text={`Calculated in v_property_tracker using total cash invested and cash returned.`} />}
                />
              </Panel>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-semibold">Post-Refi Monthly Cashflow</h2>
            <p className="text-sm text-slate-400 mt-1">Uses refi loan PITI + remaining HELOC + assumptions.</p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Panel title="Post-Refi Payment Changes">
                <KeyRow label="Refi PITI (est / mo)" value={money2(row.refi_piti_calc)} explain={<Explain text={`refi_amount × piti_factor`} />} />
                <KeyRow
                  label="HELOC Remaining (after refi)"
                  value={money0(row.heloc_remaining_after_refi_calc)}
                  explain={<Explain text={`Calculated in v_property_tracker using HELOC balance and refi proceeds.`} />}
                />
              </Panel>

              <Panel title="Post-Refi Cashflow">
                <KeyRow
                  label="Net Cashflow (mo)"
                  value={money2(row.net_cash_flow_post_refi_calc)}
                  explain={<Explain text={`rent − (refi_piti + reserves + utilities + admin + HELOC payment)`} />}
                />
                <KeyRow label="Net Cashflow (yr)" value={money2(row.annual_net_cash_flow_post_refi_calc)} explain={<Explain text={`monthly × 12`} />} />
              </Panel>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Explain({ text }: { text: string }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">How calculated</summary>
      <div className="mt-2 text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">{text}</div>
    </details>
  );
}

function Badge({ text, tone }: { text: string; tone: "good" | "neutral" }) {
  const cls =
    tone === "good"
      ? "border-emerald-700/60 bg-emerald-900/30 text-emerald-200"
      : "border-slate-700 bg-slate-900/40 text-slate-200";
  return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs ${cls}`}>{text}</span>;
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-sm text-slate-300">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-4 space-y-2">{children}</div>
    </div>
  );
}

function KeyRow({ label, value, explain }: { label: string; value: string; explain?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4 text-sm">
        <div className="text-slate-300">{label}</div>
        <div className="text-slate-100 font-medium">{value}</div>
      </div>
      {explain ? <div>{explain}</div> : null}
    </div>
  );
}

function Divider() {
  return <div className="my-3 border-t border-slate-800" />;
}

function Info({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-sm text-slate-100">{String(value)}</div>
    </div>
  );
}
