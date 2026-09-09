import { describe, it, expect } from 'vitest';
import { matchAppraisalEntries } from '@/engine/market/appraisalMatch';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';

const catalogue = new Map([
  ['tritanium', { typeId: 34, name: 'Tritanium' }],
  ['pyerite', { typeId: 35, name: 'Pyerite' }],
  ['damage control ii', { typeId: 2048, name: 'Damage Control II' }],
]);

describe('matchAppraisalEntries', () => {
  it('resolves a pasted name to its type', () => {
    const { matched, unmatched } = matchAppraisalEntries(
      parseAppraisalPaste('Tritanium\t100'),
      catalogue
    );
    expect(matched).toEqual([{ typeId: 34, name: 'Tritanium', quantity: 100 }]);
    expect(unmatched).toEqual([]);
  });

  it('matches regardless of the case it was pasted in', () => {
    const { matched } = matchAppraisalEntries(
      parseAppraisalPaste('DAMAGE CONTROL II\t2'),
      catalogue
    );
    expect(matched).toEqual([{ typeId: 2048, name: 'Damage Control II', quantity: 2 }]);
  });

  it('reports the catalogue’s spelling, not the pasted one', () => {
    const { matched } = matchAppraisalEntries(parseAppraisalPaste('tritanium 5'), catalogue);
    expect(matched[0].name).toBe('Tritanium');
  });

  it('collects a name the catalogue does not hold, with its source lines', () => {
    const text = ['Tritanium\t100', 'Nanite Repair Past\t2'].join('\n');
    const { matched, unmatched } = matchAppraisalEntries(parseAppraisalPaste(text), catalogue);
    expect(matched).toHaveLength(1);
    expect(unmatched).toEqual([{ name: 'Nanite Repair Past', lines: [2] }]);
  });

  it('reports every line a repeated unmatched name came from', () => {
    const text = ['Wrong Thing\t1', 'Tritanium\t1', 'Wrong Thing\t2'].join('\n');
    const { unmatched } = matchAppraisalEntries(parseAppraisalPaste(text), catalogue);
    expect(unmatched).toEqual([{ name: 'Wrong Thing', lines: [1, 3] }]);
  });

  it('trims surrounding whitespace before looking a name up', () => {
    const { matched } = matchAppraisalEntries(
      [{ name: '  Pyerite  ', quantity: 3, lines: [1] }],
      catalogue
    );
    expect(matched).toEqual([{ typeId: 35, name: 'Pyerite', quantity: 3 }]);
  });

  it('preserves paste order across both lists', () => {
    const text = ['Pyerite\t1', 'Nope\t1', 'Tritanium\t1'].join('\n');
    const { matched, unmatched } = matchAppraisalEntries(parseAppraisalPaste(text), catalogue);
    expect(matched.map((m) => m.name)).toEqual(['Pyerite', 'Tritanium']);
    expect(unmatched.map((u) => u.name)).toEqual(['Nope']);
  });

  it('returns two empty lists for an empty paste', () => {
    expect(matchAppraisalEntries([], catalogue)).toEqual({ matched: [], unmatched: [] });
  });
});
