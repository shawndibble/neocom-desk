import { describe, expect, it } from 'vitest';
import { diffStockBelowTarget, type StockAlertEntry, type StockAlertSnapshot } from './stockAlert';

const entry = (over: Partial<StockAlertEntry> = {}): StockAlertEntry => ({
  listId: 'a',
  listName: 'Efa Market',
  typeId: 16242,
  name: 'Catalyst',
  target: 40,
  onHand: 30,
  ...over,
});
const snap = (...entries: StockAlertEntry[]): StockAlertSnapshot => ({ entries, nowMs: 0 });

describe('diffStockBelowTarget', () => {
  it('fires nothing on the first poll', () => {
    expect(diffStockBelowTarget(1, undefined, snap(entry({ onHand: 0 })))).toEqual([]);
  });

  it('fires when an item drops from OK to Low', () => {
    const fires = diffStockBelowTarget(1, snap(entry()), snap(entry({ onHand: 10 })));
    expect(fires).toEqual([
      {
        eventId: 'stockBelowTarget',
        characterId: 1,
        listId: 'a',
        listName: 'Efa Market',
        typeId: 16242,
        name: 'Catalyst',
        target: 40,
        onHand: 10,
        status: 'low',
      },
    ]);
  });

  it('fires again when a Low item runs out', () => {
    const fires = diffStockBelowTarget(1, snap(entry({ onHand: 10 })), snap(entry({ onHand: 0 })));
    expect(fires.map((f) => f.status)).toEqual(['out']);
  });

  it('stays quiet while an item stays Low, or recovers', () => {
    expect(
      diffStockBelowTarget(1, snap(entry({ onHand: 10 })), snap(entry({ onHand: 12 })))
    ).toEqual([]);
    expect(
      diffStockBelowTarget(1, snap(entry({ onHand: 0 })), snap(entry({ onHand: 35 })))
    ).toEqual([]);
  });

  it('stays quiet for a Stock Target the pilot just added or changed', () => {
    expect(diffStockBelowTarget(1, snap(), snap(entry({ onHand: 0 })))).toEqual([]);
    expect(
      diffStockBelowTarget(1, snap(entry({ onHand: 30 })), snap(entry({ target: 100, onHand: 30 })))
    ).toEqual([]);
  });

  it('skips an item whose on-hand count is unknown', () => {
    expect(diffStockBelowTarget(1, snap(entry()), snap(entry({ onHand: null })))).toEqual([]);
  });

  it('tells the same item on two lists apart', () => {
    const fires = diffStockBelowTarget(
      1,
      snap(entry(), entry({ listId: 'b', listName: 'Home' })),
      snap(entry(), entry({ listId: 'b', listName: 'Home', onHand: 0 }))
    );
    expect(fires.map((f) => f.listId)).toEqual(['b']);
  });
});
