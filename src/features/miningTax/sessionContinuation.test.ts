import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import { flatten } from './groupRows';
import type { MoonMiningTaxRow } from './snapshot';
import { findSessionContinuations, nextEveDate } from './sessionContinuation';

const AINSAN = 30001;
const TALIDAL = 30002;
const ZEOLITES = 45490;

function assignment(
  date: string,
  overrides: Partial<MiningTaxAssignmentRecord> = {}
): MiningTaxAssignmentRecord {
  return {
    id: `a-${date}-${overrides.solarSystemId ?? AINSAN}-${overrides.payeeId ?? 'st'}`,
    characterId: 1,
    date,
    solarSystemId: AINSAN,
    payeeId: 'st',
    oreLines: [{ typeId: ZEOLITES, quantity: 100 }],
    taxPct: 5,
    estimatedValue: 1000,
    taxOwed: 50,
    status: 'outstanding',
    updatedAt: 0,
    ...overrides,
  };
}

function row(
  date: string,
  assignments: MiningTaxAssignmentRecord[],
  { solarSystemId = AINSAN, characterId = 1, unassigned = assignments.length === 0 } = {}
): MoonMiningTaxRow {
  const oreLines = [{ typeId: ZEOLITES, quantity: 100 }];
  return {
    characterId,
    characterName: 'Mero Otichoda',
    entry: { characterId, date, solarSystemId, oreLines },
    assignments,
    unassignedOreLines: unassigned ? oreLines : [],
  };
}

describe('nextEveDate', () => {
  it('rolls over months and years', () => {
    expect(nextEveDate('2026-09-30')).toBe('2026-10-01');
    expect(nextEveDate('2026-12-31')).toBe('2027-01-01');
  });
});

describe('findSessionContinuations', () => {
  it('pairs a fully unassigned day with the owed day before it in the same system', () => {
    const previous = assignment('2026-10-03');
    const rows = flatten([row('2026-10-03', [previous]), row('2026-10-04', [])]);

    const found = findSessionContinuations(rows);

    expect(found).toHaveLength(1);
    expect(found[0].next.row.entry.date).toBe('2026-10-04');
    expect(found[0].previous.id).toBe(previous.id);
  });

  it('continues an already-combined session from its last day', () => {
    const d3 = assignment('2026-10-03', { groupId: 'g' });
    const d4 = assignment('2026-10-04', { groupId: 'g' });
    const rows = flatten([row('2026-10-03', [d3]), row('2026-10-04', [d4]), row('2026-10-05', [])]);

    const found = findSessionContinuations(rows);

    expect(found.map((c) => c.previous.id)).toEqual([d4.id]);
    expect(found[0].previousRow.groupMembers).toHaveLength(1);
  });

  it('ignores a gap of more than one day, another system, or another pilot', () => {
    const rows = flatten([
      row('2026-10-01', [assignment('2026-10-01')]),
      row('2026-10-03', []),
      row('2026-10-02', [], { solarSystemId: TALIDAL }),
      row('2026-10-02', [], { characterId: 2 }),
    ]);
    expect(findSessionContinuations(rows)).toEqual([]);
  });

  it('never continues a session that was already paid or dismissed', () => {
    const rows = flatten([
      row('2026-10-03', [assignment('2026-10-03', { status: 'paid', paidAt: 1 })]),
      row('2026-10-04', []),
      row('2026-10-05', [
        assignment('2026-10-05', {
          status: 'dismissed',
          payeeId: undefined,
          solarSystemId: AINSAN,
        }),
      ]),
      row('2026-10-06', []),
    ]);
    expect(findSessionContinuations(rows)).toEqual([]);
  });

  it('stays out of it when the day before was split between two Payees', () => {
    const rows = flatten([
      row('2026-10-03', [
        assignment('2026-10-03', { payeeId: 'st' }),
        assignment('2026-10-03', { payeeId: 'bu' }),
      ]),
      row('2026-10-04', []),
    ]);
    expect(findSessionContinuations(rows)).toEqual([]);
  });

  it('looks past a dismissed slice of the previous day', () => {
    const owed = assignment('2026-10-03');
    const rows = flatten([
      row('2026-10-03', [
        owed,
        assignment('2026-10-03', { payeeId: undefined, status: 'dismissed', id: 'dismissed' }),
      ]),
      row('2026-10-04', []),
    ]);
    const found = findSessionContinuations(rows);
    expect(found.map((c) => c.previous.id)).toEqual([owed.id]);
    expect(found[0].payeeId).toBe('st');
  });

  it('only offers a day nobody has assigned any of', () => {
    const rows = flatten([
      row('2026-10-03', [assignment('2026-10-03')]),
      row('2026-10-04', [assignment('2026-10-04', { payeeId: 'bu' })], { unassigned: true }),
    ]);
    expect(findSessionContinuations(rows)).toEqual([]);
  });
});
