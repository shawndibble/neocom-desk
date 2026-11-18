import { useCallback, useMemo } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadTypeNames } from '@/features/character/typeNames';

const NO_NAMES: ReadonlyMap<number, string> = new Map();

/**
 * Names for module and rig type ids, from the SDE with an ESI fallback (an abyssal type is not
 * in the slim snapshot). Reads "#id" until a name lands or when none can be found.
 */
export function useDoctrineTypeNames(typeIds: readonly number[]): (typeId: number) => string {
  const key = [...new Set(typeIds)].sort((a, b) => a - b).join(',');
  const load = useCallback(() => loadTypeNames(key.split(',').map(Number)), [key]);
  const names = useKeyedLoad(key === '' ? null : key, load).data ?? NO_NAMES;
  return useMemo(() => (id: number) => names.get(id) ?? `#${id}`, [names]);
}
