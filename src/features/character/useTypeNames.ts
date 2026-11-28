import { useCallback, useMemo, useState } from 'react';
import { loadTypeNames } from '@/features/character/typeNames';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

const NO_NAMES: ReadonlyMap<number, string> = new Map();

export function useTypeNames(typeIds: readonly number[]): ReadonlyMap<number, string> {
  const unique = useMemo(() => [...new Set(typeIds)].sort((a, b) => a - b), [typeIds]);
  const key = unique.length === 0 ? null : unique.join(',');
  const loader = useCallback(() => loadTypeNames(unique), [unique]);
  const { data } = useKeyedLoad(key, loader);
  const [last, setLast] = useState(NO_NAMES);
  if (data && data !== last) setLast(data);
  return data ?? last;
}
