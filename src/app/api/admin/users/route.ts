import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb, staffToolRoles, staffUsers } from '@/db';
import { getSession, isAdmin } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { recordAudit } from '@/lib/audit';

const TOOL = 'ads' as const;

async function requireAdmin() {
  const session = await getSession();
  if (!session || !isAdmin(session)) return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = getDb();
  const rows = await db
    .select({
      id: staffUsers.id,
      email: staffUsers.email,
      name: staffUsers.name,
      status: staffUsers.status,
      role: staffToolRoles.role,
      createdAt: staffUsers.createdAt,
    })
    .from(staffToolRoles)
    .innerJoin(staffUsers, eq(staffUsers.id, staffToolRoles.userId))
    .where(eq(staffToolRoles.tool, TOOL))
    .orderBy(staffUsers.name);

  return NextResponse.json({
    users: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  });
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    name?: string;
    password?: string;
    role?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  const name = body?.name?.trim();
  const password = body?.password;
  const role = body?.role === 'admin' ? 'admin' : 'user';

  if (!email || !name || !password) {
    return NextResponse.json({ error: 'name, email and password are required' }, { status: 400 });
  }
  if (password.length < 10) {
    return NextResponse.json({ error: 'Password must be at least 10 characters' }, { status: 400 });
  }

  const db = getDb();
  // One identity across tools: if the person already exists (e.g. an Ads Centre user), attach a
  // an ads role to the existing account rather than duplicating it. Their password is unchanged.
  const [existing] = await db.select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1);

  let userId: string;
  if (existing) {
    const [membership] = await db
      .select({ id: staffToolRoles.id })
      .from(staffToolRoles)
      .where(and(eq(staffToolRoles.userId, existing.id), eq(staffToolRoles.tool, TOOL)))
      .limit(1);
    if (membership) {
      return NextResponse.json({ error: 'That email already has Ads Centre access' }, { status: 409 });
    }
    userId = existing.id;
  } else {
    const [inserted] = await db
      .insert(staffUsers)
      .values({ email, name, passwordHash: hashPassword(password), status: 'active' })
      .returning({ id: staffUsers.id });
    userId = inserted!.id;
  }

  await db.insert(staffToolRoles).values({ userId, tool: TOOL, role });
  await recordAudit(session, 'user_invited', 'staff_user', userId, { email, role, existing: Boolean(existing) });

  return NextResponse.json({ id: userId, email, name, role, status: 'active' }, { status: 201 });
}
