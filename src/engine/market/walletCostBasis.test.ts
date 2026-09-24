import { describe, expect, it } from 'vitest';
import { walletCostBasis, type WalletTrade } from './walletCostBasis';

let nextId = 1;
function trade(over: Partial<WalletTrade> & Pick<WalletTrade, 'date' | 'quantity'>): WalletTrade {
  return {
    transactionId: nextId++,
    typeId: 34,
    unitPrice: 100,
    isBuy: true,
    isPersonal: true,
    ...over,
  };
}

describe('walletCostBasis', () => {
  it('averages the buys when they cover the pool', () => {
    const result = walletCostBasis({
      typeId: 34,
      pool: 20,
      transactions: [
        trade({ date: '2026-01-01T00:00:00Z', quantity: 10, unitPrice: 100 }),
        trade({ date: '2026-01-02T00:00:00Z', quantity: 10, unitPrice: 200 }),
      ],
    });
    expect(result).toMatchObject({
      status: 'covered',
      unitCost: 150,
      unitsCovered: 20,
      buyCount: 2,
      oldestBuy: '2026-01-01T00:00:00Z',
      newestBuy: '2026-01-02T00:00:00Z',
      truncated: false,
    });
  });

  it('lets sells consume the oldest lot first', () => {
    const result = walletCostBasis({
      typeId: 34,
      pool: 10,
      transactions: [
        trade({ date: '2026-01-01T00:00:00Z', quantity: 10, unitPrice: 100 }),
        trade({ date: '2026-01-02T00:00:00Z', quantity: 10, unitPrice: 200 }),
        trade({ date: '2026-01-03T00:00:00Z', quantity: 10, isBuy: false }),
      ],
    });
    expect(result).toMatchObject({ status: 'covered', unitCost: 200, buyCount: 1 });
  });

  it('prices only the newest pool units, prorating a lot split at the boundary', () => {
    const result = walletCostBasis({
      typeId: 34,
      pool: 15,
      transactions: [
        trade({ date: '2026-01-01T00:00:00Z', quantity: 10, unitPrice: 100 }),
        trade({ date: '2026-01-02T00:00:00Z', quantity: 10, unitPrice: 200 }),
      ],
    });
    // 10 x 200 + 5 x 100 = 2500 / 15
    expect(result).toMatchObject({
      status: 'covered',
      unitsCovered: 15,
      buyCount: 2,
      buys: [
        { date: '2026-01-02T00:00:00Z', quantity: 10, unitPrice: 200 },
        { date: '2026-01-01T00:00:00Z', quantity: 5, unitPrice: 100 },
      ],
    });
    expect(result?.status === 'covered' && result.unitCost).toBeCloseTo(2500 / 15);
  });

  it('is partial when the remaining lots fall short of the pool', () => {
    const result = walletCostBasis({
      typeId: 34,
      pool: 30,
      transactions: [trade({ date: '2026-01-01T00:00:00Z', quantity: 12 })],
    });
    expect(result).toMatchObject({ status: 'partial', coveredUnits: 12, pool: 30 });
  });

  it('is historyShort when a sell finds no lot to consume', () => {
    const result = walletCostBasis({
      typeId: 34,
      pool: 5,
      transactions: [
        trade({ date: '2026-01-01T00:00:00Z', quantity: 5, isBuy: false }),
        trade({ date: '2026-01-02T00:00:00Z', quantity: 5 }),
      ],
    });
    expect(result).toMatchObject({ status: 'historyShort' });
  });

  it('passes truncated through without changing coverage', () => {
    const result = walletCostBasis({
      typeId: 34,
      pool: 5,
      truncated: true,
      transactions: [trade({ date: '2026-01-01T00:00:00Z', quantity: 5 })],
    });
    expect(result).toMatchObject({ status: 'covered', truncated: true });
    const short = walletCostBasis({
      typeId: 34,
      pool: 5,
      truncated: true,
      transactions: [trade({ date: '2026-01-01T00:00:00Z', quantity: 5, isBuy: false })],
    });
    expect(short).toMatchObject({ status: 'historyShort', truncated: true });
  });

  it('ignores non-personal and other-type rows', () => {
    const result = walletCostBasis({
      typeId: 34,
      pool: 5,
      transactions: [
        trade({ date: '2026-01-01T00:00:00Z', quantity: 5, unitPrice: 100 }),
        trade({ date: '2026-01-02T00:00:00Z', quantity: 50, unitPrice: 1, isPersonal: false }),
        trade({ date: '2026-01-02T00:00:00Z', quantity: 50, unitPrice: 1, typeId: 35 }),
        trade({ date: '2026-01-03T00:00:00Z', quantity: 50, isPersonal: false, isBuy: false }),
      ],
    });
    expect(result).toMatchObject({ status: 'covered', unitCost: 100, buyCount: 1 });
  });

  it('returns null for an empty pool', () => {
    expect(walletCostBasis({ typeId: 34, pool: 0, transactions: [] })).toBeNull();
  });

  it('orders same-date rows by transaction id', () => {
    const result = walletCostBasis({
      typeId: 34,
      pool: 5,
      transactions: [
        trade({ transactionId: 9, date: '2026-01-01T00:00:00Z', quantity: 5, unitPrice: 300 }),
        trade({ transactionId: 2, date: '2026-01-01T00:00:00Z', quantity: 5, unitPrice: 100 }),
        trade({ transactionId: 5, date: '2026-01-01T00:00:00Z', quantity: 5, isBuy: false }),
      ],
    });
    // the sell (id 5) consumes id 2's lot first, leaving id 9's
    expect(result).toMatchObject({ status: 'covered', unitCost: 300 });
  });
});
