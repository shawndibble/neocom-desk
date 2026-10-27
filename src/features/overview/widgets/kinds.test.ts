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
  rangeAppliesTo,
  showOf,
  widgetKeys,
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
  'netWorth',
  'orders',
  'priceWatch',
  'marketTrend',
  'stock',
  'lp',
  'belowMarket',
  'miningTax',
  'industry',
  'profit',
  'miningYield',
  'survey',
  'planetary',
  'mercenaryDens',
  'structures',
  'moonChunks',
  'incursions',
  'sovRaids',
  'routeSafety',
  'hauling',
  'kills',
  'omega',
  'eveTime',
  'comingUp',
  'contracts',
  'mail',
];

const CORP_IDS = [
  'structures',
  'moonChunks',
  'corpDeadlines',
  'corpStarbases',
  'corpSovereignty',
  'corpCustomsOffices',
  'corpWallet',
  'corpOrders',
  'corpMembers',
  'corpInactive',
  'corpRoleAudit',
  'corpJobs',
  'corpMining',
  'corpKills',
  'corpContracts',
  'corpAssets',
  'corpSrp',
];

const CORP_SOON: string[] = [];

const overviewKinds = () => boardKinds('overview');

describe('widget kind catalogue', () => {
  it('offers the Overview exactly the 31 kinds the mockups define', () => {
    expect(
      overviewKinds()
        .map((k) => k.id)
        .sort()
    ).toEqual([...ALL_IDS].sort());
  });

  it('offers the Corp Board its corp kinds, structures and moon chunks among them', () => {
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

  it('gates the SRP widget on the SRP officer capability alone', () => {
    const srp = getKind('corpSrp')!;
    expect(srp.availability).toBe('available');
    expect(kindOpenTo(srp, NO_CORP_CAPABILITIES)).toBe(false);
    expect(kindOpenTo(srp, { ...NO_CORP_CAPABILITIES, canManageSrp: true })).toBe(true);
    expect(kindOpenTo(srp, { ...NO_CORP_CAPABILITIES, canReadContracts: true })).toBe(false);
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

  it('uses every one of the eight categories', () => {
    expect(KIND_CATEGORIES).toHaveLength(8);
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
    for (const id of ['wallet', 'netWorth', 'lp', 'profit', 'miningYield', 'routeSafety']) {
      expect(view(id), id).toBe('chart');
    }
    for (const id of [
      'clones',
      'orders',
      'priceWatch',
      'stock',
      'industry',
      'planetary',
      'mercenaryDens',
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
      'corpMining',
      'corpWallet',
      'kills',
      'marketTrend',
      'miningYield',
      'omega',
      'profit',
      'wallet',
    ]);
  });

  it('gives the wallet kinds a Show setting, its first option the default', () => {
    expect(getKind('wallet')!.shows).toEqual(['balance', 'flow']);
    expect(getKind('corpWallet')!.shows).toEqual(['divisions', 'flow', 'sources']);
    expect(getKind('orders')!.shows).toEqual([]);
    expect(getKind('structures')!.shows).toEqual(['all', 'problems']);
    for (const retired of ['walletFlow', 'corpCashFlow', 'corpIncome']) {
      expect(getKind(retired), retired).toBeUndefined();
    }
  });

  it('reads a stored Show, falling back to the default for a missing or unknown one', () => {
    const wallet = getKind('wallet')!;
    expect(showOf(wallet, 'flow')).toBe('flow');
    expect(showOf(wallet, undefined)).toBe('balance');
    expect(showOf(wallet, 'sources')).toBe('balance');
    expect(showOf(wallet, 7)).toBe('balance');
    expect(showOf(getKind('orders')!, 'flow')).toBeUndefined();
  });

  it('applies the range only to a Show that reads a window', () => {
    const corp = getKind('corpWallet')!;
    // Divisions are balances now: no window, as before the merge.
    expect(rangeAppliesTo(corp, undefined)).toBe(false);
    expect(rangeAppliesTo(corp, 'divisions')).toBe(false);
    expect(rangeAppliesTo(corp, 'flow')).toBe(true);
    expect(rangeAppliesTo(corp, 'sources')).toBe(true);
    expect(rangeAppliesTo(getKind('wallet')!, undefined)).toBe(true);
    expect(rangeAppliesTo(getKind('wallet')!, 'flow')).toBe(true);
    expect(rangeAppliesTo(getKind('sp')!, undefined)).toBe(false);
  });

  it('names a widget after its Show when it is not the default', () => {
    const corp = getKind('corpWallet')!;
    expect(widgetKeys(corp, undefined)).toEqual({
      titleKey: 'overview.widgets.corpWallet.title',
      emptyMessageKey: 'overview.widgets.corpWallet.empty',
    });
    expect(widgetKeys(corp, 'sources')).toEqual({
      titleKey: 'overview.widgets.corpWallet.shows.sources.title',
      emptyMessageKey: 'overview.widgets.corpWallet.shows.sources.empty',
    });
    expect(widgetKeys(getKind('wallet')!, 'nope').titleKey).toBe('overview.widgets.wallet.title');
    // Structures keeps its own name on Problems only.
    expect(widgetKeys(getKind('structures')!, 'problems').titleKey).toBe(
      'overview.widgets.structures.title'
    );
  });

  it('looks kinds up', () => {
    expect(getKind('orders')?.id).toBe('orders');
    expect(getKind('someFutureKind')).toBeUndefined();
  });
});
