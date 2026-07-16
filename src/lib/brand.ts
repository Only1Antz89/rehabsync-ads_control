import { eq } from 'drizzle-orm';
import { adsBrandKit, getDb } from '@/db';

export interface BrandKit {
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  voice: string | null;
  hashtags: string[];
  boilerplate: string | null;
  updatedBy: string | null;
  updatedAt: Date;
}

const ROW_ID = 1;

export async function getBrandKit(): Promise<BrandKit> {
  const db = getDb();
  const [row] = await db.select().from(adsBrandKit).where(eq(adsBrandKit.id, ROW_ID)).limit(1);
  if (row) return row;
  await db.insert(adsBrandKit).values({ id: ROW_ID }).onConflictDoNothing();
  const [created] = await db.select().from(adsBrandKit).where(eq(adsBrandKit.id, ROW_ID)).limit(1);
  return created!;
}

const clampColor = (v: string | undefined | null): string | null => {
  const s = (v ?? '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : null;
};

export async function setBrandKit(
  input: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    logoUrl?: string | null;
    voice?: string | null;
    hashtags?: string[];
    boilerplate?: string | null;
  },
  actorEmail: string,
): Promise<BrandKit> {
  const db = getDb();
  await getBrandKit();
  const values: Partial<typeof adsBrandKit.$inferInsert> = { updatedBy: actorEmail, updatedAt: new Date() };
  if (input.primaryColor !== undefined) values.primaryColor = clampColor(input.primaryColor);
  if (input.secondaryColor !== undefined) values.secondaryColor = clampColor(input.secondaryColor);
  if (input.logoUrl !== undefined) values.logoUrl = input.logoUrl?.trim().slice(0, 1000) || null;
  if (input.voice !== undefined) values.voice = input.voice?.trim().slice(0, 2000) || null;
  if (input.boilerplate !== undefined) values.boilerplate = input.boilerplate?.trim().slice(0, 2000) || null;
  if (Array.isArray(input.hashtags)) {
    values.hashtags = [...new Set(input.hashtags.map((t) => t.trim().replace(/^#*/, '#')).filter((t) => t.length > 1))].slice(0, 40);
  }
  await db.update(adsBrandKit).set(values).where(eq(adsBrandKit.id, ROW_ID));
  return getBrandKit();
}
