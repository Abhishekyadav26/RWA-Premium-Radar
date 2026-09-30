import { NextResponse } from "next/server";
import { rwaIssuer, rwaQuotesLatest } from "@/lib/cmc";
import { underlyingRefFor } from "@/lib/mapping";
import { premiumVsAggregate, premiumVsUnderlying } from "@/lib/premium";
import { getUnderlying } from "@/lib/underlying";
import { cmcErrorResponse } from "../../rwa/route";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const issuer = await rwaIssuer(id);
    const d = issuer.data;

    // Join linked tokens with live quotes (price, mcap, premium).
    const rwaIds = [...new Set(d.tokens.map((t) => t.rwa_id))];
    const quotes = rwaIds.length ? await rwaQuotesLatest({ rwaIds }) : null;
    const byCryptoId = new Map<number, { price: number | null; marketCap: number | null; assetSymbol: string; avgPrice: number | null }>();
    for (const a of quotes?.data.rwa_assets ?? []) {
      for (const t of a.tokens ?? []) {
        byCryptoId.set(t.crypto_id, {
          price: t.price,
          marketCap: t.market_cap,
          assetSymbol: a.symbol,
          avgPrice: a.average_tokenized_price,
        });
      }
    }

    const tickers = new Set<string>();
    for (const t of d.tokens) {
      const q = byCryptoId.get(t.crypto_id);
      const ref = underlyingRefFor(q?.assetSymbol ?? "", t.symbol);
      if (ref) tickers.add(ref.ticker);
    }
    const under = new Map<string, number | null>();
    await Promise.all(
      [...tickers].map(async (tk) => under.set(tk, (await getUnderlying(tk))?.price ?? null))
    );

    const tokens = d.tokens.map((t) => {
      const q = byCryptoId.get(t.crypto_id);
      const ref = underlyingRefFor(q?.assetSymbol ?? "", t.symbol);
      return {
        ...t,
        assetSymbol: q?.assetSymbol ?? null,
        price: q?.price ?? null,
        marketCap: q?.marketCap ?? null,
        premiumAgg: premiumVsAggregate(q?.price ?? null, q?.avgPrice ?? null),
        premiumUnder:
          ref && q ? premiumVsUnderlying(q.price, under.get(ref.ticker) ?? null, ref.unitsPerToken) : null,
      };
    });
    const totalValue = tokens.reduce(
      (s, t) => s + (typeof t.marketCap === "number" ? t.marketCap : 0),
      0
    );

    return NextResponse.json({
      issuer: { issuer_id: d.issuer_id, name: d.name, website: d.website, num_tokens: d.num_tokens },
      tokens,
      totalValue,
      creditCount: issuer.status.credit_count,
      fetchedAt: issuer.status.timestamp,
    });
  } catch (e) {
    return cmcErrorResponse(e);
  }
}
