/**
 * Ads Centre migration runner — applies pending SQL files from `drizzle/` in filename order,
 * tracking them in `_ads_applied_migrations`.
 *
 * Adapted from the main repo's packages/db/src/deploy-migrate.ts with the baseline logic REMOVED
 * on purpose: this app shares an already-established database with the main platform, so
 * "the DB has tables" must never be read as "our migrations already ran". Every file in this
 * app's chain is idempotent, so running the full chain on a fresh tracking table is safe.
 *
 * Usage:
 *   pnpm db:deploy          strict — exits non-zero if migrations fail
 *   tsx deploy-migrate --soft   best-effort — logs and exits 0 on failure (used in the Vercel
 *                               build so a DB hiccup or a bad connection string can never block the
 *                               whole deploy; the app surfaces the DB problem per-route at runtime)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const MIGRATIONS_DIR = join(__dirname, '..', 'drizzle');
const TRACKING_TABLE = '_ads_applied_migrations';

/** Best-effort mode: never fail the caller (i.e. the build) on a migration error. */
const SOFT_FAIL = process.argv.includes('--soft');

/** Same resolution/fallback order as the app runtime (src/db/index.ts). */
function resolveDatabaseUrl(): string | undefined {
  return (
    process.env['REHABSYNC_DATABASE_URL'] ||
    process.env['DATABASE_URL'] ||
    process.env['POSTGRES_URL'] ||
    process.env['POSTGRES_PRISMA_URL'] ||
    process.env['POSTGRES_URL_NON_POOLING'] ||
    undefined
  );
}

/**
 * Host-based SSL, matching the app runtime. Managed Postgres (Supabase) refuses non-SSL
 * connections, so gate on the host rather than REHABSYNC_NODE_ENV — otherwise migrations run at
 * build time (where NODE_ENV may not be "production") would fail to connect.
 */
function sslOption(url: string): boolean | { rejectUnauthorized: boolean } {
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  } catch {
    // Unparseable URL — assume remote and require TLS.
  }
  return { rejectUnauthorized: process.env['REHABSYNC_DATABASE_SSL_REJECT_UNAUTHORIZED'] === 'true' };
}

function makeClient(connectionString: string) {
  return postgres(connectionString, {
    max: 1,
    prepare: false,
    connect_timeout: 15,
    ssl: sslOption(connectionString),
  });
}

async function main(): Promise<void> {
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    // No DB configured (e.g. a build before the database env var is set). Skip rather than fail the
    // build — the app surfaces a clear runtime error until the URL is configured.
    console.warn('[deploy-migrate] no database URL configured — skipping migrations.');
    return;
  }

  const sql = makeClient(connectionString);
  try {
    await sql.unsafe(
      `CREATE TABLE IF NOT EXISTS "${TRACKING_TABLE}" (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );`,
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const appliedRows = await sql<{ filename: string }[]>`SELECT filename FROM ${sql(TRACKING_TABLE)}`;
    const applied = new Set(appliedRows.map((r) => r.filename));

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log('[deploy-migrate] up to date — no pending migrations.');
      await sql.end();
      return;
    }

    console.log(`[deploy-migrate] applying ${pending.length} pending migration(s)...`);
    for (const file of pending) {
      const contents = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(contents);
        await tx.unsafe(`INSERT INTO "${TRACKING_TABLE}" (filename) VALUES ($1)`, [file]);
      });
      console.log(`[deploy-migrate]   ✓ ${file}`);
    }
    console.log('[deploy-migrate] done.');
    await sql.end();
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[deploy-migrate] FAILED: ${message}`);
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|SASL|password/i.test(message)) {
      console.error(
        '[deploy-migrate] Could not connect to the database. The connection string must be a full ' +
          'Supabase URL, e.g. postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres ' +
          '(or the pooler host on :6543) — copy the exact value the main RehabSync / Sales Centre projects use.',
      );
    }
    await sql.end({ timeout: 5 }).catch(() => undefined);
    if (SOFT_FAIL) {
      console.warn('[deploy-migrate] --soft set: continuing without applying migrations.');
      return;
    }
    process.exit(1);
  }
}

void main();
