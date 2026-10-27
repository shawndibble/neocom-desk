import type { FeederView, FeederViewSummary } from '../taxBook/feederViewClient';

/** Sample moon owner view for stories and tests; all names invented. */
export const NAMES: Record<number, string> = {
  1: 'Varro Kestane',
  2: 'Tamsin Holloway',
  3: 'Odile Marchetti',
  4: 'Juno Rask',
};
export const nameOf = (id: number) => NAMES[id] ?? `#${id}`;

const summary: FeederViewSummary = {
  schemaVersion: 1,
  feederCorporationId: 98,
  collectorCorporationId: 5,
  collectorName: 'Brass Meridian Logistics',
  status: 'active',
  mode: 'normal',
  note: null,
  builtAt: Date.UTC(2026, 9, 20),
  coverageFrom: '2026-10-01',
  coverageTo: null,
  leftAt: null,
  lastReadWellAt: Date.UTC(2026, 9, 20),
  staleSince: null,
  effectiveRatePct: 8,
  requestedRatePct: 6,
  agreedRatePct: 8,
  rateHistory: [
    { kind: 'requested', pct: 6, effectiveFrom: '2026-10-01', recordedAt: '2026-10-01T09:00:00Z' },
    { kind: 'agreed', pct: 8, effectiveFrom: '2026-10-01', recordedAt: '2026-10-01T12:00:00Z' },
  ],
  minedVolume: 4_128_060,
  minedValueIsk: 412_806_000,
  accruedIsk: 33_024_480,
  paidIsk: 20_000_000,
  balanceKind: 'owed',
  balanceIsk: 13_024_480,
  lastPayout: { date: '2026-10-16', amount: 12_000_000 },
  refineryCount: 2,
  unpricedDays: 0,
  dismissedAt: null,
};

export function fixtureView(over: Partial<FeederViewSummary> = {}): FeederView {
  return {
    summary: { ...summary, ...over },
    refineries: [
      { structureId: 10, label: 'Efa - Ashfall Tatara', solarSystemId: null },
      { structureId: 11, label: 'Ashfall Athanor II', solarSystemId: null },
    ],
    days: [
      {
        date: '2026-10-01',
        lines: [
          { characterId: 1, structureId: 10, typeId: 45490, volume: 810_000, quantity: 810_000 },
          { characterId: 2, structureId: 10, typeId: 45490, volume: 590_000, quantity: 590_000 },
          {
            characterId: 3,
            structureId: 11,
            typeId: 45492,
            volume: 1_520_000,
            quantity: 1_520_000,
          },
          { characterId: 4, structureId: 11, typeId: 45492, volume: 458_000, quantity: 458_000 },
        ],
      },
    ],
    payouts: [
      { date: '2026-10-16', amount: 12_000_000, method: 'donation', status: 'matched' },
      { date: '2026-10-04', amount: 8_000_000, method: 'donation', status: 'matched' },
    ],
  };
}
