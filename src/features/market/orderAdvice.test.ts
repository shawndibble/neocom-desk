import { describe, it, expect } from 'vitest';
import { adviseOrder } from './orderAdvice';
import { orderBadgeFor } from './orderBadgeKind';
import { orderRowSummary } from './orderRowSummary';
import { orderVerdict } from './orderVerdict';
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
  frequentlyUndercut: false,
};

const RIVAL: UndercutRival = {
  scope: 'station',
  price: 450,
  gapIsk: 50,
  gapPct: 10,
  volumeRemain: 20,
  locationId: 60003760,
  systemId: 30000142,
  ordersBeatingMe: 3,
  unitsBeatingMe: 60,
};

const UNDERCUT: OpenOrderRow = {
  ...BASE_ROW,
  problem: 'undercutStation',
  problems: ['undercutStation'],
  worstScope: 'station',
  station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
};

const ROWS: Record<string, OpenOrderRow> = {
  'healthy, no cost basis': BASE_ROW,
  'healthy with floor': { ...BASE_ROW, floor: { relist: 400, fill: 390 } },
  'healthy best price': {
    ...BASE_ROW,
    costBasis: {} as OpenOrderRow['costBasis'],
    station: { bestPrice: 500, beatsMe: false, gapIsk: 0, gapPct: 0 },
  },
  'frequently undercut': { ...BASE_ROW, frequentlyUndercut: true },
  'undercut, no floor': UNDERCUT,
  'undercut, profitable match': { ...UNDERCUT, floor: { relist: 400, fill: 390 } },
  'undercut, losing match': { ...UNDERCUT, floor: { relist: 480, fill: 470 } },
  'undercut, deep rival': {
    ...UNDERCUT,
    deepUndercut: { worst: RIVAL, byScope: { station: RIVAL } },
  },
  'undercut, no rival price': { ...UNDERCUT, station: BASE_ROW.station },
  'below floor': {
    ...BASE_ROW,
    problem: 'belowFloor',
    problems: ['belowFloor'],
    belowFloor: true,
    floor: { relist: 700, fill: 600 },
  },
  'below floor, no floor': { ...BASE_ROW, problem: 'belowFloor', problems: ['belowFloor'] },
  expiring: {
    ...BASE_ROW,
    problem: 'expiringOrStale',
    problems: ['expiringOrStale'],
    floor: { relist: 400, fill: 390 },
  },
  'buy outbid': {
    ...BASE_ROW,
    isBuyOrder: true,
    problem: 'outbid',
    problems: ['outbid'],
    worstScope: 'station',
    station: { bestPrice: 520, beatsMe: true, gapIsk: 20, gapPct: 4 },
    floor: { relist: 400, fill: 390 },
  },
  'buy top bid': {
    ...BASE_ROW,
    isBuyOrder: true,
    station: { bestPrice: 500, beatsMe: false, gapIsk: 0, gapPct: 0 },
  },
};

describe('adviseOrder', () => {
  it.each(Object.entries(ROWS))('equals the three separate calls: %s', (_name, row) => {
    expect(adviseOrder(row)).toEqual({
      badge: orderBadgeFor(row),
      summary: orderRowSummary(row),
      verdict: orderVerdict(row),
    });
  });
});
