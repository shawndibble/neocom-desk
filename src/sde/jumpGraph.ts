import { loadSolarSystemJumps } from './loadMarketSde';
import type { JumpGraph } from '@/engine/route/jumpRoute';
import { memoizeAsync } from '@/lib/memoizeAsync';

export const loadJumpGraph = memoizeAsync(
  async (): Promise<JumpGraph> => {
    const data = await loadSolarSystemJumps();
    const graph = new Map<number, readonly number[]>();
    for (const [systemId, neighbours] of Object.entries(data)) {
      if (Array.isArray(neighbours)) graph.set(Number(systemId), neighbours);
    }
    return graph;
  },
  { fallback: undefined }
);

export function clearJumpGraphIndex(): void {
  loadJumpGraph.reset();
}
