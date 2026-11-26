import { describe, it, expect } from 'vitest';
import {
  courierRisks,
  blocksCompletion,
  isWormholeRegion,
  completableCourierRoutes,
  asksFarMoreCollateralThanReward,
  HIGH_COLLATERAL_RATIO,
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
    security: 0.9459,
    space: 'highsec',
    resolution: 'station',
    hasStargates: true,
    ...overrides,
  };
}

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
    expect(kinds(station(), STRUCTURE)).toContain('player-structure');
  });

  it('does not flag a player structure the haul is picked up from', () => {
    expect(kinds(STRUCTURE, station())).not.toContain('player-structure');
  });

  it('never calls an unreadable snapshot a player structure', () => {
    expect(kinds(station(), UNREADABLE)).toEqual([]);
  });

  it('flags an endpoint no stargate reaches, at either end', () => {
    const island = station({ locationId: 60099999, systemId: 31000005, hasStargates: false });
    expect(kinds(station(), island)).toContain('no-gate-route');
    expect(kinds(island, station())).toContain('no-gate-route');
  });

  it('flags a haul posted in wormhole space even when nothing places its ends', () => {
    const wormholeSide: CourierEndpoint = { ...STRUCTURE, regionId: 11000031 };
    expect(kinds(wormholeSide, station())).toContain('no-gate-route');
  });

  it('says nothing about gate routes when the endpoint is simply unplaced', () => {
    expect(kinds(station(), STRUCTURE)).not.toContain('no-gate-route');
  });

  it('marks a nullsec endpoint at either end', () => {
    const nullsec = station({ locationId: 60014437, security: -0.5, space: 'nullsec' });
    expect(kinds(station(), nullsec)).toContain('nullsec');
    expect(kinds(nullsec, station())).toContain('nullsec');
  });

  it('does not add a sovereignty note to a place no gate reaches', () => {
    const thera = station({
      locationId: 60015148,
      systemName: 'Thera',
      regionId: 11000031,
      security: -0.1,
      space: 'nullsec',
      hasStargates: false,
    });
    expect(kinds(station(), thera)).toEqual(['no-gate-route']);
  });

  it('reports every condition that applies, in a fixed order', () => {
    const nullStructure: CourierEndpoint = { ...STRUCTURE, regionId: 11000031 };
    expect(kinds(station({ security: -0.5, space: 'nullsec' }), nullStructure)).toEqual([
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
    ...haul(station(), station({ locationId: 60014437, security: -0.5, space: 'nullsec' })),
    contractId: 4,
  };
  const ALL = [DELIVERABLE, TO_STRUCTURE, OUT_OF_WORMHOLE, TO_NULLSEC];

  it('drops what cannot be delivered and keeps everything else', () => {
    expect(completableCourierRoutes(ALL).map((r) => r.contractId)).toEqual([1, 4]);
  });

  it('keeps a haul whose snapshot simply could not be read', () => {
    const unreadable = { ...haul(station(), UNREADABLE), contractId: 5 };
    expect(completableCourierRoutes([unreadable]).map((r) => r.contractId)).toEqual([5]);
  });
});

describe('asksFarMoreCollateralThanReward', () => {
  it('fires from fifty times the reward in collateral, not below it', () => {
    expect(HIGH_COLLATERAL_RATIO).toBe(50);
    expect(asksFarMoreCollateralThanReward(49.9)).toBe(false);
    expect(asksFarMoreCollateralThanReward(50)).toBe(true);
    expect(asksFarMoreCollateralThanReward(100)).toBe(true);
  });

  it('takes the threshold the pilot set instead of the default', () => {
    expect(asksFarMoreCollateralThanReward(30, 25)).toBe(true);
    expect(asksFarMoreCollateralThanReward(24.9, 25)).toBe(false);
    expect(asksFarMoreCollateralThanReward(60, 100)).toBe(false);
  });

  it('says nothing about a haul whose ratio cannot be stated', () => {
    expect(asksFarMoreCollateralThanReward(null)).toBe(false);
  });

  it('is a flag, never a reason to hide the haul', () => {
    expect(blocksCompletion(['high-collateral'])).toBe(false);
  });
});
