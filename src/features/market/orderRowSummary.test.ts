import { describe, it, expect } from 'vitest';
import { orderRowSummary } from './orderRowSummary';
import type { OpenOrderRow } from './openOrdersModel';
import type { UndercutRival } from '@/engine/market/undercut';

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

function rival(overrides: Partial<UndercutRival> = {}): UndercutRival {
  return {
    scope: 'station',
    price: 450,
    gapIsk: 50,
    gapPct: 10,
    volumeRemain: 20,
    locationId: 60003760,
    systemId: 30000142,
    ordersBeatingMe: 3,
    unitsBeatingMe: 60,
    ...overrides,
  };
}

describe('orderRowSummary', () => {
  it('quotes the aggregate rival price but never a seller count on the station tier alone', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
    };
    expect(orderRowSummary(row)).toEqual({
      kind: 'undercut',
      scope: 'station',
      rivalPrice: 450,
      gapIsk: 50,
      sellersUnderMe: null,
      match: null,
    });
  });

  it('prefers the deep rival over the aggregate, which is where the seller count comes from', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 460, beatsMe: true, gapIsk: 40, gapPct: 8 },
      deepUndercut: { worst: rival(), byScope: { station: rival() } },
    };
    expect(orderRowSummary(row)).toMatchObject({
      rivalPrice: 450,
      gapIsk: 50,
      sellersUnderMe: 3,
    });
  });

  it('says matching still pays when the rival price clears the floor', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
      floor: { relist: 400, fill: 390 },
    };
    expect(orderRowSummary(row)).toMatchObject({ match: { kind: 'profit', amount: 50 } });
  });

  it('says matching loses when the rival price is under the floor', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
      floor: { relist: 480, fill: 470 },
    };
    expect(orderRowSummary(row)).toMatchObject({ match: { kind: 'loss', amount: 30 } });
  });

  it('never claims a match outcome for a buy order, where the floor has no meaning', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      isBuyOrder: true,
      problem: 'outbid',
      problems: ['outbid'],
      worstScope: 'station',
      station: { bestPrice: 520, beatsMe: true, gapIsk: 20, gapPct: 4 },
      floor: { relist: 400, fill: 390 },
    };
    expect(orderRowSummary(row)).toEqual({
      kind: 'outbid',
      rivalPrice: 520,
      gapIsk: 20,
      sellersUnderMe: null,
    });
  });

  it('returns null for an undercut scope with no rival to quote', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutSystem',
      problems: ['undercutSystem'],
      worstScope: 'system',
      deepUndercut: { worst: null, byScope: { system: null } },
    };
    expect(orderRowSummary(row)).toBeNull();
  });

  it('reports the shortfall for a below-floor row', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'belowFloor',
      problems: ['belowFloor'],
      belowFloor: true,
      floor: { relist: 700, fill: 600 },
    };
    expect(orderRowSummary(row)).toEqual({ kind: 'belowFloor', lossPerUnit: 200 });
  });

  it('reports days left and stock for an expiring row', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'expiringOrStale',
      problems: ['expiringOrStale'],
      expiry: { expiresAt: Date.now() + 3 * 86_400_000, daysLeft: 3, expired: false },
    };
    expect(orderRowSummary(row)).toEqual({ kind: 'expiring', daysLeft: 3, volumeRemain: 10 });
  });

  it('flags a healthy sell order with no cost basis, since its floor column is empty', () => {
    expect(orderRowSummary(BASE_ROW)).toEqual({ kind: 'noCostBasis' });
  });

  it('calls a healthy sell order with a cost basis the best price where it sits', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      costBasis: { unitCost: 300, runId: 'r1', runQuantity: 10, materialCost: 2800, jobFee: 200 },
      station: { bestPrice: 500, beatsMe: false, gapIsk: 0, gapPct: 0 },
    };
    expect(orderRowSummary(row)).toEqual({ kind: 'best' });
  });
});
