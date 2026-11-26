import { jumpDistancesFrom, type JumpGraph } from '@/engine/route/jumpRoute';
import { securityBand } from '@/engine/securityStatus';
import type { PiSystemPlanets } from '@/sde/types';
import type { PlanetType } from '@/esi/endpoints';

export interface NearestPlanetTypesInput {
  originSystemId: number;
  planetTypes: readonly PlanetType[];
  maxJumps: number;
  graph: JumpGraph;
  securityOf: (systemId: number) => number | undefined;
  systemPlanets: PiSystemPlanets;
  highsecOnly?: boolean;
  limit?: number;
}

export interface NearestPlanetTypesResult {
  systemId: number;
  jumps: number;
  security: number | undefined;
  planetCounts: Partial<Record<PlanetType, number>>;
}

export function nearestSystemsWithPlanetTypes(
  input: NearestPlanetTypesInput
): NearestPlanetTypesResult[] {
  const { originSystemId, planetTypes, maxJumps, graph, securityOf, systemPlanets } = input;
  if (planetTypes.length === 0) return [];

  const jumps = new Map<number, number>(jumpDistancesFrom(graph, originSystemId));
  jumps.set(originSystemId, 0);

  const results: NearestPlanetTypesResult[] = [];
  for (const [systemId, distance] of jumps) {
    if (distance > maxJumps) continue;
    const counts = systemPlanets[String(systemId)];
    if (!counts) continue;
    const planetCounts: Partial<Record<PlanetType, number>> = {};
    for (const type of planetTypes) {
      const n = counts[type];
      if (n && n > 0) planetCounts[type] = n;
    }
    if (Object.keys(planetCounts).length === 0) continue;
    const security = securityOf(systemId);
    if (input.highsecOnly && (security === undefined || securityBand(security) !== 'highsec')) {
      continue;
    }
    results.push({ systemId, jumps: distance, security, planetCounts });
  }

  results.sort(
    (a, b) =>
      a.jumps - b.jumps ||
      (b.security ?? -Infinity) - (a.security ?? -Infinity) ||
      a.systemId - b.systemId
  );
  return input.limit === undefined ? results : results.slice(0, Math.max(0, input.limit));
}
