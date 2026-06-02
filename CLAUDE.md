# Rurana — run-web

PWA React + Vite + TypeScript. Offline-first via SQLite WASM (OPFS). Syncs with `run-api` (Cloudflare Worker + D1).

## Stack
- React 19 + TypeScript + Vite
- `@sqlite.org/sqlite-wasm` — local DB in OPFS (requires COOP/COEP headers)
- `vite-plugin-pwa` — service worker + manifest
- `@react-oauth/google` — Google OAuth (id_token → run-api JWT)
- `react-router-dom` v6 — client-side routing
- `@tanstack/react-query` — server state

## Key conventions
- **Code**: English (vars, functions, routes, DB columns)
- **UI strings**: Spanish neutro
- Routes: `/today`, `/body`, `/path`, `/path/phase/:id`, `/path/progress`, `/learn`, `/today/exercise/:id`, `/today/checkin`, `/today/sst`
- DB client: `src/db/client.ts` — exports `Database` type (our wrapper, NOT `@sqlite.org/sqlite-wasm`'s)
- Sync: `src/db/sync.ts` — `pullDelta` / `pushDelta`

## Data boundary (Fase 1 — done)
Screens and components NEVER touch SQLite/Drizzle directly. They go through the boundary:

- **`src/data/repositories/*`** — `injuryRepository`, `exerciseRepository`, `checkinRepository`, `sstRepository`, `userRepository` (+ barrel `index.ts`). Each method resolves the Drizzle instance internally (`getDrizzle()`) and delegates to `src/db/queries/*`. Import repos + types from `../../data/repositories`.
- **`src/data/maintenance.ts`** — `resetLocalCache()` (wipes synced tables + re-pulls; was raw `exec` in ProfileScreen).
- **`src/react-app/features/*`** — feature hooks/view-models per flow: `useTodayData()`, `usePhaseJourney(phaseId)`. Return UI-ready data + `reload`/mutations. Screens render only.
- **`src/db/queries/{injuries,exercises,checkins,sst,users}.ts`** — internal impl of the repos (still take `db` as first arg). Do NOT import these from the UI; import the repo instead.
- The `useDb()` hook was removed. No screen/component/provider imports `db/client`, `db/queries`, `getDrizzle`, or `DrizzleDb`.
- `AuthContext.tsx` session persistence (restore, upsert profile, clear jwt, set timezone) goes through `userRepository` — it no longer runs raw `exec`/SQL. It still calls `pullDelta`/`pushDelta` directly (sync API) and fetches `/api/auth/*` directly (to be unified into `apiClient` in Fase 0).
- `useSync()` (`pushDelta`) is still imported directly by screens that mutate; feature hooks that mutate call it internally.

## Design tokens
`src/react-app/design/tokens.css` — CSS vars: `--bg`, `--ink`, `--clay`, `--moss`, `--bone`, etc.
Fonts: Instrument Serif + Manrope + JetBrains Mono.

## Auth flow
1. `GoogleLogin` button in `LoginScreen` → Google `credential` (id_token JWT)
2. POST to `run-api /api/auth/google` with `credentials: "include"` → API sets an httpOnly session cookie (the JWT never reaches JS)
3. Only the **user profile** is cached in localStorage (`rurana_session`) + local SQLite for offline display — no token stored client-side
4. `AuthContext.tsx` restores session from the cached profile (optimistic; expired cookie → sync 401s silently); all API calls use `credentials: "include"`
5. `signOut` calls `POST /api/auth/logout` to clear the cookie

> `AuthContext.token` is a non-secret **presence marker** (the user id), kept only so existing `if (!token)` gates/deps keep working. It is not a credential.

## Env vars (`.env.local`)
```
VITE_API_URL=http://localhost:8787
VITE_GOOGLE_CLIENT_ID=<from Google Cloud Console>
```

## Dev
```bash
npm run dev        # Vite dev server at localhost:5173
npm run build      # tsc + vite build
npm run preview    # build + preview
```

## Important notes
- **No COOP/COEP headers needed**: SQLite runs in a Web Worker via `opfs-sahpool` VFS (uses `FileSystemSyncAccessHandle`, not SharedArrayBuffer). Google OAuth popup works freely.
- `@sqlite.org/sqlite-wasm` excluded from `optimizeDeps` — don't add it back
- All repo/query functions are **async** — always `await` them; screens use `useEffect`/`useState` (not `useMemo`)
- Repo methods take primitive args (no `db`) and never return null due to an uninitialised DB — they await `getDrizzle()` internally. Null-check on `user`, not on a db handle.
- Injuries/phases/exercises are read-only in the client (seeded via D1 by admin)

# Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

##  Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

##  Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

##  Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
