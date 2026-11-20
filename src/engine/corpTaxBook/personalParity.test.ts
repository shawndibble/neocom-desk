import { describe, expect, it } from 'vitest';
import { buildBookView } from './bookView';
import { overlayCorpBooks, type PersonalBook, type PersonalEntry } from './personal';
import type { Adjustment } from './statements';

/**
 * The corp book's Miner page and the member's own Tax tab read the same records; for a running
 * account they must say the same thing about what is owed and what is credit.
 */
const CORP = 98000001;
const ME = 90000001;
const SYSTEM = 30003838;
const ZEO = 45490;
const NOW = '2026-10-18T14:00:00Z';
const SYNCED = '2026-10-18T12:00:00Z';
const DAYS = ['2026-10-15', '2026-10-16']; // each 10,000 × 148 × 15% = 222,000
const MINER = `solo:${ME}`;

const observed = DAYS.map((date) => ({
  characterId: ME,
  recordedCorporationId: CORP,
  structureId: 1000,
  date,
  solarSystemId: SYSTEM,
  oreLines: [{ typeId: ZEO, quantity: 10_000 }],
}));
const entries: PersonalEntry[] = DAYS.map((date) => ({
  characterId: ME,
  date,
  solarSystemId: SYSTEM,
  oreLines: [{ typeId: ZEO, quantity: 10_000 }],
  freeOreLines: [{ typeId: ZEO, quantity: 10_000 }],
  allocations: [],
}));
const pricesOn = () => ({
  prices: new Map([[ZEO, 148]]),
  sources: new Map([[ZEO, 'saved' as const]]),
});
const rates = [{ scope: 'corp' as const, pct: 15, effectiveFrom: '2026-10-01' }];
const runningAccountFrom = '2026-10-01T00:00:00Z';

const adjust = (id: string, date: string, amount: number): Adjustment => ({
  id,
  minerId: MINER,
  date,
  amount,
  reason: 'Rolled over',
  by: 1,
  at: '2026-10-18T13:00:00Z',
});
const pay = (amount: number) => ({
  id: 'p1',
  minerId: MINER,
  characterId: ME,
  amount,
  at: '2026-10-18T13:10:00Z',
  source: 'donation' as const,
});

function both(payments: ReturnType<typeof pay>[], adjustments: Adjustment[]) {
  const corp = buildBookView({
    corporationId: CORP,
    now: NOW,
    startDate: '2026-10-01',
    graceHours: 6,
    minimumStatement: 0,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: SYNCED,
    rates,
    entries: observed,
    miners: [],
    statements: [],
    payments,
    dismissals: [],
    declarations: [],
    adjustments,
    extractions: [],
    paidStatementIds: new Set(),
    pricesOn,
    runningAccountFrom,
  }).miners[0];
  const personal: PersonalBook = {
    corporationId: CORP,
    corpName: 'Brass Meridian Logistics',
    startDate: '2026-10-01',
    lastSyncedAt: SYNCED,
    rates,
    miners: [],
    observed,
    dismissals: [],
    statements: [],
    payments,
    adjustments,
    hubId: 'jita',
    oreForm: 'compressed',
    pricesOn,
    inFlight: [],
    runningAccountFrom,
  };
  const mine = overlayCorpBooks({ entries, books: [personal], now: NOW }).books[0];
  return {
    corp: { owed: corp.owed, credit: corp.credit },
    personal: { owed: mine.account?.owes?.amount ?? 0, credit: mine.credit },
  };
}

describe('the Tax tab matches the corp book for a running account', () => {
  it.each([
    ['no payment, no correction', [], []],
    ['a whole day paid', [pay(222_000)], []],
    ['everything paid and some over', [pay(500_000)], []],
    ['part of a day paid', [pay(100_000)], []],
    ['a charge on a mined day, part paid', [pay(444_000)], [adjust('a', '2026-10-15', 300_000)]],
    ['a charge on a day the member did not mine', [], [adjust('a', '2026-10-05', 1_000_000)]],
    ['a credit on a day the member did not mine', [], [adjust('a', '2026-10-05', -500_000)]],
    ['a credit bigger than its own day', [], [adjust('a', '2026-10-15', -1_000_000)]],
    ['a charge on a mined day, paid in full', [pay(744_000)], [adjust('a', '2026-10-15', 300_000)]],
  ])('%s', (_name, payments, adjustments) => {
    const { corp, personal } = both(payments, adjustments);
    expect(personal).toEqual(corp);
  });
});
