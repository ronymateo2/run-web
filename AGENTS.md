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
- Query helpers: `src/db/queries/{injuries,exercises,checkins,sst}.ts`
- Sync: `src/db/sync.ts` — `pullDelta` / `pushDelta`

## Design tokens
`src/react-app/design/tokens.css` — CSS vars: `--bg`, `--ink`, `--clay`, `--moss`, `--bone`, etc.
Fonts: Instrument Serif + Manrope + JetBrains Mono.

## Auth flow
1. `GoogleLogin` button in `LoginScreen` → Google `credential` (id_token JWT)
2. POST to `run-api /api/auth/google` → gets back our JWT
3. JWT stored in localStorage + local SQLite `users.jwt`
4. `AuthContext.tsx` restores session on mount, triggers background sync

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
- All DB query functions are **async** — always `await` them; screens use `useEffect`/`useState` (not `useMemo`)
- `useDb()` hook returns `Database | null` — null-check before queries
- Injuries/phases/exercises are read-only in the client (seeded via D1 by admin)
