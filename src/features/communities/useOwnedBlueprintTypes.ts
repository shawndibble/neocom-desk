import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import {
  blueprintGroupOfProductGroup,
  type BlueprintTypeInfo,
  type ShareMarketGroup,
} from '@/engine/communities/shareTree';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { loadMarketGroups, loadMarketTypes } from '@/sde/loadMarketSde';
import { loadBlueprints } from '@/sde/loadSde';

export type OwnedBlueprintTypes =
  | { status: 'loading' }
  | { status: 'needsReauth' }
  | { status: 'failed' }
  | {
      status: 'ready';
      owned: BlueprintTypeInfo[];
      groups: ShareMarketGroup[];
      learned: Map<number, number>;
    };

export function useOwnedBlueprintTypes(characterId: number, enabled = true): OwnedBlueprintTypes {
  const load = useCallback(async (): Promise<OwnedBlueprintTypes> => {
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
        const productGroupOf = (typeId: number) =>
          groupByType.get(blueprintMap[typeId]?.products[0]?.typeID ?? 0) ?? null;
        value = {
          status: 'ready',
          groups,
          learned: blueprintGroupOfProductGroup(
            Object.keys(blueprintMap).map((id) => ({
              typeId: Number(id),
              name: '',
              marketGroupId: groupByType.get(Number(id)) ?? null,
              productMarketGroupId: productGroupOf(Number(id)),
            })),
            groups
          ),
          owned: typeIds.map((typeId) => ({
            typeId,
            name: blueprintMap[typeId]?.name ?? `Type ${typeId}`,
            marketGroupId: groupByType.get(typeId) ?? null,
            productMarketGroupId: productGroupOf(typeId),
          })),
        };
      }
    } catch {
      value = { status: 'failed' };
    }
    return value;
  }, [characterId]);
  const loaded = useKeyedLoad(String(characterId), load, !enabled);
  return loaded.status === 'ready' ? loaded.data : { status: 'loading' };
}
