# Physical Transition Assistant

A calm, mobile-first web app that guides people with executive dysfunction through physical checkpoints (stations) around their home, one at a time. The core idea: **Don't think about the whole day. Just move to the next station.**

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/transition-assistant run dev` — run the frontend (port 18736)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TailwindCSS, wouter, TanStack Query, shadcn/ui, Outfit font
- API: Express 5, OpenAPI-first with Orval codegen
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod v3, drizzle-zod
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for API contracts
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not hand-edit)
- `lib/api-zod/src/generated/` — generated Zod schemas for server validation
- `lib/db/src/schema/` — Drizzle table definitions (checkpoints, sessions, routines, nfc_tags, settings, event_log)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/` — shared server libs (event-logger, routine-helpers, nfc-scan-processor)
- `artifacts/transition-assistant/src/pages/` — app pages (home, simulate, history, settings, nfc-tags, insights, dev)
- `artifacts/transition-assistant/src/components/layout/app-layout.tsx` — bottom nav + app shell

## Architecture decisions

- **NFC abstraction**: All NFC logic routes through `POST /api/nfc/scan` (real tag UID) or `POST /api/nfc/simulate` (checkpoint ID). The same `processNfcScan` function handles both. `NFCService` (`src/services/nfc-service.ts`) is the single abstraction — real NFC and simulation both call the same scan handler.
- **NFCService**: Detects Capacitor native context automatically. In native Android: uses `@capgo/capacitor-nfc` plugin to start a persistent NFC reader session. In web/Replit dev: no-op (simulation via the Stations page still works). Normalises tag UIDs to `"04:8A:23:XX:XX:XX"` format. Client-side debounce: 1 500 ms per UID (server adds a 2 000 ms guard).
- **Home page NFC listener** (`useHomeNfc` hook): Automatically starts NFC scanning when there is a waiting or in_progress session. Resolves detected UID against the cached tags list to catch wrong-station scans client-side before calling the API. Shows a "Wrong station." toast without making an API call.
- **Capacitor**: Configured at `artifacts/transition-assistant/capacitor.config.ts`. Plugin: `@capgo/capacitor-nfc` v8 (Capacitor v8). Build instructions in `ANDROID_BUILD.md`.
- **One-tag start/complete**: The scan processor checks session state — WAITING → start, IN_PROGRESS → complete (or warn if too early).
- **getOrCreateTodayRoutine**: Auto-creates today's routine with appropriate sessions on first API call. Energy mode determines which checkpoints are included.
- **Codegen fix**: Orval v8 generates `zod.int()` (Zod v4 syntax) but the project uses Zod v3. A post-process step in the codegen script replaces `zod.int()` with `zod.number()` in the generated api-zod file.
- **Capacitor-ready**: Clean separation between web simulation and native layers. Server abstractions (`triggerAlarm`, `scheduleNotification`, `enableStrictMode`) are designed to be replaced with Capacitor plugin calls.

## Product

- **Home screen**: Shows one thing — the NEXT station to go to. When a session is in-progress, shows a full-screen "PARK YOUR PHONE" lock-screen with an elapsed timer.
- **Stations (NFC Simulator)**: Grid of all 10 stations. Tap to simulate a scan — app auto-determines start vs complete based on state.
- **Energy Modes**: FULL (all 10 stations) / REDUCED (5 essentials) / SURVIVAL (3 absolute essentials). No shame, no streaks.
- **Freeze Intervention**: Gentle overlay when user is stuck — "Still here? Let's make it smaller. Just stand up."
- **History**: Last 7 days, neutral language, completion counts per day.
- **Insights**: Adaptive patterns — most difficult station, best energy mode, streak days.
- **Dev Tools**: Event log, fast-forward timers, simulate/reset, test alarm (behind Developer Mode toggle in Settings).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Android NFC build

See `artifacts/transition-assistant/ANDROID_BUILD.md` for the full step-by-step. Short version:

```bash
# 1. Build web assets (must set BASE_PATH=/ for Capacitor)
BASE_PATH=/ pnpm --filter @workspace/transition-assistant run build

# 2. Add Android project (first time only)
cd artifacts/transition-assistant && npx cap add android

# 3. Add NFC permissions to android/app/src/main/AndroidManifest.xml:
#    <uses-permission android:name="android.permission.NFC" />
#    <uses-feature android:name="android.hardware.nfc" android:required="false" />

# 4. Sync web assets
npx cap sync android

# 5. Open in Android Studio → Run on device
npx cap open android
```

## Gotchas

- **Codegen post-process**: `lib/api-spec/package.json` codegen script includes a node one-liner to replace `zod.int()` → `zod.number()` in the generated Zod file. This must stay whenever the spec changes.
- **Routine creation timing**: `getOrCreateTodayRoutine` only includes checkpoints that exist at creation time. If checkpoints are added after a routine is created for today, call `POST /api/routines/today` with `{ energyMode, reset: true }` to rebuild sessions.
- Always use `pnpm run typecheck` not `pnpm run build` from the shell — build requires workflow-provided `PORT` and `BASE_PATH`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
