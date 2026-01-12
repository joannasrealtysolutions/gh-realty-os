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
};

type PropOption = { id: string; address: string };

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

type NormalizedImport = {
  date: string;
  type: "income" | "expense";
  category: string;
  amount: number;
  vendor: string | null;
  description: string | null;
  property_id: string | null;

  // metadata for dedupe/debug
  source: string;
  import_hash: string;
  external_account: string | null;
  external_property: string | null;
  external_unit: string | null;
  external_category: string | null;
  external_subcategory: string | null;
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
  let raw = String(s).trim();
  if (!raw) return null;

  const isParenNeg = raw.startsWith("(") && raw.endsWith(")");
  raw = raw.replace(/^\(/, "").replace(/\)$/, "");
  raw = raw.replace(/[^0-9.\-]/g, "");
  if (!raw) return null;

  const n = Number(raw);
  if (!Number.isFinite(n)) return null;

  return isParenNeg ? -Math.abs(n) : n;
}

function parseDateToISO(s: any): string | null {
  if (s === null || s === undefined) return null;
  const raw0 = String(s).trim();
  if (!raw0) return null;

  if (/^\d{4}-\d{2}-\d{2}\s/.test(raw0)) return raw0.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw0)) return raw0;

  const mdy = raw0.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = String(mdy[1]).padStart(2, "0");
    const dd = String(mdy[2]).padStart(2, "0");
    const yyyy = mdy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const t = Date.parse(raw0);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function normalizeType(typeText: any, amount: number): "income" | "expense" {
  const t = String(typeText ?? "").toLowerCase();
  if (t.includes("income") || t.includes("credit") || t.includes("deposit")) return "income";
  if (t.includes("expense") || t.includes("debit") || t.includes("withdraw")) return "expense";
  return amount >= 0 ? "income" : "expense";
}

function hash32(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
}

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

  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  if (rows.length === 0) return [];

  const header = rows[0].map((h, idx) => {
    const trimmed = String(h ?? "").trim();
    return idx === 0 ? trimmed.replace(/^\uFEFF/, "") : trimmed;
  });

  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((x) => !String(x ?? "").trim())) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = String(row[c] ?? "").trim();
    out.push(obj);
  }

  return out;
}

function bestMatchPropertyId(externalProperty: string | null, props: PropOption[]): string | null {
  const p = (externalProperty || "").trim().toLowerCase();
  if (!p) return null;

  // best-effort: contains match
  const found = props.find((x) => x.address.toLowerCase().includes(p) || p.includes(x.address.toLowerCase()));
  return found?.id ?? null;
}

export default function MoneyPage() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [props, setProps] = useState<PropOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [search, setSearch] = useState("");

  // manual add form
  const [date, setDate] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("Repairs");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState("");
  const [propertyId, setPropertyId] = useState<string>("");

  // CSV import
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [csvName, setCsvName] = useState<string>("");
  const [csvParsedCount, setCsvParsedCount] = useState<number>(0);
  const [csvPreviewRaw, setCsvPreviewRaw] = useState<BaselaneRow[]>([]);
  const [csvPreviewNorm, setCsvPreviewNorm] = useState<NormalizedImport[]>([]);
  const [importing, setImporting] = useState(false);

  const [importResult, setImportResult] = useState<{
    inserted: number;
    skipped_duplicates: number;
    skipped_missing_date: number;
    skipped_missing_amount: number;
    chunk_errors: number;
    first_error: string | null;
  } | null>(null);

  async function loadAll() {
    setLoading(true);
    setErr(null);

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = "/login";
      return;
    }

    const pRes = await supabase.from("properties").select("id,address").order("address");
    if (!pRes.error) setProps((pRes.data as any) ?? []);

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
    loadAll();
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
    if (error) return alert(error.message);
    await loadAll();
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
      amount: a,
      vendor: vendor.trim() || null,
      description: description.trim() || null,
      receipt_link: receipt.trim() || null,
      property_id: propertyId || null,
      source: "manual",
      import_hash: null,
    });

    if (error) return setErr(error.message);

    setAmount("");
    setVendor("");
    setDescription("");
    setReceipt("");
    setPropertyId("");
    await loadAll();
  }

  function normalizeBaselane(parsed: Record<string, string>[], propList: PropOption[]): {
    rawPreview: BaselaneRow[];
    normAll: NormalizedImport[];
    skipped_missing_date: number;
    skipped_missing_amount: number;
  } {
    const source = "baselane_csv";
    let skipped_missing_date = 0;
    let skipped_missing_amount = 0;

    const rawPreview: BaselaneRow[] = parsed.slice(0, 25).map((r) => ({
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

    const normAll: NormalizedImport[] = [];

    for (const r of parsed) {
      const iso = parseDateToISO(r["Date"]);
      if (!iso) {
        skipped_missing_date++;
        continue;
      }

      const amt0 = parseMoney(r["Amount"]);
      if (amt0 === null) {
        skipped_missing_amount++;
        continue;
      }

      const t = normalizeType(r["Type"], amt0);
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

      const extraBits = [
        acct ? `Account: ${acct}` : null,
        prop ? `Property: ${prop}` : null,
        unit ? `Unit: ${unit}` : null,
      ].filter(Boolean);

      const fullDesc = [desc, notes].filter(Boolean).join(" — ").trim() || null;
      const fullDescWithMeta = extraBits.length
        ? `${fullDesc ?? ""}${fullDesc ? " | " : ""}${extraBits.join(" | ")}`
        : fullDesc;

      const import_hash = `${source}_${hash32(
        [source, iso, mergedCategory, String(amt.toFixed(2)), merch, desc, notes, acct, prop, unit, String(r["Type"] || "")]
          .join("||")
      )}`;

      const matchedPropertyId = bestMatchPropertyId(prop || null, propList);

      normAll.push({
        date: iso,
        type: t,
        category: mergedCategory,
        amount: amt,
        vendor: merch || null,
        description: fullDescWithMeta || null,
        property_id: matchedPropertyId,

        source,
        import_hash,
        external_account: acct || null,
        external_property: prop || null,
        external_unit: unit || null,
        external_category: cat || null,
        external_subcategory: sub || null,
      });
    }

    return { rawPreview, normAll, skipped_missing_date, skipped_missing_amount };
  }

  async function onPickCSV(file: File) {
    setErr(null);
    setImportResult(null);

    const text = await file.text();
    const parsed = parseCSV(text);

    const { rawPreview, normAll } = normalizeBaselane(parsed, props);

    setCsvName(file.name);
    setCsvParsedCount(parsed.length);
    setCsvPreviewRaw(rawPreview);
    setCsvPreviewNorm(normAll.slice(0, 25));
  }

  async function importCSV() {
    setErr(null);
    setImporting(true);
    setImportResult(null);

    try {
      const f = fileRef.current?.files?.[0];
      if (!f) {
        setErr("Choose a Baselane CSV first.");
        return;
      }

      const text = await f.text();
      const parsed = parseCSV(text);
      const { normAll, skipped_missing_date, skipped_missing_amount } = normalizeBaselane(parsed, props);

      if (normAll.length === 0) {
        setErr("No valid rows found to import. (Dates/Amounts didn’t parse.)");
        return;
      }

      const CHUNK = 250;
      let inserted = 0;
      let skipped_duplicates = 0;
      let chunk_errors = 0;
      let first_error: string | null = null;

      for (let i = 0; i < normAll.length; i += CHUNK) {
        const chunk = normAll.slice(i, i + CHUNK);

        const { data, error } = await supabase
          .from("transactions")
          .upsert(chunk, { onConflict: "import_hash", ignoreDuplicates: true })
          .select("id");

        if (error) {
          chunk_errors += chunk.length;
          if (!first_error) first_error = error.message;
          continue;
        }

        const got = (data as any[] | null)?.length ?? 0;
        inserted += got;
        skipped_duplicates += (chunk.length - got);
      }

      setImportResult({
        inserted,
        skipped_duplicates,
        skipped_missing_date,
        skipped_missing_amount,
        chunk_errors,
        first_error,
      });

      if (first_error) {
        setErr(`Import failed for some rows: ${first_error}`);
      }

      await loadAll();
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

          <button className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white" onClick={loadAll}>
            Refresh
          </button>
        </div>
      </div>

      {err && <p className="mt-6 text-red-400 whitespace-pre-wrap">{err}</p>}

      {/* CSV Import */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold">CSV Import (Baselane)</h2>
            <p className="text-sm text-slate-400 mt-1">
              Preview shows exactly what will be inserted.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onPickCSV(file);
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
            {csvName} • Rows detected: <span className="text-slate-100">{csvParsedCount}</span>
          </div>
        )}

        {importResult && (
          <div className="mt-4 text-sm text-slate-200 space-y-1">
            <div>
              Imported: <span className="text-slate-100 font-medium">{importResult.inserted}</span> •
              Skipped duplicates: <span className="text-slate-100 font-medium">{importResult.skipped_duplicates}</span> •
              Chunk errors: <span className="text-slate-100 font-medium">{importResult.chunk_errors}</span>
            </div>
            <div className="text-slate-400">
              Skipped (missing date): {importResult.skipped_missing_date} • Skipped (missing amount): {importResult.skipped_missing_amount}
            </div>
            {importResult.first_error && (
              <div className="text-red-300">First error: {importResult.first_error}</div>
            )}
          </div>
        )}

        {/* Normalized Preview (matches insert) */}
        {csvPreviewNorm.length > 0 && (
          <div className="mt-4 overflow-auto rounded-xl border border-slate-800">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-slate-950/40">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Vendor</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-left p-3">Property Match</th>
                  <th className="text-left p-3">Description</th>
                </tr>
              </thead>
              <tbody>
                {csvPreviewNorm.map((r, idx) => (
                  <tr key={idx} className="border-t border-slate-800">
                    <td className="p-3">{r.date}</td>
                    <td className="p-3">{r.vendor ?? "-"}</td>
                    <td className="p-3">{r.type}</td>
                    <td className="p-3">{r.category}</td>
                    <td className="p-3 text-right">{money2(r.amount)}</td>
                    <td className="p-3">{r.property_id ? "Matched" : "-"}</td>
                    <td className="p-3">{r.description ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Raw Preview (what Baselane gave you) */}
        {csvPreviewRaw.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-slate-300">Show raw Baselane preview</summary>
            <div className="mt-3 overflow-auto rounded-xl border border-slate-800">
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
                  {csvPreviewRaw.map((r, idx) => (
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
          </details>
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
