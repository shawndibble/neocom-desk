import { classifySpace } from '@/engine/space';
import { lookupNpcStation } from '@/sde/npcStations';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { readCachedStructures } from '@/features/character/structures';
import type { JumpGraph } from '@/engine/route/jumpRoute';
import type { CourierEndpoint, PublicCourierContractRow } from '@/engine/contracts/courierSearch';

function unplaced(
  locationId: number,
  resolution: 'structure' | 'unknown',
  regionId: number | null
): CourierEndpoint {
  return {
    locationId,
    name: null,
    systemName: null,
    systemId: null,
    regionId,
    security: null,
    space: null,
    resolution,
    hasStargates: null,
  };
}

async function resolveOne(
  locationId: number,
  graph: JumpGraph | undefined,
  fallbackRegionId: number | null
): Promise<CourierEndpoint> {
  const station = await lookupNpcStation(locationId);
  if (station === undefined) return unplaced(locationId, 'unknown', fallbackRegionId);
  if (station === null) return unplaced(locationId, 'structure', fallbackRegionId);

  return {
    locationId,
    name: station.name,
    resolution: 'station',
    ...(await systemPlacement(station.systemId, graph, null)),
  };
}

type SystemPlacement = Pick<
  CourierEndpoint,
  'systemName' | 'systemId' | 'regionId' | 'security' | 'space' | 'hasStargates'
>;

async function systemPlacement(
  systemId: number,
  graph: JumpGraph | undefined,
  fallbackRegionId: number | null
): Promise<SystemPlacement> {
  const system = await lookupSolarSystem(systemId);
  const gates = graph?.get(systemId);
  return {
    systemName: system?.name ?? null,
    systemId,
    regionId: system?.regionId ?? fallbackRegionId,
    security: system?.security ?? null,
    space: system ? classifySpace(system.name, system.security) : null,
    hasStargates: gates === undefined ? null : gates.length > 0,
  };
}

export async function placeStructureEndpoint(
  endpoint: CourierEndpoint,
  structure: { name: string; systemId: number }
): Promise<CourierEndpoint> {
  const graph = await loadJumpGraph();
  return {
    ...endpoint,
    name: structure.name,
    ...(await systemPlacement(structure.systemId, graph, endpoint.regionId)),
  };
}

export async function loadCourierEndpoints(
  rows: readonly PublicCourierContractRow[]
): Promise<Map<number, CourierEndpoint>> {
  const regionByLocation = new Map<number, number>();
  const ids = new Set<number>();
  for (const row of rows) {
    ids.add(row.originLocationId);
    ids.add(row.destinationLocationId);
    regionByLocation.set(row.originLocationId, row.regionId);
  }

  const graph = await loadJumpGraph();
  const endpoints = new Map<number, CourierEndpoint>();
  await Promise.all(
    [...ids].map(async (id) => {
      endpoints.set(id, await resolveOne(id, graph, regionByLocation.get(id) ?? null));
    })
  );
  await placeFromCache(endpoints, graph);
  return endpoints;
}

async function placeFromCache(
  endpoints: Map<number, CourierEndpoint>,
  graph: JumpGraph | undefined
): Promise<void> {
  const unnamed = [...endpoints.values()].filter(
    (endpoint) => endpoint.resolution === 'structure' && endpoint.name === null
  );
  if (unnamed.length === 0) return;
  const cached = await readCachedStructures(unnamed.map((endpoint) => endpoint.locationId));
  await Promise.all(
    unnamed.map(async (endpoint) => {
      const structure = cached.get(endpoint.locationId);
      if (structure === undefined) return;
      endpoints.set(endpoint.locationId, {
        ...endpoint,
        name: structure.name,
        ...(structure.systemId === null
          ? {}
          : await systemPlacement(structure.systemId, graph, endpoint.regionId)),
      });
    })
  );
}
