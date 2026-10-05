/**
 * Pure figures for the PI header strip: which system reads as the pilot's
 * home, and how a route to the sell market is worded. No fetch here; the
 * strip feeds in what it loaded.
 */
import { shownSecurity } from '@/engine/securityStatus';

/**
 * The system holding the most colonies. There is no "home system" setting to
 * read, and the colonies are where the pilot's PI lives. A tie goes to the
 * lower id so the answer never flips between loads.
 */
export function homeSystemId(colonySystemIds: readonly number[]): number | null {
  const counts = new Map<number, number>();
  for (const id of colonySystemIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  let best: number | null = null;
  for (const [id, count] of counts) {
    const bestCount = best === null ? 0 : (counts.get(best) ?? 0);
    if (count > bestCount || (count === bestCount && best !== null && id < best)) best = id;
  }
  return best;
}

export interface RouteFigures {
  jumps: number;
  /** Systems flown into that are lowsec or nullsec (below 0.5 as the game shows it). */
  lowsecJumps: number;
}

/**
 * `path` is the security of every system on the route, origin first. An
 * unknown security (null) is not counted as low: guessing would inflate a
 * figure a hauler weighs.
 */
export function routeFigures(path: readonly (number | null)[]): RouteFigures {
  const entered = path.slice(1);
  return {
    jumps: entered.length,
    lowsecJumps: entered.filter((s) => s !== null && shownSecurity(s) < 0.5).length,
  };
}
