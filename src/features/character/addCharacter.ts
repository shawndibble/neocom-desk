import { completeLogin } from '@/auth/session';
import type { CharacterRecord } from '@/db';
import { db } from '@/db';
import { backfillAccountWideData, scheduleSync } from '@/sync';
import { requestPersistenceOnce } from '@/lib/persistStorage';

export async function addCharacter(params: {
  code: string;
  state: string;
}): Promise<{ character: CharacterRecord; firstEver: boolean }> {
  const knownBefore = new Set(await db.characters.toCollection().primaryKeys());

  const character = await completeLogin(params);
  const firstEver = knownBefore.size === 0;
  if (firstEver) void requestPersistenceOnce().catch(() => undefined);
  if (knownBefore.has(character.characterId)) return { character, firstEver };

  try {
    if (await backfillAccountWideData(character.characterId)) {
      scheduleSync(character.characterId);
    }
  } catch {}
  return { character, firstEver };
}
