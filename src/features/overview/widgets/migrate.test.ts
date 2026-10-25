import { describe, expect, it } from 'vitest';
import {
  isReturningPilot,
  migrateFromCards,
  migrateRetiredKind,
  parseHiddenCards,
} from './migrate';

const kinds = (l: { widgets: { kind: string }[] }) => l.widgets.map((w) => w.kind);

describe('migrateFromCards', () => {
  it('starts with wallet and training, then the 13 cards in built-in order (incursions off)', () => {
    const l = migrateFromCards({ hidden: [], order: [] });
    expect(kinds(l)).toEqual([
      'wallet',
      'training',
      'orders',
      'miningTax',
      'contracts',
      'planetary',
      'industry',
      'structures',
      'moonChunks',
      'comingUp',
      'sp',
      'mail',
      'priceWatch',
      'stock',
    ]);
    expect(l.version).toBe(1);
  });

  it('honours hidden cards', () => {
    const l = migrateFromCards({ hidden: ['mining', 'orders', 'alerts'], order: [] });
    expect(kinds(l)).not.toContain('miningTax');
    expect(kinds(l)).not.toContain('orders');
    expect(kinds(l)[0]).toBe('wallet');
  });

  it('turns incursions on only with the show marker', () => {
    expect(kinds(migrateFromCards({ hidden: ['show:incursions'], order: [] }))).toContain(
      'incursions'
    );
    expect(kinds(migrateFromCards({ hidden: [], order: [] }))).not.toContain('incursions');
    expect(kinds(migrateFromCards({ hidden: ['incursions'], order: [] }))).not.toContain(
      'incursions'
    );
  });

  it('follows the stored order, then appends cards the pilot never placed', () => {
    const l = migrateFromCards({ hidden: [], order: ['mail', 'spExtraction', 'orders'] });
    expect(kinds(l).slice(0, 5)).toEqual(['wallet', 'training', 'mail', 'sp', 'orders']);
    expect(kinds(l)).toContain('stock');
    expect(new Set(kinds(l)).size).toBe(kinds(l).length);
  });

  it('ignores keys this build has no card for and the retired alerts card', () => {
    const l = migrateFromCards({
      hidden: ['someFutureCard'],
      order: ['alerts', 'someFutureCard', 'mail'],
    });
    expect(kinds(l).slice(0, 3)).toEqual(['wallet', 'training', 'mail']);
    expect(kinds(l)).not.toContain('someFutureCard');
  });

  it('maps renamed cards and uses kind default sizes and unique ids', () => {
    const l = migrateFromCards({ hidden: [], order: [] });
    const sp = l.widgets.find((w) => w.kind === 'sp')!;
    expect(sp).toMatchObject({ size: 'S', view: 'number', scope: 'header', showOnPhone: true });
    expect(new Set(l.widgets.map((w) => w.id)).size).toBe(l.widgets.length);
  });

  it('uses the caller makeId', () => {
    let n = 0;
    const l = migrateFromCards({ hidden: [], order: [] }, () => `z${++n}`);
    expect(l.widgets[0].id).toBe('z1');
  });
});

describe('isReturningPilot', () => {
  it('is false with nothing stored', () => {
    expect(isReturningPilot([], [])).toBe(false);
  });
  it('is true when either old setting holds anything', () => {
    expect(isReturningPilot(['mining'], [])).toBe(true);
    expect(isReturningPilot([], ['mail'])).toBe(true);
    expect(isReturningPilot(['show:incursions'], [])).toBe(true);
  });
});

describe('parseHiddenCards', () => {
  it('keeps a list of card keys', () => {
    expect(parseHiddenCards(['mining', 'alerts'])).toEqual(['mining', 'alerts']);
  });

  /*
   * The value is last-write-wins as a whole. A build that dropped a key it
   * did not recognise would write the shortened list back on its next toggle
   * and un-hide a newer build's card on every device.
   */
  it('keeps keys this build has no card for', () => {
    expect(parseHiddenCards(['mining', 'someFutureCard'])).toEqual(['mining', 'someFutureCard']);
  });

  it('drops duplicates and anything that is not a string', () => {
    expect(parseHiddenCards(['mining', 'mining', 3, null, 'orders'])).toEqual(['mining', 'orders']);
  });

  it('rejects a value that is not a list', () => {
    expect(parseHiddenCards('mining')).toBeNull();
    expect(parseHiddenCards({ mining: true })).toBeNull();
    expect(parseHiddenCards(null)).toBeNull();
  });
});

describe('migrateRetiredKind', () => {
  it('turns an Offline services widget into Structures on Problems only, keeping the rest', () => {
    const saved = {
      id: 'x',
      kind: 'corpServices',
      size: 'M',
      view: 'table',
      scope: 'header',
      showOnPhone: false,
      rowsPerPage: 25,
    };
    expect(migrateRetiredKind(saved)).toEqual({
      ...saved,
      kind: 'structures',
      structuresShow: 'problems',
    });
  });

  it('returns any other widget as it was', () => {
    const saved = { id: 'y', kind: 'structures', view: 'chart' };
    expect(migrateRetiredKind(saved)).toBe(saved);
  });

  const saved = (over: Record<string, unknown>) => ({
    id: 'a',
    kind: 'profit',
    size: 'L',
    view: 'table',
    scope: 'all',
    range: 90,
    title: 'Mine',
    showOnPhone: false,
    ...over,
  });

  it('turns a Trading profit widget into Profit on Trading, keeping everything else', () => {
    expect(migrateRetiredKind(saved({ kind: 'tradingProfit' }))).toEqual(
      saved({ kind: 'profit', profitSource: 'trading' })
    );
  });

  it('puts a Profit widget saved before the setting on Builds, so it shows what it did', () => {
    expect(migrateRetiredKind(saved({}))).toEqual(saved({ profitSource: 'builds' }));
    expect(migrateRetiredKind(saved({ profitSource: 'nonsense' }))).toEqual(
      saved({ profitSource: 'builds' })
    );
  });

  it('leaves a Profit widget with a Source, and every other kind, as found', () => {
    const both = saved({ profitSource: 'both' });
    expect(migrateRetiredKind(both)).toBe(both);
    const wallet = saved({ kind: 'wallet' });
    expect(migrateRetiredKind(wallet)).toBe(wallet);
  });
});
