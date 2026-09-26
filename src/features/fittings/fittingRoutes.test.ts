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
  legacyShipsLocation,
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

describe('legacyShipsLocation', () => {
  it('opens every Share Link ever copied (/fittings?f=) in the editor, in one hop', () => {
    expect(legacyShipsLocation('/fittings', '?f=1.abc_-', '')).toEqual({
      pathname: '/ships/fittings/edit',
      search: '?f=1.abc_-',
      hash: '',
    });
    expect(legacyShipsLocation('/fittings/', '?f=1.abc', '#x')).toEqual({
      pathname: '/ships/fittings/edit',
      search: '?f=1.abc',
      hash: '#x',
    });
  });

  it('sends the old library to the Fittings tab, keeping query and hash', () => {
    expect(legacyShipsLocation('/fittings', '', '')).toEqual({
      pathname: '/ships/fittings',
      search: '',
      hash: '',
    });
    expect(legacyShipsLocation('/fittings', '?q=rifter', '#top')).toEqual({
      pathname: '/ships/fittings',
      search: '?q=rifter',
      hash: '#top',
    });
  });

  it('moves the old editor path, and sends it to the library with no Fitting', () => {
    expect(legacyShipsLocation('/fittings/edit', '?f=1.abc', '')).toEqual({
      pathname: '/ships/fittings/edit',
      search: '?f=1.abc',
      hash: '',
    });
    expect(legacyShipsLocation('/fittings/edit', '', '')).toEqual({
      pathname: '/ships/fittings',
      search: '',
      hash: '',
    });
    expect(legacyShipsLocation('/fittings/edit', '?f=', '')).toEqual({
      pathname: '/ships/fittings',
      search: '?f=',
      hash: '',
    });
  });

  it('moves Compare with its codes', () => {
    expect(legacyShipsLocation('/fittings/compare', '?f=1.a&f=1.b', '')).toEqual({
      pathname: '/ships/fittings/compare',
      search: '?f=1.a&f=1.b',
      hash: '',
    });
    expect(legacyShipsLocation('/fittings/compare/', '', '')).toEqual({
      pathname: '/ships/fittings/compare',
      search: '',
      hash: '',
    });
  });

  it('sends the old Skills › Ships page to the Tree', () => {
    expect(legacyShipsLocation('/skills/ships', '', '')).toEqual({
      pathname: '/ships/tree',
      search: '',
      hash: '',
    });
    expect(legacyShipsLocation('/skills/ships', '?a=1', '#b')).toEqual({
      pathname: '/ships/tree',
      search: '?a=1',
      hash: '#b',
    });
  });

  it('treats any other old /fittings path as the old library', () => {
    expect(legacyShipsLocation('/fittings/nope', '?f=1.abc', '')).toEqual({
      pathname: '/ships/fittings/edit',
      search: '?f=1.abc',
      hash: '',
    });
    expect(legacyShipsLocation('/fittings/nope', '', '')).toEqual({
      pathname: '/ships/fittings',
      search: '',
      hash: '',
    });
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
