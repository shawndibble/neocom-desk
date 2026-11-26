import type { CharacterBlueprint } from '@/esi/endpoints';
import { loadCharacterAssets } from '@/features/assets/assets';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { resolveBlueprintPlacement } from '@/features/industry/ownedBlueprints';

export interface PlacedBlueprints {
  blueprints: CharacterBlueprint[];
  placeIdOf: (blueprint: Pick<CharacterBlueprint, 'item_id'>) => number | null;
}

export async function loadPlacedBlueprints(characterId: number): Promise<PlacedBlueprints | null> {
  const [blueprints, assets] = await Promise.all([
    loadCharacterBlueprints(characterId),
    loadCharacterAssets(characterId),
  ]);
  if (!blueprints.cached || !assets.cached) return null;
  const assetsByItemId = new Map(assets.cached.data.map((asset) => [asset.item_id, asset]));
  const placeIds = new Map<number, number>();
  for (const blueprint of blueprints.cached.data) {
    const placement = resolveBlueprintPlacement(blueprint, assetsByItemId);
    if (placement.kind === 'place') placeIds.set(blueprint.item_id, placement.locationId);
  }
  return {
    blueprints: blueprints.cached.data,
    placeIdOf: (blueprint) => placeIds.get(blueprint.item_id) ?? null,
  };
}
