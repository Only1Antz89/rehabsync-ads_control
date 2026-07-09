import { getDb, adsAuditLogs } from '@/db';
import type { Session } from './auth';

/** Append an audit row for a mutation. Metadata must never contain secrets or password hashes. */
export async function recordAudit(
  session: Session,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await getDb().insert(adsAuditLogs).values({
      actorEmail: session.email,
      actorKind: session.kind,
      action,
      entityType,
      entityId,
      metadata,
    });
  } catch (err) {
    // Auditing must never take the primary action down — log and continue.
    console.error('[audit] failed to record', action, err);
  }
}
