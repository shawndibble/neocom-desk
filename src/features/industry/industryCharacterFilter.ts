/**
 * Industry's one Character filter (decision 20261022-123837, "One picker per
 * page"). Active Jobs and Build Opportunities each had their own picker
 * (`jobs.chars`, `opps.chars`), so the jobs list and the ranked/owned
 * blueprints could name different pilots on one page. Now the picker rides in
 * the Industry `PageHeader`'s `scope` and both panels read this one value.
 *
 * Every consumer calls `useIndustryCharacterFilter` itself rather than taking
 * the value as a prop: the URL and the remembered pick are shared state, so
 * the header picker, Active Jobs and Opportunities agree without threading a
 * value through `IndustryHeader`, the three routes that mount it, and the
 * Opportunities tab.
 *
 * Order on opening a page: `industry.chars` in the URL, then the two old
 * params (an old link or bookmark still opens on what it named), then the
 * remembered `industry` pick, then the old `jobs` / `opportunities` picks,
 * then the synced Settings default. Both old pickers already read that same
 * Settings default, so there is one default to keep, not two to reconcile.
 *
 * Not `chars`: that name is the Assets/Wallet filter's, and
 * `viewedCharacter.ts` still reads it as a legacy viewed-Character param.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { create } from 'zustand';
import { useUrlParams } from '@/lib/useUrlState';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import {
  useCharacterFilterPick,
  useCharacterFilterPicks,
  type CharacterFilterPicks,
} from '@/features/character/characterFilterPicks';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import {
  fromStoredCharacterFilterValue,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';

export const INDUSTRY_CHARACTER_PARAM = 'industry.chars';
/** Active Jobs' and Opportunities' params before the merge, in precedence order. */
const LEGACY_PARAMS = ['jobs.chars', 'opps.chars'] as const;

const legacyCodec = characterFilterParam('current');

/**
 * The value a change just chose, keyed to the location entry it was chosen
 * on. A URL write lands in a transition, so for a frame or a slow navigation
 * the location still holds the old value; every consumer (the trigger,
 * Active Jobs, Opportunities) shows this one instead until the location
 * moves to a new entry (the write, or any other navigation).
 */
const usePendingIndustryFilter = create<{
  pending: { value: CharacterFilterValue; locationKey: string } | null;
}>(() => ({ pending: null }));

/** The filter a link names, or null when it names none. */
export function linkedIndustryCharacterFilter(search: string): CharacterFilterValue | null {
  const params = new URLSearchParams(search);
  for (const key of [INDUSTRY_CHARACTER_PARAM, ...LEGACY_PARAMS]) {
    if (params.has(key)) return legacyCodec.parse(params.get(key));
  }
  return null;
}

/** The value Industry opens on when the URL names none. */
export function industryCharacterPick(
  picks: CharacterFilterPicks,
  settingsDefault: CharacterFilterValue
): CharacterFilterValue {
  return picks.industry ?? picks.jobs ?? picks.opportunities ?? settingsDefault;
}

export function useIndustryCharacterFilter(): [
  CharacterFilterValue,
  (next: CharacterFilterValue) => void,
] {
  const { search, key: locationKey } = useLocation();
  const picks = useCharacterFilterPicks((state) => state.value);
  const storedDefault = useDefaultCharacterFilter((state) => state.value);
  useHydratedStore(useCharacterFilterPicks, useDefaultCharacterFilter);
  const { remember } = useCharacterFilterPick('industry');
  const pick = industryCharacterPick(picks, fromStoredCharacterFilterValue(storedDefault));

  // The remembered pick is what an absent `industry.chars` means, so it is
  // dropped rather than written (`useRememberedUrlParams`' rule); `current`
  // is the old params' default, so writing it drops them.
  const schema = useMemo(
    () => ({
      [INDUSTRY_CHARACTER_PARAM]: characterFilterParam(pick),
      'jobs.chars': legacyCodec,
      'opps.chars': legacyCodec,
    }),
    [pick]
  );
  const [, setParams] = useUrlParams(schema);

  const linked = useMemo(() => linkedIndustryCharacterFilter(search), [search]);
  const pending = usePendingIndustryFilter((state) => state.pending);
  // Dropped once the location moves on, so an old entry never resurfaces
  // when a later entry happens to reuse its key (a router's first entry is
  // always "default").
  useEffect(() => {
    if (pending && pending.locationKey !== locationKey) {
      usePendingIndustryFilter.setState({ pending: null });
    }
  }, [pending, locationKey]);
  const value = pending && pending.locationKey === locationKey ? pending.value : (linked ?? pick);

  const setValue = useCallback(
    (next: CharacterFilterValue) => {
      usePendingIndustryFilter.setState({ pending: { value: next, locationKey } });
      setParams({
        [INDUSTRY_CHARACTER_PARAM]: next,
        'jobs.chars': 'current',
        'opps.chars': 'current',
      });
      void remember(next);
    },
    [setParams, remember, locationKey]
  );
  return [value, setValue];
}
