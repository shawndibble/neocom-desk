import { useEffect, useState } from 'react';
import type { BlueprintTypeInfo, ShareMarketGroup } from '@/engine/communities/shareTree';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import { loadBlueprints } from '@/sde/loadSde';

export type OwnedBlueprintTypes =
  | { status: 'loading' }
  | { status: 'needsReauth' }
  | { status: 'failed' }
  | { status: 'ready'; owned: BlueprintTypeInfo[]; groups: ShareMarketGroup[] };

/**
 * The blueprint types a Character owns, with names and market groups, for the
 * share picker. Reads the same ESI cache as the Industry pages (fetching when
 * it is empty); the picker sorts them into the market-group tree.
 */
export function useOwnedBlueprintTypes(characterId: number, enabled = true): OwnedBlueprintTypes {
  const [loaded, setLoaded] = useState<{ characterId: number; value: OwnedBlueprintTypes } | null>(
    null
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      let value: OwnedBlueprintTypes;
      try {
        const [result, groups, marketTypes, blueprintMap] = await Promise.all([
          loadCharacterBlueprints(characterId),
          loadMarketGroups(),
          loadMarketTypes(),
          loadBlueprints(),
        ]);
        if (result.needsReauth) {
          value = { status: 'needsReauth' };
        } else if (!result.cached) {
          value = { status: 'failed' };
        } else {
          const groupByType = new Map(marketTypes.map((type) => [type.typeId, type.marketGroupId]));
          const typeIds = [...new Set(result.cached.data.map((blueprint) => blueprint.type_id))];
          value = {
            status: 'ready',
            groups,
            owned: typeIds.map((typeId) => ({
              typeId,
              name: blueprintMap[typeId]?.name ?? `Type ${typeId}`,
              marketGroupId: groupByType.get(typeId) ?? null,
            })),
          };
        }
      } catch {
        value = { status: 'failed' };
      }
      if (!cancelled) setLoaded({ characterId, value });
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, enabled]);

  return loaded && loaded.characterId === characterId ? loaded.value : { status: 'loading' };
}
