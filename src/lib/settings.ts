import { eq } from 'drizzle-orm';
import { adsSettings, getDb } from '@/db';

export type AdsSettings = typeof adsSettings.$inferSelect;

const DEFAULTS: Omit<AdsSettings, 'updatedBy' | 'updatedAt'> = {
  id: 1,
  requireApproval: false,
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  timezone: 'Europe/London',
};

/** The single settings row (id=1); created by the migration, but tolerate its absence. */
export async function getSettings(): Promise<AdsSettings> {
  const db = getDb();
  const [row] = await db.select().from(adsSettings).where(eq(adsSettings.id, 1)).limit(1);
  return row ?? { ...DEFAULTS, updatedBy: null, updatedAt: new Date(0) };
}

export interface SettingsUpdate {
  requireApproval?: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  timezone?: string;
}

export async function updateSettings(update: SettingsUpdate, updatedBy: string): Promise<AdsSettings> {
  const db = getDb();
  const values = {
    id: 1 as const,
    ...(update.requireApproval !== undefined ? { requireApproval: update.requireApproval } : {}),
    ...(update.utmSource !== undefined ? { utmSource: update.utmSource.trim().slice(0, 80) } : {}),
    ...(update.utmMedium !== undefined ? { utmMedium: update.utmMedium.trim().slice(0, 80) } : {}),
    ...(update.utmCampaign !== undefined ? { utmCampaign: update.utmCampaign.trim().slice(0, 80) } : {}),
    ...(update.timezone !== undefined ? { timezone: update.timezone.trim().slice(0, 60) } : {}),
    updatedBy,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(adsSettings)
    .values(values)
    .onConflictDoUpdate({ target: adsSettings.id, set: values })
    .returning();
  return row!;
}
