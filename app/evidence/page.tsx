"use client";

import { useEffect, useState } from "react";
import { ErrorBanner, SkeletonTable } from "../components/bits";

interface Call {
  endpoint: string;
  purpose: string;
  httpStatus: number;
  creditCount: number | null;
  fetchedAt: string;
  note?: string;
  response: string;
}

export default function EvidencePage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/evidence");
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Failed to load");
        setCalls(j.calls);
        setGeneratedAt(j.generatedAt);
        const init: Record<string, boolean> = {};
        for (const c of j.calls as Call[]) init[c.endpoint] = true;
        setOpen(init);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Evidence</h1>
        <p className="text-sm text-zinc-400">
          One live call per endpoint, captured {generatedAt && `at ${new Date(generatedAt).toLocaleString()}`},
          with credit_count straight from CMC&apos;s status block. API key stays server-side and is
          never shown.
        </p>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <div className="space-y-3">
          {calls.map((c) => (
            <section key={c.endpoint} className="rounded-lg border border-zinc-800 bg-zinc-900/60">
              <button
                onClick={() => setOpen((o) => ({ ...o, [c.endpoint]: !o[c.endpoint] }))}
                className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
              >
                <code className="text-xs text-emerald-300">{c.endpoint}</code>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] ${
                    c.httpStatus === 200 ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"
                  }`}
                >
                  HTTP {c.httpStatus}
                </span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300">
                  {c.creditCount == null ? "credits n/a" : `${c.creditCount} credit${c.creditCount === 1 ? "" : "s"}`}
                </span>
                <span className="text-[11px] text-zinc-500">{c.fetchedAt}</span>
                <span className="ml-auto text-zinc-500">{open[c.endpoint] ? "▾" : "▸"}</span>
              </button>
              <div className="px-4 pb-1 text-xs text-zinc-400">{c.purpose}</div>
              {c.note && <div className="px-4 pb-1 text-xs text-amber-300">{c.note}</div>}
              {open[c.endpoint] && (
                <pre className="mx-4 mb-4 overflow-x-auto rounded bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                  {c.response}
                </pre>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
