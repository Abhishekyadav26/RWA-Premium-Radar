"use client";

import { useEffect, useState } from "react";
import type { RadarResult } from "@/lib/radar";
import { fmtCompact } from "./bits";

// Live stats band for the landing page. Same /api/rwa payload as the radar — no new calls.
export function LandingStats() {
  const [stats, setStats] = useState<{ mcap: string; tokens: string; dislocations: string } | null>(null);

  useEffect(() => {
    let stop = false;
    fetch("/api/rwa")
      .then((r) => r.json())
      .then((j: RadarResult) => {
        if (stop || !Array.isArray(j.rows)) return;
        const mcap = (j.assets ?? []).reduce((s, a) => s + (a.marketCap ?? 0), 0);
        const dis = j.rows.filter((r) => r.flag === "dislocation").length;
        setStats({ mcap: `$${fmtCompact(mcap)}`, tokens: String(j.rows.length), dislocations: String(dis) });
      })
      .catch(() => {
        /* landing stays static if offline */
      });
    return () => {
      stop = true;
    };
  }, []);

  const items = [
    { label: "Tokenised value tracked", value: stats?.mcap ?? "—" },
    { label: "Tokens across issuers", value: stats?.tokens ?? "—" },
    { label: "Live dislocations (1–25%)", value: stats?.dislocations ?? "—" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="rounded-2xl border border-[#1e2b25] bg-[#0d1411] p-5">
          <div className="font-mono text-3xl font-bold text-lime-200">{it.value}</div>
          <div className="mt-1 text-xs text-zinc-400">{it.label}</div>
        </div>
      ))}
    </div>
  );
}
