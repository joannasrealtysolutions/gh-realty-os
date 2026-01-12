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

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100 placeholder:text-slate-500";
const selectCls =
  "mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100";

function fmtAmt(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toFixed(2);
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

  // receipt upload state
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // top scrollbar syncing
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const topInnerRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef<"top" | "bottom" | null>(null);

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

  // keep top scrollbar width synced to table content
  useEffect(() => {
    const wrap = wrapRef.current;
    const top = topScrollRef.current;
    const inner = topInnerRef.current;
    if (!wrap || !top || !inner) return;

    const syncWidths = () => {
      // scrollWidth of wrap's content (the table) is the width we want
      inner.style.width = `${wrap.scrollWidth}px`;
      // hide top scrollbar if no horizontal scrolling is needed
      top.style.display = wrap.scrollWidth > wrap.clientWidth ? "block" : "none";
    };

    syncWidths();

    const ro = new ResizeObserver(syncWidths);
    ro.observe(wrap);

    // also re-sync after fonts/layout settle
    const t = window.setTimeout(syncWidths, 200);

    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [filtered.length, loading]);

  // scroll syncing between top and bottom
  useEffect(() => {
    const wrap = wrapRef.current;
    const top = topScrollRef.current;
    if (!wrap || !top) return;

    const onTopScroll = () => {
      if (syncingRef.current === "bottom") return;
      syncingRef.current = "top";
      wrap.scrollLeft = top.scrollLeft;
      syncingRef.current = null;
    };

    const onBottomScroll = () => {
      if (syncingRef.current === "top") return;
      syncingRef.current = "bottom";
      top.scrollLeft = wrap.scrollLeft;
      syncingRef.current = null;
    };

    top.addEventListener("scroll", onTopScroll, { passive: true });
    wrap.addEventListener("scroll", onBottomScroll, { passive: true });

    return () => {
      top.removeEventListener("scroll", onTopScroll);
      wrap.removeEventListener("scroll", onBottomScroll);
    };
  }, []);

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

    setAmount("");
    setVendor("");
    setDescription("");
    setReceipt("");
    setPropertyId("");

    await load();
  }

  async function uploadReceipt(txId: string, file: File) {
    setErr(null);
    setUploadingId(txId);
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        window.location.href = "/login";
        return;
      }

      // sanitize filename
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `tx/${txId}/${Date.now()}_${safeName}`;

      const up = await supabase.storage.from("receipts").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });

      if (up.error) throw new Error(up.error.message);

      // bucket is public => use public URL
      const pub = supabase.storage.from("receipts").getPublicUrl(path);
      const url = pub.data.publicUrl;

      const { error } = await supabase.from("transactions").update({ receipt_link: url }).eq("id", txId);
      if (error) throw new Error(error.message);

      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setUploadingId(null);
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
        <>
          {/* TOP horizontal scrollbar (synced) */}
          <div
            ref={topScrollRef}
            className="mt-6 overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-800 bg-slate-900/40"
            style={{ display: "none" }}
          >
            <div ref={topInnerRef} style={{ height: 12 }} />
          </div>

          {/* Actual scroll container */}
          <div ref={wrapRef} className="mt-3 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/40">
            <table className="min-w-[1250px] w-full text-sm">
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
                    <td className="p-3 text-right">{fmtAmt(r.amount)}</td>
                    <td className="p-3">{r.vendor ?? "-"}</td>
                    <td className="p-3">{r.description ?? "-"}</td>
                    <td className="p-3">
                      {r.receipt_link ? (
                        <a className="underline text-slate-200 hover:text-white" href={r.receipt_link} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Edit */}
                        <a
                          className="rounded-lg border border-slate-700 px-2 py-1 text-slate-200 hover:text-white"
                          href={`/transactions/${r.id}/edit`}
                        >
                          Edit
                        </a>

                        {/* Upload receipt */}
                        <label className="rounded-lg border border-slate-700 px-2 py-1 text-slate-200 hover:text-white cursor-pointer">
                          {uploadingId === r.id ? "Uploading..." : "Upload Receipt"}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            disabled={uploadingId === r.id}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadReceipt(r.id, f);
                              // reset input so you can upload same file again if needed
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>

                        {/* Delete */}
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
        </>
      )}
    </main>
  );
}
