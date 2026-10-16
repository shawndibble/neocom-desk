import { describe, expect, it } from 'vitest';
import { ESI_REGISTRY } from '@/esi/registry';
import {
  KIND_CATEGORIES,
  WIDGET_KINDS,
  getKind,
  isAddable,
  isKnownKind,
  type WidgetKindDef,
} from './kinds';

const ALL_IDS = [
  'training',
  'sp',
  'location',
  'jumpTimers',
  'clones',
  'wallet',
  'walletFlow',
  'netWorth',
  'orders',
  'priceWatch',
  'stock',
  'lp',
  'miningTax',
  'industry',
  'profit',
  'miningYield',
  'survey',
  'planetary',
  'structures',
  'moonChunks',
  'incursions',
  'routeSafety',
  'hauling',
  'kills',
  'omega',
  'comingUp',
  'contracts',
  'mail',
];

describe('widget kind catalogue', () => {
  it('holds exactly the 28 kinds the mockup defines', () => {
    expect(WIDGET_KINDS.map((k) => k.id).sort()).toEqual([...ALL_IDS].sort());
  });

  it('has unique ids', () => {
    expect(new Set(WIDGET_KINDS.map((k) => k.id)).size).toBe(WIDGET_KINDS.length);
  });

  it('gives every kind a default view it actually has, and a default size', () => {
    for (const k of WIDGET_KINDS) {
      expect(k.views.length, k.id).toBeGreaterThan(0);
      expect(k.views, k.id).toContain(k.defaultView);
      expect(['S', 'M', 'L', 'F'], k.id).toContain(k.defaultSize);
    }
  });

  it('every kind has the Number view (the headline is always visible)', () => {
    for (const k of WIDGET_KINDS) expect(k.views, k.id).toContain('number');
  });

  it('uses every one of the six categories', () => {
    expect(KIND_CATEGORIES).toHaveLength(6);
    for (const c of KIND_CATEGORIES) {
      expect(
        WIDGET_KINDS.some((k) => k.category === c),
        c
      ).toBe(true);
    }
    for (const k of WIDGET_KINDS) expect(KIND_CATEGORIES, k.id).toContain(k.category);
  });

  it('derives i18n keys from the id', () => {
    for (const k of WIDGET_KINDS) {
      expect(k.titleKey).toBe(`overview.widgets.${k.id}.title`);
      expect(k.descKey).toBe(`overview.widgets.${k.id}.description`);
      expect(k.emptyMessageKey).toBe(`overview.widgets.${k.id}.empty`);
    }
  });

  it('only names endpoints that exist in the ESI registry', () => {
    for (const k of WIDGET_KINDS) {
      for (const e of k.endpoints) expect(ESI_REGISTRY, `${k.id}:${e}`).toHaveProperty(e);
    }
  });

  it('reduces the views the spec says are reduced', () => {
    const v = (id: string) => getKind(id)!.views;
    expect(v('sp')).toEqual(['number', 'table']);
    expect(v('priceWatch')).toEqual(['number', 'table']);
    // No per-payee breakdown exists, so there is nothing honest to chart.
    expect(v('miningTax')).toEqual(['number', 'table']);
    expect(v('wallet')).toEqual(['number', 'chart', 'table']);
    expect(v('netWorth')).toEqual(['number', 'chart', 'table']);
  });

  it('opens each kind in a view it offers, per the defaults matrix', () => {
    for (const k of WIDGET_KINDS) expect(k.views, k.id).toContain(k.defaultView);
    const view = (id: string) => getKind(id)!.defaultView;
    // Not everything is a Number: some answer best as a chart, some as a table.
    for (const id of ['training', 'sp', 'location', 'miningTax'])
      expect(view(id), id).toBe('number');
    for (const id of [
      'wallet',
      'walletFlow',
      'netWorth',
      'lp',
      'profit',
      'miningYield',
      'routeSafety',
    ]) {
      expect(view(id), id).toBe('chart');
    }
    for (const id of [
      'clones',
      'orders',
      'priceWatch',
      'stock',
      'industry',
      'planetary',
      'structures',
      'moonChunks',
      'incursions',
      'comingUp',
      'contracts',
      'mail',
    ]) {
      expect(view(id), id).toBe('table');
    }
  });

  it('opens each kind at the size the defaults matrix names', () => {
    const size = (id: string) => getKind(id)!.defaultSize;
    for (const id of ['training', 'sp', 'location', 'wallet', 'miningTax', 'incursions']) {
      expect(size(id), id).toBe('S');
    }
    expect(size('orders')).toBe('L');
    for (const id of ['netWorth', 'lp', 'structures', 'moonChunks', 'contracts', 'mail']) {
      expect(size(id), id).toBe('M');
    }
  });

  it('marks no kind as coming soon: every kind is available', () => {
    const soon = WIDGET_KINDS.filter((k) => k.availability === 'comingSoon').map((k) => k.id);
    expect(soon).toEqual([]);
    expect(isAddable('wallet')).toBe(true);
    expect(isAddable('routeSafety')).toBe(true);
    expect(isAddable('kills')).toBe(true);
    expect(isAddable('nope')).toBe(false);
  });

  it('gives a range only to the kinds that read a time window', () => {
    const ranged = WIDGET_KINDS.filter((k: WidgetKindDef) => k.hasRange).map((k) => k.id);
    expect(ranged.sort()).toEqual(['kills', 'miningYield', 'profit', 'wallet', 'walletFlow']);
  });

  it('looks kinds up and tells known from unknown', () => {
    expect(getKind('orders')?.id).toBe('orders');
    expect(getKind('someFutureKind')).toBeUndefined();
    expect(isKnownKind('orders')).toBe(true);
    expect(isKnownKind('someFutureKind')).toBe(false);
  });
});
