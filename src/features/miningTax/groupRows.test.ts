import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import type { MoonMiningTaxRow } from './snapshot';
import { allMembers, flatten, worstStatus } from './groupRows';

const CHAR_A = 1;
const TYPE_A = 45490;

function assignment(overrides: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord {
  return {
    id: 'a1',
    characterId: CHAR_A,
    date: '2026-09-04',
    solarSystemId: 1,
    payeeId: 'payee-1',
    oreLines: [{ typeId: TYPE_A, quantity: 100 }],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'outstanding',
    updatedAt: 1,
    ...overrides,
  };
}

function row(overrides: Partial<MoonMiningTaxRow> = {}): MoonMiningTaxRow {
  return {
    characterId: CHAR_A,
    characterName: 'Pilot',
    entry: { characterId: CHAR_A, date: '2026-09-04', solarSystemId: 1, oreLines: [] },
    assignments: [],
    unassignedOreLines: [],
    ...overrides,
  };
}

describe('flatten', () => {
  it('renders an ordinary single Assignment as one ungrouped row', () => {
    const a = assignment();
    const r = row({ assignments: [a] });

    const out = flatten([r]);

    expect(out).toHaveLength(1);
    expect(out[0].key).toBe(a.id);
    expect(out[0].groupMembers).toBeUndefined();
    expect(out[0].status).toBe('outstanding');
  });

  it('combines two Assignments sharing a groupId into one row, earliest date primary', () => {
    const a = assignment({ id: 'a1', date: '2026-09-05', groupId: 'g1' });
    const b = assignment({ id: 'a2', date: '2026-09-04', groupId: 'g1' });
    const rowA = row({ entry: { ...row().entry, date: '2026-09-05' }, assignments: [a] });
    const rowB = row({ entry: { ...row().entry, date: '2026-09-04' }, assignments: [b] });

    const out = flatten([rowA, rowB]);

    expect(out).toHaveLength(1);
    expect(out[0].key).toBe(b.id); // 2026-09-04 sorts first
    expect(out[0].groupMembers).toHaveLength(1);
    expect(out[0].groupMembers?.[0].assignment.id).toBe(a.id);
    expect(
      allMembers(out[0])
        .map((m) => m.assignment.id)
        .sort()
    ).toEqual(['a1', 'a2']);
  });

  it('renders a lone surviving groupId as an ordinary ungrouped row', () => {
    const a = assignment({ id: 'a1', groupId: 'orphan-group' });
    const r = row({ assignments: [a] });

    const out = flatten([r]);

    expect(out).toHaveLength(1);
    expect(out[0].groupMembers).toBeUndefined();
    expect(out[0].key).toBe(a.id);
  });

  it("combines a group's status as the worst among its members", () => {
    const a = assignment({ id: 'a1', date: '2026-09-04', groupId: 'g1', status: 'paid' });
    const b = assignment({ id: 'a2', date: '2026-09-05', groupId: 'g1', status: 'outstanding' });
    const rowA = row({ entry: { ...row().entry, date: '2026-09-04' }, assignments: [a] });
    const rowB = row({ entry: { ...row().entry, date: '2026-09-05' }, assignments: [b] });

    const out = flatten([rowA, rowB]);

    expect(out[0].status).toBe('outstanding');
  });

  it('still emits the unassigned residual for a row with no covering Assignment', () => {
    const r = row({ unassignedOreLines: [{ typeId: TYPE_A, quantity: 50 }] });

    const out = flatten([r]);

    expect(out).toHaveLength(1);
    expect(out[0].assignment).toBeNull();
    expect(out[0].status).toBe('unassigned');
  });
});

describe('worstStatus', () => {
  it('prefers needs-review over everything else', () => {
    expect(worstStatus(['paid', 'needs-review', 'outstanding'])).toBe('needs-review');
  });

  it('prefers outstanding over paid and dismissed', () => {
    expect(worstStatus(['dismissed', 'paid', 'outstanding'])).toBe('outstanding');
  });
});
