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
