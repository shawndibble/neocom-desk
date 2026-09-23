import { describe, it, expect } from 'vitest';
import { isPendingTabRedirect, pagePathFor, resolvedPageKeyFor } from './pagePathFor';

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
  });

  it('falls back to a catch-all for anything unmatched', () => {
    expect(pagePathFor('/this-route-does-not-exist')).toBe('/*');
  });
});

describe('isPendingTabRedirect', () => {
  it('flags a tabbed page’s bare path and unknown segment', () => {
    expect(isPendingTabRedirect('/wallet')).toBe(true);
    expect(isPendingTabRedirect('/wallet/nope')).toBe(true);
    expect(isPendingTabRedirect('/contacts')).toBe(true);
  });

  it('does not flag a declared tab', () => {
    expect(isPendingTabRedirect('/wallet/journal')).toBe(false);
    expect(isPendingTabRedirect('/contacts/across')).toBe(false);
  });

  // See `isPendingTabRedirect`'s doc — a real page nested under a tabbed
  // page's base must not be skipped.
  it('does not flag a sibling route nested under a tabbed page', () => {
    expect(isPendingTabRedirect('/wallet/loyalty/98000001')).toBe(false);
  });
});

describe('resolvedPageKeyFor', () => {
  it('collapses a declared tab to its page, same as pageKeyFor', () => {
    expect(resolvedPageKeyFor('/wallet/journal')).toBe('/wallet');
    expect(resolvedPageKeyFor('/contacts/across')).toBe('/contacts');
  });

  // See `isPendingTabRedirect`'s doc: the same sibling route must not read
  // as "still on the Wallet page" here either, or switching from a Wallet
  // tab into Loyalty Store would suppress `Layout`'s route fade.
  it('treats a sibling route nested under a tabbed page as its own page', () => {
    expect(resolvedPageKeyFor('/wallet/loyalty/98000001')).toBe('/wallet/loyalty/:corporationId');
  });
});
