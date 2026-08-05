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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Save image bytes to the DB.
 * @returns The opaque ID that becomes the URL path segment.
 */
export async function saveMediaUpload(
  mimeType: string,
  data: Buffer,
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO media_uploads (id, mime_type, data) VALUES ($1, $2, $3)",
    [id, mimeType, data],
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
): Promise<{ mimeType: string; data: Buffer } | null> {
  const result = await pool.query<{ mime_type: string; data: Buffer }>(
    "SELECT mime_type, data FROM media_uploads WHERE id = $1",
    [id],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return { mimeType: row.mime_type, data: row.data };
}
