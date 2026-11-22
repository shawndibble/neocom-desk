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

const { billedElsewhereOf, bookCreditsOf, bookOwnersOf, bookDaysOf, bookOwesOf, loadOwedBalances } =
  await import('./owedNow');

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

describe('billedElsewhereOf', () => {
  const none = new Map();
  const noneAbsorbed = new Map<string, Set<string>>();

  it('is nothing without a Corp Tax Book overlay', () => {
    expect(billedElsewhereOf(undefined).size).toBe(0);
  });

  it("reads an Assignment another Payee's book bills too as that share", () => {
    const out = billedElsewhereOf({
      alsoBilled: new Map([['e1', new Map([['a1', 0.25]])]]),
      trimmed: none,
      absorbed: noneAbsorbed,
    });
    expect([...out]).toEqual([['a1', 0.25]]);
  });

  // A Default System's unpaid Assignment a book took part of: the book bills that part, so the
  // Payee is owed only what stays with it (the rest of the day is no second bill).
  it('reads an Assignment a book took part of as the part it no longer keeps', () => {
    const out = billedElsewhereOf({
      alsoBilled: none,
      trimmed: new Map([['e1', new Map([['a1', { oreLines: [], valueShare: 0.4 }]])]]),
      absorbed: noneAbsorbed,
    });
    expect(out.get('a1')).toBeCloseTo(0.6, 9);
  });

  // A Conflict day: the personal Payee waits, so the book's row is the day's one bill.
  it('reads a contested Assignment as the share the Payee waits on', () => {
    const out = billedElsewhereOf({
      alsoBilled: none,
      trimmed: none,
      absorbed: noneAbsorbed,
      conflicted: new Map([['e1', new Map([['a1', 1]])]]),
    });
    expect(out.get('a1')).toBe(1);
  });

  it('adds a contested share to what a book bills too, never past all of it', () => {
    const out = billedElsewhereOf({
      alsoBilled: new Map([['e1', new Map([['a1', 0.5]])]]),
      trimmed: none,
      absorbed: noneAbsorbed,
      conflicted: new Map([['e1', new Map([['a1', 0.25]])]]),
    });
    expect(out.get('a1')).toBeCloseTo(0.625, 9);
  });

  it('composes both, the second relative to what the first left', () => {
    const out = billedElsewhereOf({
      alsoBilled: new Map([['e1', new Map([['a1', 0.5]])]]),
      trimmed: new Map([['e1', new Map([['a1', { oreLines: [], valueShare: 0.4 }]])]]),
      absorbed: noneAbsorbed,
    });
    // 0.4 stays after the trim, and half of that is billed again: 0.2 is the Payee's.
    expect(out.get('a1')).toBeCloseTo(0.8, 9);
  });

  // The corporation's own Payee (or a Default System's day) a book took whole: the book's row
  // stands for it, so its Payee owes none of it.
  it('reads an Assignment a book took whole as all of it', () => {
    const out = billedElsewhereOf({
      alsoBilled: none,
      trimmed: none,
      absorbed: new Map([['e1', new Set(['a1'])]]),
    });
    expect(out.get('a1')).toBe(1);
  });
});

describe("a Corp Tax Book's figures by the selected Characters", () => {
  const book = (id: string, characterIds: number[], amount: number, days: number) => ({
    payee: { id },
    loaded: { characterIds },
    summary: { credit: amount / 10, account: { owes: { amount, days, oldest: '2026-11-03' } } },
  });
  const view = {
    books: [book('corp-book:1', [1, 2], 1_000, 2), book('corp-book:2', [3], 2_000, 5)],
  } as unknown as Parameters<typeof bookOwesOf>[0];

  it('is every book with no Character selected out', () => {
    expect([...bookOwesOf(view)]).toEqual([
      ['corp-book:1', 1_000],
      ['corp-book:2', 2_000],
    ]);
  });

  // A book's figure is the book's whole account whatever the selector says, but the selector
  // decides which books are shown at all.
  it('leaves out a book none of the selected Characters is in, and keeps the others whole', () => {
    expect([...bookOwesOf(view, new Set([2]))]).toEqual([['corp-book:1', 1_000]]);
    expect([...bookCreditsOf(view, new Set([3]))]).toEqual([['corp-book:2', 200]]);
  });

  it("counts a book's entries and oldest unpaid day off its account, not the visible rows", () => {
    expect([...bookDaysOf(view, new Set([3]))]).toEqual([
      ['corp-book:2', { days: 5, oldest: '2026-11-03' }],
    ]);
  });
});

describe('bookOwnersOf', () => {
  const corp = {
    id: 'p-corp',
    name: 'Acme',
    entityId: 98000001,
    entityKind: 'corporation',
  } as PayeeRecord;
  const name = (id: number) => (id === 98000001 ? 'Acme' : `#${id}`);

  it('owns a Payee from a loaded book alone, with no prices read', () => {
    const owners = bookOwnersOf(
      [corp],
      [{ corporationId: 98000001, memberCharacterIds: [1] }],
      name
    );
    expect([...owners]).toEqual([['p-corp', 'Acme']]);
  });

  it('leaves a book the pilot left out', () => {
    const owners = bookOwnersOf(
      [corp],
      [{ corporationId: 98000001, memberCharacterIds: [] }],
      name
    );
    expect(owners.size).toBe(0);
  });
});
