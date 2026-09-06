import { describe, it, expect } from 'vitest';
import { orderVerdict } from './orderVerdict';
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

describe('orderVerdict', () => {
  it('says nothing at all without a floor — the common case for an account with no linked builds', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
    };
    expect(orderVerdict(row)).toBeNull();
  });

  it('says let it go when matching the rival would sell under the floor', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
      floor: { relist: 480, fill: 470 },
    };
    expect(orderVerdict(row)).toEqual({ kind: 'letGo', amount: 30 });
  });

  it('says match them when the rival price still clears the floor', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
      floor: { relist: 400, fill: 390 },
    };
    expect(orderVerdict(row)).toEqual({ kind: 'matchThem', amount: 50 });
  });

  it('says raise the price for a below-floor order, with the shortfall', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'belowFloor',
      problems: ['belowFloor'],
      belowFloor: true,
      floor: { relist: 700, fill: 600 },
    };
    expect(orderVerdict(row)).toEqual({ kind: 'raisePrice', amount: 200 });
  });

  it('says leave it alone for a healthy order with a floor', () => {
    const row: OpenOrderRow = { ...BASE_ROW, floor: { relist: 400, fill: 390 } };
    expect(orderVerdict(row)).toEqual({ kind: 'leaveItAlone', amount: null });
  });

  it('has no verdict for an expiring order — the badge advice is the honest answer', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'expiringOrStale',
      problems: ['expiringOrStale'],
      floor: { relist: 400, fill: 390 },
    };
    expect(orderVerdict(row)).toBeNull();
  });

  it('has no verdict for a buy order, where a sell-side floor means nothing', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      isBuyOrder: true,
      problem: 'outbid',
      problems: ['outbid'],
      floor: { relist: 400, fill: 390 },
    };
    expect(orderVerdict(row)).toBeNull();
  });
});
