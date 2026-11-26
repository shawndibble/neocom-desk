import { idSetKey } from '@/lib/idSetKey';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { db } from '@/db';
import type { BlueprintCopy } from '@/engine/communities/shareMode';
import { loadBlueprintLocation } from '@/features/bpcContracts/blueprintLocation';
import { KEY as ASSETS_KEY } from '@/features/assets/assets';
import { KEY as BLUEPRINTS_KEY } from '@/features/industry/data';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { loadPlacedBlueprints } from './blueprintPlacement';

export interface PlaceLabel {
  name: string | null;
  systemName: string | null;
}

export type BlueprintCopies =
  { status: 'loading' } | { status: 'unavailable' } | { status: 'ready'; copies: BlueprintCopy[] };

const LOADING: BlueprintCopies = { status: 'loading' };

export function useBlueprintCopies(characterId: number): BlueprintCopies {
  const stamp = useLiveQuery(async () => {
    const [blueprints, assets] = await Promise.all([
      db.esiCacheMeta.get([characterId, BLUEPRINTS_KEY]),
      db.esiCacheMeta.get([characterId, ASSETS_KEY]),
    ]);
    return `${blueprints?.fetchedAt ?? ''}:${assets?.fetchedAt ?? ''}`;
  }, [characterId]);
  const load = useCallback(async (): Promise<BlueprintCopies> => {
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
    } catch {}
    return value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, stamp]);
  const loaded = useKeyedLoad(String(characterId), load);
  return loaded.status === 'ready' ? loaded.data : LOADING;
}

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
