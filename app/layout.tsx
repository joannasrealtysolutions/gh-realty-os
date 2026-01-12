import "./globals.css";

export const metadata = {
  title: "GH Realty OS",
  description: "Real estate operating system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-6xl px-4">
          <header className="py-6 flex items-center justify-between">
            <a href="/" className="font-semibold tracking-tight">
              GH Realty OS
            </a>
            <nav className="flex gap-3 text-sm">
              <a className="text-slate-200 hover:text-white" href="/properties">Properties</a>
              <a className="text-slate-200 hover:text-white" href="/money">Money</a>
            </nav>
          </header>

          {children}

          <footer className="py-10 text-xs text-slate-500">
            © {new Date().getFullYear()} GH Realty Solutions
          </footer>
        </div>
      </body>
    </html>
  );
}
