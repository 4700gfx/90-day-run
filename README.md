# The 90-Day Run Tracker

Daily habit tracker for the 90-Day Run restart (Day 0 Sun Nov 1, Day 1 Mon Nov 2, 2026 → Day 90 Sat Jan 30, 2027).
Mobile-first, offline-first, syncs between phone and desktop.

## Stack
- Vite + React 18 + TypeScript. Rules engine in `src/engine/` (pure functions, unit tested with Vitest).
- Config: `src/config/run.config.ts` (dates, habits, plans) + `src/config/profile.ts` (personal numbers, placeholders only).
- Sync: `api/sync.js`, a Vercel function on Upstash Redis with a per-record last-write-wins merge.

```bash
npm install
npm run dev      # local dev (sync needs `vercel dev` for the /api routes)
npm test         # rules engine, migration and sync merge tests
npm run build    # typecheck + production build to dist/
```

## Deploy (Vercel)
`vercel.json` sets the Vite build (`npm run build` → `dist/`), so no dashboard changes are needed.
Sync needs the Upstash Redis integration (`KV_REST_API_URL` / `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_*`), which this project already has.

## Personal data
This repo is public, so real money, debt and body numbers are **not** in the code. Keep them in
`profile.local.json` (gitignored) and load it once in **Settings → Import profile**. It is then
stored with your run data and synced, never committed.

## Sync
Settings → Sync: enter the same sync code on every device. Data saves on the device first and syncs in
the background; each record merges by its own timestamp, so edits on two devices don't overwrite each
other. The code is a passcode, not real authentication: use a long generated one.
Settings → Backup exports/imports everything as JSON.

## Data history
Schema v3. The original Sep 27 run is migrated into a read-only "Run 1" (raw data kept), and older
synced data under the same code is migrated on the first sync.
