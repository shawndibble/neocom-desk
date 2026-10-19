import { describe, expect, it } from 'vitest';
import { byName, byNumericId } from './compare';

describe('byName', () => {
  it('sorts by name', () =>
    expect([{ name: 'b' }, { name: 'a' }].sort(byName)).toEqual([{ name: 'a' }, { name: 'b' }]));
});

describe('byNumericId', () => {
  it('sorts ascending numerically, not lexically', () =>
    expect([10, 9, 100].sort(byNumericId)).toEqual([9, 10, 100]));
});
