import { describe, expect, it } from 'vitest';
import {
  canHide,
  DEFAULT_SHOWN_NAV,
  defaultHiddenNav,
  parseHiddenNav,
  parseRecentNav,
  pushRecentNav,
  recentNavFor,
  viewPathFor,
} from './navRail';

describe('viewPathFor', () => {
  it('is the deepest destination a path falls under', () => {
    expect(viewPathFor('/market/orders')).toBe('/market/orders');
    expect(viewPathFor('/wallet/lp-store/1000125')).toBe('/wallet/lp-store');
    expect(viewPathFor('/industry/plans/7')).toBe('/industry/plans');
    expect(viewPathFor('/alerts')).toBe('/alerts');
  });

  it('is null off the nav', () => {
    expect(viewPathFor('/login')).toBeNull();
  });
});

describe('canHide', () => {
  it('lets a pilot hide an ordinary page or a view', () => {
    expect(canHide('/mining')).toBe(true);
    expect(canHide('/industry/logs')).toBe(true);
  });

  it('never hides the pages that are the only way to something', () => {
    for (const path of ['/settings', '/characters', '/help']) {
      expect(canHide(path)).toBe(false);
    }
  });

  it('lets a pilot hide each Corp page on its own', () => {
    for (const path of [
      '/corp',
      '/corp/members',
      '/corp/wallet',
      '/corp/assets',
      '/corp/moons',
      '/corp/srp',
    ]) {
      expect(canHide(path)).toBe(true);
    }
  });
});

describe('parseHiddenNav', () => {
  it('keeps known, hideable paths once each, in nav order', () => {
    expect(parseHiddenNav(['/planetary-industry', '/mining', '/mining'])).toEqual([
      '/mining',
      '/planetary-industry',
    ]);
  });

  it('drops what cannot be hidden, but keeps a path from a newer build so it stays hidden there', () => {
    expect(parseHiddenNav(['/settings', '/newer-page', 42, '/mining'])).toEqual([
      '/mining',
      '/newer-page',
    ]);
  });

  it('rejects a value that is not a list', () => {
    expect(parseHiddenNav('mining')).toBeNull();
    expect(parseHiddenNav(null)).toBeNull();
  });
});

describe('recent views', () => {
  it('puts the newest view first and never lists one twice', () => {
    let recent: string[] = [];
    recent = pushRecentNav(recent, '/market/orders');
    recent = pushRecentNav(recent, '/travel/pilot');
    recent = pushRecentNav(recent, '/market/orders');
    expect(recent).toEqual(['/market/orders', '/travel/pilot']);
  });

  it('keeps a short list', () => {
    let recent: string[] = [];
    for (const path of ['/alerts', '/mail', '/assets', '/wallet/journal', '/travel/pilot']) {
      recent = pushRecentNav(recent, path);
    }
    expect(recent).toEqual(['/travel/pilot', '/wallet/journal', '/assets', '/mail']);
  });

  it('shows the three newest other than the one you are on', () => {
    const recent = ['/market/orders', '/travel/pilot', '/assets', '/mail'];
    expect(recentNavFor(recent, '/market/orders')).toEqual(['/travel/pilot', '/assets', '/mail']);
    expect(recentNavFor(recent, '/alerts')).toEqual(['/market/orders', '/travel/pilot', '/assets']);
  });

  it('parses only known view paths from storage', () => {
    expect(parseRecentNav(['/market/orders', '/nowhere', 7])).toEqual(['/market/orders']);
    expect(parseRecentNav({})).toBeNull();
  });
});

describe('the default rail', () => {
  it('shows the eight starting pages and hides every other hideable page', () => {
    const hidden = defaultHiddenNav();
    for (const path of DEFAULT_SHOWN_NAV) expect(hidden).not.toContain(path);
    expect(hidden).toEqual(
      expect.arrayContaining(['/mining', '/planetary-industry', '/contracts', '/mail'])
    );
    expect(hidden.every((path) => canHide(path))).toBe(true);
  });

  it('never hides a page the pilot could not hide themselves', () => {
    expect(defaultHiddenNav()).not.toContain('/settings');
    expect(DEFAULT_SHOWN_NAV).toEqual(expect.arrayContaining(['/corp', '/corp/moons']));
    expect(defaultHiddenNav().filter((path) => path.startsWith('/corp'))).toEqual([]);
  });

  it('is in nav order, as a stored list is', () => {
    expect(parseHiddenNav(defaultHiddenNav())).toEqual(defaultHiddenNav());
  });
});
