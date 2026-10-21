import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isTabRedirectPath,
  MARKET_TABS,
  pageKeyFor,
  PAGE_LEGACY_LOCATIONS,
  routePatternFor,
  tabbedPagePathFor,
  TRAVEL_TABS,
  WALLET_TABS,
} from './pageTabs';

describe('routePatternFor', () => {
  it('mounts a tabbed page with a splat and leaves the rest alone', () => {
    expect(routePatternFor('/contacts')).toBe('/contacts/*');
    expect(routePatternFor('/wallet')).toBe('/wallet/*');
    expect(routePatternFor('/industry')).toBe('/industry/*');
    expect(routePatternFor('/skills')).toBe('/skills');
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

  it('collapses Corp assets’ state tabs and old tree links to the one page', () => {
    expect(pageKeyFor('/corp/assets')).toBe('/corp/assets');
    expect(pageKeyFor('/corp/assets/impounded')).toBe('/corp/assets');
    expect(pageKeyFor('/corp/assets/1/i:9')).toBe('/corp/assets');
  });

  it('passes everything else through', () => {
    expect(pageKeyFor('/contactsx')).toBe('/contactsx');
    expect(pageKeyFor('/assets60003760')).toBe('/assets60003760');
  });
});

describe('a tabbed page with a page of its own below one tab (Ships’ Fitting editor)', () => {
  it('keeps the editor inside the tabbed page, so it mounts with the library', () => {
    expect(tabbedPagePathFor('/ships/fittings/edit')).toBe('/ships/fittings/edit');
    expect(isTabRedirectPath('/ships/fittings/edit')).toBe(false);
  });

  it('keys the editor as its own page, so opening a Fitting fades like a page change', () => {
    expect(pageKeyFor('/ships/fittings')).toBe('/ships');
    expect(pageKeyFor('/ships/tree')).toBe('/ships');
    expect(pageKeyFor('/ships/fittings/edit')).toBe('/ships/fittings/edit');
  });

  it('leaves Compare, its own route, out of the tabbed page', () => {
    expect(tabbedPagePathFor('/ships/fittings/compare')).toBeNull();
    expect(pageKeyFor('/ships/fittings/compare')).toBe('/ships/fittings/compare');
  });

  it('redirects the bare page and an unknown segment to the default tab', () => {
    expect(isTabRedirectPath('/ships')).toBe(true);
    expect(isTabRedirectPath('/ships/nope')).toBe(true);
    expect(routePatternFor('/ships')).toBe('/ships/*');
  });
});

describe('tabbedPagePathFor', () => {
  it('reports the tab path, or the page for a path about to redirect', () => {
    expect(tabbedPagePathFor('/contacts/across')).toBe('/contacts/across');
    expect(tabbedPagePathFor('/contacts/nope')).toBe('/contacts');
    expect(tabbedPagePathFor('/wallet/journal')).toBe('/wallet/journal');
    expect(tabbedPagePathFor('/wallet')).toBe('/wallet');
    expect(tabbedPagePathFor('/skills')).toBeNull();
  });
});

describe('isTabRedirectPath', () => {
  it('flags a tabbed page path TabRoute will replace', () => {
    expect(isTabRedirectPath('/contacts')).toBe(true);
    expect(isTabRedirectPath('/contacts/nope')).toBe(true);
    expect(isTabRedirectPath('/contacts/across')).toBe(false);
    expect(isTabRedirectPath('/wallet')).toBe(true);
    expect(isTabRedirectPath('/wallet/journal')).toBe(false);
    expect(isTabRedirectPath('/skills')).toBe(false);
  });
});

describe('a tabbed page with its own nested detail routes (Industry)', () => {
  it('treats a declared tab as the tabbed page', () => {
    expect(pageKeyFor('/industry/sourcing')).toBe('/industry');
    expect(tabbedPagePathFor('/industry/logs')).toBe('/industry/logs');
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
  it('leaves /wallet/lp-store/:corporationId out of the tabbed page', () => {
    expect(pageKeyFor('/wallet/lp-store/98000001')).toBe('/wallet/lp-store/98000001');
    expect(isTabRedirectPath('/wallet/lp-store/98000001')).toBe(false);
    expect(tabbedPagePathFor('/wallet/lp-store/98000001')).toBeNull();
  });
});

describe('Settings index state', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is a page view of its own on a phone, and a redirect from md up', () => {
    vi.stubGlobal('window', { matchMedia: (media: string) => ({ media, matches: false }) });
    expect(isTabRedirectPath('/settings')).toBe(false);
    expect(tabbedPagePathFor('/settings')).toBe('/settings');
    expect(isTabRedirectPath('/settings/nope')).toBe(true);
    vi.stubGlobal('window', { matchMedia: (media: string) => ({ media, matches: true }) });
    expect(isTabRedirectPath('/settings')).toBe(true);
  });
});

describe('Assets (Items, Ships, Move)', () => {
  it('keeps every drill-down level inside the Items tab, so it never fades or redirects', () => {
    expect(pageKeyFor('/assets/items/60003760/i:5')).toBe('/assets');
    expect(isTabRedirectPath('/assets/items/60003760/i:5')).toBe(false);
    expect(tabbedPagePathFor('/assets/items/60003760/i:5')).toBe('/assets/items');
    expect(pageKeyFor('/assets/ships')).toBe('/assets');
    expect(tabbedPagePathFor('/assets/move')).toBe('/assets/move');
  });

  it('treats the bare page and a pre-tabs drill-down as redirects', () => {
    expect(isTabRedirectPath('/assets')).toBe(true);
    expect(isTabRedirectPath('/assets/60003760')).toBe(true);
  });

  it('moves old links where they now live', () => {
    expect(PAGE_LEGACY_LOCATIONS['/assets']?.('/assets/60003760', '')).toEqual({
      pathname: '/assets/items/60003760',
      search: '',
    });
  });
});

describe('LP Store, a Wallet tab (issue #3527)', () => {
  it('sits last on Wallet and is gone from Market', () => {
    expect(WALLET_TABS.tabs.map((tab) => tab.id)).toEqual([
      'balance',
      'journal',
      'transactions',
      'lp-store',
    ]);
    expect(MARKET_TABS.tabs.map((tab) => tab.id)).not.toContain('lp-store');
  });

  it('moves an old Market LP Store link to Wallet, keeping the corporation and query', () => {
    const moved = PAGE_LEGACY_LOCATIONS['/market'];
    expect(moved?.('/market/lp-store', '?q=tritanium')).toEqual({
      pathname: '/wallet/lp-store',
      search: '?q=tritanium',
    });
    expect(moved?.('/market/lp-store/1000125', '?offer=42&affordableOnly=0')).toEqual({
      pathname: '/wallet/lp-store/1000125',
      search: '?offer=42&affordableOnly=0',
    });
    expect(moved?.('/market/lp-storex', '')).toBeNull();
  });

  it('reports the old paths as redirects', () => {
    expect(isTabRedirectPath('/market/lp-store')).toBe(true);
    expect(isTabRedirectPath('/market/lp-store/1000125')).toBe(true);
  });
});

describe('Hauling, a Travel tab (issue #3526)', () => {
  it('sits last on Travel and is gone from Market', () => {
    expect(TRAVEL_TABS.tabs.map((tab) => tab.id)).toEqual(['route', 'pilot', 'hauling']);
    expect(MARKET_TABS.tabs.map((tab) => tab.id)).not.toContain('hauling');
  });

  it('moves an old Market Hauling link to Travel with its query intact', () => {
    const moved = PAGE_LEGACY_LOCATIONS['/market'];
    expect(moved?.('/market/hauling', '?from=amarr&to=jita')).toEqual({
      pathname: '/travel/hauling',
      search: '?from=amarr&to=jita',
    });
    expect(moved?.('/market/browser', '')).toBeNull();
    expect(moved?.('/market/haulingx', '')).toBeNull();
  });

  it('reports the old path as a redirect and the new one as a Travel tab', () => {
    expect(isTabRedirectPath('/market/hauling')).toBe(true);
    expect(pageKeyFor('/travel/hauling')).toBe('/travel');
    expect(tabbedPagePathFor('/travel/hauling')).toBe('/travel/hauling');
  });
});

describe('History is Transactions only (issue #3692)', () => {
  it('has no separate Transactions tab', () => {
    expect(MARKET_TABS.tabs.map((tab) => tab.id)).toEqual([
      'browser',
      'orders',
      'stock',
      'history',
      'appraisal',
    ]);
  });

  it('moves an old History › Transactions link to History, keeping the highlight', () => {
    const moved = PAGE_LEGACY_LOCATIONS['/market'];
    expect(moved?.('/market/history/transactions', '?highlight=34')).toEqual({
      pathname: '/market/history',
      search: '?highlight=34',
    });
    expect(moved?.('/market/history/transactions/', '')).toEqual({
      pathname: '/market/history',
      search: '',
    });
    expect(moved?.('/market/history/transactionsx', '')).toBeNull();
    expect(isTabRedirectPath('/market/history/transactions')).toBe(true);
  });
});

describe('Thera / Turnur is a modal on Route Safety, not a Travel tab', () => {
  it('has no Thera tab', () => {
    expect(TRAVEL_TABS.tabs.map((tab) => tab.id)).not.toContain('thera');
  });

  it('moves an old /travel/thera link to Route Safety, origin becoming From', () => {
    const moved = PAGE_LEGACY_LOCATIONS['/travel'];
    expect(moved?.('/travel/thera', '?origin=30000142&pref=shortest&hub=turnur')).toEqual({
      pathname: '/travel/route',
      search: '?from=30000142&pref=shortest',
    });
    expect(moved?.('/travel/thera/', '')).toEqual({ pathname: '/travel/route', search: '' });
    expect(moved?.('/travel/therax', '')).toBeNull();
    expect(moved?.('/travel/hauling', '')).toBeNull();
    expect(isTabRedirectPath('/travel/thera')).toBe(true);
  });
});
