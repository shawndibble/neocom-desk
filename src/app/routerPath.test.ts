import { describe, expect, it } from 'vitest';
import { basenameOf, isOnRoute, routerPathOf, routerPathname } from './routerPath';

describe('basenameOf', () => {
  it('is `/` for the root base', () => {
    expect(basenameOf('/')).toBe('/');
  });

  it('drops the trailing slash of a sub-path base', () => {
    expect(basenameOf('/neocom-desk/')).toBe('/neocom-desk');
  });
});

describe('routerPathname', () => {
  it('is the pathname unchanged at the root base', () => {
    expect(routerPathname('/market/orders', '/')).toBe('/market/orders');
  });

  it('strips a sub-path base, since the router is mounted under it', () => {
    expect(routerPathname('/neocom-desk/settings', '/neocom-desk/')).toBe('/settings');
  });

  it('strips the base only at a path-segment boundary', () => {
    expect(routerPathname('/neocom-desktop/x', '/neocom-desk/')).toBe('/neocom-desktop/x');
  });

  it('maps the bare base itself to the root route, with or without its slash', () => {
    expect(routerPathname('/neocom-desk/', '/neocom-desk/')).toBe('/');
    expect(routerPathname('/neocom-desk', '/neocom-desk/')).toBe('/');
  });
});

describe('routerPathOf', () => {
  it('keeps the query and hash', () => {
    const location = { pathname: '/neocom-desk/market/orders', search: '?tab=sell', hash: '#x' };
    expect(routerPathOf(location, '/neocom-desk/')).toBe('/market/orders?tab=sell#x');
  });
});

describe('isOnRoute', () => {
  it('matches the route itself and anything below or after it', () => {
    expect(isOnRoute('/callback', '/callback')).toBe(true);
    expect(isOnRoute('/callback?code=abc', '/callback')).toBe(true);
    expect(isOnRoute('/callback#x', '/callback')).toBe(true);
    expect(isOnRoute('/callback/more', '/callback')).toBe(true);
  });

  it('does not match a different route that shares a prefix', () => {
    expect(isOnRoute('/callbacks', '/callback')).toBe(false);
    expect(isOnRoute('/login', '/callback')).toBe(false);
  });
});
