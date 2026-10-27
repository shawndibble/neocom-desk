import type { OpenOrderRow } from '../openOrdersModel';

/** A healthy, uncomplicated sell order of Tritanium at Jita 4-4 — override only what a test is about. */
export function openOrderRow(overrides: Partial<OpenOrderRow> = {}): OpenOrderRow {
  return {
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
    ...overrides,
  };
}
