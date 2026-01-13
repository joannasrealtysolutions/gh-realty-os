"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Tx = {
  id: string;
  date: string;
  type: "income" | "expense";
  category: string;
  amount: number;
  vendor: string | null;
  description: string | null;
  receipt_link: string | null;
  property_id: string | null;

  // rehab fields
  is_rehab?: boolean;
  rehab_project_id?: string | null;

  properties?: { address: string } | null;
};

type RehabBudgetRow = {
  project_id: string;
  property_id: string;
  title: string;
  status: string;
  budget_target: number | null;
  rehab_spent_total: number | null;
  rehab_budget_remaining: number | null;
};

type RehabProject = {
  id: string;
  property_id: string;
  title: string;
  status: string;
  budget_target: number | null;
};

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100 placeholder:text-slate-500";
const selectCls =
  "mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100";

function money2(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ymdFromAnyDate(s: string): string | null {
  const t = String(s ?? "").trim();
  if (!t) return null;

  // already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  // mm/dd/yyyy or m/d/yyyy
  const mdy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = mdy[1].padStart(2, "0");
    const dd = mdy[2].padStart(2, "0");
    const yyyy = mdy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // fallback: Date parse
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Lightweight CSV parser that handles quoted fields and commas inside quotes */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        // escaped quote
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === "," || ch === "\n" || ch === "\r")) {
      if (ch === ",") {
        row.push(cur);
        cur = "";
      } else {
        // newline handling: treat \r\n or \n or \r as end
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur);
        cur = "";
        // if row not empty (avoid trailing empty line)
        if (row.some((c) => String(c).trim().length > 0)) rows.push(row);
        row = [];
      }
      continue;
    }

    cur += ch;
  }

  // last cell
  if (cur.length || row.length) {
    row.push(cur);
    if (row.some((c) => String(c).trim().length > 0)) rows.push(row);
  }

  return rows;
}

function getHeaderIndexMap(headers: string[]) {
  const map = new Map<string, number>();
  headers.forEach((h, i) => map.set(h.trim().toLowerCase(), i));
  return map;
}

function safeCell(r: string[], idx: number | undefined) {
  if (idx === undefined || idx < 0 || idx >= r.length) return "";
  return String(r[idx] ?? "").trim();
}

function asNumber(v: string): number | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  // strip $ and commas
  const cleaned = t.replace(/\$/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** receipt_link conventions:
 * - If starts with "storage:receipts/<path>" => open via signed URL
 * - Else treat as normal URL
 */
async function openReceipt(receipt_link: string) {
  if (!receipt_link) return;

  const t = receipt_link.trim();
  if (t.startsWith("storage:")) {
    const path = t.replace(/^storage:receipts\//, "");
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 60);
    if (error) {
      alert(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank");
    return;
  }

  window.open(t, "_blank");
}

export default function MoneyPage() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [search, setSearch] = useState("");

  // Rehab budgets (owner view)
  const [rehabBudgets, setRehabBudgets] = useState<RehabBudgetRow[]>([]);
  const [rehabProjects, setRehabProjects] = useState<RehabProject[]>([]);

  // new transaction form
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("Repairs");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState("");
  const [propertyId, setPropertyId] = useState<string>("");

  // rehab tagging
  const [isRehab, setIsRehab] = useState(false);
  const [rehabProjectId, setRehabProjectId] = useState<string>("");

  // CSV import
  const [csvStatus, setCsvStatus] = useState<string>("");

  // top scrollbar sync
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const topInnerRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);

  function syncTopWidth() {
    const tableW = tableRef.current?.scrollWidth ?? 1200;
    if (topInnerRef.current) topInnerRef.current.style.width = `${tableW}px`;
  }

  async function load() {
    setLoading(true);
    setErr(null);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    const txRes = await supabase
      .from("transactions")
      .select(
        "id,date,type,category,amount,vendor,description,receipt_link,property_id,is_rehab,rehab_project_id, properties:property_id(address)"
      )
      .order("date", { ascending: false })
      .limit(1000);

    if (txRes.error) {
      setErr(txRes.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((txRes.data as any) ?? []);

    // rehab budgets view
    const bRes = await supabase
      .from("v_rehab_budget")
      .select("project_id,property_id,title,status,budget_target,rehab_spent_total,rehab_budget_remaining")
      .order("created_at", { ascending: false } as any);

    if (!bRes.error) {
      setRehabBudgets((bRes.data as any) ?? []);
    }

    // rehab projects (for dropdown)
    const pRes = await supabase
      .from("rehab_projects")
      .select("id,property_id,title,status,budget_target")
      .order("created_at", { ascending: false });

    if (!pRes.error) {
      setRehabProjects((pRes.data as any) ?? []);
    }

    setLoading(false);

    // allow layout settle then measure
    setTimeout(syncTopWidth, 0);
  }

  useEffect(() => {
    load();
    const onResize = () => syncTopWidth();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep top scrollbar width in sync if rows change
  useEffect(() => {
    syncTopWidth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;

      const hay = [
        r.properties?.address,
        r.type,
        r.category,
        r.vendor,
        r.description,
        r.is_rehab ? "rehab" : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, typeFilter, search]);

  async function del(id: string) {
    const ok = window.confirm("Delete this transaction?");
    if (!ok) return;

    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await load();
  }

  async function uploadReceiptForTx(txId: string, file: File) {
    try {
      setErr(null);

      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        window.location.href = "/login";
        return;
      }

      // You must have a Storage bucket named "receipts"
      // Supabase: Storage -> New bucket -> receipts (private is fine)
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `${Date.now()}_${txId}_${safeName}`;

      const up = await supabase.storage.from("receipts").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (up.error) throw new Error(up.error.message);

      // Store as storage pointer (not a public URL)
      const receipt_link = `storage:receipts/${path}`;

      const { error } = await supabase.from("transactions").update({ receipt_link }).eq("id", txId);
      if (error) throw new Error(error.message);

      await load();
    } catch (e: any) {
      alert(e?.message ?? String(e));
    }
  }

  async function addTx(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const a = asNumber(amount);
    if (!date) return setErr("Date is required.");
    if (!category.trim()) return setErr("Category is required.");
    if (a === null) return setErr("Amount must be a number.");

    const payload: any = {
      date,
      type,
      category: category.trim(),
      amount: a, // signed allowed
      vendor: vendor.trim() || null,
      description: description.trim() || null,
      receipt_link: receipt.trim() || null,
      property_id: propertyId || null,

      is_rehab: Boolean(isRehab),
      rehab_project_id: isRehab && rehabProjectId ? rehabProjectId : null,
    };

    const { error } = await supabase.from("transactions").insert(payload);

    if (error) {
      setErr(error.message);
      return;
    }

    // reset a few fields
    setAmount("");
    setVendor("");
    setDescription("");
    setReceipt("");
    setPropertyId("");
    setIsRehab(false);
    setRehabProjectId("");

    await load();
  }

  async function importBaselaneCSV(file: File) {
    setCsvStatus("");
    setErr(null);

    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        setCsvStatus("CSV appears empty.");
        return;
      }

      const headers = parsed[0].map((h) => h.trim());
      const map = getHeaderIndexMap(headers);

      // Expected Baselane-ish headers the way you shared:
      // Account, Date, Merchant, Description, Amount, Type, Category, Sub-category, Property, Unit, Notes
      const idxDate = map.get("date");
      const idxMerchant = map.get("merchant");
      const idxDesc = map.get("description");
      const idxAmt = map.get("amount");
      const idxType = map.get("type");
      const idxCat = map.get("category");
      const idxSub = map.get("sub-category") ?? map.get("sub category");
      const idxNotes = map.get("notes");

      // Build candidate rows
      const detected = parsed.length - 1;
      let missingDate = 0;
      let missingAmount = 0;

      const candidates: Omit<Tx, "id">[] = [];
      for (let i = 1; i < parsed.length; i++) {
        const r = parsed[i];

        const d0 = safeCell(r, idxDate);
        const d = ymdFromAnyDate(d0);
        if (!d) {
          missingDate++;
          continue;
        }

        const amt0 = safeCell(r, idxAmt);
        const amt = asNumber(amt0);
        if (amt === null) {
          missingAmount++;
          continue;
        }

        const t0 = safeCell(r, idxType).toLowerCase();
        const inferredType: "income" | "expense" =
          t0.includes("income") || t0.includes("credit") || amt > 0 ? "income" : "expense";

        const merchant = safeCell(r, idxMerchant);
        const desc = safeCell(r, idxDesc);
        const notes = safeCell(r, idxNotes);

        const cat = safeCell(r, idxCat);
        const sub = safeCell(r, idxSub);

        const finalCategory = (sub || cat || "Other").trim();

        const finalDesc = [desc, notes].filter(Boolean).join(" • ").trim();

        candidates.push({
          date: d,
          type: inferredType,
          category: finalCategory || "Other",
          amount: amt,
          vendor: merchant || null,
          description: finalDesc || null,
          receipt_link: null,
          property_id: null,
          is_rehab: false,
          rehab_project_id: null,
          properties: null,
        });
      }

      // Fetch existing recent rows to dedupe client-side
      const existingRes = await supabase
        .from("transactions")
        .select("id,date,amount,type,category,vendor,description")
        .order("date", { ascending: false })
        .limit(2000);

      const existing = (existingRes.data as any[]) ?? [];
      const key = (x: any) =>
        [
          String(x.date || ""),
          String(Number(x.amount || 0)),
          String(x.type || ""),
          String((x.vendor || "").toLowerCase()),
          String((x.category || "").toLowerCase()),
          String((x.description || "").toLowerCase()),
        ].join("|");

      const existingSet = new Set(existing.map(key));

      const toInsert = candidates.filter((c) => !existingSet.has(key(c)));
      const skippedDuplicates = candidates.length - toInsert.length;

      // chunk insert
      let imported = 0;
      let chunkErrors = 0;

      const chunkSize = 200;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize).map((c) => ({
          date: c.date,
          type: c.type,
          category: c.category,
          amount: c.amount,
          vendor: c.vendor,
          description: c.description,
          receipt_link: c.receipt_link,
          property_id: c.property_id,
          is_rehab: false,
          rehab_project_id: null,
        }));

        const ins = await supabase.from("transactions").insert(chunk);
        if (ins.error) {
          chunkErrors++;
        } else {
          imported += chunk.length;
        }
      }

      setCsvStatus(
        `.csv • Rows detected: ${detected}\nImported: ${imported} • Skipped duplicates: ${skippedDuplicates} • Chunk errors: ${chunkErrors}\nSkipped (missing date): ${missingDate} • Skipped (missing amount): ${missingAmount}`
      );

      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  const rehabTotals = useMemo(() => {
    let target = 0;
    let spent = 0;
    let remaining = 0;

    for (const r of rehabBudgets) {
      target += Number(r.budget_target ?? 0);
      spent += Number(r.rehab_spent_total ?? 0);
      remaining += Number(r.rehab_budget_remaining ?? 0);
    }

    return { target, spent, remaining, count: rehabBudgets.length };
  }, [rehabBudgets]);

  function onTopScroll() {
    if (!topScrollRef.current || !bottomScrollRef.current) return;
    bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
  }

  function onBottomScroll() {
    if (!topScrollRef.current || !bottomScrollRef.current) return;
    topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
  }

  return (
    <main className="p-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Money Ledger</h1>
          <p className="text-sm text-slate-300">Income + expenses (latest 1000)</p>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <input
            className="rounded-xl border border-slate-700 bg-transparent p-2 w-72 text-slate-100"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
          >
            <option value="all" className="bg-slate-950">
              All
            </option>
            <option value="income" className="bg-slate-950">
              Income
            </option>
            <option value="expense" className="bg-slate-950">
              Expense
            </option>
          </select>

          <button
            className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white"
            onClick={load}
          >
            Refresh
          </button>
        </div>
      </div>

      {err && <p className="mt-6 text-red-400 whitespace-pre-wrap">{err}</p>}

      {/* Rehab Budgets */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Rehab Budgets</h2>
            <p className="text-sm text-slate-400 mt-1">Owner-only: totals across rehab projects.</p>
          </div>
          <div className="text-sm text-slate-300">
            Projects: <span className="text-slate-100 font-medium">{rehabTotals.count}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat label="Total Rehab Budget" value={`$${money2(rehabTotals.target)}`} />
          <Stat label="Total Rehab Spent" value={`$${money2(rehabTotals.spent)}`} />
          <Stat label="Total Remaining" value={`$${money2(rehabTotals.remaining)}`} />
        </div>

        {rehabBudgets.length > 0 && (
          <div className="mt-5 overflow-auto rounded-xl border border-slate-800 bg-slate-950/30">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-950/40">
                <tr>
                  <th className="text-left p-3">Project</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Budget Target</th>
                  <th className="text-right p-3">Spent</th>
                  <th className="text-right p-3">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {rehabBudgets.map((b) => (
                  <tr key={b.project_id} className="border-t border-slate-800">
                    <td className="p-3 text-slate-200">
                      {b.title} <span className="text-xs text-slate-500">({b.project_id.slice(0, 6)}…)</span>
                    </td>
                    <td className="p-3 text-slate-200">{b.status}</td>
                    <td className="p-3 text-right text-slate-200">{b.budget_target != null ? `$${money2(b.budget_target)}` : "-"}</td>
                    <td className="p-3 text-right text-slate-200">{`$${money2(b.rehab_spent_total ?? 0)}`}</td>
                    <td className="p-3 text-right text-slate-200">{`$${money2(b.rehab_budget_remaining ?? 0)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* CSV Import */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="font-semibold">CSV Import (Baselane)</h2>
        <p className="text-sm text-slate-400 mt-1">
          Upload Baselane CSV. Transactions will dedupe against your latest 2000 by (date, amount, type, vendor, category, description).
        </p>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importBaselaneCSV(f);
            }}
          />
          {csvStatus && <pre className="text-xs text-slate-300 whitespace-pre-wrap">{csvStatus}</pre>}
        </div>
      </section>

      {/* Add Transaction */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="font-semibold">Add Transaction</h2>
        <p className="text-sm text-slate-400 mt-1">Signed amounts allowed. Rehab tagging is optional.</p>

        <form onSubmit={addTx} className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm text-slate-300">Date</label>
            <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <label className="text-sm text-slate-300">Type</label>
            <select className={selectCls} value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="expense" className="bg-slate-950">
                expense
              </option>
              <option value="income" className="bg-slate-950">
                income
              </option>
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-300">Category</label>
            <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>

          <div>
            <label className="text-sm text-slate-300">Amount</label>
            <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-50.00" />
          </div>

          <div>
            <label className="text-sm text-slate-300">Vendor</label>
            <input className={inputCls} value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>

          <div>
            <label className="text-sm text-slate-300">Description</label>
            <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div>
            <label className="text-sm text-slate-300">Receipt Link (optional)</label>
            <input className={inputCls} value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="https://..." />
          </div>

          <div>
            <label className="text-sm text-slate-300">Property ID (optional)</label>
            <input className={inputCls} value={propertyId} onChange={(e) => setPropertyId(e.target.value)} />
          </div>

          {/* Rehab tagging */}
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
              If checked, this expense contributes to Rehab totals (and budget remaining).
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm text-slate-300">Rehab Project (optional)</label>
            <select
              className={selectCls}
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

          <div className="md:col-span-4">
            <button className="rounded-xl bg-white text-black px-4 py-2">Add</button>
          </div>
        </form>
      </section>

      {/* Table */}
      {loading && <p className="mt-6 text-slate-300">Loading...</p>}

      {!loading && (
        <>
          {/* Top scrollbar */}
          <div
            ref={topScrollRef}
            onScroll={onTopScroll}
            className="mt-6 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/20"
            style={{ height: 18 }}
          >
            <div ref={topInnerRef} style={{ height: 1 }} />
          </div>

          {/* Actual table */}
          <div
            ref={bottomScrollRef}
            onScroll={onBottomScroll}
            className="mt-2 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/40"
          >
            <table ref={tableRef} className="min-w-[1400px] w-full text-sm">
              <thead className="bg-slate-950/40">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Property</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-left p-3">Vendor</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-left p-3">Rehab</th>
                  <th className="text-left p-3">Receipt</th>
                  <th className="text-left p-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800">
                    <td className="p-3">{r.date}</td>
                    <td className="p-3">{r.properties?.address ?? "-"}</td>
                    <td className="p-3">{r.type}</td>
                    <td className="p-3">{r.category}</td>
                    <td className="p-3 text-right">{money2(r.amount)}</td>
                    <td className="p-3">{r.vendor ?? "-"}</td>
                    <td className="p-3">{r.description ?? "-"}</td>
                    <td className="p-3">
                      {r.is_rehab ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-700/60 bg-emerald-900/20 px-2 py-1 text-xs text-emerald-200">
                          Rehab
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-3">
                      {r.receipt_link ? (
                        <button className="underline text-slate-200 hover:text-white" onClick={() => openReceipt(r.receipt_link!)}>
                          Open
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          className="rounded-lg border border-slate-700 px-2 py-1 text-slate-200 hover:text-white"
                          href={`/transactions/${r.id}/edit`}
                        >
                          Edit
                        </a>

                        <label className="rounded-lg border border-slate-700 px-2 py-1 text-slate-200 hover:text-white cursor-pointer">
                          Upload receipt
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadReceiptForTx(r.id, f);
                              // reset input
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>

                        <button
                          className="rounded-lg border border-slate-700 px-2 py-1 text-slate-200 hover:text-white"
                          onClick={() => del(r.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td className="p-3" colSpan={10}>
                      No results.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Receipt uploads require a Supabase Storage bucket named <span className="text-slate-300">receipts</span>.
            If you haven’t created it yet: Supabase → Storage → New bucket → <span className="text-slate-300">receipts</span> (private is fine).
          </p>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="text-sm text-slate-300">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
