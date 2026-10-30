/**
 * The writes behind Settings' Trade Hub controls and Character removal (issue
 * #5593). Each reads the settled stores, edits with the pure helpers in
 * `characterHubs.ts` and writes once. Entries for Characters this device does
 * not hold are never touched: the map is one synced value another device also
 * edits.
 */
import {
  applyDefaultToAll,
  dropCharacterHub,
  fillMissingHubs,
  setCharacterHub,
  useHubByCharacter,
  type HubId,
} from './characterHubs';
import { useDefaultMarketHub } from './hub';

async function settled() {
  await Promise.all([
    useDefaultMarketHub.getState().hydrate(),
    useHubByCharacter.getState().hydrate(),
  ]);
  return {
    defaultHub: useDefaultMarketHub.getState().value,
    map: useHubByCharacter.getState().value,
  };
}

/**
 * The "Default Trade Hub for new characters" select. With several Characters a
 * change must not move the ones already on this device, so those with no entry
 * are pinned at the old default first. With one Character there is no
 * per-character control, so the default is that Character's hub too.
 */
export async function changeDefaultHub(hub: HubId, localIds: readonly number[]): Promise<void> {
  const { defaultHub, map } = await settled();
  if (localIds.length <= 1) {
    const own = localIds.filter((id) => id in map);
    if (own.length > 0)
      await useHubByCharacter.getState().setValue(applyDefaultToAll(map, own, hub));
  } else if (hub !== defaultHub) {
    const filled = fillMissingHubs(map, localIds, defaultHub);
    if (localIds.some((id) => !(id in map))) await useHubByCharacter.getState().setValue(filled);
  }
  await useDefaultMarketHub.getState().setValue(hub);
}

export async function setOneCharacterHub(characterId: number, hub: HubId): Promise<void> {
  const { map } = await settled();
  await useHubByCharacter.getState().setValue(setCharacterHub(map, characterId, hub));
}

/** "Apply default to all": every Character on this device takes the default. */
export async function applyDefaultHubToAll(localIds: readonly number[]): Promise<void> {
  const { defaultHub, map } = await settled();
  await useHubByCharacter.getState().setValue(applyDefaultToAll(map, localIds, defaultHub));
}

/** A removed Character's entry goes; a missing one writes nothing. */
export async function dropCharacterHubEntry(characterId: number): Promise<void> {
  const { map } = await settled();
  if (!(characterId in map)) return;
  await useHubByCharacter.getState().setValue(dropCharacterHub(map, characterId));
}
