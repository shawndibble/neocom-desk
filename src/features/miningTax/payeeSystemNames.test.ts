import { describe, expect, it } from 'vitest';
import { payeeSystemNames } from './payeeSystemNames';

describe('payeeSystemNames', () => {
  it('names the systems alphabetically and drops ids with no known name', () => {
    const names = new Map([
      [1, 'Talidal'],
      [2, 'Ainsan'],
    ]);
    expect(payeeSystemNames(new Set([1, 2, 3]), names)).toEqual(['Ainsan', 'Talidal']);
  });

  it('is empty when either input is missing', () => {
    expect(payeeSystemNames(undefined, new Map())).toEqual([]);
    expect(payeeSystemNames(new Set([1]), undefined)).toEqual([]);
  });
});
