import { describe, it, expect } from 'vitest';
import { diffAssignedOreLines } from './needsReview';
import type { OreLine } from './types';

const A = 45490;
const B = 45491;

describe('diffAssignedOreLines', () => {
  it('reports no diff when the fresh lines exactly match the snapshot', () => {
    const assigned: OreLine[] = [{ typeId: A, quantity: 100 }];
    const fresh: OreLine[] = [{ typeId: A, quantity: 100 }];
    expect(diffAssignedOreLines(assigned, fresh)).toEqual([]);
  });

  it('reports no diff when the fresh ledger reports LESS than the snapshot', () => {
    // Never observed in practice per the decision doc, but must not flip —
    // only a strict increase is a "needs-review" signal.
    const assigned: OreLine[] = [{ typeId: A, quantity: 100 }];
    const fresh: OreLine[] = [{ typeId: A, quantity: 90 }];
    expect(diffAssignedOreLines(assigned, fresh)).toEqual([]);
  });

  it('reports a diff when the fresh ledger reports MORE than the snapshot for a type', () => {
    const assigned: OreLine[] = [{ typeId: A, quantity: 100 }];
    const fresh: OreLine[] = [{ typeId: A, quantity: 150 }];
    expect(diffAssignedOreLines(assigned, fresh)).toEqual([{ typeId: A, before: 100, after: 150 }]);
  });

  it('reports a diff only for the type(s) that grew, not every type in the entry', () => {
    const assigned: OreLine[] = [
      { typeId: A, quantity: 100 },
      { typeId: B, quantity: 50 },
    ];
    const fresh: OreLine[] = [
      { typeId: A, quantity: 100 },
      { typeId: B, quantity: 80 },
    ];
    expect(diffAssignedOreLines(assigned, fresh)).toEqual([{ typeId: B, before: 50, after: 80 }]);
  });

  it('treats a type_id newly present in the fresh ledger (late-arriving data) as growth from zero', () => {
    const assigned: OreLine[] = [{ typeId: A, quantity: 100 }];
    const fresh: OreLine[] = [
      { typeId: A, quantity: 100 },
      { typeId: B, quantity: 20 },
    ];
    expect(diffAssignedOreLines(assigned, fresh)).toEqual([{ typeId: B, before: 0, after: 20 }]);
  });
});
