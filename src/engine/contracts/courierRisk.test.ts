import { describe, it, expect } from 'vitest';
import {
  courierRisks,
  blocksCompletion,
  isWormholeRegion,
  completableCourierRoutes,
  type CourierRiskKind,
} from '@/engine/contracts/courierRisk';
import type { CourierEndpoint, CourierRouteRow } from '@/engine/contracts/courierSearch';

function station(overrides: Partial<CourierEndpoint> = {}): CourierEndpoint {
  return {
    locationId: 60003760,
    name: 'Jita IV - Moon 4',
    systemName: 'Jita',
    systemId: 30000142,
    regionId: 10000002,
    space: 'highsec',
    resolution: 'station',
    hasStargates: true,
    ...overrides,
  };
}

/** Not in `stations.json`, which holds every NPC station — so a player structure by elimination. */
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

/** The snapshot could not be read at all. Opposite conclusion, same missing fields. */
const UNREADABLE: CourierEndpoint = { ...STRUCTURE, resolution: 'unknown' };

function haul(origin: CourierEndpoint, destination: CourierEndpoint): CourierRouteRow {
  return {
    contractId: 1,
    regionId: origin.regionId ?? 10000002,
    originLocationId: origin.locationId,
    destinationLocationId: destination.locationId,
    reward: 10_000_000,
    volume: 50_000,
    collateral: 1_000_000_000,
    daysToComplete: 7,
    dateExpired: Date.parse('2099-01-01T00:00:00Z'),
    origin,
    destination,
  };
}

function kinds(origin: CourierEndpoint, destination: CourierEndpoint): CourierRiskKind[] {
  return courierRisks(haul(origin, destination));
}

describe('isWormholeRegion', () => {
  it('is the 11000000 block, which is where every J-space system sits', () => {
    expect(isWormholeRegion(11000031)).toBe(true);
    expect(isWormholeRegion(11000001)).toBe(true);
    expect(isWormholeRegion(10000002)).toBe(false);
    expect(isWormholeRegion(null)).toBe(false);
  });
});

describe('courierRisks', () => {
  it('finds nothing wrong with a highsec station-to-station haul', () => {
    expect(kinds(station(), station({ locationId: 60008494 }))).toEqual([]);
  });

  it('flags a delivery to a player structure', () => {
    // Docking there needs access the issuer controls and nothing local can
    // check. The collateral is what is at stake if the hauler cannot dock.
    expect(kinds(station(), STRUCTURE)).toContain('player-structure');
  });

  it('does not flag a player structure the haul is picked up from', () => {
    // A pickup that cannot be reached simply is not accepted; it is the
    // *delivery* that is paid for with collateral already put up.
    expect(kinds(STRUCTURE, station())).not.toContain('player-structure');
  });

  it('never calls an unreadable snapshot a player structure', () => {
    // "We could not read our own station table" is not "this is a player
    // structure" — and getting that backwards would flag every haul on the
    // board as a scam risk the first time the snapshot fails to load.
    expect(kinds(station(), UNREADABLE)).toEqual([]);
  });

  it('flags an endpoint no stargate reaches, at either end', () => {
    const island = station({ locationId: 60099999, systemId: 31000005, hasStargates: false });
    expect(kinds(station(), island)).toContain('no-gate-route');
    expect(kinds(island, station())).toContain('no-gate-route');
  });

  it('flags a haul posted in wormhole space even when nothing places its ends', () => {
    // A J-space pickup is a player structure, so the endpoint carries no
    // system and no band. The contract's own region still says where it is.
    const wormholeSide: CourierEndpoint = { ...STRUCTURE, regionId: 11000031 };
    expect(kinds(wormholeSide, station())).toContain('no-gate-route');
  });

  it('says nothing about gate routes when the endpoint is simply unplaced', () => {
    // Unplaced is not unreachable: a structure in Jita is perfectly reachable.
    expect(kinds(station(), STRUCTURE)).not.toContain('no-gate-route');
  });

  it('marks a nullsec endpoint at either end', () => {
    const nullsec = station({ locationId: 60014437, space: 'nullsec' });
    expect(kinds(station(), nullsec)).toContain('nullsec');
    expect(kinds(nullsec, station())).toContain('nullsec');
  });

  it('does not add a sovereignty note to a place no gate reaches', () => {
    // Thera is wormhole space with four NPC stations and no stargates, and
    // `classifySpace` bands wormhole space by the `J######` name — so Thera
    // falls through to its raw security and reads nullsec. Printing both would
    // tell the hauler the trip depends on sovereignty, standings or a jump
    // network, none of which is true of anywhere a gate cannot reach.
    const thera = station({
      locationId: 60015148,
      systemName: 'Thera',
      regionId: 11000031,
      space: 'nullsec',
      hasStargates: false,
    });
    expect(kinds(station(), thera)).toEqual(['no-gate-route']);
  });

  it('reports every condition that applies, in a fixed order', () => {
    const nullStructure: CourierEndpoint = { ...STRUCTURE, regionId: 11000031 };
    expect(kinds(station({ space: 'nullsec' }), nullStructure)).toEqual([
      'player-structure',
      'no-gate-route',
      'nullsec',
    ]);
  });
});

describe('blocksCompletion', () => {
  it('covers the two conditions that can stop a haul being delivered at all', () => {
    expect(blocksCompletion(['player-structure'])).toBe(true);
    expect(blocksCompletion(['no-gate-route'])).toBe(true);
  });

  it('leaves nullsec alone, which is ordinary well-paid work', () => {
    // Hiding legitimate nullsec hauls behind a safety control would quietly
    // remove a real market rather than protect anyone.
    expect(blocksCompletion(['nullsec'])).toBe(false);
    expect(blocksCompletion([])).toBe(false);
  });
});

describe('completableCourierRoutes', () => {
  const AMARR = station({ locationId: 60008494 });
  const DELIVERABLE = haul(station(), AMARR);
  const TO_STRUCTURE = { ...haul(station(), STRUCTURE), contractId: 2 };
  const OUT_OF_WORMHOLE = {
    ...haul({ ...STRUCTURE, regionId: 11000031 }, AMARR),
    contractId: 3,
  };
  const TO_NULLSEC = {
    ...haul(station(), station({ locationId: 60014437, space: 'nullsec' })),
    contractId: 4,
  };
  const ALL = [DELIVERABLE, TO_STRUCTURE, OUT_OF_WORMHOLE, TO_NULLSEC];

  it('drops what cannot be delivered and keeps everything else', () => {
    expect(completableCourierRoutes(ALL).map((r) => r.contractId)).toEqual([1, 4]);
  });

  it('keeps a haul whose snapshot simply could not be read', () => {
    // Excluding it would turn one failed file read into a board that hides
    // most of its rows and never says why.
    const unreadable = { ...haul(station(), UNREADABLE), contractId: 5 };
    expect(completableCourierRoutes([unreadable]).map((r) => r.contractId)).toEqual([5]);
  });
});
