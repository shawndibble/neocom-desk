/**
 * Reactions cannot run in highsec (no reactor structure can be anchored
 * there), so a Build Plan whose Reaction Location sits in a highsec system
 * cannot do what it shows. Pure rules for flagging that and for suggesting the
 * nearest lowsec system to move to (issue #2908).
 */
import { securityBand, type SecurityBand } from '@/engine/securityStatus';
import { jumpDistancesFrom, type JumpGraph } from '@/engine/route/jumpRoute';

export type ReactionLocationState = 'ok' | 'highsec' | 'unset';

/**
 * `unset` when no system has been chosen — the band stored for an unchosen
 * location is only a pricing default, so it must never read as a highsec
 * choice.
 */
export function reactionLocationState(
  band: SecurityBand,
  systemChosen: boolean
): ReactionLocationState {
  if (!systemChosen) return 'unset';
  return band === 'highsec' ? 'highsec' : 'ok';
}

/**
 * The lowsec system fewest stargate jumps from `from` (the Character's current
 * system), or from `fallback` (the plan's build system) when that is unknown.
 * Ties go to the lower system id so the suggestion is stable.
 */
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
