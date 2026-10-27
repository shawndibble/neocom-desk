/**
 * The Order Book's filter bar — Jump Range, Security, Min quantity, NPC
 * stations only, Hide bait sells — and what each one implies for the book
 * (does the range fan out over regions, do the station-level filters apply).
 */
import { useCallback, useMemo } from 'react';
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

/**
 * The order book's filter bar as one `useUrlParams` group, so an edit that
 * touches several fields lands in one write rather than four
 * writers racing in one tick (see `navigateTo` in `useMarketBrowser.ts`). Each
 * field's stored default (`browserFilterSetting.ts`) sits behind the URL via
 * `useRememberedUrlParams`, so a filter set once survives a reload or a
 * fresh visit with no matching query string — same pattern as Location
 * Mode/Trade Hub in `useMarketBrowser.ts`.
 */
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

export interface BrowserFilters {
  /** The stored filter defaults have been read; a fetch before this would fire against the wrong ones. */
  hydrated: boolean;
  currentSystem: CurrentSystemState;
  jumpRangeFilter: JumpRangeFilter;
  rangeSet: boolean;
  /** A set, measurable Jump Range: the book spans every region in reach, not the header's hub or region. */
  rangeAcross: boolean;
  /** `rangeAcross`, or the range is still resolving and will be. */
  rangeReaches: boolean;
  /** The book spans stations (Region mode or a set range), so Security and NPC only apply. */
  spansStations: boolean;
  spaceKinds: ReadonlySet<SpaceKind>;
  minQuantity: number;
  npcOnly: boolean;
  hideBait: boolean;
  browserFilterValue: BrowserFilterValue;
  handleBrowserFiltersChange: (next: BrowserFilterValue) => void;
  activeFilterCount: number;
  jumpNoteShown: boolean;
}

/**
 * The Jump Range applies in every mode: set, it replaces the header's hub or
 * region with every region in reach. Security and NPC stations only apply
 * only once the book spans stations — Region mode, or a set range — since Hub
 * mode alone is one NPC station; otherwise they're neither shown nor applied,
 * whatever the URL says. Min quantity applies in both. All narrow the book
 * next to the station filter, see `orderBookView.ts`'s
 * `allowedSystems`/`minQuantity`/`npcStationIds`.
 */
export function useBrowserFilters(regionMode: boolean): BrowserFilters {
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
  // A set range fans out like All regions, over every region in reach — once
  // it can be measured. Unmeasurable (no origin, no graph), the book falls
  // back to the header's hub or region and the note says why.
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
  // Only what this mode shows counts: a Security filter left in the URL does
  // nothing on a one-station Hub book, so badging it would claim a filter that
  // isn't on.
  const activeFilterCount = [
    rangeSet,
    spansStations && spaceKinds.size !== SPACE_KINDS.length,
    minQuantity > 0,
    npcOnly,
    hideBait,
  ].filter(Boolean).length;
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
  // Only "can't measure" earns a line: a range that applies needs no caption.
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
    activeFilterCount,
    jumpNoteShown,
  };
}
