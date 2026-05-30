# StreamGram

A Netflix-style mobile streaming app that ingests video files from a Telegram channel and presents them in a beautiful dark UI with hero banners, horizontal category rows, and native downloads.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API + Telegram bot (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (`lib/db/src/schema/series.ts`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo (React Native) with expo-router, @tanstack/react-query
- Telegram bot: Telegraf

## Where things live

- DB schema: `lib/db/src/schema/series.ts` (tables: `series`, `categories`)
- API spec: `lib/api-spec/openapi.yaml`
- Generated hooks: `lib/api-client-react/src/generated/api.ts`
- API routes: `artifacts/api-server/src/routes/`
- Telegram bot: `artifacts/api-server/src/telegram-bot.ts`
- Mobile app: `artifacts/mobile/`
  - Home screen: `artifacts/mobile/app/(tabs)/index.tsx`
  - Components: `artifacts/mobile/components/`
  - Colors/theme: `artifacts/mobile/constants/colors.ts`

## Architecture decisions

- Telegram bot runs inside the Express server process (same service, non-fatal if it fails)
- Bot uses `bot.launch()` async — API server stays up even if bot token is invalid
- Poster images use picsum.photos with a title-hash seed as a stable placeholder (no TMDB API key required)
- Download uses `Linking.openURL()` to trigger the OS native download manager
- Category is guessed from title keywords (TV Series, Documentary, Anime, Movies)

## Product

- Home screen: hero banner (most recent upload) + "Recently Added" row + per-category rows
- Tap any poster to open a detail modal with title, description, file size, duration, and Download button
- Download triggers the phone's native browser/download manager with the Telegram file URL
- Telegram bot auto-ingests new videos posted to the configured channel

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Always run `pnpm run typecheck:libs` after adding new DB tables** before typechecking the API server — the composite lib build must run first
- **OpenAPI operationId naming**: avoid endpoints with both path params AND query params — Orval generates `*Params` types in both `api.ts` and `types/`, causing TS2308 collisions. Use `listSeriesParams`-style query-only endpoints instead.
- Telegram bot token is validated on `bot.launch()` — a 404 error means the token is invalid or the secret value is wrong
- `TELEGRAM_CHANNEL_ID` must be the numeric chat ID (e.g. `-1001234567890`) or `@channelname`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
