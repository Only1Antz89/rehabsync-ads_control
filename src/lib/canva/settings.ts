import { eq } from 'drizzle-orm';
import { canvaSettings, getDb } from '@/db';

const ROW_ID = 1;

export type CanvaSettingsRow = typeof canvaSettings.$inferSelect;

export async function getCanvaSettings(): Promise<CanvaSettingsRow> {
  const db = getDb();
  const [row] = await db.select().from(canvaSettings).where(eq(canvaSettings.id, ROW_ID)).limit(1);
  if (row) return row;
  await db.insert(canvaSettings).values({ id: ROW_ID }).onConflictDoNothing();
  const [created] = await db.select().from(canvaSettings).where(eq(canvaSettings.id, ROW_ID)).limit(1);
  return created!;
}

export interface CanvaSettingsInput {
  draftsFolderId?: string | null;
  draftsFolderName?: string | null;
  readyFolderId?: string | null;
  readyFolderName?: string | null;
  publishedFolderId?: string | null;
  publishedFolderName?: string | null;
}

/** Save the folder mapping. Rejects re-using one Canva folder for two workflow stages. */
export async function saveCanvaSettings(
  input: CanvaSettingsInput,
  actorEmail: string,
): Promise<{ settings: CanvaSettingsRow } | { error: string }> {
  const ids = [input.draftsFolderId, input.readyFolderId, input.publishedFolderId]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
  if (new Set(ids).size !== ids.length) {
    return { error: 'Each workflow stage (Drafts, Ready, Published) must use a different Canva folder.' };
  }

  const db = getDb();
  await getCanvaSettings();
  await db
    .update(canvaSettings)
    .set({
      draftsFolderId: input.draftsFolderId?.trim() || null,
      draftsFolderName: input.draftsFolderName?.trim().slice(0, 300) || null,
      readyFolderId: input.readyFolderId?.trim() || null,
      readyFolderName: input.readyFolderName?.trim().slice(0, 300) || null,
      publishedFolderId: input.publishedFolderId?.trim() || null,
      publishedFolderName: input.publishedFolderName?.trim().slice(0, 300) || null,
      lastValidatedAt: null, // must re-test after a change
      updatedBy: actorEmail,
      updatedAt: new Date(),
    })
    .where(eq(canvaSettings.id, ROW_ID));
  return { settings: await getCanvaSettings() };
}

export async function markValidated(): Promise<void> {
  await getDb().update(canvaSettings).set({ lastValidatedAt: new Date() }).where(eq(canvaSettings.id, ROW_ID));
}
