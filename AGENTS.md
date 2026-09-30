<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# RWA Premium Radar

Next 16.3.8 App Router + React 19 + Tailwind v4 (`@tailwindcss/postcss`) + recharts. No CI, no `opencode.json`, no vitest config (defaults). Path alias `@/*` → `./*`.

## Commands

```bash
npm install
cp .env.example .env.local  # add CMC_API_KEY
npm run dev    # http://localhost:3000
npm test       # vitest run — lib/*.test.ts (premium, mapping, flags)
npm run lint   # eslint (flat, eslint-config-next core-web-vitals + typescript)
npm run build  # next build
```

No typecheck script; `next build` is the type/lint gate. No single-test helper — use `npx vitest run lib/<name>.test.ts`. `npm run lint` has 1 known error (`set-state-in-effect` localStorage seed in `app/assets/[symbol]/page.tsx`); keep `app/page.tsx` clean via `Th` outside render (no components-in-render — `react-hooks/static-components` errors) and lazy `useState(readHist)` instead of seeding state in effects.

## Env / secrets

- `CMC_API_KEY` (fallback `CMC_API_key`) is read **only** in `lib/cmc.ts` (`cmcKey()`). Never import `lib/cmc.ts` from client components; all CMC access goes through `app/api/*` route handlers.
- `.env*` is gitignored. Production key must be set in Vercel project env vars.

## Architecture

- `lib/cmc.ts`: typed server-only CMC client. Caching is credit discipline — keep `revalidate`: `map` 3600s (0 credits, top-30 symbol universe), `quotes/latest` + `assets/list` 60s (upstream refreshes 30–60s), `issuers*` 300s. Don't lower these or add uncached CMC calls.
- `lib/radar.ts` `buildRadar()`: map → quotes → join underlying prices. Shared by `app/api/rwa/route.ts` (full rows) and `app/api/snapshot/route.ts` (light `{asset,token,premiumAgg,premiumUnder}` for 60s client poll).
- `lib/underlying.ts`: server-side only. Metals: gold-api spot first (`XAU`/`XAG`), then Yahoo chart `query1`→`query2`, then Stooq CSV; 4s timeout, 60s in-memory cache. Equities: Yahoo then Stooq. All failures → `null`. Market-open derived from Yahoo `currentTradingPeriod` windows (`isMarketOpen`); unknown → closed.
- `lib/mapping.ts` `underlyingRefFor()`: whitelist only. Gram gold/silver (`CGO/VNXAU/KAU/GRAMS` = `1/31.1035` oz), `GOOGon`→`GOOG`, `GOLD`→`GC=F`+spot, `SILVER`→`SI=F`+spot, stocks/ETFs ticker-as-is (`.`→`-`). Unmapped → `null` → UI shows "no reference price". Never invent a reference.
- `lib/premium.ts`: pure math, returns `null` (never `NaN`) on zero/missing. `premiumVsAggregate` is unit-normalized (`avg × unitsPerToken`).
- `lib/flags.ts`: `dislocation` = liquid (`mcap ≥ 50k` OR `vol ≥ 25k`), non-derivative, |p| 1–25% (prefers underlying, falls back to aggregate). `>25%` = `check-data`, never a dislocation. Derivatives (`/deriv/i` issuer or `(Derivative` token name) are always `none` and hidden by default.
- UI: `app/page.tsx` (`/` overview: top-5 mcap cards with premium sparklines, sentiment gauge, dislocation index, mcap breakdown chart, radar table below; polls `/api/rwa` + `/api/snapshot`). Sparkline history in localStorage (`rwa-overview-spark`, ~120 pts, "collecting…" until 2+ points). Presentational pieces in `app/components/overview.tsx` (Spark/Gauge/Slider/Avatar); formatters in `app/components/bits.tsx`. Palette: page `#0b1120`, cards `#141b2e` with `#232c47` borders. `app/assets/[symbol]/page.tsx` (per-asset history, localStorage ~200 pts, "since you opened"), `app/issuers/*`, `app/evidence/page.tsx` (one live call per endpoint).

## Gotchas (verified, don't regress)

- `market-pairs/list` is Growth+-gated (403/`1006` on Startup) — do not use; spreads are cross-issuer via `issuerSpread()`.
- `tradfi_markets[]` is exchange-listing metadata, not prices. Underlying prices come only from `lib/underlying.ts`.
- `average_tokenized_price` mixes token sizes (oz vs gram gold) — always compare via unit-normalized helpers.
- `price: null` tokens render as `—`; CMC `401/403/429` must surface as friendly banner (`cmcErrorResponse` → 502 JSON), never stack trace.
- Metals labeling: only gold-api source may be called "spot"; Yahoo `GC=F`/`SI=F` is futures fallback (contango) — see `refNote` logic in `lib/radar.ts`.
- Overview honesty: sentiment/dislocation/value panels are computed from live `/api/rwa` + snapshot history only — never add third-party indices (Fear & Greed, BTC dominance, ETF flows). CMC has no historical RWA endpoint, so charts are snapshot breakdowns, never time series; sparklines are session-local premium history.
