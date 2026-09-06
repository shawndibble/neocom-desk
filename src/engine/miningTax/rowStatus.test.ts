import { describe, it, expect } from 'vitest';
import { unassignedOreLines, linesOwnedByAssignment } from './rowStatus';
import type { OreLine } from './types';

const A = 45490;
const B = 45491;
const C = 45492;

describe('unassignedOreLines', () => {
  it('returns the whole entry when nothing covers it', () => {
    const entryLines: OreLine[] = [{ typeId: A, quantity: 100 }];
    expect(unassignedOreLines(entryLines, [])).toEqual([{ typeId: A, quantity: 100 }]);
  });

  it('returns nothing when a sole Assignment covers every line in full', () => {
    const entryLines: OreLine[] = [{ typeId: A, quantity: 100 }];
    expect(unassignedOreLines(entryLines, [[{ typeId: A, quantity: 100 }]])).toEqual([]);
  });

  it('a sole Assignment owns the WHOLE entry, even a line it never named — no residual', () => {
    // The single-Payee case: a continuous mining session picking up a new ore
    // type mid-day must not spawn a second "Unassigned" row for the same
    // entry (CONTEXT.md, issue #523).
    const entryLines: OreLine[] = [
      { typeId: A, quantity: 100 },
      { typeId: B, quantity: 50 },
    ];
    const covering = [[{ typeId: A, quantity: 100 }]]; // one Assignment, names only A
    expect(unassignedOreLines(entryLines, covering)).toEqual([]);
  });

  it('falls back to a presence-based residual when the entry is genuinely split across two Assignments', () => {
    const entryLines: OreLine[] = [
      { typeId: A, quantity: 100 },
      { typeId: B, quantity: 50 },
      { typeId: C, quantity: 30 },
    ];
    const covering = [[{ typeId: A, quantity: 100 }], [{ typeId: B, quantity: 50 }]];
    expect(unassignedOreLines(entryLines, covering)).toEqual([{ typeId: C, quantity: 30 }]);
  });

  it('treats a typeId as fully covered by a sole Assignment regardless of its stored quantity', () => {
    // A `needs-review` Assignment's stored quantity is stale by definition
    // (see rowStatus.ts) — this is what stops that staleness from also
    // surfacing as a second, separately-assignable "unassigned" residual.
    const entryLines: OreLine[] = [{ typeId: A, quantity: 150 }];
    const covering = [[{ typeId: A, quantity: 60 }]];
    expect(unassignedOreLines(entryLines, covering)).toEqual([]);
  });
});

describe('linesOwnedByAssignment', () => {
  it('returns the ENTIRE fresh entry when it is the sole Assignment, including a brand-new type', () => {
    const assigned: OreLine[] = [{ typeId: A, quantity: 100 }];
    const fresh: OreLine[] = [
      { typeId: A, quantity: 150 },
      { typeId: B, quantity: 999 }, // never assigned before — still folds in
    ];
    expect(linesOwnedByAssignment(assigned, fresh, 1)).toEqual(fresh);
  });

  it('restricts to only the types the Assignment already claims when the entry is split (2+ siblings)', () => {
    const assigned: OreLine[] = [{ typeId: A, quantity: 100 }];
    const fresh: OreLine[] = [
      { typeId: A, quantity: 150 },
      { typeId: B, quantity: 999 }, // a different Payee's line — must be ignored
    ];
    expect(linesOwnedByAssignment(assigned, fresh, 2)).toEqual([{ typeId: A, quantity: 150 }]);
  });

  it('returns [] for a split Assignment with no ore lines and nothing fresh matches', () => {
    expect(linesOwnedByAssignment([], [{ typeId: A, quantity: 1 }], 2)).toEqual([]);
  });
});
