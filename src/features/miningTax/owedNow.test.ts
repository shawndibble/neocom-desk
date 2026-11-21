import { describe, expect, it, vi } from 'vitest';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { MoonMiningTaxRow } from './snapshot';

const mocks = vi.hoisted(() => ({
  books: vi.fn(async () => [] as unknown[]),
  made: vi.fn(async () => ({ payments: [], sources: [] })),
}));
vi.mock('./corpBook/corpBookSources', () => ({
  loadTrackedCorpBooks: mocks.books,
  loadCorpNames: async () => new Map(),
  loadBookPrices: async () => new Map(),
}));
vi.mock('./madePayments', () => ({ loadMadePaymentsWithStatus: mocks.made }));

const { loadOwedBalances } = await import('./owedNow');

const CHAR = 90000001;
const SYSTEM = 30000142;
const ORE = 45490;

function assignment(id: string, overrides: Partial<MiningTaxAssignmentRecord> = {}) {
  return {
    id,
    characterId: CHAR,
    date: '2026-11-01',
    solarSystemId: SYSTEM,
    payeeId: 'p1',
    oreLines: [{ typeId: ORE, quantity: 100 }],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'outstanding',
    updatedAt: 1,
    ...overrides,
  } satisfies MiningTaxAssignmentRecord;
}

function row(date: string, assignments: MiningTaxAssignmentRecord[]): MoonMiningTaxRow {
  return {
    characterId: CHAR,
    characterName: 'Miner',
    entry: {
      characterId: CHAR,
      date,
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ORE, quantity: 100 }],
    },
    assignments,
    unassignedOreLines: [],
  };
}

const payee: PayeeRecord = {
  id: 'p1',
  characterId: CHAR,
  name: 'Friend',
  defaultTaxPct: 10,
  updatedAt: 1,
};

describe('loadOwedBalances', () => {
  it("without a Corp Tax Book, is the personal ledger: each Payee's account, oldest day first", async () => {
    const { balances, unassignedCount } = await loadOwedBalances({
      rows: [
        row('2026-11-01', [assignment('a1')]),
        row('2026-11-02', [assignment('a2', { date: '2026-11-02', taxOwed: 50 })]),
        row('2026-11-03', [assignment('a3', { date: '2026-11-03', taxOwed: 30 })]),
        { ...row('2026-11-04', []), unassignedOreLines: [{ typeId: ORE, quantity: 100 }] },
      ],
      characters: [{ characterId: CHAR, characterName: 'Miner' }],
      payeesByCharacter: new Map([[CHAR, [payee]]]),
      // 100 ISK linked to the Payee pays its oldest day, whichever entry the pilot meant.
      paymentLinks: [
        {
          payeeId: 'p1',
          kind: 'journal',
          refId: 1,
          amount: 100,
          paidOn: '2026-11-05',
          source: 'manual',
        },
      ],
      payeeCheckpoints: new Map(),
      billedElsewhere: new Map(),
    });

    expect(balances).toHaveLength(1);
    expect(unassignedCount).toBe(1);
    expect(balances[0]).toMatchObject({ payee: { id: 'p1' }, owed: 80 });
    expect(balances[0].members.map((m) => m.assignment.id)).toEqual(['a2', 'a3']);
    // No book to overlay: the wallet is never read for in-flight donations.
    expect(mocks.made).not.toHaveBeenCalled();
  });
});
