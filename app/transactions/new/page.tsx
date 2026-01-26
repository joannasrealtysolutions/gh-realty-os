"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type PropOption = { id: string; address: string };
type RehabProject = { id: string; title: string; status: string };

const CATEGORIES = [
  "Rent",
  "Utilities",
  "Repairs",
  "Maintenance",
  "Capital Expenditure",
  "Mortgage",
  "Insurance",
  "Taxes",
  "HOA",
  "Admin",
  "Supplies",
  "Other",
];

export default function NewTransactionPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [props, setProps] = useState<PropOption[]>([]);
  const [rehabProjects, setRehabProjects] = useState<RehabProject[]>([]);
  const [costTagAvailable, setCostTagAvailable] = useState(true);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [receiptLink, setReceiptLink] = useState("");
  const [propertyId, setPropertyId] = useState<string>("");
  const [isRehab, setIsRehab] = useState(false);
  const [rehabProjectId, setRehabProjectId] = useState("");
  const [costTag, setCostTag] = useState("none");

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
      if (error) setErr(error.message);
      setProps((data as PropOption[]) ?? []);

      const rpRes = await supabase.from("rehab_projects").select("id,title,status").order("created_at", { ascending: false });
      if (!rpRes.error) setRehabProjects((rpRes.data as RehabProject[]) ?? []);

      const ctRes = await supabase.from("transactions").select("id,cost_tag").limit(1);
      if (ctRes.error && ctRes.error.message.toLowerCase().includes("cost_tag")) {
        setCostTagAvailable(false);
      }
      setLoading(false);
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);

    const amt = Number(amount);
    if (!Number.isFinite(amt)) {
      setErr("Amount must be a number.");
      setSaving(false);
      return;
    }

    const payload: {
      date: string;
      type: "income" | "expense";
      category: string;
      amount: number;
      vendor: string | null;
      description: string | null;
      receipt_link: string | null;
      property_id: string | null;
      is_rehab: boolean;
      rehab_project_id: string | null;
      cost_tag?: string | null;
    } = {
      date,
      type,
      category,
      amount: amt,
      vendor: vendor.trim() || null,
      description: description.trim() || null,
      receipt_link: receiptLink.trim() || null,
      property_id: propertyId || null,
      is_rehab: Boolean(isRehab),
      rehab_project_id: isRehab && rehabProjectId ? rehabProjectId : null,
    };
    if (costTagAvailable) payload.cost_tag = costTag !== "none" ? costTag : null;

    const { error } = await supabase.from("transactions").insert(payload);

    if (error) {
      setErr(error.message);
      setSaving(false);
      return;
    }

    window.location.href = "/money";
  }

  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Add Transaction</h1>
          <p className="text-sm text-slate-300 mt-1">Income or expense entry</p>
        </div>
        <Link className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" href="/money">
          Back
        </Link>
      </div>

      {loading && <p className="mt-6 text-slate-300">Loading...</p>}
      {err && <p className="mt-6 text-red-400">{err}</p>}

      {!loading && (
        <form onSubmit={save} className="mt-6 max-w-2xl space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Date">
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>

              <Field label="Property (optional)">
                <select
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                >
                  <option value="" className="bg-slate-950">
                    (No property)
                  </option>
                  {props.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-950">
                      {p.address}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Type">
                <select
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
                  value={type}
                  onChange={(e) => setType(e.target.value as "income" | "expense")}
                >
                  <option value="income" className="bg-slate-950">
                    income
                  </option>
                  <option value="expense" className="bg-slate-950">
                    expense
                  </option>
                </select>
              </Field>

              <Field label="Category">
                <select
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-slate-950">
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Amount">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100 placeholder:text-slate-500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="250.00"
                />
              </Field>

              <Field label="Vendor (optional)">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100 placeholder:text-slate-500"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="Home Depot"
                />
              </Field>

              <Field label="Receipt link (optional)">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100 placeholder:text-slate-500"
                  value={receiptLink}
                  onChange={(e) => setReceiptLink(e.target.value)}
                  placeholder="https://..."
                />
              </Field>

              <Field label="Description (optional)">
                <input
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100 placeholder:text-slate-500"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What was this for?"
                />
              </Field>

              <div className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={isRehab}
                    onChange={(e) => {
                      setIsRehab(e.target.checked);
                      if (!e.target.checked) setRehabProjectId("");
                    }}
                  />
                  Mark as Rehab expense
                </label>
                <p className="text-xs text-slate-500 mt-1">If checked, this contributes to Rehab budget totals.</p>

                <div className="mt-3">
                  <label className="text-sm text-slate-300">Rehab Project (optional)</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
                    value={rehabProjectId}
                    onChange={(e) => setRehabProjectId(e.target.value)}
                    disabled={!isRehab}
                  >
                    <option value="" className="bg-slate-950">
                      (No project selected)
                    </option>
                    {rehabProjects.map((p) => (
                      <option key={p.id} value={p.id} className="bg-slate-950">
                        {p.title} • {p.status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <label className="text-sm text-slate-300">Cost Tag (optional)</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
                  value={costTag}
                  onChange={(e) => setCostTag(e.target.value)}
                  disabled={!costTagAvailable}
                >
                  <option value="none" className="bg-slate-950">
                    (No tag)
                  </option>
                  <option value="closing" className="bg-slate-950">
                    Closing Costs
                  </option>
                </select>
                {!costTagAvailable && (
                  <p className="text-xs text-slate-500 mt-1">
                    Cost tags require a <span className="text-slate-300">cost_tag</span> column in Supabase.
                  </p>
                )}
              </div>
            </div>

            <button disabled={saving} className="mt-6 rounded-xl bg-white text-black px-4 py-2">
              {saving ? "Saving..." : "Save Transaction"}
            </button>
          </section>
        </form>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm text-slate-300">{label}</label>
      {children}
    </div>
  );
}
