import { describe, expect, it } from 'vitest';
import type { WalletTrade } from './walletCostBasis';
import { realizedMargins } from './realizedMargin';

let nextId = 1;
function trade(over: Partial<WalletTrade> = {}): WalletTrade {
  return {
    transactionId: nextId++,
    date: '2026-01-01T00:00:00Z',
    typeId: 34,
    quantity: 10,
    unitPrice: 100,
    isBuy: true,
    isPersonal: true,
    ...over,
  };
}

describe('realizedMargins', () => {
  it('prices a sale against the wallet buys it used up, less its sales tax', () => {
    const buy = trade({ quantity: 10, unitPrice: 100 });
    const sale = trade({
      date: '2026-01-02T00:00:00Z',
      isBuy: false,
      quantity: 4,
      unitPrice: 150,
    });
    const margins = realizedMargins([buy, sale], new Map([[sale.transactionId, 30]]));
    expect(margins.get(sale.transactionId)).toEqual({
      unitCost: 100,
      salesTax: 30,
      margin: 4 * 150 - 4 * 100 - 30,
    });
  });

  it('averages the cost of every buy a sale draws from, oldest first', () => {
    const first = trade({ quantity: 2, unitPrice: 100, date: '2026-01-01T00:00:00Z' });
    const second = trade({ quantity: 10, unitPrice: 200, date: '2026-01-02T00:00:00Z' });
    const sale = trade({
      date: '2026-01-03T00:00:00Z',
      isBuy: false,
      quantity: 4,
      unitPrice: 300,
    });
    const margins = realizedMargins([sale, second, first], new Map([[sale.transactionId, 0]]));
    // 2 @ 100 + 2 @ 200 = 600 over 4 units.
    expect(margins.get(sale.transactionId)?.unitCost).toBe(150);
  });

  it('leaves the units an earlier sale used up out of a later one', () => {
    const buyA = trade({ quantity: 5, unitPrice: 100, date: '2026-01-01T00:00:00Z' });
    const buyB = trade({ quantity: 5, unitPrice: 300, date: '2026-01-02T00:00:00Z' });
    const early = trade({
      isBuy: false,
      quantity: 5,
      unitPrice: 400,
      date: '2026-01-03T00:00:00Z',
    });
    const late = trade({ isBuy: false, quantity: 5, unitPrice: 400, date: '2026-01-04T00:00:00Z' });
    const tax = new Map([
      [early.transactionId, 0],
      [late.transactionId, 0],
    ]);
    const margins = realizedMargins([buyA, buyB, early, late], tax);
    expect(margins.get(early.transactionId)?.unitCost).toBe(100);
    expect(margins.get(late.transactionId)?.unitCost).toBe(300);
  });

  it('gives no margin to a sale with no wallet buy behind it, such as a sold build', () => {
    const sale = trade({ isBuy: false, quantity: 1, unitPrice: 1_000_000 });
    const margins = realizedMargins([sale], new Map([[sale.transactionId, 36_000]]));
    expect(margins.has(sale.transactionId)).toBe(false);
  });

  it('gives no margin to a sale only part covered by wallet buys', () => {
    const buy = trade({ quantity: 3, unitPrice: 100 });
    const sale = trade({ date: '2026-01-02T00:00:00Z', isBuy: false, quantity: 5 });
    const margins = realizedMargins([buy, sale], new Map([[sale.transactionId, 10]]));
    expect(margins.has(sale.transactionId)).toBe(false);
  });

  it('gives no sale of an item a margin once one sale of it outran the wallet buys', () => {
    // That sale proves stock the wallet never saw; under FIFO it could have gone into any of them.
    const buyA = trade({ quantity: 5, unitPrice: 100, date: '2026-01-01T00:00:00Z' });
    const covered = trade({ isBuy: false, quantity: 5, date: '2026-01-02T00:00:00Z' });
    const outran = trade({ isBuy: false, quantity: 5, date: '2026-01-03T00:00:00Z' });
    const buyB = trade({ quantity: 5, unitPrice: 100, date: '2026-01-04T00:00:00Z' });
    const later = trade({ isBuy: false, quantity: 5, date: '2026-01-05T00:00:00Z' });
    const other = trade({ typeId: 35, quantity: 1, date: '2026-01-01T00:00:00Z' });
    const otherSale = trade({
      typeId: 35,
      isBuy: false,
      quantity: 1,
      date: '2026-01-02T00:00:00Z',
    });
    const tax = new Map(
      [covered, outran, later, otherSale].map((t) => [t.transactionId, 0] as const)
    );
    const margins = realizedMargins([buyA, covered, outran, buyB, later, other, otherSale], tax);
    expect(margins.has(covered.transactionId)).toBe(false);
    expect(margins.has(later.transactionId)).toBe(false);
    expect(margins.has(otherSale.transactionId)).toBe(true);
  });

  it('never counts a buy made after the sale', () => {
    const sale = trade({ date: '2026-01-01T00:00:00Z', isBuy: false, quantity: 2 });
    const buy = trade({ date: '2026-01-02T00:00:00Z', quantity: 10 });
    const margins = realizedMargins([sale, buy], new Map([[sale.transactionId, 5]]));
    expect(margins.has(sale.transactionId)).toBe(false);
  });

  it('gives no margin when the sale has no sales tax line to subtract', () => {
    const buy = trade({ quantity: 10, unitPrice: 100 });
    const sale = trade({ date: '2026-01-02T00:00:00Z', isBuy: false, quantity: 4 });
    const margins = realizedMargins([buy, sale], new Map());
    expect(margins.has(sale.transactionId)).toBe(false);
  });

  it('ignores other items and trades made on behalf of a corporation', () => {
    const otherItem = trade({ typeId: 35, quantity: 10, unitPrice: 1 });
    const corpBuy = trade({ isPersonal: false, quantity: 10, unitPrice: 1 });
    const sale = trade({ date: '2026-01-02T00:00:00Z', isBuy: false, quantity: 4 });
    const corpSale = trade({ date: '2026-01-02T00:00:00Z', isBuy: false, isPersonal: false });
    const tax = new Map([
      [sale.transactionId, 1],
      [corpSale.transactionId, 1],
    ]);
    const margins = realizedMargins([otherItem, corpBuy, sale, corpSale], tax);
    expect(margins.has(sale.transactionId)).toBe(false);
    expect(margins.has(corpSale.transactionId)).toBe(false);
  });

  it('gives buys no margin', () => {
    const buy = trade();
    const margins = realizedMargins([buy], new Map([[buy.transactionId, 1]]));
    expect(margins.size).toBe(0);
  });
});
