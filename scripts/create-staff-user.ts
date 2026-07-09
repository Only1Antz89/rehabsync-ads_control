/**
 * Bootstrap/ops CLI: create (or update the role of) a Ads Centre staff user.
 *
 *   pnpm staff:create -- --email jane@intaillium.com --name "Jane Doe" --password 'S3cret!' --role admin
 *
 * Platform super-admins never need this — they SSO in automatically. Use it to create the first
 * tool-level admin, or from CI to provision users; day-to-day invites happen in /admin/users.
 */
import postgres from 'postgres';
import { hashPassword } from '../src/lib/password';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name')?.trim();
  const password = arg('password');
  const role = arg('role') ?? 'user';

  if (!email || !name || !password || !['admin', 'user'].includes(role)) {
    console.error(
      'Usage: pnpm staff:create -- --email <email> --name <name> --password <password> --role admin|user',
    );
    process.exit(1);
  }

  const url = process.env['REHABSYNC_DATABASE_URL'];
  if (!url) {
    console.error('REHABSYNC_DATABASE_URL is not set');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });

  try {
    // Upsert doubles as a password/role reset for an existing user.
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO staff_users (email, password_hash, name, status)
      VALUES (${email}, ${hashPassword(password)}, ${name}, 'active')
      ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
            status = 'active', updated_at = now()
      RETURNING id`;

    await sql`
      INSERT INTO staff_tool_roles (user_id, tool, role)
      VALUES (${user!.id}, 'ads', ${role})
      ON CONFLICT (user_id, tool) DO UPDATE SET role = EXCLUDED.role, updated_at = now()`;

    console.log(`✓ ${email} is now a Ads Centre ${role} (user ${user!.id})`);
    await sql.end();
  } catch (err) {
    console.error('FAILED:', (err as Error).message);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  }
}

void main();
