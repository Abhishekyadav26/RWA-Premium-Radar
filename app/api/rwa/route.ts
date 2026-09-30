import { NextResponse } from "next/server";
import { CmcError } from "@/lib/cmc";
import { buildRadar } from "@/lib/radar";

export async function GET() {
  try {
    const data = await buildRadar();
    return NextResponse.json(data);
  } catch (e) {
    return cmcErrorResponse(e);
  }
}

export function cmcErrorResponse(e: unknown) {
  if (e instanceof CmcError) {
    const status = e.code === 401 || e.code === "401" ? 502 : 502;
    return NextResponse.json(
      { error: `Upstream CMC error (${e.code}): ${e.message}` },
      { status }
    );
  }
  return NextResponse.json({ error: "Failed to build radar data" }, { status: 502 });
}
