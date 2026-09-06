import { describe, it, expect } from 'vitest';
import { orderBadgeFor } from './orderBadgeKind';
import type { OpenOrderRow } from './openOrdersModel';

const BASE_ROW: OpenOrderRow = {
  orderId: 101,
  characterId: 1,
  characterName: 'Alpha',
  typeId: 34,
  typeName: 'Tritanium',
  isBuyOrder: false,
  price: 500,
  volumeRemain: 10,
  volumeTotal: 10,
  locationId: 60003760,
  regionId: 10000002,
  stationName: 'Jita IV - Moon 4',
  issued: new Date().toISOString(),
  durationDays: 90,
  expiry: { expiresAt: Date.now() + 60 * 86_400_000, daysLeft: 60, expired: false },
  floor: null,
  costBasis: null,
  station: { bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 },
  deepUndercut: null,
  worstScope: null,
  problem: 'healthy',
  problems: ['healthy'],
  iskTiedUp: 5000,
  belowFloor: false,
};

describe('orderBadgeFor', () => {
  it('badges a below-floor sell row with the shortfall percentage', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'belowFloor',
      problems: ['belowFloor'],
      floor: { relist: 700, fill: 600 },
    };
    expect(orderBadgeFor(row)).toEqual({ kind: 'belowFloor', detail: '-28.6%' });
  });

  it('returns null for belowFloor with no floor to measure the shortfall against', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'belowFloor',
      problems: ['belowFloor'],
      floor: null,
    };
    expect(orderBadgeFor(row)).toBeNull();
  });

  it('badges undercutStation with the station gap percentage', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
    };
    expect(orderBadgeFor(row)).toEqual({ kind: 'undercutStation', detail: '-10.0%' });
  });

  it('badges undercutSystem with the deep-undercut worst gap percentage', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutSystem',
      problems: ['undercutSystem'],
      deepUndercut: {
        worst: {
          scope: 'system',
          price: 440,
          gapIsk: 60,
          gapPct: 12,
          volumeRemain: 3,
          locationId: 60003469,
          systemId: 30000144,
          ordersBeatingMe: 1,
          unitsBeatingMe: 3,
        },
        byScope: {},
      },
    };
    expect(orderBadgeFor(row)).toEqual({ kind: 'undercutSystem', detail: '-12.0%' });
  });

  it('badges undercutSystem with no detail when the worst gap is unresolved', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutSystem',
      problems: ['undercutSystem'],
      deepUndercut: { worst: null, byScope: {} },
    };
    expect(orderBadgeFor(row)).toEqual({ kind: 'undercutSystem', detail: undefined });
  });

  it('badges undercutRegion with the deep-undercut worst gap percentage', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutRegion',
      problems: ['undercutRegion'],
      deepUndercut: {
        worst: {
          scope: 'region',
          price: 450,
          gapIsk: 50,
          gapPct: 10,
          volumeRemain: 5,
          locationId: 60003469,
          systemId: 30000144,
          ordersBeatingMe: 1,
          unitsBeatingMe: 5,
        },
        byScope: {},
      },
    };
    expect(orderBadgeFor(row)).toEqual({ kind: 'undercutRegion', detail: '-10.0%' });
  });

  it('badges expiringOrStale as "expiring" with days-left when known', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'expiringOrStale',
      problems: ['expiringOrStale'],
      expiry: { expiresAt: Date.now() + 3 * 86_400_000, daysLeft: 3, expired: false },
    };
    expect(orderBadgeFor(row)).toEqual({ kind: 'expiring', detail: '3d' });
  });

  it('badges expiringOrStale with no detail when days-left is unknown', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'expiringOrStale',
      problems: ['expiringOrStale'],
      expiry: null,
    };
    expect(orderBadgeFor(row)).toEqual({ kind: 'expiring', detail: undefined });
  });

  it('badges a buy order as outbid, reading the gap off the station tier when that is the worst scope', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      isBuyOrder: true,
      problem: 'outbid',
      problems: ['outbid'],
      worstScope: 'station',
      station: { bestPrice: 550, beatsMe: true, gapIsk: 50, gapPct: 10 },
    };
    expect(orderBadgeFor(row)).toEqual({ kind: 'outbid', detail: '+10.0%' });
  });

  it('badges a buy order as outbid, reading the gap off the deep-undercut worst when that is the worst scope', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      isBuyOrder: true,
      problem: 'outbid',
      problems: ['outbid'],
      worstScope: 'region',
      deepUndercut: {
        worst: {
          scope: 'region',
          price: 450,
          gapIsk: 50,
          gapPct: 8,
          volumeRemain: 5,
          locationId: 60003469,
          systemId: 30000144,
          ordersBeatingMe: 1,
          unitsBeatingMe: 5,
        },
        byScope: {},
      },
    };
    expect(orderBadgeFor(row)).toEqual({ kind: 'outbid', detail: '+8.0%' });
  });

  it('badges a healthy sell row with no linked cost basis as noCostBasis', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'healthy',
      problems: ['healthy'],
      costBasis: null,
    };
    expect(orderBadgeFor(row)).toEqual({ kind: 'noCostBasis' });
  });

  it('never badges a healthy buy order as noCostBasis, even with costBasis null', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      isBuyOrder: true,
      problem: 'healthy',
      problems: ['healthy'],
      costBasis: null,
      station: { bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 },
    };
    expect(orderBadgeFor(row)).toBeNull();
  });

  it('badges a healthy sell row as best when nobody at the station is cheaper', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'healthy',
      problems: ['healthy'],
      costBasis: {
        unitCost: 400,
        runId: 'run-1',
        runQuantity: 10,
        materialCost: 3000,
        jobFee: 1000,
      },
      station: { bestPrice: 520, beatsMe: false, gapIsk: 20, gapPct: 4 },
    };
    expect(orderBadgeFor(row)).toEqual({ kind: 'best' });
  });

  it('returns null for a healthy sell row with a cost basis and no station price to compare against', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'healthy',
      problems: ['healthy'],
      costBasis: {
        unitCost: 400,
        runId: 'run-1',
        runQuantity: 10,
        materialCost: 3000,
        jobFee: 1000,
      },
      station: { bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 },
    };
    expect(orderBadgeFor(row)).toBeNull();
  });
});
