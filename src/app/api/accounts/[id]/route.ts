import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adsSocialAccounts, getDb } from '@/db';
import { getSession, isAdmin } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const [account] = await db.select().from(adsSocialAccounts).where(eq(adsSocialAccounts.id, id)).limit(1);
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // Disconnect = revoke our copy of the credentials; history (targets/metrics) stays intact.
  await db
    .update(adsSocialAccounts)
    .set({ status: 'revoked', accessTokenEnc: null, refreshTokenEnc: null, updatedAt: new Date() })
    .where(eq(adsSocialAccounts.id, id));

  await recordAudit(session, 'account_disconnected', 'ads_social_account', id, {
    platform: account.platform,
    displayName: account.displayName,
  });
  return NextResponse.json({ ok: true });
}
