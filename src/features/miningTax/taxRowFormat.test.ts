import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import type { DisplayRow, GroupMember } from './groupRows';
import type { MoonMiningTaxRow } from './snapshot';
import { dateLabel, dateRangeOf, oreTypeIdsOf, shortDateLabel, taxOwedOf } from './taxRowFormat';

function assignment(date: string, over: Partial<MiningTaxAssignmentRecord> = {}) {
  return {
    id: `a-${date}`,
    characterId: 1,
    date,
    solarSystemId: 5,
    payeeId: 'p',
    oreLines: [{ typeId: 10, quantity: 1 }],
    taxPct: 10,
    estimatedValue: 100,
    taxOwed: 10,
    status: 'outstanding',
    updatedAt: 1,
    ...over,
  } as MiningTaxAssignmentRecord;
}

function row(date: string, a: MiningTaxAssignmentRecord | null): MoonMiningTaxRow {
  return {
    characterId: 1,
    characterName: 'P',
    entry: { characterId: 1, date, solarSystemId: 5, oreLines: [] },
    assignments: a ? [a] : [],
    unassignedOreLines: [{ typeId: 99, quantity: 3 }],
  } as MoonMiningTaxRow;
}

function single(date: string): DisplayRow {
  const a = assignment(date);
  return { key: a.id, row: row(date, a), assignment: a, status: 'outstanding' };
}

function combined(dates: string[]): DisplayRow {
  const members: GroupMember[] = dates.map((d, i) => {
    const a = assignment(d, { oreLines: [{ typeId: 10 + i, quantity: 1 }] });
    return { row: row(d, a), assignment: a };
  });
  const [first, ...rest] = members;
  return {
    key: 'g',
    row: first!.row,
    assignment: first!.assignment,
    status: 'outstanding',
    groupMembers: rest,
  };
}

describe('taxRowFormat', () => {
  it('sorts a combined row into earliest-first dates', () => {
    expect(dateRangeOf(combined(['2026-10-04', '2026-10-03']))).toEqual([
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('drops the repeated year in a same-year range', () => {
    expect(shortDateLabel(combined(['2026-10-03', '2026-10-04']))).toBe('2026-10-03 – 10-04');
  });

  it('keeps both years across a year boundary', () => {
    const dr = combined(['2025-12-31', '2026-01-01']);
    expect(shortDateLabel(dr)).toBe(dateLabel(dr));
  });

  it('shows a lone date as-is', () => {
    expect(shortDateLabel(single('2026-10-03'))).toBe('2026-10-03');
  });

  it('sums tax over every member', () => {
    expect(taxOwedOf(combined(['2026-10-03', '2026-10-04']))).toBe(20);
  });

  it('lists distinct ore types, falling back to the unassigned residual', () => {
    expect(oreTypeIdsOf(combined(['2026-10-03', '2026-10-04']))).toEqual([10, 11]);
    const residual: DisplayRow = {
      key: 'r',
      row: row('2026-10-03', null),
      assignment: null,
      status: 'unassigned',
    };
    expect(oreTypeIdsOf(residual)).toEqual([99]);
  });
});
