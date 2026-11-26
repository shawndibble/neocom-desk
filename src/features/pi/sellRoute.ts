import { securityBand } from '@/engine/securityStatus';
import type { TradeHub } from '@/market/hubs';

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
  lowsecJumps: number;
  nullsecJumps: number;
}

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
  figures: RouteFigures | null;
}

export type NearestHub = RouteFigures & { hub: TradeHub['id'] };

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
