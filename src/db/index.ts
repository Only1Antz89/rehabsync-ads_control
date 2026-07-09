import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export * from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let client: postgres.Sql | null = null;
let db: Db | null = null;

/** Lazily-initialised singleton (survives Next.js dev hot reloads via globalThis). */
const globalStore = globalThis as unknown as { __adsDb?: Db; __adsSql?: postgres.Sql };

export function getDb(): Db {
  if (globalStore.__adsDb) return globalStore.__adsDb;
  if (db) return db;

  const url = process.env['REHABSYNC_DATABASE_URL'];
  if (!url) {
    throw new Error('REHABSYNC_DATABASE_URL is not set');
  }

  client = postgres(url, {
    max: 5,
    prepare: false, // Supabase pooler (transaction mode) compatibility
    connect_timeout: 10,
  });
  db = drizzle(client, { schema });

  if (process.env.NODE_ENV !== 'production') {
    globalStore.__adsDb = db;
    globalStore.__adsSql = client;
  }
  return db;
}
