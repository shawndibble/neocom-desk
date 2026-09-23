import { describe, it, expect } from 'vitest';
import { isTabRedirectPath, pageKeyFor, routePatternFor, tabbedPagePathFor } from './pageTabs';

describe('routePatternFor', () => {
  it('mounts a tabbed page with a splat and leaves the rest alone', () => {
    expect(routePatternFor('/contacts')).toBe('/contacts/*');
    expect(routePatternFor('/wallet')).toBe('/wallet/*');
    expect(routePatternFor('/industry')).toBe('/industry/*');
    expect(routePatternFor('/market')).toBe('/market');
  });
});

describe('a page with a sub-tab nested under one of its tabs (Contracts)', () => {
  it('resolves a two-segment tab id from the full path suffix', () => {
    expect(tabbedPagePathFor('/contracts/search/items')).toBe('/contracts/search/items');
    expect(tabbedPagePathFor('/contracts/search/courier')).toBe('/contracts/search/courier');
    expect(tabbedPagePathFor('/contracts/history')).toBe('/contracts/history');
  });

  it('tolerates a trailing slash on the deeper segment', () => {
    expect(tabbedPagePathFor('/contracts/search/items/')).toBe('/contracts/search/items');
  });

  it('redirects the bare page and the tab-less "search" segment to the default', () => {
    expect(isTabRedirectPath('/contracts')).toBe(true);
    expect(isTabRedirectPath('/contracts/search')).toBe(true);
    expect(tabbedPagePathFor('/contracts')).toBe('/contracts');
    expect(tabbedPagePathFor('/contracts/search')).toBe('/contracts');
  });

  it('mounts with a splat like any other tabbed page', () => {
    expect(routePatternFor('/contracts')).toBe('/contracts/*');
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

describe('a tabbed page with its own nested detail routes (Industry)', () => {
  it('treats a declared tab as the tabbed page', () => {
    expect(pageKeyFor('/industry/sourcing')).toBe('/industry');
    expect(tabbedPagePathFor('/industry/records')).toBe('/industry/records');
    expect(isTabRedirectPath('/industry')).toBe(true);
    expect(isTabRedirectPath('/industry/plans')).toBe(false);
  });

  it('leaves a path owned by a more specific route out of the tabbed page', () => {
    expect(pageKeyFor('/industry/plans/abc')).toBe('/industry/plans/abc');
    expect(pageKeyFor('/industry/groups/g1')).toBe('/industry/groups/g1');
    expect(isTabRedirectPath('/industry/plans/abc')).toBe(false);
    expect(isTabRedirectPath('/industry/groups/g1')).toBe(false);
    expect(tabbedPagePathFor('/industry/plans/abc')).toBeNull();
  });
});

describe('a tabbed page with its own nested detail route (Wallet’s Loyalty Store)', () => {
  it('leaves /wallet/loyalty/:corporationId out of the tabbed page', () => {
    expect(pageKeyFor('/wallet/loyalty/98000001')).toBe('/wallet/loyalty/98000001');
    expect(isTabRedirectPath('/wallet/loyalty/98000001')).toBe(false);
    expect(tabbedPagePathFor('/wallet/loyalty/98000001')).toBeNull();
  });
});
