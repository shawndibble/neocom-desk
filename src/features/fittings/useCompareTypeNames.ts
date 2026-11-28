import { useCallback, useMemo } from 'react';
import { loadTypeNames } from '@/features/character/typeNames';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

const NO_NAMES: ReadonlyMap<number, string> = new Map();

export function useCompareTypeNames(typeIds: readonly number[]): ReadonlyMap<number, string> {
  const unique = useMemo(() => [...new Set(typeIds)].sort((a, b) => a - b), [typeIds]);
  const key = unique.length === 0 ? null : unique.join(',');
  const loader = useCallback(() => loadTypeNames(unique), [unique]);
  const { data } = useKeyedLoad(key, loader);
  return data ?? NO_NAMES;
}
