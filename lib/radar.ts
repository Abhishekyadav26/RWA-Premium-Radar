// Merges CMC quotes + underlying prices into radar rows.
// Shared by /api/rwa and /api/snapshot (Next fetch cache dedupes CMC calls within revalidate window).

import { rwaMap, rwaQuotesLatest, type RwaAsset } from "./cmc";
import { flagFor, isDerivativeToken, type Flag } from "./flags";
import { underlyingRefFor } from "./mapping";
import { premiumVsAggregate, premiumVsUnderlying } from "./premium";
import { getMetalQuote, getUnderlying, isMarketOpen, type UnderlyingQuote } from "./underlying";

export interface RadarRow {
  assetSymbol: string;
  assetName: string;
  assetType: string;
  rwaId: number;
  avgTokenizedPrice: number | null;
  tokenSymbol: string;
  tokenName: string;
  issuerId: string;
  issuerName: string;
  isDerivative: boolean;
  flag: Flag;
  price: number | null;
  marketCap: number | null;
  volume24h: number | null;
  premiumAgg: number | null;
  premiumUnder: number | null;
  underlyingTicker: string | null;
  underlyingPrice: number | null;
  // Reference expressed in the token's own units (e.g. $134.56/g for gram tokens).
  refUnitPrice: number | null;
  refUnitSuffix: string;
  underlyingLabel: string | null;
  refNote: string | null; // e.g. futures fallback when spot feed is down
  marketState: string | null;
  marketOpen: boolean;
  underlyingAsOf: string | null;
}

export interface RadarResult {
  rows: RadarRow[];
  generatedAt: string;
  underlyingSource: string;
  assets: Array<{
    symbol: string;
    name: string;
    assetType: string;
    avgPrice: number | null;
    marketCap: number | null;
    spreadPct: number | null;
    tokenCount: number;
  }>;
}

const MAX_SYMBOLS = 30;

export async function buildRadar(): Promise<RadarResult> {
  // 0-credit map → symbol universe (top by rank).
  const map = await rwaMap();
  const symbols = map.data.rwa_assets
    .filter((a) => a.has_tokens)
    .sort((a, b) => a.rwa_rank - b.rwa_rank)
    .slice(0, MAX_SYMBOLS)
    .map((a) => a.symbol);

  const quotes = await rwaQuotesLatest({ symbols });
  const assets: RwaAsset[] = quotes.data.rwa_assets ?? [];

  // Unique underlying refs needed (Yahoo tickers + spot metals).
  const keys = new Set<string>();
  for (const a of assets) {
    for (const t of a.tokens ?? []) {
      const ref = underlyingRefFor(a.symbol, t.symbol, a.asset_type);
      if (ref) keys.add(ref.metal ? `metal:${ref.metal}` : ref.ticker);
    }
  }
  const quotesByKey = new Map<string, UnderlyingQuote | null>();
  await Promise.all(
    [...keys].map(async (key) => {
      if (key.startsWith("metal:")) {
        const metal = key.slice(6) as "XAU" | "XAG";
        const fallback = metal === "XAU" ? "GC=F" : "SI=F";
        quotesByKey.set(key, await getMetalQuote(metal, fallback));
      } else {
        quotesByKey.set(key, await getUnderlying(key));
      }
    })
  );

  const rows: RadarRow[] = [];
  for (const a of assets) {
    for (const t of a.tokens ?? []) {
      const ref = underlyingRefFor(a.symbol, t.symbol, a.asset_type);
      const uq = ref ? quotesByKey.get(ref.metal ? `metal:${ref.metal}` : ref.ticker) ?? null : null;
      const underPrice = uq?.price ?? null;
      const units = ref?.unitsPerToken ?? 1;
      const premiumAgg = premiumVsAggregate(t.price, a.average_tokenized_price, units);
      const premiumUnder = ref ? premiumVsUnderlying(t.price, underPrice, units) : null;
      const derivative = isDerivativeToken(t.issuer_name, t.name);
      rows.push({
        assetSymbol: a.symbol,
        assetName: a.name,
        assetType: a.asset_type,
        rwaId: a.rwa_id,
        avgTokenizedPrice: a.average_tokenized_price,
        tokenSymbol: t.symbol,
        tokenName: t.name,
        issuerId: t.issuer_id,
        issuerName: t.issuer_name,
        isDerivative: derivative,
        flag: flagFor({
          premUnd: premiumUnder,
          premAgg: premiumAgg,
          marketCap: t.market_cap,
          volume: t.volume_24h,
          isDerivative: derivative,
        }),
        price: t.price,
        marketCap: t.market_cap,
        volume24h: t.volume_24h,
        premiumAgg,
        premiumUnder,
        underlyingTicker: ref ? (ref.metal ?? ref.ticker) : null,
        underlyingPrice: underPrice,
        refUnitPrice: underPrice != null ? underPrice * units : null,
        refUnitSuffix: ref?.unitSuffix ?? "",
        underlyingLabel: ref?.label ?? null,
        refNote:
          ref?.metal && uq && uq.source !== "goldapi" ? `spot feed down, showing ${uq.source} fallback` : null,
        marketState: uq?.marketState ?? null,
        marketOpen: isMarketOpen(uq?.marketState),
        underlyingAsOf: uq?.asOf ?? null,
      });
    }
  }

  // Per-asset summary with issuer spread.
  const { issuerSpread } = await import("./premium");
  const assetsSummary = assets.map((a) => {
    const prices = (a.tokens ?? []).map((t) => t.price);
    return {
      symbol: a.symbol,
      name: a.name,
      assetType: a.asset_type,
      avgPrice: a.average_tokenized_price,
      marketCap: a.tokenized_market_cap,
      spreadPct: issuerSpread(prices),
      tokenCount: (a.tokens ?? []).length,
    };
  });

  const source = [...quotesByKey.values()].find((q) => q)?.source ?? "unavailable";
  return { rows, generatedAt: new Date().toISOString(), underlyingSource: source, assets: assetsSummary };
}
