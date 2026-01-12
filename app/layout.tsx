"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(!!data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100">
        {/* Top Bar */}
        {!loading && loggedIn && (
          <header className="border-b border-slate-800 bg-slate-900/40">
            <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
              <div className="font-semibold">GH Realty OS</div>
              <button
                onClick={logout}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:text-white hover:border-slate-500"
              >
                Logout
              </button>
            </div>
          </header>
        )}

        <main className="max-w-7xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
