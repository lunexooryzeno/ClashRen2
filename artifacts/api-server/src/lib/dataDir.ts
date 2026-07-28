import { join } from "path";
import { existsSync } from "fs";

// Base directory for runtime-writable data (image uploads, JSON settings).
//
// Defaults to the workspace's shared runtime data directory. This is
// intentionally based on process.cwd(), not the bundled module location:
// production runs from api-server/dist while uploads may have been created
// by the source/dev server. For standalone deployments (e.g. Hostinger),
// set DATA_DIR to an absolute writable directory.
const configuredDataDir = process.env.DATA_DIR?.trim();
const dataDirCandidates = [
  join(process.cwd(), "artifacts", "data"),
  join(process.cwd(), "..", "data"),
  join(process.cwd(), "data"),
];

export const DATA_DIR = configuredDataDir
  || dataDirCandidates.find((candidate) => existsSync(candidate))
  || dataDirCandidates[0];

export const UPLOADS_DIR = join(DATA_DIR, "uploads");
