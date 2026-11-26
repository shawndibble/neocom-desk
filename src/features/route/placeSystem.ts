import { resolvePlace } from '@/features/places';

export async function resolvePlaceSystemId(
  locationId: number,
  characterId: number | null
): Promise<number | null> {
  return (await resolvePlace({ locationId, characterId }, undefined, { name: false })).systemId;
}
