import { loadCharacterSolarSystemId } from '@/features/character/location';
import { lookupSolarSystem } from '@/sde/solarSystems';

export async function loadCharacterRegionId(characterId: number): Promise<number | null> {
  const systemId = await loadCharacterSolarSystemId(characterId);
  if (systemId === null) return null;
  const system = await lookupSolarSystem(systemId);
  return system?.regionId ?? null;
}
