// app/money/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
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
  properties?: { address: string } | null;
};

// ---------- CSV Import Types ----------
type CsvRow = {
  date: string; // ISO yyyy-mm-dd
  type: "income" | "expense";
  category: string;
  amount: number; // signed
  vendor: string | null;
  description: string | null;
  receipt_link: string | null;
  property_id: string | null;
  import_hash: string;
  raw: Record<string, string>;
};

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100 placeholder:text-slate-500";
const selectCls =
  "mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100";

function money2(v: any) {
  const x = Number(v);
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Very small CSV parser that handles:
// - commas
// - quotes
// - newlines in quotes (best-effort)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      cur.push(field);
      field = "";
      continue;
    }

    if (ch === "\r") continue;

    if (ch === "\n") {
      cur.push(field);
      field = "";
      // ignore empty trailing row
      if (cur.length > 1 || cur[0]?.trim()) rows.push(cur);
      cur = [];
      continue;
    }

    field += ch;
  }

  // flush
  if (field.length || cur.length) {
    cur.push(field);
    if (cur.length > 1 || cur[0]?.trim()) rows.push(cur);
  }

  return rows;
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

// Try to parse common date formats into yyyy-mm-dd
function toIsoDate(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;

  // Already ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // mm/dd/yyyy
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = String(mdy[1]).padStart(2, "0");
    const dd = String(mdy[2]).padStart(2, "0");
    const yyyy = mdy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Try Date() fallback
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

// Small hash (not crypto) to dedupe rows client-side
function simpleHash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function guessType(amount: number, rawType?: string | null): "income" | "expense" {
  const t = (rawType || "").trim().toLowerCase();
  if (t.includes("credit") || t.includes("deposit") || t.includes("income")) return "income";
  if (t.includes("debit") || t.includes("withdraw") || t.includes("expense")) return "expense";
  return amount >= 0 ? "income" : "expense";
}

function guessCategory(description?: string | null, vendor?: string | null): string {
  const hay = `${vendor || ""} ${description || ""}`.toLowerCase();

  if (hay.includes("rent")) return "Rent";
  if (hay.includes("mortgage")) return "Mortgage";
  if (hay.includes("insurance")) return "Insurance";
  if (hay.includes("tax")) return "Taxes";
  if (hay.includes("hoa")) return "HOA";
  if (hay.includes("utility") || hay.includes("electric") || hay.includes("gas") || hay.includes("water"))
    return "Utilities";
  if (hay.includes("home depot") || hay.includes("lowe") || hay.includes("repairs") || hay.includes("repair"))
    return "Repairs";
  if (hay.includes("maintenance")) return "Maintenance";
  if (hay.includes("admin")) return "Admin";

  return "Other";
}

export default function MoneyPage() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [search, setSearch] = useState("");

  // new transaction form
  const [date, setDate] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("Repairs");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState("");
  const [propertyId, setPropertyId] = useState<string>("");

  // ---------- CSV Import State ----------
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [csvPreview, setCsvPreview] = useState<CsvRow[]>([]);
  const [csvParsing, setCsvParsing] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvSummary, setCsvSummary] = useState<{ total: number; ok: number; skipped: number } | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    const { data, error } = await supabase
      .from("transactions")
      .select("id,date,type,category,amount,vendor,description,receipt_link,property_id, properties:property_id(address)")
      .order("date", { ascending: false })
      .limit(500);

    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows((data as any) ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      const hay = [r.properties?.address, r.type, r.category, r.vendor, r.description]
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

  async function addTx(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const a = Number(amount);
    if (!date) return setErr("Date is required.");
    if (!category.trim()) return setErr("Category is required.");
    if (!Number.isFinite(a)) return setErr("Amount must be a number.");

    const { error } = await supabase.from("transactions").insert({
      date,
      type,
      category: category.trim(),
      amount: a, // signed allowed
      vendor: vendor.trim() || null,
      description: description.trim() || null,
      receipt_link: receipt.trim() || null,
      property_id: propertyId || null,
    });

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

    await load();
  }

  // ---------- CSV Import Logic ----------
  async function onCsvPicked(file: File | null) {
    setErr(null);
    setCsvSummary(null);
    setCsvPreview([]);
    setCsvFileName("");

    if (!file) return;
    setCsvFileName(file.name);
    setCsvParsing(true);

    try {
      const text = await file.text();
      const matrix = parseCsv(text);
      if (matrix.length < 2) throw new Error("CSV appears empty or missing data rows.");

      const header = matrix[0].map(normalizeHeader);

      // Build objects
      const rawRows: Record<string, string>[] = matrix.slice(1).map((cells) => {
        const obj: Record<string, string> = {};
        for (let i = 0; i < header.length; i++) obj[header[i]] = (cells[i] ?? "").trim();
        return obj;
      });

      // Baselane exports vary; attempt flexible mapping:
      // Common columns we try:
      // - date: "date", "posted date", "transaction date"
      // - amount: "amount"
      // - description: "description", "memo"
      // - vendor/payee: "merchant", "payee", "vendor"
      // - type: "type"
      // - category: "category"
      // - receipt/link: "receipt", "receipt link", "url"
      const mapped: CsvRow[] = rawRows
        .map((r) => {
          const dateRaw =
            r["date"] || r["posted date"] || r["transaction date"] || r["posted"] || r["trans date"] || "";
          const iso = toIsoDate(dateRaw);
          const amtRaw = (r["amount"] || "").replace(/[$,]/g, "");
          const amt = Number(amtRaw);

          const vendorRaw = r["merchant"] || r["payee"] || r["vendor"] || r["counterparty"] || null;
          const descRaw = r["description"] || r["memo"] || r["note"] || null;

          const receiptRaw = r["receipt link"] || r["receipt"] || r["url"] || r["link"] || null;

          const rawType = r["type"] || r["transaction type"] || null;
          const typeGuess = Number.isFinite(amt) ? guessType(amt, rawType) : "expense";

          const catRaw = r["category"] || "";
          const cat = catRaw.trim() ? catRaw.trim() : guessCategory(descRaw, vendorRaw);

          // Preserve sign: if CSV gives all positives but has "debit/credit" types, you might want to flip.
          // We'll keep the numeric sign as provided.
          if (!iso || !Number.isFinite(amt)) return null;

          const importKey = simpleHash(
            JSON.stringify({
              date: iso,
              amount: amt,
              vendor: vendorRaw || "",
              desc: descRaw || "",
              type: typeGuess,
              category: cat,
            })
          );

          return {
            date: iso,
            type: typeGuess,
            category: cat,
            amount: amt,
            vendor: vendorRaw ? String(vendorRaw) : null,
            description: descRaw ? String(descRaw) : null,
            receipt_link: receiptRaw ? String(receiptRaw) : null,
            property_id: null,
            import_hash: importKey,
            raw: r,
          } as CsvRow;
        })
        .filter(Boolean) as CsvRow[];

      // Client-side dedupe vs existing rows by same (date+amount+vendor+desc)
      const existingHashes = new Set(
        rows.map((t) =>
          simpleHash(
            JSON.stringify({
              date: t.date,
              amount: t.amount,
              vendor: t.vendor || "",
              desc: t.description || "",
              type: t.type,
              category: t.category,
            })
          )
        )
      );

      const preview = mapped.filter((m) => !existingHashes.has(m.import_hash));
      setCsvPreview(preview);
      setCsvSummary({ total: mapped.length, ok: preview.length, skipped: mapped.length - preview.length });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setCsvParsing(false);
    }
  }

  async function importCsv() {
    if (csvPreview.length === 0) {
      setErr("Nothing to import (preview is empty).");
      return;
    }
    setErr(null);
    setCsvImporting(true);

    try {
      // Insert in chunks to avoid payload limits
      const CHUNK = 200;
      for (let i = 0; i < csvPreview.length; i += CHUNK) {
        const slice = csvPreview.slice(i, i + CHUNK);
        const payload = slice.map((r) => ({
          date: r.date,
          type: r.type,
          category: r.category,
          amount: r.amount,
          vendor: r.vendor,
          description: r.description,
          receipt_link: r.receipt_link,
          property_id: r.property_id,
        }));

        const { error } = await supabase.from("transactions").insert(payload);
        if (error) throw new Error(error.message);
      }

      // Clear preview and refresh ledger
      setCsvPreview([]);
      setCsvFileName("");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setCsvImporting(false);
    }
  }

  return (
    <main className="p-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Money Ledger</h1>
          <p className="text-sm text-slate-300">Income + expenses (latest 500)</p>
        </div>

        <div className="flex gap-2 flex-wrap">
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

      {err && <p className="mt-6 text-red-400">{err}</p>}

      {/* CSV Import */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">CSV Import (Baselane exports)</h2>
            <p className="text-sm text-slate-400 mt-1">
              Upload a Baselane CSV → preview → import into your ledger. Negative amounts are preserved.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={csvParsing || csvImporting}
              onChange={(e) => onCsvPicked(e.target.files?.[0] ?? null)}
            />
            <button
              className="rounded-xl bg-white text-black px-4 py-2"
              disabled={csvParsing || csvImporting || csvPreview.length === 0}
              onClick={importCsv}
            >
              {csvImporting ? "Importing..." : `Import ${csvPreview.length}`}
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-slate-300">
          {csvFileName ? (
            <div>
              File: <span className="text-slate-100">{csvFileName}</span>{" "}
              {csvParsing ? <span className="text-slate-400">(parsing...)</span> : null}
            </div>
          ) : (
            <div className="text-slate-400">No file selected.</div>
          )}

          {csvSummary ? (
            <div className="mt-1 text-slate-400">
              Parsed: {csvSummary.total} • New: {csvSummary.ok} • Skipped (likely duplicates): {csvSummary.skipped}
            </div>
          ) : null}
        </div>

        {csvPreview.length > 0 && (
          <div className="mt-4 overflow-auto rounded-2xl border border-slate-800 bg-slate-950/40">
            <table className="min-w-[1000px] w-full text-sm">
              <thead className="bg-slate-950/40">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-left p-3">Vendor</th>
                  <th className="text-left p-3">Description</th>
                </tr>
              </thead>
              <tbody>
                {csvPreview.slice(0, 50).map((r, index) => (
                  <tr key={r.import_hash || index} className="border-t border-slate-800">
                    <td className="p-3">{r.date}</td>
                    <td className="p-3">{r.type}</td>
                    <td className="p-3">{r.category}</td>
                    <td className="p-3 text-right">{money2(r.amount)}</td>
                    <td className="p-3">{r.vendor ?? "-"}</td>
                    <td className="p-3">{r.description ?? "-"}</td>
                  </tr>
                ))}
                {csvPreview.length > 50 && (
                  <tr className="border-t border-slate-800">
                    <td className="p-3 text-slate-400" colSpan={6}>
                      Showing first 50 rows of {csvPreview.length}. Import will include all.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add Transaction */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="font-semibold">Add Transaction</h2>
        <p className="text-sm text-slate-400 mt-1">Signed amounts allowed (negative expenses preserved).</p>

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
            <label className="text-sm text-slate-300">Receipt Link</label>
            <input className={inputCls} value={receipt} onChange={(e) => setReceipt(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-slate-300">Property ID (optional)</label>
            <input className={inputCls} value={propertyId} onChange={(e) => setPropertyId(e.target.value)} />
          </div>

          <div className="md:col-span-4">
            <button className="rounded-xl bg-white text-black px-4 py-2">Add</button>
          </div>
        </form>
      </section>

      {/* Table */}
      {loading && <p className="mt-6 text-slate-300">Loading...</p>}

      {!loading && (
        <div className="mt-6 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/40">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-950/40">
              <tr>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Property</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Category</th>
                <th className="text-right p-3">Amount</th>
                <th className="text-left p-3">Vendor</th>
                <th className="text-left p-3">Description</th>
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
                  <td className="p-3 text-right">{Number(r.amount).toFixed(2)}</td>
                  <td className="p-3">{r.vendor ?? "-"}</td>
                  <td className="p-3">{r.description ?? "-"}</td>
                  <td className="p-3">
                    {r.receipt_link ? (
                      <a className="underline" href={r.receipt_link} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <a
                        className="rounded-lg border border-slate-700 px-2 py-1 text-slate-200 hover:text-white"
                        href={`/transactions/${r.id}/edit`}
                      >
                        Edit
                      </a>
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
                  <td className="p-3" colSpan={9}>
                    No results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
