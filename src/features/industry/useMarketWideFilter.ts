import { useCallback, useMemo } from 'react';
import {
  filterFromParamValues,
  paramsPatchFromFilter,
  useRememberedUrlParams,
} from '@/lib/useUrlState';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useSalesShare } from './salesSharePref';
import { MARKET_WIDE_FILTER, type MarketWideFilterState } from './marketWideFilter';

/**
 * The panel's filter, held in the URL. The share assumption is a remembered
 * default behind its URL key (`salesSharePref.ts`): a link's `marketWide.share`
 * wins, only an edit is stored.
 */
export function useMarketWideFilter(): {
  filter: MarketWideFilterState;
  setFilter: (next: MarketWideFilterState) => void;
} {
  const rememberedShare = useSalesShare((state) => state.value);
  useHydratedStore(useSalesShare);
  const rememberedParams = useMemo(
    () => ({
      values: { [MARKET_WIDE_FILTER.fieldToParam.salesShare]: rememberedShare },
      remember: (patch: Record<string, unknown>) => {
        const next = patch[MARKET_WIDE_FILTER.fieldToParam.salesShare];
        if (typeof next === 'string') void useSalesShare.getState().setValue(next);
      },
    }),
    [rememberedShare]
  );
  const [params, setParams] = useRememberedUrlParams(MARKET_WIDE_FILTER.schema, rememberedParams);
  const filter = useMemo(
    () => filterFromParamValues<MarketWideFilterState>(params, MARKET_WIDE_FILTER.fieldToParam),
    [params]
  );
  const setFilter = useCallback(
    (next: MarketWideFilterState) =>
      setParams(paramsPatchFromFilter(next, MARKET_WIDE_FILTER.fieldToParam)),
    [setParams]
  );
  return { filter, setFilter };
}
