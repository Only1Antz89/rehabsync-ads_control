import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb, staffSessions, staffToolRoles, staffUsers } from '@/db';
import { getSession, isAdmin } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

const TOOL = 'ads' as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  if (session.userId === id) {
    return NextResponse.json({ error: 'You cannot change your own access' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { role?: string; status?: string } | null;
  const db = getDb();

  const [membership] = await db
    .select({ id: staffToolRoles.id })
    .from(staffToolRoles)
    .where(and(eq(staffToolRoles.userId, id), eq(staffToolRoles.tool, TOOL)))
    .limit(1);
  if (!membership) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (body?.role === 'admin' || body?.role === 'user') {
    await db
      .update(staffToolRoles)
      .set({ role: body.role, updatedAt: new Date() })
      .where(eq(staffToolRoles.id, membership.id));
    await recordAudit(session, 'user_role_changed', 'staff_user', id, { role: body.role });
  }

  if (body?.status === 'active' || body?.status === 'disabled') {
    await db
      .update(staffUsers)
      .set({ status: body.status, updatedAt: new Date() })
      .where(eq(staffUsers.id, id));
    if (body.status === 'disabled') {
      // Revoke live sessions immediately — a disabled user must not keep working on an old cookie.
      await db.delete(staffSessions).where(eq(staffSessions.userId, id));
    }
    await recordAudit(session, body.status === 'disabled' ? 'user_disabled' : 'user_enabled', 'staff_user', id, {});
  }

  return NextResponse.json({ ok: true });
}
