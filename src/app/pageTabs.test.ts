import { describe, it, expect } from 'vitest';
import { pageKeyFor, routePatternFor, tabbedPagePathFor } from './pageTabs';

describe('routePatternFor', () => {
  it('mounts a tabbed page with a splat and leaves the rest alone', () => {
    expect(routePatternFor('/contacts')).toBe('/contacts/*');
    expect(routePatternFor('/wallet')).toBe('/wallet');
  });
});

describe('pageKeyFor', () => {
  it('collapses a declared tab to its page', () => {
    expect(pageKeyFor('/contacts/character')).toBe('/contacts');
    expect(pageKeyFor('/contacts/across')).toBe('/contacts');
  });

  it('passes everything else through', () => {
    expect(pageKeyFor('/contacts')).toBe('/contacts');
    expect(pageKeyFor('/contacts/nope')).toBe('/contacts/nope');
    expect(pageKeyFor('/assets/60003760')).toBe('/assets/60003760');
  });
});

describe('tabbedPagePathFor', () => {
  it('reports the tab path, or the page for a path about to redirect', () => {
    expect(tabbedPagePathFor('/contacts/across')).toBe('/contacts/across');
    expect(tabbedPagePathFor('/contacts/nope')).toBe('/contacts');
    expect(tabbedPagePathFor('/wallet')).toBeNull();
  });
});
