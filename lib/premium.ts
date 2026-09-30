// Pure premium math. Guards against zero/null; never returns NaN.
// Covered by vitest suite in lib/premium.test.ts.

export function premiumVsAggregate(tokenPrice: number | null, avgTokenizedPrice: number | null): number | null {
  if (!isFiniteNum(tokenPrice) || !isFiniteNum(avgTokenizedPrice) || avgTokenizedPrice === 0) return null;
  return ((tokenPrice as number) / (avgTokenizedPrice as number) - 1) * 100;
}

export function premiumVsUnderlying(
  tokenPrice: number | null,
  underlyingPrice: number | null,
  unitsPerToken = 1
): number | null {
  if (!isFiniteNum(tokenPrice) || !isFiniteNum(underlyingPrice) || !isFiniteNum(unitsPerToken)) return null;
  const ref = (underlyingPrice as number) * (unitsPerToken as number);
  if (ref === 0) return null;
  return ((tokenPrice as number) / ref - 1) * 100;
}

// Max-min token price spread across issuers of the same asset, as a percent of the min price.
export function issuerSpread(prices: Array<number | null>): number | null {
  const valid = prices.filter(isFiniteNum) as number[];
  if (valid.length < 2) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (min === 0) return null;
  return ((max - min) / min) * 100;
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
