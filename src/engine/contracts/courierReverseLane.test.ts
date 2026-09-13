import { describe, it, expect } from 'vitest';
import { reverseLaneMatches } from '@/engine/contracts/courierReverseLane';
import type {
  CourierContractFilter,
  CourierEndpoint,
  CourierRouteRow,
} from '@/engine/contracts/courierSearch';

const THE_FORGE = 10000002;
const DOMAIN = 10000043;
const SINQ_LAISON = 10000032;

const JITA: CourierEndpoint = {
  locationId: 60003760,
  name: 'Jita IV - Moon 4',
  systemName: 'Jita',
  systemId: 30000142,
  regionId: THE_FORGE,
  space: 'highsec',
  resolution: 'station',
  hasStargates: true,
};

const AMARR: CourierEndpoint = {
  locationId: 60008494,
  name: 'Amarr VIII',
  systemName: 'Amarr',
  systemId: 30002187,
  regionId: DOMAIN,
  space: 'highsec',
  resolution: 'station',
  hasStargates: true,
};

const DODIXIE: CourierEndpoint = {
  locationId: 60011866,
  name: 'Dodixie IX - Moon 20',
  systemName: 'Dodixie',
  systemId: 30002659,
  regionId: SINQ_LAISON,
  space: 'highsec',
  resolution: 'station',
  hasStargates: true,
};

/**
 * A player structure, which is what an unplaced end really is: `stations.json`
 * holds every NPC station, so an id it does not carry is a structure by
 * elimination — and nothing local gives it a system or a region.
 *
 * Every field below the id is null on purpose. A fixture that quietly placed
 * this end would pass both the "cannot say" case and the undercount case while
 * the producer emits neither, which is exactly how three earlier bugs in this
 * feature stayed green.
 */
const STRUCTURE: CourierEndpoint = {
  locationId: 1035466617946,
  name: null,
  systemName: null,
  systemId: null,
  regionId: null,
  space: null,
  resolution: 'structure',
  hasStargates: null,
};

let nextId = 1;

function haul(
  origin: CourierEndpoint,
  destination: CourierEndpoint,
  extra: Partial<CourierRouteRow> = {}
): CourierRouteRow {
  const contractId = nextId++;
  return {
    contractId,
    regionId: origin.regionId ?? 0,
    originLocationId: origin.locationId,
    destinationLocationId: destination.locationId,
    reward: 5_000_000,
    volume: 10_000,
    dateExpired: Date.UTC(2026, 0, 1),
    origin,
    destination,
    ...extra,
  };
}

const NO_FILTER: CourierContractFilter = {};

describe('reverseLaneMatches', () => {
  it('counts the hauls running the same lane backwards', () => {
    const subject = haul(JITA, AMARR);
    const back = haul(AMARR, JITA);
    const alsoBack = haul(AMARR, JITA);
    const elsewhere = haul(AMARR, DODIXIE);

    const lane = reverseLaneMatches(subject, [subject, back, alsoBack, elsewhere], NO_FILTER);

    expect(lane?.matches.map((row) => row.contractId)).toEqual([
      back.contractId,
      alsoBack.contractId,
    ]);
  });

  it('has no lane to look up when the drop-off is a structure nothing local places', () => {
    const subject = haul(JITA, STRUCTURE);
    const back = haul(AMARR, JITA);

    expect(reverseLaneMatches(subject, [subject, back], NO_FILTER)).toBeNull();
  });

  it('has no lane to look up when the pickup is a structure nothing local places', () => {
    const subject = haul(STRUCTURE, AMARR);
    const back = haul(AMARR, JITA);

    expect(reverseLaneMatches(subject, [subject, back], NO_FILTER)).toBeNull();
  });

  /**
   * The lane is measured region to region, so a return haul whose drop-off is a
   * player structure cannot be matched into it. Reported separately rather than
   * silently missing from the count: "two more leave Domain for somewhere we
   * cannot place" is the honest reading, and a bare count would read as
   * "nobody is hauling back".
   */
  it('reports the return hauls it cannot place, apart from the ones it counted', () => {
    const subject = haul(JITA, AMARR);
    const back = haul(AMARR, JITA);
    const unplaceable = haul(AMARR, STRUCTURE);

    const lane = reverseLaneMatches(subject, [subject, back, unplaceable], NO_FILTER);

    expect(lane?.matches.map((row) => row.contractId)).toEqual([back.contractId]);
    expect(lane?.unplaceable.map((row) => row.contractId)).toEqual([unplaceable.contractId]);
  });

  /**
   * An intra-region haul's reverse lane is its own lane, so without this the
   * load already being carried would be offered back as a return trip.
   */
  it('never counts the haul being read as its own return trip', () => {
    const jitaToJita = haul(JITA, JITA);
    const other = haul(JITA, JITA);

    const lane = reverseLaneMatches(jitaToJita, [jitaToJita, other], NO_FILTER);

    expect(lane?.matches.map((row) => row.contractId)).toEqual([other.contractId]);
  });

  it('keeps every filter the hauler set, swapping only the two regions', () => {
    const subject = haul(JITA, AMARR);
    const affordable = haul(AMARR, JITA, { collateral: 1_000_000 });
    const tooRich = haul(AMARR, JITA, { collateral: 900_000_000 });

    const lane = reverseLaneMatches(subject, [subject, affordable, tooRich], {
      maxCollateral: 50_000_000,
      // The lane's own regions, which must be overridden rather than honoured
      // — this is the hauler's outbound leg, and keeping it would return the
      // hauls they are already looking at.
      originRegionId: THE_FORGE,
      destinationRegionId: DOMAIN,
    });

    expect(lane?.matches.map((row) => row.contractId)).toEqual([affordable.contractId]);
  });
});
