// Typed CMC Real-World-Assets API client (server-side only).
// Base: https://pro-api.coinmarketcap.com | Header: X-CMC_PRO_API_KEY
// Key is read ONLY here from CMC_API_KEY (or CMC_API_key) env var. Never import this from client components.

const BASE = "https://pro-api.coinmarketcap.com";

export function cmcKey(): string {
  const key = process.env.CMC_API_KEY || process.env.CMC_API_key || "";
  if (!key) throw new Error("CMC_API_KEY is not set (add it to .env.local)");
  return key;
}

export interface CmcStatus {
  timestamp: string;
  error_code: string | number;
  error_message: string | null;
  elapsed: number;
  credit_count: number;
}

export interface CmcResponse<T> {
  data: T;
  status: CmcStatus;
}

export class CmcError extends Error {
  code: string | number;
  credits: number;
  constructor(code: string | number, message: string, credits = 0) {
    super(message);
    this.code = code;
    this.credits = credits;
  }
}

// ---- Shared shapes (verified live 2026-09-30) ----

export interface RwaToken {
  symbol: string;
  name: string;
  price: number | null;
  market_cap: number | null;
  volume_24h: number | null;
  issuer_id: string;
  issuer_name: string;
  crypto_id: number;
}

export interface TradfiMarket {
  exchange?: { slug: string; name: string; exchange_id: number };
  ticker?: string;
  market_url?: string;
  [k: string]: unknown;
}

export interface RwaAsset {
  rwa_id: number;
  name: string;
  symbol: string;
  slug: string;
  asset_type: string; // "stock" | "commodity" | "etf" | "bond" | ...
  rwa_rank?: number;
  has_tokens?: boolean;
  average_tokenized_price: number | null;
  tokenized_market_cap: number | null;
  tokenized_volume_24h?: number | null;
  last_updated?: string;
  tokens?: RwaToken[];
  tradfi_markets?: TradfiMarket[];
}

export interface MapItem {
  name: string;
  symbol: string;
  slug: string;
  rwa_id: number;
  asset_type: string;
  rwa_rank: number;
  has_tokens: boolean;
}

export interface IssuerSummary {
  issuer_id: string;
  name: string;
  website?: string;
  logo?: string;
  num_tokens: number;
}

export interface IssuerTokenLink {
  name: string;
  symbol: string;
  crypto_id: number;
  rwa_id: number | null; // CMC returns null for some unlisted tokens (e.g. Backpack's BOT/FLWS)
}

export interface IssuerDetail {
  issuer_id: string;
  name: string;
  website?: string;
  logo?: string;
  num_tokens: number;
  tokens: IssuerTokenLink[];
}

async function cmcFetch<T>(path: string, revalidateSeconds: number): Promise<CmcResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-CMC_PRO_API_KEY": cmcKey(), Accept: "application/json" },
    next: { revalidate: revalidateSeconds },
  });

  let body: CmcResponse<T>;
  try {
    body = (await res.json()) as CmcResponse<T>;
  } catch {
    throw new CmcError(res.status, `CMC returned non-JSON (HTTP ${res.status})`);
  }

  const code = body?.status?.error_code;
  if (!res.ok || (code !== 0 && code !== "0")) {
    const msg = body?.status?.error_message || `CMC request failed (HTTP ${res.status})`;
    throw new CmcError(code ?? res.status, msg, body?.status?.credit_count ?? 0);
  }
  return body;
}

function params(q: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}

// GET /v5/real-world-assets/map — 0 credits
export async function rwaMap(assetType?: string) {
  return cmcFetch<{ rwa_assets: MapItem[]; total_size: number; has_more: boolean }>(
    `/v5/real-world-assets/map${params({ asset_type: assetType })}`,
    3600
  );
}

// GET /v5/real-world-assets/quotes/latest — per-call credits
export async function rwaQuotesLatest(opts: {
  symbols?: string[];
  rwaIds?: number[];
  slugs?: string[];
  convert?: string;
}) {
  const q = params({
    symbol: opts.symbols?.join(","),
    rwa_id: opts.rwaIds?.join(","),
    rwa_slug: opts.slugs?.join(","),
    convert: opts.convert,
  });
  return cmcFetch<{ rwa_assets: RwaAsset[] }>(`/v5/real-world-assets/quotes/latest${q}`, 60);
}

// GET /v5/real-world-assets/assets/list
export async function rwaAssetsList(opts: {
  assetType?: string;
  limit?: number;
  sort?: string;
  sortDir?: string;
  convert?: string;
} = {}) {
  const q = params({
    asset_type: opts.assetType,
    limit: opts.limit ?? 20,
    sort: opts.sort,
    sort_dir: opts.sortDir,
    convert: opts.convert,
  });
  return cmcFetch<{ rwa_assets: RwaAsset[]; total_size: number; has_more: boolean }>(
    `/v5/real-world-assets/assets/list${q}`,
    60
  );
}

// GET /v5/real-world-assets/info
export async function rwaInfo(rwaId: number) {
  return cmcFetch<{ rwa_assets: Array<Record<string, unknown>> }>(
    `/v5/real-world-assets/info${params({ rwa_id: rwaId })}`,
    3600
  );
}

// GET /v5/real-world-assets/issuers/list — 1 credit flat
export async function rwaIssuersList() {
  return cmcFetch<{ issuers: IssuerSummary[]; total_size: number; has_more: boolean }>(
    `/v5/real-world-assets/issuers/list`,
    300
  );
}

// GET /v5/real-world-assets/issuers?issuer_id=... — 1 credit flat
export async function rwaIssuer(issuerId: string) {
  return cmcFetch<IssuerDetail>(`/v5/real-world-assets/issuers${params({ issuer_id: issuerId })}`, 300);
}

// GET /v5/real-world-assets/market-pairs/list — Growth+ ONLY. Attempt behind flag; 403/1006 expected on Startup.
export async function rwaMarketPairs(limit = 1) {
  const res = await fetch(
    `${BASE}/v5/real-world-assets/market-pairs/list${params({ limit })}`,
    {
      headers: { "X-CMC_PRO_API_KEY": cmcKey(), Accept: "application/json" },
      next: { revalidate: 300 },
    }
  );
  const body = await res.json().catch(() => null);
  return { httpStatus: res.status, body };
}

export function isTierGated(code: string | number): boolean {
  return code === 1006 || code === "1006" || code === 403 || code === "403";
}
