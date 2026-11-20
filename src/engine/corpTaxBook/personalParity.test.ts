import { describe, expect, it } from 'vitest';
import { buildBookView } from './bookView';
import { overlayCorpBooks, type PersonalBook, type PersonalEntry } from './personal';
import type { Adjustment } from './statements';
import type { ToleranceExemption } from './toleranceExemptions';

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

const exempt = (date: string, forgive: number): ToleranceExemption => ({
  id: `x-${date}`,
  minerId: MINER,
  date,
  forgive,
  reason: 'Officer',
  by: 1,
  at: '2026-10-18T13:30:00Z',
});

function both(
  payments: ReturnType<typeof pay>[],
  adjustments: Adjustment[],
  toleranceExemptions: ToleranceExemption[] = [],
  paidThrough?: string
) {
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
    toleranceExemptions,
    extractions: [],
    paidStatementIds: new Set(),
    pricesOn,
    runningAccountFrom,
    ...(paidThrough ? { minerPaidThrough: new Map([[MINER, paidThrough]]) } : {}),
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
    toleranceExemptions,
    hubId: 'jita',
    oreForm: 'compressed',
    pricesOn,
    inFlight: [],
    runningAccountFrom,
    ...(paidThrough ? { minerPaidThrough: new Map([[MINER, paidThrough]]) } : {}),
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

describe('reversals and exemptions, on both pages', () => {
  const reversed = (a: Adjustment): Adjustment => ({
    ...a,
    reversed: { by: 2, at: '2026-10-18T13:20:00Z', reason: 'Entered twice' },
  });
  it('ignores a reversed charge', () => {
    const { corp, personal } = both([], [reversed(adjust('a', '2026-10-15', 300_000))]);
    expect(corp).toEqual({ owed: 444_000, credit: 0 });
    expect(personal).toEqual(corp);
  });
  it('forgives 500 short of a day by default', () => {
    const { corp, personal } = both([pay(221_500 + 222_000)], []);
    expect(corp).toEqual({ owed: 0, credit: 0 });
    expect(personal).toEqual(corp);
  });
  it('owes the 500 again when an officer exempts the day', () => {
    const { corp, personal } = both([pay(221_500)], [], [exempt('2026-10-15', 0)]);
    expect(corp).toEqual({ owed: 222_500, credit: 0 });
    expect(personal).toEqual(corp);
  });
  it('forgives only what an officer names, and owes the rest', () => {
    const { corp, personal } = both([pay(221_500)], [], [exempt('2026-10-15', 200)]);
    expect(corp).toEqual({ owed: 222_300, credit: 0 });
    expect(personal).toEqual(corp);
  });
});

describe('a day the book recorded paid, on both pages', () => {
  const through = '2026-10-16';
  it('forgives late shortfall on recorded-paid days', () => {
    const { corp, personal } = both([], [], [], through);
    expect(corp).toEqual({ owed: 0, credit: 0 });
    expect(personal).toEqual(corp);
  });
  it('pays a recorded-paid day from the payment that paid it, so nothing is left over as credit', () => {
    const { corp, personal } = both([pay(444_000)], [], [], through);
    expect(corp).toEqual({ owed: 0, credit: 0 });
    expect(personal).toEqual(corp);
  });
  it('keeps an officer charge on a recorded-paid day owed', () => {
    const { corp, personal } = both([], [adjust('a', '2026-10-15', 300_000)], [], through);
    expect(corp).toEqual({ owed: 300_000, credit: 0 });
    expect(personal).toEqual(corp);
  });
  it('lets an exemption override the recorded-paid day', () => {
    const { corp, personal } = both([pay(221_500)], [], [exempt('2026-10-15', 0)], through);
    expect(corp).toEqual({ owed: 500, credit: 0 });
    expect(personal).toEqual(corp);
  });
});
