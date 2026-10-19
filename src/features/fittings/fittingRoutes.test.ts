import { describe, expect, it } from 'vitest';
import { tabPath } from '@/lib/pageTabs';
import {
  FITTING_COMPARE_PATH,
  FITTING_EDIT_PATH,
  FITTINGS_PATH,
  SHIP_TREE_PATH,
  SHIPS_PATH,
  fittingCompareHref,
  fittingEditLocation,
  fittingsRedirect,
} from './fittingRoutes';
import { SHIPS_TABS } from './shipsTabs';

describe('the Ships section paths', () => {
  it('put Fittings, its editor and the Tree under /ships', () => {
    expect(SHIPS_PATH).toBe('/ships');
    expect(FITTINGS_PATH).toBe('/ships/fittings');
    expect(FITTING_EDIT_PATH).toBe('/ships/fittings/edit');
    expect(FITTING_COMPARE_PATH).toBe('/ships/fittings/compare');
    expect(SHIP_TREE_PATH).toBe('/ships/tree');
  });

  it('agree with the declared tabs', () => {
    expect(SHIPS_TABS.base).toBe(SHIPS_PATH);
    expect(SHIPS_TABS.defaultTab).toBe('fittings');
    expect(tabPath(SHIPS_TABS, 'fittings')).toBe(FITTINGS_PATH);
    expect(tabPath(SHIPS_TABS, 'fittings/edit')).toBe(FITTING_EDIT_PATH);
    expect(tabPath(SHIPS_TABS, 'tree')).toBe(SHIP_TREE_PATH);
  });
});

describe('fittingsRedirect', () => {
  it('sends a Share Link on the Fittings tab to the editor, keeping the query', () => {
    expect(fittingsRedirect('/ships/fittings', '?f=1.abc')).toBe('/ships/fittings/edit?f=1.abc');
    expect(fittingsRedirect('/ships/fittings/', '?f=1.abc')).toBe('/ships/fittings/edit?f=1.abc');
  });

  it('sends the editor with no Fitting to the library', () => {
    expect(fittingsRedirect('/ships/fittings/edit', '')).toBe('/ships/fittings');
    expect(fittingsRedirect('/ships/fittings/edit', '?f=')).toBe('/ships/fittings');
  });

  it('stays put on the library and on an open Fitting', () => {
    expect(fittingsRedirect('/ships/fittings', '')).toBeNull();
    expect(fittingsRedirect('/ships/fittings/edit', '?f=1.abc')).toBeNull();
  });
});

describe('fittingEditLocation', () => {
  it('puts the code in ?f= on the editor path', () => {
    expect(fittingEditLocation('1.abc_-')).toEqual({
      pathname: '/ships/fittings/edit',
      search: '?f=1.abc_-',
    });
  });
});

describe('fittingCompareHref', () => {
  it('puts the query on the Compare path', () => {
    expect(fittingCompareHref('?f=1.a&f=1.b')).toBe('/ships/fittings/compare?f=1.a&f=1.b');
    expect(fittingCompareHref('f=1.a')).toBe('/ships/fittings/compare?f=1.a');
    expect(fittingCompareHref('')).toBe('/ships/fittings/compare');
  });
});
