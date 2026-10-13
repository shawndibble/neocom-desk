/**
 * A Character's choice of which blueprints to share with one Community
 * (issue #3599): the set of blueprint type ids, kept on this device in the
 * `settings` table under `communityShare:{characterId}:{communityId}`. It is
 * not a synced setting — the published copy is the Community's library
 * (pushed by `libraryPush.ts`) — and holds only type ids, never token data. No row means
 * nothing is shared.
 */
import { db } from '@/db';
import type { BlueprintShare, ShareChoice } from '@/engine/communities/shareMode';

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

/**
 * Remembers on this device that the Character shared a Skill Plan, so the
 * sweep refreshes it and the logout question is asked. Same prefix as the
 * Fittings marker, so it is counted by `hasShareSelections` and deleted with
 * the Character.
 */
export async function markPlansShared(characterId: number): Promise<void> {
  await db.settings.put({ key: `${PREFIX}${characterId}:plans`, value: true });
}

/** Run inside `removeCharacter`'s transaction: a removed Character leaves no choices behind. */
export async function deleteShareSelections(characterId: number): Promise<void> {
  await db.settings.where('key').startsWith(`${PREFIX}${characterId}:`).delete();
}

const allKeyFor = (characterId: number, communityId: string) =>
  `${keyFor(characterId, communityId)}:all`;

/**
 * The Character's full choice for a Community: share-all (its row holds the
 * blueprints stopped since) or the allowlist. A `:all` row under the same
 * prefix is counted by `hasShareSelections` and deleted with the Character.
 */
export async function loadShareChoice(
  characterId: number,
  communityId: string
): Promise<ShareChoice> {
  const all = await db.settings.get(allKeyFor(characterId, communityId));
  if (all) {
    const ids = Array.isArray(all.value) ? all.value : [];
    return { all: true, excluded: new Set(ids.filter((id): id is number => Number.isInteger(id))) };
  }
  return { all: false, allowed: await loadShareSelection(characterId, communityId) };
}

export async function saveShareChoice(
  characterId: number,
  communityId: string,
  choice: ShareChoice
): Promise<void> {
  const allKey = allKeyFor(characterId, communityId);
  if (choice.all) {
    await db.transaction('rw', db.settings, async () => {
      await db.settings.delete(keyFor(characterId, communityId));
      await db.settings.put({ key: allKey, value: [...choice.excluded].sort((a, b) => a - b) });
    });
    return;
  }
  await db.transaction('rw', db.settings, async () => {
    await db.settings.delete(allKey);
    await saveShareSelection(characterId, communityId, choice.allowed);
  });
}

const locationsKeyFor = (characterId: number, communityId: string) =>
  `${keyFor(characterId, communityId)}:locations`;

/**
 * The Character's blueprint choice plus its standing location rules: the
 * resolved station or structure ids whose blueprints are all shared. They stay
 * on this device (only the blueprints they match are published) in a
 * `:locations` row under the same prefix, so `hasShareSelections` counts a
 * location rule on its own and the Character's removal deletes it. The row is
 * dropped when the last rule stops, so an empty one never reads as sharing.
 */
export async function loadBlueprintShare(
  characterId: number,
  communityId: string
): Promise<BlueprintShare> {
  const [choice, row] = await Promise.all([
    loadShareChoice(characterId, communityId),
    db.settings.get(locationsKeyFor(characterId, communityId)),
  ]);
  const ids = Array.isArray(row?.value) ? row.value : [];
  return {
    choice,
    locations: new Set(ids.filter((id): id is number => Number.isInteger(id))),
  };
}

export async function saveBlueprintShare(
  characterId: number,
  communityId: string,
  share: BlueprintShare
): Promise<void> {
  const key = locationsKeyFor(characterId, communityId);
  await db.transaction('rw', db.settings, async () => {
    await saveShareChoice(characterId, communityId, share.choice);
    if (share.locations.size === 0) await db.settings.delete(key);
    else await db.settings.put({ key, value: [...share.locations].sort((a, b) => a - b) });
  });
}

const fittingsAllKeyFor = (characterId: number, communityId: string) =>
  `${keyFor(characterId, communityId)}:fittings-all`;

/**
 * Whether "share all my Fittings" is on for a Community (issue #3605), and if
 * so the Fittings (`source-key`) the Member has stopped since. Null is off.
 * Which Fittings are actually shared is the Community's own copy; this is only
 * the standing instruction that makes later saves follow it.
 */
export async function loadFittingsAll(
  characterId: number,
  communityId: string
): Promise<Set<string> | null> {
  const row = await db.settings.get(fittingsAllKeyFor(characterId, communityId));
  if (!row) return null;
  const ids = Array.isArray(row.value) ? row.value : [];
  return new Set(ids.filter((id): id is string => typeof id === 'string'));
}

export async function saveFittingsAll(
  characterId: number,
  communityId: string,
  excluded: ReadonlySet<string> | null
): Promise<void> {
  const key = fittingsAllKeyFor(characterId, communityId);
  if (excluded === null) await db.settings.delete(key);
  else await db.settings.put({ key, value: [...excluded].sort() });
}
