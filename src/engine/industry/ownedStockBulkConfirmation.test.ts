import { describe, it, expect } from 'vitest';
import { ownedStockBulkConfirmation } from './ownedStockBulkConfirmation';
import type { OwnedStockChange } from './ownedStockOffer';

const one: OwnedStockChange = { typeID: 34, from: undefined, to: 10 };
const two: OwnedStockChange = { typeID: 35, from: 5, to: 0 };

describe('ownedStockBulkConfirmation', () => {
  it.each([
    ['all', [], { kind: 'useAllNothing' }, null],
    ['none', [], { kind: 'useNoneNothing' }, null],
    ['all', [one], { kind: 'useAllDone', count: 1 }, { kind: 'owned', changes: [one] }],
    ['none', [one, two], { kind: 'useNoneDone', count: 2 }, { kind: 'owned', changes: [one, two] }],
  ] as const)('%s with %j', (kind, changes, message, undo) => {
    expect(ownedStockBulkConfirmation(kind, changes)).toEqual({ message, undo });
  });

  it('copies the changes so a later mutation of the input cannot alter Undo', () => {
    const changes = [one];
    const result = ownedStockBulkConfirmation('all', changes);
    changes.push(two);
    expect(result.undo?.changes).toEqual([one]);
  });
});
