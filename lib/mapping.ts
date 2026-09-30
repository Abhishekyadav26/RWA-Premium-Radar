// Whitelist mapping: which on-chain tokens can be compared against a real
// underlying market price, and how many units of underlying each token represents.
// Units default to 1 (1 token = 1 share / 1 oz). Assets/tokens NOT listed here
// render as "no reference price" — never a fake number.

export interface UnderlyingRef {
  ticker: string; // Yahoo/Stooq ticker for the underlying
  unitsPerToken: number; // underlying units per 1 token
  label: string; // human label, e.g. "1 oz gold", "1 share"
}

// Per-TOKEN overrides (needed where tokens of the same asset differ in size,
// e.g. PAXG = 1 oz of gold but CGO = 1 gram).
export const TOKEN_MAP: Record<string, UnderlyingRef> = {
  PAXG: { ticker: "GC=F", unitsPerToken: 1, label: "1 oz gold" },
  XAUt: { ticker: "GC=F", unitsPerToken: 1, label: "1 oz gold" },
  XAUM: { ticker: "GC=F", unitsPerToken: 1, label: "1 oz gold" },
  CGO: { ticker: "GC=F", unitsPerToken: 1 / 31.1035, label: "1 g gold" },
  VNXAU: { ticker: "GC=F", unitsPerToken: 1 / 31.1035, label: "1 g gold" },
  KAU: { ticker: "GC=F", unitsPerToken: 1 / 31.1035, label: "1 g gold" },
};

// Per-ASSET fallback: asset symbol -> underlying ticker (units = 1 share/unit).
// Covers GOLD + top stocks by tokenised market cap.
export const ASSET_MAP: Record<string, { ticker: string; label: string }> = {
  GOLD: { ticker: "GC=F", label: "gold spot (1 oz)" },
  NVDA: { ticker: "NVDA", label: "NVDA share" },
  AAPL: { ticker: "AAPL", label: "AAPL share" },
  TSLA: { ticker: "TSLA", label: "TSLA share" },
  MSFT: { ticker: "MSFT", label: "MSFT share" },
  AMZN: { ticker: "AMZN", label: "AMZN share" },
  GOOGL: { ticker: "GOOGL", label: "GOOGL share" },
  META: { ticker: "META", label: "META share" },
  AMD: { ticker: "AMD", label: "AMD share" },
  NFLX: { ticker: "NFLX", label: "NFLX share" },
  MSTR: { ticker: "MSTR", label: "MSTR share" },
  COIN: { ticker: "COIN", label: "COIN share" },
  SPY: { ticker: "SPY", label: "SPY share" },
  QQQ: { ticker: "QQQ", label: "QQQ share" },
};

export function underlyingRefFor(assetSymbol: string, tokenSymbol: string): UnderlyingRef | null {
  const tokenHit = TOKEN_MAP[tokenSymbol];
  if (tokenHit) return tokenHit;
  const assetHit = ASSET_MAP[assetSymbol];
  if (assetHit) return { ticker: assetHit.ticker, unitsPerToken: 1, label: assetHit.label };
  return null;
}
