import { describe, expect, it } from 'vitest';
import { buildAppraisal, type AppraisalItem } from './appraisal';
import { parseAppraisalPaste } from './appraisalPaste';
import {
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
    // Refine-then-sell is primary-tab only (it depends on the sharer's skills),
    // so the snapshot drops it — the totals the share view shows must still match.
    const items = [TRITANIUM, PLEX];
    const snapshot = snapshotOf(items);
    const { buy, sell, volume } = buildAppraisal(items, 90).totals;
    expect(buildAppraisal(snapshot.items, snapshot.pricePercent).totals).toMatchObject({
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
