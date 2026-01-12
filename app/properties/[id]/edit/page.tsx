"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

const STATUS_OPTIONS = [
  "Owned",
  "Under Contract",
  "Closing",
  "Rented",
  "Rehab",
  "Lead",
  "Analyzing",
  "Offer Pending",
  "Dead",
];

function toNumOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toPctOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

type PropertyRow = {
  id: string;
  address: string;
  status: string;
  square_footage: number | null;
  purchase_price_actual: number | null;
};

type UWRow = {
  property_id: string;

  list_price: number | null;
  market_price_per_sf: number | null;
  upgrade_premium: number | null;
  adjustment_factor: number | null;

  purchase_price_actual: number | null;
  rehab_cost_est: number | null;
  heloc_balance_est: number | null;
  rent_est: number | null;

  vacancy_pct: number | null;
  reserves_pct: number | null;
  maintenance_pct: number | null;

  utilities_est: number | null;
  admin_monthly_est: number | null;

  closing_costs_pct: number | null;
  down_payment_pct: number | null;
  piti_factor: number | null;

  heloc_interest_pct: number | null; // APR decimal
  heloc_fee_pct: number | null;      // APR decimal
  refi_ltv: number | null;
  refi_cost_pct: number | null;
};

export default function PropertyEditPage() {
  const params = useParams();
  const id = String(params.id || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("Lead");
  const [sqft, setSqft] = useState("");
  const [purchasePriceActual, setPurchasePriceActual] = useState("");

  const [listPrice, setListPrice] = useState("");
  const [marketPsf, setMarketPsf] = useState("");
  const [upgradePremium, setUpgradePremium] = useState("");
  const [adjustmentFactor, setAdjustmentFactor] = useState("");

  const [uwPurchasePriceActual, setUwPurchasePriceActual] = useState("");
  const [rehabCost, setRehabCost] = useState("");
  const [helocBalance, setHelocBalance] = useState("");
  const [rentEst, setRentEst] = useState("");

  const [utilities, setUtilities] = useState("");
  const [adminMonthly, setAdminMonthly] = useState("");

  const [vacancyPct, setVacancyPct] = useState("10");
  const [reservesPct, setReservesPct] = useState("5");
  const [maintenancePct, setMaintenancePct] = useState("5");

  const [closingPct, setClosingPct] = useState("11.35");
  const [downPct, setDownPct] = useState("25");
  const [pitiFactor, setPitiFactor] = useState("0.0099");

  const [helocInterestApr, setHelocInterestApr] = useState("8");
  const [helocPrincipalPayApr, setHelocPrincipalPayApr] = useState("2");
  const [refiLtv, setRefiLtv] = useState("65");
  const [refiCost, setRefiCost] = useState("3");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        window.location.href = "/login";
        return;
      }

      const pRes = await supabase
        .from("properties")
        .select("id,address,status,square_footage,purchase_price_actual")
        .eq("id", id)
        .single();

      if (pRes.error) {
        setErr(pRes.error.message);
        setLoading(false);
        return;
      }

      const p = pRes.data as any as PropertyRow;
      setAddress(p.address ?? "");
      setStatus(p.status ?? "Lead");
      setSqft(p.square_footage != null ? String(p.square_footage) : "");
      setPurchasePriceActual(p.purchase_price_actual != null ? String(p.purchase_price_actual) : "");

      const uwRes = await supabase
        .from("property_underwriting")
        .select(
          "property_id,list_price,market_price_per_sf,upgrade_premium,adjustment_factor,purchase_price_actual,rehab_cost_est,heloc_balance_est,rent_est,vacancy_pct,reserves_pct,maintenance_pct,utilities_est,admin_monthly_est,closing_costs_pct,down_payment_pct,piti_factor,heloc_interest_pct,heloc_fee_pct,refi_ltv,refi_cost_pct"
        )
        .eq("property_id", id)
        .single();

      if (uwRes.error) {
        setErr(uwRes.error.message);
        setLoading(false);
        return;
      }

      const uw = uwRes.data as any as UWRow;

      setListPrice(uw.list_price != null ? String(uw.list_price) : "");
      setMarketPsf(uw.market_price_per_sf != null ? String(uw.market_price_per_sf) : "");
      setUpgradePremium(uw.upgrade_premium != null ? String(uw.upgrade_premium) : "");
      setAdjustmentFactor(uw.adjustment_factor != null ? String((uw.adjustment_factor * 100).toFixed(2)) : "");

      setUwPurchasePriceActual(uw.purchase_price_actual != null ? String(uw.purchase_price_actual) : "");
      setRehabCost(uw.rehab_cost_est != null ? String(uw.rehab_cost_est) : "");
      setHelocBalance(uw.heloc_balance_est != null ? String(uw.heloc_balance_est) : "");
      setRentEst(uw.rent_est != null ? String(uw.rent_est) : "");

      setUtilities(uw.utilities_est != null ? String(uw.utilities_est) : "");
      setAdminMonthly(uw.admin_monthly_est != null ? String(uw.admin_monthly_est) : "");

      setVacancyPct(uw.vacancy_pct != null ? String((uw.vacancy_pct * 100).toFixed(2)) : "10");
      setReservesPct(uw.reserves_pct != null ? String((uw.reserves_pct * 100).toFixed(2)) : "5");
      setMaintenancePct(uw.maintenance_pct != null ? String((uw.maintenance_pct * 100).toFixed(2)) : "5");

      setClosingPct(uw.closing_costs_pct != null ? String((uw.closing_costs_pct * 100).toFixed(2)) : "11.35");
      setDownPct(uw.down_payment_pct != null ? String((uw.down_payment_pct * 100).toFixed(2)) : "25");
      setPitiFactor(uw.piti_factor != null ? String(uw.piti_factor) : "0.0099");

      setHelocInterestApr(uw.heloc_interest_pct != null ? String((uw.heloc_interest_pct * 100).toFixed(2)) : "8");
      setHelocPrincipalPayApr(uw.heloc_fee_pct != null ? String((uw.heloc_fee_pct * 100).toFixed(2)) : "2");

      setRefiLtv(uw.refi_ltv != null ? String((uw.refi_ltv * 100).toFixed(2)) : "65");
      setRefiCost(uw.refi_cost_pct != null ? String((uw.refi_cost_pct * 100).toFixed(2)) : "3");

      setLoading(false);
    })();
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);

    const pUpdate = await supabase
      .from("properties")
      .update({
        address: address.trim(),
        status,
        square_footage: toNumOrNull(sqft),
        purchase_price_actual: toNumOrNull(purchasePriceActual),
      })
      .eq("id", id);

    if (pUpdate.error) {
      setErr(pUpdate.error.message);
      setSaving(false);
      return;
    }

    const uwUpdate = await supabase
      .from("property_underwriting")
      .update({
        list_price: toNumOrNull(listPrice),
        market_price_per_sf: toNumOrNull(marketPsf),
        upgrade_premium: toNumOrNull(upgradePremium),
        adjustment_factor: toPctOrNull(adjustmentFactor),

        purchase_price_actual: toNumOrNull(uwPurchasePriceActual),
        rehab_cost_est: toNumOrNull(rehabCost),
        heloc_balance_est: toNumOrNull(helocBalance),
        rent_est: toNumOrNull(rentEst),

        utilities_est: toNumOrNull(utilities),
        admin_monthly_est: toNumOrNull(adminMonthly),

        vacancy_pct: toPctOrNull(vacancyPct),
        reserves_pct: toPctOrNull(reservesPct),
        maintenance_pct: toPctOrNull(maintenancePct),

        closing_costs_pct: toPctOrNull(closingPct),
        down_payment_pct: toPctOrNull(downPct),
        piti_factor: toNumOrNull(pitiFactor),

        heloc_interest_pct: toPctOrNull(helocInterestApr),
        heloc_fee_pct: toPctOrNull(helocPrincipalPayApr),

        refi_ltv: toPctOrNull(refiLtv),
        refi_cost_pct: toPctOrNull(refiCost),
      })
      .eq("property_id", id);

    if (uwUpdate.error) {
      setErr(uwUpdate.error.message);
      setSaving(false);
      return;
    }

    window.location.href = `/properties/${id}`;
  }

  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Edit Property</h1>
          <p className="text-sm text-slate-300 mt-1">{address || id}</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <a className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" href={`/properties/${id}`}>
            Back
          </a>
          <button form="editForm" className="rounded-xl bg-white text-black px-4 py-2" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {loading && <p className="mt-6 text-slate-300">Loading...</p>}
      {err && <p className="mt-6 text-red-400">{err}</p>}

      {!loading && (
        <form id="editForm" onSubmit={save} className="mt-6 space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="font-semibold">Property</h2>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <Field label="Address">
                <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>

              <Field label="Status">
                <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s} className="bg-slate-950">
                      {s}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Square Footage">
                <input className={inputCls} value={sqft} onChange={(e) => setSqft(e.target.value)} />
              </Field>

              <Field label="Purchase Price (actual) [optional]">
                <input className={inputCls} value={purchasePriceActual} onChange={(e) => setPurchasePriceActual(e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="font-semibold">Underwriting Inputs</h2>
            <p className="text-sm text-slate-400 mt-1">Percent fields accept “10” (10%) or “0.10”.</p>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-4">
              <Field label="List Price"><input className={inputCls} value={listPrice} onChange={(e) => setListPrice(e.target.value)} /></Field>
              <Field label="ARV $/SqFt (market)"><input className={inputCls} value={marketPsf} onChange={(e) => setMarketPsf(e.target.value)} /></Field>
              <Field label="Adjustment Factor (%)"><input className={inputCls} value={adjustmentFactor} onChange={(e) => setAdjustmentFactor(e.target.value)} /></Field>
              <Field label="Upgrade Premium ($)"><input className={inputCls} value={upgradePremium} onChange={(e) => setUpgradePremium(e.target.value)} /></Field>

              <Field label="Purchase Price (assumed) [optional]"><input className={inputCls} value={uwPurchasePriceActual} onChange={(e) => setUwPurchasePriceActual(e.target.value)} /></Field>
              <Field label="Rehab Cost (est)"><input className={inputCls} value={rehabCost} onChange={(e) => setRehabCost(e.target.value)} /></Field>
              <Field label="HELOC Balance (est)"><input className={inputCls} value={helocBalance} onChange={(e) => setHelocBalance(e.target.value)} /></Field>
              <Field label="Rent (monthly)"><input className={inputCls} value={rentEst} onChange={(e) => setRentEst(e.target.value)} /></Field>

              <Field label="Utilities (monthly est)"><input className={inputCls} value={utilities} onChange={(e) => setUtilities(e.target.value)} /></Field>
              <Field label="Admin (monthly est)"><input className={inputCls} value={adminMonthly} onChange={(e) => setAdminMonthly(e.target.value)} /></Field>

              <Field label="Vacancy (%)"><input className={inputCls} value={vacancyPct} onChange={(e) => setVacancyPct(e.target.value)} /></Field>
              <Field label="Reserves (%)"><input className={inputCls} value={reservesPct} onChange={(e) => setReservesPct(e.target.value)} /></Field>
              <Field label="Maintenance (%)"><input className={inputCls} value={maintenancePct} onChange={(e) => setMaintenancePct(e.target.value)} /></Field>

              <Field label="Closing Costs (%)"><input className={inputCls} value={closingPct} onChange={(e) => setClosingPct(e.target.value)} /></Field>
              <Field label="Down Payment (%)"><input className={inputCls} value={downPct} onChange={(e) => setDownPct(e.target.value)} /></Field>
              <Field label="PITI factor (monthly)"><input className={inputCls} value={pitiFactor} onChange={(e) => setPitiFactor(e.target.value)} /></Field>

              <Field label="HELOC interest (APR %)"><input className={inputCls} value={helocInterestApr} onChange={(e) => setHelocInterestApr(e.target.value)} /></Field>
              <Field label="HELOC principal paydown (APR %)"><input className={inputCls} value={helocPrincipalPayApr} onChange={(e) => setHelocPrincipalPayApr(e.target.value)} /></Field>

              <Field label="Refi LTV (%)"><input className={inputCls} value={refiLtv} onChange={(e) => setRefiLtv(e.target.value)} /></Field>
              <Field label="Refi costs (%)"><input className={inputCls} value={refiCost} onChange={(e) => setRefiCost(e.target.value)} /></Field>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              HELOC monthly payment is modeled as: balance × ((interest APR + principal paydown APR) / 12).
              Example: 8% + 2% = 10% APR total → 10%/12 monthly.
            </p>
          </section>

          <div className="flex gap-2 flex-wrap">
            <button className="rounded-xl bg-white text-black px-4 py-2" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <a className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200 hover:text-white" href={`/properties/${id}`}>
              Cancel
            </a>
          </div>
        </form>
      )}
    </main>
  );
}

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100 placeholder:text-slate-500";
const selectCls =
  "mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm text-slate-300">{label}</label>
      {children}
    </div>
  );
}
