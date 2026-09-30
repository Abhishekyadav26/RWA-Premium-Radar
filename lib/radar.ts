// Merges CMC quotes + underlying prices into radar rows.
// Shared by /api/rwa and /api/snapshot (Next fetch cache dedupes CMC calls within revalidate window).

import { rwaMap, rwaQuotesLatest, type RwaAsset } from "./cmc";
import { underlyingRefFor } from "./mapping";
import { premiumVsAggregate, premiumVsUnderlying } from "./premium";
import { getUnderlying, isMarketOpen, type UnderlyingQuote } from "./underlying";

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
  price: number | null;
  marketCap: number | null;
  volume24h: number | null;
  premiumAgg: number | null;
  premiumUnder: number | null;
  underlyingTicker: string | null;
  underlyingPrice: number | null;
  underlyingLabel: string | null;
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

  // Unique underlying tickers needed.
  const tickers = new Set<string>();
  for (const a of assets) {
    for (const t of a.tokens ?? []) {
      const ref = underlyingRefFor(a.symbol, t.symbol);
      if (ref) tickers.add(ref.ticker);
    }
  }
  const quotesByTicker = new Map<string, UnderlyingQuote | null>();
  await Promise.all(
    [...tickers].map(async (ticker) => {
      quotesByTicker.set(ticker, await getUnderlying(ticker));
    })
  );

  const rows: RadarRow[] = [];
  for (const a of assets) {
    for (const t of a.tokens ?? []) {
      const ref = underlyingRefFor(a.symbol, t.symbol);
      const uq = ref ? quotesByTicker.get(ref.ticker) ?? null : null;
      const underPrice = uq?.price ?? null;
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
        price: t.price,
        marketCap: t.market_cap,
        volume24h: t.volume_24h,
        premiumAgg: premiumVsAggregate(t.price, a.average_tokenized_price),
        premiumUnder: ref ? premiumVsUnderlying(t.price, underPrice, ref.unitsPerToken) : null,
        underlyingTicker: ref?.ticker ?? null,
        underlyingPrice: underPrice,
        underlyingLabel: ref?.label ?? null,
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

  const source = [...quotesByTicker.values()].find((q) => q)?.source ?? "unavailable";
  return { rows, generatedAt: new Date().toISOString(), underlyingSource: source, assets: assetsSummary };
}
