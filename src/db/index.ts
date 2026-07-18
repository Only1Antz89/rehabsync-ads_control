import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export * from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let client: postgres.Sql | null = null;
let db: Db | null = null;

/** Lazily-initialised singleton (survives Next.js dev hot reloads via globalThis). */
const globalStore = globalThis as unknown as { __adsDb?: Db; __adsSql?: postgres.Sql };

/**
 * TLS for the DB connection. Supabase (and any managed Postgres) requires it — connecting without
 * SSL is refused, which surfaced as opaque 500s on every query in production while migrations (which
 * DO set SSL, see scripts/deploy-migrate.ts) connected fine. Enabled for any non-local host so it
 * works regardless of REHABSYNC_NODE_ENV; the chain isn't verified by default (set
 * REHABSYNC_DATABASE_SSL_REJECT_UNAUTHORIZED=true to enforce), matching the migrate script.
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

/**
 * Resolve the Postgres connection string. `REHABSYNC_DATABASE_URL` is the platform convention, but
 * we fall back to the names Supabase's Vercel integration provisions so that linking the database
 * through that integration is sufficient — no separate REHABSYNC_DATABASE_URL needed. Without this,
 * a project that only has the integration's vars threw "REHABSYNC_DATABASE_URL is not set" on every
 * DB-backed route (an opaque 500).
 */
export function resolveDatabaseUrl(): string | undefined {
  return (
    process.env['REHABSYNC_DATABASE_URL'] ||
    process.env['DATABASE_URL'] ||
    process.env['POSTGRES_URL'] ||
    process.env['POSTGRES_PRISMA_URL'] ||
    process.env['POSTGRES_URL_NON_POOLING'] ||
    undefined
  );
}

export function getDb(): Db {
  if (globalStore.__adsDb) return globalStore.__adsDb;
  if (db) return db;

  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      'No database URL configured — set REHABSYNC_DATABASE_URL (or link the database via the Supabase/Vercel integration, which provides DATABASE_URL / POSTGRES_URL).',
    );
  }

  client = postgres(url, {
    max: 5,
    prepare: false, // Supabase pooler (transaction mode) compatibility
    connect_timeout: 10,
    ssl: sslOption(url),
  });
  db = drizzle(client, { schema });

  if (process.env.NODE_ENV !== 'production') {
    globalStore.__adsDb = db;
    globalStore.__adsSql = client;
  }
  return db;
}
