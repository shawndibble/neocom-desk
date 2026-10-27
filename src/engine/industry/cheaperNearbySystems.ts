/**
 * The cheapest systems near a Build location, for the cost index popover:
 * strictly cheaper than the current index, within a few stargate jumps,
 * cheapest first. Pure; the caller supplies the graph and the live indices.
 */
import { jumpDistancesFrom, type JumpGraph } from '@/engine/route/jumpRoute';

export interface NearbySystem {
  systemId: number;
  jumps: number;
  /** Cost index as a fraction (0.044 = 4.4%). */
  index: number;
}

const DEFAULT_MAX_JUMPS = 5;
const DEFAULT_LIMIT = 5;

export function cheaperNearbySystems(
  graph: JumpGraph,
  originSystemId: number,
  indices: ReadonlyMap<number, number>,
  currentIndex: number,
  {
    maxJumps = DEFAULT_MAX_JUMPS,
    limit = DEFAULT_LIMIT,
    isEligible,
  }: {
    maxJumps?: number;
    limit?: number;
    /** Applied before the limit, so a system the pilot cannot build in never takes a slot. */
    isEligible?: (systemId: number) => boolean;
  } = {}
): NearbySystem[] {
  const found: NearbySystem[] = [];
  for (const [systemId, jumps] of jumpDistancesFrom(graph, originSystemId)) {
    if (systemId === originSystemId || jumps > maxJumps) continue;
    const index = indices.get(systemId);
    if (index === undefined || index >= currentIndex) continue;
    if (isEligible && !isEligible(systemId)) continue;
    found.push({ systemId, jumps, index });
  }
  found.sort((a, b) => a.index - b.index || a.jumps - b.jumps || a.systemId - b.systemId);
  return found.slice(0, limit);
}
