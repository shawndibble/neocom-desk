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
  security: 0.9459,
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
  security: 0.9515,
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
  security: 0.8954,
  space: 'highsec',
  resolution: 'station',
  hasStargates: true,
};

const STRUCTURE: CourierEndpoint = {
  locationId: 1035466617946,
  name: null,
  systemName: null,
  systemId: null,
  regionId: null,
  security: null,
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

  it('has no lane to look up when the pickup station sits in a system the snapshot does not hold', () => {
    const stationOffTheMap: CourierEndpoint = {
      ...JITA,
      systemName: null,
      systemId: null,
      regionId: null,
      security: null,
      space: null,
    };
    const subject = haul(stationOffTheMap, AMARR);
    const back = haul(AMARR, JITA);

    expect(reverseLaneMatches(subject, [subject, back], NO_FILTER)).toBeNull();
  });

  it('still reports the return hauls it cannot place when a space band is chosen', () => {
    const subject = haul(JITA, AMARR);
    const back = haul(AMARR, JITA);
    const unplaceable = haul(AMARR, STRUCTURE);

    const lane = reverseLaneMatches(subject, [subject, back, unplaceable], {
      destinationSpace: ['highsec'],
    });

    expect(lane?.matches.map((row) => row.contractId)).toEqual([back.contractId]);
    expect(lane?.unplaceable.map((row) => row.contractId)).toEqual([unplaceable.contractId]);
  });

  it('reports the return hauls it cannot place, apart from the ones it counted', () => {
    const subject = haul(JITA, AMARR);
    const back = haul(AMARR, JITA);
    const unplaceable = haul(AMARR, STRUCTURE);

    const lane = reverseLaneMatches(subject, [subject, back, unplaceable], NO_FILTER);

    expect(lane?.matches.map((row) => row.contractId)).toEqual([back.contractId]);
    expect(lane?.unplaceable.map((row) => row.contractId)).toEqual([unplaceable.contractId]);
  });

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
      originRegionId: THE_FORGE,
      destinationRegionId: DOMAIN,
    });

    expect(lane?.matches.map((row) => row.contractId)).toEqual([affordable.contractId]);
  });
});
