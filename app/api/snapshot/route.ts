import { NextResponse } from "next/server";
import { buildRadar } from "@/lib/radar";
import { cmcErrorResponse } from "../rwa/route";

// Lightweight snapshot for the client-side history chart (polled every 60s).
export async function GET() {
  try {
    const { rows, generatedAt } = await buildRadar();
    return NextResponse.json({
      at: generatedAt,
      points: rows.map((r) => ({
        asset: r.assetSymbol,
        token: r.tokenSymbol,
        premiumAgg: r.premiumAgg,
        premiumUnder: r.premiumUnder,
      })),
    });
  } catch (e) {
    return cmcErrorResponse(e);
  }
}
