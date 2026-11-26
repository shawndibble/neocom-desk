import { useCallback } from 'react';
import { loadHubJumps } from './hubJumps';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

export function useBuyJumps(systemId: number): ReadonlyMap<number, number> | undefined {
  const loader = useCallback(() => loadHubJumps(systemId), [systemId]);
  return useKeyedLoad(systemId === 0 ? null : String(systemId), loader).data ?? undefined;
}
