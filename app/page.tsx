import Link from "next/link";
import { LandingStats } from "./components/landing-stats";

const DOTS: React.CSSProperties = {
  backgroundImage: "radial-gradient(rgba(0,0,0,0.14) 1.2px, transparent 1.2px)",
  backgroundSize: "18px 18px",
};

function UseCase({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[#1e2b25] bg-[#0d1411] p-4">
      <div className="text-sm font-semibold text-lime-200">{title}</div>
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">{body}</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="space-y-4">
      {/* Hero */}
      <section className="rounded-[2rem] bg-[#ececea] p-8 text-zinc-950 md:p-14" style={DOTS}>
        <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-zinc-700">
          <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
          Live on CoinMarketCap RWA API · Startup tier
        </div>
        <h1 className="mt-4 max-w-3xl text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
          Rich or cheap?
          <br />
          Know before you buy.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-700">
          RWA Premium Radar compares every tokenised gold, stock, and ETF token against the CMC
          aggregate and the real underlying price — so you buy the issuer priced closest to fair.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/radar"
            className="rounded-full bg-lime-300 px-6 py-3 text-sm font-bold text-zinc-950 hover:bg-lime-200"
          >
            Launch the radar →
          </Link>
          <Link
            href="/evidence"
            className="rounded-full border border-zinc-950/25 px-6 py-3 text-sm font-semibold hover:bg-zinc-950 hover:text-white"
          >
            See API evidence
          </Link>
        </div>

        {/* Feature cards */}
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 font-mono text-sm font-bold text-lime-300">
              %
            </div>
            <h2 className="mt-8 text-2xl font-extrabold tracking-tight">Two premiums, every token</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Each token is measured against the average tokenised price and the real market price —
              size-adjusted, so a 1-gram gold token is judged per gram, not per ounce.
            </p>
            <Link href="/radar" className="mt-4 inline-block rounded-full border border-zinc-950/20 px-4 py-2 text-xs font-semibold hover:bg-zinc-950 hover:text-white">
              Open the table ▸
            </Link>
          </div>
          <div className="rounded-3xl bg-[#5b50e6] p-6 text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 font-mono text-sm font-bold">
              ⚑
            </div>
            <h2 className="mt-8 text-2xl font-extrabold tracking-tight">Spots gaps, not hype</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/80">
              Liquid tokens sitting 1–25% off fair value get flagged. Anything wilder gets a
              check-data badge — usually a units quirk or stale feed, not free money.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-mono">
              <span className="rounded-full bg-white/20 px-3 py-1">⚑ dislocation</span>
              <span className="rounded-full bg-white/20 px-3 py-1">⚠ check-data</span>
              <span className="rounded-full bg-white/20 px-3 py-1">Market closed · vs last close</span>
            </div>
          </div>
        </div>
      </section>

      {/* Live stats */}
      <LandingStats />

      {/* How it works */}
      <section className="rounded-[2rem] border border-[#1e2b25] bg-[#0d1411] p-8 md:p-10">
        <h2 className="text-3xl font-black tracking-tight md:text-4xl">Custom math, ready to trust</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { n: "01", t: "Live data in", b: "Token prices stream from CoinMarketCap's RWA API (server-side, cached 60s). Real-world prices come from spot and market feeds." },
            { n: "02", t: "Size-adjusted math", b: "Premiums are unit-normalized — gram tokens vs per-gram slices — so cross-issuer spreads like PAXG vs XAUt actually mean something." },
            { n: "03", t: "Flags you can act on", b: "Dislocations surface only on liquid, redeemable tokens. Perps, dust, and no-price rows stay out of the signal." },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl bg-[#090f0c] p-5">
              <div className="font-mono text-xs text-lime-300">{s.n}</div>
              <div className="mt-1 text-lg font-bold">{s.t}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">{s.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UseCase title="Pick the cheapest issuer" body="Several tokens track the same asset. Compare PAXG vs XAUt — or xStocks vs Ondo vs Backed — and buy the one closest to the underlying." />
        <UseCase title="Time entries, skip overpaying" body="A token 2% rich means paying 2% over fair for identical exposure. A discount can be the better entry — it matters most where stocks or gold are hard to buy directly." />
        <UseCase title="Screen liquidity first" body="Market cap and volume filters separate tradable tokens from thin ones. Round-priced, near-zero-volume tokens get flagged before you touch them." />
        <UseCase title="Do issuer due diligence" body="Compare issuers by tokens listed, total tokenised value, and how tightly each tracks its underlying. Persistent gaps are a risk signal." />
      </div>

      {/* Bottom CTA */}
      <section className="flex flex-col items-start justify-between gap-4 rounded-[2rem] bg-lime-300 p-8 text-zinc-950 md:flex-row md:items-center md:p-10">
        <div>
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">Stop guessing. Check the premium.</h2>
          <p className="mt-1 text-sm text-zinc-800">
            Free, live, no wallet needed — benchmarks are informational, not investment advice.
          </p>
        </div>
        <Link
          href="/radar"
          className="shrink-0 rounded-full bg-zinc-950 px-8 py-3.5 text-sm font-bold text-white hover:bg-black"
        >
          Get started →
        </Link>
      </section>
    </div>
  );
}
