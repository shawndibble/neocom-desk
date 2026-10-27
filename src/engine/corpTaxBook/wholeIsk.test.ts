import { describe, it, expect } from 'vitest';
import { wholeIsk } from './wholeIsk';

describe('wholeIsk (display rule, #5247)', () => {
  it('rounds to whole ISK', () => {
    expect(wholeIsk(92_646_586.6)).toBe(92_646_587);
    expect(wholeIsk(1_000_000)).toBe(1_000_000);
  });
  it('treats anything under 1 ISK as nothing, either sign', () => {
    expect(wholeIsk(0.4)).toBe(0);
    expect(wholeIsk(0.99)).toBe(0);
    expect(wholeIsk(-0.7)).toBe(0);
    expect(Object.is(wholeIsk(-0.2), 0)).toBe(true);
  });
  it('keeps a figure of 1 ISK or more', () => {
    expect(wholeIsk(1)).toBe(1);
    expect(wholeIsk(1.4)).toBe(1);
    expect(wholeIsk(-2.6)).toBe(-3);
  });
});
