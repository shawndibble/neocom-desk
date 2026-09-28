import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import {
  LAZY_SECTIONS,
  leafPaths,
  planLocaleSplit,
  referencedLeaves,
  type LocaleTree,
} from './localeSplit';

const EN: LocaleTree = {
  common: { save: 'Save' },
  market: {
    title: 'Market',
    items_one: '{{count}} item',
    items_other: '{{count}} items',
    sortAsc: 'Ascending',
    sortDesc: 'Descending',
    orders: { buy: 'Buy', sell: 'Sell', empty: { title: 'None' } },
    source: { 'player-poco': 'Player', 'npc-poco': 'NPC' },
    reauthHint: 'Reconnect for market',
  },
  industry: { title: 'Industry', reauthHint: 'Reconnect for industry' },
};
const LAZY = ['market', 'industry'];
const LEAVES = leafPaths(EN, LAZY);
const refs = (code: string) => [...referencedLeaves(code, LEAVES, LAZY)].sort();

/** Deep-merge `from` into `into`, the way `addResourceBundle(…, true, false)` does. */
function merge(into: LocaleTree, from: LocaleTree): LocaleTree {
  for (const [key, value] of Object.entries(from)) {
    const current = into[key];
    if (typeof value === 'object' && typeof current === 'object') merge(current, value);
    else into[key] = typeof value === 'object' ? merge({}, value) : value;
  }
  return into;
}

describe('referencedLeaves', () => {
  it('finds a plain key literal, in any quote style or JSX attribute', () => {
    expect(refs(`t('market.title')`)).toEqual(['market.title']);
    expect(refs(`t("market.orders.buy")`)).toEqual(['market.orders.buy']);
    expect(refs('t(`market.orders.sell`)')).toEqual(['market.orders.sell']);
    expect(refs(`<Trans i18nKey="industry.title" />`)).toEqual(['industry.title']);
  });

  it('takes every leaf under a subtree key (returnObjects, or a prefix constant)', () => {
    expect(refs(`const BASE = 'market.orders';`)).toEqual([
      'market.orders.buy',
      'market.orders.empty.title',
      'market.orders.sell',
    ]);
  });

  it('takes the plural and context variants of a key', () => {
    expect(refs(`t('market.items', { count })`)).toEqual([
      'market.items_one',
      'market.items_other',
    ]);
  });

  it('keeps hyphens inside a key segment', () => {
    expect(refs(`t('market.source.player-poco')`)).toEqual(['market.source.player-poco']);
  });

  it('takes every leaf under a template prefix that ends at a dot', () => {
    expect(refs('t(`market.orders.${side}`)')).toEqual([
      'market.orders.buy',
      'market.orders.empty.title',
      'market.orders.sell',
    ]);
    expect(refs('t(`industry.${key}`)')).toEqual(['industry.reauthHint', 'industry.title']);
  });

  it('takes every sibling a template can complete mid-segment', () => {
    expect(refs('t(`market.sort${dir}`)')).toEqual(['market.sortAsc', 'market.sortDesc']);
  });

  it('takes the named leaf in every lazy section for a key composed from a variable section', () => {
    expect(refs('t(`${namespace}.reauthHint`)')).toEqual([
      'industry.reauthHint',
      'market.reauthHint',
    ]);
  });

  it('ignores a bare section name, a missing key, and non-lazy sections', () => {
    expect(refs(`const tab = 'market'; t('common.save'); t('market.nope')`)).toEqual([]);
    expect(refs(`const marketing = 'marketing.title';`)).toEqual([]);
  });
});

describe('planLocaleSplit', () => {
  const sources = {
    '/src/Shell.tsx': `t('common.save'); t('market.title')`,
    '/src/Market.tsx': `t('market.title'); t('market.orders.buy'); t('market.items', { count })`,
    '/src/Industry.tsx': `t('industry.title')`,
    '/src/Gate.tsx': 't(`${ns}.reauthHint`)',
  };
  const plan = planLocaleSplit(EN, sources, LAZY);

  it('puts one key used by several files in one group they all import', () => {
    const shared = plan.importsByFile.get('/src/Shell.tsx')!;
    expect(shared).toHaveLength(1);
    expect(plan.groups.get(shared[0])).toEqual({ market: { title: 'Market' } });
    expect(plan.importsByFile.get('/src/Market.tsx')).toContain(shared[0]);
  });

  it('groups each key with the others used by exactly the same files', () => {
    const own = plan.importsByFile
      .get('/src/Market.tsx')!
      .filter((id) => !plan.importsByFile.get('/src/Shell.tsx')!.includes(id));
    expect(own.map((id) => plan.groups.get(id))).toEqual([
      {
        market: {
          orders: { buy: 'Buy' },
          items_one: '{{count}} item',
          items_other: '{{count}} items',
        },
      },
    ]);
  });

  it('keeps non-lazy sections and every unreferenced lazy key in the shell', () => {
    expect(plan.shell).toEqual({
      common: { save: 'Save' },
      market: {
        sortAsc: 'Ascending',
        sortDesc: 'Descending',
        orders: { sell: 'Sell', empty: { title: 'None' } },
        source: { 'player-poco': 'Player', 'npc-poco': 'NPC' },
      },
    });
  });

  it('gives files with no lazy keys nothing to import', () => {
    expect(plan.importsByFile.has('/src/Nothing.tsx')).toBe(false);
  });

  it('loses nothing: shell plus every group is the whole locale', () => {
    const union = merge(merge({}, plan.shell), {});
    for (const group of plan.groups.values()) merge(union, group);
    expect(union).toEqual(EN);
  });
});

describe('the real en.json against the real sources', () => {
  // Every string a build can split, so a key added on any branch is covered
  // the moment it lands: nothing it adds can fall out of both halves.
  const sources = import.meta.glob<string>(
    [
      '/src/**/*.{ts,tsx}',
      '!/src/**/*.test.{ts,tsx}',
      '!/src/**/*.d.ts',
      '!/src/test/**',
      '!/src/i18n/**',
    ],
    { query: '?raw', import: 'default', eager: true }
  );
  const plan = planLocaleSplit(en as LocaleTree, sources);

  it('splits into a shell and groups that together are exactly en.json', () => {
    const union = merge({}, plan.shell);
    for (const group of plan.groups.values()) merge(union, group);
    expect(union).toEqual(en);
  });

  it('only ever splits a section on the lazy list', () => {
    for (const group of plan.groups.values()) {
      for (const section of Object.keys(group)) expect(LAZY_SECTIONS).toContain(section);
    }
  });

  it('moves most of the locale out of the shell', () => {
    const shellBytes = JSON.stringify(plan.shell).length;
    expect(shellBytes / JSON.stringify(en).length).toBeLessThan(0.3);
  });
});
