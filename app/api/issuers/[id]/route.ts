import { NextResponse } from "next/server";
import { rwaIssuer, rwaQuotesLatest } from "@/lib/cmc";
import { underlyingRefFor } from "@/lib/mapping";
import { premiumVsAggregate, premiumVsUnderlying } from "@/lib/premium";
import { getMetalQuote, getUnderlying } from "@/lib/underlying";
import { cmcErrorResponse } from "../../rwa/route";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const issuer = await rwaIssuer(id);
    const d = issuer.data;

    // Join linked tokens with live quotes (price, mcap, premium).
    // Some issuers (e.g. Backpack) link tokens with rwa_id: null — drop those
    // before calling quotes/latest or CMC rejects with 4001 Invalid parameter.
    const rwaIds = [
      ...new Set(
        d.tokens
          .map((t) => t.rwa_id)
          .filter((id): id is number => typeof id === "number" && Number.isFinite(id))
      ),
    ];
    const quotes = rwaIds.length ? await rwaQuotesLatest({ rwaIds }) : null;
    const byCryptoId = new Map<number, { price: number | null; marketCap: number | null; assetSymbol: string; assetType: string; avgPrice: number | null }>();
    for (const a of quotes?.data.rwa_assets ?? []) {
      for (const t of a.tokens ?? []) {
        byCryptoId.set(t.crypto_id, {
          price: t.price,
          marketCap: t.market_cap,
          assetSymbol: a.symbol,
          assetType: a.asset_type,
          avgPrice: a.average_tokenized_price,
        });
      }
    }

    const keys = new Set<string>();
    for (const t of d.tokens) {
      const q = byCryptoId.get(t.crypto_id);
      if (!q) continue;
      const ref = underlyingRefFor(q.assetSymbol, t.symbol, q.assetType);
      if (ref) keys.add(ref.metal ? `metal:${ref.metal}` : ref.ticker);
    }
    const under = new Map<string, number | null>();
    await Promise.all(
      [...keys].map(async (key) => {
        if (key.startsWith("metal:")) {
          const metal = key.slice(6) as "XAU" | "XAG";
          under.set(key, (await getMetalQuote(metal, metal === "XAU" ? "GC=F" : "SI=F"))?.price ?? null);
        } else {
          under.set(key, (await getUnderlying(key))?.price ?? null);
        }
      })
    );

    const tokens = d.tokens.map((t) => {
      const q = byCryptoId.get(t.crypto_id);
      const ref = underlyingRefFor(q?.assetSymbol ?? "", t.symbol, q?.assetType ?? "");
      const key = ref ? (ref.metal ? `metal:${ref.metal}` : ref.ticker) : null;
      const units = ref?.unitsPerToken ?? 1;
      return {
        ...t,
        assetSymbol: q?.assetSymbol ?? null,
        price: q?.price ?? null,
        marketCap: q?.marketCap ?? null,
        premiumAgg: premiumVsAggregate(q?.price ?? null, q?.avgPrice ?? null, units),
        premiumUnder:
          ref && q ? premiumVsUnderlying(q.price, key ? under.get(key) ?? null : null, units) : null,
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
