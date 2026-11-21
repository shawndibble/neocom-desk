import { describe, expect, it } from 'vitest';
import { narrows, sameReaders } from './corpTaxBookReaders.js';

describe('sameReaders / narrows', () => {
  it('compares readers as a set, and a missing copy is never the same', () => {
    expect(sameReaders(['char:2', 'char:1'], ['char:1', 'char:2'])).toBe(true);
    expect(sameReaders(['char:1'], ['char:1', 'char:2'])).toBe(false);
    expect(sameReaders(undefined, [])).toBe(false);
  });

  it('narrows only when a reader the copy held goes', () => {
    expect(narrows(['char:1', 'char:2'], ['char:1'])).toBe(true);
    expect(narrows(['char:1'], ['char:1', 'char:2'])).toBe(false);
    expect(narrows(undefined, ['char:1'])).toBe(false);
  });
});
