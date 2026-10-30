import { useEffect, useState } from 'react';
import { localJumpDistances } from '@/features/route/localRoute';

/**
 * Plain stargate jumps from one system to every other, for deciding which buy
 * orders' ranges reach a station (issue #5653). No Thera/Turnur holes, no
 * Ansiblex bridges, no avoided systems: a buy order's range is gates only.
 * Undefined until loaded, or when the system is unknown (0) or the graph
 * cannot be read.
 */
export function useBuyJumps(systemId: number): ReadonlyMap<number, number> | undefined {
  const [loaded, setLoaded] = useState<{ systemId: number; jumps: ReadonlyMap<number, number> }>();
  useEffect(() => {
    if (systemId === 0) return;
    let cancelled = false;
    void localJumpDistances(systemId).then((result) => {
      if (!cancelled && result.kind === 'known') setLoaded({ systemId, jumps: result.jumps });
    });
    return () => {
      cancelled = true;
    };
  }, [systemId]);
  return loaded?.systemId === systemId ? loaded.jumps : undefined;
}
