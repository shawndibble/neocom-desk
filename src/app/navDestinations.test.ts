import { describe, expect, it } from 'vitest';
import {
  listNavDestinations,
  NAV_GROUPS,
  NAV_LOCK_PATHS,
  NAV_PAGES,
  navPageLabelKey,
  railGroups,
} from './navDestinations';
import type { AppRoutePath } from './routeScopes';

/** Echoes the key, so a label reads as the keys it was built from. */
const t = (key: string) => key;
const NO_LOCKS: ReadonlySet<AppRoutePath> = new Set();
const ALL_CORP_VIEWS = { canReadMembers: true, canReadWallet: true, canReadAssets: true };
const NO_CORP_VIEWS = { canReadMembers: false, canReadWallet: false, canReadAssets: false };

describe('NAV_PAGES', () => {
  it('holds each path once', () => {
    const paths = NAV_PAGES.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('names every page with a nav.* key', () => {
    for (const page of NAV_PAGES) expect(page.labelKey).toMatch(/^nav\./);
  });

  it('files every page under a declared group', () => {
    const groups = new Set(NAV_GROUPS.map((group) => group.id));
    for (const page of NAV_PAGES) expect(groups.has(page.group)).toBe(true);
  });
});

describe('railGroups', () => {
  it('is the desktop rail exactly as it was hand-placed: order, groups and headings', () => {
    expect(
      railGroups().map((group) => ({
        labelKey: group.labelKey,
        paths: group.pages.map((page) => page.path),
      }))
    ).toEqual([
      { labelKey: null, paths: ['/overview', '/corp'] },
      {
        labelKey: 'nav.groups.progression',
        paths: ['/skills', '/industry', '/ships', '/mining', '/planetary-industry', '/travel'],
      },
      {
        labelKey: 'nav.groups.economy',
        paths: ['/market', '/wallet', '/assets', '/contracts'],
      },
      { labelKey: 'nav.groups.social', paths: ['/mail', '/calendar', '/contacts'] },
    ]);
  });
});

describe('railGroups without the rail row', () => {
  it('keeps Alerts out of the rail, the phone bar choices and the phone sheet, with no Intel group anywhere', () => {
    const rail = railGroups().flatMap((group) => group.pages.map((page) => page.path));
    expect(rail).not.toContain('/alerts');
    expect(NAV_PAGES.find((page) => page.path === '/alerts')?.mobileTab).toBe(false);
    expect(NAV_GROUPS.map((group) => group.id)).not.toContain('intel');
  });

  it('draws Travel as the last Progression page, and Pilot Lookup is a Travel tab, not a page', () => {
    const progression = railGroups().find((group) => group.id === 'progression');
    expect(progression?.pages.at(-1)?.path).toBe('/travel');
    expect(NAV_PAGES.map((page) => page.path)).not.toContain('/pilot-lookup');
  });
});

describe('NAV_LOCK_PATHS', () => {
  it('asks for a lock on every scope-gated page and nothing else', () => {
    expect([...NAV_LOCK_PATHS].toSorted()).toEqual(
      [
        '/overview',
        '/alerts',
        '/skills',
        '/industry',
        '/ships',
        '/mining',
        '/planetary-industry',
        '/market',
        '/wallet',
        '/assets',
        '/mail',
        '/calendar',
        '/contracts',
        '/contacts',
        // Each page's sub-views, which the rail lists under the open page.
        '/clones',
        '/employment-history',
        '/skills/plans',
        '/skills/trained',
        '/skills/compare',
        '/skills/certificates',
      ].toSorted()
    );
  });

  it('leaves /corp out: corp UI hides rather than locks', () => {
    expect(NAV_LOCK_PATHS.filter((path) => path.startsWith('/corp'))).toEqual([]);
  });
});

describe('navPageLabelKey', () => {
  it('reads a page label from the descriptor', () => {
    expect(navPageLabelKey('/mining')).toBe('nav.miningTax');
    expect(navPageLabelKey('/corp')).toBe('nav.corp');
  });
});

describe('listNavDestinations', () => {
  const all = listNavDestinations({
    locked: NO_LOCKS,
    corpVisible: true,
    corpCapabilities: ALL_CORP_VIEWS,
    t,
  });
  const byPath = (path: string) => all.find((entry) => entry.path === path);

  it('lists every page, in nav order, before or among its tabs', () => {
    const pages = all.filter((entry) => entry.kind === 'page').map((entry) => entry.path);
    expect(pages).toEqual(NAV_PAGES.map((page) => page.path));
  });

  it('lists a tabbed page followed by its tabs, each linked by tab path with a breadcrumb', () => {
    const opportunities = byPath('/industry/opportunities');
    expect(opportunities).toEqual({
      kind: 'tab',
      path: '/industry/opportunities',
      pagePath: '/industry',
      labelKey: 'industry.opportunitiesTab',
      label: 'industry.opportunitiesTab',
      breadcrumb: 'nav.industry › industry.opportunitiesTab',
      locked: false,
      gating: 'scope',
    });
    const industryIndex = all.findIndex((entry) => entry.path === '/industry');
    expect(all[industryIndex + 1]?.path).toBe('/industry/plans');
  });

  it('gives a page its own label as its breadcrumb', () => {
    expect(byPath('/wallet')).toMatchObject({
      kind: 'page',
      pagePath: '/wallet',
      labelKey: 'nav.wallet',
      breadcrumb: 'nav.wallet',
    });
  });

  it('keeps a real view that is off the tab bar (Market › Transactions)', () => {
    expect(byPath('/market/history/transactions')).toBeDefined();
  });

  it('drops standalone tabs and redirect-only aliases', () => {
    expect(byPath('/ships/fittings/edit')).toBeUndefined();
    expect(byPath('/wallet/transactions')).toBeUndefined();
  });

  it("lists no tabs for a page whose tabs are an in-page control (Contacts' character filter)", () => {
    expect(byPath('/contacts')).toBeDefined();
    expect(byPath('/contacts/character')).toBeUndefined();
    expect(byPath('/contacts/across')).toBeUndefined();
  });

  it('includes the footer destinations, Settings sections among them', () => {
    expect(byPath('/settings')).toBeDefined();
    expect(byPath('/settings/display')).toMatchObject({
      breadcrumb: 'nav.settings › settings.tabs.display',
    });
    expect(byPath('/characters')).toBeDefined();
  });

  it('carries each page lock onto the page and its tabs', () => {
    const locked = listNavDestinations({
      locked: new Set<AppRoutePath>(['/industry']),
      corpVisible: true,
      corpCapabilities: ALL_CORP_VIEWS,
      t,
    });
    const industry = locked.filter((entry) => entry.pagePath === '/industry');
    expect(industry.length).toBeGreaterThan(1);
    expect(industry.every((entry) => entry.locked)).toBe(true);
    expect(locked.find((entry) => entry.path === '/wallet')?.locked).toBe(false);
  });

  it('hides /corp, rather than locking it, when corp is not visible', () => {
    const hidden = listNavDestinations({
      locked: NO_LOCKS,
      corpVisible: false,
      corpCapabilities: NO_CORP_VIEWS,
      t,
    });
    expect(hidden.some((entry) => entry.pagePath === '/corp')).toBe(false);
    expect(byPath('/corp')).toMatchObject({ locked: false });
  });

  it("lists Overview's sub-views with their own route's lock", () => {
    const entries = listNavDestinations({
      locked: new Set<AppRoutePath>(['/clones']),
      corpVisible: false,
      corpCapabilities: NO_CORP_VIEWS,
      t,
    });
    expect(entries.find((entry) => entry.path === '/clones')).toMatchObject({
      kind: 'tab',
      pagePath: '/overview',
      breadcrumb: 'nav.overview › nav.clones',
      locked: true,
    });
    expect(entries.find((entry) => entry.path === '/overview')?.locked).toBe(false);
    expect(entries.find((entry) => entry.path === '/employment-history')?.locked).toBe(false);
  });

  it('lists each Corp view only for its Corp Capability, marked corp-gated', () => {
    const accountant = listNavDestinations({
      locked: NO_LOCKS,
      corpVisible: true,
      corpCapabilities: { ...NO_CORP_VIEWS, canReadWallet: true },
      t,
    });
    const corp = accountant.filter((entry) => entry.pagePath === '/corp');
    expect(corp.map((entry) => entry.path)).toEqual(['/corp', '/corp/wallet']);
    expect(corp.every((entry) => entry.gating === 'corp' && !entry.locked)).toBe(true);
  });

  it("hides Settings' Corporation section with the Corp entry", () => {
    expect(byPath('/settings/corporation')).toBeDefined();
    const hidden = listNavDestinations({
      locked: NO_LOCKS,
      corpVisible: false,
      corpCapabilities: NO_CORP_VIEWS,
      t,
    });
    expect(hidden.some((entry) => entry.path === '/settings/corporation')).toBe(false);
    expect(hidden.some((entry) => entry.path === '/settings/display')).toBe(true);
  });

  it('lists each path once', () => {
    const paths = all.map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
