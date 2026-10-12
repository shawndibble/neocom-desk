/**
 * A Character's choice of which blueprints to share with one Community
 * (issue #3599): the set of blueprint type ids, kept on this device in the
 * `settings` table under `communityShare:{characterId}:{communityId}`. It is
 * not a synced setting — the published copy is the Community's library
 * (pushed by `libraryPush.ts`) — and holds only type ids, never token data. No row means
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

/** Whether any of these Characters shares anything: decides if a logout asks about shared blueprints. */
export async function hasShareSelections(characterIds: readonly number[]): Promise<boolean> {
  for (const characterId of characterIds) {
    const found = await db.settings.where('key').startsWith(`${PREFIX}${characterId}:`).count();
    if (found > 0) return true;
  }
  return false;
}

/**
 * Remembers on this device that the Character shared a Fitting (issue #3605),
 * so the logout question is asked for it too. It lives under the same
 * `communityShare:{characterId}:` prefix, so it is counted by
 * `hasShareSelections` and deleted with the Character.
 */
export async function markFittingsShared(characterId: number): Promise<void> {
  await db.settings.put({ key: `${PREFIX}${characterId}:fittings`, value: true });
}

/** Run inside `removeCharacter`'s transaction: a removed Character leaves no choices behind. */
export async function deleteShareSelections(characterId: number): Promise<void> {
  await db.settings.where('key').startsWith(`${PREFIX}${characterId}:`).delete();
}
