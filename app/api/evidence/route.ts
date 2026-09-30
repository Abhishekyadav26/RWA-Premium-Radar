import { NextResponse } from "next/server";
import {
  isTierGated,
  rwaAssetsList,
  rwaInfo,
  rwaIssuer,
  rwaIssuersList,
  rwaMap,
  rwaMarketPairs,
  rwaQuotesLatest,
} from "@/lib/cmc";

function truncate(obj: unknown, max = 2000): string {
  const s = JSON.stringify(obj, null, 1);
  return s.length > max ? s.slice(0, max) + `\n… [truncated ${s.length - max} chars]` : s;
}

export async function GET() {
  // One live call per endpoint; each captured with timestamp + credit_count.
  const calls: Array<{
    endpoint: string;
    purpose: string;
    httpStatus: number;
    creditCount: number | null;
    fetchedAt: string;
    note?: string;
    response: string;
  }> = [];

  const run = async (
    endpoint: string,
    purpose: string,
    fn: () => Promise<{ data: unknown; status: { credit_count: number; timestamp: string } }>
  ) => {
    try {
      const r = await fn();
      calls.push({
        endpoint,
        purpose,
        httpStatus: 200,
        creditCount: r.status.credit_count,
        fetchedAt: r.status.timestamp,
        response: truncate(r.data),
      });
    } catch (e) {
      calls.push({
        endpoint,
        purpose,
        httpStatus: 502,
        creditCount: null,
        fetchedAt: new Date().toISOString(),
        note: e instanceof Error ? e.message : "failed",
        response: "{}",
      });
    }
  };

  await run("GET /v5/real-world-assets/map", "Resolve rwa_id / symbol universe (0 credits)", () => rwaMap());
  await run("GET /v5/real-world-assets/assets/list?limit=1", "Aggregate tokenised price / mcap per asset", () =>
    rwaAssetsList({ limit: 1 })
  );
  await run("GET /v5/real-world-assets/quotes/latest?symbol=GOLD", "Per-token prices, issuers, aggregate price", () =>
    rwaQuotesLatest({ symbols: ["GOLD"] })
  );
  await run("GET /v5/real-world-assets/info?rwa_id=1", "Asset metadata", () => rwaInfo(1));
  await run("GET /v5/real-world-assets/issuers/list", "Issuer directory (1 credit flat)", () => rwaIssuersList());
  await run("GET /v5/real-world-assets/issuers?issuer_id=<paxos>", "Single issuer + linked tokens (1 credit flat)", () =>
    rwaIssuer("68904c24abae9b5b9fb35815")
  );

  // Growth+-gated endpoint: attempt once, expect tier error on Startup.
  try {
    const mp = await rwaMarketPairs(1);
    const code = mp.body?.status?.error_code;
    calls.push({
      endpoint: "GET /v5/real-world-assets/market-pairs/list?limit=1",
      purpose: "Market pairs (Growth+ only — expected to fail on Startup)",
      httpStatus: mp.httpStatus,
      creditCount: mp.body?.status?.credit_count ?? null,
      fetchedAt: mp.body?.status?.timestamp ?? new Date().toISOString(),
      note:
        code !== undefined && isTierGated(code)
          ? `Tier-gated as documented: ${mp.body?.status?.error_message}`
          : undefined,
      response: truncate(mp.body),
    });
  } catch (e) {
    calls.push({
      endpoint: "GET /v5/real-world-assets/market-pairs/list?limit=1",
      purpose: "Market pairs (Growth+ only)",
      httpStatus: 502,
      creditCount: null,
      fetchedAt: new Date().toISOString(),
      note: e instanceof Error ? e.message : "failed",
      response: "{}",
    });
  }

  return NextResponse.json({ calls, generatedAt: new Date().toISOString() });
}
