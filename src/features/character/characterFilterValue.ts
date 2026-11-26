import { useMemo } from 'react';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';

export type CharacterFilterValue = 'current' | 'all';

export function resolveCharacterFilter(
  value: CharacterFilterValue,
  activeCharacterId: number | null
): MultiSelectFilter<number> {
  if (value === 'all') return 'all';
  return activeCharacterId === null ? 'all' : new Set([activeCharacterId]);
}

export function useResolvedCharacterFilter(
  value: CharacterFilterValue,
  activeCharacterId: number | null
): MultiSelectFilter<number> {
  return useMemo(
    () => resolveCharacterFilter(value, activeCharacterId),
    [value, activeCharacterId]
  );
}

export type StoredCharacterFilterValue = 'current' | 'all' | number[];

export function toStoredCharacterFilterValue(
  value: CharacterFilterValue
): StoredCharacterFilterValue {
  return value;
}

export function fromStoredCharacterFilterValue(
  stored: StoredCharacterFilterValue
): CharacterFilterValue {
  return stored === 'current' ? 'current' : Array.isArray(stored) ? 'all' : stored;
}

export function isStoredCharacterFilterValue(raw: unknown): raw is StoredCharacterFilterValue {
  if (raw === 'current' || raw === 'all') return true;
  return (
    Array.isArray(raw) &&
    raw.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
  );
}
