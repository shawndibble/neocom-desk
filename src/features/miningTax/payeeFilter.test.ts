import { describe, expect, it } from 'vitest';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import {
  filterRowsByPayee,
  isSolePayeeFilter,
  payeeFilterParam,
  resolvePayeeFilter,
  togglePayeeFilter,
} from './payeeFilter';

const rowFor = (payeeId: string | undefined) =>
  ({ key: String(payeeId), assignment: payeeId === undefined ? null : { payeeId } }) as DisplayRow;

describe('payeeFilterParam', () => {
  const codec = payeeFilterParam();
  it('reads absent as all, none as none, and a list as a set', () => {
    expect(codec.parse(null)).toBe('all');
    expect(codec.parse('none')).toBe('none');
    expect(codec.parse('b,a')).toEqual(new Set(['a', 'b']));
  });
  it('writes a sorted list, and nothing for all', () => {
    expect(codec.serialize('all')).toBeNull();
    expect(codec.serialize('none')).toBe('none');
    expect(codec.serialize(new Set(['b', 'a']))).toBe('a,b');
  });
});

describe('resolvePayeeFilter', () => {
  it('drops unknown ids and reads a fully known or fully unknown set as all', () => {
    expect(resolvePayeeFilter(new Set(['a', 'x']), ['a', 'b'])).toEqual(new Set(['a']));
    expect(resolvePayeeFilter(new Set(['a', 'b']), ['a', 'b'])).toBe('all');
    expect(resolvePayeeFilter(new Set(['x']), ['a', 'b'])).toBe('all');
  });
  it('keeps none only while there are Payees to leave it with', () => {
    expect(resolvePayeeFilter('none', ['a'])).toBe('none');
    expect(resolvePayeeFilter('none', [])).toBe('all');
  });
});

describe('filterRowsByPayee', () => {
  const rows = [rowFor('a'), rowFor('b'), rowFor(undefined)];
  it('passes everything for all and nothing for none', () => {
    expect(filterRowsByPayee(rows, 'all')).toBe(rows);
    expect(filterRowsByPayee(rows, 'none')).toEqual([]);
  });
  it('drops rows with no Payee once a specific one is selected', () => {
    expect(filterRowsByPayee(rows, new Set(['a']))).toEqual([rows[0]]);
  });
});

describe('togglePayeeFilter', () => {
  it('unticks one from all, and lands on none after the last', () => {
    expect(togglePayeeFilter('all', ['a', 'b'], 'a')).toEqual(new Set(['b']));
    expect(togglePayeeFilter(new Set(['a']), ['a', 'b'], 'a')).toBe('none');
  });
  it('ticking every Payee reads as all', () => {
    expect(togglePayeeFilter(new Set(['a']), ['a', 'b'], 'b')).toBe('all');
    expect(togglePayeeFilter('none', ['a'], 'a')).toBe('all');
  });
});

describe('isSolePayeeFilter', () => {
  it('is true only for exactly that one Payee', () => {
    expect(isSolePayeeFilter(new Set(['a']), 'a')).toBe(true);
    expect(isSolePayeeFilter(new Set(['a', 'b']), 'a')).toBe(false);
    expect(isSolePayeeFilter('all', 'a')).toBe(false);
    expect(isSolePayeeFilter('none', 'a')).toBe(false);
  });
});
