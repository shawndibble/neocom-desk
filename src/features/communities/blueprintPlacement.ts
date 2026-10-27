/**
 * Where each of a Character's blueprints is, for sharing by location: the one
 * resolver both the publish (`libraryPush.buildLibrary`) and the Blueprints
 * tab use, so a location the Member shares in the dialog is exactly the place
 * the published library matches on. A place is the resolved station or
 * structure (`resolveBlueprintPlacement`), never a container's id.
 */
import type { CharacterBlueprint } from '@/esi/endpoints';
import { loadCharacterAssets } from '@/features/assets/assets';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { resolveBlueprintPlacement } from '@/features/industry/ownedBlueprints';

export interface PlacedBlueprints {
  blueprints: CharacterBlueprint[];
  /** The copy's station or structure id; null in a container that cannot be traced. */
  placeIdOf: (blueprint: Pick<CharacterBlueprint, 'item_id'>) => number | null;
}

/**
 * The Character's cached blueprints with their places. Null when the
 * blueprints or the assets aren't cached (scope lost, never loaded): without
 * assets a place cannot be trusted, so nothing is published and the tab says
 * locations cannot be shared yet.
 */
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
