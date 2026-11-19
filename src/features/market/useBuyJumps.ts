import { useCallback } from 'react';
import { loadHubJumps } from './hubJumps';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

/**
 * Plain stargate jumps from one system to every other, for deciding which buy
 * orders' ranges reach a station (issue #5653). No Thera/Turnur holes, no
 * Ansiblex bridges, no avoided systems: a buy order's range is gates only.
 * Undefined until loaded, or when the system is unknown (0) or the graph
 * cannot be read.
 */
export function useBuyJumps(systemId: number): ReadonlyMap<number, number> | undefined {
  const loader = useCallback(() => loadHubJumps(systemId), [systemId]);
  // A system with no readable graph loads null: no jumps.
  return useKeyedLoad(systemId === 0 ? null : String(systemId), loader).data ?? undefined;
}
