import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Base directory for runtime-writable data (image uploads, JSON settings).
//
// Defaults to the path relative to the bundle (preserving the original
// behavior in development and on Replit). For standalone single-process
// deployments (e.g. Hostinger Node hosting) where the relative path may
// resolve outside the app's writable area, set the DATA_DIR env var to an
// absolute, writable path.
export const DATA_DIR =
  process.env.DATA_DIR && process.env.DATA_DIR.trim() !== ""
    ? process.env.DATA_DIR
    : join(__dirname, "../../data");

export const UPLOADS_DIR = join(DATA_DIR, "uploads");
