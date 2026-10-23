import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import type { DisplayRow } from './groupRows';
import type { MoonMiningTaxRow } from './snapshot';
import { rowMenuActions, type RowMenuAction } from './rowMenu';

function assignment(overrides: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord {
  return {
    id: 'a1',
    characterId: 1,
    date: '2026-09-04',
    solarSystemId: 1,
    payeeId: 'payee-1',
    oreLines: [],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'outstanding',
    updatedAt: 1,
    ...overrides,
  };
}

const row: MoonMiningTaxRow = {
  characterId: 1,
  characterName: 'Pilot',
  entry: { characterId: 1, date: '2026-09-04', solarSystemId: 1, oreLines: [] },
  assignments: [],
  unassignedOreLines: [],
};

function dr(overrides: Partial<DisplayRow> = {}): DisplayRow {
  const a = assignment();
  return { key: a.id, row, assignment: a, status: 'outstanding', ...overrides };
}

const ids = (groups: RowMenuAction[][]) => groups.flat().map((a) => a.id);

describe('rowMenuActions', () => {
  it('leads with View details, then Settle up, for an outstanding row', () => {
    const out = ids(rowMenuActions(dr()));
    expect(out.slice(0, 3)).toEqual(['view', 'settleUp', 'edit']);
    expect(out).toEqual(
      expect.arrayContaining([
        'linkWallet',
        'markPaid',
        'join',
        'split',
        'copyBreakdown',
        'unassign',
      ])
    );
    expect(out).not.toContain('unmarkPaid');
    expect(out).not.toContain('linkTransaction');
  });

  it('offers unmark, link transaction and split on a paid row, but no settle up', () => {
    const paid = dr({ status: 'paid', assignment: assignment({ status: 'paid' }) });
    const out = ids(rowMenuActions(paid));
    expect(out[0]).toBe('view');
    expect(out).toEqual(
      expect.arrayContaining(['edit', 'linkTransaction', 'unmarkPaid', 'split', 'unassign'])
    );
    expect(out).not.toContain('settleUp');
    expect(out).not.toContain('markPaid');
    expect(out).not.toContain('join');
  });

  it('puts Unassign last, alone in its group', () => {
    const groups = rowMenuActions(dr());
    expect(groups.at(-1)).toEqual([{ id: 'unassign' }]);
  });

  it('offers only Dismiss and Combine on an unassigned row', () => {
    const out = ids(rowMenuActions(dr({ assignment: null, status: 'unassigned' })));
    expect(out).toEqual(['view', 'dismiss', 'join']);
  });

  it('offers Undo on a dismissed row', () => {
    const out = ids(
      rowMenuActions(dr({ assignment: assignment({ status: 'dismissed' }), status: 'dismissed' }))
    );
    expect(out).toEqual(['view', 'undismiss']);
  });

  it('offers Accept new total instead of Settle up on a needs-review row', () => {
    const out = ids(
      rowMenuActions(
        dr({ status: 'needs-review', assignment: assignment({ status: 'needs-review' }) })
      )
    );
    expect(out).toEqual(expect.arrayContaining(['view', 'resolve', 'reviewSplit', 'edit']));
    expect(out).not.toContain('settleUp');
    expect(out).not.toContain('split');
  });

  it('does not offer Split on a row that belongs to a group', () => {
    const grouped = dr({ assignment: assignment({ groupId: 'g' }) });
    expect(ids(rowMenuActions(grouped))).not.toContain('split');
  });

  it('gives a combined entry take-out per day, uncombine and unassign all', () => {
    const a = assignment({ id: 'a1', groupId: 'g' });
    const b = assignment({ id: 'a2', groupId: 'g', date: '2026-09-05' });
    const combined = dr({
      assignment: a,
      groupMembers: [{ row, assignment: b }],
    });
    const actions = rowMenuActions(combined).flat();
    expect(actions.map((x) => x.id)).toEqual([
      'view',
      'settleUp',
      'edit',
      'linkWallet',
      'markGroupPaid',
      'takeOut',
      'takeOut',
      'uncombine',
      'unassign',
    ]);
    expect(actions.filter((x) => x.id === 'takeOut')).toHaveLength(2);
  });

  it('offers Pay on a corp book row that is owed, and nothing else beyond View', () => {
    const corp = {
      kind: 'row',
      corpName: 'Corp',
      view: { state: 'billed', corporationId: 1 },
    } as unknown as DisplayRow['corp'];
    expect(ids(rowMenuActions(dr({ corp })))).toEqual(['view', 'corpPay']);
    const settled = {
      kind: 'row',
      corpName: 'Corp',
      view: { state: 'paid', corporationId: 1 },
    } as unknown as DisplayRow['corp'];
    expect(ids(rowMenuActions(dr({ corp: settled, status: 'paid' })))).toEqual(['view']);
  });
});
