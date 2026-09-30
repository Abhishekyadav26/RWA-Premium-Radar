export function fmtUsd(v: number | null | undefined, digits = 2): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtCompact(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
}

export function fmtPct(v: number | null | undefined, digits = 2): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

// Green = trading rich (premium), red = cheap (discount). Flag |premium| > 1%.
export function premiumClass(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "text-zinc-500";
  if (Math.abs(v) <= 1) return "text-zinc-300";
  return v > 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold";
}

export function isFlagged(v: number | null | undefined): boolean {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) > 1;
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
      {message}{" "}
      {onRetry && (
        <button onClick={onRetry} className="ml-2 underline hover:text-white">
          Retry
        </button>
      )}
    </div>
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 rounded bg-zinc-800/60" />
      ))}
    </div>
  );
}
