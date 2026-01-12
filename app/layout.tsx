import "./globals.css";
import TopNav from "./components/TopNav";

export const metadata = {
  title: "GH Realty OS",
  description: "Real estate operating system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-6xl px-4">
          <TopNav />

          {children}

          <footer className="py-10 text-xs text-slate-500">
            © {new Date().getFullYear()} GH Realty Solutions
          </footer>
        </div>
      </body>
    </html>
  );
}