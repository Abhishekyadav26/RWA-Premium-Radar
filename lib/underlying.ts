// Free underlying market prices, fetched server-side with short timeouts.
// Primary: Yahoo Finance chart endpoint (unofficial). Fallback: Stooq CSV.
// Everything is wrapped in try/catch — any failure returns null (no fake numbers).

export interface UnderlyingQuote {
  ticker: string;
  price: number;
  marketState: string | null; // e.g. REGULAR, PRE, POST, CLOSED
  asOf: string; // ISO timestamp of the quote
  source: "yahoo" | "stooq";
}

const TIMEOUT_MS = 4000;

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (RWA-Premium-Radar MVP)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (RWA-Premium-Radar MVP)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function fromYahoo(ticker: string): Promise<UnderlyingQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const j = (await fetchJson(url)) as {
      chart?: { result?: Array<{ meta?: Record<string, unknown> }> };
    };
    const meta = j?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== "number" || !Number.isFinite(price)) return null;
    const ts = typeof meta?.regularMarketTime === "number" ? meta.regularMarketTime * 1000 : Date.now();
    // v8 chart meta has no marketState field — derive from currentTradingPeriod windows.
    const state = deriveMarketState(meta);
    return { ticker, price, marketState: state, asOf: new Date(ts).toISOString(), source: "yahoo" };
  } catch {
    return null;
  }
}

function stooqSymbol(ticker: string): string {
  if (ticker === "GC=F" || ticker === "XAUUSD=X") return "xauusd";
  return `${ticker.toLowerCase()}.us`;
}

async function fromStooq(ticker: string): Promise<UnderlyingQuote | null> {
  try {
    const url = `https://stooq.com/q/l/?s=${stooqSymbol(ticker)}&f=sd2t2ohlcv&h&e=csv`;
    const text = await fetchText(url);
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    const cols = lines[1].split(",");
    // Symbol,Date,Time,Open,High,Low,Close,Volume
    const close = Number(cols[6]);
    if (!Number.isFinite(close) || close <= 0) return null;
    return { ticker, price: close, marketState: null, asOf: new Date().toISOString(), source: "stooq" };
  } catch {
    return null;
  }
}

// Yahoo v8 chart meta carries no marketState string; derive open/closed from
// currentTradingPeriod windows (regular/pre/post start-end epochs).
function deriveMarketState(meta: Record<string, unknown> | undefined): string | null {
  try {
    const ctp = meta?.currentTradingPeriod as
      | Record<string, { start?: number; end?: number }>
      | undefined;
    if (!ctp) return null;
    const now = Date.now() / 1000;
    const inWindow = (w?: { start?: number; end?: number }) =>
      !!w && typeof w.start === "number" && typeof w.end === "number" && now >= w.start && now < w.end;
    if (inWindow(ctp.regular)) return "REGULAR";
    if (inWindow(ctp.pre)) return "PRE";
    if (inWindow(ctp.post)) return "POST";
    return "CLOSED";
  } catch {
    return null;
  }
}
const cache = new Map<string, { at: number; quote: UnderlyingQuote | null }>();
const CACHE_TTL_MS = 60_000;

export async function getUnderlying(ticker: string): Promise<UnderlyingQuote | null> {
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.quote;
  const quote = (await fromYahoo(ticker)) ?? (await fromStooq(ticker));
  cache.set(ticker, { at: Date.now(), quote });
  return quote;
}

// Market-open honesty: Yahoo marketState REGULAR/PRE/POST ≈ live; anything else (or unknown) → treat as closed.
export function isMarketOpen(state: string | null | undefined): boolean {
  if (!state) return false;
  const s = state.toUpperCase();
  return s === "REGULAR" || s === "PRE" || s === "PREPRE" || s === "POST" || s === "POSTPOST";
}
