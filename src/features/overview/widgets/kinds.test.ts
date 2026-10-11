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
  'comingUp',
  'contracts',
  'mail',
];

describe('widget kind catalogue', () => {
  it('holds exactly the 27 kinds the mockup defines', () => {
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
    expect(v('sp')).toEqual(['number', 'list']);
    expect(v('priceWatch')).toEqual(['number', 'list']);
    // No per-payee breakdown exists, so there is nothing honest to chart.
    expect(v('miningTax')).toEqual(['number', 'list']);
    expect(v('wallet')).toEqual(['number', 'chart', 'list']);
    expect(v('netWorth')).toEqual(['number', 'chart', 'list']);
  });

  it('marks the five unbuilt kinds as coming soon and the rest as available', () => {
    const soon = WIDGET_KINDS.filter((k) => k.availability === 'comingSoon').map((k) => k.id);
    expect(soon.sort()).toEqual(['hauling', 'jumpTimers', 'kills', 'routeSafety', 'survey']);
    expect(isAddable('wallet')).toBe(true);
    expect(isAddable('survey')).toBe(false);
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
