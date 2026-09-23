import { describe, it, expect } from 'vitest';
import { isTabRedirectPath, pageKeyFor, routePatternFor, tabbedPagePathFor } from './pageTabs';

describe('routePatternFor', () => {
  it('mounts a tabbed page with a splat and leaves the rest alone', () => {
    expect(routePatternFor('/contacts')).toBe('/contacts/*');
    expect(routePatternFor('/wallet')).toBe('/wallet/*');
    expect(routePatternFor('/market')).toBe('/market');
  });
});

describe('pageKeyFor', () => {
  it('collapses a declared tab to its page', () => {
    expect(pageKeyFor('/contacts/character')).toBe('/contacts');
    expect(pageKeyFor('/contacts/across')).toBe('/contacts');
  });

  it('collapses a path about to redirect too, so the redirect does not fade again', () => {
    expect(pageKeyFor('/contacts')).toBe('/contacts');
    expect(pageKeyFor('/contacts/nope')).toBe('/contacts');
  });

  it('passes everything else through', () => {
    expect(pageKeyFor('/contactsx')).toBe('/contactsx');
    expect(pageKeyFor('/assets/60003760')).toBe('/assets/60003760');
  });
});

describe('tabbedPagePathFor', () => {
  it('reports the tab path, or the page for a path about to redirect', () => {
    expect(tabbedPagePathFor('/contacts/across')).toBe('/contacts/across');
    expect(tabbedPagePathFor('/contacts/nope')).toBe('/contacts');
    expect(tabbedPagePathFor('/wallet/journal')).toBe('/wallet/journal');
    expect(tabbedPagePathFor('/wallet')).toBe('/wallet');
    expect(tabbedPagePathFor('/market')).toBeNull();
  });
});

describe('isTabRedirectPath', () => {
  it('flags a tabbed page path TabRoute will replace', () => {
    expect(isTabRedirectPath('/contacts')).toBe(true);
    expect(isTabRedirectPath('/contacts/nope')).toBe(true);
    expect(isTabRedirectPath('/contacts/across')).toBe(false);
    expect(isTabRedirectPath('/wallet')).toBe(true);
    expect(isTabRedirectPath('/wallet/journal')).toBe(false);
    expect(isTabRedirectPath('/market')).toBe(false);
  });
});
