/**
 * Ads Centre migration runner — applies pending SQL files from `drizzle/` in filename order,
 * tracking them in `_ads_applied_migrations`.
 *
 * Adapted from the main repo's packages/db/src/deploy-migrate.ts with the baseline logic REMOVED
 * on purpose: this app shares an already-established database with the main platform, so
 * "the DB has tables" must never be read as "our migrations already ran". Every file in this
 * app's chain is idempotent, so running the full chain on a fresh tracking table is safe.
 *
 * Usage: pnpm db:deploy   (requires REHABSYNC_DATABASE_URL)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const MIGRATIONS_DIR = join(__dirname, '..', 'drizzle');
const TRACKING_TABLE = '_ads_applied_migrations';

function makeClient() {
  const connectionString = process.env['REHABSYNC_DATABASE_URL'];
  if (!connectionString) {
    console.error('[deploy-migrate] REHABSYNC_DATABASE_URL is not set');
    process.exit(1);
  }
  const rejectUnauthorized = process.env['REHABSYNC_DATABASE_SSL_REJECT_UNAUTHORIZED'] === 'true';
  return postgres(connectionString, {
    max: 1,
    prepare: false,
    connect_timeout: 15,
    ssl: process.env['REHABSYNC_NODE_ENV'] === 'production' ? { rejectUnauthorized } : false,
  });
}

async function main(): Promise<void> {
  const sql = makeClient();
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
    console.error(`[deploy-migrate] FAILED: ${(err as Error).message}`);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  }
}

void main();
