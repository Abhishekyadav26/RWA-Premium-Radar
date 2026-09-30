"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { RadarResult, RadarRow } from "@/lib/radar";
import { ErrorBanner, SkeletonTable, fmtCompact, fmtPct, fmtUsd, isFlagged, premiumClass } from "./components/bits";

type SortKey = "marketCap" | "price" | "premiumAgg" | "premiumUnder" | "volume24h" | "tokenSymbol";

const numOr = (v: number | null, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

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

export default function RadarPage() {
  const [data, setData] = useState<RadarResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [assetType, setAssetType] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

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
    load();
  }, []);

  const types = useMemo(
    () => ["all", ...new Set((data?.rows ?? []).map((r) => r.assetType))],
    [data]
  );

  const rows = useMemo(() => {
    let r = data?.rows ?? [];
    if (assetType !== "all") r = r.filter((x) => x.assetType === assetType);
    const q = query.trim().toLowerCase();
    if (q)
      r = r.filter((x) =>
        `${x.assetSymbol} ${x.assetName} ${x.tokenSymbol} ${x.tokenName} ${x.issuerName}`
          .toLowerCase()
          .includes(q)
      );
    return [...r].sort((a, b) => {
      if (sortKey === "tokenSymbol")
        return a.tokenSymbol.localeCompare(b.tokenSymbol) * sortDir;
      const av = numOr(a[sortKey] as number | null, 0);
      const bv = numOr(b[sortKey] as number | null, 0);
      // nulls always last
      if (a[sortKey] == null && b[sortKey] == null) return 0;
      if (a[sortKey] == null) return 1;
      if (b[sortKey] == null) return -1;
      return (av - bv) * sortDir;
    });
  }, [data, query, assetType, sortKey, sortDir]);

  const dislocations = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((r) => r.price != null && (isFlagged(r.premiumAgg) || isFlagged(r.premiumUnder)))
        .sort(
          (a, b) =>
            Math.max(numOr(b.premiumAgg, 0), numOr(b.premiumUnder, 0)) -
            Math.max(numOr(a.premiumAgg, 0), numOr(a.premiumUnder, 0))
        )
        .sort(
          (a, b) =>
            Math.max(Math.abs(numOr(b.premiumAgg, 0)), Math.abs(numOr(b.premiumUnder, 0))) -
            Math.max(Math.abs(numOr(a.premiumAgg, 0)), Math.abs(numOr(a.premiumUnder, 0)))
        )
        .slice(0, 6),
    [data]
  );

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === "tokenSymbol" ? 1 : -1);
    }
  };

  const Th = ({ label, k, className = "" }: { label: string; k?: SortKey; className?: string }) => (
    <th
      onClick={k ? () => toggleSort(k) : undefined}
      className={`px-3 py-2 text-left text-[11px] uppercase tracking-wide text-zinc-400 ${
        k ? "cursor-pointer select-none hover:text-white" : ""
      } ${className}`}
    >
      {label}
      {k === sortKey && (sortDir === 1 ? " ▲" : " ▼")}
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tokenised Asset Premiums</h1>
          <p className="text-sm text-zinc-400">
            Is each token trading rich or cheap — vs the CMC aggregate and vs the real underlying?
            {data && (
              <span className="text-zinc-500">
                {" "}
                · Updated {new Date(data.generatedAt).toLocaleTimeString()} · underlying: {data.underlyingSource}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          className="ml-auto rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* Biggest dislocations */}
      {!loading && !error && dislocations.length > 0 && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
            Biggest dislocations (|premium| &gt; 1%)
          </h2>
          <div className="flex flex-wrap gap-2">
            {dislocations.map((r) => (
              <Link
                key={r.tokenSymbol + r.issuerId}
                href={`/assets/${r.assetSymbol}`}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs hover:border-zinc-500"
              >
                <span className="font-semibold">{r.tokenSymbol}</span>{" "}
                <span className="text-zinc-400">({r.issuerName})</span>{" "}
                <span className={premiumClass(r.premiumAgg)}>agg {fmtPct(r.premiumAgg)}</span>{" "}
                {r.underlyingTicker && (
                  <span className={premiumClass(r.premiumUnder)}>und {fmtPct(r.premiumUnder)}</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search asset, token, issuer…"
          className="w-64 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-600"
        />
        <select
          value={assetType}
          onChange={(e) => setAssetType(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
        >
          {types.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All types" : t}
            </option>
          ))}
        </select>
        {!loading && !error && (
          <span className="self-center text-xs text-zinc-500">{rows.length} tokens</span>
        )}
      </div>

      {loading ? (
        <SkeletonTable />
      ) : error ? null : rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-8 text-center text-sm text-zinc-400">
          No tokens match. Try clearing the search or type filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-zinc-900">
              <tr>
                <Th label="Asset" />
                <Th label="Token" k="tokenSymbol" />
                <Th label="Issuer" />
                <Th label="Price" k="price" className="text-right" />
                <Th label="Prem vs agg" k="premiumAgg" className="text-right" />
                <Th label="Prem vs underlying" k="premiumUnder" className="text-right" />
                <Th label="Market state" />
                <Th label="Mcap" k="marketCap" className="text-right" />
                <Th label="Vol 24h" k="volume24h" className="text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tokenSymbol + r.issuerId} className="border-t border-zinc-800/60 hover:bg-zinc-900/60">
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
                    {isFlagged(r.premiumAgg) && <span title=">1% dislocation"> ⚑</span>}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${premiumClass(r.premiumUnder)}`}>
                    {r.underlyingTicker ? (
                      <>
                        {fmtPct(r.premiumUnder)}
                        {isFlagged(r.premiumUnder) && <span title=">1% dislocation"> ⚑</span>}
                        <div className="text-[10px] font-sans text-zinc-500">
                          {r.underlyingTicker} {fmtUsd(r.underlyingPrice)}
                          {r.underlyingLabel ? ` · ${r.underlyingLabel}` : ""}
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
        Premium vs aggregate = token price ÷ CMC average_tokenized_price − 1. Premium vs underlying =
        token price ÷ (underlying × units-per-token) − 1. ⚑ flags |premium| &gt; 1%. “Requires Growth
        plan” note: exchange-level market pairs are unavailable on the Startup tier, so spreads are
        computed across issuers instead.
      </p>
    </div>
  );
}
