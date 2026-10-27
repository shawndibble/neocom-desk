import { describe, expect, it } from 'vitest';
import {
  barTabs,
  DEFAULT_MOBILE_TABS,
  MOBILE_TAB_CHOICES,
  MOBILE_TAB_COUNT,
  NAV_LABEL_KEYS,
  parseMobileTabs,
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
    expect(parseMobileTabs(['/mail', '/industry', '/skills', '/overview'])).toEqual([
      '/overview',
      '/skills',
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

  it('migrates a stored /moon-mining choice to /mining (#1304 rename)', () => {
    expect(parseMobileTabs(['/overview', '/skills', '/mail', '/moon-mining'])).toEqual([
      '/overview',
      '/skills',
      '/mining',
      '/mail',
    ]);
  });

  it('keeps a stored Fittings choice as Ships (the section was renamed)', () => {
    expect(parseMobileTabs(['/overview', '/skills', '/industry', '/fittings'])).toEqual([
      '/overview',
      '/skills',
      '/industry',
      '/ships',
    ]);
  });

  it('still rejects a stored /moon-mining choice alongside its own replacement, as a duplicate', () => {
    expect(parseMobileTabs(['/overview', '/skills', '/mining', '/moon-mining'])).toBeNull();
  });
});

describe('the default bar', () => {
  it('is a full bar of known paths', () => {
    expect(DEFAULT_MOBILE_TABS).toHaveLength(MOBILE_TAB_COUNT);
    expect(parseMobileTabs([...DEFAULT_MOBILE_TABS])).toEqual([...DEFAULT_MOBILE_TABS]);
  });
});

describe('the choice list', () => {
  it('is the rail order without /corp, /settings and /help, /characters last (derived from the nav descriptor)', () => {
    expect(MOBILE_TAB_CHOICES).toEqual([
      '/overview',
      '/skills',
      '/industry',
      '/ships',
      '/mining',
      '/planetary-industry',
      '/travel',
      '/market',
      '/wallet',
      '/assets',
      '/contracts',
      '/mail',
      '/calendar',
      '/contacts',
      '/communities',
      '/characters',
    ]);
  });

  it('includes /characters, off by default, last in canonical order (#1764 — it keeps the More-sheet position it has today)', () => {
    expect(MOBILE_TAB_CHOICES).toContain('/characters');
    expect(MOBILE_TAB_CHOICES.at(-1)).toBe('/characters');
    expect(DEFAULT_MOBILE_TABS).not.toContain('/characters');
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
});
