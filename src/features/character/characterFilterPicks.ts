/**
 * The This character / All characters pick each page last held, remembered
 * across visits and app restarts. Device-local view state, like column and
 * sort prefs: one row, one entry per page, because "All characters" is a
 * deliberate, heavier view on Assets that must not carry over to the others.
 *
 * Order on opening a page: a filter in the URL, then this page's pick, then
 * the synced Settings default (`defaultCharacterFilter.ts`), which only seeds
 * a page that has no pick yet. Pages hand `useCharacterFilterPick` to
 * `useRememberedUrlParams`, which owns the URL-wins rule: a pick is written
 * only from a change to the control, never from a link.
 */
import { useCallback, useMemo } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { createLocalSetting } from '@/lib/useLocalSetting';
import type { RememberedDefaults, UrlParamSchema, UrlParamValues } from '@/lib/useUrlState';
import { useDefaultCharacterFilter } from './defaultCharacterFilter';
import { fromStoredCharacterFilterValue, type CharacterFilterValue } from './characterFilterValue';

export const CHARACTER_FILTER_PICKS_SETTING_KEY = 'characterFilterPicks';

export const CHARACTER_FILTER_PAGES = [
  'assets',
  'wallet',
  'jobs',
  'opportunities',
  'orders',
  'contracts',
  'transactions',
  'miningTax',
] as const;
export type CharacterFilterPage = (typeof CHARACTER_FILTER_PAGES)[number];

export type CharacterFilterPicks = Partial<Record<CharacterFilterPage, CharacterFilterValue>>;

export function parseCharacterFilterPicks(raw: unknown): CharacterFilterPicks | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const picks: CharacterFilterPicks = {};
  for (const page of CHARACTER_FILTER_PAGES) {
    const value = (raw as Record<string, unknown>)[page];
    if (value === 'current' || value === 'all') picks[page] = value;
  }
  return picks;
}

export function pickedCharacterFilter(
  picks: CharacterFilterPicks,
  page: CharacterFilterPage,
  settingsDefault: CharacterFilterValue
): CharacterFilterValue {
  return picks[page] ?? settingsDefault;
}

export function withCharacterFilterPick(
  picks: CharacterFilterPicks,
  page: CharacterFilterPage,
  value: CharacterFilterValue
): CharacterFilterPicks {
  return { ...picks, [page]: value };
}

export const useCharacterFilterPicks = createLocalSetting<CharacterFilterPicks>({
  key: CHARACTER_FILTER_PICKS_SETTING_KEY,
  defaultValue: {},
  parse: parseCharacterFilterPicks,
});

/**
 * The value `page` opens on when the URL names none, and how to remember an
 * edit. `firstVisit` replaces the Settings default for a page that has always
 * opened on its own value (Mining Tax on All) until the pilot picks.
 */
export function useCharacterFilterPick(
  page: CharacterFilterPage,
  firstVisit?: CharacterFilterValue
): {
  pick: CharacterFilterValue;
  remember: (value: CharacterFilterValue) => Promise<void>;
} {
  const picks = useCharacterFilterPicks((state) => state.value);
  const storedDefault = useDefaultCharacterFilter((state) => state.value);
  useHydratedStore(useCharacterFilterPicks, useDefaultCharacterFilter);

  const pick = pickedCharacterFilter(
    picks,
    page,
    firstVisit ?? fromStoredCharacterFilterValue(storedDefault)
  );
  const remember = useCallback(
    async (value: CharacterFilterValue) => {
      // Hydrate first: writing before the stored row is read would replace
      // every other page's pick with this one.
      const store = useCharacterFilterPicks.getState();
      await store.hydrate();
      const { value: picks, setValue } = useCharacterFilterPicks.getState();
      void setValue(withCharacterFilterPick(picks, page, value));
    },
    [page]
  );
  return { pick, remember };
}

/**
 * `useRememberedUrlParams`' stored side for a group whose `key` field is a
 * `characterFilterParam`.
 */
export function useRememberedCharacterFilter<S extends UrlParamSchema>(
  page: CharacterFilterPage,
  key: keyof S & string,
  firstVisit?: CharacterFilterValue
): RememberedDefaults<S> {
  const { pick, remember } = useCharacterFilterPick(page, firstVisit);
  return useMemo(
    () => ({
      values: { [key]: pick } as Partial<UrlParamValues<S>>,
      remember: (patch) => {
        const next = (patch as Record<string, unknown>)[key];
        if (next === 'current' || next === 'all') void remember(next);
      },
    }),
    [key, pick, remember]
  );
}
