import { useEffect, useMemo, useRef, useState } from 'react';
import type { BlueprintCopy } from '@/engine/communities/shareMode';
import { loadBlueprintLocation } from '@/features/bpcContracts/blueprintLocation';
import { loadCharacterAssets } from '@/features/character/assets';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { resolveBlueprintPlacement } from '@/features/industry/ownedBlueprints';
import { lookupSolarSystem } from '@/sde/solarSystems';

/** A station or structure's name and system; either is null when it cannot be read. */
export interface PlaceLabel {
  name: string | null;
  systemName: string | null;
}

/**
 * Every blueprint copy a Character owns with its resolved station or
 * structure (the same placement `libraryPush` matches location rules on),
 * for sharing by location. Null until loaded. A copy in a container that
 * cannot be traced has no place; without cached assets only hangar copies
 * are placed.
 */
export function useBlueprintCopies(characterId: number): BlueprintCopy[] | null {
  const [loaded, setLoaded] = useState<{ characterId: number; copies: BlueprintCopy[] } | null>(
    null
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let copies: BlueprintCopy[] = [];
      try {
        const [blueprints, assets] = await Promise.all([
          loadCharacterBlueprints(characterId),
          loadCharacterAssets(characterId),
        ]);
        const assetsByItemId = new Map(
          (assets.cached?.data ?? []).map((asset) => [asset.item_id, asset])
        );
        copies = (blueprints.cached?.data ?? []).map((blueprint) => {
          const placement = resolveBlueprintPlacement(blueprint, assetsByItemId);
          return {
            typeId: blueprint.type_id,
            placeId: placement.kind === 'place' ? placement.locationId : null,
          };
        });
      } catch {
        // No places: sharing by type still works.
      }
      if (!cancelled) setLoaded({ characterId, copies });
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);
  return loaded && loaded.characterId === characterId ? loaded.copies : null;
}

/**
 * Names the given places as they resolve, each asked for once, so one slow
 * structure never holds back the rest (as `OwnedBlueprintsPanel` does). A
 * place missing from the map is still loading.
 */
export function usePlaceLabels(
  characterId: number,
  placeIds: readonly number[]
): ReadonlyMap<number, PlaceLabel> {
  const [labels, setLabels] = useState<{ characterId: number; map: Map<number, PlaceLabel> }>({
    characterId,
    map: new Map(),
  });
  const requested = useRef<{ characterId: number; ids: Set<number> }>({
    characterId,
    ids: new Set(),
  });
  const key = useMemo(() => [...new Set(placeIds)].sort((a, b) => a - b).join(','), [placeIds]);

  // Requests outlive a change of `placeIds` (opening the dialog asks for more
  // places): only a change of Character or unmounting drops their answers.
  const current = useRef<number | null>(characterId);
  useEffect(() => {
    current.current = characterId;
    return () => {
      current.current = null;
    };
  }, [characterId]);

  useEffect(() => {
    if (requested.current.characterId !== characterId) {
      requested.current = { characterId, ids: new Set() };
    }
    const asked = requested.current.ids;
    for (const placeId of key === '' ? [] : key.split(',').map(Number)) {
      if (asked.has(placeId)) continue;
      asked.add(placeId);
      void loadBlueprintLocation(characterId, placeId)
        .then(async (location): Promise<PlaceLabel> => {
          const system =
            location.systemId == null ? null : await lookupSolarSystem(location.systemId);
          return { name: location.name, systemName: system?.name ?? null };
        })
        .catch((): PlaceLabel => ({ name: null, systemName: null }))
        .then((label) => {
          if (current.current !== characterId) return;
          setLabels((prev) => ({
            characterId,
            map: new Map(prev.characterId === characterId ? prev.map : []).set(placeId, label),
          }));
        });
    }
  }, [characterId, key]);

  return labels.characterId === characterId ? labels.map : new Map();
}
