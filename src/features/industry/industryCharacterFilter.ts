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
import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useUrlParams } from '@/lib/useUrlState';
import { useHydratedStore } from '@/lib/useHydratedStore';
import type { UrlParamCodec } from '@/lib/urlState';
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
 * Written whatever the value, never dropped as a default: the remembered pick
 * can be `all`, so an absent param does not mean `current` here.
 */
const pageCodec: UrlParamCodec<CharacterFilterValue> = {
  parse: legacyCodec.parse,
  serialize: (value) => value,
};

const SCHEMA = {
  [INDUSTRY_CHARACTER_PARAM]: pageCodec,
  'jobs.chars': legacyCodec,
  'opps.chars': legacyCodec,
};

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
  const { search } = useLocation();
  const [, setParams] = useUrlParams(SCHEMA);
  const picks = useCharacterFilterPicks((state) => state.value);
  const storedDefault = useDefaultCharacterFilter((state) => state.value);
  useHydratedStore(useCharacterFilterPicks, useDefaultCharacterFilter);
  const { remember } = useCharacterFilterPick('industry');

  const linked = useMemo(() => linkedIndustryCharacterFilter(search), [search]);
  const value =
    linked ?? industryCharacterPick(picks, fromStoredCharacterFilterValue(storedDefault));

  const setValue = useCallback(
    (next: CharacterFilterValue) => {
      // `current` is the old params' default, so writing it drops them.
      setParams({
        [INDUSTRY_CHARACTER_PARAM]: next,
        'jobs.chars': 'current',
        'opps.chars': 'current',
      });
      void remember(next);
    },
    [setParams, remember]
  );
  return [value, setValue];
}
