import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { DisplayRow } from './groupRows';
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

describe('computePayeeBalances', () => {
  const payees = [payee('p1', 'Vega'), payee('p2', 'Lunar'), payee('p3', 'Oren')];

  it('sums only outstanding tax per Payee, owed-first, keeping settled Payees at zero', () => {
    const rows = [
      displayRow(assignment({ id: 'a1', payeeId: 'p1', taxOwed: 100 })),
      displayRow(assignment({ id: 'a2', payeeId: 'p2', taxOwed: 500 })),
      displayRow(assignment({ id: 'a3', payeeId: 'p1', taxOwed: 50, status: 'paid' })),
      displayRow(assignment({ id: 'a4', payeeId: 'p1', taxOwed: 25 })),
    ];

    const balances = computePayeeBalances(rows, payees);

    expect(balances.map((b) => [b.payee.name, b.owed])).toEqual([
      ['Lunar', 500],
      ['Vega', 125],
      ['Oren', 0],
    ]);
    expect(balances[1].members.map((m) => m.assignment.id)).toEqual(['a1', 'a4']);
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

    const balances = computePayeeBalances(rows, payees);

    expect(balances[0].payee.id).toBe('p2');
    expect(balances[0].owed).toBe(30);
    expect(balances.every((b) => b.payee.id !== 'gone')).toBe(true);
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
