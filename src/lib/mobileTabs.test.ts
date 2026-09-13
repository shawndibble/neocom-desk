import { describe, expect, it } from 'vitest';
import {
  barTabs,
  DEFAULT_MOBILE_TABS,
  MOBILE_TAB_CHOICES,
  MOBILE_TAB_COUNT,
  NAV_LABEL_KEYS,
  mobileSheetPaths,
  parseMobileTabs,
  sortMobileTabs,
} from './mobileTabs';

describe('parseMobileTabs', () => {
  it('accepts a full set of known paths', () => {
    expect(parseMobileTabs(['/overview', '/wallet', '/mail', '/assets'])).toEqual([
      '/overview',
      '/wallet',
      '/assets',
      '/mail',
    ]);
  });

  it('repairs the order rather than rejecting it — the set is still the choice', () => {
    expect(parseMobileTabs(['/mail', '/industry', '/alerts', '/overview'])).toEqual([
      '/overview',
      '/alerts',
      '/industry',
      '/mail',
    ]);
  });

  it.each([
    ['too few', ['/overview', '/skills', '/mail']],
    ['too many', ['/overview', '/skills', '/mail', '/wallet', '/assets']],
    ['a repeat', ['/overview', '/overview', '/skills', '/mail']],
    ['an unknown path', ['/overview', '/skills', '/mail', '/corp']],
    ['a non-path entry', ['/overview', '/skills', '/mail', 7]],
  ])('rejects %s, so the bar falls back to the default', (_case, raw) => {
    expect(parseMobileTabs(raw)).toBeNull();
  });

  it.each([
    ['a non-array', 'overview'],
    ['null', null],
    ['undefined — the cold-device case', undefined],
  ])('rejects %s', (_case, raw) => {
    expect(parseMobileTabs(raw)).toBeNull();
  });
});

describe('the bar and the sheet split the choices between them', () => {
  it('sends everything the bar does not hold to the sheet, in canonical order', () => {
    const tabs = parseMobileTabs(['/wallet', '/overview', '/mail', '/assets']) ?? [];
    const sheet = mobileSheetPaths(tabs);

    expect([...tabs, ...sheet].toSorted()).toEqual([...MOBILE_TAB_CHOICES].toSorted());
    expect(sheet).toEqual(MOBILE_TAB_CHOICES.filter((path) => !tabs.includes(path)));
  });

  it('sends the default bar’s own paths to the sheet once they are replaced', () => {
    const sheet = mobileSheetPaths(sortMobileTabs(['/wallet', '/assets', '/mail', '/calendar']));

    for (const replaced of DEFAULT_MOBILE_TABS) expect(sheet).toContain(replaced);
  });
});

describe('the default bar', () => {
  it('is a full bar of known paths', () => {
    expect(DEFAULT_MOBILE_TABS).toHaveLength(MOBILE_TAB_COUNT);
    expect(parseMobileTabs([...DEFAULT_MOBILE_TABS])).toEqual([...DEFAULT_MOBILE_TABS]);
  });
});

describe('labels', () => {
  it('names every choice, so no tab or sheet row can render blank', () => {
    for (const path of MOBILE_TAB_CHOICES) {
      expect(NAV_LABEL_KEYS[path]).toMatch(/^nav\./);
    }
  });
});

describe('barTabs', () => {
  it('sorts a full bar into canonical order', () => {
    expect(barTabs(['/mail', '/overview', '/wallet', '/assets'])).toEqual([
      '/overview',
      '/wallet',
      '/assets',
      '/mail',
    ]);
  });

  it.each([
    ['short', ['/overview', '/wallet'] as const],
    ['empty', [] as const],
  ])('falls back to the default rather than render a %s bar', (_case, stored) => {
    expect(barTabs([...stored])).toEqual([...DEFAULT_MOBILE_TABS]);
  });

  it('keeps the sheet a true complement of whatever the bar ends up as', () => {
    const bar = barTabs(['/overview', '/wallet']);
    const sheet = mobileSheetPaths(bar);

    expect(bar).toHaveLength(MOBILE_TAB_COUNT);
    expect([...bar, ...sheet].toSorted()).toEqual([...MOBILE_TAB_CHOICES].toSorted());
  });
});
