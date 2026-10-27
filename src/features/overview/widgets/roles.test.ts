import { describe, expect, it } from 'vitest';
import { getKind, isAddable } from './kinds';
import { presetSeed } from './galleryPresets';
import {
  BASE_KINDS,
  ROLES,
  ROLE_IDS,
  basicsLayout,
  buildLayoutFromRoles,
  defaultLayout,
} from './roles';

const kindsOf = (l: { widgets: { kind: string }[] }) => l.widgets.map((w) => w.kind);

describe('ROLES', () => {
  it('has the six roles and the four base kinds', () => {
    expect(ROLE_IDS).toHaveLength(6);
    expect(BASE_KINDS).toEqual(['wallet', 'training', 'comingUp', 'mail']);
    expect(ROLES.trader).toEqual([
      'orders',
      'priceWatch',
      'stock',
      presetSeed('walletFlow'),
      'netWorth',
    ]);
    expect(ROLES.explorerHauler).toEqual(['routeSafety', 'hauling', 'incursions', 'location']);
  });
});

describe('buildLayoutFromRoles', () => {
  const ids = () => {
    let n = 0;
    return () => `r${++n}`;
  };

  it('puts the base four first, then role kinds in order', () => {
    const l = buildLayoutFromRoles(['trader'], ids());
    expect(kindsOf(l)).toEqual([
      'wallet',
      'training',
      'comingUp',
      'mail',
      'orders',
      'priceWatch',
      'stock',
      'wallet',
      'netWorth',
    ]);
    // The Role's Wallet flow is the Wallet on its Flow, opened as the old kind was.
    expect(l.widgets[7]).toMatchObject({ show: 'flow', size: 'M', view: 'chart' });
    expect('show' in l.widgets[0]!).toBe(false);
    expect(l.version).toBe(1);
  });

  it('dedupes kinds shared between roles', () => {
    const l = buildLayoutFromRoles(['trader', 'industrialist'], ids());
    expect(kindsOf(l).filter((k) => k === 'stock')).toHaveLength(1);
  });

  it('leaves out coming-soon kinds and keeps built ones', () => {
    const l = buildLayoutFromRoles(['miner', 'fighter', 'explorerHauler'], ids());
    for (const k of kindsOf(l)) expect(isAddable(k), k).toBe(true);
    expect(kindsOf(l)).toContain('survey');
    expect(kindsOf(l)).toContain('miningYield');
    expect(kindsOf(l)).toContain('incursions');
  });

  it('gives unique ids and kind default sizes and views', () => {
    const l = buildLayoutFromRoles(['trader'], ids());
    expect(new Set(l.widgets.map((w) => w.id)).size).toBe(l.widgets.length);
    const orders = l.widgets.find((w) => w.kind === 'orders')!;
    expect(orders).toMatchObject({ size: 'L', view: 'table', scope: 'header', showOnPhone: true });
  });

  it('ignores an unknown role and with no roles is just the basics', () => {
    expect(kindsOf(buildLayoutFromRoles(['nope' as never], ids()))).toEqual([...BASE_KINDS]);
    expect(kindsOf(buildLayoutFromRoles([], ids()))).toEqual([...BASE_KINDS]);
  });
});

describe('basicsLayout', () => {
  it('is the four base kinds', () => {
    expect(kindsOf(basicsLayout())).toEqual([...BASE_KINDS]);
  });
});

describe('defaultLayout', () => {
  it('is the mockup default board without coming-soon kinds', () => {
    const l = defaultLayout();
    expect(kindsOf(l)).toEqual([
      'wallet',
      'training',
      'netWorth',
      'orders',
      'industry',
      'planetary',
      'profit',
      'priceWatch',
      'comingUp',
      'mail',
      'lp',
      'stock',
    ]);
    for (const w of l.widgets) expect(isAddable(w.kind)).toBe(true);
  });

  it('opens every widget at its kind default size and view', () => {
    for (const w of defaultLayout().widgets) {
      const def = getKind(w.kind)!;
      expect(w, w.kind).toMatchObject({ size: def.defaultSize, view: def.defaultView });
    }
    const by = Object.fromEntries(defaultLayout().widgets.map((w) => [w.kind, w]));
    expect(by.wallet).toMatchObject({ size: 'S', view: 'chart' });
    expect(by.netWorth).toMatchObject({ size: 'M', view: 'chart' });
    expect(by.industry).toMatchObject({ size: 'M', view: 'table' });
    expect(by.training).toMatchObject({ size: 'S', view: 'number' });
    expect(by.priceWatch).toMatchObject({ size: 'M', view: 'table' });
  });

  it('has unique ids and is deterministic', () => {
    const a = defaultLayout();
    expect(new Set(a.widgets.map((w) => w.id)).size).toBe(a.widgets.length);
    expect(defaultLayout()).toEqual(a);
  });
});
