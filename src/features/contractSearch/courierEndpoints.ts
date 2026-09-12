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
 * The price is that a player structure stays unnamed, unplaced and unbanded.
 * `CourierEndpoint` says so with `null` rather than guessing, and the table
 * shows the raw id — the honest answer, and one that still lets the route
 * search match the *other* end. Origin keeps its region regardless: the row
 * carries the contract's own region, which is where the pickup is.
 */
import { classifySpace } from '@/engine/space';
import { lookupNpcStation } from '@/sde/npcStations';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { loadJumpGraph } from '@/sde/jumpGraph';
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

  const system = await lookupSolarSystem(station.systemId);
  const gates = graph?.get(station.systemId);
  return {
    locationId,
    name: station.name,
    systemName: system?.name ?? null,
    // Kept, not just spent on the name lookup above: a route is measured
    // between systems, so this is what makes a jump count possible at all.
    systemId: station.systemId,
    regionId: system?.regionId ?? null,
    // The same entry that names the system carries its security status, so the
    // band is free (issue #939) — one call to the classifier BPC Search's own
    // Space filter uses, never a second implementation of the cutoffs. No
    // system means no band: `classifySpace` needs a name for the wormhole test
    // and a status for the rest, and inventing either would be a claim about
    // where a haul goes that nothing local supports.
    space: system ? classifySpace(system.name, system.security) : null,
    resolution: 'station',
    // The graph keys *every* solar system, gateless ones with an empty list, so
    // a present-but-empty entry is "no stargate touches this system" while a
    // missing graph is "we could not read it". Those must not read alike: the
    // first is a fact about New Eden, the second a gap in our snapshot.
    hasStargates: gates === undefined ? null : gates.length > 0,
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
  return endpoints;
}
