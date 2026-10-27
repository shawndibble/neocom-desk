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
  frequentlyUndercut: false,
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

  it('says let it go when undercutting the rival would sell under the floor', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
      floor: { relist: 480, fill: 470 },
    };
    // undercutPrice(450) = 449.90, one legal tick under the rival — 480 - 449.90 = 30.10.
    const verdict = orderVerdict(row);
    expect(verdict?.kind).toBe('letGo');
    expect(verdict?.amount).toBeCloseTo(30.1, 6);
    expect(verdict?.price).toBe(449.9);
  });

  it('says undercut them when the suggested price still clears the floor', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
      floor: { relist: 400, fill: 390 },
    };
    // undercutPrice(450) = 449.90 — 449.90 - 400 = 49.90.
    const verdict = orderVerdict(row);
    expect(verdict?.kind).toBe('matchThem');
    expect(verdict?.amount).toBeCloseTo(49.9, 6);
    expect(verdict?.price).toBe(449.9);
  });

  it('says raise the price for a below-floor order, with the shortfall and the rounded-up target', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'belowFloor',
      problems: ['belowFloor'],
      belowFloor: true,
      floor: { relist: 700, fill: 600 },
    };
    expect(orderVerdict(row)).toEqual({ kind: 'raisePrice', amount: 200, price: 700 });
  });

  it('rounds the raise-price target up to a legal price, even when the exact floor is not one', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'belowFloor',
      problems: ['belowFloor'],
      belowFloor: true,
      floor: { relist: 724.45, fill: 600 },
    };
    expect(orderVerdict(row)?.price).toBe(724.5);
  });

  it('says leave it alone for a healthy order with a floor', () => {
    const row: OpenOrderRow = { ...BASE_ROW, floor: { relist: 400, fill: 390 } };
    expect(orderVerdict(row)).toEqual({ kind: 'leaveItAlone', amount: null, price: null });
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
