/**
 * Database-backed media storage.
 *
 * Images are stored as binary (bytea) rows in the `media_uploads` table so
 * they persist across every environment — dev, Replit published, Hostinger —
 * without any external cloud-storage dependency.
 */
import { randomUUID } from "crypto";
import { pool } from "@workspace/db";

/** Ensure the table exists. Called once at server startup. */
export async function ensureMediaUploadsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_uploads (
      id         TEXT        PRIMARY KEY,
      mime_type  TEXT        NOT NULL,
      data       BYTEA       NOT NULL,
      access_scope TEXT     NOT NULL DEFAULT 'public',
      owner_user_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE media_uploads
      ADD COLUMN IF NOT EXISTS access_scope TEXT NOT NULL DEFAULT 'public',
      ADD COLUMN IF NOT EXISTS owner_user_id INTEGER
  `);
}

/**
 * Save image bytes to the DB.
 * @returns The opaque ID that becomes the URL path segment.
 */
export async function saveMediaUpload(
  mimeType: string,
  data: Buffer,
  options: { accessScope?: "public" | "private"; ownerUserId?: number | null } = {},
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO media_uploads (id, mime_type, data, access_scope, owner_user_id) VALUES ($1, $2, $3, $4, $5)",
    [id, mimeType, data, options.accessScope ?? "public", options.ownerUserId ?? null],
  );
  return id;
}

/**
 * Delete an uploaded image by ID.
 * No-ops silently when the ID does not exist.
 */
export async function deleteMediaUpload(id: string): Promise<void> {
  await pool.query("DELETE FROM media_uploads WHERE id = $1", [id]);
}

/**
 * Retrieve an uploaded image.
 * Returns null when the ID is not found.
 */
export async function getMediaUpload(
  id: string,
): Promise<{ mimeType: string; data: Buffer; accessScope: "public" | "private"; ownerUserId: number | null } | null> {
  const result = await pool.query<{
    mime_type: string;
    data: Buffer;
    access_scope: "public" | "private";
    owner_user_id: number | null;
  }>(
    "SELECT mime_type, data, access_scope, owner_user_id FROM media_uploads WHERE id = $1",
    [id],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return {
    mimeType: row.mime_type,
    data: row.data,
    accessScope: row.access_scope,
    ownerUserId: row.owner_user_id,
  };
}
