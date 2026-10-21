import { describe, expect, it } from 'vitest';
import { ESI_REGISTRY } from '@/esi/registry';
import {
  CORP_KIND_CATEGORIES,
  KIND_CATEGORIES,
  WIDGET_KINDS,
  boardKinds,
  getKind,
  isAddable,
  kindOpenTo,
  type WidgetKindDef,
} from './kinds';
import { NO_CORP_CAPABILITIES } from '@/engine/corpRoles';

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
  'belowMarket',
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
  'tradingProfit',
  'comingUp',
  'contracts',
  'mail',
];

const CORP_IDS = [
  'structures',
  'moonChunks',
  'corpDeadlines',
  'corpServices',
  'corpStarbases',
  'corpCustomsOffices',
  'corpWallet',
  'corpCashFlow',
  'corpIncome',
  'corpOrders',
  'corpMembers',
  'corpInactive',
  'corpRoleAudit',
  'corpDoctrine',
  'corpJobs',
  'corpMining',
  'corpKills',
  'corpContracts',
  'corpSrp',
  'corpProjects',
];

const CORP_SOON = [
  'corpStarbases',
  'corpOrders',
  'corpRoleAudit',
  'corpDoctrine',
  'corpContracts',
  'corpSrp',
  'corpProjects',
];

const overviewKinds = () => boardKinds('overview');

describe('widget kind catalogue', () => {
  it('offers the Overview exactly the 30 kinds the mockups define', () => {
    expect(
      overviewKinds()
        .map((k) => k.id)
        .sort()
    ).toEqual([...ALL_IDS].sort());
  });

  it('offers the Corp overview its corp kinds, structures and moon chunks among them', () => {
    expect(boardKinds('corp').map((k) => k.id)).toEqual(CORP_IDS);
  });

  it('puts every kind on at least one board, and every corp kind in a corp group', () => {
    for (const k of WIDGET_KINDS) {
      expect(Object.keys(k.boards).length, k.id).toBeGreaterThan(0);
      if (k.boards.corp) expect(CORP_KIND_CATEGORIES, k.id).toContain(k.boards.corp);
    }
  });

  it('never reuses a character kind id for a corp-only kind', () => {
    for (const k of boardKinds('corp')) {
      if (k.boards.overview === undefined) expect(k.id, k.id).toMatch(/^corp[A-Z]/);
    }
  });

  it('gates every available corp kind on a capability, and only corp kinds', () => {
    // Corp kills reads zKillboard, not corp ESI: no role or scope can gate it.
    const UNGATED = new Set(['corpKills']);
    for (const k of boardKinds('corp')) {
      if (k.availability === 'available' && !UNGATED.has(k.id)) {
        expect(k.capabilities.length, k.id).toBeGreaterThan(0);
      }
    }
    for (const k of overviewKinds()) {
      if (k.boards.corp === undefined) expect(k.capabilities, k.id).toEqual([]);
    }
  });

  it('opens a kind to any one of its capabilities, and hides it with none', () => {
    const deadlines = getKind('corpDeadlines')!;
    expect(kindOpenTo(deadlines, NO_CORP_CAPABILITIES)).toBe(false);
    expect(kindOpenTo(deadlines, null)).toBe(false);
    expect(kindOpenTo(deadlines, { ...NO_CORP_CAPABILITIES, canReadIndustry: true })).toBe(true);
    expect(kindOpenTo(getKind('wallet')!, null)).toBe(true);
  });

  it('marks the corp kinds with no data source yet as coming soon', () => {
    const soon = boardKinds('corp')
      .filter((k) => k.availability === 'comingSoon')
      .map((k) => k.id);
    expect(soon).toEqual(CORP_SOON);
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
        overviewKinds().some((k) => k.boards.overview === c),
        c
      ).toBe(true);
    }
    for (const k of overviewKinds()) expect(KIND_CATEGORIES, k.id).toContain(k.category);
  });

  it('uses every one of the corp groups', () => {
    for (const c of CORP_KIND_CATEGORIES) {
      expect(
        boardKinds('corp').some((k) => k.boards.corp === c),
        c
      ).toBe(true);
    }
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
    // zKillboard sends all-time totals only: no series to chart, no range to pick.
    expect(v('corpKills')).toEqual(['number']);
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

  it('marks no Overview kind as coming soon: every one is available', () => {
    const soon = overviewKinds()
      .filter((k) => k.availability === 'comingSoon')
      .map((k) => k.id);
    expect(soon).toEqual([]);
    expect(isAddable('wallet')).toBe(true);
    expect(isAddable('routeSafety')).toBe(true);
    expect(isAddable('kills')).toBe(true);
    expect(isAddable('nope')).toBe(false);
  });

  it('gives a range only to the kinds that read a time window', () => {
    const ranged = WIDGET_KINDS.filter((k: WidgetKindDef) => k.hasRange).map((k) => k.id);
    expect(ranged.sort()).toEqual([
      'corpCashFlow',
      'corpIncome',
      'corpMining',
      'kills',
      'miningYield',
      'omega',
      'profit',
      'tradingProfit',
      'wallet',
      'walletFlow',
    ]);
  });

  it('looks kinds up', () => {
    expect(getKind('orders')?.id).toBe('orders');
    expect(getKind('someFutureKind')).toBeUndefined();
  });
});
