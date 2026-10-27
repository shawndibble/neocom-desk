import { db } from '@/db';

/** The active Character's name, kept on the scans they paste; null when nobody is signed in. */
export async function submitterName(characterId: number | null): Promise<string | null> {
  if (characterId === null) return null;
  return (await db.characters.get(characterId))?.name ?? null;
}
