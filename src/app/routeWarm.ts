import type { AppRoutePath } from './routeScopes';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { hasSessionRouteSnapshot, writeRouteSnapshot } from '@/lib/routeSnapshotCache';
import { onCachePurged } from '@/esi/cachePurge';
import type { EsiEndpointId } from '@/esi/registry';
import { grantCovers } from './grantCovers';
import { loadCalendarBoard } from '@/features/character/calendarBoardData';

export interface RouteWarmer {
  readonly cacheKey: string;
  readonly endpoints: readonly EsiEndpointId[];
  readonly load: (characterId: number, signal: RouteSnapshotSignal) => Promise<unknown>;
}

export const ROUTE_WARMERS = {
  '/calendar': {
    cacheKey: 'calendar',
    endpoints: [
      'getCharacterCalendar',
      'getCharacterSkillQueue',
      'getCharacterIndustryJobs',
      'getCharacterPlanets',
      'getCharacterContracts',
      'getCharacterOrders',
    ],
    load: loadCalendarBoard,
  },
} satisfies Partial<Record<AppRoutePath, RouteWarmer>>;

export type WarmablePath = keyof typeof ROUTE_WARMERS;

const inFlight = new Set<string>();

let purgeGeneration = 0;
onCachePurged(() => {
  purgeGeneration += 1;
});

export function resetWarmState(): void {
  inFlight.clear();
}

function isWarmable(path: string): path is WarmablePath {
  return Object.prototype.hasOwnProperty.call(ROUTE_WARMERS, path);
}

export async function warmRoute(
  path: string,
  characterId: number | null,
  granted: readonly string[] | undefined
): Promise<void> {
  if (characterId === null || granted === undefined || !isWarmable(path)) return;
  const { cacheKey, endpoints, load }: RouteWarmer = ROUTE_WARMERS[path];
  if (!grantCovers(new Set(granted), endpoints)) return;
  if (hasSessionRouteSnapshot(cacheKey, characterId)) return;

  const token = `${cacheKey}:${characterId}`;
  if (inFlight.has(token)) return;
  inFlight.add(token);
  const startedAt = purgeGeneration;
  try {
    const data = await load(characterId, { cancelled: false });
    if (purgeGeneration !== startedAt) return;
    writeRouteSnapshot(cacheKey, characterId, data);
  } catch {
  } finally {
    inFlight.delete(token);
  }
}
