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

  it('reports a tabbed page’s declared tab as its own path', () => {
    expect(pagePathFor('/contacts/character')).toBe('/contacts/character');
    expect(pagePathFor('/contacts/across')).toBe('/contacts/across');
    expect(pagePathFor('/contacts')).toBe('/contacts');
    expect(pagePathFor('/industry/sourcing')).toBe('/industry/sourcing');
  });

  it('reports a nested detail route under a tabbed page as its own pattern', () => {
    expect(pagePathFor('/industry/plans/abc')).toBe('/industry/plans/:planId');
    expect(pagePathFor('/industry/groups/g1')).toBe('/industry/groups/:groupId');
  });

  it('falls back to a catch-all for anything unmatched', () => {
    expect(pagePathFor('/this-route-does-not-exist')).toBe('/*');
  });
});
