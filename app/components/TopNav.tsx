"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function TopNav() {
  const [signedIn, setSignedIn] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSignedIn(!!data.session);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(error.message);
      return;
    }
    window.location.href = "/login";
  }

  return (
    <header className="py-6 flex items-center justify-between">
      <Link href="/" className="font-semibold tracking-tight">
        Joanna&apos;s Realty Solutions OS
      </Link>

      <nav className="flex items-center gap-3 text-sm">
        <Link className="text-slate-200 hover:text-white" href="/properties">
          Properties
        </Link>
        <Link className="text-slate-200 hover:text-white" href="/money">
          Money
        </Link>
        <Link className="text-slate-200 hover:text-white" href="/closing-costs">
          Closing Costs
        </Link>
        <Link className="text-slate-200 hover:text-white" href="/rehab">
          Rehab
        </Link>

        {/* Keep logout separate so it never affects your routes */}
        {!loading && signedIn && (
          <button
            onClick={logout}
            className="rounded-xl border border-slate-700 px-3 py-2 text-slate-200 hover:text-white"
            type="button"
          >
            Logout
          </button>
        )}
      </nav>
    </header>
  );
}
