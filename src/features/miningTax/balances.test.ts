import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { allMembers, type DisplayRow } from './groupRows';
import { PayeeAccounts } from './payeeAccounts';
import type { MoonMiningTaxRow } from './snapshot';
import { computePayeeBalances, summarizeUnassigned } from './balances';

const CHAR_A = 1;

function payee(id: string, name: string): PayeeRecord {
  return { id, characterId: CHAR_A, name, defaultTaxPct: 10, updatedAt: 1 };
}

function assignment(overrides: Partial<MiningTaxAssignmentRecord>): MiningTaxAssignmentRecord {
  return {
    id: 'a',
    characterId: CHAR_A,
    date: '2026-09-04',
    solarSystemId: 1,
    payeeId: 'p1',
    oreLines: [],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'outstanding',
    updatedAt: 1,
    ...overrides,
  };
}

function row(): MoonMiningTaxRow {
  return {
    characterId: CHAR_A,
    characterName: 'Pilot',
    entry: { characterId: CHAR_A, date: '2026-09-04', solarSystemId: 1, oreLines: [] },
    assignments: [],
    unassignedOreLines: [],
  };
}

function displayRow(
  a: MiningTaxAssignmentRecord | null,
  extra: Partial<DisplayRow> = {}
): DisplayRow {
  return {
    key: a?.id ?? 'unassigned',
    row: row(),
    assignment: a,
    status: a?.status ?? 'unassigned',
    ...extra,
  };
}

/** The accounts the balances read, from the same rows and some links. */
const accountsOf = (rows: DisplayRow[], payees: PayeeRecord[], paid: [string, number][] = []) =>
  PayeeAccounts.build({
    assignments: rows.flatMap((dr) => allMembers(dr).map((m) => m.assignment)),
    payees,
    links: paid.map(([payeeId, amount], i) => ({
      payeeId,
      kind: 'journal' as const,
      refId: i + 1,
      amount,
      paidOn: '2026-09-10',
      source: 'manual' as const,
    })),
  });

describe('computePayeeBalances with duplicate Payees', () => {
  it('sums a duplicate record into its primary and lists the Payee once', () => {
    const rows = [
      displayRow(assignment({ id: 'a1', payeeId: 'p1', taxOwed: 100 })),
      displayRow(assignment({ id: 'a2', payeeId: 'p2', taxOwed: 40 })),
    ];
    const payees = [payee('p1', 'Vega'), payee('p2', 'Vega')];
    const balances = computePayeeBalances(
      rows,
      payees,
      accountsOf(rows, payees),
      new Map([['p2', 'p1']])
    );
    expect(balances).toHaveLength(1);
    expect(balances[0].payee.id).toBe('p1');
    expect(balances[0].owed).toBe(140);
    expect(balances[0].members.map((m) => m.assignment.id)).toEqual(['a1', 'a2']);
  });
});

describe('computePayeeBalances', () => {
  const payees = [payee('p1', 'Vega'), payee('p2', 'Lunar'), payee('p3', 'Oren')];

  it("owes what each Payee's account owes, owed-first, keeping settled Payees at zero", () => {
    const rows = [
      displayRow(assignment({ id: 'a1', payeeId: 'p1', taxOwed: 100 })),
      displayRow(assignment({ id: 'a2', payeeId: 'p2', taxOwed: 500 })),
      displayRow(assignment({ id: 'a4', payeeId: 'p1', taxOwed: 25, date: '2026-09-05' })),
    ];

    // 60 ISK linked to Vega pays its oldest day's first 60.
    const balances = computePayeeBalances(rows, payees, accountsOf(rows, payees, [['p1', 60]]));

    expect(balances.map((b) => [b.payee.name, b.owed])).toEqual([
      ['Lunar', 500],
      ['Vega', 65],
      ['Oren', 0],
    ]);
    expect(balances[1].members.map((m) => m.assignment.id)).toEqual(['a1', 'a4']);
    expect(balances[1].account?.owes?.oldest).toBe('2026-09-04');
    expect(balances[2].members).toEqual([]);
  });

  it('counts every outstanding member of a joined group, and skips an unknown Payee', () => {
    const primary = assignment({ id: 'g1', payeeId: 'p2', taxOwed: 10, groupId: 'g' });
    const sibling = assignment({ id: 'g2', payeeId: 'p2', taxOwed: 20, groupId: 'g' });
    const orphan = assignment({ id: 'x', payeeId: 'gone', taxOwed: 999 });
    const rows = [
      displayRow(primary, { groupMembers: [{ row: row(), assignment: sibling }] }),
      displayRow(orphan),
    ];

    const balances = computePayeeBalances(rows, payees, accountsOf(rows, payees));

    expect(balances[0].payee.id).toBe('p2');
    expect(balances[0].owed).toBe(30);
    expect(balances.every((b) => b.payee.id !== 'gone')).toBe(true);
  });

  it("holds a Payee's credit off its account, even with nothing outstanding in view", () => {
    const rows = [
      displayRow(assignment({ id: 'a1', payeeId: 'p1', taxOwed: 100, status: 'paid' })),
    ];
    const balances = computePayeeBalances(rows, payees, accountsOf(rows, payees, [['p1', 150]]));
    expect(balances.find((b) => b.payee.id === 'p1')).toMatchObject({ owed: 0, credit: 50 });
  });

  it("reads a Corp Tax Book Payee's credit off its Miners' accounts", () => {
    const corp = payee('corp-book:98000001', 'Brass Meridian');
    const [balance] = computePayeeBalances(
      [],
      [corp],
      accountsOf([], []),
      new Map(),
      new Map([[corp.id, 2_000]])
    );
    expect(balance).toMatchObject({ owed: 0, credit: 2_000 });
  });

  it("owes a Corp Tax Book's Payee what its rows still owe", () => {
    const corp = payee('corp-book:98000001', 'Brass Meridian');
    const rows = [displayRow(assignment({ id: 'b1', payeeId: corp.id, taxOwed: 70 }))];
    const [balance] = computePayeeBalances(rows, [corp], accountsOf([], []));
    expect(balance).toMatchObject({ owed: 70 });
    expect(balance.account).toBeUndefined();
  });
});

describe('summarizeUnassigned', () => {
  it('counts unassigned rows and sums their live value', () => {
    const rows = [
      displayRow(null),
      displayRow(assignment({ id: 'a1' })),
      { ...displayRow(null), key: 'u2' },
    ];
    expect(summarizeUnassigned(rows, () => 40)).toEqual({ entryCount: 2, estimatedValue: 80 });
  });
});
