import { describe, expect, it } from 'vitest';
import { homeSystemId, routeFigures } from './sellRoute';

describe('homeSystemId', () => {
  it('is the system holding the most colonies', () => {
    expect(homeSystemId([10, 20, 20, 30])).toBe(20);
  });
  it('breaks a tie toward the lower id so it never flickers between loads', () => {
    expect(homeSystemId([30, 10, 30, 10])).toBe(10);
  });
  it('is null with no colonies', () => {
    expect(homeSystemId([])).toBeNull();
  });
});

describe('routeFigures', () => {
  it('counts jumps as systems after the origin, and lowsec jumps below 0.5', () => {
    expect(routeFigures([0.9, 0.6, 0.4, 0.3, 0.9])).toEqual({ jumps: 4, lowsecJumps: 2 });
  });
  it('does not count the origin as a lowsec jump', () => {
    expect(routeFigures([0.2, 0.9])).toEqual({ jumps: 1, lowsecJumps: 0 });
  });
  it('treats 0.45 as 0.5 the way the game rounds it', () => {
    expect(routeFigures([0.9, 0.45])).toEqual({ jumps: 1, lowsecJumps: 0 });
  });
  it('skips a system with unknown security rather than guessing it low', () => {
    expect(routeFigures([0.9, null, 0.3])).toEqual({ jumps: 2, lowsecJumps: 1 });
  });
  it('is zero jumps when home is the hub', () => {
    expect(routeFigures([0.9])).toEqual({ jumps: 0, lowsecJumps: 0 });
  });
});
