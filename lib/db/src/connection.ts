// Resolve the Postgres connection string.
//
// Prefers EXTERNAL_DATABASE_URL when set so an external database (e.g. Supabase
// or Neon) can override Replit's runtime-managed built-in DATABASE_URL, which
// cannot be edited directly. Falls back to DATABASE_URL — the standard name
// used on other hosts (a local PC, Hostinger, etc.). To revert to Replit's
// built-in database, simply remove the EXTERNAL_DATABASE_URL secret.
//
// Some database passwords (e.g. a Supabase password) contain characters such as
// "%", "#", "?" or "/" that are not URL-safe. A raw connection string with such
// a password fails to parse (both `pg` and `drizzle-kit` parse it with the
// WHATWG URL parser). To keep the same connection string portable across every
// host, normalizeConnectionString() percent-encodes the user/password when the
// string would otherwise be rejected.
function normalizeConnectionString(raw: string): string {
  try {
    // Already a valid URL — use as-is.
    new URL(raw);
    return raw;
  } catch {
    // Fall through and attempt to repair an unparseable string.
  }

  const match = raw.match(/^(postgres(?:ql)?:\/\/)([\s\S]*)$/);
  if (!match) return raw;

  const scheme = match[1];
  const rest = match[2];

  // userinfo is everything before the last "@"; the host/db/query follow it.
  const at = rest.lastIndexOf("@");
  if (at === -1) return raw;

  const userinfo = rest.slice(0, at);
  const hostpart = rest.slice(at + 1);

  // userinfo is "user:password"; the password may itself contain ":".
  const colon = userinfo.indexOf(":");
  const user = colon === -1 ? userinfo : userinfo.slice(0, colon);
  const password = colon === -1 ? "" : userinfo.slice(colon + 1);

  return `${scheme}${encodeURIComponent(user)}:${encodeURIComponent(password)}@${hostpart}`;
}

export function getConnectionString(): string {
  const url =
    process.env.EXTERNAL_DATABASE_URL?.trim() || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "No database connection string found. Set DATABASE_URL (or EXTERNAL_DATABASE_URL) to a PostgreSQL connection string.",
    );
  }
  return normalizeConnectionString(url);
}
