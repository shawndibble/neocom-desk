/**
 * Names the two ends of every courier haul out of the local SDE snapshots —
 * `stations.json` for the station, `systems.json` for the system it sits in
 * and the region that system belongs to (issue #910).
 *
 * Deliberately *not* `loadContractLocationName`. That resolver is the right
 * one for the handful of locations on a character's own contracts; run across
 * a public snapshot it would issue one `/universe/structures/{id}` per
 * unresolved id, against an ACL that refuses most of them — hundreds of 403s
 * against ESI's shared 100-errors-per-minute budget, which is the exact probe
 * `sde/npcStations.ts` was written to remove. Both snapshots here are local
 * files, indexed once per session, so this whole pass costs no requests at
 * all.
 *
 * The price is that a player structure stays unnamed, unplaced and unbanded —
 * unless this device already knows it (`placeFromCache`: the cached ESI row
 * carries its system as well as its name), or the modal resolves it on demand
 * for the one haul being read (`placeStructureEndpoint`).
 * `CourierEndpoint` says so with `null` rather than guessing, and the table
 * shows the raw id — the honest answer, and one that still lets the route
 * search match the *other* end. A pickup keeps its region regardless: the row
 * carries the contract's own, which is where the pickup is, and a location that
 * is one haul's pickup keeps it when it turns up as another's delivery.
 */
import { classifySpace } from '@/engine/space';
import { lookupNpcStation } from '@/sde/npcStations';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { readCachedStructures } from '@/features/character/structures';
import type { JumpGraph } from '@/engine/route/jumpRoute';
import type { CourierEndpoint, PublicCourierContractRow } from '@/engine/contracts/courierSearch';

/** Nothing local placed this id; which of the two reasons is the whole point. */
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
  // `null` and `undefined` are opposite conclusions — "the table loaded and
  // does not hold this id, so it is a player structure" versus "the table could
  // not be read, so nothing is concluded". This used to collapse them, which
  // was harmless while the only consequence was an unshowable name. It stopped
  // being harmless once a scam flag rode on the answer (issue #944): one failed
  // read would mark every haul on the board as a possible scam.
  if (station === undefined) return unplaced(locationId, 'unknown', fallbackRegionId);
  if (station === null) return unplaced(locationId, 'structure', fallbackRegionId);

  return {
    locationId,
    name: station.name,
    resolution: 'station',
    ...(await inSystem(station.systemId, graph, null)),
  };
}

/** Everything an endpoint learns from the solar system it sits in. */
type SystemPlacement = Pick<
  CourierEndpoint,
  'systemName' | 'systemId' | 'regionId' | 'security' | 'space' | 'hasStargates'
>;

async function inSystem(
  systemId: number,
  graph: JumpGraph | undefined,
  fallbackRegionId: number | null
): Promise<SystemPlacement> {
  const system = await lookupSolarSystem(systemId);
  const gates = graph?.get(systemId);
  return {
    systemName: system?.name ?? null,
    // Kept, not just spent on the name lookup above: a route is measured
    // between systems, so this is what makes a jump count possible at all.
    systemId,
    regionId: system?.regionId ?? fallbackRegionId,
    // Raw, unrounded — the same float `classifySpace` below is fed, and the
    // same one `security` band displays get rounded from at render time.
    security: system?.security ?? null,
    // The same entry that names the system carries its security status, so the
    // band is free (issue #939) — one call to the classifier BPC Search's own
    // Space filter uses, never a second implementation of the cutoffs. No
    // system means no band: `classifySpace` needs a name for the wormhole test
    // and a status for the rest, and inventing either would be a claim about
    // where a haul goes that nothing local supports.
    space: system ? classifySpace(system.name, system.security) : null,
    // The graph keys *every* solar system, gateless ones with an empty list, so
    // a present-but-empty entry is "no stargate touches this system" while a
    // missing graph is "we could not read it". Those must not read alike: the
    // first is a fact about New Eden, the second a gap in our snapshot.
    hasStargates: gates === undefined ? null : gates.length > 0,
  };
}

/**
 * A player structure end, placed once ESI has said where it is — the modal's
 * on-demand lookup returns the system with the name. It stays a `structure`:
 * knowing where it is says nothing about whether the hauler may dock.
 */
export async function placeStructureEndpoint(
  endpoint: CourierEndpoint,
  structure: { name: string; systemId: number }
): Promise<CourierEndpoint> {
  const graph = await loadJumpGraph();
  return {
    ...endpoint,
    name: structure.name,
    ...(await inSystem(structure.systemId, graph, endpoint.regionId)),
  };
}

/**
 * Every endpoint the rows reference, resolved once. Keyed by location id, so
 * `resolveCourierRoutes` can attach both ends of a haul with two map reads and
 * a contract that starts and ends where another one does costs nothing extra.
 */
export async function loadCourierEndpoints(
  rows: readonly PublicCourierContractRow[]
): Promise<Map<number, CourierEndpoint>> {
  // A location the snapshots cannot place still has a region whenever some
  // haul is *posted* from it: the row carries the contract's own region, which
  // is where the pickup is. A region belongs to the place rather than to the
  // contract, so that answer is equally good for the same location appearing as
  // another haul's destination — which is why this is keyed by location rather
  // than by end. It is the only local fact left about a player structure, and
  // the one that says a J-space pickup is in J-space at all.
  //
  // The gap it leaves: a structure that is only ever a destination has no
  // region from anywhere, so a J-space delivery is named as a structure but not
  // as gateless. Both answers are true; the second is simply not always
  // knowable, and guessing it is not on offer.
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

/**
 * A player structure some character on this device has already resolved keeps
 * its name and is placed in its system: both read from the device's own
 * structure cache, no request. Anything the cache does not hold stays
 * unplaced, and the detail modal resolves it on demand — one lookup for the
 * haul someone opened, never a fan-out across the board (see the module note
 * on the error budget).
 */
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
          : await inSystem(structure.systemId, graph, endpoint.regionId)),
      });
    })
  );
}
