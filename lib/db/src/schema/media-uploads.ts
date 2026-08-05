import { pgTable, text, timestamp, customType } from "drizzle-orm/pg-core";

// Store raw image bytes directly in Postgres so uploads survive across
// every environment (dev, Replit published, Hostinger) without any
// external cloud-storage dependency.
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    // node-postgres may return a Buffer or a hex-encoded string
    if (typeof value === "string") return Buffer.from(value, "hex");
    return value as Buffer;
  },
});

export const mediaUploadsTable = pgTable("media_uploads", {
  id:        text("id").primaryKey(), // UUID assigned by the upload handler
  mimeType:  text("mime_type").notNull(),
  data:      bytea("data").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MediaUpload = typeof mediaUploadsTable.$inferSelect;
