import { NextResponse } from 'next/server';
import { adsSocialAccounts, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const rows = await getDb()
    .select({
      id: adsSocialAccounts.id,
      platform: adsSocialAccounts.platform,
      externalId: adsSocialAccounts.externalId,
      displayName: adsSocialAccounts.displayName,
      avatarUrl: adsSocialAccounts.avatarUrl,
      status: adsSocialAccounts.status,
      connectedBy: adsSocialAccounts.connectedBy,
      createdAt: adsSocialAccounts.createdAt,
    })
    .from(adsSocialAccounts)
    .orderBy(adsSocialAccounts.platform, adsSocialAccounts.displayName);

  // Token material is never selected, let alone returned.
  return NextResponse.json({ accounts: rows });
}
