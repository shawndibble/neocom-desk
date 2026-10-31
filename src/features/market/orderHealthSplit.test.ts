import { describe, expect, it } from 'vitest';
import type { OpenOrderRow } from './openOrdersModel';
import { sellOrderHealth } from './orderHealthSplit';

const row = (over: Partial<OpenOrderRow>): OpenOrderRow =>
  ({
    characterId: 1,
    isBuyOrder: false,
    problem: 'healthy',
    problems: ['healthy'],
    iskTiedUp: 100,
    ...over,
  }) as OpenOrderRow;

describe('sellOrderHealth', () => {
  it('splits sell-order ISK by how soon each order needs the pilot', () => {
    const health = sellOrderHealth([
      row({ iskTiedUp: 100 }),
      row({ iskTiedUp: 40, problem: 'undercutStation', problems: ['undercutStation'] }),
      row({ iskTiedUp: 30, problem: 'expiringOrStale', problems: ['expiringOrStale'] }),
      row({ iskTiedUp: 20, problem: 'undercutRegion', problems: ['undercutRegion'] }),
      row({ iskTiedUp: 10, competitionUnchecked: true }),
    ]);
    expect(health).toEqual({
      healthy: { isk: 100, orders: 1 },
      needsYou: { isk: 70, orders: 2 },
      watch: { isk: 20, orders: 1 },
      notChecked: { isk: 10, orders: 1 },
      total: { isk: 200, orders: 5 },
    });
  });

  it('ignores buy orders: their ISK is escrow, not stock', () => {
    const health = sellOrderHealth([row({ isBuyOrder: true, iskTiedUp: 999 }), row({})]);
    expect(health.total).toEqual({ isk: 100, orders: 1 });
  });

  it('is all zeros with no orders', () => {
    expect(sellOrderHealth([]).total).toEqual({ isk: 0, orders: 0 });
  });
});
