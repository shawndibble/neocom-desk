import { describe, it, expect } from 'vitest';
import { unassignedOreLines, statusesForRow } from './rowStatus';
import type { OreLine } from './types';

const A = 45490;
const B = 45491;

describe('unassignedOreLines', () => {
  it('returns the whole entry when nothing covers it', () => {
    const entryLines: OreLine[] = [{ typeId: A, quantity: 100 }];
    expect(unassignedOreLines(entryLines, [])).toEqual([{ typeId: A, quantity: 100 }]);
  });

  it('returns nothing when one assignment covers every line in full', () => {
    const entryLines: OreLine[] = [{ typeId: A, quantity: 100 }];
    expect(unassignedOreLines(entryLines, [[{ typeId: A, quantity: 100 }]])).toEqual([]);
  });

  it('returns the residual when two split assignments cover different lines', () => {
    const entryLines: OreLine[] = [
      { typeId: A, quantity: 100 },
      { typeId: B, quantity: 50 },
    ];
    const covering = [[{ typeId: A, quantity: 100 }]];
    expect(unassignedOreLines(entryLines, covering)).toEqual([{ typeId: B, quantity: 50 }]);
  });

  it('treats a typeId as fully covered once any Assignment claims it, regardless of its stored quantity', () => {
    // A `needs-review` Assignment's stored quantity is stale by definition
    // (see rowStatus.ts) — this is what stops that staleness from also
    // surfacing as a second, separately-assignable "unassigned" residual.
    const entryLines: OreLine[] = [{ typeId: A, quantity: 150 }];
    const covering = [[{ typeId: A, quantity: 60 }]];
    expect(unassignedOreLines(entryLines, covering)).toEqual([]);
  });
});

describe('statusesForRow', () => {
  it('is "unassigned" only when nothing at all covers the entry', () => {
    const entryLines: OreLine[] = [{ typeId: A, quantity: 100 }];
    expect(statusesForRow(entryLines, [])).toEqual(new Set(['unassigned']));
  });

  it('reports every distinct covering assignment status, and drops unassigned once fully covered', () => {
    const entryLines: OreLine[] = [{ typeId: A, quantity: 100 }];
    const covering = [{ status: 'outstanding' as const, oreLines: [{ typeId: A, quantity: 100 }] }];
    expect(statusesForRow(entryLines, covering)).toEqual(new Set(['outstanding']));
  });

  it('reports "unassigned" alongside a covering status when the entry is only partially covered', () => {
    const entryLines: OreLine[] = [
      { typeId: A, quantity: 100 },
      { typeId: B, quantity: 50 },
    ];
    const covering = [{ status: 'paid' as const, oreLines: [{ typeId: A, quantity: 100 }] }];
    expect(statusesForRow(entryLines, covering)).toEqual(new Set(['paid', 'unassigned']));
  });

  it('reports every covering status when a split entry has two different-status assignments and nothing left unassigned', () => {
    const entryLines: OreLine[] = [
      { typeId: A, quantity: 100 },
      { typeId: B, quantity: 50 },
    ];
    const covering = [
      { status: 'paid' as const, oreLines: [{ typeId: A, quantity: 100 }] },
      { status: 'needs-review' as const, oreLines: [{ typeId: B, quantity: 50 }] },
    ];
    expect(statusesForRow(entryLines, covering)).toEqual(new Set(['paid', 'needs-review']));
  });
});
