/**
 * `CharacterFilterValue` as a URL query parameter: `current` or `all`. Goes
 * through the same stored form Dexie and Firestore use
 * (`toStoredCharacterFilterValue`), so there is one serialisation of the
 * value, not a second one for URLs. A comma-separated id list still parses —
 * a bookmarked or shared link from before the value narrowed to `current`/
 * `all` — and reads back as `'all'`, same as the stored legacy shape does.
 *
 * The default is the caller's — typically the synced
 * `sync.defaultCharacterFilter`, which loads asynchronously — so build the
 * codec in a `useMemo` keyed on it. The URL overrides that default for this
 * view only; nothing read here is ever written back to the setting (scope
 * decision "persisted view preferences stay out of the URL").
 */
import type { UrlParamCodec } from '@/lib/urlState';
import {
  fromStoredCharacterFilterValue,
  isStoredCharacterFilterValue,
  toStoredCharacterFilterValue,
  type CharacterFilterValue,
} from './characterFilterValue';

function encode(value: CharacterFilterValue): string {
  const stored = toStoredCharacterFilterValue(value);
  return typeof stored === 'string' ? stored : stored.join(',');
}

export function characterFilterParam(
  defaultValue: CharacterFilterValue
): UrlParamCodec<CharacterFilterValue> {
  const defaultKey = encode(defaultValue);
  return {
    parse: (raw) => {
      if (raw === null || raw === '') return defaultValue;
      const stored = raw === 'current' || raw === 'all' ? raw : raw.split(',').map(Number);
      if (!isStoredCharacterFilterValue(stored)) return defaultValue;
      if (Array.isArray(stored) && stored.length === 0) return defaultValue;
      return fromStoredCharacterFilterValue(stored);
    },
    serialize: (value) => {
      const key = encode(value);
      return key === defaultKey ? null : key;
    },
  };
}
