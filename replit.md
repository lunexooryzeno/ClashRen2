# Clash Ren — FF Tournament Platform

## Overview

Clash Ren is a mobile-focused web application for organizing Free Fire (FF) tournaments. It includes a user-facing tournament browser, leaderboard, diamond wallet, and an admin panel for managing tournaments and users.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/clash-zen)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Custom JWT (via jsonwebtoken), phone OTP via antcloud.co API
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Application Structure

### Frontend (artifacts/clash-zen)
- Glassmorphism dark theme (deep purple/violet gradient + frosted glass cards)
- Phone OTP registration flow (+91 default, 10-digit number)
- Bottom navigation: Home, Events, Leaderboard, History, Profile
- Admin panel at `/admin`
- Auth token stored in `localStorage` as `clash_ren_token`, wired via `setAuthTokenGetter`

### Backend (artifacts/api-server)
- Routes: `/api/auth/*`, `/api/users/*`, `/api/tournaments/*`, `/api/leaderboard`, `/api/history`, `/api/admin/*`
- JWT auth middleware in `src/middlewares/auth.ts`
- OTP proxied to antcloud.co API (`https://api.antcloud.co/api/phone/otp` and `/api/phone/verify`)

### Database (lib/db)
Tables: `users`, `tournaments`, `tournament_participants`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/clash-zen run dev` — run frontend locally

## Diamond Currency
1 diamond = ₹0.50. Users start with 100 diamonds. Entry fees are deducted on join. The first user to register automatically becomes admin.

## API Zod Config Note
The orval zod config uses `mode: "single"` with workspace at `lib/api-zod/src/generated`. The index at `lib/api-zod/src/index.ts` exports from `./generated/api/api`.
