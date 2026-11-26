import { securityBand, type SecurityBand } from '@/engine/securityStatus';
import { jumpDistancesFrom, type JumpGraph } from '@/engine/route/jumpRoute';

export type ReactionLocationState = 'ok' | 'highsec' | 'unset';

export function reactionLocationState(
  band: SecurityBand,
  systemChosen: boolean
): ReactionLocationState {
  if (!systemChosen) return 'unset';
  return band === 'highsec' ? 'highsec' : 'ok';
}

export function nearestLowsecSystem(
  graph: JumpGraph | undefined,
  from: number | null,
  fallback: number | null,
  securityOf: (systemId: number) => number | undefined
): { systemId: number; jumps: number } | null {
  const start = from ?? fallback;
  if (!graph || start === null) return null;
  let best: { systemId: number; jumps: number } | null = null;
  for (const [systemId, jumps] of jumpDistancesFrom(graph, start)) {
    const security = securityOf(systemId);
    if (security === undefined || securityBand(security) !== 'lowsec') continue;
    if (best === null || jumps < best.jumps || (jumps === best.jumps && systemId < best.systemId)) {
      best = { systemId, jumps };
    }
  }
  return best;
}
