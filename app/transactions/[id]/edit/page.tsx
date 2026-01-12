"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

type PropOption = { id: string; address: string };

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

export default function EditTransactionPage() {
  const params = useParams();
  const id = String(params.id || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [props, setProps] = useState<PropOption[]>([]);

  const [date, setDate] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [receiptLink, setReceiptLink] = useState("");
  const [propertyId, setPropertyId] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        window.location.href = "/login";
        return;
      }

      const pRes = await supabase.from("properties").select("id,address").order("address");
      if (pRes.error) {
        setErr(pRes.error.message);
        setLoading(false);
        return;
      }
      setProps((pRes.data as any) ?? []);

      const tRes = await supabase
        .from("transactions")
        .select("id,date,type,category,amount,vendor,description,receipt_link,property_id")
        .eq("id", id)
        .single();

      if (tRes.error) {
        setErr(tRes.error.message);
        setLoading(false);
        return;
      }

      const r: any = tRes.data;
      setDate(r.date || "");
      setType(r.type);
      setCategory(r.category || CATEGORIES[0]);
      setAmount(String(r.amount ?? ""));
      setVendor(r.vendor ?? "");
      setDescription(r.description ?? "");
      setReceiptLink(r.receipt_link ?? "");
      setPropertyId(r.property_id ?? "");

      setLoading(false);
    })();
  }, [id]);

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

    const { error } = await supabase
      .from("transactions")
      .update({
        date,
        type,
        category,
        amount: amt,
        vendor: vendor.trim() || null,
        description: description.trim() || null,
        receipt_link: receiptLink.trim() || null,
        property_id: propertyId || null,
      })
      .eq("id", id);

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
          <h1 className="text-2xl font-semibold">Edit Transaction</h1>
          <p className="text-sm text-slate-300 mt-1">{id}</p>
        </div>
        <a className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" href="/money">
          Back
        </a>
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
                  onChange={(e) => setType(e.target.value as any)}
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
            </div>

            <button disabled={saving} className="mt-6 rounded-xl bg-white text-black px-4 py-2">
              {saving ? "Saving..." : "Save Changes"}
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
