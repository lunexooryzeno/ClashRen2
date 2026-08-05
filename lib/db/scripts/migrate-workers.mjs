import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function normalizeConnectionString(raw) {
  try { new URL(raw); return raw; } catch {}
  const match = raw.match(/^(postgres(?:ql)?:\/\/)([\s\S]*)$/);
  if (!match) return raw;
  const [, scheme, rest] = match;
  const at = rest.lastIndexOf("@");
  if (at === -1) return raw;
  const userinfo = rest.slice(0, at);
  const hostpart = rest.slice(at + 1);
  const colon = userinfo.indexOf(":");
  const user = colon === -1 ? userinfo : userinfo.slice(0, colon);
  const password = colon === -1 ? "" : userinfo.slice(colon + 1);
  return `${scheme}${encodeURIComponent(user)}:${encodeURIComponent(password)}@${hostpart}`;
}

const connStr = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;
if (!connStr) { console.error("No DB URL"); process.exit(1); }

const { Pool } = pg;
const pool = new Pool({ connectionString: normalizeConnectionString(connStr) });

const sql = readFileSync(join(__dirname, "../drizzle/0002_quickmatch_workers.sql"), "utf8");
const stmts = sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);

for (const stmt of stmts) {
  try {
    await pool.query(stmt);
    console.log("OK:", stmt.slice(0, 80).replace(/\n/g, " "));
  } catch (e) {
    console.log("SKIP/ERR:", e.message.slice(0, 120));
  }
}

await pool.end();
console.log("Migration complete.");
