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

export async function hasShareSelections(characterIds: readonly number[]): Promise<boolean> {
  for (const characterId of characterIds) {
    const found = await db.settings.where('key').startsWith(`${PREFIX}${characterId}:`).count();
    if (found > 0) return true;
  }
  return false;
}

export async function markFittingsShared(characterId: number): Promise<void> {
  await db.settings.put({ key: `${PREFIX}${characterId}:fittings`, value: true });
}

export async function markPlansShared(characterId: number): Promise<void> {
  await db.settings.put({ key: `${PREFIX}${characterId}:plans`, value: true });
}

export async function deleteShareSelections(characterId: number): Promise<void> {
  await db.settings.where('key').startsWith(`${PREFIX}${characterId}:`).delete();
}

const allKeyFor = (characterId: number, communityId: string) =>
  `${keyFor(characterId, communityId)}:all`;

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
