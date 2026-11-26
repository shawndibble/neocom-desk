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
const LEGACY_PARAMS = ['jobs.chars', 'opps.chars'] as const;

const legacyCodec = characterFilterParam('current');

const usePendingIndustryFilter = create<{
  pending: { value: CharacterFilterValue; locationKey: string } | null;
}>(() => ({ pending: null }));

export function linkedIndustryCharacterFilter(search: string): CharacterFilterValue | null {
  const params = new URLSearchParams(search);
  for (const key of [INDUSTRY_CHARACTER_PARAM, ...LEGACY_PARAMS]) {
    if (params.has(key)) return legacyCodec.parse(params.get(key));
  }
  return null;
}

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
