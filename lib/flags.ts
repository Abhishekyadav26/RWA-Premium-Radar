// Signal-quality flags. A real arbitrage gap is rarely above 10-20% — anything
// above ~25% is almost certainly a unit/ratio/stale-data issue, so it gets a
// "check-data" badge instead of a red dislocation flag, and stays out of the
// top strip. Derivatives (perps, not redeemable) and illiquid rows never flag.

export type Flag = "dislocation" | "check-data" | "none";

// Liquidity floor for flagging (Hyperliquid-style $6k-mcap rows stay unflagged).
export const MIN_MCAP = 50_000;
export const MIN_VOL_24H = 25_000;
export const DISLOCATION_PCT = 1;
export const CHECK_DATA_PCT = 25;

export function flagFor(t: {
  premUnd: number | null;
  premAgg: number | null;
  marketCap: number | null;
  volume: number | null;
  isDerivative: boolean;
}): Flag {
  if (t.isDerivative) return "none";
  const liquid = (t.marketCap ?? 0) >= MIN_MCAP || (t.volume ?? 0) >= MIN_VOL_24H;
  if (!liquid) return "none";
  // Prefer the real underlying; fall back to the aggregate only when no reference exists.
  const p = t.premUnd ?? t.premAgg;
  if (p == null || !Number.isFinite(p)) return "none";
  if (Math.abs(p) > CHECK_DATA_PCT) return "check-data";
  if (Math.abs(p) > DISLOCATION_PCT) return "dislocation";
  return "none";
}

export function isDerivativeToken(issuerName: string, tokenName: string): boolean {
  return /deriv/i.test(issuerName) || /\(Derivative/.test(tokenName);
}
