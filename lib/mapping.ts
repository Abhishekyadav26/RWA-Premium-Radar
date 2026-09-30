// Whitelist mapping: which on-chain tokens can be compared against a real
// underlying market price, and how many units of underlying each token represents.
// Units default to 1 (1 token = 1 share / 1 oz). Assets/tokens NOT listed here
// render as "no reference price" — never a fake number.
//
// Metals (GOLD/SILVER) resolve to TRUE SPOT via gold-api.com primary, with the
// Yahoo futures ticker (GC=F/SI=F) as fallback — futures trade above spot
// (contango), so GC=F must never be labeled "spot".

export const OZ_G = 31.1035;

export interface UnderlyingRef {
  ticker: string; // Yahoo ticker (fallback leg for metals, primary for equities)
  metal?: "XAU" | "XAG"; // when set, try gold-api spot first
  unitsPerToken: number; // underlying units per 1 token
  label: string; // "1 oz gold", "1 g silver", "NVDA share"
  unitSuffix: string; // "/g" for gram tokens (display "$134.56/g"), else ""
}

// Per-TOKEN overrides beat the asset-level default.
export const TOKEN_OVERRIDE: Record<string, { ticker?: string; units?: number }> = {
  CGO: { units: 1 / OZ_G }, // gold, 1 gram
  VNXAU: { units: 1 / OZ_G }, // gold, 1 gram
  KAU: { units: 1 / OZ_G }, // gold, 1 gram
  GRAMS: { units: 1 / OZ_G }, // silver, 1 gram
  GOOGon: { ticker: "GOOG" }, // Alphabet Class C (vs GOOGL Class A is a false spread)
};

function baseRef(
  assetSymbol: string,
  assetType: string
): { ticker: string; metal?: "XAU" | "XAG"; noun: string } | null {
  if (assetSymbol === "GOLD") return { ticker: "GC=F", metal: "XAU", noun: "gold" };
  if (assetSymbol === "SILVER") return { ticker: "SI=F", metal: "XAG", noun: "silver" };
  // Any stock/ETF symbol doubles as its Yahoo ticker; dots become dashes (BRK.B -> BRK-B).
  if (assetType === "stock" || assetType === "etf")
    return { ticker: assetSymbol.replace(/\./g, "-"), noun: "share" };
  return null;
}

export function underlyingRefFor(
  assetSymbol: string,
  tokenSymbol: string,
  assetType: string
): UnderlyingRef | null {
  const ov = TOKEN_OVERRIDE[tokenSymbol];
  if (ov?.ticker) {
    return {
      ticker: ov.ticker,
      unitsPerToken: ov.units ?? 1,
      label: `${ov.ticker} share`,
      unitSuffix: "",
    };
  }
  const base = baseRef(assetSymbol, assetType);
  if (!base) return null;
  const units = ov?.units ?? 1;
  const isGram = units < 1 && !!base.metal;
  const label = base.metal
    ? isGram
      ? `1 g ${base.noun}`
      : `1 oz ${base.noun}`
    : `1 ${base.noun}`;
  return {
    ticker: base.ticker,
    metal: base.metal,
    unitsPerToken: units,
    label,
    unitSuffix: isGram ? "/g" : "",
  };
}
