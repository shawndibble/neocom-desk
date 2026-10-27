import { describe, expect, it } from 'vitest';
import {
  parseCorpStockTargets,
  targetsForCorp,
  withoutTarget,
  withTarget,
  type CorpStockTargets,
} from './stockTargets';

describe('parseCorpStockTargets', () => {
  it('keeps whole positive targets and unknown corporation ids', () => {
    expect(parseCorpStockTargets({ '98': { '34': 100 }, '99': { '35': 5 } })).toEqual({
      '98': { '34': 100 },
      '99': { '35': 5 },
    });
  });

  it('drops negative, zero, fractional, non-finite and non-numeric targets', () => {
    const raw = {
      '98': {
        '1': -3,
        '2': 0,
        '3': 1.5,
        '4': null,
        '5': '7',
        '6': 8,
        abc: 9,
        '01': 4,
        '1.5': 4,
        '-7': 4,
        '1e3': 4,
      },
    };
    expect(parseCorpStockTargets(raw)).toEqual({ '98': { '6': 8 } });
    expect(parseCorpStockTargets({ '98': { '1': Infinity, '2': NaN } })).toEqual({ '98': {} });
  });

  it('skips a corporation whose value is not a record, and rejects a non-record', () => {
    expect(parseCorpStockTargets({ '98': [1], '99': { '1': 2 } })).toEqual({ '99': { '1': 2 } });
    expect(parseCorpStockTargets(null)).toBeNull();
    expect(parseCorpStockTargets([])).toBeNull();
  });
});

describe('withTarget / withoutTarget', () => {
  const base: CorpStockTargets = { '98': { '34': 10 }, '99': { '34': 1 } };

  it('sets one type, leaving other corporations alone', () => {
    expect(withTarget(base, 98, 35, 7)).toEqual({ '98': { '34': 10, '35': 7 }, '99': { '34': 1 } });
  });

  it('rounds down and treats anything below 1 as a removal', () => {
    expect(withTarget(base, 98, 34, 12.9)['98']).toEqual({ '34': 12 });
    expect(withTarget(base, 98, 34, 0)['98']).toEqual({});
    expect(withTarget(base, 98, 34, Number.NaN)['98']).toEqual({});
  });

  it('removes one type and is a no-op for a missing one', () => {
    expect(withoutTarget(base, 98, 34)).toEqual({ '98': {}, '99': { '34': 1 } });
    expect(withoutTarget(base, 98, 999)).toBe(base);
    expect(withoutTarget(base, 5, 34)).toBe(base);
  });

  it('reads one corporation as a map', () => {
    expect(targetsForCorp(base, 98)).toEqual(new Map([[34, 10]]));
    expect(targetsForCorp(base, 1).size).toBe(0);
  });
});
