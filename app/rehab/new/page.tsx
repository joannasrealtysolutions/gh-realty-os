"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type PropOption = { id: string; address: string };

const STATUSES = ["Active", "Completed", "On Hold", "Planning"];

export default function NewRehabProjectPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [props, setProps] = useState<PropOption[]>([]);

  const [propertyId, setPropertyId] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Active");
  const [budgetTarget, setBudgetTarget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetEndDate, setTargetEndDate] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase.from("properties").select("id,address").order("address");
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      setProps((data as PropOption[]) ?? []);
      setLoading(false);
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);

    if (!propertyId) {
      setErr("Property is required.");
      setSaving(false);
      return;
    }
    if (!title.trim()) {
      setErr("Project title is required.");
      setSaving(false);
      return;
    }

    const budget = budgetTarget.trim() ? Number(budgetTarget) : null;
    if (budgetTarget.trim() && !Number.isFinite(budget)) {
      setErr("Budget must be a number.");
      setSaving(false);
      return;
    }

    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.access_token) {
      window.location.href = "/login";
      return;
    }

    const payload: {
      property_id: string;
      title: string;
      status: string;
      budget_target: number | null;
      start_date: string | null;
      target_end_date: string | null;
    } = {
      property_id: propertyId,
      title: title.trim(),
      status,
      budget_target: budget,
      start_date: startDate || null,
      target_end_date: targetEndDate || null,
    };

    const response = await fetch("/api/rehab/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setErr(result?.error ?? "Failed to create project.");
      setSaving(false);
      return;
    }

    window.location.href = "/rehab";
  }

  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">New Rehab Project</h1>
          <p className="text-sm text-slate-300 mt-1">Create a rehab project for a property.</p>
        </div>
        <Link className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" href="/rehab">
          Back
        </Link>
      </div>

      {loading && <p className="mt-6 text-slate-300">Loading...</p>}
      {err && <p className="mt-6 text-red-400">{err}</p>}

      {!loading && (
        <form onSubmit={save} className="mt-6 max-w-2xl space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Property">
                <select className={inputCls} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                  <option value="" className="bg-slate-950">
                    (Select a property)
                  </option>
                  {props.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-950">
                      {p.address}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Project title">
                <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rehab - 123 Main St" />
              </Field>

              <Field label="Status">
                <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-slate-950">
                      {s}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Budget target (optional)">
                <input className={inputCls} value={budgetTarget} onChange={(e) => setBudgetTarget(e.target.value)} placeholder="25000" />
              </Field>

              <Field label="Start date (optional)">
                <input className={inputCls} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>

              <Field label="Target end date (optional)">
                <input className={inputCls} type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} />
              </Field>
            </div>

            <button disabled={saving} className="mt-6 rounded-xl bg-white text-black px-4 py-2">
              {saving ? "Saving..." : "Create Project"}
            </button>
          </section>
        </form>
      )}
    </main>
  );
}

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100 placeholder:text-slate-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm text-slate-300">{label}</label>
      {children}
    </div>
  );
}
