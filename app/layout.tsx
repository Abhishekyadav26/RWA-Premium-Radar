import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RWA Premium Radar",
  description: "Track tokenised real-world assets: premiums vs aggregate and underlying prices, by issuer.",
};

function Nav() {
  const links = [
    ["Radar", "/"],
    ["Issuers", "/issuers"],
    ["API Evidence", "/evidence"],
  ] as const;
  return (
    <header className="border-b border-[#1e2b25] bg-[#070b09]/80 sticky top-0 z-10 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-6">
          <Link href="/" className="font-bold text-lime-300 tracking-tight">
          RWA Premium Radar
        </Link>
        <nav className="flex gap-4 text-sm">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="text-zinc-300 hover:text-white">
              {label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto hidden sm:block text-[11px] text-zinc-500">
          CoinMarketCap RWA API · Startup tier
        </span>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#070b09] text-zinc-100 antialiased">
        <Nav />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-8 text-[11px] text-zinc-500">
          Numbers stream live from the CoinMarketCap RWA API (server-side, cached 60s). Underlying
          prices via unofficial Yahoo Finance/Stooq feeds. Tokenised TradFi is not the underlying —
          premiums are informational, not investment advice.
        </footer>
      </body>
    </html>
  );
}
