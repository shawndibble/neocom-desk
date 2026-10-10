import { describe, expect, it } from 'vitest';
import {
  canHide,
  DEFAULT_SHOWN_NAV,
  defaultHiddenNav,
  hiddenNavForActivities,
  currentPagePath,
  parseHiddenNav,
  parseRecentNav,
  pushRecentNav,
  recentNavFor,
  viewPathFor,
} from './navRail';

describe('currentPagePath', () => {
  it('names the page for its own path and for any tab under it', () => {
    expect(currentPagePath('/market')).toBe('/market');
    expect(currentPagePath('/market/orders')).toBe('/market');
    expect(currentPagePath('/market/history/transactions')).toBe('/market');
  });

  it('names the page a sub-view belongs to, even where the path does not nest under it', () => {
    expect(currentPagePath('/clones')).toBe('/overview');
    expect(currentPagePath('/employment-history')).toBe('/overview');
    expect(currentPagePath('/market/lp-store/1000125')).toBe('/market');
    expect(currentPagePath('/skills/certificates')).toBe('/skills');
  });

  it('names the page for a detail route under it', () => {
    expect(currentPagePath('/industry/plans/7')).toBe('/industry');
    expect(currentPagePath('/skills/plans/3')).toBe('/skills');
    expect(currentPagePath('/corp/assets/123/456')).toBe('/corp');
  });

  it('does not match a page that only shares a prefix string', () => {
    expect(currentPagePath('/marketing')).toBeNull();
    expect(currentPagePath('/login')).toBeNull();
  });
});

describe('viewPathFor', () => {
  it('is the deepest destination a path falls under', () => {
    expect(viewPathFor('/market/orders')).toBe('/market/orders');
    expect(viewPathFor('/market/lp-store/1000125')).toBe('/market/lp-store');
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
    expect(canHide('/industry/records')).toBe(true);
  });

  it('never hides the pages that are the only way to something', () => {
    for (const path of ['/corp', '/settings', '/characters', '/help']) {
      expect(canHide(path)).toBe(false);
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
    recent = pushRecentNav(recent, '/travel/thera');
    recent = pushRecentNav(recent, '/market/orders');
    expect(recent).toEqual(['/market/orders', '/travel/thera']);
  });

  it('keeps a short list', () => {
    let recent: string[] = [];
    for (const path of ['/alerts', '/mail', '/assets', '/wallet/journal', '/travel/thera']) {
      recent = pushRecentNav(recent, path);
    }
    expect(recent).toEqual(['/travel/thera', '/wallet/journal', '/assets', '/mail']);
  });

  it('shows the three newest other than the one you are on', () => {
    const recent = ['/market/orders', '/travel/thera', '/assets', '/mail'];
    expect(recentNavFor(recent, '/market/orders')).toEqual(['/travel/thera', '/assets', '/mail']);
    expect(recentNavFor(recent, '/alerts')).toEqual(['/market/orders', '/travel/thera', '/assets']);
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
      expect.arrayContaining(['/alerts', '/mining', '/planetary-industry', '/contracts', '/mail'])
    );
    expect(hidden.every((path) => canHide(path))).toBe(true);
  });

  it('never hides a page the pilot could not hide themselves', () => {
    expect(defaultHiddenNav()).not.toContain('/settings');
    expect(defaultHiddenNav()).not.toContain('/corp');
  });

  it('is in nav order, as a stored list is', () => {
    expect(parseHiddenNav(defaultHiddenNav())).toEqual(defaultHiddenNav());
  });
});

describe('hiddenNavForActivities', () => {
  it('is the default set when nothing is picked', () => {
    expect(hiddenNavForActivities([])).toEqual(defaultHiddenNav());
  });

  it('shows the pages an activity needs on top of the default set', () => {
    const hidden = hiddenNavForActivities(['mining', 'pi']);
    expect(hidden).not.toContain('/mining');
    expect(hidden).not.toContain('/planetary-industry');
    expect(hidden).toContain('/contracts');
  });

  it('ignores an activity it does not know', () => {
    expect(hiddenNavForActivities(['nope'])).toEqual(defaultHiddenNav());
  });
});
