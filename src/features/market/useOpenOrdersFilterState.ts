import { useDeferredValue, useMemo } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import {
  filterFromParamValues,
  paramsPatchFromFilter,
  useRememberedUrlParams,
  type UrlParamValues,
} from '@/lib/useUrlState';
import { useCharacterFilterPick } from '@/features/character/characterFilterPicks';
import { useOpenOrdersLocationFilterPref } from './openOrdersLocationFilterPref';
import {
  OPEN_ORDERS_FIELD_TO_PARAM,
  OPEN_ORDERS_FILTER_PARAMS,
  type OpenOrdersFilter,
} from './openOrdersFilter';

export function useOpenOrdersFilterState(activeCharacterId: number | null) {
  const rememberedLocationIds = useOpenOrdersLocationFilterPref((state) => state.value);
  useHydratedStore(useOpenOrdersLocationFilterPref);
  const { pick: rememberedCharacterPick, remember: rememberCharacterPick } =
    useCharacterFilterPick('orders');
  const rememberedCharacterIds = useMemo<readonly number[]>(
    () =>
      rememberedCharacterPick === 'current' && activeCharacterId !== null
        ? [activeCharacterId]
        : [],
    [rememberedCharacterPick, activeCharacterId]
  );
  const remembered = useMemo(
    () => ({
      values: {
        'orders.locations': rememberedLocationIds,
        'orders.characters': rememberedCharacterIds,
      },
      remember: (patch: Partial<UrlParamValues<typeof OPEN_ORDERS_FILTER_PARAMS>>) => {
        if ('orders.locations' in patch) {
          void useOpenOrdersLocationFilterPref
            .getState()
            .setValue(patch['orders.locations'] as readonly number[]);
        }
        const characterIds = patch['orders.characters'] as readonly number[] | undefined;
        if (characterIds) {
          void rememberCharacterPick(
            characterIds.length === 1 && characterIds[0] === activeCharacterId ? 'current' : 'all'
          );
        }
      },
    }),
    [rememberedLocationIds, rememberedCharacterIds, rememberCharacterPick, activeCharacterId]
  );
  const [params, setParams] = useRememberedUrlParams(OPEN_ORDERS_FILTER_PARAMS, remembered);
  const filter = useMemo(
    () => filterFromParamValues<OpenOrdersFilter>(params, OPEN_ORDERS_FIELD_TO_PARAM),
    [params]
  );
  const rowsFilter = useDeferredValue(filter);
  function setFilter(next: OpenOrdersFilter) {
    setParams(paramsPatchFromFilter(next, OPEN_ORDERS_FIELD_TO_PARAM));
  }
  return { filter, rowsFilter, setFilter };
}
