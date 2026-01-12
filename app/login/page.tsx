"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setErr(error.message);
    else window.location.href = "/";

    setLoading(false);
  }

  return (
    <main className="py-10">
      <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <h1 className="text-2xl font-semibold">Login</h1>
        <p className="text-sm text-slate-300 mt-1">Sign in to access your dashboard.</p>

        {err && <p className="mt-4 text-red-400 text-sm">{err}</p>}

        <form onSubmit={signIn} className="mt-6 space-y-3">
          <div>
            <label className="text-sm text-slate-300">Email</label>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-slate-300">Password</label>
            <input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <button className="rounded-xl bg-white text-black px-4 py-2 w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-700 bg-transparent p-2 text-slate-100 placeholder:text-slate-500";
