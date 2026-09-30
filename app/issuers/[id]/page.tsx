"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ErrorBanner, SkeletonTable, fmtPct, fmtUsd, premiumClass } from "../../components/bits";

interface TokenRow {
  symbol: string;
  name: string;
  crypto_id: number;
  rwa_id: number;
  assetSymbol: string | null;
  price: number | null;
  marketCap: number | null;
  premiumAgg: number | null;
  premiumUnder: number | null;
}

export default function IssuerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<{
    issuer: { name: string; website?: string; num_tokens: number };
    tokens: TokenRow[];
    totalValue: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/issuers/${id}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Failed to load");
        setData(j);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <div className="space-y-5">
      <Link href="/issuers" className="text-sm text-zinc-400 hover:text-white">
        ← All issuers
      </Link>
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <SkeletonTable />
      ) : !data ? null : (
        <>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{data.issuer.name}</h1>
            <p className="text-sm text-zinc-400">
              {data.tokens.length} linked token(s) · total tokenised value{" "}
              <span className="font-mono text-zinc-200">{fmtUsd(data.totalValue, 0)}</span>
              {data.issuer.website && (
                <>
                  {" · "}
                  <a href={data.issuer.website} target="_blank" rel="noreferrer" className="underline">
                    {data.issuer.website}
                  </a>
                </>
              )}
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-zinc-900">
                <tr>
                  {["Token", "Asset", "Price", "Mcap", "Prem vs agg", "Prem vs und"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-zinc-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.tokens.map((t) => (
                  <tr key={t.crypto_id} className="border-t border-zinc-800/60 hover:bg-zinc-900/60">
                    <td className="px-3 py-2">
                      <span className="font-mono">{t.symbol}</span>
                      <div className="text-[11px] text-zinc-500">{t.name}</div>
                    </td>
                    <td className="px-3 py-2">
                      {t.assetSymbol ? (
                        <Link href={`/assets/${t.assetSymbol}`} className="hover:text-emerald-300">
                          {t.assetSymbol}
                        </Link>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUsd(t.price)}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-300">
                      {t.marketCap ? "$" + t.marketCap.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${premiumClass(t.premiumAgg)}`}>
                      {fmtPct(t.premiumAgg)}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${premiumClass(t.premiumUnder)}`}>
                      {fmtPct(t.premiumUnder)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-zinc-500">
            Linked tokens from GET /v5/real-world-assets/issuers?issuer_id=…, joined with live prices
            from quotes/latest. “—” means the quote had no price (e.g. unlisted token).
          </p>
        </>
      )}
    </div>
  );
}
