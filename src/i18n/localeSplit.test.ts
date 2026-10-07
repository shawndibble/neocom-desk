import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import {
  LAZY_SECTIONS,
  STARTUP_ROOTS,
  leafPaths,
  planLocaleSplit,
  referencedLeaves,
  staticImportClosure,
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

  it('tells apart sections where one name prefixes another, in either list order', () => {
    const tree: LocaleTree = { pi: { title: 'PI' }, piShared: { slots: 'Slots' } };
    for (const sections of [
      ['pi', 'piShared'],
      ['piShared', 'pi'],
    ]) {
      const leaves = leafPaths(tree, sections);
      expect(
        [...referencedLeaves(`t('piShared.slots'); t('pi.title')`, leaves, sections)].sort()
      ).toEqual(['pi.title', 'piShared.slots']);
    }
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

describe('group ids', () => {
  it('do not shift when an unrelated key gains or loses a group', () => {
    const before = planLocaleSplit(EN, {
      '/src/A.tsx': `t('market.title')`,
      '/src/B.tsx': `t('market.orders.buy')`,
      '/src/C.tsx': `t('industry.title')`,
    });
    const after = planLocaleSplit(EN, {
      '/src/A.tsx': `t('market.title')`,
      '/src/AA.tsx': `t('market.orders.sell')`,
      '/src/B.tsx': `t('market.orders.buy')`,
      '/src/C.tsx': `t('industry.title')`,
    });
    for (const file of ['/src/A.tsx', '/src/B.tsx', '/src/C.tsx']) {
      expect(after.importsByFile.get(file)).toEqual(before.importsByFile.get(file));
    }
  });
});

describe('group ids across checkouts', () => {
  it('depend only on paths below the source root, wherever the checkout lives', () => {
    const at = (srcRoot: string) =>
      planLocaleSplit(
        EN,
        { [`${srcRoot}/A.tsx`]: `t('market.title')` },
        LAZY,
        new Set(),
        srcRoot
      ).groups.keys();
    expect([...at('/home/src/proj/src')]).toEqual([...at('/tmp/proj/src')]);
  });
});

describe('planLocaleSplit with startup files', () => {
  it('keeps every key a startup file names in the shell, so no group loads at boot', () => {
    const plan = planLocaleSplit(
      EN,
      {
        '/src/Shell.tsx': `t('market.title')`,
        '/src/Market.tsx': `t('market.title'); t('market.orders.buy')`,
      },
      LAZY,
      new Set(['/src/Shell.tsx'])
    );
    expect(plan.importsByFile.has('/src/Shell.tsx')).toBe(false);
    expect([...plan.groups.values()]).toEqual([{ market: { orders: { buy: 'Buy' } } }]);
    expect((plan.shell.market as LocaleTree).title).toBe('Market');
  });
});

describe('staticImportClosure', () => {
  const sources = {
    '/src/main.tsx': [
      "import './i18n';",
      "import { a } from '@/lib/a';",
      "import type { T } from './types';",
      "const lazy = () => import('./routes/Page');",
      "export { b } from './b';",
    ].join('\n'),
    '/src/i18n/index.ts': '',
    '/src/lib/a.ts': "import { c } from '../c';",
    '/src/c.tsx': '',
    '/src/b.ts': '',
    '/src/types.ts': '',
    '/src/routes/Page.tsx': "import { d } from './d';",
    '/src/routes/d.ts': '',
  };

  it('follows static value imports and re-exports, not type-only or dynamic ones', () => {
    expect([...staticImportClosure(sources, ['/src/main.tsx'], '/src')].sort()).toEqual([
      '/src/b.ts',
      '/src/c.tsx',
      '/src/i18n/index.ts',
      '/src/lib/a.ts',
      '/src/main.tsx',
    ]);
  });

  it('walks from every root it is given', () => {
    expect(
      staticImportClosure(sources, ['/src/main.tsx', '/src/routes/Page.tsx'], '/src')
    ).toContain('/src/routes/d.ts');
  });
});

describe('the real en.json against the real sources', () => {
  // Every string a build can split, so a key added on any branch is covered
  // the moment it lands: nothing it adds can fall out of both halves.
  // The same inputs `localeSplitPlugin.ts` gives it.
  const all = import.meta.glob<string>(
    ['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/**/*.d.ts', '!/src/test/**'],
    { query: '?raw', import: 'default', eager: true }
  );
  const sources = Object.fromEntries(
    Object.entries(all).filter(([file]) => !file.startsWith('/src/i18n/'))
  );
  const roots = STARTUP_ROOTS.map((root) => `/src/${root}`);
  const startup = staticImportClosure(all, roots, '/src');
  const plan = planLocaleSplit(en as LocaleTree, sources, LAZY_SECTIONS, startup);

  it('walks the real startup graph from roots that all exist', () => {
    for (const root of roots) expect(Object.keys(all)).toContain(root);
    expect(startup).toContain('/src/i18n/index.ts');
    expect(startup).toContain('/src/app/App.tsx');
  });

  it('gives no startup file a group to import: its keys are all in the shell', () => {
    for (const file of startup) expect(plan.importsByFile.has(file)).toBe(false);
  });

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
