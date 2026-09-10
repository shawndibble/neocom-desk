import { describe, it, expect } from 'vitest';
import { pagePathFor } from './pagePathFor';

describe('pagePathFor', () => {
  it('matches static routes exactly', () => {
    expect(pagePathFor('/login')).toBe('/login');
    expect(pagePathFor('/')).toBe('/');
  });

  it('matches feature routes exactly', () => {
    expect(pagePathFor('/wallet')).toBe('/wallet');
    expect(pagePathFor('/skills/plans')).toBe('/skills/plans');
  });

  it('collapses a param route to its pattern, not the raw id', () => {
    expect(pagePathFor('/skills/plans/abc123')).toBe('/skills/plans/:planId');
    expect(pagePathFor('/wallet/loyalty/98000001')).toBe('/wallet/loyalty/:corporationId');
  });

  it('falls back to a catch-all for anything unmatched', () => {
    expect(pagePathFor('/this-route-does-not-exist')).toBe('/*');
  });
});
