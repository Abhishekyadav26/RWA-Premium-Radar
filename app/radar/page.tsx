"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RadarResult, RadarRow } from "@/lib/radar";
import { ErrorBanner, SkeletonTable, fmtCompact, fmtPct, fmtUsd, premiumClass } from "../components/bits";
import { Avatar } from "../components/overview";

type SortKey = "marketCap" | "price" | "premiumAgg" | "premiumUnder" | "volume24h" | "tokenSymbol";

const CARD = "rounded-2xl border border-[#1e2b25] bg-[#0d1411]";
const HIST_KEY = "rwa-overview-spark-v2";
const HIST_MAX = 120;
const SERIES_COLORS = ["#b8f53d", "#34d399", "#5eead4", "#fbbf24", "#c4b5fd"];
const DONUT_COLORS = ["#b8f53d", "#34d399", "#5eead4", "#fbbf24", "#f472b6", "#3f4a44"];

interface HistPt {
  at: number;
  und: number | null;
  agg: number | null;
}

const numOr = (v: number | null, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

// Strip signal: underlying premium preferred, aggregate fallback.
const stripVal = (r: RadarRow) => r.premiumUnder ?? r.premiumAgg;

function readHist(): Record<string, HistPt[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(HIST_KEY);
    return raw ? (JSON.parse(raw) as Record<string, HistPt[]>) : {};
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

const CHART_TIP = { background: "#0a100d", border: "1px solid #1e2b25", fontSize: 12, borderRadius: 10 };
const GRID = "#182420";

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
  const [metric, setMetric] = useState<"und" | "agg">("und");
  const [hist, setHist] = useState<Record<string, HistPt[]>>(readHist);

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

  // Snapshot poll → honest client-side premium history (per token, timestamped).
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/snapshot");
        const j = await res.json();
        if (!res.ok || !Array.isArray(j.points) || stop) return;
        const at = Date.parse(j.at) || Date.now();
        setHist((prev) => {
          const next: Record<string, HistPt[]> = { ...prev };
          for (const p of j.points as Array<{ token: string; premiumAgg: number | null; premiumUnder: number | null }>) {
            const und = typeof p.premiumUnder === "number" ? p.premiumUnder : null;
            const agg = typeof p.premiumAgg === "number" ? p.premiumAgg : null;
            if (und == null && agg == null) continue;
            next[p.token] = [...(next[p.token] ?? []), { at, und, agg }].slice(-HIST_MAX);
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

  const totals = useMemo(() => {
    const assets = data?.assets ?? [];
    const mcap = assets.reduce((s, a) => s + (a.marketCap ?? 0), 0);
    const vol = (data?.rows ?? []).reduce((s, r) => s + (r.volume24h ?? 0), 0);
    return { mcap, vol, assets: assets.length, tokens: (data?.rows ?? []).length };
  }, [data]);

  const medianPrem = useMemo(() => {
    const vals = priced
      .map((r) => stripVal(r))
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      .sort((a, b) => a - b);
    return vals.length ? vals[Math.floor(vals.length / 2)] : null;
  }, [priced]);

  // Strip: true dislocations only (liquid, non-derivative, |p| in 1–25%).
  const dislocations = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((r) => r.flag === "dislocation" && r.price != null)
        .sort((a, b) => Math.abs(numOr(stripVal(b), 0)) - Math.abs(numOr(stripVal(a), 0))),
    [data]
  );

  // Premium-history area chart: top-5 tokens by mcap, session snapshots.
  const seriesTokens = useMemo(
    () => [...priced].sort((a, b) => numOr(b.marketCap, 0) - numOr(a.marketCap, 0)).slice(0, 5),
    [priced]
  );

  const areaRows = useMemo(() => {
    const syms = seriesTokens.map((r) => r.tokenSymbol);
    const byAt = new Map<number, Record<string, number | string>>();
    for (const s of syms) {
      for (const p of hist[s] ?? []) {
        const v = metric === "und" ? p.und ?? p.agg : p.agg ?? p.und;
        if (v == null || !Number.isFinite(v)) continue;
        if (!byAt.has(p.at)) byAt.set(p.at, { t: new Date(p.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
        byAt.get(p.at)![s] = Number(v.toFixed(3));
      }
    }
    return [...byAt.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  }, [hist, seriesTokens, metric]);

  // Best-price card: cheapest vs priciest issuer for the top dislocation asset.
  const bestPrice = useMemo(() => {
    const top = dislocations[0];
    if (!top) return null;
    const sibs = priced.filter((r) => r.assetSymbol === top.assetSymbol && r.price != null);
    if (sibs.length < 2) return null;
    const lo = sibs.reduce((a, b) => ((a.price ?? Infinity) < (b.price ?? Infinity) ? a : b));
    const hi = sibs.reduce((a, b) => ((a.price ?? 0) > (b.price ?? 0) ? a : b));
    const spread = lo.price ? (((hi.price ?? 0) - (lo.price ?? 0)) / (lo.price ?? 1)) * 100 : null;
    return { asset: top.assetSymbol, lo, hi, spread };
  }, [dislocations, priced]);

  // Trending bars: top-10 tokens by 24h volume.
  const volBars = useMemo(
    () =>
      [...priced]
        .filter((r) => (r.volume24h ?? 0) > 0)
        .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
        .slice(0, 10)
        .map((r) => ({ name: r.tokenSymbol, vol: r.volume24h ?? 0, prem: stripVal(r) })),
    [priced]
  );

  // Issuer donut: top-5 issuers by mcap + Other.
  const donut = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of priced) {
      if (r.marketCap == null) continue;
      by.set(r.issuerName, (by.get(r.issuerName) ?? 0) + r.marketCap);
    }
    const sorted = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5).map(([name, value]) => ({ name, value }));
    const rest = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) top.push({ name: "Other", value: rest });
    return { slices: top, issuers: by.size };
  }, [priced]);

  const feed = useMemo(() => {
    const all = data?.rows ?? [];
    return {
      open: all.filter((r) => r.underlyingTicker && r.marketOpen).length,
      closed: all.filter((r) => r.underlyingTicker && !r.marketOpen).length,
      none: all.filter((r) => !r.underlyingTicker).length,
    };
  }, [data]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === "tokenSymbol" ? 1 : -1);
    }
  };

  const chip = "flex items-center gap-1.5 rounded-full border border-[#1e2b25] bg-[#0d1411] px-3 py-1.5 font-mono text-xs";
  const tabBtn = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-[11px] ${active ? "bg-[#24352c] text-lime-200" : "text-zinc-500 hover:text-zinc-200"}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className={chip}>
            <span className="h-1.5 w-1.5 rounded-full bg-lime-300" />${fmtCompact(totals.mcap)}{" "}
            <span className="text-zinc-500">value</span>
          </span>
          <span className={chip}>
            <span className={medianPrem != null && medianPrem >= 0 ? "text-lime-300" : "text-red-400"}>
              {medianPrem != null && medianPrem >= 0 ? "↑" : "↓"} {fmtPct(medianPrem)}
            </span>{" "}
            <span className="text-zinc-500">median</span>
          </span>
          <span className={chip}>
            <span className="text-lime-300">⚑ {dislocations.length}</span>{" "}
            <span className="text-zinc-500">dislocations</span>
          </span>
          <a href="#radar-table" className={`${chip} text-zinc-300 hover:border-lime-400/50`}>
            All {counts.total} tokens <span className="text-lime-300">›</span>
          </a>
        </div>
      </div>
      <p className="-mt-2 text-[13px] text-zinc-400">
        Tokenised real-world assets — live premiums vs the CMC aggregate and the real underlying.
        {data && (
          <span className="text-zinc-500">
            {" "}
            · Updated {new Date(data.generatedAt).toLocaleTimeString()} · underlying: {data.underlyingSource} ·{" "}
            <Link href="/evidence" className="underline hover:text-lime-200">
              API details
            </Link>
          </span>
        )}
      </p>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        <SkeletonTable />
      ) : (
        <>
          {/* Top row: premium history + best price */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className={`${CARD} p-4 lg:col-span-2`}>
              <div className="flex flex-wrap items-center gap-2">
                <div>
                  <div className="text-[11px] text-zinc-500">Premium history (session snapshots)</div>
                  <div className="font-mono text-2xl font-bold">
                    {medianPrem != null ? fmtPct(medianPrem) : "—"}{" "}
                    <span className="font-sans text-xs font-normal text-zinc-500">median vs {metric === "und" ? "underlying" : "CMC avg"}</span>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-1 rounded-lg bg-[#090f0c] p-1">
                  <button className={tabBtn(metric === "und")} onClick={() => setMetric("und")}>
                    Underlying
                  </button>
                  <button className={tabBtn(metric === "agg")} onClick={() => setMetric("agg")}>
                    CMC avg
                  </button>
                </div>
              </div>
              <div className="mt-2 h-[260px]">
                {areaRows.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                    Collecting first snapshot… (one point per 60s poll)
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={areaRows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="t" tick={{ fill: "#5b6660", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40} />
                      <YAxis tick={{ fill: "#5b6660", fontSize: 10 }} tickLine={false} axisLine={false} unit="%" width={56} />
                      <Tooltip contentStyle={CHART_TIP} />
                      {seriesTokens.map((r, i) => (
                        <Area
                          key={r.tokenSymbol}
                          type="monotone"
                          dataKey={r.tokenSymbol}
                          stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                          strokeWidth={2}
                          fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                          fillOpacity={0.08}
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-zinc-500">
                {seriesTokens.map((r, i) => (
                  <span key={r.tokenSymbol} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                    {r.tokenSymbol}
                  </span>
                ))}
              </div>
            </section>

            {/* Best-price card (comparison only — not a trade ticket) */}
            <section className="rounded-2xl bg-gradient-to-b from-[#8df0c0] to-[#3ce882] p-4 text-[#06281c]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Best Price</h2>
                <span className="text-lg">⋮</span>
              </div>
              {bestPrice ? (
                <>
                  <div className="mt-2 rounded-xl bg-white/25 p-3">
                    <div className="flex justify-between text-[11px] font-medium opacity-70">
                      <span>Cheapest · {bestPrice.lo.tokenSymbol}</span>
                      <span>{bestPrice.lo.issuerName}</span>
                    </div>
                    <div className="font-mono text-2xl font-bold">{fmtUsd(bestPrice.lo.price)}</div>
                  </div>
                  <div className="relative mt-2 rounded-xl bg-[#06281c]/90 p-3 text-white">
                    <div className="flex justify-between text-[11px] font-medium text-zinc-300">
                      <span>Priciest · {bestPrice.hi.tokenSymbol}</span>
                      <span>Bal. {bestPrice.hi.issuerName}</span>
                    </div>
                    <div className="font-mono text-xl font-bold">{fmtUsd(bestPrice.hi.price)}</div>
                    <div className="absolute -top-4 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border-2 border-[#3ce882] bg-[#06281c] text-xs">
                      ⇄
                    </div>
                  </div>
                  <div className="mt-3 flex justify-between text-xs font-medium">
                    <span className="opacity-70">ⓘ Cross-issuer spread</span>
                    <span className="font-mono">{bestPrice.spread != null ? fmtPct(bestPrice.spread) : "—"}</span>
                  </div>
                  <Link
                    href={`/assets/${bestPrice.asset}`}
                    className="mt-3 block rounded-xl bg-[#06281c] py-2.5 text-center text-sm font-semibold text-white hover:bg-black"
                  >
                    View {bestPrice.asset} issuers
                  </Link>
                </>
              ) : (
                <p className="mt-4 text-sm opacity-80">
                  No multi-issuer gap right now — the cheapest and priciest quotes agree.
                </p>
              )}
            </section>
          </div>

          {/* Bottom row: volume bars + issuer donut */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <section className={`${CARD} p-4 lg:col-span-3`}>
              <h2 className="text-sm font-semibold">Top Volume</h2>
              <p className="text-[11px] text-zinc-500">24h volume by token · live snapshot</p>
              <div className="mt-2 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volBars} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#d4d4d8", fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
                    <YAxis tick={{ fill: "#5b6660", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${fmtCompact(v)}`} width={64} />
                    <Tooltip
                      contentStyle={CHART_TIP}
                      formatter={(v, _n, item) => {
                        const prem = (item?.payload as { prem?: number | null } | undefined)?.prem;
                        return [`$${fmtCompact(v as number)} · ${fmtPct(prem ?? null)}`, "vol · prem"];
                      }}
                    />
                    <Bar dataKey="vol" radius={[6, 6, 2, 2]}>
                      {volBars.map((_, i) => (
                        <Cell key={i} fill={i % 2 ? "#7ddf9e" : "#b8f53d"} fillOpacity={i % 2 ? 0.75 : 0.95} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className={`${CARD} p-4 lg:col-span-2`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Issuer Mix</h2>
                <span className="text-[11px] text-zinc-500">by tokenised value ⓘ</span>
              </div>
              <div className="relative mx-auto mt-1 h-[190px] w-full max-w-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donut.slices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="72%"
                      outerRadius="95%"
                      paddingAngle={3}
                      strokeWidth={0}
                      isAnimationActive={false}
                    >
                      {donut.slices.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TIP} formatter={(v) => [`$${fmtCompact(v as number)}`, "value"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="font-mono text-2xl font-bold">${fmtCompact(totals.mcap)}</div>
                  <div className="text-[11px] text-zinc-500">Of {donut.issuers} issuers</div>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                {donut.slices.slice(0, 5).map((s, i) => (
                  <div key={s.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-zinc-400">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      {s.name}
                    </span>
                    <span className="font-mono">${fmtCompact(s.value)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Dislocations */}
          <section className={`${CARD} p-4`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Biggest Dislocations</h2>
              <span className="text-[11px] text-zinc-500">
                {feed.open} open · {feed.closed} vs last close · {feed.none} no reference
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {dislocations.slice(0, 6).map((r) => (
                <Link
                  key={r.tokenSymbol + r.issuerId}
                  href={`/assets/${r.assetSymbol}`}
                  className="rounded-lg border border-[#24352c] bg-[#090f0c] px-2.5 py-1.5 text-xs hover:border-lime-400/50"
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

          {/* Filters */}
          <div id="radar-table" className="flex scroll-mt-20 flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search asset, token, issuer…"
              className="w-64 rounded-xl border border-[#1e2b25] bg-[#0d1411] px-3 py-1.5 text-sm outline-none placeholder:text-zinc-500 focus:border-lime-400/60"
            />
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              className="rounded-xl border border-[#1e2b25] bg-[#0d1411] px-3 py-1.5 text-sm"
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t === "all" ? "All types" : t}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 rounded-xl border border-[#1e2b25] px-2.5 py-1.5 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={showDerivatives}
                onChange={(e) => setShowDerivatives(e.target.checked)}
              />
              Show perps ({counts.derivatives})
            </label>
            <label className="flex items-center gap-1.5 rounded-xl border border-[#1e2b25] px-2.5 py-1.5 text-xs text-zinc-300">
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
                <thead className="bg-[#090f0c]">
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
                        <Link href={`/assets/${r.assetSymbol}`} className="font-medium hover:text-lime-200">
                          {r.assetSymbol}
                        </Link>
                        <div className="text-[11px] text-zinc-500">
                          {r.assetName} · {r.assetType}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          <Avatar symbol={r.tokenSymbol} />
                          <span className="font-mono">{r.tokenSymbol}</span>
                        </span>
                        {r.isDerivative && (
                          <span className="ml-1 rounded bg-zinc-800 px-1 text-[10px] text-zinc-400">perp</span>
                        )}
                        {r.flag === "check-data" && <CheckBadge />}
                        <div className="text-[11px] text-zinc-500">{r.tokenName}</div>
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        <Link href={`/issuers/${r.issuerId}`} className="hover:text-lime-200">
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
            units, share-ratio or stale-data issue, not an arbitrage gap. History charts track premium
            snapshots in your browser (60s polls, last {HIST_MAX} points). The Best Price card compares
            issuer quotes — it is not a trade ticket. Perps and rows without a price are hidden by default.
          </p>
        </>
      )}
    </div>
  );
}
