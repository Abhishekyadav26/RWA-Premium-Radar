"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RadarRow } from "@/lib/radar";
import { ErrorBanner, SkeletonTable, fmtPct, fmtUsd, premiumClass } from "../../components/bits";

interface SnapPoint {
  at: number;
  token: string;
  premiumAgg: number | null;
  premiumUnder: number | null;
}

const MAX_POINTS = 200;

export default function AssetPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const asset = decodeURIComponent(symbol).toUpperCase();
  const [rows, setRows] = useState<RadarRow[]>([]);
  const [meta, setMeta] = useState<{ name: string; assetType: string; avgPrice: number | null; spread: number | null } | null>(null);
  const [series, setSeries] = useState<SnapPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = `rwa-history-${asset}`;
  const seeded = useRef(false);

  // Load persisted series once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setSeries(JSON.parse(raw).slice(-MAX_POINTS));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const [snap, rr] = await Promise.all([
          fetch("/api/snapshot").then((r) => r.json()),
          fetch("/api/rwa").then((r) => r.json()),
        ]);
        if (!snap.at) throw new Error(snap.error || "snapshot failed");
        if (stop) return;
        const at = Date.parse(snap.at) || Date.now();
        const mine: RadarRow[] = ((rr.rows as RadarRow[]) ?? []).filter((r) => r.assetSymbol === asset);
        const pts: SnapPoint[] = (
          snap.points as Array<{ asset: string; token: string; premiumAgg: number | null; premiumUnder: number | null }>
        )
          .filter((p) => p.asset === asset)
          .map((p) => ({ at, token: p.token, premiumAgg: p.premiumAgg, premiumUnder: p.premiumUnder }));
        setSeries((prev) => {
          // Seed instantly from the current CMC rows so the graph is visible on first
          // load instead of waiting for a snapshot tick.
          let base = prev;
          if (base.length === 0 && pts.length === 0 && mine.length > 0) {
            base = mine.map((r) => ({
              at,
              token: r.tokenSymbol,
              premiumAgg: r.premiumAgg,
              premiumUnder: r.premiumUnder,
            }));
          } else {
            base = [...prev, ...pts];
          }
          const next = base.slice(-MAX_POINTS);
          try {
            localStorage.setItem(key, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
        setRows(mine);
        if (mine.length) {
          const prices = mine.map((r) => r.price);
          const valid = prices.filter((p): p is number => typeof p === "number");
          const spread =
            valid.length >= 2
              ? ((Math.max(...valid) - Math.min(...valid)) / Math.min(...valid)) * 100
              : null;
          setMeta({
            name: mine[0].assetName,
            assetType: mine[0].assetType,
            avgPrice: mine[0].avgTokenizedPrice,
            spread,
          });
        }
        setError(null);
      } catch (e) {
        if (!seeded.current) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        seeded.current = true;
        setLoading(false);
      }
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset]);

  // Pivot series into chart rows: {t, TOKEN_A: x, ...}
  // Prefer premium-vs-underlying; if the underlying feed is down (all null),
  // fall back to premium-vs-aggregate (pure CMC data) so the graph still renders.
  const tokens = [...new Set(series.map((s) => s.token))];
  const useUnderlying = series.some((s) => typeof s.premiumUnder === "number");
  const metric: "premiumUnder" | "premiumAgg" = useUnderlying ? "premiumUnder" : "premiumAgg";
  const chartRows = (() => {
    const byAt = new Map<number, Record<string, number | string | null>>();
    for (const s of series) {
      const v = s[metric];
      if (typeof v !== "number") continue;
      if (!byAt.has(s.at)) byAt.set(s.at, { t: new Date(s.at).toLocaleTimeString() });
      byAt.get(s.at)![s.token] = Number(v.toFixed(3));
    }
    return [...byAt.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  })();

  const colors = ["#10b981", "#f59e0b", "#60a5fa", "#f472b6", "#a78bfa", "#34d399", "#fb7185", "#facc15"];

  return (
    <div className="space-y-5">
      <Link href="/radar" className="text-sm text-zinc-400 hover:text-white">
        ← Radar
      </Link>
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <SkeletonTable />
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {asset} {meta && <span className="text-zinc-400 text-lg">· {meta.name}</span>}
            </h1>
            <p className="text-sm text-zinc-400">
              {meta?.assetType} · CMC aggregate {fmtUsd(meta?.avgPrice ?? null)}
              {meta?.spread != null && (
                <> · issuer spread <span className="font-mono">{fmtPct(meta.spread)}</span></>
              )}
            </p>
          </div>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-1 text-xs uppercase tracking-wide text-zinc-400">
              {useUnderlying
                ? "Premium vs underlying — since you opened the dashboard"
                : "Premium vs aggregate — since you opened the dashboard (underlying feed unavailable)"}
            </h2>
            <p className="mb-2 text-[11px] text-zinc-500">
              CMC has no historical RWA endpoint, so history is built from 60s snapshots in your
              browser (kept: last {MAX_POINTS} points). A point appears after the first poll.
            </p>
            {series.length === 0 ? (
              <div className="py-8 text-center text-sm text-zinc-500">Collecting first snapshot…</div>
            ) : chartRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-zinc-500">
                No priced points yet for this asset.
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows}>
                    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                    <XAxis dataKey="t" tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#a1a1aa", fontSize: 10 }} unit="%" />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
                    />
                    <Legend />
                    {tokens.map((t, i) => (
                      <Line
                        key={t}
                        type="monotone"
                        dataKey={t}
                        stroke={colors[i % colors.length]}
                        dot={false}
                        strokeWidth={2}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-zinc-900">
                <tr>
                  {["Token", "Issuer", "Price", "Prem vs agg", "Prem vs und", "Mcap"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-zinc-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tokenSymbol + r.issuerId} className="border-t border-zinc-800/60">
                    <td className="px-3 py-2 font-mono">{r.tokenSymbol}</td>
                    <td className="px-3 py-2 text-zinc-300">{r.issuerName}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUsd(r.price)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${premiumClass(r.premiumAgg)}`}>
                      {fmtPct(r.premiumAgg)}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${premiumClass(r.premiumUnder)}`}>
                      {r.underlyingTicker ? fmtPct(r.premiumUnder) : "no reference"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-300">
                      {r.marketCap ? "$" + r.marketCap.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
