import { idSetKey } from '@/lib/idSetKey';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/db';
import type { BlueprintCopy } from '@/engine/communities/shareMode';
import { loadBlueprintLocation } from '@/features/bpcContracts/blueprintLocation';
import { KEY as ASSETS_KEY } from '@/features/assets/assets';
import { KEY as BLUEPRINTS_KEY } from '@/features/industry/data';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { loadPlacedBlueprints } from './blueprintPlacement';

/** A station or structure's name and system; either is null when it cannot be read. */
export interface PlaceLabel {
  name: string | null;
  systemName: string | null;
}

/**
 * The Character's blueprint copies with their places, or why there are none:
 * `unavailable` when the blueprints or assets aren't cached, which is also
 * when a publish sends nothing, so locations cannot be shared yet.
 */
export type BlueprintCopies =
  { status: 'loading' } | { status: 'unavailable' } | { status: 'ready'; copies: BlueprintCopy[] };

const LOADING: BlueprintCopies = { status: 'loading' };

/**
 * Every blueprint copy a Character owns with its resolved station or
 * structure, through the same resolver the publish uses
 * (`loadPlacedBlueprints`). Reloads when the blueprint or asset cache is
 * refreshed, so counts and "via" labels follow blueprints that move; the last
 * answer stays on screen meanwhile.
 */
export function useBlueprintCopies(characterId: number): BlueprintCopies {
  // A refresh of either cache row rewrites its meta's `fetchedAt`.
  const stamp = useLiveQuery(async () => {
    const [blueprints, assets] = await Promise.all([
      db.esiCacheMeta.get([characterId, BLUEPRINTS_KEY]),
      db.esiCacheMeta.get([characterId, ASSETS_KEY]),
    ]);
    return `${blueprints?.fetchedAt ?? ''}:${assets?.fetchedAt ?? ''}`;
  }, [characterId]);
  const [loaded, setLoaded] = useState<{ characterId: number; value: BlueprintCopies } | null>(
    null
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let value: BlueprintCopies = { status: 'unavailable' };
      try {
        const placed = await loadPlacedBlueprints(characterId);
        if (placed) {
          value = {
            status: 'ready',
            copies: placed.blueprints.map((blueprint) => ({
              typeId: blueprint.type_id,
              placeId: placed.placeIdOf(blueprint),
            })),
          };
        }
      } catch {
        // Unavailable: sharing by type still works.
      }
      if (!cancelled) setLoaded({ characterId, value });
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, stamp]);
  return loaded && loaded.characterId === characterId ? loaded.value : LOADING;
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
  const key = useMemo(() => idSetKey(placeIds), [placeIds]);

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
