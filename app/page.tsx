"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RadarResult, RadarRow } from "@/lib/radar";
import { ErrorBanner, SkeletonTable, fmtCompact, fmtPct, fmtUsd, premiumClass } from "./components/bits";
import { Avatar, Gauge, Slider, Spark } from "./components/overview";

type SortKey = "marketCap" | "price" | "premiumAgg" | "premiumUnder" | "volume24h" | "tokenSymbol";

const CARD = "rounded-xl border border-[#232c47] bg-[#141b2e]";
const HIST_KEY = "rwa-overview-spark";
const HIST_MAX = 120;

const numOr = (v: number | null, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

// Strip signal: underlying premium preferred, aggregate fallback.
const stripVal = (r: RadarRow) => r.premiumUnder ?? r.premiumAgg;

function readHist(): Record<string, number[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(HIST_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number[]>) : {};
  } catch {
    return {};
  }
}

function CheckBadge() {
  return (
    <span title="Over 25% — likely a units, share-ratio or stale-data issue, not a real arbitrage gap. Verify by hand.">
      {" "}⚠
    </span>
  );
}

function MarketBadge({ row }: { row: RadarRow }) {
  if (!row.underlyingTicker)
    return <span className="text-[11px] text-zinc-500">no reference price</span>;
  if (row.marketOpen)
    return (
      <span className="inline-block rounded bg-emerald-950 px-1.5 py-0.5 text-[11px] text-emerald-300">
        Market open
      </span>
    );
  return (
    <span
      title={row.underlyingAsOf ? `Underlying as of ${row.underlyingAsOf}` : undefined}
      className="inline-block rounded bg-amber-950 px-1.5 py-0.5 text-[11px] text-amber-300"
    >
      Market closed · vs last close
    </span>
  );
}

function Th({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  className = "",
}: {
  label: string;
  k?: SortKey;
  sortKey: SortKey;
  sortDir: 1 | -1;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  return (
    <th
      onClick={k ? () => onSort(k) : undefined}
      className={`px-3 py-2 text-left text-[11px] uppercase tracking-wide text-zinc-400 ${
        k ? "cursor-pointer select-none hover:text-white" : ""
      } ${className}`}
    >
      {label}
      {k === sortKey && (sortDir === 1 ? " ▲" : " ▼")}
    </th>
  );
}

const CHART_TIP = { background: "#0f1626", border: "1px solid #232c47", fontSize: 12, borderRadius: 8 };

export default function RadarPage() {
  const [data, setData] = useState<RadarResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [assetType, setAssetType] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [showDerivatives, setShowDerivatives] = useState(false);
  const [showNoPrice, setShowNoPrice] = useState(false);
  const [view, setView] = useState<"overview" | "breakdown">("overview");
  const [scope, setScope] = useState<"top10" | "all">("top10");
  const [hist, setHist] = useState<Record<string, number[]>>(readHist);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rwa");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to load");
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  // Snapshot poll → honest client-side sparkline history (premium %, per token).
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/snapshot");
        const j = await res.json();
        if (!res.ok || !Array.isArray(j.points) || stop) return;
        setHist((prev) => {
          const next: Record<string, number[]> = { ...prev };
          for (const p of j.points as Array<{ token: string; premiumAgg: number | null; premiumUnder: number | null }>) {
            const v = p.premiumUnder ?? p.premiumAgg;
            if (typeof v !== "number" || !Number.isFinite(v)) continue;
            next[p.token] = [...(next[p.token] ?? []), v].slice(-HIST_MAX);
          }
          try {
            localStorage.setItem(HIST_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
      } catch {
        /* offline — keep old points */
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  const types = useMemo(
    () => ["all", ...new Set((data?.rows ?? []).map((r) => r.assetType))],
    [data]
  );

  const counts = useMemo(() => {
    const all = data?.rows ?? [];
    return {
      total: all.length,
      derivatives: all.filter((r) => r.isDerivative).length,
      noPrice: all.filter((r) => r.price == null).length,
    };
  }, [data]);

  const rows = useMemo(() => {
    let r = data?.rows ?? [];
    if (!showDerivatives) r = r.filter((x) => !x.isDerivative);
    if (!showNoPrice) r = r.filter((x) => x.price != null);
    if (assetType !== "all") r = r.filter((x) => x.assetType === assetType);
    const q = query.trim().toLowerCase();
    if (q)
      r = r.filter((x) =>
        `${x.assetSymbol} ${x.assetName} ${x.tokenSymbol} ${x.tokenName} ${x.issuerName}`
          .toLowerCase()
          .includes(q)
      );
    return [...r].sort((a, b) => {
      if (sortKey === "tokenSymbol") return a.tokenSymbol.localeCompare(b.tokenSymbol) * sortDir;
      const av = numOr(a[sortKey] as number | null, 0);
      const bv = numOr(b[sortKey] as number | null, 0);
      if (a[sortKey] == null && b[sortKey] == null) return 0;
      if (a[sortKey] == null) return 1;
      if (b[sortKey] == null) return -1;
      return (av - bv) * sortDir;
    });
  }, [data, query, assetType, sortKey, sortDir, showDerivatives, showNoPrice]);

  // ---- Overview derivations (all from live /api/rwa + snapshot history) ----
  const priced = useMemo(
    () => (data?.rows ?? []).filter((r) => r.price != null && !r.isDerivative),
    [data]
  );

  const topCards = useMemo(
    () => [...priced].sort((a, b) => numOr(b.marketCap, 0) - numOr(a.marketCap, 0)).slice(0, 5),
    [priced]
  );

  const totals = useMemo(() => {
    const assets = data?.assets ?? [];
    const mcap = assets.reduce((s, a) => s + (a.marketCap ?? 0), 0);
    const vol = (data?.rows ?? []).reduce((s, r) => s + (r.volume24h ?? 0), 0);
    return { mcap, vol, assets: assets.length, tokens: (data?.rows ?? []).length };
  }, [data]);

  const premiums = useMemo(() => {
    const vals = priced
      .map((r) => stripVal(r))
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      .sort((a, b) => a - b);
    if (!vals.length) return { median: null as number | null, score: 50 };
    const median = vals[Math.floor(vals.length / 2)];
    return { median, score: Math.max(2, Math.min(98, Math.round(50 + median * 8))) };
  }, [priced]);

  const sentimentLabel = premiums.score >= 55 ? "Rich" : premiums.score <= 45 ? "Discount" : "Balanced";

  const liquid = useMemo(
    () =>
      priced.filter((r) => (r.marketCap ?? 0) >= 50_000 || (r.volume24h ?? 0) >= 25_000),
    [priced]
  );

  // Strip: true dislocations only (liquid, non-derivative, |p| in 1–25%).
  const dislocations = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((r) => r.flag === "dislocation" && r.price != null)
        .sort((a, b) => Math.abs(numOr(stripVal(b), 0)) - Math.abs(numOr(stripVal(a), 0))),
    [data]
  );

  const chartAssets = useMemo(() => {
    const list = [...(data?.assets ?? [])]
      .filter((a) => (a.marketCap ?? 0) > 0)
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    const cut = scope === "top10" ? list.slice(0, 10) : list;
    return cut.map((a) => ({ symbol: a.symbol, mcap: a.marketCap ?? 0, tokens: a.tokenCount }));
  }, [data, scope]);

  const chartTypes = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of priced) {
      if (r.marketCap == null) continue;
      by.set(r.assetType, (by.get(r.assetType) ?? 0) + r.marketCap);
    }
    return [...by.entries()]
      .map(([t, mcap]) => ({ symbol: t, mcap, tokens: 0 }))
      .sort((a, b) => b.mcap - a.mcap);
  }, [priced]);

  const chartData = view === "overview" ? chartAssets : chartTypes;

  const feed = useMemo(() => {
    const all = data?.rows ?? [];
    return {
      open: all.filter((r) => r.underlyingTicker && r.marketOpen).length,
      closed: all.filter((r) => r.underlyingTicker && !r.marketOpen).length,
      none: all.filter((r) => !r.underlyingTicker).length,
    };
  }, [data]);

  const topIssuers = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of priced) {
      if (r.marketCap == null) continue;
      by.set(r.issuerName, (by.get(r.issuerName) ?? 0) + r.marketCap);
    }
    const list = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const total = list.reduce((s, [, v]) => s + v, 0);
    return { list, total, leaderShare: totals.mcap ? (list[0]?.[1] ?? 0) / totals.mcap : 0 };
  }, [priced, totals.mcap]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === "tokenSymbol" ? 1 : -1);
    }
  };

  const tabBtn = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs ${active ? "bg-[#232c47] text-white" : "text-zinc-400 hover:text-white"}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Tokenized Market Overview</h1>
          <Link
            href="/evidence"
            className="rounded-md bg-[#232c47] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-[#2c3654]"
          >
            See API Details
          </Link>
          <button
            onClick={load}
            className="ml-auto rounded-md border border-[#232c47] px-3 py-1.5 text-xs text-zinc-300 hover:bg-[#141b2e]"
          >
            Refresh
          </button>
        </div>
        <p className="mt-1 max-w-4xl text-[13px] leading-relaxed text-zinc-400">
          Stay updated on tokenised real-world assets — live premiums vs the CMC aggregate and vs the
          real underlying, issuer concentration, and market state, all in one place.
          {data && (
            <span className="text-zinc-500">
              {" "}
              · Updated {new Date(data.generatedAt).toLocaleTimeString()} · underlying: {data.underlyingSource}
            </span>
          )}
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        <SkeletonTable />
      ) : (
        <>
          {/* Top cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {topCards.map((r) => {
              const prem = stripVal(r);
              const positive = (prem ?? 0) >= 0;
              return (
                <Link key={r.tokenSymbol + r.issuerId} href={`/assets/${r.assetSymbol}`} className={`${CARD} flex items-center justify-between gap-2 p-3 hover:border-[#334064]`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[13px] font-medium">
                      <Avatar symbol={r.tokenSymbol} />
                      <span className="truncate">{r.tokenSymbol}</span>
                    </div>
                    <div className="mt-1 font-mono text-[15px] font-semibold">{fmtUsd(r.price)}</div>
                    <div className={`font-mono text-xs ${premiumClass(prem)}`}>
                      {prem != null && prem >= 0 ? "▲ " : prem != null ? "▼ " : ""}
                      {fmtPct(prem)}
                      <span className="ml-1 font-sans text-[10px] text-zinc-500">
                        {r.premiumUnder != null ? "und" : "avg"}
                      </span>
                    </div>
                  </div>
                  <Spark data={hist[r.tokenSymbol] ?? []} positive={positive} />
                </Link>
              );
            })}
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* Left rail */}
            <div className="space-y-3">
              <section className={`${CARD} p-4`}>
                <h2 className="text-sm font-semibold">
                  Premium Sentiment <span className="font-normal text-zinc-500">ⓘ</span>
                </h2>
                <div className="mt-2">
                  <Gauge score={premiums.score} />
                  <p className="mt-1 text-center text-xs text-zinc-400">{sentimentLabel}</p>
                  <p className="mt-1 text-center text-[11px] text-zinc-500">
                    Median {premiums.median != null ? fmtPct(premiums.median) : "—"} vs underlying · 0 = cheap, 100 = rich
                  </p>
                </div>
              </section>

              <section className={`${CARD} p-4`}>
                <h2 className="text-sm font-semibold">
                  Dislocation Index <span className="font-normal text-zinc-500">ⓘ</span>
                </h2>
                <div className="mt-2 text-2xl font-bold">
                  {dislocations.length}
                  <span className="text-sm font-normal text-zinc-500"> / {liquid.length} liquid</span>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
                  <span>Calm</span>
                  <span>Dislocated</span>
                </div>
                <Slider pct={liquid.length ? (dislocations.length / liquid.length) * 100 : 0} />
                {dislocations.slice(0, 3).map((r) => (
                  <Link
                    key={r.tokenSymbol + r.issuerId}
                    href={`/assets/${r.assetSymbol}`}
                    className="mt-2 flex items-center justify-between rounded-lg bg-[#0f1626] px-2.5 py-1.5 text-xs hover:border hover:border-[#334064]"
                  >
                    <span className="font-semibold">{r.tokenSymbol}</span>
                    <span className={`font-mono ${premiumClass(stripVal(r))}`}>{fmtPct(stripVal(r))} ⚑</span>
                  </Link>
                ))}
              </section>

              <section className={`${CARD} p-4`}>
                <h2 className="text-sm font-semibold">
                  Tokenized Value <span className="font-normal text-zinc-500">ⓘ</span>
                </h2>
                <div className="mt-2 font-mono text-2xl font-bold">${fmtCompact(totals.mcap)}</div>
                <p className="mt-1 text-xs text-zinc-400">
                  {totals.assets} assets · {totals.tokens} tokens · top issuer{" "}
                  {(topIssuers.leaderShare * 100).toFixed(1)}%
                </p>
                <div className="mt-2 space-y-1.5">
                  {topIssuers.list.slice(0, 3).map(([name, v]) => (
                    <div key={name} className="text-[11px]">
                      <div className="flex justify-between text-zinc-400">
                        <span className="truncate">{name}</span>
                        <span className="font-mono">${fmtCompact(v)}</span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-[#0f1626]">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500"
                          style={{ width: `${totals.mcap ? (v / totals.mcap) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Big chart */}
            <section className={`${CARD} p-4 lg:col-span-2`}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">Tokenized Market Cap</h2>
                <div className="ml-auto flex items-center gap-1 rounded-lg bg-[#0f1626] p-1">
                  <button className={tabBtn(view === "overview")} onClick={() => setView("overview")}>
                    Overview
                  </button>
                  <button className={tabBtn(view === "breakdown")} onClick={() => setView("breakdown")}>
                    Breakdown
                  </button>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-[#0f1626] p-1">
                  <button className={tabBtn(scope === "top10")} onClick={() => setScope("top10")}>
                    Top 10
                  </button>
                  <button className={tabBtn(scope === "all")} onClick={() => setScope("all")}>
                    All
                  </button>
                </div>
              </div>
              <div className="mt-3 flex gap-8">
                <div>
                  <div className="text-[11px] text-zinc-500">Tokenized Value</div>
                  <div className="font-mono text-2xl font-bold">${fmtCompact(totals.mcap)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-500">Volume 24h</div>
                  <div className="font-mono text-2xl font-bold">${fmtCompact(totals.vol)}</div>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                {view === "overview" ? "Value by asset" : "Value by asset type"} · live snapshot — CMC has no
                historical RWA endpoint, so this is a breakdown, not a time series.
              </p>
              <div className="mt-2 h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
                    <CartesianGrid stroke="#1d2740" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      tickFormatter={(v: number) => `$${fmtCompact(v)}`}
                    />
                    <YAxis type="category" dataKey="symbol" width={70} tick={{ fill: "#d4d4d8", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={CHART_TIP}
                      formatter={(v) => [`$${fmtCompact(v as number)}`, "mcap"]}
                    />
                    <Bar dataKey="mcap" radius={[0, 6, 6, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? "#34d399" : "#10b98199"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* Bottom strip: feed health */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <section className={`${CARD} p-4`}>
              <h2 className="text-sm font-semibold">Market State</h2>
              <p className="mt-1 text-xs text-zinc-400">
                <span className="text-emerald-300">{feed.open} open</span> ·{" "}
                <span className="text-amber-300">{feed.closed} vs last close</span> ·{" "}
                <span className="text-zinc-500">{feed.none} no reference</span>
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                When the underlying market is closed, premiums compare against the last close — not a live signal.
              </p>
            </section>
            <section className={`${CARD} p-4`}>
              <h2 className="text-sm font-semibold">Biggest Dislocations</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {dislocations.slice(0, 6).map((r) => (
                  <Link
                    key={r.tokenSymbol + r.issuerId}
                    href={`/assets/${r.assetSymbol}`}
                    className="rounded-md border border-[#2a3452] bg-[#0f1626] px-2.5 py-1.5 text-xs hover:border-[#3b4a73]"
                  >
                    <span className="font-semibold">{r.tokenSymbol}</span>{" "}
                    <span className="text-zinc-400">({r.issuerName})</span>{" "}
                    <span className={premiumClass(r.premiumAgg)}>avg {fmtPct(r.premiumAgg)}</span>{" "}
                    {r.underlyingTicker && (
                      <span className={premiumClass(r.premiumUnder)}>und {fmtPct(r.premiumUnder)}</span>
                    )}
                  </Link>
                ))}
                {dislocations.length === 0 && (
                  <span className="text-xs text-zinc-500">No 1–25% dislocations on liquid tokens right now.</span>
                )}
              </div>
            </section>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search asset, token, issuer…"
              className="w-64 rounded-md border border-[#232c47] bg-[#141b2e] px-3 py-1.5 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-600"
            />
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              className="rounded-md border border-[#232c47] bg-[#141b2e] px-3 py-1.5 text-sm"
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t === "all" ? "All types" : t}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 rounded-md border border-[#232c47] px-2.5 py-1.5 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={showDerivatives}
                onChange={(e) => setShowDerivatives(e.target.checked)}
              />
              Show perps ({counts.derivatives})
            </label>
            <label className="flex items-center gap-1.5 rounded-md border border-[#232c47] px-2.5 py-1.5 text-xs text-zinc-300">
              <input type="checkbox" checked={showNoPrice} onChange={(e) => setShowNoPrice(e.target.checked)} />
              Show no-price rows ({counts.noPrice})
            </label>
            <span className="self-center text-xs text-zinc-500">
              {rows.length} of {counts.total} tokens
            </span>
          </div>

          {/* Radar table */}
          {rows.length === 0 ? (
            <div className={`${CARD} p-8 text-center text-sm text-zinc-400`}>
              No tokens match. Try clearing the search or toggling the filters.
            </div>
          ) : (
            <div className={`${CARD} overflow-x-auto`}>
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-[#0f1626]">
                  <tr>
                    <Th label="Asset" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <Th label="Token" k="tokenSymbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <Th label="Issuer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <Th label="Price" k="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <Th label="vs CMC avg" k="premiumAgg" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <Th label="vs underlying" k="premiumUnder" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <Th label="Market state" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <Th label="Mcap" k="marketCap" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <Th label="Vol 24h" k="volume24h" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.tokenSymbol + r.issuerId} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-3 py-2">
                        <Link href={`/assets/${r.assetSymbol}`} className="font-medium hover:text-emerald-300">
                          {r.assetSymbol}
                        </Link>
                        <div className="text-[11px] text-zinc-500">
                          {r.assetName} · {r.assetType}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono">{r.tokenSymbol}</span>
                        {r.isDerivative && (
                          <span className="ml-1 rounded bg-zinc-800 px-1 text-[10px] text-zinc-400">perp</span>
                        )}
                        {r.flag === "check-data" && <CheckBadge />}
                        <div className="text-[11px] text-zinc-500">{r.tokenName}</div>
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        <Link href={`/issuers/${r.issuerId}`} className="hover:text-emerald-300">
                          {r.issuerName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{fmtUsd(r.price)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${premiumClass(r.premiumAgg)}`}>
                        {fmtPct(r.premiumAgg)}
                        {r.flag === "dislocation" && <span title="1–25% dislocation"> ⚑</span>}
                        {r.flag === "check-data" && Math.abs(numOr(r.premiumUnder, 0)) <= 25 && <CheckBadge />}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${premiumClass(r.premiumUnder)}`}>
                        {r.underlyingTicker ? (
                          <>
                            {fmtPct(r.premiumUnder)}
                            {r.flag === "dislocation" && <span title="1–25% dislocation"> ⚑</span>}
                            {r.flag === "check-data" && Math.abs(numOr(r.premiumUnder, 0)) > 25 && <CheckBadge />}
                            <div
                              className="text-[10px] font-sans text-zinc-500"
                              title={`${r.underlyingLabel} · ${r.underlyingTicker}${r.refNote ? ` · ${r.refNote}` : ""}`}
                            >
                              {r.refUnitPrice != null ? (
                                <>
                                  {fmtUsd(r.refUnitPrice)}
                                  {r.refUnitSuffix} ref
                                </>
                              ) : (
                                <>{r.underlyingTicker} n/a</>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="font-sans text-[11px] text-zinc-500">no reference</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <MarketBadge row={r} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-300">
                        {r.marketCap ? "$" + fmtCompact(r.marketCap) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-300">
                        {r.volume24h ? "$" + fmtCompact(r.volume24h) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-zinc-500">
            vs CMC avg = token price ÷ (CMC average_tokenized_price × units-per-token) − 1 (unit-normalized,
            so gram tokens compare against a per-gram slice of the aggregate). vs underlying = token price
            ÷ (underlying × units-per-token) − 1; metals use true spot first, futures only as fallback.
            ⚑ flags a 1–25% dislocation on liquid, redeemable tokens. ⚠ means over 25% — almost always a
            units, share-ratio or stale-data issue, not an arbitrage gap. Sparklines track premium history
            in your browser (60s snapshots, last {HIST_MAX} points). Perps and rows without a price
            are hidden by default.
          </p>
        </>
      )}
    </div>
  );
}
