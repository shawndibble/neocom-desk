import { describe, expect, it } from 'vitest';
import { appraisalMultibuyText } from './appraisalMultibuyText';

describe('appraisalMultibuyText', () => {
  it('writes name<TAB>quantity per line', () => {
    expect(
      appraisalMultibuyText([
        { name: 'Tritanium', quantity: 100 },
        { name: 'Pyerite', quantity: 5 },
      ])
    ).toBe('Tritanium\t100\nPyerite\t5');
  });

  it('uses net quantities and drops fully covered lines', () => {
    expect(
      appraisalMultibuyText([
        { name: 'Tritanium', quantity: 100, need: 60 },
        { name: 'Pyerite', quantity: 5, need: 0 },
      ])
    ).toBe('Tritanium\t60');
  });
});
