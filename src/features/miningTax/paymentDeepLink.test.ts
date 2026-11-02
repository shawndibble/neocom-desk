import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import type { DisplayRow } from './groupRows';
import { findRowForEntry, miningTaxEntryHref } from './paymentDeepLink';
import type { MoonMiningTaxRow } from './snapshot';

function assignment(overrides: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord {
  return {
    id: 'a1',
    characterId: 1,
    date: '2026-09-04',
    solarSystemId: 1,
    payeeId: 'p1',
    oreLines: [],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'paid',
    updatedAt: 1,
    ...overrides,
  };
}

function displayRow(a: MiningTaxAssignmentRecord, groupMembers?: DisplayRow['groupMembers']) {
  const row = {
    characterId: a.characterId,
    entry: { date: a.date },
  } as unknown as MoonMiningTaxRow;
  return { key: a.id, row, assignment: a, status: 'paid', groupMembers } as DisplayRow;
}

describe('miningTaxEntryHref', () => {
  it('names the assignment in the scoped tax param', () => {
    expect(miningTaxEntryHref('abc-1')).toBe('/mining/tax?tax.entry=abc-1');
  });
});

describe('findRowForEntry', () => {
  it('finds the row holding the assignment', () => {
    const hit = displayRow(assignment({ id: 'hit' }));
    const miss = displayRow(assignment({ id: 'miss' }));
    expect(findRowForEntry([miss, hit], 'hit')).toBe(hit);
  });

  it('finds the joined row a member was combined into', () => {
    const second = assignment({ id: 'second', date: '2026-09-05' });
    const joined = displayRow(assignment({ id: 'first' }), [
      { row: {} as MoonMiningTaxRow, assignment: second },
    ]);
    expect(findRowForEntry([joined], 'second')).toBe(joined);
  });

  it('returns null when no row holds it', () => {
    expect(findRowForEntry([displayRow(assignment())], 'nope')).toBeNull();
  });
});
