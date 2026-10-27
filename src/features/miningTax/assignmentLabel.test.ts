import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import { labelSuggestions, normalizeLabel } from './assignmentLabel';

function a(over: Partial<MiningTaxAssignmentRecord>): MiningTaxAssignmentRecord {
  return {
    id: 'x',
    characterId: 1,
    date: '2026-09-01',
    solarSystemId: 1,
    payeeId: 'p1',
    oreLines: [],
    taxPct: 5,
    estimatedValue: 0,
    taxOwed: 0,
    status: 'outstanding',
    updatedAt: 1,
    ...over,
  };
}

describe('normalizeLabel', () => {
  it('trims, and turns blank or missing into undefined', () => {
    expect(normalizeLabel('  Athanor  ')).toBe('Athanor');
    expect(normalizeLabel('   ')).toBeUndefined();
    expect(normalizeLabel(undefined)).toBeUndefined();
  });
});

describe('labelSuggestions', () => {
  it('lists distinct labels already used for the same Payee and system, most recent first', () => {
    const rows = [
      a({ label: 'Moon 1', date: '2026-09-01' }),
      a({ label: 'Moon 2', date: '2026-09-03' }),
      a({ label: 'Moon 1', date: '2026-09-02' }),
    ];
    expect(labelSuggestions(rows, 'p1', 1)).toEqual(['Moon 2', 'Moon 1']);
  });

  it('ignores other Payees, other systems and unlabelled rows', () => {
    const rows = [
      a({ label: 'Other payee', payeeId: 'p2' }),
      a({ label: 'Other system', solarSystemId: 2 }),
      a({}),
    ];
    expect(labelSuggestions(rows, 'p1', 1)).toEqual([]);
  });
});
