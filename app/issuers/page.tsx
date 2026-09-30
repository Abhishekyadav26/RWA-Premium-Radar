"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorBanner, SkeletonTable, fmtCompact } from "../components/bits";

interface Issuer {
  issuer_id: string;
  name: string;
  website?: string;
  num_tokens: number;
}

export default function IssuersPage() {
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [credit, setCredit] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/issuers");
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Failed to load");
        setIssuers(j.issuers ?? []);
        setCredit(j.creditCount ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const chartData = [...issuers]
    .sort((a, b) => b.num_tokens - a.num_tokens)
    .slice(0, 12)
    .map((i) => ({ name: i.name, tokens: i.num_tokens }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Issuers</h1>
        <p className="text-sm text-zinc-400">
          Who issues the most tokenised assets? Click through for each issuer&apos;s tokens, live
          prices and premiums.
          {credit != null && <span className="text-zinc-500"> · issuers/list cost {credit} credit (flat)</span>}
        </p>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <SkeletonTable />
      ) : issuers.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-8 text-center text-sm text-zinc-400">
          No issuers returned.
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
              Tokens per issuer (top 12)
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 90, right: 16 }}>
                  <XAxis type="number" tick={{ fill: "#a1a1aa", fontSize: 11 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#e4e4e7", fontSize: 11 }}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
                  />
                  <Bar dataKey="tokens" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {issuers.map((i) => (
              <Link
                key={i.issuer_id}
                href={`/issuers/${i.issuer_id}`}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 hover:border-emerald-700"
              >
                <div className="font-semibold">{i.name}</div>
                <div className="mt-1 text-sm text-zinc-400">
                  {i.num_tokens} token{i.num_tokens === 1 ? "" : "s"}
                </div>
                {i.website && (
                  <div className="mt-1 truncate text-[11px] text-zinc-500">{i.website}</div>
                )}
              </Link>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500">
            Showing {issuers.length} issuers ({fmtCompact(issuers.length)} total). Source: GET
            /v5/real-world-assets/issuers/list.
          </p>
        </>
      )}
    </div>
  );
}
