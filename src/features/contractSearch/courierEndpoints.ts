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
import type { CourierEndpoint, PublicCourierContractRow } from '@/engine/contracts/courierSearch';

async function resolveOne(locationId: number): Promise<CourierEndpoint | null> {
  const station = await lookupNpcStation(locationId);
  // `null` (a player structure) and `undefined` (snapshot unreadable) are
  // different conclusions everywhere else; here they lead to the same place —
  // nothing local names this id — so both fall through to no entry at all.
  if (!station) return null;
  const system = await lookupSolarSystem(station.systemId);
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
  const ids = new Set<number>();
  for (const row of rows) {
    ids.add(row.originLocationId);
    ids.add(row.destinationLocationId);
  }

  const endpoints = new Map<number, CourierEndpoint>();
  await Promise.all(
    [...ids].map(async (id) => {
      const endpoint = await resolveOne(id);
      if (endpoint) endpoints.set(id, endpoint);
    })
  );
  return endpoints;
}
