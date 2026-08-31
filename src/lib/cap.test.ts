import { describe, it, expect } from 'vitest';
import { capItems } from './cap';

describe('capItems', () => {
  it('returns every item untruncated when under the cap', () => {
    expect(capItems([1, 2, 3], 5)).toEqual({ items: [1, 2, 3], truncated: false });
  });

  it('returns every item untruncated when exactly at the cap', () => {
    expect(capItems([1, 2, 3], 3)).toEqual({ items: [1, 2, 3], truncated: false });
  });

  it('slices to the cap and reports truncated when over it', () => {
    expect(capItems([1, 2, 3, 4, 5], 3)).toEqual({ items: [1, 2, 3], truncated: true });
  });

  it('handles an empty list', () => {
    expect(capItems([], 3)).toEqual({ items: [], truncated: false });
  });
});
