import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import type { DisplayRow } from './groupRows';
import type { MoonMiningTaxRow } from './snapshot';
import { agreedTerms, combineEligibility, dismissableRows, settleUpMembers } from './selection';

const CHAR_A = 1;
const CHAR_B = 2;
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

/** An ordinary assigned, Outstanding display row. */
function assigned(id: string, overrides: Partial<MiningTaxAssignmentRecord> = {}): DisplayRow {
  const a = assignment({ id, ...overrides });
  return {
    key: a.id,
    row: row({
      characterId: a.characterId,
      entry: {
        characterId: a.characterId,
        date: a.date,
        solarSystemId: a.solarSystemId,
        oreLines: [],
      },
      assignments: [a],
    }),
    assignment: a,
    status: a.status === 'outstanding' ? 'outstanding' : 'needs-review',
  };
}

/** An unassigned-residual display row. */
function unassigned(date: string, solarSystemId = 1, characterId = CHAR_A): DisplayRow {
  const r = row({
    characterId,
    entry: { characterId, date, solarSystemId, oreLines: [] },
    unassignedOreLines: [{ typeId: TYPE_A, quantity: 50 }],
  });
  return {
    key: `${characterId}:${date}:${solarSystemId}:unassigned`,
    row: r,
    assignment: null,
    status: 'unassigned',
  };
}

/** A joined group's display row: `primary` plus `siblings`, all sharing `groupId`. */
function grouped(groupId: string, primaryId: string, siblingIds: readonly string[]): DisplayRow {
  const primary = assigned(primaryId, { groupId });
  return {
    ...primary,
    groupMembers: siblingIds.map((id) => {
      const sibling = assigned(id, { groupId, date: '2026-09-05' });
      return { row: sibling.row, assignment: sibling.assignment as MiningTaxAssignmentRecord };
    }),
  };
}

describe('combineEligibility', () => {
  it('refuses a selection of fewer than two rows', () => {
    expect(combineEligibility([assigned('a1')])).toEqual({ ok: false, reason: 'too-few' });
    expect(combineEligibility([])).toEqual({ ok: false, reason: 'too-few' });
  });

  it('combines three compatible ungrouped rows — the two-member cap was UI-only', () => {
    const result = combineEligibility([
      assigned('a1', { date: '2026-09-04' }),
      assigned('a2', { date: '2026-09-05' }),
      assigned('a3', { date: '2026-09-06' }),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((dr) => dr.key)).toEqual(['a1', 'a2', 'a3']);
    expect(result.terms).toEqual({ payeeId: 'payee-1', taxPct: 10 });
  });

  it('refuses rows from different characters', () => {
    const other = assigned('a2', { characterId: CHAR_B });
    expect(combineEligibility([assigned('a1'), other])).toEqual({
      ok: false,
      reason: 'mixed-character',
    });
  });

  it('refuses rows from different solar systems', () => {
    expect(combineEligibility([assigned('a1'), assigned('a2', { solarSystemId: 99 })])).toEqual({
      ok: false,
      reason: 'mixed-system',
    });
  });

  it('refuses assigned rows that disagree on Payee or tax %', () => {
    expect(combineEligibility([assigned('a1'), assigned('a2', { payeeId: 'payee-2' })])).toEqual({
      ok: false,
      reason: 'mixed-terms',
    });
    expect(combineEligibility([assigned('a1'), assigned('a2', { taxPct: 5 })])).toEqual({
      ok: false,
      reason: 'mixed-terms',
    });
  });

  it('refuses a selection spanning two existing groups, which would leave two half-groups', () => {
    expect(combineEligibility([grouped('g1', 'a1', ['a2']), grouped('g2', 'a3', ['a4'])])).toEqual({
      ok: false,
      reason: 'multiple-groups',
    });
  });

  it('adds ungrouped rows to a single existing group, passing only that group primary', () => {
    const group = grouped('g1', 'a1', ['a2']);
    const result = combineEligibility([group, assigned('a3', { date: '2026-09-06' })]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The sibling a2 already carries groupId g1 — re-tagging it would be a no-op
    // write, and passing it would double-count the group in joinAssignments.
    expect(result.rows.map((dr) => dr.key)).toEqual(['a1', 'a3']);
  });

  it('reports no shared terms when every selected row is still unassigned', () => {
    const result = combineEligibility([unassigned('2026-09-04'), unassigned('2026-09-05')]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.terms).toBeNull();
  });

  it("adopts the assigned side's terms when mixing an unassigned row in", () => {
    const result = combineEligibility([
      assigned('a1', { payeeId: 'payee-9', taxPct: 7 }),
      unassigned('2026-09-05'),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.terms).toEqual({ payeeId: 'payee-9', taxPct: 7 });
  });

  it('checks terms across every member of a group, not just its primary', () => {
    const group = grouped('g1', 'a1', ['a2']);
    // A per-member edit (GroupSummaryModal) can leave a group's own members
    // disagreeing — combining more rows into it would compound the ambiguity.
    group.groupMembers = [
      {
        row: group.groupMembers![0].row,
        assignment: { ...group.groupMembers![0].assignment, payeeId: 'payee-2' },
      },
    ];

    expect(combineEligibility([group, assigned('a3')])).toEqual({
      ok: false,
      reason: 'mixed-terms',
    });
  });
});

describe('agreedTerms', () => {
  it('reports the shared Payee and rate', () => {
    expect(agreedTerms([assignment({ id: 'a1' }), assignment({ id: 'a2' })])).toEqual({
      ok: true,
      terms: { payeeId: 'payee-1', taxPct: 10 },
    });
  });

  it('reports no terms at all for an empty set — nobody is assigned yet', () => {
    expect(agreedTerms([])).toEqual({ ok: true, terms: null });
  });

  it('refuses a set that disagrees on Payee or rate', () => {
    expect(agreedTerms([assignment(), assignment({ payeeId: 'payee-2' })])).toEqual({ ok: false });
    expect(agreedTerms([assignment(), assignment({ taxPct: 5 })])).toEqual({ ok: false });
  });

  // The rule both join entry points must agree on. `joinAssignments` re-checks
  // nothing, and `joinCandidatesFor` (the row-detail picker) only filters
  // candidates against the *primary* — so with an unassigned primary it passes
  // every assigned candidate through, and it is this function that has to
  // catch two of them disagreeing.
  it('refuses two assigned rows that disagree even when the primary is unassigned', () => {
    const fromUnassignedPrimary = [
      assignment({ id: 'a2', payeeId: 'payee-1' }),
      assignment({ id: 'a3', payeeId: 'payee-2' }),
    ];
    expect(agreedTerms(fromUnassignedPrimary)).toEqual({ ok: false });
  });
});

describe('settleUpMembers', () => {
  it('expands a joined row to only its actually-outstanding members', () => {
    const group = grouped('g1', 'a1', ['a2']);
    group.groupMembers = [
      {
        row: group.groupMembers![0].row,
        assignment: { ...group.groupMembers![0].assignment, status: 'paid' },
      },
    ];

    expect(settleUpMembers([group]).map((m) => m.assignment.id)).toEqual(['a1']);
  });

  it('ignores rows with no Assignment at all', () => {
    expect(settleUpMembers([unassigned('2026-09-04')])).toEqual([]);
  });
});

describe('dismissableRows', () => {
  it('keeps only the still-unassigned rows', () => {
    const rows = [unassigned('2026-09-04'), assigned('a1'), unassigned('2026-09-05')];

    expect(dismissableRows(rows).map((dr) => dr.key)).toEqual([
      `${CHAR_A}:2026-09-04:1:unassigned`,
      `${CHAR_A}:2026-09-05:1:unassigned`,
    ]);
  });
});
