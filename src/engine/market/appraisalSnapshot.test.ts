import { describe, expect, it } from 'vitest';
import { buildAppraisal, type AppraisalItem } from './appraisal';
import { parseAppraisalPaste } from './appraisalPaste';
import {
  appraisalItemsFromSnapshot,
  appraisalSnapshotPasteText,
  appraisalSnapshotReuseKey,
  buildAppraisalSnapshot,
  MAX_SNAPSHOT_ITEMS,
  parseAppraisalSnapshot,
  type AppraisalSnapshot,
} from './appraisalSnapshot';

const TRITANIUM: AppraisalItem = {
  typeId: 34,
  name: 'Tritanium',
  quantity: 1_000_000,
  buy: 5.41,
  sell: 5.62,
  unitVolume: 0.01,
  refine: { valueAtFullPrice: 1, pricedAll: true, unitsLeftOver: 0 },
};
const PLEX: AppraisalItem = {
  typeId: 44992,
  name: 'PLEX',
  quantity: 12,
  buy: null,
  sell: 4_100_000,
};

function snapshotOf(items: AppraisalItem[]) {
  const built = buildAppraisalSnapshot({ hub: 'amarr', pricePercent: 90, generatedAt: 1, items });
  if (!built.ok) throw new Error(built.reason);
  return built.value;
}

describe('buildAppraisalSnapshot', () => {
  it('keeps the prices the appraisal was quoted at, and drops what the view never shows', () => {
    expect(snapshotOf([TRITANIUM, PLEX])).toEqual({
      v: 1,
      hub: 'amarr',
      pricePercent: 90,
      generatedAt: 1,
      items: [
        {
          typeId: 34,
          name: 'Tritanium',
          quantity: 1_000_000,
          buy: 5.41,
          sell: 5.62,
          unitVolume: 0.01,
        },
        // Firestore rejects `undefined`, so an unknown volume is stored as null.
        { typeId: 44992, name: 'PLEX', quantity: 12, buy: null, sell: 4_100_000, unitVolume: null },
      ],
    } satisfies AppraisalSnapshot);
  });

  it('rebuilds to the same buy, sell and volume totals the panel showed', () => {
    // These fixtures carry no refine detail, so the snapshot has none to drop or keep.
    const items = [TRITANIUM, PLEX];
    const snapshot = snapshotOf(items);
    const { buy, sell, volume } = buildAppraisal(items, 90).totals;
    expect(
      buildAppraisal(appraisalItemsFromSnapshot(snapshot), snapshot.pricePercent).totals
    ).toMatchObject({
      buy,
      sell,
      volume,
    });
  });

  it('refuses an empty appraisal and one past the item cap', () => {
    const base = { hub: 'jita', pricePercent: 100, generatedAt: 1 };
    expect(buildAppraisalSnapshot({ ...base, items: [] })).toEqual({ ok: false, reason: 'empty' });
    const tooMany = Array.from({ length: MAX_SNAPSHOT_ITEMS + 1 }, (_, i) => ({
      ...PLEX,
      typeId: i + 1,
    }));
    expect(buildAppraisalSnapshot({ ...base, items: tooMany })).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });
});

describe('parseAppraisalSnapshot', () => {
  it('round-trips a built snapshot', () => {
    const snapshot = snapshotOf([TRITANIUM, PLEX]);
    expect(parseAppraisalSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it('rejects anything that is not a version-1 snapshot', () => {
    const good = snapshotOf([PLEX]);
    expect(parseAppraisalSnapshot(null)).toBeNull();
    expect(parseAppraisalSnapshot({ ...good, v: 2 })).toBeNull();
    expect(parseAppraisalSnapshot({ ...good, hub: 7 })).toBeNull();
    expect(parseAppraisalSnapshot({ ...good, pricePercent: 'x' })).toBeNull();
    expect(parseAppraisalSnapshot({ ...good, items: 'x' })).toBeNull();
    expect(
      parseAppraisalSnapshot({ ...good, items: [{ ...good.items[0], quantity: -1 }] })
    ).toBeNull();
    expect(
      parseAppraisalSnapshot({ ...good, items: [{ ...good.items[0], sell: 'x' }] })
    ).toBeNull();
    expect(parseAppraisalSnapshot({ ...good, items: [{ ...good.items[0], name: 3 }] })).toBeNull();
  });
});

describe('appraisalSnapshotPasteText', () => {
  it('parses back to the same names and quantities', () => {
    const snapshot = snapshotOf([TRITANIUM, PLEX]);
    const parsed = parseAppraisalPaste(appraisalSnapshotPasteText(snapshot));
    expect(parsed.map(({ name, quantity }) => ({ name, quantity }))).toEqual([
      { name: 'Tritanium', quantity: 1_000_000 },
      { name: 'PLEX', quantity: 12 },
    ]);
  });
});

describe('appraisalSnapshotReuseKey', () => {
  it('ignores when it was priced, so sharing the same appraisal twice reuses one link', () => {
    const a = snapshotOf([TRITANIUM, PLEX]);
    expect(appraisalSnapshotReuseKey({ ...a, generatedAt: 999 })).toBe(
      appraisalSnapshotReuseKey(a)
    );
  });

  it('changes with the hub, the percent, or any item’s quantity or price', () => {
    const a = snapshotOf([TRITANIUM, PLEX]);
    const key = appraisalSnapshotReuseKey(a);
    expect(appraisalSnapshotReuseKey({ ...a, hub: 'jita' })).not.toBe(key);
    expect(appraisalSnapshotReuseKey({ ...a, pricePercent: 100 })).not.toBe(key);
    expect(
      appraisalSnapshotReuseKey({ ...a, items: [{ ...a.items[0], quantity: 1 }, a.items[1]] })
    ).not.toBe(key);
    expect(
      appraisalSnapshotReuseKey({ ...a, items: [{ ...a.items[0], sell: 9 }, a.items[1]] })
    ).not.toBe(key);
  });
});

describe('a snapshot that carries the refine figures', () => {
  const ZEOLITES: AppraisalItem = {
    typeId: 62467,
    name: 'Compressed Glistening Zeolites',
    quantity: 1038,
    buy: 2812,
    sell: 2990,
    unitVolume: 0.1,
    refine: {
      valueAtFullPrice: 0,
      pricedAll: true,
      unitsLeftOver: 38,
      detail: {
        portionSize: 100,
        materials: [
          { typeId: 35, quantity: 16_000 },
          { typeId: 36, quantity: 800 },
        ],
        efficiency: 0.9063,
        materialPrices: { 35: 16.75, 36: 50.69 },
      },
    },
  };
  const refining = { yieldRate: 0.664, taxRate: 0.02 };
  const mineralNames = new Map([
    [35, 'Pyerite'],
    [36, 'Mexallon'],
  ]);

  function refinedSnapshot(): AppraisalSnapshot {
    const built = buildAppraisalSnapshot({
      hub: 'jita',
      pricePercent: 90,
      generatedAt: 1,
      items: [ZEOLITES, PLEX],
      refining,
      mineralNames,
    });
    if (!built.ok) throw new Error(built.reason);
    return built.value;
  }

  it("stores the sharer's resolved yield, tax, recipe and mineral prices, not their skills", () => {
    const snapshot = refinedSnapshot();
    expect(snapshot.refine).toEqual({
      yieldRate: 0.664,
      taxRate: 0.02,
      minerals: [
        { typeId: 35, name: 'Pyerite', price: 16.75 },
        { typeId: 36, name: 'Mexallon', price: 50.69 },
      ],
    });
    expect(snapshot.items[0].refine).toEqual({
      portionSize: 100,
      materials: [
        { typeId: 35, quantity: 16_000 },
        { typeId: 36, quantity: 800 },
      ],
      efficiency: 0.9063,
    });
    // Firestore refuses undefined: an item with nothing to refine has no key at all.
    expect('refine' in snapshot.items[1]).toBe(false);
  });

  it('stores nothing about refining when no item carries it', () => {
    const built = buildAppraisalSnapshot({
      hub: 'jita',
      pricePercent: 90,
      generatedAt: 1,
      items: [PLEX],
      refining,
      mineralNames,
    });
    if (!built.ok) throw new Error(built.reason);
    expect('refine' in built.value).toBe(false);
  });

  it('round-trips through parse', () => {
    const snapshot = refinedSnapshot();
    expect(parseAppraisalSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it('shows the appraisal without a refine view when the stored refine is malformed', () => {
    const broken = JSON.parse(JSON.stringify(refinedSnapshot())) as Record<string, unknown>;
    broken.refine = { yieldRate: 'high' };
    const parsed = parseAppraisalSnapshot(broken);
    expect(parsed).not.toBeNull();
    expect(parsed?.refine).toBeUndefined();
    expect(parsed?.items[0].refine).toBeUndefined();
  });

  it('rebuilds the items with the same refine figure the sharer saw', () => {
    const items = appraisalItemsFromSnapshot(refinedSnapshot());
    // 10 batches x floor(16,000 x 10 x 0.9063) Pyerite x 16.75 + the same for Mexallon, less 2% tax
    const pyerite = Math.floor(16_000 * 10 * 0.9063);
    const mexallon = Math.floor(800 * 10 * 0.9063);
    expect(items[0].refine?.valueAtFullPrice).toBeCloseTo(
      (pyerite * 16.75 + mexallon * 50.69) * 0.98,
      4
    );
    expect(items[0].refine?.unitsLeftOver).toBe(38);
    expect(items[1].refine).toBeUndefined();
  });

  it('keeps an old snapshot, with no refine at all, readable', () => {
    const old = {
      v: 1,
      hub: 'jita',
      pricePercent: 90,
      generatedAt: 1,
      items: snapshotOf([PLEX]).items,
    };
    expect(parseAppraisalSnapshot(old)?.refine).toBeUndefined();
  });

  it('changes the reuse key when the refining setup changes', () => {
    const a = refinedSnapshot();
    const b = { ...a, refine: a.refine && { ...a.refine, taxRate: 0.05 } };
    expect(appraisalSnapshotReuseKey(a)).not.toBe(appraisalSnapshotReuseKey(b));
  });
});
