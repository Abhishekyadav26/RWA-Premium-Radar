"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

// Tiny sparkline fed by real 60s snapshot history (premium %). Flat placeholder until 2+ points.
export function Spark({ data, positive }: { data: number[]; positive: boolean }) {
  const gid = useId();
  const color = positive ? "#34d399" : "#fb7185";
  if (data.length < 2) {
    return (
      <div className="flex h-12 w-28 items-center justify-center text-[10px] text-zinc-600">
        collecting…
      </div>
    );
  }
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-12 w-28 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pts} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["auto", "auto"]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gid})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Semicircle gauge (Fear-&-Greed look, but driven by median RWA premium).
export function Gauge({ score }: { score: number }) {
  const s = Math.max(2, Math.min(98, score));
  const R = 80;
  const LEN = Math.PI * R;
  const theta = ((180 - (s / 100) * 180) * Math.PI) / 180;
  const dx = 100 + R * Math.cos(theta);
  const dy = 100 - R * Math.sin(theta);
  return (
    <div className="relative mx-auto w-52">
      <svg viewBox="0 0 200 112" className="w-full">
        <defs>
          <linearGradient id="rwa-gauge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="35%" stopColor="#f59e0b" />
            <stop offset="60%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <path
          d="M20,100 A80,80 0 0 1 180,100"
          fill="none"
          stroke="#26314b"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M20,100 A80,80 0 0 1 180,100"
          fill="none"
          stroke="url(#rwa-gauge)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${(s / 100) * LEN} ${LEN}`}
        />
        <circle cx={dx} cy={dy} r="7" fill="#e4e4e7" stroke="#0b1120" strokeWidth="3" />
      </svg>
      <div className="-mt-12 text-center">
        <div className="text-3xl font-bold">{Math.round(s)}</div>
      </div>
    </div>
  );
}

// Gradient slider with a marker dot (Altcoin-Season look).
export function Slider({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative mt-3">
      <div className="h-2 rounded-full bg-gradient-to-r from-orange-500 via-zinc-500 to-blue-600" />
      <div
        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0b1120] bg-zinc-100"
        style={{ left: `${p}%` }}
      />
    </div>
  );
}

const AVATAR_COLORS = [
  "bg-amber-500/20 text-amber-300",
  "bg-sky-500/20 text-sky-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-violet-500/20 text-violet-300",
  "bg-rose-500/20 text-rose-300",
];

// Deterministic letter avatar (no external coin icons).
export function Avatar({ symbol }: { symbol: string }) {
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) % 997;
  const cls = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return (
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${cls}`}
    >
      {symbol.slice(0, 1).toUpperCase()}
    </span>
  );
}
