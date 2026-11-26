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

export async function changeDefaultHub(hub: HubId, localIds: readonly number[]): Promise<void> {
  const { defaultHub, map } = await settled();
  if (localIds.length <= 1) {
    const own = localIds.filter((id) => id in map);
    if (own.length > 0)
      await useHubByCharacter.getState().setValue(applyDefaultToAll(map, own, hub));
  } else if (hub !== defaultHub) {
    const needsPin = localIds.some((id) => !(id in map));
    if (needsPin) {
      await useHubByCharacter.getState().setValue(fillMissingHubs(map, localIds, defaultHub));
    }
  }
  await useDefaultMarketHub.getState().setValue(hub);
}

export async function setOneCharacterHub(characterId: number, hub: HubId): Promise<void> {
  const { map } = await settled();
  await useHubByCharacter.getState().setValue(setCharacterHub(map, characterId, hub));
}

export async function applyDefaultHubToAll(localIds: readonly number[]): Promise<void> {
  const { defaultHub, map } = await settled();
  await useHubByCharacter.getState().setValue(applyDefaultToAll(map, localIds, defaultHub));
}

export async function dropCharacterHubEntry(characterId: number): Promise<void> {
  const { map } = await settled();
  if (!(characterId in map)) return;
  await useHubByCharacter.getState().setValue(dropCharacterHub(map, characterId));
}
