/**
 * Pure figures for the PI header strip: which system reads as the pilot's
 * home, and how a route to the sell market is worded. No fetch here; the
 * strip feeds in what it loaded.
 */
import { securityBand } from '@/engine/securityStatus';
import type { TradeHub } from '@/market/hubs';

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
  /** Systems flown into that are lowsec (0.1 to 0.4 as the game shows it). */
  lowsecJumps: number;
  /** Systems flown into that are nullsec (below 0.1), split out the way Hauling does. */
  nullsecJumps: number;
}

/**
 * `path` is the security of every system on the route, origin first. An
 * unknown security (null) is not counted as low: guessing would inflate a
 * figure a hauler weighs.
 */
export function routeFigures(path: readonly (number | null)[]): RouteFigures {
  const entered = path.slice(1);
  const bands = entered.flatMap((s) => (s === null ? [] : [securityBand(s)]));
  return {
    jumps: entered.length,
    lowsecJumps: bands.filter((band) => band === 'lowsec').length,
    nullsecJumps: bands.filter((band) => band === 'nullsec').length,
  };
}

export interface HubRoute {
  hub: TradeHub['id'];
  /** Null when the route is unknown or does not exist. */
  figures: RouteFigures | null;
}

export type NearestHub = RouteFigures & { hub: TradeHub['id'] };

/**
 * The trade hub fewest gate jumps from home; a tie goes to the route with
 * fewer lowsec and nullsec jumps (the safer one), then to `current` (so an equally near
 * hub is never suggested over the one already used), then to the earlier
 * entry so the answer is stable. Hubs without a known route are skipped; null
 * when none is known.
 */
export function nearestHub(
  routes: readonly HubRoute[],
  current?: TradeHub['id']
): NearestHub | null {
  const unsafe = (f: RouteFigures) => f.lowsecJumps + f.nullsecJumps;
  let best: NearestHub | null = null;
  for (const { hub, figures } of routes) {
    if (!figures) continue;
    if (
      !best ||
      figures.jumps < best.jumps ||
      (figures.jumps === best.jumps && unsafe(figures) < unsafe(best)) ||
      (figures.jumps === best.jumps &&
        unsafe(figures) === unsafe(best) &&
        hub === current &&
        best.hub !== current)
    ) {
      best = { hub, ...figures };
    }
  }
  return best;
}
