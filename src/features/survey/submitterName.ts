import { db } from '@/db';

export async function submitterName(characterId: number | null): Promise<string | null> {
  if (characterId === null) return null;
  return (await db.characters.get(characterId))?.name ?? null;
}
