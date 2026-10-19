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

/**
 * The whole filter lives in the URL (ADR 0015), one `orders.*` key per
 * field — a deep link (an Overview Orders widget's row, `openOrdersHref`)
 * narrows it on arrival, and every chip, select, segment and search
 * keystroke from here on writes straight back to it, so a reload or a
 * shared link always reopens exactly what was on screen.
 *
 * `orders.locations` is the one exception: a bare `/market/orders` visit
 * (no query string at all — every app relaunch) falls back to the
 * device-local pick remembered in `openOrdersLocationFilterPref.ts`
 * (decision `20260922-221531` / ADR 0015), via `useRememberedUrlParams`
 * rather than the plain `useUrlFilter` every other field still reads
 * through. The URL always wins when it states the field; the stored value
 * is never mirrored back into it.
 */
export function useOpenOrdersFilterState(activeCharacterId: number | null) {
  const rememberedLocationIds = useOpenOrdersLocationFilterPref((state) => state.value);
  useHydratedStore(useOpenOrdersLocationFilterPref);
  // `orders.characters` remembers the This character / All characters pick the
  // same way the other pages do, then the synced Settings default. `'current'`
  // is `[activeCharacterId]` here, so it keeps following the active Character.
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
  // Rows derive from a deferred copy so a keystroke paints the box first
  // (`useUrlFilter`'s rule); the bar, chips and setter keep the immediate one.
  const rowsFilter = useDeferredValue(filter);
  function setFilter(next: OpenOrdersFilter) {
    setParams(paramsPatchFromFilter(next, OPEN_ORDERS_FIELD_TO_PARAM));
  }
  return { filter, rowsFilter, setFilter };
}
