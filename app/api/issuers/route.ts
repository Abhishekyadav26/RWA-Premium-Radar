import { NextResponse } from "next/server";
import { rwaIssuersList } from "@/lib/cmc";
import { cmcErrorResponse } from "../rwa/route";

export async function GET() {
  try {
    const res = await rwaIssuersList();
    return NextResponse.json({
      issuers: res.data.issuers,
      total: res.data.total_size,
      creditCount: res.status.credit_count,
      fetchedAt: res.status.timestamp,
    });
  } catch (e) {
    return cmcErrorResponse(e);
  }
}
