"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { RadarResult, RadarRow } from "@/lib/radar";
import { ErrorBanner, SkeletonTable, fmtCompact, fmtPct, fmtUsd, premiumClass } from "./components/bits";

type SortKey = "marketCap" | "price" | "premiumAgg" | "premiumUnder" | "volume24h" | "tokenSymbol";

const numOr = (v: number | null, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

// Strip signal: underlying premium preferred, aggregate fallback.
const stripVal = (r: RadarRow) => r.premiumUnder ?? r.premiumAgg;

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

  // Strip: true dislocations only (liquid, non-derivative, |p| in 1–25%).
  const dislocations = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((r) => r.flag === "dislocation" && r.price != null)
        .sort((a, b) => Math.abs(numOr(stripVal(b), 0)) - Math.abs(numOr(stripVal(a), 0)))
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
            Biggest dislocations (liquid, non-perp, 1–25%)
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
                <span className={premiumClass(r.premiumAgg)}>avg {fmtPct(r.premiumAgg)}</span>{" "}
                {r.underlyingTicker && (
                  <span className={premiumClass(r.premiumUnder)}>und {fmtPct(r.premiumUnder)}</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
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
        <label className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={showDerivatives}
            onChange={(e) => setShowDerivatives(e.target.checked)}
          />
          Show perps ({counts.derivatives})
        </label>
        <label className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300">
          <input type="checkbox" checked={showNoPrice} onChange={(e) => setShowNoPrice(e.target.checked)} />
          Show no-price rows ({counts.noPrice})
        </label>
        {!loading && !error && (
          <span className="self-center text-xs text-zinc-500">
            {rows.length} of {counts.total} tokens
          </span>
        )}
      </div>

      {loading ? (
        <SkeletonTable />
      ) : error ? null : rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-8 text-center text-sm text-zinc-400">
          No tokens match. Try clearing the search or toggling the filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-zinc-900">
              <tr>
                <Th label="Asset" />
                <Th label="Token" k="tokenSymbol" />
                <Th label="Issuer" />
                <Th label="Price" k="price" className="text-right" />
                <Th label="vs CMC avg" k="premiumAgg" className="text-right" />
                <Th label="vs underlying" k="premiumUnder" className="text-right" />
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
        units, share-ratio or stale-data issue, not an arbitrage gap. Perps and rows without a price
        are hidden by default; the strip shows dislocations only.
      </p>
    </div>
  );
}
