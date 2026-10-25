import { describe, expect, it } from 'vitest';
import { withRunWrites, type AdminBookState } from './corpTaxBookScheduledSync.js';

const state = (over: Partial<AdminBookState> = {}): AdminBookState => ({
  startDate: '2026-10-01',
  divisions: [1],
  lastSync: null,
  miners: [],
  statements: [],
  payments: [],
  dismissals: [],
  extractions: [],
  paidStatementIds: new Set(),
  observedThrough: {},
  ...over,
});

// The settle step plans from this instead of reading the book a second time (#5048),
// so it must hold what that read would have returned.
describe('withRunWrites', () => {
  it('adds the Payments the run created and the Miners it assigned', () => {
    const before = state({
      payments: [
        { id: 'j1_1', characterId: 50, amount: 5, at: '2026-10-17T00:00:00Z' },
        { id: 'j1_2', characterId: 51, amount: 7, at: '2026-10-17T00:00:00Z', minerId: 'm1' },
      ] as unknown as AdminBookState['payments'],
    });
    const after = withRunWrites(before, {
      addedPayments: [{ id: 'j1_3', characterId: 52, amount: 9, minerId: 'solo:52' }],
      writtenExtractions: [],
      assigned: new Map([['j1_1', 'solo:50']]),
    });
    expect(after.payments).toEqual([
      { id: 'j1_1', characterId: 50, amount: 5, at: '2026-10-17T00:00:00Z', minerId: 'solo:50' },
      { id: 'j1_2', characterId: 51, amount: 7, at: '2026-10-17T00:00:00Z', minerId: 'm1' },
      { id: 'j1_3', characterId: 52, amount: 9, minerId: 'solo:52' },
    ]);
    expect(before.payments[0]).not.toHaveProperty('minerId');
  });

  it('merges written Extraction fields into the stored ones, as a merge set does', () => {
    const before = state({
      extractions: [
        { id: 'x1', structureId: 1, moonId: 7, surveyId: 'kept' },
      ] as unknown as AdminBookState['extractions'],
    });
    const after = withRunWrites(before, {
      addedPayments: [],
      writtenExtractions: [
        { id: 'x1', structureId: 1, moonId: 8 },
        { id: 'x2', structureId: 2, moonId: 9 },
      ],
      assigned: new Map(),
    });
    expect(after.extractions).toEqual([
      { id: 'x1', structureId: 1, moonId: 8, surveyId: 'kept' },
      { id: 'x2', structureId: 2, moonId: 9 },
    ]);
  });
});
