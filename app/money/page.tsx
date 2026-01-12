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
  properties?: { address: string } | null;

  // optional import fields (won’t break if null)
  source?: string | null;
  import_hash?: string | null;
  external_account?: string | null;
  external_property?: string | null;
  external_unit?: string | null;
  external_category?: string | null;
  external_subcategory?: string | null;
};

type BaselaneRow = {
  Account?: string;
  Date?: string;
  Merchant?: string;
  Description?: string;
  Amount?: string;
  Type?: string;
  Category?: string;
  "Sub-category"?: string;
  Property?: string;
  Unit?: string;
  Notes?: string;
};

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100 placeholder:text-slate-500";
const selectCls =
  "mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100";

function money2(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoney(s: any): number | null {
  if (s === null || s === undefined) return null;
  const raw = String(s).trim();
  if (!raw) return null;

  // handle ($1,234.56)
  const isParenNeg = raw.startsWith("(") && raw.endsWith(")");
  const cleaned = raw
    .replace(/[,$]/g, "")
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .replace(/\$/g, "")
    .trim();

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return isParenNeg ? -Math.abs(n) : n;
}

function parseDateToISO(s: any): string | null {
  if (s === null || s === undefined) return null;
  const raw = String(s).trim();
  if (!raw) return null;

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Try MM/DD/YYYY or M/D/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = String(mdy[1]).padStart(2, "0");
    const dd = String(mdy[2]).padStart(2, "0");
    const yyyy = mdy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Fallback: Date.parse
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function normalizeType(typeText: any, amount: number): "income" | "expense" {
  const t = String(typeText ?? "").toLowerCase();
  if (t.includes("income") || t.includes("credit") || t.includes("deposit")) return "income";
  if (t.includes("expense") || t.includes("debit") || t.includes("withdraw")) return "expense";

  // fallback: sign
  return amount >= 0 ? "income" : "expense";
}

/**
 * Lightweight deterministic hash (DJB2-ish) to dedupe CSV rows.
 * Good enough for “same export won’t reimport twice”.
 */
function hash32(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  // convert to unsigned 32-bit and hex
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Basic CSV parser (handles quotes and commas).
 * Returns array of rows with header->value mapping.
 */
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n") {
        cur.push(field);
        field = "";
        rows.push(cur);
        cur = [];
      } else if (c === "\r") {
        // ignore
      } else {
        field += c;
      }
    }
  }

  // last line
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // skip empty line
    if (row.every((x) => !String(x ?? "").trim())) continue;

    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = String(row[c] ?? "").trim();
    }
    out.push(obj);
  }

  return out;
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

  // CSV import state
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [csvName, setCsvName] = useState<string>("");
  const [csvPreview, setCsvPreview] = useState<BaselaneRow[]>([]);
  const [csvParsedCount, setCsvParsedCount] = useState<number>(0);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number; errors: number } | null>(null);

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
      source: "manual",
      import_hash: null,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    setAmount("");
    setVendor("");
    setDescription("");
    setReceipt("");
    setPropertyId("");

    await load();
  }

  async function onPickCSV(file: File) {
    setErr(null);
    setImportResult(null);

    const text = await file.text();
    const parsed = parseCSV(text);

    // Map headers to BaselaneRow (your header includes Sub-category with a dash)
    const mapped: BaselaneRow[] = parsed.map((r) => ({
      Account: r["Account"] ?? "",
      Date: r["Date"] ?? "",
      Merchant: r["Merchant"] ?? "",
      Description: r["Description"] ?? "",
      Amount: r["Amount"] ?? "",
      Type: r["Type"] ?? "",
      Category: r["Category"] ?? "",
      "Sub-category": r["Sub-category"] ?? "",
      Property: r["Property"] ?? "",
      Unit: r["Unit"] ?? "",
      Notes: r["Notes"] ?? "",
    }));

    setCsvName(file.name);
    setCsvParsedCount(mapped.length);
    setCsvPreview(mapped.slice(0, 25));
  }

  async function importCSV() {
    setErr(null);
    setImporting(true);
    setImportResult(null);

    try {
      if (!csvName || csvParsedCount === 0) {
        setErr("Choose a Baselane CSV first.");
        return;
      }

      // We only stored preview rows; re-read full file from input to import all
      const f = fileRef.current?.files?.[0];
      if (!f) {
        setErr("CSV file missing. Re-select the file.");
        return;
      }

      const text = await f.text();
      const parsed = parseCSV(text);

      const nowSource = "baselane_csv";

      // Build inserts
      const inserts = [];
      let badRows = 0;

      for (const r of parsed) {
        const iso = parseDateToISO(r["Date"]);
        const amt0 = parseMoney(r["Amount"]);
        if (!iso || amt0 === null) {
          badRows++;
          continue;
        }

        const t = normalizeType(r["Type"], amt0);

        // standardize sign: expense negative, income positive
        const amt = t === "expense" ? -Math.abs(amt0) : Math.abs(amt0);

        const cat = (r["Category"] || "").trim();
        const sub = (r["Sub-category"] || "").trim();
        const mergedCategory = sub ? `${cat} • ${sub}` : (cat || "Other");

        const merch = (r["Merchant"] || "").trim();
        const desc = (r["Description"] || "").trim();
        const notes = (r["Notes"] || "").trim();
        const prop = (r["Property"] || "").trim();
        const unit = (r["Unit"] || "").trim();
        const acct = (r["Account"] || "").trim();

        // Put property/unit into description for now (we can auto-match to property_id next step)
        const extraBits = [
          acct ? `Account: ${acct}` : null,
          prop ? `Property: ${prop}` : null,
          unit ? `Unit: ${unit}` : null,
        ].filter(Boolean);

        const fullDesc = [desc, notes].filter(Boolean).join(" — ").trim() || null;
        const fullDescWithMeta = extraBits.length
          ? `${fullDesc ?? ""}${fullDesc ? " | " : ""}${extraBits.join(" | ")}`
          : fullDesc;

        // Deterministic dedupe hash
        const sig = [
          nowSource,
          iso,
          mergedCategory,
          String(amt.toFixed(2)),
          merch,
          desc,
          notes,
          acct,
          prop,
          unit,
          String(r["Type"] || ""),
        ].join("||");

        const import_hash = `${nowSource}_${hash32(sig)}`;

        inserts.push({
          date: iso,
          type: t,
          category: mergedCategory,
          amount: amt,
          vendor: merch || null,
          description: fullDescWithMeta || null,
          receipt_link: null,
          property_id: null,

          source: nowSource,
          import_hash,
          external_account: acct || null,
          external_property: prop || null,
          external_unit: unit || null,
          external_category: cat || null,
          external_subcategory: sub || null,
        });
      }

      if (inserts.length === 0) {
        setErr("No valid rows found to import. Check Date/Amount formatting.");
        return;
      }

      // Insert in chunks to avoid payload limits
      const CHUNK = 250;
      let inserted = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < inserts.length; i += CHUNK) {
        const chunk = inserts.slice(i, i + CHUNK);

        // Upsert using import_hash unique index — duplicates will be skipped via onConflict
        const { data, error } = await supabase
          .from("transactions")
          .upsert(chunk as any, { onConflict: "import_hash", ignoreDuplicates: true })
          .select("id");

        if (error) {
          // If one chunk fails, count errors and continue
          console.error(error);
          errors += chunk.length;
          continue;
        }

        const got = (data as any[] | null)?.length ?? 0;
        inserted += got;
        skipped += (chunk.length - got);
      }

      setImportResult({ inserted, skipped, errors: badRows + errors });
      await load();
    } finally {
      setImporting(false);
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
            <option value="all" className="bg-slate-950">All</option>
            <option value="income" className="bg-slate-950">Income</option>
            <option value="expense" className="bg-slate-950">Expense</option>
          </select>

          <button className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {err && <p className="mt-6 text-red-400">{err}</p>}

      {/* CSV Import */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold">CSV Import (Baselane)</h2>
            <p className="text-sm text-slate-400 mt-1">
              Upload a Baselane export. Duplicates are automatically skipped.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickCSV(f);
              }}
            />
            <button
              className="rounded-xl bg-white text-black px-4 py-2"
              onClick={importCSV}
              disabled={importing || csvParsedCount === 0}
            >
              {importing ? "Importing..." : "Import CSV"}
            </button>
          </div>
        </div>

        {csvName && (
          <div className="mt-4 text-sm text-slate-300">
            File: <span className="text-slate-100">{csvName}</span> • Rows detected:{" "}
            <span className="text-slate-100">{csvParsedCount}</span>
          </div>
        )}

        {importResult && (
          <div className="mt-4 text-sm">
            <div className="text-slate-200">
              Imported: <span className="text-slate-100 font-medium">{importResult.inserted}</span> •
              Skipped (duplicates): <span className="text-slate-100 font-medium">{importResult.skipped}</span> •
              Errors/invalid rows: <span className="text-slate-100 font-medium">{importResult.errors}</span>
            </div>
          </div>
        )}

        {csvPreview.length > 0 && (
          <div className="mt-4 overflow-auto rounded-xl border border-slate-800">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-slate-950/40">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Merchant</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-left p-3">Sub-category</th>
                  <th className="text-left p-3">Property</th>
                  <th className="text-right p-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {csvPreview.map((r, idx) => (
                  <tr key={idx} className="border-t border-slate-800">
                    <td className="p-3">{r.Date ?? "-"}</td>
                    <td className="p-3">{r.Merchant ?? "-"}</td>
                    <td className="p-3">{r.Type ?? "-"}</td>
                    <td className="p-3">{r.Category ?? "-"}</td>
                    <td className="p-3">{(r as any)["Sub-category"] ?? "-"}</td>
                    <td className="p-3">{r.Property ?? "-"}</td>
                    <td className="p-3 text-right">{r.Amount ?? "-"}</td>
                  </tr>
                ))}
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
              <option value="expense" className="bg-slate-950">expense</option>
              <option value="income" className="bg-slate-950">income</option>
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
            <button className="rounded-xl bg-white text-black px-4 py-2">
              Add
            </button>
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
                  <td className="p-3 text-right">{money2(r.amount)}</td>
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
                    <button
                      className="rounded-lg border border-slate-700 px-2 py-1 text-slate-200 hover:text-white"
                      onClick={() => del(r.id)}
                    >
                      Delete
                    </button>
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
