---
name: Single-bundle deploy (Clash Ren)
description: How the React+Vite frontend and Express API ship as one Node process on one port for external hosts (Hostinger). Constraints to keep intact.
---

# Single-process deploy contract

The app deploys as ONE Node process serving the API and the built SPA on one port.
Built artifact lives in `artifacts/api-server/dist/` (self-contained: bundled
server + `public/` frontend + generated `package.json`).

## How it fits together
- `artifacts/api-server/build.mjs` bundles the server with esbuild, copies
  `../clash-zen/dist/public` → `dist/public`, and emits a standalone
  `dist/package.json` (type module, `start: node --enable-source-maps index.mjs`).
- `app.ts` mounts `/api` first, then serves `dist/public` statics, then an SPA
  fallback that returns `index.html` ONLY for GET non-`/api` **extensionless**
  paths. **Why:** so missing assets (paths with a `.`) still 404 instead of
  returning HTML. **Edge case:** SPA routes containing a dot (e.g.
  `/u/john.doe`) would 404 — keep frontend routes dot-free.
- Frontend calls the API via relative `/api` (never `setBaseUrl`), so
  single-origin serving "just works".
- Root script `build:deploy` builds clash-zen then api-server with
  `DEPLOY_BUILD=1`.

## Hard constraints (don't regress)
- **DATA_DIR is the single source of truth** for runtime-writable paths
  (`src/lib/dataDir.ts` → `DATA_DIR`, `UPLOADS_DIR`). All upload routes + JSON
  settings libs import from it. **Why:** the old per-file
  `join(__dirname,"../../data")` resolved OUTSIDE the writable area once bundled
  standalone and crashed with `ENOENT mkdir /data/uploads/banners`. On external
  hosts set `DATA_DIR` to an absolute writable path; default keeps Replit/dev
  behavior.
- **PORT must default** (`index.ts`: `process.env.PORT ?? "3000"`), never throw
  if missing — hosts inject their own PORT.
- **build.mjs external-dep pinning:** only externals resolvable in the workspace
  tree get pinned in `dist/package.json`; unresolvable optional peers (e.g.
  pino-pretty's `supports-color: "*"`) are SKIPPED, not pinned to `"latest"`.
  **Why:** `"latest"` is non-deterministic across redeploys; the app runs fine
  without these optional peers (proven in dev, where they aren't installed).
- **DEPLOY_BUILD=1** makes a missing frontend `dist/public` a hard build
  failure (instead of a warning) so a deploy never silently ships an API-only
  bundle.

## External requirement
App REQUIRES PostgreSQL (drizzle + pg). Hosts without Postgres need an external
`DATABASE_URL` (Neon/Supabase). Replit object-storage routes use a local sidecar
and will NOT work off-Replit unless replaced/disabled.

## Validating a standalone build
Copy `dist/` to a dir OUTSIDE the workspace, `npm install --omit=dev`, then
`PORT=xxxx DATA_DIR=/abs/writable DATABASE_URL=... node index.mjs`. Expect: `/`
200 html, `/api/...` 200, SPA route 200 html, missing `.js` 404, uploads dirs
created under DATA_DIR.
