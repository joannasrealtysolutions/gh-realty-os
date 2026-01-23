"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

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

export default function EditTransactionPage() {
  const params = useParams();
  const id = String(params.id || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [props, setProps] = useState<PropOption[]>([]);
  const [rehabProjects, setRehabProjects] = useState<RehabProject[]>([]);
  const [costTagAvailable, setCostTagAvailable] = useState(true);

  const [date, setDate] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [receiptLink, setReceiptLink] = useState("");
  const [propertyId, setPropertyId] = useState<string>("");

  // rehab fields
  const [isRehab, setIsRehab] = useState(false);
  const [rehabProjectId, setRehabProjectId] = useState<string>("");
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

      const pRes = await supabase.from("properties").select("id,address").order("address");
      if (pRes.error) {
        setErr(pRes.error.message);
        setLoading(false);
        return;
      }
      setProps((pRes.data as any) ?? []);

      const rpRes = await supabase
        .from("rehab_projects")
        .select("id,title,status")
        .order("created_at", { ascending: false });

      if (!rpRes.error) setRehabProjects((rpRes.data as any) ?? []);

      const baseSelect = "id,date,type,category,amount,vendor,description,receipt_link,property_id,is_rehab,rehab_project_id";
      let tRes = await supabase
        .from("transactions")
        .select(`${baseSelect},cost_tag`)
        .eq("id", id)
        .single();

      if (tRes.error) {
        const msg = tRes.error.message.toLowerCase();
        if (msg.includes("cost_tag")) {
          setCostTagAvailable(false);
          tRes = await supabase.from("transactions").select(baseSelect).eq("id", id).single();
        }
      }

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

      setIsRehab(Boolean(r.is_rehab));
      setRehabProjectId(r.rehab_project_id ?? "");
      setCostTag(r.cost_tag ?? "none");

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

    const payload: any = {
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

    const { error } = await supabase.from("transactions").update(payload).eq("id", id);

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
                <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>

              <Field label="Property (optional)">
                <select className={inputCls} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                  <option value="" className="bg-slate-950">(No property)</option>
                  {props.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-950">{p.address}</option>
                  ))}
                </select>
              </Field>

              <Field label="Type">
                <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as any)}>
                  <option value="income" className="bg-slate-950">income</option>
                  <option value="expense" className="bg-slate-950">expense</option>
                </select>
              </Field>

              <Field label="Category">
                <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-slate-950">{c}</option>
                  ))}
                </select>
              </Field>

              <Field label="Amount">
                <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250.00" />
              </Field>

              <Field label="Vendor (optional)">
                <input className={inputCls} value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Home Depot" />
              </Field>

              <Field label="Receipt link (optional)">
                <input className={inputCls} value={receiptLink} onChange={(e) => setReceiptLink(e.target.value)} placeholder="https://..." />
              </Field>

              <Field label="Description (optional)">
                <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this for?" />
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
                <p className="text-xs text-slate-500 mt-1">
                  If checked, this contributes to Rehab budget totals.
                </p>

                <div className="mt-3">
                  <label className="text-sm text-slate-300">Rehab Project (optional)</label>
                  <select
                    className={inputCls}
                    value={rehabProjectId}
                    onChange={(e) => setRehabProjectId(e.target.value)}
                    disabled={!isRehab}
                  >
                    <option value="" className="bg-slate-950">(No project selected)</option>
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
                  className={inputCls}
                  value={costTag}
                  onChange={(e) => setCostTag(e.target.value)}
                  disabled={!costTagAvailable}
                >
                  <option value="none" className="bg-slate-950">(No tag)</option>
                  <option value="closing" className="bg-slate-950">Closing Costs</option>
                </select>
                {!costTagAvailable && (
                  <p className="text-xs text-slate-500 mt-1">
                    Cost tags require a <span className="text-slate-300">cost_tag</span> column in Supabase.
                  </p>
                )}
              </div>
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
