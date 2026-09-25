import { describe, expect, it } from 'vitest';
import { fittingEditLocation, fittingsRedirect } from './fittingRoutes';

describe('fittingsRedirect', () => {
  it('sends an old Share Link to the editor, keeping the query', () => {
    expect(fittingsRedirect('/fittings', '?f=1.abc')).toBe('/fittings/edit?f=1.abc');
    expect(fittingsRedirect('/fittings/', '?f=1.abc')).toBe('/fittings/edit?f=1.abc');
  });

  it('sends the editor with no Fitting to the library', () => {
    expect(fittingsRedirect('/fittings/edit', '')).toBe('/fittings');
    expect(fittingsRedirect('/fittings/edit', '?f=')).toBe('/fittings');
  });

  it('stays put on the library and on an open Fitting', () => {
    expect(fittingsRedirect('/fittings', '')).toBeNull();
    expect(fittingsRedirect('/fittings/edit', '?f=1.abc')).toBeNull();
  });
});

describe('fittingEditLocation', () => {
  it('puts the code in ?f= on the editor path', () => {
    expect(fittingEditLocation('1.abc_-')).toEqual({
      pathname: '/fittings/edit',
      search: '?f=1.abc_-',
    });
  });
});
