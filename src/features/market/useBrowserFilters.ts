import { useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { summarizeFilterValues, type ActiveFilter } from '@/components/ui';
import { formatCount } from '@/lib/formatCount';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useRememberedUrlParams, type RememberedDefaults } from '@/lib/useUrlState';
import { boolParam, enumParam, enumSetParam, intParam } from '@/lib/urlState';
import { JUMP_RANGES, DEFAULT_JUMP_RANGE, type JumpRange } from '@/engine/route/jumpRange';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import {
  useCurrentSystem,
  useJumpRangeFilter,
  type CurrentSystemState,
  type JumpRangeFilter,
} from '@/features/route/currentSystem';
import { useBrowserFilterSetting } from '@/features/market/browserFilterSetting';

const BROWSER_FILTER_PARAMS = {
  'browser.jumps': enumParam(JUMP_RANGES, DEFAULT_JUMP_RANGE),
  'browser.sec': enumSetParam(SPACE_KINDS),
  'browser.minQty': intParam(0, { min: 0 }),
  'browser.npcOnly': boolParam(),
  'browser.hideBait': boolParam(),
};

export interface BrowserFilterValue {
  jumps: JumpRange;
  sec: ReadonlySet<SpaceKind>;
  minQty: number;
  npcOnly: boolean;
  hideBait: boolean;
}

export function activeBrowserFilters(
  value: BrowserFilterValue,
  regionMode: boolean,
  t: TFunction
): ActiveFilter<BrowserFilterValue>[] {
  const rangeSet = value.jumps !== DEFAULT_JUMP_RANGE;
  const spansStations = regionMode || rangeSet;
  const active: ActiveFilter<BrowserFilterValue>[] = [];
  if (rangeSet)
    active.push({
      label: t('jumpRange.label'),
      value: t(`jumpRange.option.${value.jumps}`),
      clear: (v) => ({ ...v, jumps: DEFAULT_JUMP_RANGE }),
      inline: true,
    });
  if (spansStations && value.sec.size !== SPACE_KINDS.length) {
    const kinds = SPACE_KINDS.filter((kind) => value.sec.has(kind)).map((kind) =>
      t(`common.spaceOption.${kind}`)
    );
    active.push({
      label: t('market.filterSecurity'),
      value: summarizeFilterValues(kinds, t),
      clear: (v) => ({ ...v, sec: new Set(SPACE_KINDS) }),
    });
  }
  if (value.minQty > 0)
    active.push({
      label: t('market.filterMinQuantity'),
      value: t('filters.atLeast', { value: formatCount(value.minQty) }),
      clear: (v) => ({ ...v, minQty: 0 }),
    });
  if (spansStations && value.npcOnly)
    active.push({ label: t('market.filterNpcOnly'), clear: (v) => ({ ...v, npcOnly: false }) });
  if (value.hideBait)
    active.push({ label: t('market.filterHideBait'), clear: (v) => ({ ...v, hideBait: false }) });
  return active;
}

export interface BrowserFilters {
  hydrated: boolean;
  currentSystem: CurrentSystemState;
  jumpRangeFilter: JumpRangeFilter;
  rangeSet: boolean;
  rangeAcross: boolean;
  rangeReaches: boolean;
  spansStations: boolean;
  spaceKinds: ReadonlySet<SpaceKind>;
  minQuantity: number;
  npcOnly: boolean;
  hideBait: boolean;
  browserFilterValue: BrowserFilterValue;
  handleBrowserFiltersChange: (next: BrowserFilterValue) => void;
  activeFilters: ActiveFilter<BrowserFilterValue>[];
  activeFilterCount: number;
  jumpNoteShown: boolean;
}

export function useBrowserFilters(regionMode: boolean): BrowserFilters {
  const { t } = useTranslation();
  const browserFilterSettingValue = useBrowserFilterSetting((state) => state.value);
  const hydrated = useHydratedStore(useBrowserFilterSetting);
  const setBrowserFilterSettingValue = useBrowserFilterSetting((state) => state.setValue);
  const rememberedBrowserFilters: RememberedDefaults<typeof BROWSER_FILTER_PARAMS> = useMemo(
    () => ({
      values: {
        'browser.jumps': browserFilterSettingValue.jumps,
        'browser.sec': browserFilterSettingValue.sec,
        'browser.minQty': browserFilterSettingValue.minQty,
        'browser.npcOnly': browserFilterSettingValue.npcOnly,
        'browser.hideBait': browserFilterSettingValue.hideBait,
      },
      hydrated,
      remember: (patch) => {
        void setBrowserFilterSettingValue({
          jumps: patch['browser.jumps'] ?? browserFilterSettingValue.jumps,
          sec: patch['browser.sec'] ?? browserFilterSettingValue.sec,
          minQty: patch['browser.minQty'] ?? browserFilterSettingValue.minQty,
          npcOnly: patch['browser.npcOnly'] ?? browserFilterSettingValue.npcOnly,
          hideBait: patch['browser.hideBait'] ?? browserFilterSettingValue.hideBait,
        });
      },
    }),
    [browserFilterSettingValue, hydrated, setBrowserFilterSettingValue]
  );
  const [browserFilters, setBrowserFilters] = useRememberedUrlParams(
    BROWSER_FILTER_PARAMS,
    rememberedBrowserFilters
  );
  const jumpRange = browserFilters['browser.jumps'];
  const spaceKinds = browserFilters['browser.sec'];
  const minQuantity = browserFilters['browser.minQty'];
  const rangeSet = jumpRange !== DEFAULT_JUMP_RANGE;
  const spansStations = regionMode || rangeSet;
  const npcOnly = spansStations && browserFilters['browser.npcOnly'];
  const hideBait = browserFilters['browser.hideBait'];
  const currentSystem = useCurrentSystem();
  const jumpRangeFilter = useJumpRangeFilter(currentSystem, jumpRange);
  const rangeWaiting = rangeSet && jumpRangeFilter.status === 'loading';
  const rangeAcross = rangeSet && jumpRangeFilter.status === 'ready';
  const rangeReaches = rangeAcross || rangeWaiting;

  const browserFilterValue = useMemo<BrowserFilterValue>(
    () => ({
      jumps: jumpRange,
      sec: spaceKinds,
      minQty: minQuantity,
      npcOnly: browserFilters['browser.npcOnly'],
      hideBait,
    }),
    [jumpRange, spaceKinds, minQuantity, browserFilters, hideBait]
  );
  const activeFilters = useMemo(
    () => activeBrowserFilters(browserFilterValue, regionMode, t),
    [browserFilterValue, regionMode, t]
  );
  const activeFilterCount = activeFilters.length;
  const handleBrowserFiltersChange = useCallback(
    (next: BrowserFilterValue) => {
      setBrowserFilters({
        'browser.jumps': next.jumps,
        'browser.sec': next.sec,
        'browser.minQty': next.minQty,
        'browser.npcOnly': next.npcOnly,
        'browser.hideBait': next.hideBait,
      });
    },
    [setBrowserFilters]
  );
  const jumpNoteShown =
    rangeSet && (jumpRangeFilter.status === 'no-origin' || jumpRangeFilter.status === 'unknown');

  return {
    hydrated,
    currentSystem,
    jumpRangeFilter,
    rangeSet,
    rangeAcross,
    rangeReaches,
    spansStations,
    spaceKinds,
    minQuantity,
    npcOnly,
    hideBait,
    browserFilterValue,
    handleBrowserFiltersChange,
    activeFilters,
    activeFilterCount,
    jumpNoteShown,
  };
}
