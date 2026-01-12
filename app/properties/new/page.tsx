"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

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

export default function NewPropertyPage() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("Lead");
  const [sqft, setSqft] = useState("");
  const [listPrice, setListPrice] = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createProperty(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    // 1) Insert property
    const pRes = await supabase
      .from("properties")
      .insert({
        address: address.trim(),
        status,
        square_footage: toNumOrNull(sqft),
      })
      .select("id")
      .single();

    if (pRes.error) {
      setErr(pRes.error.message);
      setSaving(false);
      return;
    }

    const propertyId = pRes.data.id as string;

    // 2) Seed underwriting row
    const uwRes = await supabase.from("property_underwriting").insert({
      property_id: propertyId,
      list_price: toNumOrNull(listPrice),
      // Optional defaults (keep light; you can edit later in /edit)
      vacancy_pct: 0.10,
      reserves_pct: 0.05,
      maintenance_pct: 0.05,
      closing_costs_pct: 0.1135,
      down_payment_pct: 0.25,
      piti_factor: 0.0099,
      heloc_interest_pct: 0.08,
      heloc_fee_pct: 0.02,
      refi_ltv: 0.65,
      refi_cost_pct: 0.03,
    });

    if (uwRes.error) {
      setErr(uwRes.error.message);
      setSaving(false);
      return;
    }

    window.location.href = `/properties/${propertyId}`;
  }

  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Add Property</h1>
          <p className="text-sm text-slate-300 mt-1">Create a new property + underwriting row.</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <a
            className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200 hover:text-white"
            href="/properties"
          >
            Back
          </a>
          <button
            form="newPropertyForm"
            className="rounded-xl bg-white text-black px-4 py-2"
            disabled={saving}
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      </div>

      {err && <p className="mt-6 text-red-400">{err}</p>}

      <form
        id="newPropertyForm"
        onSubmit={createProperty}
        className="mt-6 space-y-6"
      >
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="font-semibold">Basic Info</h2>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <Field label="Address">
              <input
                className={inputCls}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="6618 Haddington Ln"
                required
              />
            </Field>

            <Field label="Status">
              <select
                className={selectCls}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="bg-slate-950">
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Square Footage (optional)">
              <input
                className={inputCls}
                value={sqft}
                onChange={(e) => setSqft(e.target.value)}
                placeholder="1288"
              />
            </Field>

            <Field label="List Price (optional)">
              <input
                className={inputCls}
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                placeholder="295000"
              />
            </Field>
          </div>
        </section>
      </form>
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
