import { pool } from "./index.js";

async function main() {
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS quickmatch_banned_until timestamp`,
  );
  console.log("Done: quickmatch_banned_until column ensured on users table.");
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
