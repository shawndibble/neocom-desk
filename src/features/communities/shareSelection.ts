/**
 * A Character's choice of which blueprints to share with one Community
 * (issue #3599): the set of blueprint type ids, kept on this device in the
 * `settings` table under `communityShare:{characterId}:{communityId}`. It is
 * not a synced setting — the published copy is the Community's library
 * (pushed by #3600) — and holds only type ids, never token data. No row means
 * nothing is shared.
 */
import { db } from '@/db';

const PREFIX = 'communityShare:';
const keyFor = (characterId: number, communityId: string) =>
  `${PREFIX}${characterId}:${communityId}`;

export async function loadShareSelection(
  characterId: number,
  communityId: string
): Promise<Set<number>> {
  const row = await db.settings.get(keyFor(characterId, communityId));
  const ids = Array.isArray(row?.value) ? row.value : [];
  return new Set(ids.filter((id): id is number => Number.isInteger(id)));
}

export async function saveShareSelection(
  characterId: number,
  communityId: string,
  selected: ReadonlySet<number>
): Promise<void> {
  const key = keyFor(characterId, communityId);
  if (selected.size === 0) await db.settings.delete(key);
  else await db.settings.put({ key, value: [...selected].sort((a, b) => a - b) });
}

/** Run inside `removeCharacter`'s transaction: a removed Character leaves no choices behind. */
export async function deleteShareSelections(characterId: number): Promise<void> {
  await db.settings.where('key').startsWith(`${PREFIX}${characterId}:`).delete();
}
