---
name: Media Upload Storage
description: Images (tournament, avatar, banner, dispute screenshots) are stored in the external PostgreSQL database, not on local disk.
---

## Rule
All image uploads must be stored in the `media_uploads` PostgreSQL table, not on local disk.

**Why:** Local disk uploads are lost when the server restarts, redeploys, or runs in a different environment (Replit dev vs. Replit published vs. Hostinger). The external DB (`EXTERNAL_DATABASE_URL`) is shared and persistent across every environment.

## How to apply
- Upload routes call `saveMediaUpload(mimeType, buffer)` from `artifacts/api-server/src/lib/mediaDb.ts` → returns a UUID
- Upload responses return `{ url: "/api/uploads/{uuid}" }`
- `GET /api/uploads/:id` (in `routes/media-uploads.ts`) streams bytes back from DB with long-lived cache headers
- The `media_uploads` table is auto-created at startup via `ensureMediaUploadsTable()` called in `index.ts` (idempotent — `CREATE TABLE IF NOT EXISTS`)
- Old disk-backed routes in `app.ts` (banner, avatar, tournament, dispute path handlers) are kept for backward compatibility with already-committed `.png` / `.jpg` files in git

## Files changed
- `lib/db/src/schema/media-uploads.ts` — Drizzle schema (bytea column via customType)
- `lib/db/src/schema/index.ts` — exports the new schema
- `artifacts/api-server/src/lib/mediaDb.ts` — `ensureMediaUploadsTable`, `saveMediaUpload`, `getMediaUpload`
- `artifacts/api-server/src/routes/media-uploads.ts` — `GET /api/uploads/:id` serve route
- `artifacts/api-server/src/routes/tournament-upload.ts` — saves to DB, returns `/api/uploads/{id}`
- `artifacts/api-server/src/routes/avatar-upload.ts` — saves to DB, returns `/api/uploads/{id}`
- `artifacts/api-server/src/routes/banner-upload.ts` — saves to DB, returns `/api/uploads/{id}`
- `artifacts/api-server/src/routes/slot-matches.ts` — dispute screenshot upload also saves to DB
- `artifacts/api-server/src/index.ts` — calls `ensureMediaUploadsTable()` on startup

## Production notes
- Admin must re-upload any images that are currently missing (lost in a previous deploy). Old `.webp` references in the DB that have no file on disk will 404 until re-uploaded.
- Production server (deployed app) needs a redeploy to pick up these changes.
