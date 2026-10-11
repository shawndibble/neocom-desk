import { describe, expect, it } from 'vitest';
import { diffStockBelowTarget, type StockAlertEntry, type StockAlertSnapshot } from './stockAlert';

const entry = (over: Partial<StockAlertEntry> = {}): StockAlertEntry => ({
  listId: 'a',
  listName: 'Efa Market',
  locationId: 7,
  typeId: 16242,
  name: 'Catalyst',
  target: 40,
  listed: 30,
  inHangar: 0,
  ...over,
});
const snap = (...entries: StockAlertEntry[]): StockAlertSnapshot => ({ entries, nowMs: 0 });

describe('diffStockBelowTarget', () => {
  it('fires nothing on the first poll', () => {
    expect(diffStockBelowTarget(1, undefined, snap(entry({ listed: 0 })))).toEqual([]);
  });

  it('fires when an item drops from OK to Low', () => {
    const fires = diffStockBelowTarget(1, snap(entry()), snap(entry({ listed: 10 })));
    expect(fires).toEqual([
      {
        eventId: 'stockBelowTarget',
        characterId: 1,
        listId: 'a',
        listName: 'Efa Market',
        locationId: 7,
        typeId: 16242,
        name: 'Catalyst',
        target: 40,
        listed: 10,
        inHangar: 0,
        status: 'low',
      },
    ]);
  });

  it('fires again when a Low item runs out', () => {
    const fires = diffStockBelowTarget(1, snap(entry({ listed: 10 })), snap(entry({ listed: 0 })));
    expect(fires.map((f) => f.status)).toEqual(['out']);
  });

  it('stays quiet while an item stays Low, or recovers', () => {
    expect(
      diffStockBelowTarget(1, snap(entry({ listed: 10 })), snap(entry({ listed: 12 })))
    ).toEqual([]);
    expect(
      diffStockBelowTarget(1, snap(entry({ listed: 0 })), snap(entry({ listed: 35 })))
    ).toEqual([]);
  });

  it('stays quiet for a Stock Target the pilot just added or changed', () => {
    expect(diffStockBelowTarget(1, snap(), snap(entry({ listed: 0 })))).toEqual([]);
    expect(
      diffStockBelowTarget(1, snap(entry({ listed: 30 })), snap(entry({ target: 100, listed: 30 })))
    ).toEqual([]);
  });

  it('skips an item whose listed count is unknown', () => {
    expect(diffStockBelowTarget(1, snap(entry()), snap(entry({ listed: null })))).toEqual([]);
  });

  it('says how many are waiting in the hangar at the market', () => {
    const fires = diffStockBelowTarget(1, snap(entry()), snap(entry({ listed: 0, inHangar: 12 })));
    expect(fires[0]).toMatchObject({ status: 'out', inHangar: 12 });
  });

  it('tells the same item on two lists apart', () => {
    const fires = diffStockBelowTarget(
      1,
      snap(entry(), entry({ listId: 'b', listName: 'Home' })),
      snap(entry(), entry({ listId: 'b', listName: 'Home', listed: 0 }))
    );
    expect(fires.map((f) => f.listId)).toEqual(['b']);
  });
});
