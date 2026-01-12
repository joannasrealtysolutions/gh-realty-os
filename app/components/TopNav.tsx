"use client";

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
      <a href="/" className="font-semibold tracking-tight">
        Joanna's Realty Solutions OS
      </a>

      <nav className="flex items-center gap-3 text-sm">
        <a className="text-slate-200 hover:text-white" href="/properties">
          Properties
        </a>
        <a className="text-slate-200 hover:text-white" href="/money">
          Money
        </a>
        <a className="text-slate-200 hover:text-white" href="/rehab">
          Rehab
        </a>

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
